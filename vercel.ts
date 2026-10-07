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

    // Daily -- emails each org its outstanding to-dos, and sends nothing when nothing is due. 14:00 UTC
    // is 7am Pacific in summer and 6am in winter, so it is waiting at the start of the day rather than
    // arriving in the middle of one. See app/api/cron/send-task-digest/route.ts.
    { path: "/api/cron/send-task-digest", schedule: "0 14 * * *" },
  ],
};
