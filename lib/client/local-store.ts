"use client";

/**
 * The offline read-mirror: today's route, each stop, and the shared reference set, held locally
 * so they can be opened with no signal.
 *
 * Phase 1c of NATIVE-REBUILD-PLAN.md, and the half of the offline story that was missing.
 * lib/client/offline-queue.ts already replays WRITES from a dead zone -- readings, doses,
 * checklist, photos. What never worked was OPENING a stop, because every read in this app was a
 * server-rendered page. The three GET endpoints added in Phase 1b are the source; this is where
 * their responses live.
 *
 * A SEPARATE IndexedDB DATABASE from the outbound queue, deliberately. Adding a store to
 * "aquarunner-offline" would mean bumping its version, and that database holds unsent field work
 * including photos -- real work a technician cannot redo. A mirror is rebuildable from the
 * server by definition, so it must not share a schema upgrade path with something that is not.
 *
 * Thin on purpose, like offline-queue.ts: IndexedDB does not exist in the node test
 * environment, so every actual decision lives in lib/local-store-policy.ts where it can be
 * tested. Nothing here should acquire a rule.
 */

import { dayKey, isFresh, shouldPruneDay } from "@/lib/local-store-policy";

const DB_NAME = "aquarunner-local-reads";
const DB_VERSION = 1;
const DAYS = "days";
const VISITS = "visits";
const REFERENCE = "reference";
/** Single-row store; the key is constant because there is only ever one reference set per org. */
const REFERENCE_KEY = "current";

type Mirrored<T> = { key: string; fetchedAt: number; payload: T };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [DAYS, VISITS, REFERENCE]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/** True when there is somewhere to mirror to at all -- private mode and SSR both say no. */
function available(): boolean {
  return typeof indexedDB !== "undefined";
}

async function put<T>(store: string, key: string, payload: T, now: Date): Promise<void> {
  if (!available()) return;
  const record: Mirrored<T> = { key, fetchedAt: now.getTime(), payload };
  try {
    await withStore(store, "readwrite", (s) => s.put(record));
  } catch {
    // A full or blocked store costs the mirror, not the request that produced it. Never throw
    // into a caller that was only trying to display something.
  }
}

async function get<T>(store: string, key: string): Promise<Mirrored<T> | null> {
  if (!available()) return null;
  try {
    const found = await withStore<Mirrored<T> | undefined>(store, "readonly", (s) => s.get(key));
    return found ?? null;
  } catch {
    return null;
  }
}

export type MirroredRead<T> = { payload: T; fetchedAt: number; fresh: boolean } | null;

function asRead<T>(record: Mirrored<T> | null, now: Date): MirroredRead<T> {
  if (!record) return null;
  return { payload: record.payload, fetchedAt: record.fetchedAt, fresh: isFresh(record.fetchedAt, now) };
}

export async function putMirroredDay<T>(technicianId: string, ymd: string, payload: T, now = new Date()): Promise<void> {
  await put(DAYS, dayKey(technicianId, ymd), payload, now);
}

export async function getMirroredDay<T>(technicianId: string, ymd: string, now = new Date()): Promise<MirroredRead<T>> {
  return asRead(await get<T>(DAYS, dayKey(technicianId, ymd)), now);
}

export async function putMirroredVisit<T>(visitId: string, payload: T, now = new Date()): Promise<void> {
  await put(VISITS, visitId, payload, now);
}

export async function getMirroredVisit<T>(visitId: string, now = new Date()): Promise<MirroredRead<T>> {
  return asRead(await get<T>(VISITS, visitId), now);
}

export async function putMirroredReference<T>(payload: T, now = new Date()): Promise<void> {
  await put(REFERENCE, REFERENCE_KEY, payload, now);
}

export async function getMirroredReference<T>(now = new Date()): Promise<MirroredRead<T>> {
  return asRead(await get<T>(REFERENCE, REFERENCE_KEY), now);
}

/**
 * Drops mirrored days past the retention horizon, and the visits belonging to them.
 *
 * Visits are keyed by visit id rather than by date, so they cannot be pruned by their own key.
 * They are pruned by their `fetchedAt` instead, against the same horizon -- a visit last
 * mirrored four days ago belongs to a day that is no longer kept.
 */
export async function pruneMirror(now = new Date()): Promise<void> {
  if (!available()) return;
  try {
    const days = await withStore<Mirrored<unknown>[]>(DAYS, "readonly", (s) => s.getAll());
    for (const record of days) {
      // key is `${technicianId}:${ymd}` -- take the ymd from the end, since an id could
      // itself contain a colon.
      const ymd = record.key.slice(record.key.lastIndexOf(":") + 1);
      if (shouldPruneDay(ymd, now)) await withStore(DAYS, "readwrite", (s) => s.delete(record.key));
    }

    const visits = await withStore<Mirrored<unknown>[]>(VISITS, "readonly", (s) => s.getAll());
    for (const record of visits) {
      const ageDays = (now.getTime() - record.fetchedAt) / 86_400_000;
      const stamped = new Date(record.fetchedAt);
      if (ageDays > 0 && shouldPruneDay(
        `${stamped.getFullYear()}-${`${stamped.getMonth() + 1}`.padStart(2, "0")}-${`${stamped.getDate()}`.padStart(2, "0")}`,
        now,
      )) {
        await withStore(VISITS, "readwrite", (s) => s.delete(record.key));
      }
    }
  } catch {
    // Pruning is housekeeping. Failing it costs disk, not correctness.
  }
}

/**
 * Pull the whole day down while there is still signal, and mirror it.
 *
 * This is the point of the entire phase: a technician who opens the app at the depot gets the
 * day, the reference set and every stop on it, so the dead zone at stop seven is survivable. It
 * is deliberately a single explicit act rather than something that happens per screen -- the
 * moment that matters is the one BEFORE coverage is lost, and only the technician knows when
 * that is about to be.
 *
 * Returns what it managed to get rather than throwing, because a partial mirror is still useful:
 * the day alone is enough to see where to drive, even if a stop's detail did not land.
 */
export async function prefetchDay(opts: {
  technicianId: string;
  ymd: string;
  /** Injected so this is testable and so a native client can supply its own bearer-auth fetch. */
  fetchJson?: (url: string) => Promise<unknown>;
  now?: Date;
}): Promise<{ day: boolean; reference: boolean; visits: number; failed: number }> {
  const now = opts.now ?? new Date();
  const fetchJson =
    opts.fetchJson ??
    (async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });

  const result = { day: false, reference: false, visits: 0, failed: 0 };

  let stopIds: string[] = [];
  try {
    const day = (await fetchJson(`/api/technician/day?date=${encodeURIComponent(opts.ymd)}`)) as {
      stops?: { id: string }[];
    };
    await putMirroredDay(opts.technicianId, opts.ymd, day, now);
    result.day = true;
    stopIds = (day.stops ?? []).map((s) => s.id);
  } catch {
    result.failed += 1;
  }

  try {
    await putMirroredReference(await fetchJson("/api/technician/reference"), now);
    result.reference = true;
  } catch {
    result.failed += 1;
  }

  // Sequential, not parallel: this runs on a phone that may already be on one bar, and twenty
  // simultaneous requests is how you turn a weak connection into no connection.
  for (const id of stopIds) {
    try {
      await putMirroredVisit(id, await fetchJson(`/api/visits/${encodeURIComponent(id)}`), now);
      result.visits += 1;
    } catch {
      result.failed += 1;
    }
  }

  void pruneMirror(now);
  return result;
}
