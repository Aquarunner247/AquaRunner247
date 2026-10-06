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

/** How far ahead of the due date a to-do starts appearing in the bell. */
export const REMINDER_CHOICES = [
  { days: 0, label: "On the day" },
  { days: 1, label: "1 day before" },
  { days: 3, label: "3 days before" },
  { days: 7, label: "1 week before" },
  { days: 14, label: "2 weeks before" },
] as const;

const MAX_REMIND_DAYS = 14;

/**
 * Parses the chosen lead time. Anything unrecognised becomes 0 -- "on the day" -- rather than being
 * rejected: a to-do that saved with a deadline and no reminder is still useful, and one that refused to
 * save because a dropdown was odd is not.
 */
export function parseRemindDaysBefore(raw: string): number {
  const value = Number(String(raw).trim());
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), MAX_REMIND_DAYS);
}

/**
 * The day a to-do starts showing in the bell: its due date minus the lead time.
 *
 * Stored on the row (CustomerTask.remindOn) because the bell filters across every customer, and
 * "dueOn - remindDaysBefore <= today" is a column comparison a Prisma where cannot express. Both
 * callers that set a due date go through here, so the stored value cannot disagree with the inputs.
 *
 * Null in, null out: a to-do with no deadline has no reminder day, and is shown immediately instead.
 */
export function reminderDayFor(dueOn: Date | null, remindDaysBefore: number): Date | null {
  if (!dueOn) return null;
  const remindOn = new Date(dueOn.getTime());
  remindOn.setUTCDate(remindOn.getUTCDate() - Math.max(0, remindDaysBefore));
  return remindOn;
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
