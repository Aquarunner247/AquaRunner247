import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Errors only for now, no perf/session-replay sampling -- keeps this on Sentry's free tier
  // as the business grows past one org.
  tracesSampleRate: 0,
});

// The two endpoints worth defending against bot abuse: the public waitlist form (spam/
// scraped email submissions) and starting a real signup (spins up a Stripe Checkout
// session per hit). Login isn't here -- credential-stuffing is a rate-limiting problem,
// not a "is this a human" one, handled separately via a Firewall rule instead. Matching
// checkBotId() calls live in app/api/waitlist/route.ts and app/signup/actions.ts's signUp.
initBotId({
  protect: [
    { path: "/api/waitlist", method: "POST" },
    { path: "/signup", method: "POST" },
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
