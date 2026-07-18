"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createOrFindAuthUser, createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripe, mapSubscriptionStatus } from "@/lib/stripe";
import type { OrganizationPlanStatus } from "@/generated/prisma/client";

const TRIAL_DAYS = 14;

/**
 * Starts signup: collects business info only (no password, no DB writes) and sends
 * the user to Stripe Checkout. The account is only ever created in `completeSignup`,
 * after Stripe confirms the checkout actually succeeded — a declined or abandoned
 * card leaves no trace here.
 */
export async function signUp(formData: FormData) {
  // Default-safe: signups are gated off unless explicitly turned on. Checked here (the
  // real gate — covers a direct POST too) and again in the page component (so the form
  // isn't even shown). completeSignup below has the same check for defense-in-depth,
  // though it can't be reached without a valid Stripe session/org anyway, which nothing
  // creates while this is off.
  if (process.env.SIGNUPS_ENABLED !== "true") {
    redirect("/");
  }

  const businessName = String(formData.get("businessName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!businessName || !name || !email) {
    redirect("/signup?error=missing-fields");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?error=email-in-use");
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Someone may have paid on Stripe's page in an earlier attempt but never came back
  // to set a password (closed tab, crashed browser, etc). The webhook creates the
  // Organization for that case as a safety net, with no User attached yet. Route them
  // to finish that instead of starting — and paying for — a second subscription.
  // (redirect() throws internally to unwind, so it must not be called inside this
  // try/catch — the catch would swallow that throw instead of letting it propagate.)
  let resumeOrgId: string | null = null;
  if (priceId) {
    try {
      const customers = await stripe.customers.list({ email, limit: 1 });
      const customer = customers.data[0];
      if (customer) {
        const existingOrg = await prisma.organization.findUnique({
          where: { stripeCustomerId: customer.id },
          include: { users: { take: 1 } },
        });
        if (existingOrg && existingOrg.users.length === 0) {
          resumeOrgId = existingOrg.id;
        }
      }
    } catch (err) {
      console.error("[signup] failed to check for an abandoned prior signup:", err);
      // Non-fatal — fall through and let them start a fresh checkout.
    }
  }
  if (resumeOrgId) {
    redirect(`/signup/complete?orgId=${resumeOrgId}`);
  }

  if (!priceId) {
    // Billing isn't configured in this environment — skip Stripe and go straight to
    // the completion step, which creates the account without any Stripe linkage.
    const qs = new URLSearchParams({ businessName, name, email, phone });
    redirect(`/signup/complete?${qs.toString()}`);
  }

  let checkoutUrl: string;
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      metadata: { businessName, name, phone },
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS },
      success_url: `${appUrl}/signup/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/signup/cancelled`,
    });

    if (!checkoutSession.url) {
      throw new Error("Stripe Checkout session has no URL");
    }
    checkoutUrl = checkoutSession.url;
  } catch (err) {
    console.error("[signup] Stripe checkout setup failed:", err);
    redirect("/signup?error=server-error");
  }

  redirect(checkoutUrl);
}

type ResolvedSignup = {
  businessName: string;
  name: string;
  email: string;
  phone: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planStatus: OrganizationPlanStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

/**
 * Re-derives signup details from Stripe directly rather than trusting resubmitted
 * form fields — the session_id is the only thing that must round-trip untampered.
 */
async function resolveFromStripeSession(sessionId: string): Promise<ResolvedSignup> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });

  if (session.status !== "complete") {
    throw new Error(`Checkout session ${sessionId} is not complete (status: ${session.status})`);
  }

  const email = (session.customer_details?.email ?? session.customer_email ?? "").trim().toLowerCase();
  const businessName = String(session.metadata?.businessName ?? "").trim();
  const name = String(session.metadata?.name ?? "").trim();
  const phone = session.metadata?.phone ? String(session.metadata.phone).trim() : null;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscription = typeof session.subscription === "string" ? null : session.subscription;

  if (!email || !businessName || !name || !customerId || !subscription) {
    throw new Error(`Checkout session ${sessionId} is missing required fields`);
  }

  return {
    businessName,
    name,
    email,
    phone,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    planStatus: mapSubscriptionStatus(subscription.status),
    trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    currentPeriodEnd: subscription.items.data[0]?.current_period_end
      ? new Date(subscription.items.data[0].current_period_end * 1000)
      : null,
  };
}

