import Stripe from "stripe";
import type { OrganizationPlanStatus, PlanTier } from "@/generated/prisma/client";

/** The two self-serve tiers, each backed by its own Stripe Price created in the dashboard
 * (see STRIPE_TEST_PLAN.md for the test-mode setup). ENTERPRISE has no price -- it's
 * custom/contact-us and set manually by a platform admin, never chosen at checkout. */
export type SelfServePlanTier = "STARTER" | "PRO";

const SELF_SERVE_TIER_PRICE_ENV: Record<SelfServePlanTier, string> = {
  STARTER: "STRIPE_PRICE_ID_STARTER",
  PRO: "STRIPE_PRICE_ID_PRO",
};

export function isSelfServePlanTier(value: string): value is SelfServePlanTier {
  return value === "STARTER" || value === "PRO";
}

export function priceIdForTier(tier: SelfServePlanTier): string | null {
  return process.env[SELF_SERVE_TIER_PRICE_ENV[tier]] || null;
}

/** Reverse lookup used by the webhook to keep Organization.planTier in sync with whatever
 * Price a subscription is actually on -- covers upgrades/downgrades made through the
 * billing portal, not just the tier chosen at signup. Returns null for a price that isn't
 * one of the two self-serve tiers (e.g. a custom Enterprise price, or unset env vars). */
export function tierForPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return "STARTER";
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "PRO";
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
