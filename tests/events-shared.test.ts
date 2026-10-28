import { describe, expect, it } from "vitest";
import { formatDate, rankColors } from "../lib/events-shared";

describe("events-shared", () => {
  it("formatDate returns a non-empty string", () => {
    const value = formatDate("2026-01-15T12:00:00.000Z");
    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(4);
  });

  it("rankColors has 5 entries", () => {
    expect(rankColors).toHaveLength(5);
  });
});
