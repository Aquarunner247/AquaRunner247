import type { OrganizationPlanStatus } from "@/generated/prisma/client";

/**
 * Who gets the "your trial ends soon" email, and when.
 *
 * Terms of Service 4.7 and EULA 5.4 both state that a reminder is sent before a trial ends.
 * They said so before anything sent one. This is the half of that promise that runs.
 *
 * It is also the half that matters commercially: a 14-day trial takes a card up front and
 * converts silently, and a silent conversion is what produces chargebacks and the kind of
 * complaint that attracts a state attorney general. Several states' automatic-renewal statutes
 * require a pre-charge reminder outright; the ones that set a length threshold mostly sit above
 * 14 days, so this is promise-keeping first and statutory compliance second -- but the cheapest
 * way to satisfy both is to just send it.
 *
 * Kept pure so the decision is testable without a database or a Resend key. The cron in
 * app/api/cron/send-trial-reminders/route.ts does the querying and the sending.
 */

/**
 * How long before a trial ends the reminder goes out.
 *
 * Three days: long enough that cancelling is a decision rather than a scramble, short enough
 * that it still reads as "about to happen" on a 14-day trial. The cron runs daily, so the email
 * actually lands somewhere in the 2-3 day range depending on the hour the trial started.
 */
export const TRIAL_REMINDER_LEAD_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TrialReminderCandidate = {
  planStatus: OrganizationPlanStatus;
  trialEndsAt: Date | null;
  trialReminderSentAt: Date | null;
};

export type TrialReminderDecision =
  | { send: true }
  | { send: false; reason: "not-trialing" | "no-trial-end" | "already-sent" | "trial-over" | "too-early" };

/**
 * Whether this organization should be emailed right now.
 *
 * The order of the checks is the order they should be reported in: a cron that says "skipped 12,
 * reason: too-early" is debuggable, one that says "skipped 12" is not.
 */
export function trialReminderDecision(
  org: TrialReminderCandidate,
  now: Date = new Date(),
): TrialReminderDecision {
  // A trial that was cancelled, converted, or comped is not ending -- and an org that already
  // paid should never get told it is about to be charged.
  if (org.planStatus !== "TRIALING") return { send: false, reason: "not-trialing" };

  // No end date means no trial to warn about. Happens on the dev path where Stripe is not
  // configured, which sets trialEndsAt null.
  if (org.trialEndsAt == null) return { send: false, reason: "no-trial-end" };

  // The marker that makes a daily sweep idempotent.
  if (org.trialReminderSentAt != null) return { send: false, reason: "already-sent" };

  // Past the end already. Sending now would be a reminder about a charge that has happened,
  // which is worse than silence. This is also what stops the column's NULL default from
  // emailing every organization that trialed before this existed.
  if (org.trialEndsAt.getTime() <= now.getTime()) return { send: false, reason: "trial-over" };

  const daysLeft = (org.trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY;
  if (daysLeft > TRIAL_REMINDER_LEAD_DAYS) return { send: false, reason: "too-early" };

  return { send: true };
}

/**
 * Whole days left, rounded up, for the email's own wording.
 *
 * Up rather than down: with 2.1 days to go, "2 days" is the honest thing to say to someone
 * deciding whether to cancel. Rounding down would say "1" and cost them a day they have.
 */
export function daysUntilTrialEnds(trialEndsAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY));
}
