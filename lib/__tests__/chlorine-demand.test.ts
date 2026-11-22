/**
 * Guards the arithmetic behind a carry-aware chlorine dose.
 *
 * Chlorine decays proportionally -- a pool loses a percentage of what is in the water each day,
 * not a fixed ppm -- so every rate here is a decay constant k in FC(t) = FC(0)*e^(-k*t), per
 * day. See lib/chlorine-demand.ts's header for the measurement that settled the law: a flat
 * ppm/day rate tracks the level the interval started at (r = 0.544), the proportional one does
 * not (r = 0.116), and on the org's own dosed intervals the proportional law halves the error
 * in predicting the next reading.
 *
 * The scenarios near the bottom are this org's own measured pools (2026-11-20): the median pool
 * at 12.1%/day, which a 2-8 band carries for a week, and the 90th-percentile pool at 20.4%/day,
 * which it cannot. Those two cases are the whole design -- if the first ever stops bridging or
 * the second ever starts claiming to, the feature is either under-dosing again or promising a
 * dose it cannot deliver.
 */
import { describe, it, expect } from "vitest";
import {
  estimateChlorineDemand,
  projectCarryTarget,
  needsCarryTopUp,
  buildCarryNote,
  dailyLossPercent,
  buildDecayIntervals,
  carryApplies,
  type DemandReading,
  DEFAULT_DECAY_CONSTANT_PER_DAY,
  MAX_CREDIBLE_DECAY_CONSTANT_PER_DAY,
  MIN_USEFUL_TOP_UP_PPM,
  TABLET_FEEDER_CARRY_ACTION,
} from "@/lib/chlorine-demand";

