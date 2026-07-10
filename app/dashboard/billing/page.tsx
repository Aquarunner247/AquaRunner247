import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { openBillingPortal } from "@/app/billing/actions";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "no-customer": "No billing account on file yet.",
  "portal-error": "Couldn't open the billing portal right now. Please try again.",
};

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "Free trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment failed — update your card",
  CANCELED: "Canceled",
  COMPED: "Comped (no billing)",
};

export default async function BillingPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) ?? {};
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "Something went wrong." : null;

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { planStatus: true, trialEndsAt: true, currentPeriodEnd: true, stripeCustomerId: true },
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Admin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {errorMessage ? <p className="mb-3 text-sm text-red-600">{errorMessage}</p> : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="text-slate-900">{organization ? STATUS_LABELS[organization.planStatus] : "—"}</dd>
          </div>
          {organization?.trialEndsAt ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Trial ends</dt>
              <dd className="text-slate-900">{organization.trialEndsAt.toLocaleDateString()}</dd>
            </div>
          ) : null}
          {organization?.currentPeriodEnd ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Renews</dt>
              <dd className="text-slate-900">{organization.currentPeriodEnd.toLocaleDateString()}</dd>
            </div>
          ) : null}
        </dl>

        {organization?.stripeCustomerId ? (
          <form action={openBillingPortal} className="mt-4">
            <button
              type="submit"
              className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#084A82]"
            >
              Manage billing
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No billing account on file yet.</p>
        )}
      </section>
    </main>
  );
}
