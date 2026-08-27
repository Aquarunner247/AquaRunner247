import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { SimpleMarkdown } from "@/lib/simple-markdown";

type PageProps = {
  params: Promise<{ state: string }>;
};

function fmtNum(v: unknown): string | null {
  return v == null ? null : Number(v).toString();
}

/** e.g. minValue=1, idealMin=1, idealMax=3, maxValue=5 -> "1 – [1–3] – 5 ppm" */
function rangeLabel(t: { minValue: unknown; idealMin: unknown; idealMax: unknown; maxValue: unknown; unit: string | null }): string {
  const min = fmtNum(t.minValue);
  const idealMin = fmtNum(t.idealMin);
  const idealMax = fmtNum(t.idealMax);
  const max = fmtNum(t.maxValue);
  const parts: string[] = [];
  if (min != null) parts.push(`min ${min}`);
  if (idealMin != null || idealMax != null) parts.push(`ideal ${idealMin ?? "?"}–${idealMax ?? "?"}`);
  if (max != null) parts.push(`max ${max}`);
  if (parts.length === 0) return "no flat range";
  return parts.join(" · ") + (t.unit ? ` ${t.unit}` : "");
}

const CONFIDENCE_STYLES: Record<string, string> = {
  confirmed: "app-pill-good",
  assumption: "app-pill-attention",
  conflict: "app-pill-danger",
  gap: "app-pill-inactive",
};

function ConfidenceBadge({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className={CONFIDENCE_STYLES[value] ?? "app-pill-inactive"}>
      {value}
    </span>
  );
}

