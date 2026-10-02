/**
 * The address every outbound email is sent from, and the name shown beside it.
 *
 * One definition rather than the seven copies of `process.env.RESEND_FROM_EMAIL || "..."` this
 * replaces -- those drifted out of reach of a single change, so switching the address meant finding
 * all of them and the fallback silently disagreed with whatever was configured.
 *
 * `service@` rather than `no-reply@`, which is Resend's own guidance: mailbox providers treat a
 * no-reply sender as a weaker signal, and a customer who replies to a service summary is doing a
 * reasonable thing.
 *
 * That only holds if the mailbox receives. Resend accepts no inbound mail by default, so service@
 * needs forwarding on the domain. Note the per-organization `replyTo`
 * (Organization.welcomeEmailSupportEmail) is what actually routes a customer's reply to a human, and
 * it overrides this address for replies -- the from address is about deliverability and recognition,
 * not reply handling.
 */

/** Must stay a mailbox on a domain verified in Resend. Sending from an unverified domain is rejected
 *  outright, so a wrong value here stops ALL mail rather than degrading. `mail.aquarunner247.com` is
 *  the verified sending subdomain; the root domain is not. */
const FALLBACK_FROM = "service@mail.aquarunner247.com";

/** What a customer sees when the sending organization has no white-label branding of its own. */
const PLATFORM_FROM_NAME = "AquaRunner 24/7";

/**
 * Makes an admin-entered business name safe to put in a mail header.
 *
 * Newlines are stripped first and deliberately: this value is operator-controlled and lands in a
 * header, where a CR or LF would let it inject headers of its own. Quotes and backslashes are dropped
 * rather than escaped, since the whole name is emitted as a quoted string and a business name
 * containing a literal quote is not worth the escaping logic. Length is capped so one long name
 * cannot produce an unreasonable header line.
 */
function sanitizeFromName(name: string): string | null {
  const cleaned = name
    .replace(/[\r\n]+/g, " ")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 78);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * `"Lindley's Pool & Spa Service" <service@mail.aquarunner247.com>`, or the bare address if there is
 * no usable name.
 *
 * Pass the organization's own name for a customer-facing email. The email body already honours white
 * labelling -- logo, colours, footer -- but the sender line did not, so `aquarunner247.com` was the
 * one place the platform showed through, in the first thing a customer sees in their inbox list.
 *
 * Leave it undefined for an internal email (waitlist, phone-agent ticket, scrub warning): those go to
 * the operator or to us and should keep the platform's identity. Callers already hold a `branding`
 * that is null unless the org is on a tier including white-labelling, so passing
 * `branding?.orgName` carries that gate with it rather than re-deriving it here.
 *
 * Always quoted, so an ampersand, apostrophe or period in a business name needs no special casing.
 */
export function resolveFromAddress(displayName?: string | null): string {
  const address = process.env.RESEND_FROM_EMAIL || FALLBACK_FROM;
  // Falls back to the platform name when the given one sanitizes away to nothing (a name that was
  // only quotes or whitespace). A sender with no name at all reads worse than the platform's.
  const name = sanitizeFromName(displayName ?? "") ?? sanitizeFromName(PLATFORM_FROM_NAME);
  return name ? `"${name}" <${address}>` : address;
}
