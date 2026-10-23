/**
 * The confirmation gate for deleting an organization account, and the sentence describing what
 * survives it.
 *
 * Its own module, with no database, Stripe or Supabase imports, for the reason
 * lib/marketing-routes.ts gives: lib/supabase/admin.ts is `server-only`, which vitest refuses
 * to load, so anything reachable from the orchestrator in lib/account-deletion.ts cannot be
 * tested directly. This is the part that most needs testing -- it is the only thing between an
 * admin and irreversible deletion -- so it lives where a test can reach it.
 */

/** What survives deletion, in the words the UI and the documents both use. */
export const RETAINED_AFTER_DELETION =
  "water-reading logs, contamination incident records, and inspection reports, plus the customer, " +
  "property, and body-of-water names needed to display them";

/**
 * Whether what the admin typed matches the organization's own name.
 *
 * Trimmed and case-insensitive: this is a speed bump to make deletion deliberate, not a
 * spelling test. Internal whitespace is collapsed too, so a double space pasted from the
 * dashboard header does not read as a mismatch.
 *
 * An organization whose name is blank cannot be confirmed this way, and returns false rather
 * than accepting an empty string -- otherwise an empty box would delete the account.
 */
export function confirmationMatches(typed: string, organizationName: string | null): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const target = normalize(organizationName ?? "");
  if (target.length === 0) return false;
  return normalize(typed) === target;
}

/**
 * The name an admin is asked to type. Falls back to `name` when `businessName` is unset, which
 * is what the dashboard header shows them in that case.
 */
export function confirmationLabel(org: { businessName: string | null; name: string }): string {
  return org.businessName ?? org.name;
}
