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
 * them with almost no false positives. That rule still runs, and it is the only one that works
 * for a phone that was closed, offline, or never granted background location.
 *
 * SINCE 2026-10-25 there is also a direct observation. lib/departure-detection.ts stamps
 * `departedAt` when the device sees the technician leave the geofence and stay out, which turns
 * "open suspiciously long" into "they left". That path alerts in well under an hour instead of
 * four, and it costs nothing in privacy terms because a departure is a timestamp with no
 * position attached. It does not replace the elapsed rule; it pre-empts it when it fires.
 */

/**
 * How long a stop may sit started-but-unfinished before the org is told.
 *
 * Four hours: just past the 90th percentile of visits that DO get finished (3.6 hours), so a
 * genuinely long job at a big commercial property finishes before this ever fires.
 */
export const ABANDONED_AFTER_HOURS = 4;

/**
 * How long after a recorded departure the stop must still be unfinished before alerting.
 *
 * Thirty minutes. The window a technician needs to leave for a part and come back, measured
 * against a median finished visit of 44 minutes.
 */
export const DEPARTED_GRACE_MINUTES = 30;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

export type AbandonedStopCandidate = {
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  /** Stamped by the device when it saw the technician leave. Null for most visits. */
  departedAt: Date | null;
  /** Stamped by the nightly sweep once the scheduled day ended. */
  pushedAt: Date | null;
  abandonedAlertSentAt: Date | null;
  technicianId: string | null;
};

export type AbandonedStopDecision =
  /** The device saw them leave. `onSiteMinutes` is arrival to departure. */
  | { alert: true; trigger: "departed"; openHours: number; onSiteMinutes: number }
  /** No departure was recorded; the stop has simply been open too long. */
  | { alert: true; trigger: "elapsed"; openHours: number }
  | {
      alert: false;
      reason:
        | "not-in-progress"
        | "never-arrived"
        | "already-finished"
        | "already-pushed"
        | "already-alerted"
        | "no-technician"
        | "too-soon"
        | "departed-too-recently";
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

  // A recorded departure is the thing this alert was always trying to infer, so it short-cuts
  // the four-hour wait -- but only after a grace period. A technician who drives to the supply
  // house for a chemical and comes back has genuinely left the geofence, and telling the office
  // they abandoned the stop would be wrong. Thirty minutes is comfortably longer than that round
  // trip while still being eight times more timely than the elapsed rule, and it self-resolves:
  // if they return and finish, `completedAt` is set and the check above suppresses the alert.
  if (visit.departedAt != null) {
    const minutesSinceDeparture = (now.getTime() - visit.departedAt.getTime()) / MS_PER_MINUTE;
    if (minutesSinceDeparture >= DEPARTED_GRACE_MINUTES) {
      const onSiteMinutes = Math.max(0, visit.departedAt.getTime() - visit.startedAt.getTime()) / MS_PER_MINUTE;
      return { alert: true, trigger: "departed", openHours, onSiteMinutes };
    }
    // Departed just now. Fall through rather than returning: a stop that ALSO passed four hours
    // should still alert on the elapsed rule instead of being held back by a fresh departure.
  }

  if (openHours < ABANDONED_AFTER_HOURS) {
    return { alert: false, reason: visit.departedAt != null ? "departed-too-recently" : "too-soon" };
  }

  return { alert: true, trigger: "elapsed", openHours };
}

/**
 * "25 minutes" / "1 hour 5 minutes", for how long they were actually on site.
 *
 * Prose rather than lib/mail/on-site-duration.ts's compact "1h 5m", which is built to be read as
 * a metric beside two clock times. This one lands mid-sentence in an alert.
 */
export function formatOnSiteDuration(onSiteMinutes: number): string {
  const total = Math.round(onSiteMinutes);
  if (total < 1) return "less than a minute";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
  if (minutes > 0) parts.push(minutes === 1 ? "1 minute" : `${minutes} minutes`);
  return parts.join(" ");
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
