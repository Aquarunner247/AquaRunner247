import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type { OrganizationPlanStatus } from "@/generated/prisma/client";

export const runtime = "nodejs";

function mapSubscriptionStatus(status: Stripe.Subscription.Status): OrganizationPlanStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "incomplete":
    case "paused":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return "PAST_DUE";
  }
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.client_reference_id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        if (!organizationId || !customerId || !subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await prisma.organization.updateMany({
          where: { id: organizationId },
          data: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            planStatus: mapSubscriptionStatus(subscription.status),
            trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            currentPeriodEnd: subscription.items.data[0]?.current_period_end
              ? new Date(subscription.items.data[0].current_period_end * 1000)
              : null,
          },
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const planStatus = event.type === "customer.subscription.deleted" ? "CANCELED" : mapSubscriptionStatus(subscription.status);

        await prisma.organization.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            planStatus,
            currentPeriodEnd: subscription.items.data[0]?.current_period_end
              ? new Date(subscription.items.data[0].current_period_end * 1000)
              : null,
          },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : invoice.parent?.subscription_details?.subscription?.id;
        if (!subscriptionId) break;

        await prisma.organization.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { planStatus: "PAST_DUE" },
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Log and still return 200 — an unexpected app-side error shouldn't make Stripe
    // retry forever; this endpoint isn't the only source of truth (the Billing admin
    // page can always re-sync from Stripe directly if something was missed).
    console.error(`[stripe webhook] error handling ${event.type}:`, err);
  }

  return NextResponse.json({ received: true });
}
