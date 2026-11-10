import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type StoryUploadStatus = "queued" | "uploading" | "failed" | "completed";

export type StoryUploadJobInput = {
  userId: string;
  uri: string;
  mimeType: string;
  type: "image" | "video";
  caption: string;
  privacy: "all_friends" | "close_friends" | "public";
};

export type StoryUploadJob = StoryUploadJobInput & {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: StoryUploadStatus;
  progress: number;
  error: string | null;
};

export type StoryUploadStorage = Pick<StorageAdapter, "getItem" | "setItem">;
export type StoryUploadExecutor = (
  job: StoryUploadJob,
  onProgress: (progress: number) => void,
) => Promise<void>;

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

type QueueListener = () => void;

type StoryUploadQueueOptions = {
  storage?: StoryUploadStorage;
  executor?: StoryUploadExecutor;
};

export const STORY_UPLOAD_QUEUE_KEY = "story-upload-queue:v1";

function makeId() {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function asJob(value: unknown): StoryUploadJob | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoryUploadJob>;
  if (!candidate.id || !candidate.userId || !candidate.uri || !candidate.type) return null;
  return {
    ...candidate as StoryUploadJob,
    status: candidate.status === "completed" || candidate.status === "failed" ? candidate.status : "queued",
    progress: typeof candidate.progress === "number" ? candidate.progress : 0,
    error: typeof candidate.error === "string" ? candidate.error : null,
    createdAt: candidate.createdAt ?? Date.now(),
    updatedAt: candidate.updatedAt ?? Date.now(),
  };
}

export class StoryUploadQueue {
  private readonly storage: StoryUploadStorage;
  private readonly executor: StoryUploadExecutor;
  private readonly jobs = new Map<string, StoryUploadJob>();
  private readonly listeners = new Set<QueueListener>();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;
  private running = false;

  constructor(options: StoryUploadQueueOptions = {}) {
    this.storage = options.storage ?? AsyncStorage;
    this.executor = options.executor ?? defaultStoryUploadExecutor;
  }

  async hydrate() {
    if (this.hydrated) return;
    if (!this.hydrating) {
      this.hydrating = this.storage.getItem(STORY_UPLOAD_QUEUE_KEY).then((raw) => {
        if (raw) {
          try {
            const values = JSON.parse(raw) as unknown[];
            for (const value of values) {
              const job = asJob(value);
              if (job && job.status !== "completed") this.jobs.set(job.id, job);
            }
          } catch {
            // Un JSON corrupto no debe impedir publicar un estado nuevo.
          }
        }
        this.hydrated = true;
        this.hydrating = null;
        this.notify();
      });
    }
    await this.hydrating;
  }

  subscribe(listener: QueueListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  unsubscribeAll() {
    this.listeners.clear();
  }

  getSnapshot() {
    return Object.fromEntries(this.jobs) as Record<string, StoryUploadJob>;
  }

  async enqueue(input: StoryUploadJobInput) {
    await this.hydrate();
    const now = Date.now();
    const job: StoryUploadJob = {
      ...input,
      id: makeId(),
      createdAt: now,
      updatedAt: now,
      status: "queued",
      progress: 0,
      error: null,
    };
    this.jobs.set(job.id, job);
    await this.persist();
    void this.pump();
    return job;
  }

  async retry(id: string) {
    await this.hydrate();
    const job = this.jobs.get(id);
    if (!job || job.status !== "failed") return;
    this.update(job, { status: "queued", progress: 0, error: null });
    await this.persist();
    void this.pump();
  }

  async waitForIdle() {
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  resume() {
    void this.pump();
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const job = [...this.jobs.values()].find((candidate) => candidate.status === "queued");
        if (!job) break;
        this.update(job, { status: "uploading", progress: Math.max(job.progress, 0), error: null });
        await this.persist();
        try {
          await this.executor(job, (progress) => {
            this.update(job, { progress: Math.max(0, Math.min(1, progress)) });
            void this.persist();
          });
          this.update(job, { status: "completed", progress: 1, error: null });
        } catch (error) {
          this.update(job, {
            status: "failed",
            error: error instanceof Error ? error.message : "No se pudo publicar el estado.",
          });
        }
        await this.persist();
      }
    } finally {
      this.running = false;
      this.notify();
    }
  }

  private update(job: StoryUploadJob, patch: Partial<StoryUploadJob>) {
    Object.assign(job, patch, { updatedAt: Date.now() });
    this.notify();
  }

  private async persist() {
    await this.storage.setItem(STORY_UPLOAD_QUEUE_KEY, JSON.stringify([...this.jobs.values()]));
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

async function defaultStoryUploadExecutor(job: StoryUploadJob, onProgress: (progress: number) => void) {
  const { processStoryUpload } = await import("@/lib/story-upload-processor");
  await processStoryUpload(job, onProgress);
}

export const storyUploadQueue = new StoryUploadQueue();

const StoryUploadQueueContext = createContext<StoryUploadQueue>(storyUploadQueue);

export function StoryUploadQueueProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void storyUploadQueue.hydrate().then(() => storyUploadQueue.resume());
  }, []);
  return <StoryUploadQueueContext.Provider value={storyUploadQueue}>{children}</StoryUploadQueueContext.Provider>;
}

export function useStoryUploadQueue() {
  const queue = useContext(StoryUploadQueueContext);
  const [, rerender] = useState(0);
  useEffect(() => {
    const unsubscribe = queue.subscribe(() => rerender((value) => value + 1));
    return () => {
      unsubscribe();
    };
  }, [queue]);
  return { queue, jobs: queue.getSnapshot(), retry: queue.retry.bind(queue), enqueue: queue.enqueue.bind(queue) };
}
