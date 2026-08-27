import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";

export default async function ComplianceDataPreviewPage() {
  await requirePlatformAdmin();

  const rulesets = await prisma.complianceRuleset.findMany({
    orderBy: [{ isSupported: "desc" }, { stateName: "asc" }],
    select: {
      state: true,
      stateName: true,
      healthDepartmentName: true,
      isSupported: true,
      jurisdictionLevel: true,
      _count: { select: { chemistryThresholds: true, frequencyRules: true, eventProtocols: true, complianceNotes: true } },
    },
  });

  const withData = rulesets.filter((r) => r._count.chemistryThresholds > 0 || r._count.eventProtocols > 0);
  const stubsOnly = rulesets.filter((r) => r._count.chemistryThresholds === 0 && r._count.eventProtocols === 0);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Platform</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Compliance data — preview</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Read-only view of every state&rsquo;s seeded compliance data, regardless of{" "}
          <code className="app-code">isSupported</code>. This is a review tool, not what any live
          account sees — the actual customer-facing gating (closure banners, the QR inspector log) still runs off{" "}
          <code className="app-code">isSupported</code> alone. Any state below with a{" "}
          <code className="app-code">GAP</code>-kind note is off because there&rsquo;s genuinely no
          state-level regulation to apply, not because it hasn&rsquo;t been built yet — click into a state to see its
          notes.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-brand-border bg-white shadow-sm">
        <div className="border-b border-brand-border px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">States with seeded data ({withData.length})</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-surface text-left">
              <th className="px-3 py-2 font-medium text-brand-muted">State</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Health department</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Jurisdiction</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Live?</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Thresholds</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Frequency</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Events</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Notes</th>
            </tr>
          </thead>
          <tbody>
            {withData.map((r) => (
              <tr key={r.state} className="border-b border-brand-border last:border-0 hover:bg-brand-foam">
                <td className="px-3 py-2">
                  <Link href={`/platform-admin/compliance/${r.state}`} className="font-medium text-brand-primary underline">
                    {r.stateName} ({r.state})
                  </Link>
                </td>
                <td className="px-3 py-2 text-brand-ink">{r.healthDepartmentName ?? "—"}</td>
                <td className="px-3 py-2 text-brand-ink">{r.jurisdictionLevel ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.isSupported ? (
                    <span className="app-pill-good">Live</span>
                  ) : (
                    <span className="app-pill-inactive">Preview only</span>
                  )}
                </td>
                <td className="px-3 py-2 text-brand-ink">{r._count.chemistryThresholds}</td>
                <td className="px-3 py-2 text-brand-ink">{r._count.frequencyRules}</td>
                <td className="px-3 py-2 text-brand-ink">{r._count.eventProtocols}</td>
                <td className="px-3 py-2 text-brand-ink">{r._count.complianceNotes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
          Stub-only states ({stubsOnly.length}) — name only, no data collected yet
        </p>
        <p className="mt-2 text-sm text-brand-muted">
          {stubsOnly.map((r) => r.stateName).join(", ")}
        </p>
      </section>
    </main>
  );
}
