/**
 * Guards the arithmetic behind a carry-aware chlorine dose.
 *
 * The two scenarios at the bottom are this org's own measured figures (2026-11-16): a median
 * pool at 0.68 ppm/day, which a 2-8 band CAN carry for a week, and a warm-season 75th
 * percentile pool at 1.30 ppm/day, which it cannot. Those two cases are the whole design -- if
 * the first ever stops bridging or the second ever starts claiming to, the feature is either
 * under-dosing again or promising a dose it cannot deliver.
 */
import { describe, it, expect } from "vitest";
import {
  estimateChlorineDemand,
  projectCarryTarget,
  needsCarryTopUp,
  buildCarryNote,
  DEFAULT_DEMAND_PPM_PER_DAY,
  MAX_CREDIBLE_DEMAND_PPM_PER_DAY,
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
    expect(d.ppmPerDay).toBe(DEFAULT_DEMAND_PPM_PER_DAY);
    expect(d.sampleSize).toBe(0);
  });

  it("takes the median of usable intervals, not the mean", () => {
    // Rates: 0.5, 1.0, 10.0 -- a mean would be dragged to 3.8 by the outlier.
    const d = estimateChlorineDemand([
      { startFc: 5, endFc: 1.5, gapDays: 7 },
      { startFc: 9, endFc: 2, gapDays: 7 },
      { startFc: 30, endFc: 2, gapDays: 2.8 },
    ]);
    expect(d.source).toBe("measured");
    expect(d.sampleSize).toBe(3);
    expect(d.ppmPerDay).toBeCloseTo(1.0, 5);
  });

  it("drops intervals where chlorine rose, rather than counting them as zero demand", () => {
    // Four rising intervals would halve a median that included them as 0.
    const d = estimateChlorineDemand([
      { startFc: 2, endFc: 5, gapDays: 7 },
      { startFc: 2, endFc: 6, gapDays: 7 },
      { startFc: 2, endFc: 4, gapDays: 7 },
      { startFc: 7, endFc: 0.7, gapDays: 7 },
      { startFc: 7, endFc: 0.7, gapDays: 7 },
      { startFc: 7, endFc: 0.7, gapDays: 7 },
    ]);
    expect(d.sampleSize).toBe(3);
    expect(d.ppmPerDay).toBeCloseTo(0.9, 5);
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
    expect(d.ppmPerDay).toBeCloseTo(2 / 7, 5);
  });

  it("caps an implausible estimate so one mistyped reading cannot make the note absurd", () => {
    const d = estimateChlorineDemand([
      { startFc: 300, endFc: 2, gapDays: 7 },
      { startFc: 300, endFc: 2, gapDays: 7 },
      { startFc: 300, endFc: 2, gapDays: 7 },
    ]);
    expect(d.ppmPerDay).toBe(MAX_CREDIBLE_DEMAND_PPM_PER_DAY);
  });

  it("flags floor censoring, because a pool that hit zero may have done so days earlier", () => {
    const d = estimateChlorineDemand([
      { startFc: 5, endFc: 0, gapDays: 7 },
      { startFc: 5, endFc: 2, gapDays: 7 },
      { startFc: 5, endFc: 2, gapDays: 7 },
    ]);
    expect(d.floorCensored).toBe(true);
  });
});

describe("projectCarryTarget", () => {
  it("never dips below the target the calculator already used", () => {
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      demandPpmPerDay: 0.1, // would only ask for 2.7
      daysUntilNextVisit: 7,
    });
    expect(p.targetPpm).toBe(5);
  });

  it("never exceeds the ceiling, and says when the ceiling was the binding constraint", () => {
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      demandPpmPerDay: 2,
      daysUntilNextVisit: 7, // would need 16 ppm
    });
    expect(p.targetPpm).toBe(8);
    expect(p.cappedByMax).toBe(true);
    expect(p.bridges).toBe(false);
    expect(p.daysCovered).toBeCloseTo(3, 5);
  });

  it("treats a pool with no measurable demand as bridging rather than reporting infinity", () => {
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      demandPpmPerDay: 0,
      daysUntilNextVisit: 7,
    });
    expect(p.daysCovered).toBe(7);
    expect(p.bridges).toBe(true);
  });

  it("does not report a shortfall for a rounding-sized shortfall", () => {
    const p = projectCarryTarget({
      baselineTargetPpm: 2,
      floorPpm: 2,
      maxPpm: 8,
      demandPpmPerDay: 6.01 / 7,
      daysUntilNextVisit: 7,
    });
    expect(p.bridges).toBe(true);
  });
});

describe("needsCarryTopUp", () => {
  const base = { floorPpm: 2, maxPpm: 8, daysUntilNextVisit: 7 };

  it("asks for a top-up on an in-range pool that will not survive the gap", () => {
    // 3 ppm now, 0.68/day for 7 days = -1.8 by the next visit.
    expect(needsCarryTopUp({ ...base, currentPpm: 3, demandPpmPerDay: 0.68 })).toBe(true);
  });

  it("leaves a pool alone when it will still be above the floor", () => {
    expect(needsCarryTopUp({ ...base, currentPpm: 7, demandPpmPerDay: 0.1 })).toBe(false);
  });

  it("never tops up a pool already at or above the ceiling", () => {
    expect(needsCarryTopUp({ ...base, currentPpm: 8, demandPpmPerDay: 2 })).toBe(false);
    expect(needsCarryTopUp({ ...base, currentPpm: 9.5, demandPpmPerDay: 2 })).toBe(false);
  });

  it("skips a top-up too small to be worth stopping for", () => {
    // Needs 2 + 0.3*7 = 4.1 against 3.8 now: a 0.3 ppm splash, under the useful threshold.
    const needed = 2 + 0.3 * 7;
    expect(needed - 3.8).toBeLessThan(MIN_USEFUL_TOP_UP_PPM);
    expect(needsCarryTopUp({ ...base, currentPpm: 3.8, demandPpmPerDay: 0.3 })).toBe(false);
  });
});

