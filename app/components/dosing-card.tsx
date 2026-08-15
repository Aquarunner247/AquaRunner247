"use client";

import { useState } from "react";
import type { DosingResult, DosingBillingLink, PhRangeStatus } from "@/lib/dosing-calculator";
import type { DosingUnit } from "@/generated/prisma/enums";

type BromineStatus = { current: number; min: number | null; max: number | null } | null;

/** Applies a computed dose to the visit's own dose log. Returns whether it succeeded, so
 * the button can show a brief confirmation without owning any dose-list state itself --
 * that state lives in the parent visit form, which already had it before this feature. */
type ApplyDose = (opts: { chemicalProductId: string; quantity: number }) => Promise<boolean>;

/** Called when there's no direct-apply path (unlinked, or linked to a billing product
 * whose unit doesn't auto-convert) -- opens/scrolls to the manual "Chemical Doses" form and
 * pre-fills what it can: the product (if linked, even without a usable unit) and, once a
 * product is selected, the quantity via the same conversion the direct-apply path uses. */
type PrefillDoseForm = (opts: { chemicalProductId: string | null; rawAmount: number; dosingUnit: DosingUnit }) => void;

type Props = {
  visitId: string;
  dosing: DosingResult | null;
  /** Independent of `dosing` -- bromine never gets a computed recommendation (Taylor's
   * own materials say to follow the sanitizer manufacturer's label, not a chart), so this
   * is just whether the current bromine reading is outside this state's bounds. Null when
   * bromine wasn't read this visit or this body of water doesn't use bromine. */
  bromineStatus: BromineStatus;
  onApplyDose: ApplyDose;
  onPrefillDoseForm: PrefillDoseForm;
};

/**
 * Recommended Dosing card. Renders nothing when there is nothing to show at all (no
 * reading yet, every chemical in range, and no bromine flag) rather than an empty card.
 * pH is handled separately from `dosing.recommendations` -- see PhDemandPrompt below --
 * since it has no computed value until a technician performs an actual titration. Unlike
 * the other chemicals, `phStatus` is resolved server-side (same target-resolution logic as
 * everything else) so the prompt only appears when pH is actually out of range, instead of
 * a generic always-there button the technician has to notice and open themselves.
 */
export function DosingCard({ visitId, dosing, bromineStatus, onApplyDose, onPrefillDoseForm }: Props) {
  const phStatus = dosing?.phStatus ?? null;
  const nothingToShow =
    (!dosing || (dosing.recommendations.length === 0 && dosing.warnings.length === 0)) && !bromineStatus && !phStatus;
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
                {r.rawAmount != null && r.dosingUnit != null ? (
                  <ApplyButton
                    rawAmount={r.rawAmount}
                    dosingUnit={r.dosingUnit}
                    billingLink={r.billingLink}
                    onApplyDose={onApplyDose}
                    onPrefillDoseForm={onPrefillDoseForm}
                  />
                ) : null}
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-brand-warn">{r.note}</p>
            )}
          </li>
        ))}

        {dosing && dosing.recommendations.length === 0 && !phStatus && !bromineStatus ? (
          <p className="text-sm text-brand-muted">Every reading is within target range.</p>
        ) : null}

        {phStatus ? <PhDemandPrompt visitId={visitId} phStatus={phStatus} onApplyDose={onApplyDose} onPrefillDoseForm={onPrefillDoseForm} /> : null}

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
 * One button, two behaviors depending on whether the computed dose has a usable link to
 * the org's own billing catalog:
 * - linked AND convertible -- applies immediately (POSTs the converted quantity as a
 *   logged dose) and shows a brief confirmation.
 * - otherwise -- defers to the manual "Chemical Doses" form instead of guessing: opens/
 *   scrolls to it and pre-fills whatever it can (see PrefillDoseForm's doc comment).
 * Same component serves both the ppm-based recommendations above and the pH demand-test
 * result below -- one mechanism, not two parallel implementations.
 */
function ApplyButton({
  rawAmount,
  dosingUnit,
  billingLink,
  onApplyDose,
  onPrefillDoseForm,
}: {
  rawAmount: number;
  dosingUnit: DosingUnit;
  billingLink: DosingBillingLink | null;
  onApplyDose: ApplyDose;
  onPrefillDoseForm: PrefillDoseForm;
}) {
  const [state, setState] = useState<"idle" | "applying" | "applied">("idle");

  async function handleClick() {
    if (billingLink && billingLink.convertedQuantity != null) {
      setState("applying");
      const ok = await onApplyDose({ chemicalProductId: billingLink.chemicalProductId, quantity: billingLink.convertedQuantity });
      if (ok) {
        setState("applied");
        setTimeout(() => setState("idle"), 2500);
      } else {
        setState("idle");
      }
      return;
    }
    onPrefillDoseForm({ chemicalProductId: billingLink?.chemicalProductId ?? null, rawAmount, dosingUnit });
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={state === "applying"}
      className="app-btn-secondary-sm mt-1.5 min-h-[44px]"
    >
      {state === "applied" ? "Added ✓" : state === "applying" ? "Adding…" : "Add to visit"}
    </button>
  );
}

/**
 * pH has no ppm-delta dose -- only Taylor's Base/Acid Demand titration produces one. Only
 * rendered by the parent when `dosing.phStatus` is non-null, i.e. pH is actually out of
 * range (resolved server-side, same target-resolution logic as every other chemical) --
 * direction (Raise/Lower) comes from that resolved status, not a manual toggle, since it's
 * fully determined by whether the reading is below or above target.
 */
function PhDemandPrompt({
  visitId,
  phStatus,
  onApplyDose,
  onPrefillDoseForm,
}: {
  visitId: string;
  phStatus: PhRangeStatus;
  onApplyDose: ApplyDose;
  onPrefillDoseForm: PrefillDoseForm;
}) {
  const [drops, setDrops] = useState("");
  const [result, setResult] = useState<{
    productName: string;
    formattedDose: string;
    rawAmount: number;
    dosingUnit: DosingUnit;
    billingLink: DosingBillingLink | null;
  } | null>(null);
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
        body: JSON.stringify({ drops: dropsNum, direction: phStatus.direction }),
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
        setResult({
          productName: data.productName,
          formattedDose: data.formattedDose,
          rawAmount: data.rawAmount,
          dosingUnit: data.dosingUnit,
          billingLink: data.billingLink ?? null,
        });
      }
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  }

  const testName = phStatus.direction === "RAISE" ? "Base Demand" : "Acid Demand";

  return (
    <li className="rounded-lg border border-brand-warn/30 bg-brand-warnFill p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand-ink">pH</span>
        <span className="app-metric text-xs text-brand-muted">
          {phStatus.currentValue} → {phStatus.targetValue}
          {phStatus.targetMin != null && phStatus.targetMax != null ? ` (target ${phStatus.targetMin}–${phStatus.targetMax})` : ""}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-brand-warn">
        pH is {phStatus.direction === "RAISE" ? "low" : "high"} — run a {testName} test, then enter the drop count for an exact dose.
      </p>

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
          <ApplyButton
            rawAmount={result.rawAmount}
            dosingUnit={result.dosingUnit}
            billingLink={result.billingLink}
            onApplyDose={onApplyDose}
            onPrefillDoseForm={onPrefillDoseForm}
          />
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-brand-danger">{error}</p> : null}
    </li>
  );
}
