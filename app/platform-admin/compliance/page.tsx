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
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Platform</p>
        <h1 className="text-2xl font-semibold text-slate-900">Compliance data — preview</h1>
        <p className="mt-1 text-sm text-slate-600">
          Read-only view of every state&rsquo;s seeded compliance data, regardless of{" "}
          <code className="rounded bg-slate-100 px-1">isSupported</code>. This is a review tool, not what any live
          account sees — the actual customer-facing gating (closure banners, the QR inspector log) still runs off{" "}
          <code className="rounded bg-slate-100 px-1">isSupported</code> alone. See{" "}
          <code className="rounded bg-slate-100 px-1">COMPLIANCE_RULESET_NOTES.md</code> in the repo for why other
          states stay off by default.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">States with seeded data ({withData.length})</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-3 py-2 font-medium text-slate-500">State</th>
              <th className="px-3 py-2 font-medium text-slate-500">Health department</th>
              <th className="px-3 py-2 font-medium text-slate-500">Jurisdiction</th>
              <th className="px-3 py-2 font-medium text-slate-500">Live?</th>
              <th className="px-3 py-2 font-medium text-slate-500">Thresholds</th>
              <th className="px-3 py-2 font-medium text-slate-500">Frequency</th>
              <th className="px-3 py-2 font-medium text-slate-500">Events</th>
              <th className="px-3 py-2 font-medium text-slate-500">Notes</th>
            </tr>
          </thead>
          <tbody>
            {withData.map((r) => (
              <tr key={r.state} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/platform-admin/compliance/${r.state}`} className="font-medium text-[#0A5FA4] underline">
                    {r.stateName} ({r.state})
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-700">{r.healthDepartmentName ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{r.jurisdictionLevel ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.isSupported ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Live</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Preview only</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">{r._count.chemistryThresholds}</td>
                <td className="px-3 py-2 text-slate-700">{r._count.frequencyRules}</td>
                <td className="px-3 py-2 text-slate-700">{r._count.eventProtocols}</td>
                <td className="px-3 py-2 text-slate-700">{r._count.complianceNotes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Stub-only states ({stubsOnly.length}) — name only, no data collected yet
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {stubsOnly.map((r) => r.stateName).join(", ")}
        </p>
      </section>
    </main>
  );
}
