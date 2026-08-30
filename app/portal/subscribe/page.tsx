import { redirect } from "next/navigation";
import { getCurrentCustomerPortalAccessState } from "@/lib/auth/current-customer-user";
import { priceIdForTier } from "@/lib/stripe";
import { startCompliancePlan } from "./actions";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

// Billing for this product isn't configured in every environment yet (no
// STRIPE_SECRET_KEY / STRIPE_PRICE_ID_COMPLIANCE in production as of this deploy) --
// checked here rather than only inside startCompliancePlan so a customer who lands on
// this page sees a clear "not available yet" message instead of a Subscribe button that
// leads to a dead-end retry loop. Same defense-in-depth posture as SIGNUPS_ENABLED
// gating /signup, just without a dedicated flag: config presence IS the flag here.
function complianceBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && Boolean(priceIdForTier("COMPLIANCE"));
}

export default async function PortalSubscribePage({ searchParams }: PageProps) {
  const access = await getCurrentCustomerPortalAccessState();
  if (access.status === "none") redirect("/portal/login?error=no-access");
  if (access.status === "converted") redirect("/login");
  if (access.status === "active") redirect("/portal");

  const params = (await searchParams) ?? {};
  const billingConfigured = complianceBillingConfigured();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner Compliance</p>
      <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Your portal access has changed</h1>
      <p className="mt-3 text-sm text-brand-muted">
        Your service relationship has ended, but your historical chemistry readings, inspection reports, and
        compliance records are safe — they haven&rsquo;t been touched. Subscribe to AquaRunner Compliance for
        $19/month to keep viewing your existing records and keep logging new readings yourself, on your own account.
      </p>

      {!billingConfigured ? (
        <p className="mt-6 text-sm text-brand-muted">
          Self-serve subscribing isn&rsquo;t available yet. Contact us and we&rsquo;ll get your account set up.
        </p>
      ) : (
        <>
          {params.error === "server-error" ? (
            <p className="mt-3 text-sm text-brand-danger">Something went wrong starting checkout. Please try again.</p>
          ) : null}

          <form action={startCompliancePlan} className="mt-6">
            <button type="submit" className="app-btn-primary w-full">
              Subscribe for $19/month
            </button>
          </form>
        </>
      )}
    </main>
  );
}
