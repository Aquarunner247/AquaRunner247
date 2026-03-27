/**
 * Service schedule: pick any subset of weekdays with size 1–7.
 * Weekday convention: ISO 8601 — 1 = Monday … 7 = Sunday.
 */
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const ALL_ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type ServiceWeekdayValidation =
  | { ok: true; weekdays: number[] }
  | { ok: false; error: string };

/**
 * Validates a list of weekdays for a body of water:
 * - 1 to 7 days selected (inclusive)
 * - each value must be 1–7 (Mon–Sun)
 * - no duplicates
 */
export function validateServiceWeekdays(input: number[]): ServiceWeekdayValidation {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "Select at least one service day (1–7 weekdays)." };
  }
  if (input.length > 7) {
    return { ok: false, error: "At most 7 service days allowed." };
  }

  const set = new Set<number>();
  for (const d of input) {
    if (!Number.isInteger(d) || d < 1 || d > 7) {
      return { ok: false, error: "Each weekday must be an integer from 1 (Monday) through 7 (Sunday)." };
    }
    if (set.has(d)) {
      return { ok: false, error: "Duplicate weekdays are not allowed." };
    }
    set.add(d);
  }

  const sorted = [...set].sort((a, b) => a - b);
  return { ok: true, weekdays: sorted };
}
