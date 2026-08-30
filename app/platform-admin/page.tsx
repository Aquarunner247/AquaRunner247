import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { compOrganization, cancelOrganization, setOrganizationPlanTier } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
  COMPED: "Comped",
};

const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: "SOLO", label: "Solo" },
  { value: "STARTER", label: "Starter" },
  { value: "PRO", label: "Pro" },
  { value: "ENTERPRISE", label: "Enterprise" },
  { value: "COMPLIANCE", label: "Compliance" },
];

export default async function PlatformAdminPage() {
  await requirePlatformAdmin();

  // Intentional exception: this is the one place in the app that queries across ALL
  // organizations. Every other query in the codebase must scope by organizationId — do not
  // copy this page's pattern anywhere else.
  const organizations = await prisma.organization.findMany({
    include: {
      users: { where: { role: "ADMIN" }, take: 1, select: { name: true, email: true } },
      complianceRuleset: { select: { stateName: true, isSupported: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Simple demand signal per multi-state-compliance-spec.md: which unsupported states have
  // accounts actually waiting on them, so it's obvious which state to build out next.
  const waitingByState = new Map<string, { stateName: string; count: number }>();
  for (const org of organizations) {
    if (org.hasCommercialPools && org.state && org.complianceRuleset && !org.complianceRuleset.isSupported) {
      const existing = waitingByState.get(org.state);
      waitingByState.set(org.state, { stateName: org.complianceRuleset.stateName, count: (existing?.count ?? 0) + 1 });
    }
  }
  const waitingList = Array.from(waitingByState.entries())
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.count - a.count);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-brand-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Platform</p>
          <h1 className="text-2xl font-semibold text-brand-ink">Companies</h1>
          <p className="mt-1 text-sm text-brand-muted">Every company that has signed up, across all organizations.</p>
        </div>
        <Link href="/platform-admin/compliance" className="app-btn-secondary-sm">
          Compliance data preview →
        </Link>
      </header>

      {waitingList.length > 0 ? (
        <section className="mt-6 rounded-lg border border-brand-warn/30 bg-brand-warnFill p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-warn">
            Accounts waiting on compliance support
          </p>
          <ul className="mt-2 space-y-1 text-sm text-brand-warn">
            {waitingList.map((w) => (
              <li key={w.code}>
                <span className="font-medium">{w.stateName}</span> — {w.count} account{w.count === 1 ? "" : "s"} waiting
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 overflow-x-auto rounded-lg border border-brand-border bg-white shadow-sm">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-surface text-left">
              <th className="px-3 py-2 font-medium text-brand-muted">Company</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Admin</th>
              <th className="px-3 py-2 font-medium text-brand-muted">State</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Status</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Plan</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Trial ends</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Stripe</th>
              <th className="px-3 py-2 font-medium text-brand-muted">Signed up</th>
              <th className="px-3 py-2 font-medium text-brand-muted"></th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => {
              const admin = org.users[0];
              return (
                <tr key={org.id} className="border-b border-brand-border last:border-0">
                  <td className="px-3 py-2 font-medium text-brand-ink">{org.businessName || org.name}</td>
                  <td className="px-3 py-2 text-brand-ink">{admin ? admin.name ?? admin.email : "—"}</td>
                  <td className="px-3 py-2 text-brand-ink">
                    {org.state ?? "—"}
                    {org.hasCommercialPools && org.complianceRuleset && !org.complianceRuleset.isSupported ? (
                      <span className="ml-1 text-xs text-brand-warn">(waiting)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-brand-ink">{STATUS_LABELS[org.planStatus] ?? org.planStatus}</td>
                  <td className="px-3 py-2 text-brand-ink">
                    <form action={setOrganizationPlanTier} className="flex items-center gap-1">
                      <input type="hidden" name="organizationId" value={org.id} />
                      <select
                        name="planTier"
                        defaultValue={org.planTier ?? ""}
                        className="rounded border border-brand-control bg-white px-1.5 py-1 text-xs text-brand-ink"
                      >
                        <option value="" disabled>
                          Not set
                        </option>
                        {TIER_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="rounded border border-brand-control bg-white px-2 py-1 text-xs font-medium text-brand-ink hover:bg-brand-foam">
                        Set
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-brand-ink">{org.trialEndsAt ? org.trialEndsAt.toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-brand-ink">
                    {org.stripeCustomerId ? (
                      <a
                        href={`https://dashboard.stripe.com/test/customers/${org.stripeCustomerId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-primary underline"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-brand-ink">{org.createdAt.toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <form action={compOrganization}>
                        <input type="hidden" name="organizationId" value={org.id} />
                        <button
                          type="submit"
                          className="rounded border border-brand-control bg-white px-2 py-1 text-xs font-medium text-brand-ink hover:bg-brand-foam"
                        >
                          Comp
                        </button>
                      </form>
                      <form action={cancelOrganization}>
                        <input type="hidden" name="organizationId" value={org.id} />
                        <ConfirmSubmitButton
                          label="Cancel"
                          confirmMessage={`Cancel ${org.businessName || org.name}'s subscription and block their access?`}
                          className="rounded bg-brand-danger px-2 py-1 text-xs font-medium text-white"
                        />
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {organizations.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-brand-muted">
                  No companies yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
