import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { compOrganization, cancelOrganization } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
  COMPED: "Comped",
};

export default async function PlatformAdminPage() {
  await requirePlatformAdmin();

  // Intentional exception: this is the one place in the app that queries across ALL
  // organizations. Every other query in the codebase must scope by organizationId — do not
  // copy this page's pattern anywhere else.
  const organizations = await prisma.organization.findMany({
    include: {
      users: { where: { role: "ADMIN" }, take: 1, select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Platform</p>
        <h1 className="text-2xl font-semibold text-slate-900">Companies</h1>
        <p className="mt-1 text-sm text-slate-500">Every company that has signed up, across all organizations.</p>
      </header>

      <section className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-3 py-2 font-medium text-slate-500">Company</th>
              <th className="px-3 py-2 font-medium text-slate-500">Admin</th>
              <th className="px-3 py-2 font-medium text-slate-500">Status</th>
              <th className="px-3 py-2 font-medium text-slate-500">Trial ends</th>
              <th className="px-3 py-2 font-medium text-slate-500">Stripe</th>
              <th className="px-3 py-2 font-medium text-slate-500">Signed up</th>
              <th className="px-3 py-2 font-medium text-slate-500"></th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => {
              const admin = org.users[0];
              return (
                <tr key={org.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-900">{org.businessName || org.name}</td>
                  <td className="px-3 py-2 text-slate-700">{admin ? admin.name ?? admin.email : "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{STATUS_LABELS[org.planStatus] ?? org.planStatus}</td>
                  <td className="px-3 py-2 text-slate-700">{org.trialEndsAt ? org.trialEndsAt.toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {org.stripeCustomerId ? (
                      <a
                        href={`https://dashboard.stripe.com/test/customers/${org.stripeCustomerId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0A5FA4] underline"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{org.createdAt.toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <form action={compOrganization}>
                        <input type="hidden" name="organizationId" value={org.id} />
                        <button
                          type="submit"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Comp
                        </button>
                      </form>
                      <form action={cancelOrganization}>
                        <input type="hidden" name="organizationId" value={org.id} />
                        <ConfirmSubmitButton
                          label="Cancel"
                          confirmMessage={`Cancel ${org.businessName || org.name}'s subscription and block their access?`}
                          className="rounded bg-rose-700 px-2 py-1 text-xs font-medium text-white"
                        />
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {organizations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
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
