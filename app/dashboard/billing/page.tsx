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

const TIER_LABELS: Record<string, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

export default async function BillingPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) ?? {};
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "Something went wrong." : null;

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { planStatus: true, planTier: true, trialEndsAt: true, currentPeriodEnd: true, stripeCustomerId: true },
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Admin</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Billing</h1>
      </header>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        {errorMessage ? <p className="mb-3 text-sm text-brand-danger">{errorMessage}</p> : null}
        <dl data-tour="billing-status" className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Status</dt>
            <dd className="text-brand-ink">{organization ? STATUS_LABELS[organization.planStatus] : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Plan</dt>
            <dd className="text-brand-ink">
              {organization?.planTier ? TIER_LABELS[organization.planTier] : "—"}
            </dd>
          </div>
          {organization?.trialEndsAt ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-muted">Trial ends</dt>
              <dd className="text-brand-ink">{organization.trialEndsAt.toLocaleDateString()}</dd>
            </div>
          ) : null}
          {organization?.currentPeriodEnd ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-muted">Renews</dt>
              <dd className="text-brand-ink">{organization.currentPeriodEnd.toLocaleDateString()}</dd>
            </div>
          ) : null}
        </dl>

        {organization?.stripeCustomerId ? (
          <form action={openBillingPortal} data-tour="billing-manage" className="mt-4">
            <button
              type="submit"
              className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primaryHover"
            >
              Manage billing
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-brand-muted">No billing account on file yet.</p>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="font-display text-base font-semibold text-brand-ink">Export your data</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Download every compliance record your organization owns -- service visits, chemistry readings, chemical
          doses, checklists, photos, contamination incidents, and inspection reports -- as a JSON file. Export
          everything, or narrow to a date range.
        </p>
        <form method="GET" action="/api/organizations/export" className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm text-brand-muted">
            From
            <input type="date" name="from" className="mt-1 block rounded-md border border-brand-control bg-white px-3 py-1.5 text-sm text-brand-ink" />
          </label>
          <label className="text-sm text-brand-muted">
            To
            <input type="date" name="to" className="mt-1 block rounded-md border border-brand-control bg-white px-3 py-1.5 text-sm text-brand-ink" />
          </label>
          <button type="submit" className="app-btn-primary-sm">
            Export
          </button>
          <a href="/api/organizations/export" className="app-btn-secondary-sm">
            Export all-time
          </a>
        </form>
      </section>
    </main>
  );
}
