"use client";

import { useState } from "react";
import type { DosingResult, DosingBasis, DosingBillingLink, PhRangeStatus } from "@/lib/dosing-calculator";
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
  // Both optional on purpose: recommendations persisted before 2026-11-22 carry neither, and a
  // completed visit's card is a point-in-time record that is never recomputed.
  const basis = dosing?.basis ?? null;
  const chlorineSystemNote = dosing?.chlorineSystemNote ?? null;
  const nothingToShow =
    (!dosing || (dosing.recommendations.length === 0 && dosing.warnings.length === 0)) &&
    !bromineStatus &&
    !phStatus &&
    !chlorineSystemNote;
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
                {/* The note sits ABOVE the Apply button on purpose: it is what the dose is
                    sized to last and where it falls short, which is worth reading before
                    tapping rather than after. */}
                {r.note ? <p className="mt-1.5 text-sm text-brand-ink">{r.note}</p> : null}
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
              /* No dose to give -- the note IS the recommendation here ("no product
                 configured", "partial drain and refill"), so it keeps the warn colour. */
              <p className="mt-1.5 text-sm text-brand-warn">{r.note}</p>
            )}
          </li>
        ))}

        {dosing && dosing.recommendations.length === 0 && !phStatus && !bromineStatus && !chlorineSystemNote ? (
          <p className="text-sm text-brand-muted">Every reading is within target range.</p>
        ) : null}

        {/* Not a recommendation and deliberately not styled like one: there is nothing to dose.
            It is here because "no dose" on an automation body means the equipment is holding the
            level, which a technician cannot tell apart from a card that computed nothing.
            brand-ink rather than brand-muted because this sits on brand-foam -- 14px muted text
            on foam is the combination this app's outdoor-legibility rule rules out. */}
        {chlorineSystemNote ? (
          <li className="rounded-lg border border-brand-border bg-brand-foam p-3">
            <p className="text-sm text-brand-ink">{chlorineSystemNote}</p>
          </li>
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

      {basis ? <BasisLine basis={basis} /> : null}

      {/* ONE judgement line for the whole card, not per recommendation.
          Asked for by the operator (2026-11-17) in the same breath as the tablet fix: every
          figure here is arithmetic over the readings a technician typed and this body's own
          service history, and none of it can see the pool they are standing in front of. The
          notes above used to each end with a version of this sentence; stating it once covers
          the pH prompt and the bromine advisory too, which those notes never reached.
          text-sm, not text-xs: this is meant to be read, on a phone, outdoors. brand-muted is
          legible here because .app-card is white -- it would not be on brand-foam. */}
      <p className="mt-3 border-t border-brand-border pt-3 text-sm text-brand-muted">
        These are estimates, worked out from the readings you entered and this pool&rsquo;s own service history. They
        can&rsquo;t see a heavy weekend, a heat spike, a storm, or anything you know about this body of water that the log
        doesn&rsquo;t. Use your own judgement — adjust or skip any of it when what&rsquo;s in front of you says otherwise.
      </p>
    </div>
  );
}

/**
 * What the targets on this card are, and in whose name.
 *
 * The operator's requirement, 2026-11-22: a company on its first week should be recommended what
 * gets and keeps it compliant with its own state, today, and the card should SAY that rather than
 * leave it to be inferred from a number. So this line names the state and says how far ahead the
 * figures above it look -- which is the one thing the card could not previously be read to tell
 * you, since a dose sized to last until Friday and a dose sized to be correct now look identical
 * once they are a number of ounces.
 *
 * Three states, and the third is the one that matters most to get right: with no supported
 * ruleset the targets came from whatever the org configured for itself, and claiming a state
 * behind them would be the only untrue sentence on the screen.
 *
 * Sits above the judgement line, not below it: this is what the numbers ARE, and that is what
 * they cannot see. Read in that order.
 */
function BasisLine({ basis }: { basis: DosingBasis }) {
  const text = basis.stateName
    ? basis.smartDosing
      ? `Targets are ${basis.stateName}\u2019s required ranges. Chlorine is also sized to still be above the minimum at the next visit, measured from this pool\u2019s own service history.`
      : `Targets are ${basis.stateName}\u2019s required ranges, and the doses above are sized to put this water inside them today \u2014 nothing here projects past this visit.`
    : "No state compliance rules are linked to this account, so these targets are the ones your company configured for itself.";

  return <p className="mt-3 border-t border-brand-border pt-3 text-sm text-brand-muted">{text}</p>;
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
 * Turns a /ph-dose failure into something a technician can act on, or at least report.
 *
 * The old version mapped two codes and dropped everything else into "Couldn't calculate a dose",
 * which named no cause and no next step -- so a real failure was indistinguishable from a network
 * blip. It also reported a misconfigured product as "no gallons set", which sent a technician to
 * check a volume that was already correct.
 */
function phDoseErrorMessage(data: { error?: string; productName?: string }): string {
  switch (data.error) {
    case "NO_PRODUCT_CONFIGURED":
      return "No pH product is enabled — an admin needs to enable one under Settings › Chemicals.";
    case "NO_VOLUME_CONFIGURED":
      return "This body of water has no gallons set — add one below, then calculate again.";
    case "PRODUCT_MISCONFIGURED":
      return `${data.productName ?? "The pH product"} has no dosing strength set, so a dose can't be worked out. An admin needs to fix it under Settings › Chemicals.`;
    case "INVALID_INPUT":
      return "That drop count didn't come through — enter a whole number of drops and try again.";
    case "FORBIDDEN":
    case "NOT_FOUND":
      return "This visit isn't available on your account any more — reload the page.";
    default:
      // Names the code so it can be reported and chased, instead of vanishing.
      return `Couldn't calculate a dose${data.error ? ` (${data.error})` : ""} — dose it by your own reading and tell the office.`;
  }
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
        setError(phDoseErrorMessage(data));
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
            className="app-field-sm h-11 w-20 text-base"
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
