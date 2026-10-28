import { describe, expect, it } from "vitest";
import { groupStoriesByUser, isStoryActive, storyExpiresAt } from "../lib/stories-helpers";

describe("stories-helpers", () => {
  it("storyExpiresAt is in the future", () => {
    expect(new Date(storyExpiresAt(24)).getTime()).toBeGreaterThan(Date.now());
  });

  it("isStoryActive detects expired", () => {
    expect(isStoryActive(new Date(Date.now() - 1000).toISOString())).toBe(false);
    expect(isStoryActive(new Date(Date.now() + 60_000).toISOString())).toBe(true);
  });

  it("groupStoriesByUser groups", () => {
    const map = groupStoriesByUser([
      { user_id: "a", created_at: "2026-01-02T00:00:00Z" },
      { user_id: "a", created_at: "2026-01-01T00:00:00Z" },
      { user_id: "b", created_at: "2026-01-03T00:00:00Z" },
    ]);
    expect(map.get("a")).toHaveLength(2);
    expect(map.get("b")).toHaveLength(1);
  });
});
