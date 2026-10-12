/**
 * How long the technician was on site, as the service report should state it.
 *
 * Pure and separate from lib/email.ts so the edge cases below can be tested without Resend --
 * same split as lib/mail/task-digest-email.ts.
 *
 * Three sources, in descending order of what they actually prove:
 *
 *  1. Arrival to completion, when completion is close behind the last evidence of work. This is
 *     the real figure and the only one stated plainly.
 *
 *  2. Arrival to the last photo, when completion is not. Completion is when somebody pressed
 *     Complete, which here is routinely hours later in a batch at the end of a route -- six stops
 *     across three properties closed inside twelve minutes on 2026-10-09. A photo's takenAt comes
 *     off the camera and proves work was happening at that moment, so arrival-to-last-photo is a
 *     span that definitely was worked.
 *
 *     It is a floor, not the duration: work carried on after the last photo by some unknown
 *     amount. So it is labelled "at least", and the earlier decision to withhold this rather than
 *     state it was right to the extent that stating it as exact would have been a guess -- the
 *     label is what makes it honest rather than the arithmetic.
 *
 *  3. Nothing, when there is no arrival or no photo after it. Better a report with two clock times
 *     than an invented span.
 */

/** Completion later than this past the last photo is paperwork, not time on site. */
export const COMPLETION_LAG_TOLERANCE_MS = 45 * 60 * 1000;

export type OnSiteInput = {
  /** Null when never logged, or backfilled to equal completedAt (which is the same as never). */
  startedAt: Date | null;
  completedAt: Date;
  /** Latest photo takenAt across the bundle. Null when no photo carried one. */
  lastPhotoAt: Date | null;
};

export type OnSiteDuration =
  | { kind: "measured"; ms: number }
  | { kind: "atLeast"; ms: number }
  | { kind: "unknown" };

export function onSiteDuration({ startedAt, completedAt, lastPhotoAt }: OnSiteInput): OnSiteDuration {
  // A backfilled arrival equals completion exactly -- that is "never arrived", not a zero-length
  // visit, and nothing can be derived from it.
  if (startedAt == null || startedAt.getTime() === completedAt.getTime()) return { kind: "unknown" };
  if (completedAt.getTime() < startedAt.getTime()) return { kind: "unknown" };

  if (lastPhotoAt != null && completedAt.getTime() - lastPhotoAt.getTime() <= COMPLETION_LAG_TOLERANCE_MS) {
    return { kind: "measured", ms: completedAt.getTime() - startedAt.getTime() };
  }

  // Only a photo taken AFTER arrival says anything about this visit's span. A photo from before it
  // belongs to the day the stop was first attempted, which is exactly the shape a picked-up stop
  // used to have before arrival started re-stamping on resume.
  if (lastPhotoAt != null && lastPhotoAt.getTime() > startedAt.getTime()) {
    return { kind: "atLeast", ms: lastPhotoAt.getTime() - startedAt.getTime() };
  }

  return { kind: "unknown" };
}

/** "1h 12m" / "42m" / "<1m" -- never a raw minute count over 60 or a decimal, since this is read
 *  at a glance next to two clock times, not computed from. */
export function formatDurationMs(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 1) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** The sub-label under "Completed", or undefined when nothing honest can be said. */
export function onSiteLabel(input: OnSiteInput): string | undefined {
  const d = onSiteDuration(input);
  if (d.kind === "measured") return `${formatDurationMs(d.ms)} on site`;
  if (d.kind === "atLeast") return `at least ${formatDurationMs(d.ms)} on site`;
  return undefined;
}
