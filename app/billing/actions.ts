"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { stripe } from "@/lib/stripe";
import { deleteOrganizationAccount } from "@/lib/account-deletion";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export async function openBillingPortal() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { stripeCustomerId: true, planTier: true },
  });

  // AquaRunner Compliance orgs live under /cpo, not /dashboard -- their billing page is
  // a separate route (see app/cpo/(app)/billing/page.tsx) even though this action and
  // BillingView are shared between both products.
  const billingPath = organization?.planTier === "COMPLIANCE" ? "/cpo/billing" : "/dashboard/billing";

  if (!organization?.stripeCustomerId) redirect(`${billingPath}?error=no-customer`);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let portalUrl: string;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: `${appUrl}${billingPath}`,
    });
    portalUrl = session.url;
  } catch (err) {
    console.error("[billing] failed to create portal session:", err);
    redirect(`${billingPath}?error=portal-error`);
  }

  redirect(portalUrl);
}

/**
 * Deletes the signed-in admin's whole organization account, from inside the product.
 *
 * Apple Guideline 5.1.1(v): an app that lets you make an account has to let you delete it in
 * the app. This is that, and it is destructive and immediate -- the Billing page puts the
 * export tool directly above it and states what survives.
 *
 * ADMIN only. Office staff and technicians cannot delete the business they work for, and the
 * typed confirmation is checked on the server, not just in the browser -- a hand-rolled POST
 * with an empty box must not delete anything.
 */
export async function deleteAccount(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { planTier: true },
  });
  const billingPath = organization?.planTier === "COMPLIANCE" ? "/cpo/billing" : "/dashboard/billing";

  const typed = String(formData.get("confirmName") ?? "");
  const result = await deleteOrganizationAccount(appUser.organizationId, typed);

  if (!result.ok) {
    if (result.reason === "confirmation-mismatch") redirect(`${billingPath}?error=delete-name-mismatch`);
    console.error("[billing] account deletion failed:", result.reason, result.error);
    redirect(`${billingPath}?error=delete-failed`);
  }

  // The account is gone; the session pointing at it has to go too, or the next request lands
  // on a dashboard built from a deleted organization.
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (err) {
    // The Supabase identity itself was already deleted, so a failure here leaves a cookie that
    // resolves to nothing -- getCurrentAppUser returns null and the user is sent to /login
    // anyway. Logged rather than surfaced, since the destructive work has already succeeded.
    console.error("[billing] sign-out after account deletion failed:", err);
  }

  redirect("/login?deleted=1");
}
