import Stripe from "stripe";

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