/** Dev-mode path when billing isn't configured — trusts the resubmitted form fields. */
function resolveFromForm(formData: FormData): ResolvedSignup {
  const businessName = String(formData.get("businessName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;

  if (!businessName || !name || !email) {
    redirect("/signup?error=missing-fields");
  }

  return {
    businessName,
    name,
    email,
    phone,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    planStatus: "TRIALING",
    trialEndsAt: null,
    currentPeriodEnd: null,
  };
}

/**
 * Resumes a signup whose Stripe checkout succeeded but was abandoned before a
 * password was set — the webhook already created this Organization (billed, Stripe-
 * linked, no User yet). Only the org id needs to round-trip untampered; email/business
 * info come from Stripe's own customer record, not from anything resubmitted.
 * `name` (the contact's personal name) was never captured in this scenario, so it's
 * the one field taken from the resume form itself.
 */
async function resolveFromExistingOrg(orgId: string, formData: FormData): Promise<ResolvedSignup> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, include: { users: { take: 1 } } });
  if (!org || !org.stripeCustomerId || org.users.length > 0) {
    throw new Error(`Organization ${orgId} is not a valid resume target`);
  }

  const customer = await stripe.customers.retrieve(org.stripeCustomerId);
  if (customer.deleted) {
    throw new Error(`Stripe customer for organization ${orgId} was deleted`);
  }
  const email = (customer.email ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!email || !name) {
    throw new Error(`Missing email (from Stripe) or name (from form) resuming organization ${orgId}`);
  }

  return {
    businessName: org.businessName ?? org.name,
    name,
    email,
    phone: org.businessPhone,
    stripeCustomerId: org.stripeCustomerId,
    stripeSubscriptionId: org.stripeSubscriptionId,
    planStatus: org.planStatus,
    trialEndsAt: org.trialEndsAt,
    currentPeriodEnd: org.currentPeriodEnd,
  };
}

/**
 * Finishes signup after Stripe checkout succeeds (or immediately, in the no-billing-
 * configured dev path). This is the only place the Organization/User/Supabase Auth
 * account get created — nothing exists until this runs successfully.
 */
export async function completeSignup(formData: FormData) {
  if (process.env.SIGNUPS_ENABLED !== "true") {
    redirect("/");
  }

  const password = String(formData.get("password") ?? "").trim();
  const sessionId = formData.get("sessionId") ? String(formData.get("sessionId")) : null;
  const orgId = formData.get("orgId") ? String(formData.get("orgId")) : null;

  const backToCompleteQs = sessionId
    ? new URLSearchParams({ session_id: sessionId })
    : orgId
      ? new URLSearchParams({ orgId, name: String(formData.get("name") ?? "") })
      : new URLSearchParams({
          businessName: String(formData.get("businessName") ?? ""),
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
        });

  if (password.length < 8) {
    redirect(`/signup/complete?${backToCompleteQs.toString()}&error=weak-password`);
  }

  let resolved: ResolvedSignup;
  if (sessionId) {
    try {
      resolved = await resolveFromStripeSession(sessionId);
    } catch (err) {
      console.error("[signup] failed to verify Stripe session:", err);
      redirect("/signup?error=server-error");
    }
  } else if (orgId) {
    try {
      resolved = await resolveFromExistingOrg(orgId, formData);
    } catch (err) {
      console.error("[signup] failed to resume organization:", err);
      redirect("/signup?error=server-error");
    }
  } else {
    resolved = resolveFromForm(formData);
  }

  const { businessName, name, email, phone, stripeCustomerId, stripeSubscriptionId, planStatus, trialEndsAt, currentPeriodEnd } =
    resolved;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    redirect("/login?error=email-in-use");
  }

  // If a webhook already created this org (paid, but the browser never finished setup
  // last time), attach to it instead of creating a duplicate — this is the normal path
  // when arriving via orgId, and can also happen on the sessionId path if the webhook
  // won a race against this same request.
  let targetOrgId: string | null = null;
  if (stripeCustomerId) {
    const existingOrg = await prisma.organization.findUnique({
      where: { stripeCustomerId },
      include: { users: { take: 1 } },
    });
    if (existingOrg) {
      if (existingOrg.users.length > 0) {
        redirect("/login"); // fully provisioned already — double submit / back-button resubmission
      }
      targetOrgId = existingOrg.id;
    }
  }

  const authUserId = await createOrFindAuthUser(email, password);

  try {
    if (targetOrgId) {
      await prisma.user.create({
        data: { organizationId: targetOrgId, authUserId, email, name, role: "ADMIN", active: true },
      });
    } else {
      await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: businessName,
            businessName,
            businessPhone: phone,
            planStatus,
            stripeCustomerId,
            stripeSubscriptionId,
            trialEndsAt,
            currentPeriodEnd,
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
      });
    }
  } catch (err) {
    // The paid Stripe subscription (if any) is untouched — only our own DB write failed.
    // Nothing else references this auth user yet, so it's safe to clean up.
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    } catch {
      // Non-critical — orphaned auth user, no app data references it.
    }
    console.error("[signup] failed to create organization/user after payment:", err);
    redirect("/signup?error=server-error");
  }

  redirect("/login");
}
