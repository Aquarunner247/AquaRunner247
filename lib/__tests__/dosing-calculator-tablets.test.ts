import { describe, it, expect } from "vitest";
// Imported from lib/dosing-units.ts, not lib/dosing-calculator.ts -- the latter imports
// lib/prisma, which creates a live DB connection Pool at module load and throws when
// DATABASE_URL isn't set in the test environment. dosing-units.ts is deliberately kept
// Prisma-free (see its own doc comments) precisely so this kind of pure-function test
// works; dosing-calculator.ts re-exports the same functions for its own internal use.
import { computeTabletRecommendation, daysUntilNextWeekday } from "@/lib/dosing-units";

describe("daysUntilNextWeekday", () => {
  it("returns the number of days to the soonest upcoming occurrence", () => {
    // Sunday (ISO 7) checking a Tuesday (ISO 2) route -> 2 days.
    expect(daysUntilNextWeekday(7, [2])).toBe(2);
  });

  it("treats today's own weekday as next week's occurrence, not zero days away", () => {
    // Wednesday (ISO 3) checking a Wednesday route -> 7, not 0 -- this runs while today's
    // own visit is being logged, so the gap that matters is until the *next* one.
    expect(daysUntilNextWeekday(3, [3])).toBe(7);
  });

  it("picks the soonest occurrence when the body is on more than one route", () => {
    // Monday (ISO 1) checking Thursday (4) and Friday (5) routes -> 3 days (Thursday).
    expect(daysUntilNextWeekday(1, [4, 5])).toBe(3);
  });

  it("returns null when the body has no recurring schedule at all", () => {
    expect(daysUntilNextWeekday(1, [])).toBeNull();
  });
});

describe("computeTabletRecommendation", () => {
  it("computes both an immediate-correction and a maintenance component", () => {
    // 20,000 gal, FC 1.0 vs target 3.0, dosingConstant 1.48 (real Trichlor 90% value):
    // immediateOz = 1.48 * 2 * (20000/10000) = 5.92 oz -> 5.92/8 = 0.74 tablets.
    // 3 days to next visit: maintenanceTablets = (20000/10000) * (3/7) ≈ 0.857.
    // total = round(0.74 + 0.857) = round(1.597) = 2.
    const result = computeTabletRecommendation(20000, 1.0, 3.0, 3, 1.48);
    expect(result.immediateTablets).toBeCloseTo(0.74, 2);
    expect(result.maintenanceTablets).toBeCloseTo(0.857, 2);
    expect(result.totalTablets).toBe(2);
    expect(result.daysUntilNextVisit).toBe(3);
  });

  it("skips the maintenance component when no recurring schedule was found", () => {
    const result = computeTabletRecommendation(20000, 1.0, 3.0, null, 1.48);
    expect(result.maintenanceTablets).toBe(0);
    expect(result.daysUntilNextVisit).toBeNull();
    // Immediate-only still recommends at least 1 tablet, never 0, once called.
    expect(result.totalTablets).toBeGreaterThanOrEqual(1);
  });

  it("never recommends 0 tablets once FC is confirmed low, even for a tiny deficit", () => {
    const result = computeTabletRecommendation(5000, 2.9, 3.0, null, 1.48);
    expect(result.totalTablets).toBe(1);
  });

  it("is maintenance-only when FC is already at or above target but days remain", () => {
    const result = computeTabletRecommendation(10000, 3.0, 3.0, 7, 1.48);
    expect(result.immediateTablets).toBe(0);
    expect(result.maintenanceTablets).toBeCloseTo(1, 5);
    expect(result.totalTablets).toBe(1);
  });
});
