"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { stripe, mapSubscriptionStatus, priceIdForTier } from "@/lib/stripe";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/default-checklist-items";
import { getCustomerUserForAuthUser } from "@/lib/auth/customer-user";

/**
 * Loads the currently-authenticated CustomerUser and confirms they're in the one state
 * this whole flow exists for: blocked (relationship ended / org canceled) and not yet
 * converted. Anything else redirects away rather than proceeding -- an active customer
 * has no reason to be here, and an already-converted one belongs at /login now.
 */
async function requireBlockedCustomerUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const customerUser = await getCustomerUserForAuthUser(user);
  if (!customerUser) redirect("/portal/login?error=no-access");

  const customer = await prisma.customer.findUnique({
    where: { id: customerUser.customerId },
    include: { organization: { select: { id: true, planStatus: true, state: true, hasCommercialPools: true } } },
  });
  if (!customer) redirect("/portal/login?error=no-access");

  if (customer.convertedToOrganizationId) redirect("/login");

  const blocked = !customerUser.active || customer.relationshipEndedAt != null || customer.organization.planStatus === "CANCELED";
  if (!blocked) redirect("/portal");

  return { authUserId: user.id, customerUser, customer };
}

/** Starts the conversion checkout -- no password step, since this reuses the customer's
 * existing Supabase Auth account (matched via getCustomerUserForAuthUser) rather than
 * creating a new one. Metadata carries only ids; completeCompliancePlan re-derives
 * everything else from the database once the checkout actually succeeds. */
export async function startCompliancePlan() {
  const { customerUser, customer } = await requireBlockedCustomerUser();

  const priceId = priceIdForTier("COMPLIANCE");
  if (!priceId) {
    console.error("[portal/subscribe] STRIPE_PRICE_ID_COMPLIANCE is not set");
    redirect("/portal/subscribe?error=server-error");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let checkoutUrl: string;
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: customerUser.email,
      metadata: { customerUserId: customerUser.id, customerId: customer.id },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/portal/subscribe/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/portal/subscribe`,
    });
    if (!checkoutSession.url) throw new Error("Stripe Checkout session has no URL");
    checkoutUrl = checkoutSession.url;
  } catch (err) {
    console.error("[portal/subscribe] Stripe checkout setup failed:", err);
    redirect("/portal/subscribe?error=server-error");
  }

  redirect(checkoutUrl);
}

/**
 * Finishes the conversion after Stripe checkout succeeds: creates the customer's own
 * standalone Organization+User+checklist (same shape a fresh /signup would produce) and
 * MOVES (not copies) their Property/ServiceVisit data onto it -- the old service
 * company's Customer/CustomerUser rows are kept, not deleted, purely as that company's
 * own audit trail, with CustomerUser.active staying permanently false.
 *
 * Re-checks convertedToOrganizationId right before writing (idempotency guard against a
 * double submit or a race with the webhook's own safety-net branch) -- same class of
 * check completeSignup does via targetOrgId.
 */
export async function completeCompliancePlan(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  } catch (err) {
    console.error("[portal/subscribe] failed to retrieve checkout session:", err);
    redirect("/portal/subscribe?error=server-error");
  }
  if (session.status !== "complete") redirect("/portal/subscribe?error=server-error");

  const customerId = String(session.metadata?.customerId ?? "").trim();
  const customerUserId = String(session.metadata?.customerUserId ?? "").trim();
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscription = typeof session.subscription === "string" ? null : session.subscription;
  if (!customerId || !customerUserId || !stripeCustomerId || !subscription) {
    console.error(`[portal/subscribe] checkout session ${sessionId} is missing required fields`);
    redirect("/portal/subscribe?error=server-error");
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { organization: { select: { state: true, hasCommercialPools: true } } },
  });
  if (!customer) redirect("/portal/subscribe?error=server-error");

  // Already converted -- a double submit, a browser back-button resubmit, or the
  // webhook's safety-net branch won a race against this request. Either way the org
  // already exists; just send them to it.
  if (customer.convertedToOrganizationId) redirect("/cpo");

  const customerUser = await prisma.customerUser.findUnique({ where: { id: customerUserId } });
  if (!customerUser) redirect("/portal/subscribe?error=server-error");

  const stateRuleset = customer.organization.state
    ? await prisma.complianceRuleset.findUnique({ where: { state: customer.organization.state }, select: { id: true } })
    : null;

  try {
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: customerUser.name ?? customerUser.email,
          businessName: customerUser.name ?? customerUser.email,
          planTier: "COMPLIANCE",
          planStatus: mapSubscriptionStatus(subscription.status),
          stripeCustomerId,
          stripeSubscriptionId: subscription.id,
          trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
          currentPeriodEnd: subscription.items.data[0]?.current_period_end
            ? new Date(subscription.items.data[0].current_period_end * 1000)
            : null,
          state: customer.organization.state,
          hasCommercialPools: customer.organization.hasCommercialPools,
          complianceRulesetId: stateRuleset?.id ?? null,
        },
      });

      await tx.user.create({
        data: {
          organizationId: org.id,
          // The currently-authenticated session's own auth id -- not customerUser.authUserId,
          // which can be null if this login was ever matched by email fallback instead.
          authUserId: user.id,
          email: customerUser.email,
          name: customerUser.name,
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

      // Clearing customerId here is the easy-to-miss part -- without it, Property would
      // point at the new org via organizationId while still pointing at the old org's
      // Customer via customerId, a real cross-org inconsistency.
      const properties = await tx.property.findMany({ where: { customerId: customer.id }, select: { id: true } });
      await tx.property.updateMany({ where: { customerId: customer.id }, data: { organizationId: org.id, customerId: null } });
      await tx.serviceVisit.updateMany({
        where: { propertyId: { in: properties.map((p) => p.id) } },
        data: { organizationId: org.id },
      });

      await tx.customer.update({ where: { id: customer.id }, data: { convertedToOrganizationId: org.id } });
    });
  } catch (err) {
    // Unique constraint on stripeCustomerId means the webhook's own safety-net branch
    // (app/api/stripe/webhook/route.ts) won this exact race and already created the org
    // (with its User, checklist, and data move, in one transaction) -- the earlier
    // convertedToOrganizationId check above is a snapshot read, not a lock, so this can
    // still happen even though that check just passed. Not a real failure.
    const isDuplicate = typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
    if (!isDuplicate) {
      console.error("[portal/subscribe] failed to create organization after payment:", err);
      redirect("/portal/subscribe?error=server-error");
    }
  }

  redirect("/cpo");
}