describe("estimateChlorineDemand", () => {
  it("falls back to the documented default below the minimum sample size", () => {
    const d = estimateChlorineDemand([
      { startFc: 5, endFc: 3, gapDays: 7 },
      { startFc: 4, endFc: 2, gapDays: 7 },
    ]);
    expect(d.source).toBe("default");
    expect(d.decayConstantPerDay).toBe(DEFAULT_DECAY_CONSTANT_PER_DAY);
    expect(d.sampleSize).toBe(0);
  });

  it("takes the median of usable intervals, not the mean", () => {
    // k values 0.172, 0.215, 0.967 -- a mean would be dragged to 0.451 by the outlier.
    const d = estimateChlorineDemand([
      { startFc: 5, endFc: 1.5, gapDays: 7 },
      { startFc: 9, endFc: 2, gapDays: 7 },
      { startFc: 30, endFc: 2, gapDays: 2.8 },
    ]);
    expect(d.source).toBe("measured");
    expect(d.sampleSize).toBe(3);
    expect(d.decayConstantPerDay).toBeCloseTo(0.21487, 4);
  });

  it("measures the proportional rate, so the same pool reads the same from any level", () => {
    // The point of the law change: a pool halving its chlorine over 7 days has one rate,
    // whether it started at 8 ppm or at 2. A flat ppm/day would have called these 0.57 and
    // 0.14 and let whichever level the pool happened to be at set its standing dose.
    const high = estimateChlorineDemand([
      { startFc: 8, endFc: 4, gapDays: 7 },
      { startFc: 8, endFc: 4, gapDays: 7 },
      { startFc: 8, endFc: 4, gapDays: 7 },
    ]);
    const low = estimateChlorineDemand([
      { startFc: 2, endFc: 1, gapDays: 7 },
      { startFc: 2, endFc: 1, gapDays: 7 },
      { startFc: 2, endFc: 1, gapDays: 7 },
    ]);
    expect(high.decayConstantPerDay).toBeCloseTo(low.decayConstantPerDay, 10);
  });

  it("drops intervals where chlorine rose, rather than counting them as zero demand", () => {
    // Three rising intervals would drag a median that included them as 0.
    const d = estimateChlorineDemand([
      { startFc: 2, endFc: 5, gapDays: 7 },
      { startFc: 2, endFc: 6, gapDays: 7 },
      { startFc: 2, endFc: 4, gapDays: 7 },
      { startFc: 7, endFc: 0.7, gapDays: 7 },
      { startFc: 7, endFc: 0.7, gapDays: 7 },
      { startFc: 7, endFc: 0.7, gapDays: 7 },
    ]);
    expect(d.sampleSize).toBe(3);
    expect(d.decayConstantPerDay).toBeCloseTo(0.32894, 4);
  });

  it("ignores gaps that are not normal service intervals", () => {
    const d = estimateChlorineDemand([
      { startFc: 5, endFc: 4, gapDays: 0.5 }, // same-day recheck
      { startFc: 5, endFc: 1, gapDays: 45 }, // closed for the season
      { startFc: 5, endFc: 3, gapDays: 7 },
      { startFc: 5, endFc: 3, gapDays: 7 },
      { startFc: 5, endFc: 3, gapDays: 7 },
    ]);
    expect(d.sampleSize).toBe(3);
    expect(d.decayConstantPerDay).toBeCloseTo(0.072975, 5);
  });

  it("caps an implausible estimate so one mistyped reading cannot make the note absurd", () => {
    // 300 instead of 3.00 is a 0.716/day rate -- 51% of the water's chlorine a day.
    const d = estimateChlorineDemand([
      { startFc: 300, endFc: 2, gapDays: 7 },
      { startFc: 300, endFc: 2, gapDays: 7 },
      { startFc: 300, endFc: 2, gapDays: 7 },
    ]);
    expect(d.decayConstantPerDay).toBe(MAX_CREDIBLE_DECAY_CONSTANT_PER_DAY);
  });

  it("leaves a zero-ending interval out of the median but still reports it", () => {
    // ln(start/0) is undefined, and the pool may have hit zero days before anyone arrived --
    // so the rate is only bounded below and cannot go in the median. The flag is how the
    // technician hears about it.
    const d = estimateChlorineDemand([
      { startFc: 5, endFc: 0, gapDays: 7 },
      { startFc: 5, endFc: 2, gapDays: 7 },
      { startFc: 5, endFc: 2, gapDays: 7 },
      { startFc: 5, endFc: 2, gapDays: 7 },
    ]);
    expect(d.source).toBe("measured");
    expect(d.sampleSize).toBe(3);
    expect(d.decayConstantPerDay).toBeCloseTo(0.1309, 4);
    expect(d.floorCensored).toBe(true);
  });

  it("falls back to the default when every interval ended at zero, and says it is censored", () => {
    // A pool that runs dry every week is the one most in need of a dose, so losing the flag
    // here would be the worst place to lose it.
    const d = estimateChlorineDemand([
      { startFc: 5, endFc: 0, gapDays: 7 },
      { startFc: 4, endFc: 0, gapDays: 7 },
      { startFc: 6, endFc: 0, gapDays: 7 },
    ]);
    expect(d.source).toBe("default");
    expect(d.sampleSize).toBe(0);
    expect(d.floorCensored).toBe(true);
  });
});

