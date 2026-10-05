/**
 * Turns what an admin typed into a recipient list.
 *
 * One box, several addresses, because "send this day's email to the regional manager and accounts
 * payable" is one action rather than two. Pure, so the parsing is tested without sending anything.
 */

/** Resend takes up to 50 recipients per send; this is a resend by hand, so a far lower cap is the
 *  honest limit -- past a handful it is a mailing list, not a copy of one service report. */
const MAX_RECIPIENTS = 10;

export type ParsedRecipients = { ok: true; emails: string[] } | { ok: false; error: string };

/**
 * Commas, semicolons, spaces and newlines all separate, because all four are what comes out of a
 * contact list, a spreadsheet cell or a pasted email header.
 *
 * Case is lowered and duplicates are dropped: the same person twice in one send looks like a mistake to
 * them and is one to us. Order is preserved otherwise, so the recipient the admin typed first is first.
 */
export function parseEmailRecipients(raw: string): ParsedRecipients {
  const candidates = raw
    .split(/[,;\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  if (candidates.length === 0) return { ok: false, error: "Enter at least one email address." };

  const seen = new Set<string>();
  const emails: string[] = [];
  for (const candidate of candidates) {
    // Deliberately shallow -- something@something.something. Anything stricter rejects addresses that
    // genuinely work, and the cost of a wrong address here is a bounce the sender can see, not silence.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) {
      return { ok: false, error: `"${candidate}" doesn't look like an email address.` };
    }
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    emails.push(candidate);
  }

  if (emails.length > MAX_RECIPIENTS) {
    return { ok: false, error: `That's more than ${MAX_RECIPIENTS} addresses. Send it in smaller batches.` };
  }
  return { ok: true, emails };
}
