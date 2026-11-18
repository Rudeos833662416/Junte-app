import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(resolve(root, "supabase/migrations/0056_text_stories.sql"), "utf8");
const stories = readFileSync(resolve(root, "app/(tabs)/stories.tsx"), "utf8");

describe("Estados de solo texto", () => {
  it("permite text sin debilitar el contrato image/video", () => {
    expect(migration).toContain("media_url drop not null");
    expect(migration).toContain("media_type in ('image', 'video', 'text')");
    expect(migration).toContain("stories_content_shape_check");
    expect(migration).toContain("media_type = 'text'");
    expect(migration).toContain("media_type in ('image', 'video')");
  });

  it("publica texto con fondo y tipografía explícitos", () => {
    expect(stories).toContain('media_type: "text"');
    expect(stories).toContain("text_content: text");
    expect(stories).toContain("text_background_color: textBackgroundColor");
    expect(stories).toContain("text_font_family: textFontFamily");
  });
});
