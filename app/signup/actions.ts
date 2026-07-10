"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createOrFindAuthUser, createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

const TRIAL_DAYS = 14;

export async function signUp(formData: FormData) {
  const businessName = String(formData.get("businessName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!businessName || !name || !email || !password) {
    redirect("/signup?error=missing-fields");
  }
  if (password.length < 8) {
    redirect("/signup?error=weak-password");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?error=email-in-use");
  }

  const authUserId = await createOrFindAuthUser(email, password);

  let organizationId: string;
  try {
    const organization = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: businessName,
          businessName,
          businessPhone: phone || null,
          planStatus: "TRIALING",
        },
      });
      await tx.user.create({
        data: {
          organizationId: org.id,
          authUserId,
          email,
          name,
          role: "ADMIN",
          active: true,
        },
      });
      return org;
    });
    organizationId = organization.id;
  } catch (err) {
    // Nothing in the DB exists yet at this point — safe to clean up the orphaned auth user.
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    } catch {
      // Non-critical — the auth user is orphaned but no app data references it.
    }
    console.error("[signup] failed to create organization/user:", err);
    redirect("/signup?error=server-error");
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!priceId) {
    // Billing isn't configured in this environment — let them into the app anyway rather
    // than blocking signup entirely. planStatus stays TRIALING with no Stripe subscription.
    redirect("/signup/complete");
  }

  // The organization/user rows already exist at this point — if anything below fails, log
  // and send them to a generic error page rather than deleting a real account that now
  // belongs to a real person; it can be resolved/retried manually via the platform-admin view.
  // (redirect() throws internally, so it must stay OUTSIDE this try/catch or this catch block
  // would swallow the redirect itself.)
  let checkoutUrl: string;
  try {
    const customer = await stripe.customers.create({
      email,
      name: businessName,
      metadata: { organizationId },
    });

    await prisma.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId: customer.id },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      client_reference_id: organizationId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS },
      success_url: `${appUrl}/signup/complete`,
      cancel_url: `${appUrl}/signup/cancelled`,
    });

    if (!checkoutSession.url) {
      throw new Error("Stripe Checkout session has no URL");
    }
    checkoutUrl = checkoutSession.url;
  } catch (err) {
    console.error("[signup] Stripe checkout setup failed:", err);
    redirect("/signup?error=billing-error");
  }

  redirect(checkoutUrl);
}
