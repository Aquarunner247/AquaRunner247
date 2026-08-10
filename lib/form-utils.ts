/** Parses a FormData field into a finite number, or null for blank/non-numeric input.
 * Shared by every server action that reads a plain numeric `<input>` off a submitted form. */
export function parseFormNumber(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
