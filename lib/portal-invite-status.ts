/**
 * Whether a customer's portal login has actually been used, and for how long it has not been.
 *
 * `CustomerUser.activatedAt` is stamped on the first authenticated render inside /portal/(app)
 * -- see lib/portal-activation.ts. That makes it "has opened the portal", which is NOT the same
 * as "has signed in", and the difference is not academic: three of Lindley's four unactivated
 * logins had in fact authenticated and set a password, because clicking the activation link
 * creates a session and lands on /reset-password, which is outside the portal route group. Only
 * one of the four -- the customer who eventually asked whether there was a password -- had never
 * authenticated at all.
 *
 * So nothing here claims anyone "never signed in". Everything is phrased as what the stamp
 * actually witnesses, which is whether a portal page was ever loaded. Telling an admin a customer
 * never signed in when they did is how they stop trusting the indicator.
 *
 * Prisma-free on purpose: it takes two dates and returns strings, so it is testable without a
 * database, same split as lib/dosing-units.ts against lib/dosing-calculator.ts.
 */

/**
 * How long an unopened invite has to sit before it is worth putting in front of the office.
 *
 * Three days, chosen off the activation link's own 48-hour expiry (stated in the welcome email and
 * on the customer page): past three days the link in that email is certainly dead, so the customer
 * cannot get in from it even if they find it. The extra day beyond expiry keeps this quiet about an
 * invite sent yesterday evening, which needs no chasing yet.
 */
export const PORTAL_INVITE_STALLED_AFTER_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days since the invite, floored. Negative clock skew reads as 0 rather than "-1 days ago". */
export function portalInviteAgeDays(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / MS_PER_DAY));
}

/** "today", "yesterday", "9 days ago" -- the age on its own, for composing into a sentence. */
export function portalInviteAgeLabel(createdAt: Date, now: Date): string {
  const days = portalInviteAgeDays(createdAt, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export type PortalInviteStatus = {
  /** True once a portal page has actually been loaded by this login. */
  opened: boolean;
  /** Unopened for long enough that the emailed activation link has certainly expired. */
  stalled: boolean;
  days: number;
  /** For the customer page, beside the login. Null once they have opened it -- there is nothing
   *  to say about a login that works. */
  label: string | null;
};

export function describePortalInvite(params: { createdAt: Date; activatedAt: Date | null; now: Date }): PortalInviteStatus {
  const { createdAt, activatedAt, now } = params;
  const days = portalInviteAgeDays(createdAt, now);
  if (activatedAt != null) {
    return { opened: true, stalled: false, days, label: null };
  }
  return {
    opened: false,
    stalled: days >= PORTAL_INVITE_STALLED_AFTER_DAYS,
    days,
    label: `hasn't opened the portal · invited ${portalInviteAgeLabel(createdAt, now)}`,
  };
}

/**
 * The one line the alerts bell shows, which has to carry the thing an admin can act on: the
 * emailed link is dead, so resending is the fix rather than waiting.
 */
export function stalledPortalInviteNote(days: number): string {
  return `invited ${days} days ago — the emailed link expired after 48 hours`;
}
