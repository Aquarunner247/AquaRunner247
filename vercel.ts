import type { VercelConfig } from "@vercel/config/v1";

// The one place scheduled jobs are declared.
export const config: VercelConfig = {
  crons: [
    // Daily -- scrubs any org whose 48h post-cancellation grace period has elapsed.
    // See app/api/cron/scrub-canceled-orgs/route.ts.
    { path: "/api/cron/scrub-canceled-orgs", schedule: "0 6 * * *" },

    // Daily -- sends any customer service summary still waiting on a body of water nobody
    // finished, which otherwise waits forever. 11:00 UTC is 3-4am Pacific, so an org's previous
    // local day is reliably over by the time this looks at it. See
    // app/api/cron/send-pending-summaries/route.ts, which re-checks that per org anyway.
    { path: "/api/cron/send-pending-summaries", schedule: "0 11 * * *" },
  ],
};
