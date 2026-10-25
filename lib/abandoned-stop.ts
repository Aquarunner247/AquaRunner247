/**
 * "A technician arrived at a stop and left without finishing it."
 *
 * Today nothing says so until the next morning: the nightly sweep stamps `pushedAt` once the
 * scheduled day is over, which shows as Pushed on four screens and force-sends the customer
 * summary with whatever exists. That is a record after the fact. By then nobody is going back.
 *
 * This is the same observation made early enough to act on. Kept pure -- no Prisma, no
 * `server-only` -- so the rule is testable, same pattern as lib/trial-reminder.ts; the cron in
 * app/api/cron/alert-abandoned-stops/route.ts owns the querying and the sending.
 *
 * WHY A PLAIN ELAPSED-TIME RULE IS ENOUGH, measured against production on 2026-10-25:
 *
 *   finished normally        377 visits   median 44 min    p90  3.6 hours
 *   arrived, never finished   68 visits   median ~20 days  p90 ~31 days
 *
 * The two populations barely overlap, so a threshold anywhere above about four hours separates
 * them with almost no false positives. GPS departure detection would be more immediate, and the
 * background watcher already has the position and every stop's geofence -- but it needs
 * hysteresis or drift at a pool flaps in and out of a 50m radius, it only works while the app is
 * alive, and it would mean transmitting positions that the Privacy Policy and DPA currently say
 * are never sent. Not worth it for the extra hour or two of notice.
 */

/**
 * How long a stop may sit started-but-unfinished before the org is told.
 *
 * Four hours: just past the 90th percentile of visits that DO get finished (3.6 hours), so a
 * genuinely long job at a big commercial property finishes before this ever fires.
 */
export const ABANDONED_AFTER_HOURS = 4;

const MS_PER_HOUR = 60 * 60 * 1000;

export type AbandonedStopCandidate = {
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  /** Stamped by the nightly sweep once the scheduled day ended. */
  pushedAt: Date | null;
  abandonedAlertSentAt: Date | null;
  technicianId: string | null;
};

export type AbandonedStopDecision =
  | { alert: true; openHours: number }
  | {
      alert: false;
      reason: "not-in-progress" | "never-arrived" | "already-finished" | "already-pushed" | "already-alerted" | "no-technician" | "too-soon";
    };

/**
 * Whether this stop should raise an alert now.
 *
 * Checks are ordered so the skip reason a cron reports is the most useful one -- "too-soon"
 * means it is being watched, "already-pushed" means the nightly sweep got there first.
 */
export function abandonedStopDecision(
  visit: AbandonedStopCandidate,
  now: Date = new Date(),
): AbandonedStopDecision {
  // Arrival is the only thing that sets IN_PROGRESS, so anything else was never started, was
  // finished, or was skipped.
  if (visit.status !== "IN_PROGRESS") return { alert: false, reason: "not-in-progress" };
  if (visit.startedAt == null) return { alert: false, reason: "never-arrived" };
  if (visit.completedAt != null) return { alert: false, reason: "already-finished" };

  // The nightly sweep already gave up on this one and the customer summary has gone. Alerting
  // now would be telling somebody to go back to a stop the system has closed out. This is also
  // what stops the whole historical backlog alerting at once the first time this runs.
  if (visit.pushedAt != null) return { alert: false, reason: "already-pushed" };

  if (visit.abandonedAlertSentAt != null) return { alert: false, reason: "already-alerted" };

  // Nothing useful to say without knowing who to ask about it.
  if (visit.technicianId == null) return { alert: false, reason: "no-technician" };

  const openHours = (now.getTime() - visit.startedAt.getTime()) / MS_PER_HOUR;
  if (openHours < ABANDONED_AFTER_HOURS) return { alert: false, reason: "too-soon" };

  return { alert: true, openHours };
}

/** "4 hours" / "1 hour", for the subject line and the body. */
export function formatOpenDuration(openHours: number): string {
  const whole = Math.floor(openHours);
  if (whole < 1) return "under an hour";
  if (whole === 1) return "1 hour";
  if (whole < 24) return `${whole} hours`;
  const days = Math.floor(whole / 24);
  return days === 1 ? "more than a day" : `more than ${days} days`;
}
