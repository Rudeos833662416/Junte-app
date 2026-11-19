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
  trimStart?: number;
  trimEnd?: number | null;
  isMuted?: boolean;
  overlayText?: string | null;
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
      this.hydrating = (async () => {
        try {
          const raw = await this.storage.getItem(STORY_UPLOAD_QUEUE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as unknown[];
            for (const item of parsed) {
              const job = asJob(item);
              if (job && job.status !== "completed") this.jobs.set(job.id, job);
            }
          }
        } catch {
          /* ignore corrupt queue */
        } finally {
          this.hydrated = true;
          this.hydrating = null;
          this.emit();
          void this.pump();
        }
      })();
    }
    await this.hydrating;
  }

  subscribe(listener: QueueListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private async persist() {
    const payload = JSON.stringify([...this.jobs.values()]);
    await this.storage.setItem(STORY_UPLOAD_QUEUE_KEY, payload);
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
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
    this.emit();
    void this.pump();
    return job;
  }

  async retry(id: string) {
    await this.hydrate();
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "queued";
    job.error = null;
    job.progress = 0;
    job.updatedAt = Date.now();
    await this.persist();
    this.emit();
    void this.pump();
  }

  async remove(id: string) {
    await this.hydrate();
    this.jobs.delete(id);
    await this.persist();
    this.emit();
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      await this.hydrate();
      while (true) {
        const next = this.list().find((job) => job.status === "queued");
        if (!next) break;
        next.status = "uploading";
        next.updatedAt = Date.now();
        await this.persist();
        this.emit();
        try {
          await this.executor(next, (progress) => {
            const current = this.jobs.get(next.id);
            if (!current) return;
            current.progress = progress;
            current.updatedAt = Date.now();
            this.emit();
          });
          next.status = "completed";
          next.progress = 1;
          next.error = null;
          next.updatedAt = Date.now();
          this.jobs.delete(next.id);
        } catch (error) {
          next.status = "failed";
          next.error = error instanceof Error ? error.message : "Error al subir";
          next.updatedAt = Date.now();
        }
        await this.persist();
        this.emit();
      }
    } finally {
      this.running = false;
    }
  }
}

async function defaultStoryUploadExecutor(
  job: StoryUploadJob,
  onProgress: (progress: number) => void,
) {
  const { processStoryUpload } = await import("@/lib/story-upload-processor");
  await processStoryUpload(job, onProgress);
}

const StoryUploadQueueContext = createContext<StoryUploadQueue | null>(null);

export function StoryUploadQueueProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => new StoryUploadQueue());
  useEffect(() => {
    void queue.hydrate();
  }, [queue]);
  return <StoryUploadQueueContext.Provider value={queue}>{children}</StoryUploadQueueContext.Provider>;
}

export function useStoryUploadQueue() {
  const queue = useContext(StoryUploadQueueContext);
  if (!queue) throw new Error("useStoryUploadQueue must be used within StoryUploadQueueProvider");
  const [, setTick] = useState(0);
  useEffect(() => queue.subscribe(() => setTick((value) => value + 1)), [queue]);
  return queue;
}
