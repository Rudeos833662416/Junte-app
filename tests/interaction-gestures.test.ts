import { describe, expect, it } from "vitest";
import { isDoubleTap, shouldDismissSwipe } from "../lib/interaction-gestures";

describe("interaction gesture thresholds", () => {
  it("recognizes a second tap inside the double-tap window", () => {
    expect(isDoubleTap(1000, 1200)).toBe(true);
    expect(isDoubleTap(1000, 1281)).toBe(false);
    expect(isDoubleTap(null, 1200)).toBe(false);
  });

  it("dismisses a swipe by distance or fast short release", () => {
    expect(shouldDismissSwipe(120)).toBe(true);
    expect(shouldDismissSwipe(80, 1.2)).toBe(true);
    expect(shouldDismissSwipe(80, 0.4)).toBe(false);
  });
});
