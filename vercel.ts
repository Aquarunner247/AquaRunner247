import type { VercelConfig } from "@vercel/config/v1";

// The one place scheduled jobs are declared.
export const config: VercelConfig = {
  crons: [
    // Daily -- scrubs any org whose 30-day post-cancellation grace period has elapsed.
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

    // Daily -- emails any org whose free trial ends within TRIAL_REMINDER_LEAD_DAYS, once each.
    // Terms of Service 4.7 and EULA 5.4 both promise this email. 15:00 UTC is 8am Pacific in
    // summer and 7am in winter: a decision about a charge should arrive at the start of a working
    // day. See app/api/cron/send-trial-reminders/route.ts.
    { path: "/api/cron/send-trial-reminders", schedule: "0 15 * * *" },

    // HOURLY, unlike the rest -- this is the only one whose value is being timely. Alerts an org
    // when a stop was started and never finished, while the technician could still go back; the
    // four-hour threshold in lib/abandoned-stop.ts does the filtering, so running hourly only
    // decides how soon after crossing it the mail goes out. One alert per stop, ever.
    // See app/api/cron/alert-abandoned-stops/route.ts.
    { path: "/api/cron/alert-abandoned-stops", schedule: "0 * * * *" },
  ],
};
