/**
 * Sanity bounds for each numeric reading field -- guards against an absurd value (e.g. a
 * technician typing "74" for pH instead of "7.4", missing the decimal point) reaching the
 * database at all, not a representation of any state's actual regulatory ideal range (that's
 * ReadingFieldSpec's zoneMin/zoneMax, computed per-org from ComplianceRuleset in
 * lib/compliance.ts -- a reading outside THAT band is still valid, just flagged). Shared by
 * both visit forms and the reading-save API route so client and server can never drift out
 * of agreement -- client-side rejection alone is only a UX nicety; the API route enforcing
 * the same table is what actually keeps bad data out of dosing recommendations and
 * customer-facing service summaries.
 *
 * pH's bounds are the true 0-14 scale ceiling/floor, not a "typical pool" range -- a
 * genuinely corrosive or scaling reading outside the normal 7.2-7.8 zone is exactly the kind
 * of value that must still be recordable, just never a value the pH scale itself can't
 * produce.
 */
export const READING_BOUNDS: Record<string, { min: number; max: number; step: number }> = {
  freeChlorinePpm: { min: 0, max: 30, step: 0.5 },
  brominePpm: { min: 0, max: 30, step: 0.5 },
  ph: { min: 0, max: 14, step: 0.1 },
  alkalinityPpm: { min: 0, max: 300, step: 1 },
  cyanuricAcidPpm: { min: 0, max: 150, step: 1 },
  calciumHardnessPpm: { min: 0, max: 1000, step: 10 },
  saltPpm: { min: 0, max: 6000, step: 50 },
  temperatureF: { min: 32, max: 110, step: 1 },
  pumpPressurePsi: { min: 0, max: 60, step: 1 },
  vacGaugeReading: { min: -30, max: 0, step: 1 },
  filterPressurePsi: { min: 0, max: 60, step: 1 },
  // 300, not 150 -- a large commercial system's real flow rate legitimately lands in the
  // 150-200 GPM range (turnover-rate requirements scale with pool volume). 150 as the
  // ceiling was rejecting genuine, repeated readings at multiple commercial properties in
  // production, not catching typos.
  flowMeterGpm: { min: 0, max: 300, step: 1 },
};

/** True when `key` has no configured bound (nothing to check) or `value` falls within it. */
export function isWithinReadingBounds(key: string, value: number): boolean {
  const bounds = READING_BOUNDS[key];
  if (!bounds) return true;
  return value >= bounds.min && value <= bounds.max;
}
