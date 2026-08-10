"use client";

import type { DosingResult } from "@/lib/dosing-calculator";

type Props = {
  dosing: DosingResult | null;
};

const DOSING_UNIT_LABELS: Record<string, string> = {
  OZ: "oz",
  LB: "lb",
  GAL: "gal",
  QUART: "qt",
  TABLET: "tablet",
  SCOOP: "scoop",
  TSP: "tsp",
  TBSP: "tbsp",
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Display-only friendly conversion alongside the precise dose -- never instead of it,
 * since the exact number is what a tech actually measures out. Fluid-ounce-to-volume
 * (cups/quarts/gallons) only applies to LIQUID products, where oz is a real volume unit;
 * for GRANULAR/TABLET/PUCK products oz is a weight, so the only safe extra conversion is
 * the exact oz<->lb relationship -- converting dry weight to cups would assume a bulk
 * density this app doesn't have, which would be a fabricated number, not a real one.
 */
function friendlyConversion(amount: number, unit: string, form: string | null): string | null {
  if (unit === "OZ" && form === "LIQUID") {
    if (amount >= 128) return `≈${round1(amount / 128)} gal`;
    if (amount >= 32) return `≈${round1(amount / 32)} qt`;
    if (amount >= 8) {
      const cups = round1(amount / 8);
      return `≈${cups} cup${cups === 1 ? "" : "s"}`;
    }
  }
  if (unit === "OZ" && (form === "GRANULAR" || form === "TABLET" || form === "PUCK") && amount >= 16) {
    return `≈${round1(amount / 16)} lb`;
  }
  return null;
}

/**
 * Recommended Dosing card -- dosing-calculator-spec.md Sections 3/4. Renders nothing when
 * there's nothing to show (no reading yet, or every chemical is in range), rather than an
 * empty card. Every row here is by definition a reading currently out of range, so status
 * tokens are used throughout (never brand-cta/brand-accent) per the design system's
 * reserved-status-color rule.
 */
export function DosingCard({ dosing }: Props) {
  if (!dosing || (dosing.recommendations.length === 0 && dosing.warnings.length === 0)) return null;

  return (
    <div className="app-card">
      <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">
        Recommended Dosing
      </h2>

      {dosing.warnings.length > 0 ? (
        <div className="mt-3 space-y-1.5 rounded-lg border border-brand-anchor/30 bg-brand-anchor/10 p-3">
          {dosing.warnings.map((w, i) => (
            <p key={i} className="text-sm text-brand-ink">
              {w}
            </p>
          ))}
        </div>
      ) : null}

      {dosing.recommendations.length === 0 ? (
        <p className="mt-3 text-sm text-brand-muted">Every reading is within target range.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {dosing.recommendations.map((r) => {
            const friendly =
              r.recommendedDose != null && r.dosingUnit ? friendlyConversion(r.recommendedDose, r.dosingUnit, r.productForm) : null;
            return (
              <li
                key={r.chemicalKey}
                className={`rounded-lg border p-3 ${
                  r.actionRequired ? "border-brand-danger/30 bg-brand-dangerFill" : "border-brand-warn/30 bg-brand-warnFill"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-brand-ink">{r.label}</span>
                  <span className="app-metric text-xs text-brand-muted">
                    {r.currentValue} → {r.targetValue}
                    {r.targetMin != null && r.targetMax != null ? ` (target ${r.targetMin}–${r.targetMax})` : ""}
                  </span>
                </div>

                {r.actionRequired === "DILUTION" ? (
                  <p className="mt-1.5 text-sm text-brand-danger">{r.note}</p>
                ) : r.productName ? (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-brand-ink">{r.productName}</p>
                      <p className="app-metric text-sm text-brand-ink">
                        {r.recommendedDose} {r.dosingUnit ? DOSING_UNIT_LABELS[r.dosingUnit] ?? r.dosingUnit.toLowerCase() : ""}
                        {friendly ? <span className="ml-1 text-brand-muted">({friendly})</span> : null}
                      </p>
                    </div>
                    {r.capped ? <span className="app-pill-attention">Max dose — recheck next visit</span> : null}
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-brand-warn">{r.note}</p>
                )}

                {!r.actionRequired && r.note && r.productName ? <p className="mt-1.5 text-xs text-brand-muted">{r.note}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
