import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { SetPasswordForm } from "./set-password-form";

/**
 * The one screen a portal login still holding its emailed temporary password can reach.
 *
 * Deliberately outside the (app) route group: that group's layout is what redirects here, so a page
 * inside it would redirect to itself forever. It also means no portal navigation is rendered, which is
 * the right shape for a screen with exactly one thing to do.
 */
export default async function PortalSetPasswordPage() {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login?error=no-access");
  // Nothing to force. Someone who navigated here directly, or came back on a bookmark after changing
  // it, goes to the portal rather than being shown a form implying their password is a problem.
  if (!customerUser.mustChangePassword) redirect("/portal");

  const customer = await prisma.customer.findUnique({
    where: { id: customerUser.customerId },
    select: { organization: { select: { name: true, businessName: true } } },
  });
  const orgName = customer?.organization.businessName ?? customer?.organization.name ?? "your pool service company";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">{orgName}</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-brand-ink">
        Choose your own password
      </h1>
      <p className="mt-3 text-sm text-brand-muted">
        You&rsquo;re signed in with the temporary password {orgName} emailed you. Because it was sent by
        email, anyone who can read that message can read the password — so please replace it before
        going any further. You&rsquo;ll use the new one from now on.
      </p>
      <SetPasswordForm />
      <p className="mt-6 text-xs text-brand-muted">
        Signed in as {customerUser.email}
      </p>
    </main>
  );
}
