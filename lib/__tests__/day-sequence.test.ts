import { describe, expect, it } from "vitest";
import { nextRouteSequence } from "@/lib/day-sequence";

/**
 * These cases are Rich's Thursday, 2026-10-22, which is what sent me here.
 *
 * His day was generated from the Thursday route as Baymont(0), Paseo Spa(1), Paseo Pool(2),
 * Cornerstone Pool 2(3), Office Spa(4), Office Pool(5). Fifty101's Spa and Pool were then moved
 * over from Wednesday, where they had held positions 4 and 6, and the move copied those numbers
 * across. The result: two stops at position 4, and Office Pool(5) sitting between Fifty101's Spa
 * and Pool, which broke both walk-ups.
 */
const RICH_THURSDAY = {
  visits: [
    { routeSequence: 0 }, // Baymont — Main Pool
    { routeSequence: 1 }, // Paseo Del Prado — Spa
    { routeSequence: 2 }, // Paseo Del Prado — Pool
    { routeSequence: 3 }, // Cornerstone Park — Pool 2
    { routeSequence: 4 }, // Cornerstone Park — Office Spa
    { routeSequence: 5 }, // Cornerstone Park — Office Pool
  ],
  adHocStops: [],
};

describe("nextRouteSequence", () => {
  it("appends after the last stop on the day", () => {
    expect(nextRouteSequence(RICH_THURSDAY)).toBe(6);
  });

  it("does not collide with a position already taken, however the stop arrives", () => {
    // The actual regression: the source day's number (4) was reused on a day where 4 was taken.
    const taken = new Set(RICH_THURSDAY.visits.map((v) => v.routeSequence));
    expect(taken.has(nextRouteSequence(RICH_THURSDAY))).toBe(false);
  });

  it("keeps a moved walk-up together when both bodies are moved", () => {
    // Spa moves first and lands at the end; Pool follows it. Contiguous, so they group as one
    // card -- which is the whole point, since they are one physical walk-up.
    const afterSpa = nextRouteSequence(RICH_THURSDAY);
    const withSpa = { ...RICH_THURSDAY, visits: [...RICH_THURSDAY.visits, { routeSequence: afterSpa }] };
    const afterPool = nextRouteSequence(withSpa);
    expect([afterSpa, afterPool]).toEqual([6, 7]);
    expect(afterPool - afterSpa).toBe(1);
  });

  it("counts ad-hoc stops, which share the day's one sequence space", () => {
    // An errand at position 9 means the next stop is 10, not 6 -- ServiceVisit and AdHocStop are
    // numbered in the same space per technician per day.
    expect(nextRouteSequence({ ...RICH_THURSDAY, adHocStops: [{ routeSequence: 9 }] })).toBe(10);
  });

  it("starts an empty day at 0", () => {
    expect(nextRouteSequence({ visits: [], adHocStops: [] })).toBe(0);
  });

  it("ignores unpositioned stops rather than treating them as position 0", () => {
    // An unassigned ad-hoc stop has a null position and belongs to no day's list yet.
    expect(nextRouteSequence({ visits: [{ routeSequence: null }], adHocStops: [{ routeSequence: null }] })).toBe(0);
    expect(nextRouteSequence({ visits: [{ routeSequence: 2 }, { routeSequence: null }], adHocStops: [] })).toBe(3);
  });

  it("appends past a gap rather than filling it", () => {
    // Gaps are normal -- a skipped or moved-away stop leaves its number behind. Filling the hole
    // would drop the new stop into the middle of a day the technician is already working.
    expect(nextRouteSequence({ visits: [{ routeSequence: 0 }, { routeSequence: 7 }], adHocStops: [] })).toBe(8);
  });
});
