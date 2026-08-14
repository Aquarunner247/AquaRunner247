"use client";

import { useState } from "react";
import type { DosingResult } from "@/lib/dosing-calculator";

type BromineStatus = { current: number; min: number | null; max: number | null } | null;

type Props = {
  visitId: string;
  dosing: DosingResult | null;
  /** Independent of `dosing` -- bromine never gets a computed recommendation (Taylor's
   * own materials say to follow the sanitizer manufacturer's label, not a chart), so this
   * is just whether the current bromine reading is outside this state's bounds. Null when
   * bromine wasn't read this visit or this body of water doesn't use bromine. */
  bromineStatus: BromineStatus;
};

/**
 * Recommended Dosing card. Renders nothing when there is nothing to show at all (no
 * reading yet, every chemical in range, and no bromine flag) rather than an empty card.
 * pH is handled separately from `dosing.recommendations` -- see PhDemandPrompt below --
 * since it has no computed value until a technician performs an actual titration.
 */
export function DosingCard({ visitId, dosing, bromineStatus }: Props) {
  const hasPhPrompt = dosing != null; // pH prompt only makes sense once a reading exists at all; PhDemandPrompt itself checks range
  const nothingToShow =
    (!dosing || (dosing.recommendations.length === 0 && dosing.warnings.length === 0)) && !bromineStatus && !hasPhPrompt;
  if (nothingToShow) return null;

  return (
    <div className="app-card">
      <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">
        Recommended Dosing
      </h2>

      {dosing && dosing.warnings.length > 0 ? (
        <div className="mt-3 space-y-1.5 rounded-lg border border-brand-anchor/30 bg-brand-foam p-3">
          {dosing.warnings.map((w, i) => (
            <p key={i} className="text-sm text-brand-ink">
              {w}
            </p>
          ))}
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {dosing?.recommendations.map((r) => (
          <li key={r.chemicalKey} className="rounded-lg border border-brand-warn/30 bg-brand-warnFill p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-brand-ink">{r.label}</span>
              <span className="app-metric text-xs text-brand-muted">
                {r.currentValue} → {r.targetValue}
                {r.targetMin != null && r.targetMax != null ? ` (target ${r.targetMin}–${r.targetMax})` : ""}
              </span>
            </div>
            {r.productName && r.formattedDose ? (
              <div className="mt-1.5">
                <p className="text-sm font-medium text-brand-ink">{r.productName}</p>
                <p className="app-metric text-sm text-brand-ink">{r.formattedDose}</p>
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-brand-warn">{r.note}</p>
            )}
          </li>
        ))}

        {dosing && dosing.recommendations.length === 0 && !hasPhPrompt && !bromineStatus ? (
          <p className="text-sm text-brand-muted">Every reading is within target range.</p>
        ) : null}

        <PhDemandPrompt visitId={visitId} />

        {bromineStatus ? (
          <li className="rounded-lg border border-brand-warn/30 bg-brand-warnFill p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-brand-ink">Bromine</span>
              <span className="app-metric text-xs text-brand-muted">
                {bromineStatus.current}
                {bromineStatus.min != null && bromineStatus.max != null ? ` (target ${bromineStatus.min}–${bromineStatus.max})` : ""}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-brand-warn">
              Bromine is {bromineStatus.max != null && bromineStatus.current > bromineStatus.max ? "high" : "low"} — adjust per your
              product&rsquo;s label. There&rsquo;s no universal dosing chart for bromine; product strength varies by brand.
            </p>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * pH has no ppm-delta dose -- only Taylor's Base/Acid Demand titration produces one. This
 * always renders when a reading exists (its parent gates on that); it self-determines
 * whether pH is actually out of range from `dosing.recommendations`... except pH is
 * deliberately never IN that array (see lib/dosing-calculator.ts). So instead this reads
 * the pH out-of-range signal the same way the rest of the visit form already does --
 * simplest correct approach here is to always offer the prompt once a body of water has a
 * reading, since a demand test is harmless to run even if pH turns out to be in range
 * (the tech just wouldn't bother). Kept minimal rather than duplicating target-resolution
 * logic client-side just to decide whether to show a button.
 */
function PhDemandPrompt({ visitId }: { visitId: string }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"RAISE" | "LOWER">("LOWER");
  const [drops, setDrops] = useState("");
  const [result, setResult] = useState<{ productName: string; formattedDose: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    const dropsNum = Number(drops);
    if (!Number.isFinite(dropsNum) || dropsNum <= 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/visits/${visitId}/ph-dose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drops: dropsNum, direction }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "NO_PRODUCT_CONFIGURED"
            ? "No enabled pH product configured — set one on the Chemicals admin page."
            : data.error === "NO_VOLUME_CONFIGURED"
              ? "This body of water has no gallons set — add one before calculating a dose."
              : "Couldn't calculate a dose.",
        );
      } else {
        setResult({ productName: data.productName, formattedDose: data.formattedDose });
      }
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <li>
        <button type="button" onClick={() => setOpen(true)} className="app-btn-secondary-sm min-h-[44px]">
          pH out of range? Run a demand test
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-brand-anchor/30 bg-brand-foam p-3">
      <p className="text-sm font-semibold text-brand-ink">pH Demand Test</p>
      <p className="mt-1 text-xs text-brand-muted">
        Taylor&rsquo;s dosing chart requires an actual titration — there&rsquo;s no formula from the pH reading alone. Run a Base Demand
        test (to raise pH) or an Acid Demand test (to lower it), then enter the drop count.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-brand-ink">
          <input type="radio" name={`ph-direction-${visitId}`} checked={direction === "LOWER"} onChange={() => setDirection("LOWER")} />
          Lower (Acid Demand)
        </label>
        <label className="flex items-center gap-1.5 text-sm text-brand-ink">
          <input type="radio" name={`ph-direction-${visitId}`} checked={direction === "RAISE"} onChange={() => setDirection("RAISE")} />
          Raise (Base Demand)
        </label>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-brand-ink">
          Drops
          <input
            type="number"
            min="1"
            step="1"
            value={drops}
            onChange={(e) => setDrops(e.target.value)}
            className="h-11 w-20 rounded border border-brand-control px-2 text-base"
          />
        </label>
        <button type="button" onClick={calculate} disabled={loading || !drops} className="app-btn-primary-sm min-h-[44px]">
          {loading ? "Calculating…" : "Calculate dose"}
        </button>
      </div>

      {result ? (
        <div className="mt-2">
          <p className="text-sm font-medium text-brand-ink">{result.productName}</p>
          <p className="app-metric text-sm text-brand-ink">{result.formattedDose}</p>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-brand-danger">{error}</p> : null}
    </li>
  );
}
