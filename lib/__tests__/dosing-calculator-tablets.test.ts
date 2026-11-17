import { describe, it, expect } from "vitest";
// Imported from lib/dosing-units.ts, not lib/dosing-calculator.ts -- the latter imports
// lib/prisma, which creates a live DB connection Pool at module load and throws when
// DATABASE_URL isn't set in the test environment. dosing-units.ts is deliberately kept
// Prisma-free (see its own doc comments) precisely so this kind of pure-function test
// works; dosing-calculator.ts re-exports the same functions for its own internal use.
import { buildTabletNote, computeTabletRecommendation, daysUntilNextWeekday } from "@/lib/dosing-units";

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
  // Office Pool at Cornerstone Park, the body that prompted this: 45,021 gal on a tablet
  // feeder, 2 days to the next visit, measuring 0.37 ppm/day across its own 17 intervals.
  // 0.37 * 2 = 0.73 ppm to replace -> 1.48 * 0.73 * 4.5021 = 4.87 oz -> 0.61 tablets -> 1.
  it("sizes the feeder from measured demand over the interval", () => {
    const result = computeTabletRecommendation({
      volumeGallons: 45_021,
      demandPpmPerDay: 0.37,
      daysUntilNextVisit: 2,
      dosingConstant: 1.48,
    })!;
    expect(result.intervalPpm).toBeCloseTo(0.74, 2);
    expect(result.intervalTablets).toBeCloseTo(0.616, 2);
    expect(result.totalTablets).toBe(1);
  });

  it("no longer charges for a same-day correction tablets cannot make", () => {
    // The old shape added (target - current) as an "immediate" component, which on this pool
    // at 1 ppm against a 5 ppm target was 3.3 tablets, and took the total to 5. Nothing about
    // today's reading enters the figure now -- only demand, days and volume.
    const low = computeTabletRecommendation({ volumeGallons: 45_021, demandPpmPerDay: 0.37, daysUntilNextVisit: 2, dosingConstant: 1.48 })!;
    expect(low.totalTablets).toBe(1);
    expect(low.totalTablets).toBeLessThan(5);
  });

  it("scales with the interval, so a week is not priced like two days", () => {
    const twoDays = computeTabletRecommendation({ volumeGallons: 45_021, demandPpmPerDay: 0.37, daysUntilNextVisit: 2, dosingConstant: 1.48 })!;
    const week = computeTabletRecommendation({ volumeGallons: 45_021, demandPpmPerDay: 0.37, daysUntilNextVisit: 7, dosingConstant: 1.48 })!;
    expect(week.intervalTablets).toBeGreaterThan(twoDays.intervalTablets);
    // 2.16 tablets of real demand, rounded up rather than down to 2 -- see the ceil in
    // computeTabletRecommendation.
    expect(week.totalTablets).toBe(3);
  });

  it("gives a hot busy pool more than a cold empty one of the same size", () => {
    // The operator's point: season and bather load are the difference, and they arrive here as
    // this pool's own measured demand rather than as a month multiplier.
    const winter = computeTabletRecommendation({ volumeGallons: 20_000, demandPpmPerDay: 0.5, daysUntilNextVisit: 7, dosingConstant: 1.48 })!;
    const summer = computeTabletRecommendation({ volumeGallons: 20_000, demandPpmPerDay: 1.3, daysUntilNextVisit: 7, dosingConstant: 1.48 })!;
    expect(winter.totalTablets).toBe(2);
    expect(summer.totalTablets).toBe(4);
  });

  it("rounds a partial tablet up, so the feeder is not left short on day six", () => {
    // 20,000 gal at 0.5 ppm/day over 7 days is 1.29 tablets of real demand. Rounding to
    // nearest would hand over 1 and leave the feeder 22% short.
    const result = computeTabletRecommendation({ volumeGallons: 20_000, demandPpmPerDay: 0.5, daysUntilNextVisit: 7, dosingConstant: 1.48 })!;
    expect(result.intervalTablets).toBeCloseTo(1.295, 2);
    expect(result.totalTablets).toBe(2);
  });

  it("never recommends 0 tablets once the calculator has decided this pool needs chlorine", () => {
    const tiny = computeTabletRecommendation({ volumeGallons: 1_588, demandPpmPerDay: 0.2, daysUntilNextVisit: 2, dosingConstant: 1.48 })!;
    expect(tiny.intervalTablets).toBeLessThan(0.5);
    expect(tiny.totalTablets).toBe(1);
  });

  it("returns nothing at all when there is no interval to size against", () => {
    // A body with no upcoming visit on a route. The caller gives advice with no dose rather
    // than printing a count it cannot stand behind.
    expect(
      computeTabletRecommendation({ volumeGallons: 20_000, demandPpmPerDay: 0.5, daysUntilNextVisit: null, dosingConstant: 1.48 }),
    ).toBeNull();
  });

  it("returns nothing when volume, demand or the constant is missing", () => {
    const base = { volumeGallons: 20_000, demandPpmPerDay: 0.5, daysUntilNextVisit: 7, dosingConstant: 1.48 };
    expect(computeTabletRecommendation({ ...base, volumeGallons: 0 })).toBeNull();
    expect(computeTabletRecommendation({ ...base, demandPpmPerDay: 0 })).toBeNull();
    expect(computeTabletRecommendation({ ...base, dosingConstant: 0 })).toBeNull();
  });
});

describe("buildTabletNote", () => {
  const rec = computeTabletRecommendation({ volumeGallons: 27_000, demandPpmPerDay: 0.5, daysUntilNextVisit: 7, dosingConstant: 1.48 })!;

  it("leads with liquid when the pool is short today, because tablets cannot fix that", () => {
    const note = buildTabletNote(rec, { shortToday: true, demandSource: "measured", sampleSize: 17 });
    expect(note).toMatch(/^Free chlorine is below the minimum now, and tablets will not raise it today/);
    expect(note).toContain("Chlorinate with liquid now");
  });

  it("says nothing about liquid when the pool is not short today", () => {
    const note = buildTabletNote(rec, { demandSource: "measured", sampleSize: 17 });
    expect(note).not.toContain("liquid");
  });

  it("quotes the measured demand and how many intervals it rests on", () => {
    const note = buildTabletNote(rec, { demandSource: "measured", sampleSize: 17 });
    expect(note).toContain("0.5 ppm a day");
    expect(note).toContain("17 service intervals");
  });

  it("says so plainly when there was too little history to measure", () => {
    const note = buildTabletNote(rec, { demandSource: "default", sampleSize: 0 });
    expect(note).toContain("isn't enough history on this pool to measure it");
    expect(note).not.toContain("service intervals");
  });

  it("names the holder it is talking about", () => {
    expect(buildTabletNote(rec, { shortToday: true })).toContain("stock the feeder");
    expect(buildTabletNote(rec, { shortToday: true, holder: "floater" })).toContain("stock the floater");
  });

  it("keeps the CYA caveat whichever holder it is -- the chemistry is the same", () => {
    for (const note of [buildTabletNote(rec), buildTabletNote(rec, { holder: "floater" })]) {
      expect(note).toContain("3 ppm of CYA per 10,000 gal");
    }
  });

  it("leaves the judgement line to the card rather than repeating it here", () => {
    expect(buildTabletNote(rec, { shortToday: true })).not.toMatch(/your own judgement|your own read/i);
  });
});
