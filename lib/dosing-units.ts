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

/** Standard starting-point ratio manufacturers publish for sizing a 3" trichlor feeder --
 * roughly one tablet sustains 10,000 gallons for about a week under normal bather load.
 * A heuristic, not a Taylor-table figure like every other dosingConstant in
 * dosing-calculator.ts -- every source that publishes it also says to adjust from actual
 * test results, which is why it's surfaced as its own labeled component in the note
 * (buildTabletNote) instead of folded silently into one opaque number. */
const TABLET_MAINTENANCE_GALLONS_PER_WEEK = 10_000;

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
  immediateTablets: number;
  maintenanceTablets: number;
  totalTablets: number;
  daysUntilNextVisit: number | null;
};

/** Tablet-feeder equivalent of the ppm-delta dose computed for every other product in
 * dosing-calculator.ts. Two components, kept separate rather than blended into one number:
 *  - immediateTablets: today's actual measured deficit, converted with the SAME
 *    Taylor-sourced dosing constant used for granular Trichlor 90% (tablet and granular
 *    are the same chemical at the same concentration) -- exact chemistry, not a guess.
 *  - maintenanceTablets: a heuristic projection (TABLET_MAINTENANCE_GALLONS_PER_WEEK) for
 *    keeping the feeder stocked until the next scheduled visit -- 0 when
 *    daysUntilNextVisit is null (no recurring schedule found for this body).
 * Never returns 0 total once called -- callers only call this when FC is confirmed low.
 */
export function computeTabletRecommendation(
  volumeGallons: number,
  currentPpm: number,
  targetPpm: number,
  daysUntilNextVisit: number | null,
  dosingConstant: number,
): TabletRecommendation {
  const immediateOz = dosingConstant * Math.max(0, targetPpm - currentPpm) * (volumeGallons / 10_000);
  const immediateTablets = immediateOz / TABLET_WEIGHT_OZ;
  const maintenanceTablets =
    daysUntilNextVisit != null ? (volumeGallons / TABLET_MAINTENANCE_GALLONS_PER_WEEK) * (daysUntilNextVisit / 7) : 0;
  return {
    immediateTablets,
    maintenanceTablets,
    totalTablets: Math.max(1, Math.round(immediateTablets + maintenanceTablets)),
    daysUntilNextVisit,
  };
}

/** Assembles the tablet recommendation's note -- both precision caveats (tablet weight,
 * CYA buildup) stated directly rather than left implicit, per this feature's whole reason
 * for existing as a heuristic-flagged estimate instead of an exact Taylor-table dose. */
export function buildTabletNote(t: TabletRecommendation): string {
  const breakdown =
    t.daysUntilNextVisit != null
      ? `Roughly ${roundOneDecimal(t.immediateTablets)} tablet(s) to correct today's reading, plus ${roundOneDecimal(t.maintenanceTablets)} to keep the feeder stocked for the ${t.daysUntilNextVisit} day${t.daysUntilNextVisit === 1 ? "" : "s"} until the next visit.`
      : "Covers only today's correction -- no recurring schedule found for this body, so a maintenance amount couldn't be projected.";
  return [
    breakdown,
    `Assumes a standard ${TABLET_WEIGHT_OZ} oz 3" tablet (some brands run closer to 7 oz -- check your product's label).`,
    "Each dissolved tablet adds roughly 3 ppm of CYA per 10,000 gal -- watch cumulative stabilizer levels against your state's compliance max.",
  ].join(" ");
}
