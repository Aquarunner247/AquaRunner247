import type { DosingUnit } from "@/generated/prisma/enums";

/**
 * Pure unit formatting/conversion helpers for the dosing calculator -- deliberately kept
 * in their own module with NO import of lib/prisma or anything else server-only, so
 * client components (app/components/dosing-card.tsx, the visit forms) can import the
 * actual functions, not just types, without pulling a Prisma Client into the browser
 * bundle. lib/dosing-calculator.ts re-exports these for server-side callers.
 */

function roundTo(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function trimTrailingZeros(n: number): string {
  return Number(n.toFixed(4)).toString();
}

/** flOz -> "X fl oz" / "X cups" / "X qt" / "X gal", auto-scaled per the thresholds fixed
 * with the user (8 fl oz = 1 cup, 32 fl oz = 1 qt, 128 fl oz = 1 gal). */
export function formatLiquidOz(flOz: number): string {
  if (flOz < 8) return `${trimTrailingZeros(roundTo(flOz, 0.5))} fl oz`;
  if (flOz < 32) {
    const cups = roundTo(flOz / 8, 0.25);
    return `${trimTrailingZeros(cups)} cup${cups === 1 ? "" : "s"}`;
  }
  if (flOz < 128) return `${trimTrailingZeros(roundTo(flOz / 32, 0.25))} qt`;
  return `${trimTrailingZeros(roundTo(flOz / 128, 0.25))} gal`;
}

/** oz -> "X oz" under 16, "X lb Y oz" at/above -- weight, scale-measured. */
export function formatWeightOz(oz: number): string {
  const rounded = roundTo(oz, 0.25);
  if (rounded < 16) return `${trimTrailingZeros(rounded)} oz`;
  const lb = Math.floor(rounded / 16);
  const remainderOz = roundTo(rounded - lb * 16, 0.25);
  return remainderOz === 0 ? `${lb} lb` : `${lb} lb ${trimTrailingZeros(remainderOz)} oz`;
}

/** Tablet counts are whole numbers, unlike the fractional oz/fl-oz amounts above -- rounds
 * to the nearest tablet rather than trimming decimals. */
export function formatTabletCount(count: number): string {
  const rounded = Math.round(count);
  return `${rounded} tablet${rounded === 1 ? "" : "s"}`;
}

export function formatDose(amount: number, unit: DosingUnit): string {
  if (unit === "FL_OZ") return formatLiquidOz(amount);
  if (unit === "TABLET") return formatTabletCount(amount);
  return formatWeightOz(amount);
}

/** Weight-unit-string -> factor to divide an OZ amount by. Only units that actually
 * appear (or are reasonably expected) in this app's free-text ChemicalProduct.unit field. */
const WEIGHT_UNIT_TO_OZ: Record<string, number> = {
  oz: 1,
  ounce: 1,
  ounces: 1,
  lb: 16,
  lbs: 16,
  pound: 16,
  pounds: 16,
};

/** Liquid-unit-string -> factor to divide a FL_OZ amount by. */
const LIQUID_UNIT_TO_FLOZ: Record<string, number> = {
  "fl oz": 1,
  floz: 1,
  "fl. oz.": 1,
  ounce: 1,
  ounces: 1,
  oz: 1,
  cup: 8,
  cups: 8,
  pt: 16,
  pint: 16,
  pints: 16,
  qt: 32,
  quart: 32,
  quarts: 32,
  gal: 128,
  gallon: 128,
  gallons: 128,
};

/** Tablet-unit-string -> factor to divide a TABLET amount by. Always 1 -- a tablet count is
 * already a count, this just recognizes the handful of spellings a billing product's
 * free-text unit might use. */
const TABLET_UNIT_TO_TABLET: Record<string, number> = {
  tablet: 1,
  tablets: 1,
  tab: 1,
  tabs: 1,
};

/**
 * Converts a raw dosing amount into an org's free-text billing unit -- e.g. the org's
 * ChemicalProduct.unit, which is arbitrary text like "gal", "lb", "tablet". Returns null for
 * anything unrecognized -- never guess: there's still no honest conversion from a Taylor
 * oz/fl-oz weight/volume figure into a tablet count (or vice versa), only a same-unit match.
 * Case-insensitive, trimmed match. Result rounded to 2 decimals -- this feeds an editable
 * quantity field the technician can still adjust, not a final unreviewed persisted value.
 */
export function convertToBillingUnit(amount: number, dosingUnit: DosingUnit, billingUnit: string): number | null {
  const key = billingUnit.trim().toLowerCase();
  const table = dosingUnit === "OZ" ? WEIGHT_UNIT_TO_OZ : dosingUnit === "FL_OZ" ? LIQUID_UNIT_TO_FLOZ : TABLET_UNIT_TO_TABLET;
  const factor = table[key];
  if (factor == null) return null;
  return Math.round((amount / factor) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Tablet-feeder dosing -- lib/dosing-calculator.ts's pickPrimaryProduct deliberately
// excludes TABLET-form products from the ordinary ppm-delta pick (an erosion feeder
// releases chlorine continuously, not as an instant batch dose the way pouring
// liquid/granular does). This is the separate, real math for that instead of no
// recommendation at all -- kept in this Prisma-free module (not dosing-calculator.ts
// itself) purely so it's unit-testable without a live database, same reason every other
// function in this file lives here rather than there.
// ---------------------------------------------------------------------------

/** Standard 3" trichlor tablet net weight -- commonly 8 oz, though some manufacturers run
 * closer to 7 oz. The one number in computeTabletRecommendation that isn't a fixed
 * chemistry constant, so it's called out explicitly in the recommendation note rather
 * than left as an invisible assumption. */
const TABLET_WEIGHT_OZ = 8;

/* The feeder sizing ratio manufacturers publish -- one tablet per 10,000 gallons per week --
 * used to size the maintenance half of this recommendation. It is gone deliberately. At
 * trichlor's 1.48 oz/ppm/10k gal, 8 oz a week over 10,000 gallons implies a demand of 0.77
 * ppm/day, applied to every pool in every month of the year. This org's tablet-fed bodies
 * actually measure 0.50 ppm/day (median of 126 clean intervals across 26 bodies in the 120
 * days to 2026-11-17), and the pool that prompted the change measures 0.37 across its own 17
 * intervals -- so the fixed ratio ran about 50% high going into winter. The operator put it
 * plainly: a cold empty pool in November is not the same pool at 100 degrees with everybody
 * in it. Demand is measured per body now (see lib/chlorine-demand.ts), which answers season
 * and bather load together as observed fact rather than as a month multiplier. */

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Pure date-math core of dosing-calculator.ts's daysUntilNextVisit -- given today's ISO
 * weekday (Mon=1..Sun=7) and every weekday this body is regularly serviced on (a body can
 * be on more than one route), returns days until the soonest upcoming occurrence (1-7), or
 * null if given no weekdays at all. */
export function daysUntilNextWeekday(todayIso: number, scheduledWeekdays: number[]): number | null {
  if (scheduledWeekdays.length === 0) return null;
  const distances = scheduledWeekdays.map((d) => {
    const diff = (d - todayIso + 7) % 7;
    // A route day of "today" means next week's occurrence (7 days), not 0 -- this runs
    // while today's own visit is being logged, so the gap that matters is until the
    // *next* one, not a zero-day gap to itself.
    return diff === 0 ? 7 : diff;
  });
  return Math.min(...distances);
}

export type TabletRecommendation = {
  /** ppm the feeder has to replace across the interval: demand x days. */
  intervalPpm: number;
  /** Unrounded tablets covering intervalPpm -- what the note quotes, so the rounding is visible. */
  intervalTablets: number;
  /** What the technician is actually handed: intervalTablets rounded, never below 1. */
  totalTablets: number;
  daysUntilNextVisit: number;
  demandPpmPerDay: number;
};

/**
 * What to stock the feeder with to cover the interval to the next visit.
 *
 * This used to carry a second component as well: today's measured deficit converted to
 * tablets, so a pool at 1 ppm against a 5 ppm target was told to add 3.3 tablets "to correct
 * today's reading". That component was fiction, and the operator said so -- a puck dissolves
 * over days, so no number of them raises free chlorine this afternoon. The file already made
 * the same argument against itself: dosing-calculator.ts's in-range-but-fading branch
 * deliberately gives advice with no tablet count at all, on the grounds that "more tablets is
 * the one thing that cannot fix this". Both branches now agree. A pool that is short TODAY
 * needs liquid today, which the note says in words rather than as a second dose the technician
 * could add on top of this one (see the two-doses note in dosing-calculator.ts).
 *
 * So one component, sized from this pool's own measured demand rather than a published ratio:
 * the chemistry constant is the same Taylor figure used for granular Trichlor 90%, since a
 * tablet and the granular are the same chemical at the same concentration.
 *
 * `demandPpmPerDay` is ppm the feeder must REPLACE each day, which is the caller's job to
 * derive and not the same thing as this pool's decay constant. Chlorine decays proportionally
 * (see lib/chlorine-demand.ts), so a pool losing k of its chlorine daily while held at L ppm
 * consumes k x L ppm/day. Passing a bare decay constant here would under-stock the feeder by
 * whatever factor L is -- five-fold on a pool held at 5 ppm.
 *
 * Returns null rather than a number when there is nothing to project from -- no next visit on
 * the schedule, no volume on file, no demand. The caller says so instead of printing a figure
 * it cannot stand behind.
 */
export function computeTabletRecommendation(params: {
  volumeGallons: number;
  demandPpmPerDay: number;
  daysUntilNextVisit: number | null;
  dosingConstant: number;
}): TabletRecommendation | null {
  const { volumeGallons, demandPpmPerDay, daysUntilNextVisit, dosingConstant } = params;
  if (daysUntilNextVisit == null || !(daysUntilNextVisit > 0)) return null;
  if (!(volumeGallons > 0) || !(demandPpmPerDay > 0) || !(dosingConstant > 0)) return null;

  const intervalPpm = demandPpmPerDay * daysUntilNextVisit;
  const intervalTablets = (dosingConstant * intervalPpm * (volumeGallons / 10_000)) / TABLET_WEIGHT_OZ;

  return {
    intervalPpm,
    intervalTablets,
    // Rounded UP, with a floor of 1. A feeder is a reservoir, not a one-shot dose: a spare puck
    // sitting in it costs nothing, while a feeder that runs dry on day six is the failure
    // lib/chlorine-demand.ts was written to fix -- 46.4% of chlorinated pools came back under
    // the minimum. Rounding to nearest would have turned a measured 1.29 tablets into 1 and
    // left the feeder 22% short, which is the same under-dosing in a new place. Half a puck is
    // not something a technician can carry out either way.
    totalTablets: Math.max(1, Math.ceil(intervalTablets)),
    daysUntilNextVisit,
    demandPpmPerDay,
  };
}

/**
 * Assembles the tablet recommendation's note. Both precision caveats (tablet weight, CYA
 * buildup) are stated directly rather than left implicit, and the demand the figure rests on
 * is quoted with its sample size, because a technician who can see where a number came from
 * can tell when it does not match the pool in front of them.
 *
 * `shortToday` is the case the old note got wrong: free chlorine below the minimum right now.
 * It leads, because what to do about it is not "add these tablets".
 *
 * No general "use your own judgement" line here -- the Dosing Card states that once for every
 * recommendation on it, which is better than each note repeating it at a technician standing
 * in the sun.
 */
export function buildTabletNote(
  t: TabletRecommendation,
  opts: { holder?: "feeder" | "floater"; demandSource?: "measured" | "default"; sampleSize?: number; shortToday?: boolean } = {},
): string {
  const holder = opts.holder ?? "feeder";
  const days = `${t.daysUntilNextVisit} day${t.daysUntilNextVisit === 1 ? "" : "s"}`;

  const basis =
    opts.demandSource === "measured" && opts.sampleSize
      ? `Held at target, this pool gets through about ${roundOneDecimal(t.demandPpmPerDay)} ppm a day, from its own last ${opts.sampleSize} service interval${opts.sampleSize === 1 ? "" : "s"}.`
      : `There isn't enough history on this pool to measure its demand, so this assumes about ${roundOneDecimal(t.demandPpmPerDay)} ppm a day at target.`;

  // Below half a tablet the figure IS the floor of 1, not a calculation, and saying "1 tablet
  // covers the 2 days" would claim a precision it does not have -- on a 1,588 gal spa over two
  // days the real answer is four hundredths of a puck.
  const amount =
    t.intervalTablets < 0.5
      ? `${formatDose(t.totalTablets, "TABLET")} is the practical minimum -- the ${days} to the next visit need less than half of one.`
      : `${formatDose(t.totalTablets, "TABLET")} ${t.totalTablets === 1 ? "covers" : "cover"} the ${days} to the next visit.`;

  return [
    opts.shortToday
      ? `Free chlorine is below the minimum now, and tablets will not raise it today -- a puck dissolves over days. Chlorinate with liquid now, then stock the ${holder} to hold it.`
      : null,
    amount,
    basis,
    `Assumes a standard ${TABLET_WEIGHT_OZ} oz 3" tablet (some brands run closer to 7 oz -- check your product's label).`,
    "Each dissolved tablet adds roughly 3 ppm of CYA per 10,000 gal -- watch cumulative stabilizer levels against your state's compliance max.",
  ]
    .filter(Boolean)
    .join(" ");
}
