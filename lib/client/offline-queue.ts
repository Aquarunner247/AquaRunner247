"use client";

/**
 * Generic offline queue for visit-completion mutations (readings, doses, checklist,
 * photos). When a submission fails because the device has no network — not because the
 * server rejected it — the request is persisted in IndexedDB and replayed automatically
 * once connectivity returns, so a technician never loses on-site work to a dead zone.
 *
 * HTTP-level failures (validation errors, 403s, etc.) are never queued: retrying those
 * forever wouldn't help and would hide a real error behind a false "will sync" message.
 * Only genuine network failures (fetch throwing, or the browser already reporting
 * offline) get queued.
 */

const DB_NAME = "aquarunner-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-requests";
const MAX_ATTEMPTS = 8;

export type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  label: string;
  visitId: string;
  contentType: "json" | "form-data";
  jsonBody?: unknown;
  formFields?: { name: string; value: string }[];
  formFiles?: { name: string; file: Blob; filename: string; type: string }[];
  createdAt: number;
  attempts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const QUEUE_CHANGED_EVENT = "aquarunner-offline-queue-changed";

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

async function addPending(item: QueuedRequest): Promise<void> {
  await withStore("readwrite", (store) => store.add(item));
  notifyQueueChanged();
}

async function removePending(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
  notifyQueueChanged();
}

async function updatePending(item: QueuedRequest): Promise<void> {
  await withStore("readwrite", (store) => store.put(item));
}

export async function getAllPending(): Promise<QueuedRequest[]> {
  if (typeof indexedDB === "undefined") return [];
  return withStore("readonly", (store) => store.getAll());
}

export async function countPending(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  return withStore("readonly", (store) => store.count());
}

function buildFetchInit(item: QueuedRequest): RequestInit {
  if (item.contentType === "json") {
    return {
      method: item.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.jsonBody),
    };
  }
  const formData = new FormData();
  for (const f of item.formFields ?? []) formData.append(f.name, f.value);
  for (const f of item.formFiles ?? []) formData.append(f.name, f.file, f.filename);
  return { method: item.method, body: formData };
}

type SubmitResult = { status: "sent"; response: Response } | { status: "queued" } | { status: "failed"; response: Response };

async function trySend(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

/** Submit a JSON mutation, queuing it locally if — and only if — the network itself is the problem. */
export async function queuedSubmitJson(opts: {
  url: string;
  method: string;
  label: string;
  visitId: string;
  body: unknown;
}): Promise<SubmitResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await addPending({
      id: crypto.randomUUID(),
      url: opts.url,
      method: opts.method,
      label: opts.label,
      visitId: opts.visitId,
      contentType: "json",
      jsonBody: opts.body,
      createdAt: Date.now(),
      attempts: 0,
    });
    return { status: "queued" };
  }
  try {
    const response = await trySend(opts.url, {
      method: opts.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.body),
    });
    return { status: response.ok ? "sent" : "failed", response };
  } catch {
    await addPending({
      id: crypto.randomUUID(),
      url: opts.url,
      method: opts.method,
      label: opts.label,
      visitId: opts.visitId,
      contentType: "json",
      jsonBody: opts.body,
      createdAt: Date.now(),
      attempts: 0,
    });
    return { status: "queued" };
  }
}

/** Submit a FormData mutation (photo upload), queuing the file itself if offline. */
export async function queuedSubmitFormData(opts: {
  url: string;
  method: string;
  label: string;
  visitId: string;
  formData: FormData;
}): Promise<SubmitResult> {
  const toQueuedItem = (): QueuedRequest => {
    const formFields: { name: string; value: string }[] = [];
    const formFiles: { name: string; file: Blob; filename: string; type: string }[] = [];
    for (const [name, value] of opts.formData.entries()) {
      if (value instanceof File) {
        formFiles.push({ name, file: value, filename: value.name, type: value.type });
      } else {
        formFields.push({ name, value: String(value) });
      }
    }
    return {
      id: crypto.randomUUID(),
      url: opts.url,
      method: opts.method,
      label: opts.label,
      visitId: opts.visitId,
      contentType: "form-data",
      formFields,
      formFiles,
      createdAt: Date.now(),
      attempts: 0,
    };
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await addPending(toQueuedItem());
    return { status: "queued" };
  }
  try {
    const response = await trySend(opts.url, { method: opts.method, body: opts.formData });
    return { status: response.ok ? "sent" : "failed", response };
  } catch {
    await addPending(toQueuedItem());
    return { status: "queued" };
  }
}

/**
 * Replays every queued request in order. Stops as soon as one fails with a network error
 * (assume connectivity dropped again mid-drain) so remaining items stay queued rather than
 * firing a burst of doomed requests. HTTP-level failures on retry count as an attempt and
 * get dropped after MAX_ATTEMPTS, so one bad item can't block the queue forever.
 */
export async function drainQueue(): Promise<{ synced: number; remaining: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, remaining: await countPending() };
  }
  const items = await getAllPending();
  items.sort((a, b) => a.createdAt - b.createdAt);
  let synced = 0;
  for (const item of items) {
    try {
      const response = await trySend(item.url, buildFetchInit(item));
      if (response.ok) {
        await removePending(item.id);
        synced++;
      } else if (item.attempts + 1 >= MAX_ATTEMPTS) {
        await removePending(item.id);
      } else {
        await updatePending({ ...item, attempts: item.attempts + 1 });
      }
    } catch {
      break; // network failed again — leave this and remaining items queued
    }
  }
  return { synced, remaining: await countPending() };
}

let listenerAttached = false;

/** Wires up auto-drain on reconnect. Safe to call from multiple components — only attaches once. */
export function initOfflineSync() {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;
  window.addEventListener("online", () => void drainQueue());
  // Belt-and-suspenders: the 'online' event doesn't fire reliably on every platform.
  window.setInterval(() => void drainQueue(), 30_000);
  void drainQueue();
}
