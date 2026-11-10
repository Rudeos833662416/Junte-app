import { describe, expect, it, vi } from "vitest";
import {
  StoryUploadQueue,
  type StoryUploadJobInput,
  type StoryUploadStorage,
} from "../lib/story-upload-queue";

function createStorage(): StoryUploadStorage {
  let value: string | null = null;
  return {
    getItem: vi.fn(async () => value),
    setItem: vi.fn(async (_key, next) => {
      value = next;
    }),
  };
}

const input: StoryUploadJobInput = {
  userId: "user-1",
  uri: "file:///story.jpg",
  mimeType: "image/jpeg",
  type: "image",
  caption: "Una noche más",
  privacy: "all_friends",
};

describe("StoryUploadQueue", () => {
  it("persiste el trabajo, procesa en segundo plano y publica progreso", async () => {
    const storage = createStorage();
    const progress: number[] = [];
    const executor = vi.fn(async (_job, onProgress) => {
      onProgress(0.4);
      onProgress(1);
    });
    const queue = new StoryUploadQueue({ storage, executor });

    const job = await queue.enqueue(input);
    await queue.waitForIdle();

    expect(executor).toHaveBeenCalledOnce();
    expect(progress).toEqual([]);
    expect(queue.getSnapshot()).toMatchObject({
      [job.id]: { status: "completed", progress: 1 },
    });
    expect(storage.setItem).toHaveBeenCalled();
  });

  it("restaura trabajos persistidos y permite reintentar un fallo", async () => {
    const storage = createStorage();
    const failed = {
      id: "job-1",
      ...input,
      createdAt: 100,
      updatedAt: 100,
      status: "failed",
      progress: 0.4,
      error: "Sin red",
    } as const;
    await storage.setItem("story-upload-queue:v1", JSON.stringify([failed]));
    const executor = vi.fn().mockResolvedValue(undefined);
    const queue = new StoryUploadQueue({ storage, executor });

    await queue.hydrate();
    expect(queue.getSnapshot()["job-1"]).toMatchObject({ status: "failed", error: "Sin red" });

    await queue.retry("job-1");
    await queue.waitForIdle();
    expect(executor).toHaveBeenCalledOnce();
    expect(queue.getSnapshot()["job-1"]).toMatchObject({ status: "completed", progress: 1, error: null });
  });

  it("continúa procesando aunque el consumidor se desmonte", async () => {
    const storage = createStorage();
    let resolveUpload!: () => void;
    const executor = vi.fn(() => new Promise<void>((resolve) => { resolveUpload = resolve; }));
    const queue = new StoryUploadQueue({ storage, executor });

    const { id } = await queue.enqueue(input);
    expect(queue.getSnapshot()[id].status).toBe("uploading");
    queue.unsubscribeAll();
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveUpload();
    await queue.waitForIdle();

    expect(queue.getSnapshot()[id].status).toBe("completed");
  });
});
