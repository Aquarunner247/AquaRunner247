import type { VercelConfig } from "@vercel/config/v1";

// No cron infra existed in this repo before this feature -- this is the one place
// scheduled jobs are declared.
export const config: VercelConfig = {
  crons: [
    // Daily -- scrubs any org whose 48h post-cancellation grace period has elapsed.
    // See app/api/cron/scrub-canceled-orgs/route.ts.
    { path: "/api/cron/scrub-canceled-orgs", schedule: "0 6 * * *" },
  ],
};
