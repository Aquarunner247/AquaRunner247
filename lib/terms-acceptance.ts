/**
 * The agreement an organization accepts when it creates an account, and the version of it.
 *
 * Why this exists: until 2026-10-22 nothing in the product ever presented these documents. They
 * were reachable only from the marketing-site footer, which is browsewrap -- notice on a page the
 * user need never visit, with no act of assent. That is the weakest form of agreement there is,
 * and it fails exactly where it matters most: Terms of Service Section 24 (binding arbitration
 * and the class-action waiver), Section 19 (the 12-month liability cap) and Section 20 (both
 * indemnities). Section 23 picks Nevada law and Clark County venue, so the Ninth Circuit's
 * standard applies -- conspicuous notice AND an unambiguous manifestation of assent.
 *
 * `TERMS_NOTICE` is the notice. `Organization.termsAcceptedAt` / `termsAcceptedVersion` are the
 * assent. Neither is worth much without the other, so they are defined together.
 */

/**
 * The documents' own effective date, as stamped at the top of each one in content/legal/.
 *
 * Bump this when a document changes materially, and bump it in the markdown at the same time --
 * an organization's stored version is the evidence of what it actually agreed to, so this value
 * has to correspond to text that can still be produced.
 *
 * Changing it does NOT re-prompt existing organizations. A re-acceptance flow is a separate
 * piece of work; until it exists, a bump means new accounts accept the new version and existing
 * accounts keep the record of the old one.
 */
export const TERMS_VERSION = "2026-10-22";

/** The documents a signup accepts, in the order the notice names them. */
export const TERMS_DOCUMENTS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/eula", label: "End User License Agreement" },
  { href: "/privacy", label: "Privacy Policy" },
] as const;

/**
 * What the acceptance record should be when an account is created now.
 *
 * A function rather than a constant so the timestamp is read at call time, and so every caller
 * writes the same two fields -- a signup path that set one without the other would leave a row
 * that cannot be interpreted.
 */
export function termsAcceptanceFields(now: Date = new Date()): {
  termsAcceptedAt: Date;
  termsAcceptedVersion: string;
} {
  return { termsAcceptedAt: now, termsAcceptedVersion: TERMS_VERSION };
}
