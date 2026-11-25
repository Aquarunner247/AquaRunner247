/**
 * Which day, for which account, this device has mirrored -- the one thing the offline shell
 * cannot work out for itself.
 *
 * Phase 1d of NATIVE-REBUILD-PLAN.md. The mirror in lib/client/local-store.ts is keyed by
 * `${technicianId}:${ymd}`, and with no network the shell knows neither half: the technician id
 * is a Prisma User id that only the server can map a session to, and "today" depends on the
 * ORGANIZATION's timezone, which is also a server fact. So the last successful prefetch leaves a
 * note saying what it stored, and the shell reads the note before the mirror.
 *
 * THE AUTH USER ID IS WHAT MAKES THIS SAFE ON A SHARED PHONE. The note records which Supabase
 * account the data belongs to, and the shell compares it against the session actually signed in
 * now -- a session the device holds locally, so the check works with no network, which is the
 * only time any of this runs. A second technician signing into the same handset therefore sees
 * "nothing saved for this account" rather than the first one's route. Without that comparison the
 * mirror would be a pile of customer addresses keyed by a stranger's id.
 *
 * localStorage rather than IndexedDB on purpose: this is read on first paint, before anything is
 * rendered, and it is one tiny record. It is also disposable -- losing it costs a prefetch, not
 * data, since nothing here is the only copy of anything.
 *
 * Pure, with storage injected, so every branch is tested without a browser. Same split as
 * lib/departure-watch-state.ts, which solves the same shape of problem for the dwell.
 */

import { shouldPruneDay } from "@/lib/local-store-policy";

export const FIELD_POINTER_KEY = "aquarunner.field.pointer.v1";

/** The two methods actually used, so a test can pass a plain object. */
export type PointerStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type FieldPointer = {
  /** Supabase auth user id -- the identity check, see above. */
  authUserId: string;
  /** Prisma User id, the first half of the mirror key. */
  technicianId: string;
  /** Local yyyy-mm-dd in the ORGANIZATION's timezone, as the server resolved it. */
  ymd: string;
  /** Epoch ms, so a note for a day the mirror has already pruned can be discarded with it. */
  savedAt: number;
};

function isPointer(value: unknown): value is FieldPointer {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<FieldPointer>;
  return (
    typeof p.authUserId === "string" &&
    p.authUserId.length > 0 &&
    typeof p.technicianId === "string" &&
    p.technicianId.length > 0 &&
    typeof p.ymd === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.ymd) &&
    typeof p.savedAt === "number" &&
    Number.isFinite(p.savedAt)
  );
}

/**
 * The stored note, or null.
 *
 * Every doubtful case yields null, because null means "prefetch again" and a wrong answer means
 * showing a technician the wrong day: storage that throws, absent, unparseable, the wrong shape,
 * or naming a day the mirror's own retention horizon has already dropped.
 */
export function readPointer(storage: PointerStorage | null, now: Date): FieldPointer | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(FIELD_POINTER_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPointer(parsed)) return null;

  // Pointing at a day lib/local-store-policy.ts would already have pruned. The data it names is
  // gone or going, so the note is worse than nothing.
  if (shouldPruneDay(parsed.ymd, now)) return null;

  return parsed;
}

export function writePointer(
  storage: PointerStorage | null,
  pointer: Omit<FieldPointer, "savedAt">,
  now: Date,
): void {
  if (!storage) return;
  try {
    storage.setItem(FIELD_POINTER_KEY, JSON.stringify({ ...pointer, savedAt: now.getTime() }));
  } catch {
    // A full or blocked localStorage costs the next offline open, not this one's data.
  }
}

export function clearPointer(storage: PointerStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(FIELD_POINTER_KEY);
  } catch {
    // Nothing to do, and nothing depends on it.
  }
}

/**
 * Whether the mirrored day belongs to the account signed in right now.
 *
 * Deliberately false for a null pointer and for a null/empty session id, so "we do not know who
 * this is" can never read as a match.
 */
export function pointerMatches(pointer: FieldPointer | null, authUserId: string | null | undefined): boolean {
  if (!pointer) return false;
  if (!authUserId) return false;
  return pointer.authUserId === authUserId;
}
