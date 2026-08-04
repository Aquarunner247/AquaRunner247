"use client";

import { useEffect, useState } from "react";
import { countPending, drainQueue, initOfflineSync, QUEUE_CHANGED_EVENT } from "./offline-queue";

/** Tracks how many visit-completion submissions are queued locally waiting to sync. */
export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    initOfflineSync();
    let cancelled = false;
    const refresh = () => {
      void countPending().then((n) => {
        if (!cancelled) setPendingCount(n);
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 3000);
    window.addEventListener("online", refresh);
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", refresh);
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
    };
  }, []);

  async function syncNow() {
    const result = await drainQueue();
    setPendingCount(result.remaining);
    return result;
  }

  return { pendingCount, syncNow };
}