export default async function ComplianceStatePreviewPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const { state } = await params;

  const ruleset = await prisma.complianceRuleset.findUnique({
    where: { state: state.toUpperCase() },
    include: {
      chemistryThresholds: { orderBy: [{ parameter: "asc" }, { bodyOfWaterCategory: "asc" }] },
      frequencyRules: { orderBy: [{ parameter: "asc" }, { bodyOfWaterCategory: "asc" }] },
      eventProtocols: { orderBy: { triggerType: "asc" } },
      complianceNotes: { orderBy: { kind: "asc" } },
    },
  });

  if (!ruleset) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <Link href="/platform-admin/compliance" className="text-sm text-brand-primary underline">
        ← All states
      </Link>

      <header className="mt-3 border-b border-brand-border pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Platform · Compliance preview</p>
          {ruleset.isSupported ? (
            <span className="app-pill-good">Live</span>
          ) : (
            <span className="app-pill-inactive">Preview only — not gating any account</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-brand-ink">
          {ruleset.stateName} ({ruleset.state})
        </h1>
        {ruleset.healthDepartmentName ? <p className="mt-1 text-sm text-brand-muted">{ruleset.healthDepartmentName}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-muted">
          {ruleset.jurisdictionLevel ? <span>Jurisdiction: {ruleset.jurisdictionLevel}{ruleset.countyName ? ` (${ruleset.countyName})` : ""}</span> : null}
          {ruleset.officialCitation ? <span>Citation: {ruleset.officialCitation}</span> : null}
          {ruleset.recordRetentionMonths ? <span>Retention: {ruleset.recordRetentionMonths} months</span> : null}
          {ruleset.logSheetSource ? <span>Log sheet: {ruleset.logSheetSource}{ruleset.logSheetSourceLabel ? ` — ${ruleset.logSheetSourceLabel}` : ""}</span> : null}
        </div>
        {ruleset.sourceDocument ? <p className="mt-2 text-xs text-brand-muted">Source: {ruleset.sourceDocument}</p> : null}
        {ruleset.logSheetSourceNotes ? <p className="mt-1 text-xs text-brand-muted">{ruleset.logSheetSourceNotes}</p> : null}
      </header>

      {ruleset.complianceNotes.length > 0 ? (
        <section className="mt-6 space-y-2">
          {ruleset.complianceNotes.map((n) => (
            <div key={n.id} className="rounded-lg border border-brand-warn/30 bg-brand-warnFill p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-warn">{n.kind}</p>
              <p className="mt-1 text-sm font-medium text-brand-warn">{n.summary}</p>
              {n.detail ? <p className="mt-1 text-sm text-brand-warn">{n.detail}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-brand-ink">Chemistry thresholds ({ruleset.chemistryThresholds.length})</h2>
        <div className="mt-2 space-y-2">
          {ruleset.chemistryThresholds.map((t) => (
            <div key={t.id} className="rounded-lg border border-brand-border bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-brand-ink">{t.parameter}</span>
                  {t.disinfectionMethod !== "NOT_APPLICABLE" ? (
                    <span className="rounded bg-brand-foam px-1.5 py-0.5 text-xs text-brand-primary">{t.disinfectionMethod}</span>
                  ) : null}
                  {t.bodyOfWaterCategory ? <span className="rounded bg-brand-foam px-1.5 py-0.5 text-xs text-brand-muted">{t.bodyOfWaterCategory}</span> : null}
                  {t.indoorOutdoor ? <span className="rounded bg-brand-foam px-1.5 py-0.5 text-xs text-brand-muted">{t.indoorOutdoor}</span> : null}
                  {t.appliesWhen ? <span className="text-xs italic text-brand-muted">{t.appliesWhen}</span> : null}
                </div>
                <ConfidenceBadge value={t.sourceConfidence} />
              </div>
              <p className="mt-1 text-sm text-brand-ink">{rangeLabel(t)}</p>
              {t.hazardMin != null || t.hazardMax != null ? (
                <p className="mt-0.5 text-sm text-brand-danger">
                  Hazard: {fmtNum(t.hazardMin) ?? "?"} – {fmtNum(t.hazardMax) ?? "?"} {t.unit}
                </p>
              ) : null}
              {t.relationalRule ? <p className="mt-1 text-sm text-brand-muted">Relational: {t.relationalRule}</p> : null}
              {t.isCurveBased ? (
                <p className="mt-1 text-sm text-brand-muted">
                  Curve-based: {t.curveDescription}
                  {t.curveDataPoints == null ? <span className="font-semibold text-brand-warn"> (data points not yet available)</span> : null}
                </p>
              ) : null}
              {t.notes ? <p className="mt-1 text-xs text-brand-muted">{t.notes}</p> : null}
            </div>
          ))}
          {ruleset.chemistryThresholds.length === 0 ? <p className="text-sm text-brand-muted">None seeded.</p> : null}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-brand-ink">Frequency rules ({ruleset.frequencyRules.length})</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-brand-border bg-white shadow-sm">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-surface text-left">
                <th className="px-3 py-2 font-medium text-brand-muted">Parameter</th>
                <th className="px-3 py-2 font-medium text-brand-muted">Body type</th>
                <th className="px-3 py-2 font-medium text-brand-muted">Facility attribute</th>
                <th className="px-3 py-2 font-medium text-brand-muted">Cadence</th>
                <th className="px-3 py-2 font-medium text-brand-muted">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ruleset.frequencyRules.map((f) => (
                <tr key={f.id} className="border-b border-brand-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-brand-ink">{f.parameter}</td>
                  <td className="px-3 py-2 text-brand-ink">{f.bodyOfWaterCategory ?? "—"}</td>
                  <td className="px-3 py-2 text-brand-ink">{f.facilityAttribute ?? "—"}</td>
                  <td className="px-3 py-2 text-brand-ink">
                    {f.cadence ?? "—"}
                    {f.isPerformanceBased ? <span className="ml-1 text-xs font-semibold text-brand-warn">(performance-based)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-brand-muted">{f.notes ?? "—"}</td>
                </tr>
              ))}
              {ruleset.frequencyRules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-brand-muted">
                    None seeded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-brand-ink">Event protocols ({ruleset.eventProtocols.length})</h2>
        <div className="mt-2 space-y-2">
          {ruleset.eventProtocols.map((e) => (
            <div key={e.id} className="rounded-lg border border-brand-border bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-brand-ink">{e.triggerType}</span>
                  <span className="rounded bg-brand-foam px-1.5 py-0.5 text-xs text-brand-primary">{e.closureKind}</span>
                </div>
                <ConfidenceBadge value={e.sourceConfidence} />
              </div>
              <p className="mt-1 text-sm font-medium text-brand-ink">{e.triggerLabel}</p>
              <p className="mt-1 text-sm text-brand-ink">{e.reopeningCondition}</p>
              {e.minimumDurationMinutes != null ? <p className="mt-0.5 text-xs text-brand-muted">Minimum duration: {e.minimumDurationMinutes} minutes</p> : null}
              {e.consecutiveFailuresRequired != null ? <p className="mt-0.5 text-xs text-brand-muted">Requires {e.consecutiveFailuresRequired} consecutive failures</p> : null}
              {e.remediationSteps ? <p className="mt-1 text-sm text-brand-muted">Remediation: {e.remediationSteps}</p> : null}
              {e.requiresSeparateTestKit ? <p className="mt-1 text-xs text-brand-muted">Requires a dedicated test kit.</p> : null}
              {e.labAnalysisFrequency ? <p className="mt-1 text-xs text-brand-muted">Lab analysis: {e.labAnalysisFrequency}</p> : null}
              {e.externalReferenceLabel ? <p className="mt-1 text-xs text-brand-muted">External reference: {e.externalReferenceLabel}</p> : null}
              {e.feeAmount != null ? (
                <p className="mt-1 text-xs text-brand-muted">
                  Fee: {Number(e.feeAmount).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  {e.feeNote ? ` ${e.feeNote}` : ""}
                </p>
              ) : null}
              {e.notes ? <p className="mt-1 text-xs text-brand-muted">{e.notes}</p> : null}
            </div>
          ))}
          {ruleset.eventProtocols.length === 0 ? <p className="text-sm text-brand-muted">None seeded.</p> : null}
        </div>
      </section>

      {ruleset.referenceContent ? (
        <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-brand-ink">In-app reference content</h2>
          <SimpleMarkdown content={ruleset.referenceContent} className="mt-2" />
        </section>
      ) : null}
    </main>
  );
}
