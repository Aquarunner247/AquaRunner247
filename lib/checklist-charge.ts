/**
 * Parses what an admin typed into the price box on a chargeable checklist item.
 *
 * Deliberately forgiving about the shape and strict about the value. Somebody pricing a filter
 * clean types "45", "$45", "45.00" or "1,200" depending on habit, and all four mean the same
 * thing; none of them should be rejected with an error the office then has to decode. What is NOT
 * forgiven is a value that would be wrong on an invoice -- a negative, a stray letter, or more
 * precision than money has.
 *
 * Blank means "no price set", not zero. The distinction is visible to the technician: an item
 * marked chargeable with no price reads "Extra" on the button, which is the honest state while the
 * company is still deciding what to charge. Writing 0 instead would tell the technician the work is
 * free.
 */
export type ParsedCharge = { ok: true; value: number | null } | { ok: false; reason: string };

/** A filter clean is tens of dollars; the cap only exists to catch a slipped keyboard. */
const MAX_CHARGE = 100_000;

export function parseChargeAmount(raw: string | null | undefined): ParsedCharge {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return { ok: true, value: null };

  const cleaned = trimmed.replace(/^\$/, "").replace(/,/g, "").trim();
  // Anchored, and no exponent form: "1e3" in a price box is a typo, not a thousand dollars.
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, reason: "Enter a price like 45 or 45.00." };
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, reason: "Enter a price like 45 or 45.00." };
  if (value > MAX_CHARGE) return { ok: false, reason: `Price cannot be more than $${MAX_CHARGE.toLocaleString()}.` };

  return { ok: true, value };
}
