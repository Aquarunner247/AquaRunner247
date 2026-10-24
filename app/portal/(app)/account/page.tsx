import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { redirect } from "next/navigation";
import { deletePortalAccountAction } from "@/app/portal/actions";
import { RETAINED_AFTER_PORTAL_DELETION } from "@/lib/account-deletion-confirm";

const ERROR_MESSAGES: Record<string, string> = {
  "confirmation-mismatch": "That didn't match your email address, so nothing was deleted.",
  "not-found": "We couldn't find that login. Try signing out and back in.",
};

/**
 * The End Customer's own account page: who they are signed in as, whose portal this is, and
 * how to delete the login.
 *
 * Exists for the deletion. App Store Guideline 5.1.1(v) wants in-app deletion for accounts the
 * app lets you have, and the native shell loads this same site, so a portal login reachable
 * from it needs the same door the organization account got. It was also the one thing Privacy
 * Policy Section 13 still routed through an email to privacy@.
 */
export default async function PortalAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "Something went wrong." : null;

  const customer = await prisma.customer.findUnique({
    where: { id: customerUser.customerId },
    select: {
      name: true,
      organization: { select: { name: true, businessName: true } },
    },
  });
  const companyName = customer?.organization.businessName ?? customer?.organization.name ?? "your pool service company";

  return (
    <main className="app-page">
      <header className="app-page-head">
        <p className="app-kicker">Portal</p>
        <h1 className="app-h1">Your account</h1>
      </header>

      <section className="app-card mt-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Signed in as</dt>
            <dd className="text-brand-ink">{customerUser.email}</dd>
          </div>
          {customerUser.name ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-muted">Name</dt>
              <dd className="text-brand-ink">{customerUser.name}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Serviced by</dt>
            <dd className="text-brand-ink">{companyName}</dd>
          </div>
        </dl>
      </section>

      {/* The distinction this page exists to make: the login is theirs, the service records are
          the pool company's. Under the DPA that company is the controller and we are its
          processor, so a request about the records goes to them -- see Privacy Policy 11. */}
      <section className="app-card mt-6 border-brand-danger/40">
        <h2 className="font-display text-base font-semibold text-brand-danger">Delete your login</h2>
        {errorMessage ? <p className="mt-2 text-sm text-brand-danger">{errorMessage}</p> : null}
        <p className="mt-1 text-sm text-brand-ink">
          This removes your access to this portal and deletes your sign-in. It happens immediately
          and cannot be undone.
        </p>
        <p className="mt-3 text-sm text-brand-muted">
          It does <strong>not</strong> delete your {RETAINED_AFTER_PORTAL_DELETION}. Those belong to{" "}
          {companyName}, who decides how long to keep them — if you want those removed, ask them
          directly. {companyName} can also set you up with a new login later using the same email
          address.
        </p>
        <form action={deletePortalAccountAction} className="mt-4">
          <label className="block text-sm text-brand-ink">
            Type <strong>{customerUser.email}</strong> to confirm
            <input
              type="text"
              name="confirmEmail"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="app-field-sm mt-1 block w-full max-w-sm px-3"
            />
          </label>
          <button
            type="submit"
            className="mt-3 inline-flex min-h-[44px] items-center rounded-md bg-brand-danger px-4 text-sm font-semibold text-white hover:bg-brand-danger/90"
          >
            Permanently delete my login
          </button>
        </form>
      </section>
    </main>
  );
}