describe("buildDecayIntervals", () => {
  const day = 24 * 60 * 60 * 1000;
  const at = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * day);
  /** A plain serviced visit: dose data exists and no chlorine was in it. */
  const serviced = (n: number, fc: number): DemandReading => ({
    at: at(n),
    fc,
    chlorineAdded: false,
    doseDataMissing: false,
  });

  it("pairs each reading with the next one", () => {
    const intervals = buildDecayIntervals([serviced(0, 6), serviced(3, 4), serviced(6, 3)]);
    expect(intervals).toEqual([
      { startFc: 6, endFc: 4, gapDays: 3 },
      { startFc: 4, endFc: 3, gapDays: 3 },
    ]);
  });

  it("will not open an interval on a visit that logged chlorine", () => {
    const intervals = buildDecayIntervals([
      { ...serviced(0, 6), chlorineAdded: true },
      serviced(3, 4),
      serviced(6, 3),
    ]);
    expect(intervals).toEqual([{ startFc: 4, endFc: 3, gapDays: 3 }]);
  });

  it("will not open an interval on a log-only record", () => {
    // The defect this function was extracted to fix. A log-only record -- a paper logbook
    // reading, or one entered with no technician dispatched -- has no dose rows AT ALL, so
    // chlorineAdded is false for a reason that proves nothing. Measured as pure decay, it reports
    // whatever the uploaded history happens to show.
    const intervals = buildDecayIntervals([
      { ...serviced(0, 6), doseDataMissing: true },
      serviced(3, 4),
      serviced(6, 3),
    ]);
    expect(intervals).toEqual([{ startFc: 4, endFc: 3, gapDays: 3 }]);
  });

  it("still lets a log-only record CLOSE an interval", () => {
    // The end reading is a reading like any other, and a dose at the closing visit is poured
    // after it is taken. Dropping these too would throw away the one interval that spans the
    // changeover from paper to app, which is real decay and measurable.
    const intervals = buildDecayIntervals([serviced(0, 6), { ...serviced(4, 3), doseDataMissing: true }]);
    expect(intervals).toEqual([{ startFc: 6, endFc: 3, gapDays: 4 }]);
  });

  it("measures nothing at all from a history that is entirely uploaded", () => {
    // Four bodies here are mostly paper. Before the fix this returned three measurable
    // intervals and estimateChlorineDemand called the result "measured".
    const uploaded = [0, 3, 6, 9].map((n) => ({ ...serviced(n, 8 - n / 3), doseDataMissing: true }));
    expect(buildDecayIntervals(uploaded)).toEqual([]);
    expect(estimateChlorineDemand(buildDecayIntervals(uploaded)).source).toBe("default");
  });

  it("does not treat a skipped opener as a gap to bridge", () => {
    // A dosed or log-only reading is skipped as an OPENER, not spliced out of the series: the
    // interval after it still starts where it ends, so the 6 ppm reading is never paired with
    // the 3 ppm one six days later as though nothing sat between them.
    const intervals = buildDecayIntervals([
      serviced(0, 6),
      { ...serviced(3, 5), chlorineAdded: true },
      serviced(6, 3),
    ]);
    expect(intervals).toEqual([{ startFc: 6, endFc: 5, gapDays: 3 }]);
    expect(intervals).not.toContainEqual({ startFc: 6, endFc: 3, gapDays: 6 });
  });

  it("returns nothing for a body with a single reading", () => {
    expect(buildDecayIntervals([serviced(0, 5)])).toEqual([]);
    expect(buildDecayIntervals([])).toEqual([]);
  });

  it("reports fractional gaps rather than rounding to whole days", () => {
    const [interval] = buildDecayIntervals([
      { ...serviced(0, 6), at: new Date(Date.UTC(2026, 8, 1, 6)) },
      { ...serviced(0, 4), at: new Date(Date.UTC(2026, 8, 3, 18)) },
    ]);
    expect(interval.gapDays).toBeCloseTo(2.5, 6);
  });
});

describe("dailyLossPercent", () => {
  it("converts a decay constant into the percentage a technician can check against the pool", () => {
    expect(dailyLossPercent(0.129)).toBeCloseTo(12.103, 2);
    expect(dailyLossPercent(DEFAULT_DECAY_CONSTANT_PER_DAY)).toBeCloseTo(13.929, 2);
  });

  it("is not the decay constant itself, which is the mistake it exists to prevent", () => {
    // k = 0.2282 is a 20.4%/day loss, not 22.8%. The gap widens with the rate, and quoting k
    // as a percentage would overstate every thirsty pool.
    expect(dailyLossPercent(0.2282)).toBeLessThan(22.82);
    expect(dailyLossPercent(0.2282)).toBeCloseTo(20.403, 2);
  });
});

