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
  confirmed: "bg-emerald-100 text-emerald-800",
  assumption: "bg-amber-100 text-amber-800",
  conflict: "bg-rose-100 text-rose-800",
  gap: "bg-slate-200 text-slate-700",
};

function ConfidenceBadge({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CONFIDENCE_STYLES[value] ?? "bg-slate-200 text-slate-700"}`}>
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
      <Link href="/platform-admin/compliance" className="text-sm text-[#0A5FA4] underline">
        ← All states
      </Link>

      <header className="mt-3 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Platform · Compliance preview</p>
          {ruleset.isSupported ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Live</span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Preview only — not gating any account</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {ruleset.stateName} ({ruleset.state})
        </h1>
        {ruleset.healthDepartmentName ? <p className="mt-1 text-sm text-slate-600">{ruleset.healthDepartmentName}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {ruleset.jurisdictionLevel ? <span>Jurisdiction: {ruleset.jurisdictionLevel}{ruleset.countyName ? ` (${ruleset.countyName})` : ""}</span> : null}
          {ruleset.officialCitation ? <span>Citation: {ruleset.officialCitation}</span> : null}
          {ruleset.recordRetentionMonths ? <span>Retention: {ruleset.recordRetentionMonths} months</span> : null}
          {ruleset.logSheetSource ? <span>Log sheet: {ruleset.logSheetSource}{ruleset.logSheetSourceLabel ? ` — ${ruleset.logSheetSourceLabel}` : ""}</span> : null}
        </div>
        {ruleset.sourceDocument ? <p className="mt-2 text-xs text-slate-500">Source: {ruleset.sourceDocument}</p> : null}
        {ruleset.logSheetSourceNotes ? <p className="mt-1 text-xs text-slate-500">{ruleset.logSheetSourceNotes}</p> : null}
      </header>

      {ruleset.complianceNotes.length > 0 ? (
        <section className="mt-6 space-y-2">
          {ruleset.complianceNotes.map((n) => (
            <div key={n.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">{n.kind}</p>
              <p className="mt-1 text-sm font-medium text-amber-900">{n.summary}</p>
              {n.detail ? <p className="mt-1 text-sm text-amber-800">{n.detail}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Chemistry thresholds ({ruleset.chemistryThresholds.length})</h2>
        <div className="mt-2 space-y-2">
          {ruleset.chemistryThresholds.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-[#12234A]">{t.parameter}</span>
                  {t.disinfectionMethod !== "NOT_APPLICABLE" ? (
                    <span className="rounded bg-[#EAF6FA] px-1.5 py-0.5 text-xs text-[#0A5FA4]">{t.disinfectionMethod}</span>
                  ) : null}
                  {t.bodyOfWaterCategory ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t.bodyOfWaterCategory}</span> : null}
                  {t.indoorOutdoor ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t.indoorOutdoor}</span> : null}
                  {t.appliesWhen ? <span className="text-xs italic text-slate-500">{t.appliesWhen}</span> : null}
                </div>
                <ConfidenceBadge value={t.sourceConfidence} />
              </div>
              <p className="mt-1 text-sm text-slate-700">{rangeLabel(t)}</p>
              {t.hazardMin != null || t.hazardMax != null ? (
                <p className="mt-0.5 text-sm text-rose-700">
                  Hazard: {fmtNum(t.hazardMin) ?? "?"} – {fmtNum(t.hazardMax) ?? "?"} {t.unit}
                </p>
              ) : null}
              {t.relationalRule ? <p className="mt-1 text-sm text-slate-600">Relational: {t.relationalRule}</p> : null}
              {t.isCurveBased ? (
                <p className="mt-1 text-sm text-slate-600">
                  Curve-based: {t.curveDescription}
                  {t.curveDataPoints == null ? <span className="font-semibold text-amber-700"> (data points not yet available)</span> : null}
                </p>
              ) : null}
              {t.notes ? <p className="mt-1 text-xs text-slate-500">{t.notes}</p> : null}
            </div>
          ))}
          {ruleset.chemistryThresholds.length === 0 ? <p className="text-sm text-slate-500">None seeded.</p> : null}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Frequency rules ({ruleset.frequencyRules.length})</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2 font-medium text-slate-500">Parameter</th>
                <th className="px-3 py-2 font-medium text-slate-500">Body type</th>
                <th className="px-3 py-2 font-medium text-slate-500">Facility attribute</th>
                <th className="px-3 py-2 font-medium text-slate-500">Cadence</th>
                <th className="px-3 py-2 font-medium text-slate-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ruleset.frequencyRules.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-[#12234A]">{f.parameter}</td>
                  <td className="px-3 py-2 text-slate-700">{f.bodyOfWaterCategory ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{f.facilityAttribute ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {f.cadence ?? "—"}
                    {f.isPerformanceBased ? <span className="ml-1 text-xs font-semibold text-amber-700">(performance-based)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{f.notes ?? "—"}</td>
                </tr>
              ))}
              {ruleset.frequencyRules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-500">
                    None seeded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Event protocols ({ruleset.eventProtocols.length})</h2>
        <div className="mt-2 space-y-2">
          {ruleset.eventProtocols.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-[#12234A]">{e.triggerType}</span>
                  <span className="rounded bg-[#EAF6FA] px-1.5 py-0.5 text-xs text-[#0A5FA4]">{e.closureKind}</span>
                </div>
                <ConfidenceBadge value={e.sourceConfidence} />
              </div>
              <p className="mt-1 text-sm font-medium text-slate-900">{e.triggerLabel}</p>
              <p className="mt-1 text-sm text-slate-700">{e.reopeningCondition}</p>
              {e.minimumDurationMinutes != null ? <p className="mt-0.5 text-xs text-slate-500">Minimum duration: {e.minimumDurationMinutes} minutes</p> : null}
              {e.consecutiveFailuresRequired != null ? <p className="mt-0.5 text-xs text-slate-500">Requires {e.consecutiveFailuresRequired} consecutive failures</p> : null}
              {e.remediationSteps ? <p className="mt-1 text-sm text-slate-600">Remediation: {e.remediationSteps}</p> : null}
              {e.requiresSeparateTestKit ? <p className="mt-1 text-xs text-slate-500">Requires a dedicated test kit.</p> : null}
              {e.labAnalysisFrequency ? <p className="mt-1 text-xs text-slate-500">Lab analysis: {e.labAnalysisFrequency}</p> : null}
              {e.externalReferenceLabel ? <p className="mt-1 text-xs text-slate-500">External reference: {e.externalReferenceLabel}</p> : null}
              {e.feeAmount != null ? (
                <p className="mt-1 text-xs text-slate-500">
                  Fee: {Number(e.feeAmount).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  {e.feeNote ? ` ${e.feeNote}` : ""}
                </p>
              ) : null}
              {e.notes ? <p className="mt-1 text-xs text-slate-500">{e.notes}</p> : null}
            </div>
          ))}
          {ruleset.eventProtocols.length === 0 ? <p className="text-sm text-slate-500">None seeded.</p> : null}
        </div>
      </section>

      {ruleset.referenceContent ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">In-app reference content</h2>
          <SimpleMarkdown content={ruleset.referenceContent} className="mt-2" />
        </section>
      ) : null}
    </main>
  );
}
