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
 * `TERMS_DOCUMENTS` plus the TermsNotice component are the notice.
 * `Organization.termsAcceptedAt` / `termsAcceptedVersion` are the current assent, and the
 * `TermsAcceptance` log rows are the evidence of it. Neither half is worth much without the
 * other, so they are defined together.
 */

/**
 * The documents' own effective date, as stamped at the top of each one in content/legal/.
 *
 * Bump this when a document changes materially, and bump it in the markdown at the same time --
 * an organization's stored version is the evidence of what it actually agreed to, so this value
 * has to correspond to text that can still be produced.
 *
 * Moving this ahead of an organization's stored `termsAcceptedVersion` re-prompts that
 * organization's admins on their next page load, through `needsTermsAcceptance` and the gates in
 * app/dashboard/layout.tsx and app/cpo/(app)/layout.tsx. So a bump is not free: it puts a
 * blocking screen in front of every existing admin. Bump it for a material change, not a typo.
 */
/**
 * 2026-10-25: bumped from the original 2026-10-22 stamp because GPS departure detection
 * added something the documents did not disclose -- the app now also works out, on the
 * device, that a technician has LEFT a stop, and stores that time. No organization had
 * accepted any version at the time of the bump (checked: termsAcceptedAt was null
 * everywhere), so nothing is stranded on the old text.
 *
 * 2026-11-10: bumped on outside legal review. Three material changes, each of which an
 * organization has to actually agree to rather than be told about:
 *   - The DPA joined this list (see TERMS_DOCUMENTS). Its Section 9.5 is the instruction
 *     AquaRunner247 relies on to retain compliance records after cancellation, and until now
 *     the DPA was not part of what anybody accepted, so that instruction had never been given
 *     by anyone. Terms of Service 7.4 made it conditional on a separate agreement.
 *   - Privacy Policy Section 13 and DPA Section 9.5 now state field by field what survives a
 *     cancellation, and lib/org-scrub.ts erases the property contact blocks that used to be
 *     retained indefinitely.
 *   - Privacy Policy Section 7.3 and the spoken RECORDING_NOTICE now disclose that the phone
 *     agent is an automated system rather than a person.
 */
export const TERMS_VERSION = "2026-11-10";

/**
 * The documents a signup accepts, in the order the notice names them.
 *
 * The DPA was added on 2026-11-10. It is not optional boilerplate here: the permanent
 * retention of compliance records after cancellation rests on Customer's documented
 * instruction in DPA Section 9.5, and a processor cannot rely on an instruction from a
 * controller who never agreed to give it. Terms of Service 7.4 and 25.3 were reworded at the
 * same time so the DPA applies to every Customer rather than only to one that separately
 * executes it.
 *
 * Each acceptance stores this list as hrefs (TermsAcceptance.documents) because the set itself
 * changes over time -- "accepted 2026-10-25" would not tell you whether the DPA was in it.
 */
export const TERMS_DOCUMENTS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/eula", label: "End User License Agreement" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/dpa", label: "Data Processing Agreement" },
] as const;

/** Why an acceptance was recorded. Stored on the log row so the original click-through at
 * account creation stays distinguishable from a later prompted re-acceptance. */
export type TermsAcceptanceContext = "SIGNUP" | "REACCEPTANCE";

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

/**
 * Whether this organization still owes an acceptance of the current documents.
 *
 * True in two cases, and deliberately the same answer for both:
 *   - It has never accepted anything (`termsAcceptedVersion` null). Every account created
 *     before 2026-10-22 is in this state. Those are NOT backfilled -- inventing a consent
 *     that was never given is worse than having none, because it is the thing a court would
 *     be asked to disbelieve. They are prompted instead.
 *   - It accepted an earlier version. A stored version that no longer matches TERMS_VERSION
 *     means the organization is operating under text it has not agreed to.
 *
 * Compared on exact string equality rather than by date order on purpose: an unrecognized or
 * malformed stored value re-prompts, which is the safe direction. Nothing here parses the
 * version, so a stored value from the future (a rolled-back deploy, say) also re-prompts
 * rather than being silently treated as good enough.
 */
export function needsTermsAcceptance(org: { termsAcceptedVersion: string | null }): boolean {
  return org.termsAcceptedVersion !== TERMS_VERSION;
}

/**
 * Whether this user is able to accept on the organization's behalf.
 *
 * Only an ADMIN. The agreement binds the organization, and an office user or technician has no
 * authority to commit it -- an acceptance clicked by a technician is exactly the kind of record
 * that invites an argument about apparent authority, which is the argument the clickwrap exists
 * to avoid having.
 *
 * This is also why the gate does not block everyone. A technician cannot satisfy the prompt, so
 * showing it to them would stop them working a route to no legal effect. They keep working; the
 * organization's admins are the ones held at the screen.
 */
export function canAcceptTerms(user: { role: string }): boolean {
  return user.role === "ADMIN";
}