describe("carryApplies", () => {
  it("projects only when the org asked for it and the body has no automation", () => {
    expect(carryApplies({ smartDosingEnabled: true, onAutomation: false })).toEqual({ projects: true });
  });

  it("does not project for an org on the compliance-first default", () => {
    expect(carryApplies({ smartDosingEnabled: false, onAutomation: false })).toEqual({
      projects: false,
      reason: "smart-dosing-off",
    });
  });

  it("does not project on an automation body, even with smart dosing switched on", () => {
    // The point of step 1. An automation system is built to hold a level between visits, so the
    // gap the projection exists to cover is already covered -- which is not something an org
    // setting can make untrue. A refactor that reordered these two clauses would silently put
    // carry dosing back on every liquid-feed-pump pool in the account, which is what this pins.
    expect(carryApplies({ smartDosingEnabled: true, onAutomation: true })).toEqual({
      projects: false,
      reason: "automation-covers-the-gap",
    });
  });

  it("blames the automation, not the setting, when both would stop it", () => {
    // Both reasons apply; the one reported is the one the settings page cannot offer to change.
    // Reporting "smart-dosing-off" here would invite an admin to switch something on that would
    // not alter this body's advice at all.
    expect(carryApplies({ smartDosingEnabled: false, onAutomation: true })).toEqual({
      projects: false,
      reason: "automation-covers-the-gap",
    });
  });
});

describe("projectCarryTarget", () => {
  it("never dips below the target the calculator already used", () => {
    // 2 x e^(0.1 x 7) = 4.03, which would be a quiet reduction from the band's own midpoint.
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      decayConstantPerDay: 0.1,
      daysUntilNextVisit: 7,
    });
    expect(p.targetPpm).toBe(5);
  });

  it("never exceeds the ceiling, and says when the ceiling was the binding constraint", () => {
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      decayConstantPerDay: 0.4,
      daysUntilNextVisit: 7, // would need 32.9 ppm
    });
    expect(p.targetPpm).toBe(8);
    expect(p.cappedByMax).toBe(true);
    expect(p.bridges).toBe(false);
    expect(p.daysCovered).toBeCloseTo(3.466, 2);
  });

  it("treats a pool with no measurable demand as bridging rather than reporting infinity", () => {
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      decayConstantPerDay: 0,
      daysUntilNextVisit: 7,
    });
    expect(p.daysCovered).toBe(7);
    expect(p.bridges).toBe(true);
  });

  it("does not report a shortfall for a rounding-sized shortfall", () => {
    // Rounding 8.11 down to the 0.1 ppm the card prints costs 0.006 of a day.
    const p = projectCarryTarget({
      baselineTargetPpm: 2,
      floorPpm: 2,
      maxPpm: 10,
      decayConstantPerDay: 0.2,
      daysUntilNextVisit: 7,
    });
    expect(p.targetPpm).toBe(8.1);
    expect(p.daysCovered).toBeCloseTo(6.994, 2);
    expect(p.bridges).toBe(true);
  });

  it("covers no days at all when the ceiling sits on the floor", () => {
    // Nothing to dose into: reporting a negative or NaN days-covered here is how a shortfall
    // would read as a bridge.
    const p = projectCarryTarget({
      baselineTargetPpm: 2,
      floorPpm: 2,
      maxPpm: 2,
      decayConstantPerDay: 0.2,
      daysUntilNextVisit: 7,
    });
    expect(p.daysCovered).toBe(0);
    expect(p.bridges).toBe(false);
  });
});

