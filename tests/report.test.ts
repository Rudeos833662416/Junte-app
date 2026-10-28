import { describe, expect, it } from "vitest";
import { getRecentReports, reportError } from "../lib/report";

describe("report", () => {
  it("stores recent errors", () => {
    reportError(new Error("test-error"), { where: "unit" });
    const recent = getRecentReports();
    expect(recent.some((item) => item.message.includes("test-error"))).toBe(true);
  });
});
