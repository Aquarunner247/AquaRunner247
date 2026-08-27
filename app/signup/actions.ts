"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createOrFindAuthUser, createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripe, mapSubscriptionStatus, priceIdForTier, tierForPriceId, isSelfServePlanTier, type SelfServePlanTier } from "@/lib/stripe";
import type { OrganizationPlanStatus, PlanTier } from "@/generated/prisma/client";
import { isValidStateCode } from "@/lib/us-states";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/default-checklist-items";

const TRIAL_DAYS = 14;

function parseTier(raw: FormDataEntryValue | null): SelfServePlanTier | null {
  const upper = String(raw ?? "").trim().toUpperCase();
  return isSelfServePlanTier(upper) ? upper : null;
}

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
  const state = String(formData.get("state") ?? "").trim().toUpperCase();
  const hasCommercialPoolsRaw = String(formData.get("hasCommercialPools") ?? "").trim();
  const tier = parseTier(formData.get("tier"));

  if (
    !businessName ||
    !name ||
    !email ||
    !isValidStateCode(state) ||
    (hasCommercialPoolsRaw !== "true" && hasCommercialPoolsRaw !== "false") ||
    !tier
  ) {
    redirect("/signup?error=missing-fields");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?error=email-in-use");
  }

  const priceId = priceIdForTier(tier);
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
    // Billing isn't configured for this tier in this environment — skip Stripe and go
    // straight to the completion step, which creates the account without any Stripe linkage.
    const qs = new URLSearchParams({ businessName, name, email, phone, state, hasCommercialPools: hasCommercialPoolsRaw, tier });
    redirect(`/signup/complete?${qs.toString()}`);
  }

  let checkoutUrl: string;
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      metadata: { businessName, name, phone, state, hasCommercialPools: hasCommercialPoolsRaw, planTier: tier },
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
  state: string;
  hasCommercialPools: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planStatus: OrganizationPlanStatus;
  planTier: PlanTier | null;
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
  const state = String(session.metadata?.state ?? "").trim().toUpperCase();
  const hasCommercialPools = session.metadata?.hasCommercialPools === "true";
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscription = typeof session.subscription === "string" ? null : session.subscription;

  if (!email || !businessName || !name || !isValidStateCode(state) || !customerId || !subscription) {
    throw new Error(`Checkout session ${sessionId} is missing required fields`);
  }

  // The subscription's actual Price is the source of truth for which tier this is (covers
  // a billing-portal plan change made before this ever resolves); metadata.planTier is only
  // a fallback for the unexpected case where the price lookup doesn't match either tier.
  const subscribedPriceId = subscription.items.data[0]?.price?.id;
  const planTier = tierForPriceId(subscribedPriceId) ?? (isSelfServePlanTier(String(session.metadata?.planTier ?? "")) ? (String(session.metadata?.planTier) as PlanTier) : null);

  return {
    businessName,
    name,
    email,
    phone,
    state,
    hasCommercialPools,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    planStatus: mapSubscriptionStatus(subscription.status),
    planTier,
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
  const state = String(formData.get("state") ?? "").trim().toUpperCase();
  const hasCommercialPools = String(formData.get("hasCommercialPools") ?? "").trim() === "true";
  const tier = parseTier(formData.get("tier"));

  if (!businessName || !name || !email || !isValidStateCode(state)) {
    redirect("/signup?error=missing-fields");
  }

  return {
    businessName,
    name,
    email,
    phone,
    state,
    hasCommercialPools,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    planStatus: "TRIALING",
    // Falls back to Starter rather than throwing -- this dev-only path (no Stripe price
    // configured) already trusts every other resubmitted field, and defaulting keeps local
    // dev usable even from an older link that predates the tier param.
    planTier: tier ?? "STARTER",
    trialEndsAt: null,
    currentPeriodEnd: null,
  };
}

/**
 * Resumes a signup whose Stripe checkout succeeded but was abandoned before a
 * password was set — the webhook already created this Organization (billed, Stripe-
 * linked, no User yet). Only the org id needs to round-trip untampered; email/business
 * info come from Stripe's own customer record, not from anything resubmitted.
 * `name`, `state`, and `hasCommercialPools` were never captured in this scenario (the
 * webhook's safety-net Organization create doesn't have a password-setting form to have
 * collected them from), so they're the fields taken fresh from the resume form itself.
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
  const state = String(formData.get("state") ?? "").trim().toUpperCase();
  const hasCommercialPools = String(formData.get("hasCommercialPools") ?? "").trim() === "true";
  if (!email || !name || !isValidStateCode(state)) {
    throw new Error(`Missing email (from Stripe), name, or state (from form) resuming organization ${orgId}`);
  }

  return {
    businessName: org.businessName ?? org.name,
    name,
    email,
    phone: org.businessPhone,
    state,
    hasCommercialPools,
    stripeCustomerId: org.stripeCustomerId,
    stripeSubscriptionId: org.stripeSubscriptionId,
    planStatus: org.planStatus,
    planTier: org.planTier,
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
      ? new URLSearchParams({
          orgId,
          name: String(formData.get("name") ?? ""),
          state: String(formData.get("state") ?? ""),
          hasCommercialPools: String(formData.get("hasCommercialPools") ?? ""),
        })
      : new URLSearchParams({
          businessName: String(formData.get("businessName") ?? ""),
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          state: String(formData.get("state") ?? ""),
          hasCommercialPools: String(formData.get("hasCommercialPools") ?? ""),
          tier: String(formData.get("tier") ?? ""),
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

  const { businessName, name, email, phone, state, hasCommercialPools, stripeCustomerId, stripeSubscriptionId, planStatus, planTier, trialEndsAt, currentPeriodEnd } =
    resolved;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    redirect("/login?error=email-in-use");
  }

  // Every state (all 50 + DC) has a ComplianceRuleset stub row from day one (see
  // prisma/seed-compliance-rulesets.ts), so this should always resolve — null only if
  // that seed hasn't been run in this environment, in which case the account still signs
  // up fine and simply has no ruleset linked until it's backfilled.
  const stateRuleset = await prisma.complianceRuleset.findUnique({ where: { state }, select: { id: true } });

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
      // The webhook's safety-net org create may predate this state/hasCommercialPools
      // capture (or simply never had it, if metadata was missing) -- this signup
      // completion's resolved values are authoritative, so set them here regardless.
      // planTier is only overwritten when this resolution actually found one -- the
      // webhook's own price-id lookup already set it in the normal case, and this must
      // not null it back out if resolution here came up empty for some reason.
      await prisma.organization.update({
        where: { id: targetOrgId },
        data: {
          state,
          hasCommercialPools,
          complianceRulesetId: stateRuleset?.id ?? null,
          ...(planTier ? { planTier } : {}),
        },
      });
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
            planTier,
            stripeCustomerId,
            stripeSubscriptionId,
            trialEndsAt,
            currentPeriodEnd,
            state,
            hasCommercialPools,
            complianceRulesetId: stateRuleset?.id ?? null,
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
        await tx.checklistItemDefinition.createMany({
          data: DEFAULT_CHECKLIST_ITEMS.map((label, index) => ({
            organizationId: org.id,
            label,
            sortOrder: index + 1,
            active: true,
          })),
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