describe("needsCarryTopUp", () => {
  const base = { floorPpm: 2, maxPpm: 8, daysUntilNextVisit: 7 };

  it("asks for a top-up on an in-range pool that will not survive the gap", () => {
    // 3 ppm now at 13.9%/day is 1.05 ppm by the next visit.
    expect(needsCarryTopUp({ ...base, currentPpm: 3, decayConstantPerDay: 0.15 })).toBe(true);
  });

  it("leaves a pool alone when it will still be above the floor", () => {
    // 7 ppm at 9.5%/day lands at 3.48 -- still over the minimum, so nothing to do.
    expect(needsCarryTopUp({ ...base, currentPpm: 7, decayConstantPerDay: 0.1 })).toBe(false);
  });

  it("never tops up a pool already at or above the ceiling", () => {
    expect(needsCarryTopUp({ ...base, currentPpm: 8, decayConstantPerDay: 0.4 })).toBe(false);
    expect(needsCarryTopUp({ ...base, currentPpm: 9.5, decayConstantPerDay: 0.4 })).toBe(false);
  });

  it("skips a top-up too small to be worth stopping for", () => {
    // Needs 2.84 against 2.5 now: a 0.34 ppm splash, under the useful threshold, even though
    // the pool does dip below the floor (to 1.76) before the next visit.
    const needed = 2 * Math.exp(0.05 * 7);
    expect(needed - 2.5).toBeLessThan(MIN_USEFUL_TOP_UP_PPM);
    expect(needsCarryTopUp({ ...base, currentPpm: 2.5, decayConstantPerDay: 0.05 })).toBe(false);
  });
});

describe("buildCarryNote", () => {
  const demand = { decayConstantPerDay: 0.129, source: "measured" as const, sampleSize: 12, floorCensored: false };

  it("states what the dose is sized for and where the figure came from", () => {
    const carry = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      decayConstantPerDay: 0.129,
      daysUntilNextVisit: 7,
    });
    const note = buildCarryNote({ carry, demand, floorPpm: 2, currentlyInRange: false });
    // A percentage, not a decay constant -- "loses 12.1% a day" is checkable against the pool
    // in front of the technician; "k = 0.129" is not.
    expect(note).toContain("12.1%");
    expect(note).not.toContain("0.129");
    expect(note).toContain("12 recent service intervals");
    expect(note).toContain("from its own history");
    expect(note).not.toContain("cannot carry");
  });

  it("explains itself differently when the reading is still in range", () => {
    const carry = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      decayConstantPerDay: 0.129,
      daysUntilNextVisit: 7,
    });
    const note = buildCarryNote({ carry, demand, floorPpm: 2, currentlyInRange: true });
    expect(note).toContain("in range now");
    expect(note).toContain("falls below 2 ppm");
    // The basis must stand as its own sentence, not be spliced mid-clause.
    expect(note).toContain(". This pool loses about");
  });

  it("says plainly that one dose cannot carry the pool when it cannot", () => {
    const carry = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      decayConstantPerDay: 0.2282,
      daysUntilNextVisit: 7,
    });
    const note = buildCarryNote({
      carry,
      demand: { ...demand, decayConstantPerDay: 0.2282 },
      floorPpm: 2,
      currentlyInRange: false,
    });
    expect(note).toContain("One dose cannot carry this pool");
    expect(note).toContain("mid-week stop");
    expect(note).toContain("ceiling");
  });

  it("admits when it is guessing because the pool has no history", () => {
    const note = buildCarryNote({
      carry: projectCarryTarget({
        baselineTargetPpm: 5,
        floorPpm: 2,
        maxPpm: 8,
        decayConstantPerDay: DEFAULT_DECAY_CONSTANT_PER_DAY,
        daysUntilNextVisit: 7,
      }),
      demand: {
        decayConstantPerDay: DEFAULT_DECAY_CONSTANT_PER_DAY,
        source: "default",
        sampleSize: 0,
        floorCensored: false,
      },
      floorPpm: 2,
      currentlyInRange: false,
    });
    expect(note).toContain("the default, until this pool has enough history of its own");
  });

  it("says a censored interval was left out, not averaged in", () => {
    const note = buildCarryNote({
      carry: projectCarryTarget({
        baselineTargetPpm: 5,
        floorPpm: 2,
        maxPpm: 8,
        decayConstantPerDay: 0.129,
        daysUntilNextVisit: 7,
      }),
      demand: { ...demand, floorCensored: true },
      floorPpm: 2,
      currentlyInRange: false,
    });
    expect(note).toContain("ended at 0 ppm");
    expect(note).toContain("left out of the figure above");
  });
});