describe("buildCarryNote", () => {
  const demand = { ppmPerDay: 0.68, source: "measured" as const, sampleSize: 12, floorCensored: false };

  it("states what the dose is sized for and where the figure came from", () => {
    const carry = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      demandPpmPerDay: 0.68,
      daysUntilNextVisit: 7,
    });
    const note = buildCarryNote({ carry, demand, floorPpm: 2, currentlyInRange: false });
    expect(note).toContain("0.7 ppm/day");
    expect(note).toContain("12 recent service intervals");
    expect(note).toContain("from this pool's own history");
    expect(note).not.toContain("cannot carry");
  });

  it("explains itself differently when the reading is still in range", () => {
    const carry = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      demandPpmPerDay: 0.68,
      daysUntilNextVisit: 7,
    });
    const note = buildCarryNote({ carry, demand, floorPpm: 2, currentlyInRange: true });
    expect(note).toContain("in range now");
    expect(note).toContain("falls below 2 ppm");
    // The basis must stand as its own sentence, not be spliced mid-clause.
    expect(note).toContain(". Demand measured at");
  });

  it("says plainly that one dose cannot carry the pool when it cannot", () => {
    const carry = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      demandPpmPerDay: 1.3,
      daysUntilNextVisit: 7,
    });
    const note = buildCarryNote({
      carry,
      demand: { ...demand, ppmPerDay: 1.3 },
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
        demandPpmPerDay: DEFAULT_DEMAND_PPM_PER_DAY,
        daysUntilNextVisit: 7,
      }),
      demand: { ppmPerDay: DEFAULT_DEMAND_PPM_PER_DAY, source: "default", sampleSize: 0, floorCensored: false },
      floorPpm: 2,
      currentlyInRange: false,
    });
    expect(note).toContain("the default, until this pool has enough history of its own");
  });
});

describe("this organization's own measured pools", () => {
  // Lindley's band is 2-8 ppm; Nevada allows up to 10, so 8 is the binding ceiling.
  const band = { baselineTargetPpm: 5, floorPpm: 2, maxPpm: 8 };

  it("carries a median pool (0.68 ppm/day) through a 7-day gap, which the old dose did not", () => {
    const p = projectCarryTarget({ ...band, demandPpmPerDay: 0.676, daysUntilNextVisit: 7 });
    // 2 + 0.676 x 7 = 6.732, rounded down to the 0.1 ppm the card displays.
    expect(p.targetPpm).toBe(6.7);
    expect(p.bridges).toBe(true);
    // The old behaviour dosed to 5.0 and ran out on day 4.4.
    expect((5 - 2) / 0.676).toBeLessThan(7);
  });

  it("cannot carry a warm-season 75th-percentile pool (1.30 ppm/day), and does not pretend to", () => {
    const p = projectCarryTarget({ ...band, demandPpmPerDay: 1.301, daysUntilNextVisit: 7 });
    expect(p.targetPpm).toBe(8);
    expect(p.cappedByMax).toBe(true);
    expect(p.bridges).toBe(false);
    expect(p.daysCovered).toBeCloseTo(4.6, 1);
  });

  it("still only reaches day 4.6 on the busiest pools, so the shortfall note is not an edge case", () => {
    const p = projectCarryTarget({ ...band, demandPpmPerDay: 2.0, daysUntilNextVisit: 7 });
    expect(p.daysCovered).toBeCloseTo(3, 5);
    expect(p.bridges).toBe(false);
  });
});

describe("tablet-fed bodies", () => {
  const demand = { ppmPerDay: 1.3, source: "measured" as const, sampleSize: 9, floorCensored: false };
  const shortCarry = projectCarryTarget({
    baselineTargetPpm: 5,
    floorPpm: 2,
    maxPpm: 8,
    demandPpmPerDay: 1.3,
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
    // floor 2 + 0.7 x 6 is 6.199999999999999 in floating point.
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 8,
      demandPpmPerDay: 0.7,
      daysUntilNextVisit: 6,
    });
    expect(p.targetPpm).toBe(6.2);
    expect(String(p.targetPpm)).not.toContain("99999");
  });

  it("never rounds its way past the ceiling", () => {
    const p = projectCarryTarget({
      baselineTargetPpm: 5,
      floorPpm: 2,
      maxPpm: 7.96,
      demandPpmPerDay: 1,
      daysUntilNextVisit: 7,
    });
    expect(p.targetPpm).toBeLessThanOrEqual(7.96);
  });

  it("does not claim trichlor is the problem on a liquid-dosed pool", () => {
    const note = buildCarryNote({
      carry: projectCarryTarget({ baselineTargetPpm: 5, floorPpm: 2, maxPpm: 8, demandPpmPerDay: 0.7, daysUntilNextVisit: 6 }),
      demand: { ppmPerDay: 0.7, source: "default", sampleSize: 0, floorCensored: false },
      floorPpm: 2,
      currentlyInRange: false,
      cyaHeadroomPpm: 5,
    });
    expect(note).toContain("little room to add stabiliser");
    expect(note).not.toContain("puck");
    expect(note).not.toContain("trichlor");
  });
});
