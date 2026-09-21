/**
 * Every visit timestamp (startedAt, completedAt, VisitPhoto.takenAt, etc.) is stored
 * correctly as a UTC instant. The bug this file fixes: rendering those with a bare
 * `.toLocaleString()`/`.toLocaleTimeString()` on the server uses the SERVER's runtime
 * timezone, not the business's -- and Vercel's Node.js functions run in UTC, not
 * Pacific/Nevada, so a visit completed at 8:23 AM local was showing as 3:23 PM (its
 * literal UTC clock reading). Always pass a `timeZone` explicitly, resolved from the
 * org's own state, when formatting a date for a human to read.
 */

// USPS 2-letter code -> IANA time zone. States spanning multiple zones use their most
// populous/likely-service-area zone (e.g. Texas -> Central, Florida -> Eastern) --
// this is for display only, never for compliance-deadline math.
const STATE_TIME_ZONES: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago",
  CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York",
  DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  ID: "America/Denver", IL: "America/Chicago", IN: "America/New_York", IA: "America/Chicago",
  KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", MI: "America/New_York", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago",
  NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver",
  NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago",
  UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles",
  WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver",
};

/** Nevada is this app's home base (SNHD/Las Vegas) -- the safest fallback when an org
 * has no state set yet, since that's this business's actual own timezone. */
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export function timeZoneForState(state: string | null | undefined): string {
  if (!state) return DEFAULT_TIME_ZONE;
  return STATE_TIME_ZONES[state.toUpperCase()] ?? DEFAULT_TIME_ZONE;
}

export function formatLocalDateTime(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatLocalTime(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, { timeZone, hour: "numeric", minute: "2-digit" });
}

/** Date-only (no time-of-day) -- still timezone-aware, since a captured instant close to
 * midnight UTC can land on the wrong calendar day if rendered without the business's
 * own timezone (e.g. a photo taken at 11pm Pacific is already "tomorrow" in UTC). */
export function formatLocalDate(date: Date | null | undefined, timeZone: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return "—";
  return date.toLocaleDateString(undefined, { timeZone, month: "short", day: "numeric", ...opts });
}

/** The UTC instant corresponding to local midnight, in `timeZone`, on the calendar day
 * `date` falls on (in that same zone). Standard round-trip technique: format a UTC-midnight
 * guess through the target zone, measure the drift, and correct for it -- accurate for this
 * app's use (day-boundary cutoffs like "is this visit overdue yet"), not sub-second-precise
 * DST-transition edge cases. Used instead of ServiceVisit.scheduledStart's own clock reading
 * for day-boundary comparisons, since scheduledStart is a pure same-day sort key (see
 * lib/visit-generation.ts), not a real time -- comparing it directly against `now` treats a
 * fake anchor as if it were meaningful wall-clock time. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const dayParts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const getDay = (type: string) => Number(dayParts.find((p) => p.type === type)?.value ?? 0);
  const year = getDay("year");
  const month = getDay("month");
  const day = getDay("day");

  // Round-trip correction: guess UTC midnight for that Y-M-D, see what wall-clock time
  // that guess actually reads as in `timeZone`, and shift by the drift.
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const wallParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(guess);
  const getWall = (type: string) => Number(wallParts.find((p) => p.type === type)?.value ?? 0);
  const hour = getWall("hour") % 24; // Intl can report "24" for midnight
  const asUtc = Date.UTC(getWall("year"), getWall("month") - 1, getWall("day"), hour, getWall("minute"), getWall("second"));
  const driftMs = asUtc - guess.getTime();
  return new Date(guess.getTime() - driftMs);
}

/** "YYYY-MM-DD" for the calendar day `date` falls on in `timeZone`. The schedule pages use
 * this (never a bare Date's own getDay()/getDate(), which read the SERVER's clock -- UTC on
 * Vercel) to decide which day a visitor is looking at or what "today" means for them. */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The UTC instant range [start, end) for local calendar day `ymd` ("YYYY-MM-DD") in
 * `timeZone`. `end` is exclusive (start of the next local day) -- use `lt: end`, not
 * `lte`, in Prisma range queries built from this. Noon UTC on the target Y-M-D is never on
 * a different calendar day in `timeZone` for any real-world UTC offset (-12 to +14), so
 * it's safe to feed straight into startOfLocalDay. */
export function localDayBounds(ymd: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, day] = ymd.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const start = startOfLocalDay(noonUtc, timeZone);
  const nextNoonUtc = new Date(noonUtc.getTime() + 24 * 60 * 60 * 1000);
  const end = startOfLocalDay(nextNoonUtc, timeZone);
  return { start, end };
}

/** Add `days` (may be negative) to a "YYYY-MM-DD" string as pure Gregorian calendar-day
 * arithmetic -- no timezone or DST involved, since it never leaves Y-M-D/UTC-scratchpad
 * space. This is the right tool for "what day is this + N days", as opposed to
 * localDayBounds, which is the only place an actual IANA zone should enter the picture. */
export function addDaysToYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday (Mon=1..Sun=7) for a "YYYY-MM-DD" string -- independent of any timezone,
 * since it's derived from the calendar string itself, not from an instant. */
export function isoWeekdayOfYmd(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // Sun=0..Sat=6
  return ((jsDay + 6) % 7) + 1;
}

/** The Monday ("YYYY-MM-DD") of the week containing `ymd`. */
export function startOfWeekYmd(ymd: string): string {
  const weekday = isoWeekdayOfYmd(ymd); // Mon=1..Sun=7
  return addDaysToYmd(ymd, -(weekday - 1));
}
