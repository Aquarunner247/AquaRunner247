import Stripe from "stripe";
import type { OrganizationPlanStatus, PlanTier } from "@/generated/prisma/client";

/** The self-serve tiers, each backed by its own Stripe Price created in the dashboard
 * (see STRIPE_TEST_PLAN.md for the test-mode setup). ENTERPRISE has no price -- it's
 * custom/contact-us and set manually by a platform admin, never chosen at checkout.
 * COMPLIANCE is AquaRunner Compliance (app/cpo), a separate product from the pool-service
 * tiers, but shares the same self-serve checkout mechanism. */
export type SelfServePlanTier = "SERVICE" | "WHITE_LABEL" | "COMPLIANCE";

const SELF_SERVE_TIER_PRICE_ENV: Record<SelfServePlanTier, string> = {
  SERVICE: "STRIPE_PRICE_ID_SERVICE",
  WHITE_LABEL: "STRIPE_PRICE_ID_WHITE_LABEL",
  COMPLIANCE: "STRIPE_PRICE_ID_COMPLIANCE",
};

export function isSelfServePlanTier(value: string): value is SelfServePlanTier {
  return value === "SERVICE" || value === "WHITE_LABEL" || value === "COMPLIANCE";
}

export function priceIdForTier(tier: SelfServePlanTier): string | null {
  return process.env[SELF_SERVE_TIER_PRICE_ENV[tier]] || null;
}

/**
 * The per-seat Price charged for staff beyond a plan's included count (see
 * EXTRA_SEAT_PRICE_USD). One Price serves both pool-service tiers, since the seat costs the
 * same on each; split it into two envs if that ever stops being true.
 *
 * Null when unset, which every seat-billing path treats as "seat billing is not configured"
 * and skips rather than failing -- the same posture the rest of this file takes toward a
 * missing price, and what keeps adding a user working on an org with no Stripe subscription.
 */
export function extraSeatPriceId(): string | null {
  return process.env.STRIPE_PRICE_ID_EXTRA_SEAT || null;
}

/**
 * The subscription item carrying the plan itself.
 *
 * Picked by price rather than by position. A subscription used to hold exactly one item, so
 * `items.data[0]` was the plan by definition; adding per-seat billing makes that two items in
 * an order Stripe does not promise. Reading index 0 would silently hand back the seat item --
 * and since tierForPriceId returns null for it, the webhook's planTier sync would quietly stop
 * applying upgrades made through the billing portal.
 */
export function planItemOf(subscription: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const seatPrice = extraSeatPriceId();
  return (
    subscription.items.data.find((item) => tierForPriceId(item.price?.id) !== null) ??
    // An Enterprise or otherwise custom price maps to no tier, so fall back to "whatever is
    // not the seat item" before giving up.
    subscription.items.data.find((item) => !seatPrice || item.price?.id !== seatPrice)
  );
}

/** The subscription item carrying extra seats, if this subscription has one yet. */
export function seatItemOf(subscription: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const seatPrice = extraSeatPriceId();
  if (!seatPrice) return undefined;
  return subscription.items.data.find((item) => item.price?.id === seatPrice);
}

/** Reverse lookup used by the webhook to keep Organization.planTier in sync with whatever
 * Price a subscription is actually on -- covers upgrades/downgrades made through the
 * billing portal, not just the tier chosen at signup. Returns null for a price that isn't
 * one of the self-serve tiers (e.g. a custom Enterprise price, or unset env vars). */
export function tierForPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_SERVICE) return "SERVICE";
  if (priceId === process.env.STRIPE_PRICE_ID_WHITE_LABEL) return "WHITE_LABEL";
  if (priceId === process.env.STRIPE_PRICE_ID_COMPLIANCE) return "COMPLIANCE";
  return null;
}

export function mapSubscriptionStatus(status: Stripe.Subscription.Status): OrganizationPlanStatus {
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

function buildStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(secretKey);
}

const globalForStripe = globalThis as unknown as { stripe: Stripe | undefined };

function getStripeClient(): Stripe {
  if (!globalForStripe.stripe) {
    globalForStripe.stripe = buildStripeClient();
  }
  return globalForStripe.stripe;
}

/**
 * Lazily-constructed Stripe client — only throws (missing STRIPE_SECRET_KEY) when a
 * property is actually accessed, not at import time, so unrelated builds/routes that
 * merely import this module don't fail when Stripe isn't configured yet.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripeClient(), prop, receiver);
  },
});
