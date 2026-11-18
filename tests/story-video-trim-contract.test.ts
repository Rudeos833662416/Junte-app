import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0057_story_video_trim.sql"), "utf8");
const processor = readFileSync(resolve(process.cwd(), "lib/story-upload-processor.ts"), "utf8");
const queue = readFileSync(resolve(process.cwd(), "lib/story-upload-queue.tsx"), "utf8");

describe("persistencia del recorte de vídeo", () => {
  it("añade columnas opcionales e impone un rango válido de segundos", () => {
    expect(migration).toContain("add column if not exists trim_start_sec numeric not null default 0");
    expect(migration).toContain("add column if not exists trim_end_sec numeric");
    expect(migration).toContain("trim_end_sec >= trim_start_sec");
  });

  it("transporta el rango desde la cola hasta la inserción", () => {
    expect(queue).toContain("trimStart?: number");
    expect(queue).toContain("trimEnd?: number | null");
    expect(processor).toContain("trim_start_sec:");
    expect(processor).toContain("trim_end_sec:");
  });
});
