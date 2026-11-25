/**
 * The decisions the offline read-mirror makes, kept away from IndexedDB so they can be tested.
 *
 * Phase 1c of NATIVE-REBUILD-PLAN.md. lib/client/local-store.ts does the storage and is
 * deliberately thin, matching lib/client/offline-queue.ts, which has no tests because IndexedDB
 * does not exist in the node test environment. Everything here is a rule rather than a
 * mechanism, so everything here is testable -- same split as lib/departure-detection.ts against
 * app/components/route-day-view.tsx.
 */

/** How old a mirrored response may be before a refresh is worth making the technician wait for. */
export const MIRROR_FRESH_MS = 2 * 60 * 1000;

/**
 * How many days of mirrored data to keep.
 *
 * Today plus a little history. The mirror exists so a technician can work a day they have
 * already loaded; it is not an archive, and a phone that has been in service for a year must not
 * be carrying a year of routes around. Yesterday is kept because a day finished at 23:58 is
 * still being closed out after midnight -- see the completedAt note in the visit form.
 */
export const MIRROR_RETAIN_DAYS = 3;

/** Namespaced so a day cached for one technician cannot be served to another on a shared phone. */
export function dayKey(technicianId: string, ymd: string): string {
  return `${technicianId}:${ymd}`;
}

/**
 * Whether a mirrored record is fresh enough to use without waiting for the network.
 *
 * Note this is NOT about whether to use the mirror at all -- offline, a stale mirror is still
 * the best thing available and is always better than an error. It only decides whether to show
 * it immediately while refreshing behind it, or to wait.
 */
export function isFresh(fetchedAt: number | null | undefined, now: Date): boolean {
  if (fetchedAt == null || !Number.isFinite(fetchedAt)) return false;
  // A record stamped in the future is a clock that moved, not a fresh record.
  if (fetchedAt > now.getTime()) return false;
  return now.getTime() - fetchedAt <= MIRROR_FRESH_MS;
}

/** Local yyyy-mm-dd, shifted by `offsetDays`. Used for both the day key and the prune horizon. */
export function ymdOffsetFrom(now: Date, offsetDays: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The oldest yyyy-mm-dd worth keeping. Anything strictly before this is prunable. */
export function pruneHorizonYmd(now: Date): string {
  return ymdOffsetFrom(now, -(MIRROR_RETAIN_DAYS - 1));
}

/**
 * Whether a mirrored day should be dropped.
 *
 * String comparison is safe because ymdOffsetFrom zero-pads -- "2026-01-05" and "2026-11-24"
 * compare the same way as the dates do, which is the whole reason for the padding.
 */
export function shouldPruneDay(ymd: string, now: Date): boolean {
  return ymd < pruneHorizonYmd(now);
}
