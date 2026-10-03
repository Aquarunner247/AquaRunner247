/**
 * Turns what an admin typed into a contact row, or says why it cannot be one.
 *
 * Pure and separate from the action so it can be tested without a database, the same split
 * lib/dose-product-selection.ts and lib/reading-log-days.ts use.
 */

export type CustomerContactInput = {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
};

export type ParsedCustomerContact = { ok: true; value: CustomerContactInput } | { ok: false; error: string };

/** Long enough for any real name or title, short enough that one paste cannot bloat a row. */
const MAX_LENGTH = 120;

function clean(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LENGTH);
  return value.length > 0 ? value : null;
}

/**
 * A name is the only thing required. A regional manager you have a name and a title for but no direct
 * number is still worth recording -- demanding an email would mean inventing one, and a made-up address
 * in a contact list is worse than a blank.
 *
 * The email check is deliberately shallow: something@something.something. Anything stricter rejects
 * addresses that work, and this field is read by a person rather than used to send -- see
 * CustomerContact's own note on why nothing here is emailed.
 */
export function parseCustomerContact(formData: {
  get(name: string): FormDataEntryValue | null;
}): ParsedCustomerContact {
  const name = clean(formData.get("name"));
  if (!name) return { ok: false, error: "A name is required." };

  const email = clean(formData.get("email"));
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That email address doesn't look right." };
  }

  return {
    ok: true,
    value: { name, title: clean(formData.get("title")), email, phone: clean(formData.get("phone")) },
  };
}
