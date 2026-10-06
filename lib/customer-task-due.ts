/**
 * When a to-do counts as due.
 *
 * `CustomerTask.dueOn` is a `@db.Date`, which Prisma hands back as UTC midnight of that calendar day.
 * "Today" is a different thing in Nevada than it is in UTC, and that exact confusion already produced
 * one real bug here: the compliance log filed evening readings on the next day because it took the
 * day from the server's clock rather than the pool's (see lib/reading-log-days.ts). So the day is
 * resolved in the organization's timezone first and only then compared.
 *
 * Pure, so the boundary can be tested without a database.
 */
import { ymdInTimeZone } from "@/lib/timezone";

/**
 * The cutoff to compare `dueOn` against: UTC midnight of the organization's own today.
 *
 * `dueOn <= cutoff` is therefore "due today or overdue", and it stays correct in both directions --
 * a to-do due today does not become due early for an organization east of UTC, and does not stay
 * un-due all evening for one west of it.
 */
export function dueCutoffForTimeZone(now: Date, timeZone: string): Date {
  return new Date(`${ymdInTimeZone(now, timeZone)}T00:00:00.000Z`);
}

export type TaskDueState = "none" | "upcoming" | "today" | "overdue";

/** What to call a to-do's deadline, for the office reading a list of them. */
export function taskDueState(dueOn: Date | null | undefined, now: Date, timeZone: string): TaskDueState {
  if (!dueOn) return "none";
  const cutoff = dueCutoffForTimeZone(now, timeZone);
  const due = new Date(`${dueOn.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (due.getTime() === cutoff.getTime()) return "today";
  return due < cutoff ? "overdue" : "upcoming";
}

/**
 * Parses the date an admin typed. A browser date input submits YYYY-MM-DD, which is a calendar day with
 * no timezone -- exactly what the column stores, so it is turned into UTC midnight without being
 * reinterpreted through anybody's local clock. Anything else is treated as no date rather than guessed
 * at, because a to-do silently due on the wrong day is worse than one with no deadline.
 */
export function parseDueOn(raw: string): Date | null {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Rejects the dates a regex accepts and a calendar does not, e.g. 2026-02-31 rolling into March.
  return parsed.toISOString().slice(0, 10) === value ? parsed : null;
}
