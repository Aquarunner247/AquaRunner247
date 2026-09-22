import { describe, it, expect } from "vitest";
import { isWithinReadingBounds, READING_BOUNDS } from "@/lib/reading-bounds";

describe("isWithinReadingBounds", () => {
  it("rejects a pH value missing its decimal point", () => {
    expect(isWithinReadingBounds("ph", 74)).toBe(false);
  });

  it("accepts a normal pH reading", () => {
    expect(isWithinReadingBounds("ph", 7.4)).toBe(true);
  });

  it("accepts the true pH scale boundaries and rejects just past them", () => {
    expect(isWithinReadingBounds("ph", 0)).toBe(true);
    expect(isWithinReadingBounds("ph", 14)).toBe(true);
    expect(isWithinReadingBounds("ph", -0.1)).toBe(false);
    expect(isWithinReadingBounds("ph", 14.1)).toBe(false);
  });

  it("has no opinion on a field with no configured bound", () => {
    expect(isWithinReadingBounds("someUnconfiguredField", 999999)).toBe(true);
  });

  it("every configured bound has min <= max", () => {
    for (const [key, bounds] of Object.entries(READING_BOUNDS)) {
      expect(bounds.min, key).toBeLessThanOrEqual(bounds.max);
    }
  });
});