describe("this organization's own measured pools", () => {
  // Lindley's band is 2-8 ppm; Nevada allows up to 10, so 8 is the binding ceiling.
  const band = { baselineTargetPpm: 5, floorPpm: 2, maxPpm: 8 };

  it("carries the median pool (12.1%/day) through a 7-day gap on the band's own midpoint", () => {
    const p = projectCarryTarget({ ...band, decayConstantPerDay: 0.129, daysUntilNextVisit: 7 });
    // 2 x e^(0.129 x 7) = 4.93, under the 5 ppm baseline -- so rule 2 binds and the target is
    // just the band's midpoint. The flat-rate model asked for 6.7 ppm to cover the same pool.
    expect(p.targetPpm).toBe(5);
    expect(p.cappedByMax).toBe(false);
    expect(p.daysCovered).toBeCloseTo(7.1, 1);
    expect(p.bridges).toBe(true);
  });

  it("carries the 75th-percentile pool (17.4%/day) only by going most of the way to the ceiling", () => {
    const p = projectCarryTarget({ ...band, decayConstantPerDay: 0.1918, daysUntilNextVisit: 7 });
    expect(p.targetPpm).toBe(7.7);
    expect(p.cappedByMax).toBe(false);
    expect(p.daysCovered).toBeCloseTo(7.03, 1);
    expect(p.bridges).toBe(true);
  });

  it("cannot carry the 90th-percentile pool (20.4%/day), and does not pretend to", () => {
    const p = projectCarryTarget({ ...band, decayConstantPerDay: 0.2282, daysUntilNextVisit: 7 });
    expect(p.targetPpm).toBe(8);
    expect(p.cappedByMax).toBe(true);
    expect(p.bridges).toBe(false);
    expect(p.daysCovered).toBeCloseTo(6.07, 1);
  });

  it("reaches only day 3.8 on the thirstiest real pool, so the shortfall note is not an edge case", () => {
    const p = projectCarryTarget({ ...band, decayConstantPerDay: 0.3658, daysUntilNextVisit: 7 });
    expect(p.daysCovered).toBeCloseTo(3.79, 1);
    expect(p.bridges).toBe(false);
  });

  it("asks for less than the flat-rate model did on a short gap, which is the point", () => {
    // Twice-weekly service is this org's normal interval (mean gap 3.2 days). The old flat
    // 0.7 ppm/day asked for 2 + 2.24 = 4.24; the proportional law asks 2 x e^0.48 = 3.23.
    // Both land under the 5 ppm baseline, so rule 2 holds the target steady -- but the
    // underlying ask is lower, and it is lower because a high level burns off faster.
    const proportional = 2 * Math.exp(0.15 * 3.2);
    const flatRate = 2 + 0.7 * 3.2;
    expect(proportional).toBeLessThan(flatRate);
    const p = projectCarryTarget({ ...band, decayConstantPerDay: 0.15, daysUntilNextVisit: 3 });
    expect(p.targetPpm).toBe(5);
  });
});

