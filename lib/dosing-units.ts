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

export function formatDose(amount: number, unit: DosingUnit): string {
  return unit === "FL_OZ" ? formatLiquidOz(amount) : formatWeightOz(amount);
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

/**
 * Converts a raw dosing amount (in OZ or FL_OZ) into an org's free-text billing unit --
 * e.g. the org's ChemicalProduct.unit, which is arbitrary text like "gal", "lb", "tablet".
 * Returns null for anything unrecognized (never guess -- "tablet" isn't a weight or
 * volume, there's no honest conversion from a Taylor oz/fl-oz figure to a tablet count).
 * Case-insensitive, trimmed match. Result rounded to 2 decimals -- this feeds an editable
 * quantity field the technician can still adjust, not a final unreviewed persisted value.
 */
export function convertToBillingUnit(amount: number, dosingUnit: DosingUnit, billingUnit: string): number | null {
  const key = billingUnit.trim().toLowerCase();
  const table = dosingUnit === "OZ" ? WEIGHT_UNIT_TO_OZ : LIQUID_UNIT_TO_FLOZ;
  const factor = table[key];
  if (factor == null) return null;
  return Math.round((amount / factor) * 100) / 100;
}