describe("tablet-fed bodies", () => {
  const demand = { decayConstantPerDay: 0.2282, source: "measured" as const, sampleSize: 9, floorCensored: false };
  const shortCarry = projectCarryTarget({
    baselineTargetPpm: 5,
    floorPpm: 2,
    maxPpm: 8,
    decayConstantPerDay: 0.2282,
    daysUntilNextVisit: 7,
  });

  it("never tells a technician to add more tablets to fix a pool tablets cannot fix", () => {
    const note = buildCarryNote({
      carry: shortCarry,
      demand,
      floorPpm: 2,
      currentlyInRange: false,
      tabletFed: true,
    });
    expect(note).toContain(TABLET_FEEDER_CARRY_ACTION);
    expect(note).toContain("dissolve rate");
    expect(note).toContain("run time");
    // Order of operations: rule out the trivial cause before claiming tablets are not the lever.
    expect(note.indexOf("stocked and not jammed")).toBeLessThan(note.indexOf("dissolve rate"));
    // The liquid advice ("a tablet feeder or floater...") makes no sense on a body that has one.
    expect(note).not.toContain("tablet feeder or floater");
  });

  it("still points a liquid-dosed pool at a feeder, which is a real fix there", () => {
    const note = buildCarryNote({ carry: shortCarry, demand, floorPpm: 2, currentlyInRange: false });
    expect(note).toContain("tablet feeder or floater");
    expect(note).not.toContain(TABLET_FEEDER_CARRY_ACTION);
  });

  it("warns that stabiliser has no room left, instead of advising more of it", () => {
    const note = buildCarryNote({
      carry: shortCarry,
      demand,
      floorPpm: 2,
      currentlyInRange: false,
      tabletFed: true,
      cyaHeadroomPpm: 2,
    });
    expect(note).toContain("2 ppm of cyanuric acid headroom");
    expect(note).toContain("every puck adds more");
  });

  it("calls for a drain and refill once stabiliser is at or past its maximum", () => {
    const note = buildCarryNote({
      carry: shortCarry,
      demand,
      floorPpm: 2,
      currentlyInRange: false,
      tabletFed: true,
      cyaHeadroomPpm: 0,
    });
    expect(note).toContain("at or above its maximum");
    expect(note).toContain("partial drain and refill");
  });

  it("says nothing about stabiliser when there is plenty of room", () => {
    const note = buildCarryNote({
      carry: shortCarry,
      demand,
      floorPpm: 2,
      currentlyInRange: false,
      tabletFed: true,
      cyaHeadroomPpm: 40,
    });
    expect(note).not.toContain("cyanuric acid");
  });

  it("leaves the judgement caveat to the card instead of repeating it per note", () => {
    // It used to end every note. The Dosing Card now states it once for everything on it,
    // including the pH prompt, which these notes never reached.
    const note = buildCarryNote({ carry: shortCarry, demand, floorPpm: 2, currentlyInRange: false });
    expect(note).not.toMatch(/use your own read of the pool/i);
    expect(note).not.toMatch(/heat spike/i);
  });
});

describe("figures handed to the screen", () => {
  it("rounds the target to 0.1 ppm, because the card prints it verbatim", () => {
    // 2 x e^(0.2 x 6) is 6.640233845830274 before rounding.
    const p = projectCarryTarget({
      baselineTargetPpm: 2,
      floorPpm: 2,
      maxPpm: 10,
      decayConstantPerDay: 0.2,
      daysUntilNextVisit: 6,
    });
    expect(p.targetPpm).toBe(6.6);
    expect(String(p.targetPpm)).not.toContain("99999");
  });

  it("never rounds its way past the ceiling", () => {
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 7.96,
      decayConstantPerDay: 0.3,
      daysUntilNextVisit: 7,
    });
    expect(p.targetPpm).toBeLessThanOrEqual(7.96);
  });

  it("does not claim trichlor is the problem on a liquid-dosed pool", () => {
    const note = buildCarryNote({
      carry: projectCarryTarget({
        baselineTargetPpm: 5,
        floorPpm: 2,
        maxPpm: 8,
        decayConstantPerDay: DEFAULT_DECAY_CONSTANT_PER_DAY,
        daysUntilNextVisit: 6,
      }),
      demand: {
        decayConstantPerDay: DEFAULT_DECAY_CONSTANT_PER_DAY,
        source: "default",
        sampleSize: 0,
        floorCensored: false,
      },
      floorPpm: 2,
      currentlyInRange: false,
      cyaHeadroomPpm: 5,
    });
    expect(note).toContain("little room to add stabiliser");
    expect(note).not.toContain("puck");
    expect(note).not.toContain("trichlor");
  });
});
