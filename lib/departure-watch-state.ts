/**
 * Keeping the departure dwell alive across the WebView process dying.
 *
 * This is the third cause of missed departures, and the only one of the three that is not simply
 * a bug (see NATIVE-REBUILD-PLAN.md, Phase 0). The rule in lib/departure-detection.ts needs a
 * technician to be seen continuously away for DEPARTURE_SUSTAINED_MS before it will call a
 * departure, and route-day-view.tsx held the "first seen away" marker for each stop in a
 * useRef -- which is to say, in the WebView's memory. The foreground service keeps the process
 * alive most of the time, but not always: the technician can swipe the app away, tap Cancel on
 * the tracking notification we ourselves invite them to tap, or Android can simply reclaim the
 * process. Any of those inside the three-minute window and the dwell restarted from nothing.
 *
 * So the markers are mirrored here, and a relaunched app resumes a dwell in progress instead of
 * forgetting it. That is a partial fix on purpose: nothing of ours runs while the process is
 * dead, so this only helps when the app comes back reasonably soon. The complete fix is to stop
 * holding the fence ourselves and register it with the OS -- GeofencingClient's EXIT transition
 * with a loitering delay, which starts a killed app through a PendingIntent -- and that needs
 * native code this app does not have yet.
 *
 * Storage is injected rather than reached for, same as lib/background-location-disclosure.ts, so
 * every boundary below is testable without a browser.
 */

import { DEPARTURE_SUSTAINED_MS } from "./departure-detection";

export type WatchStateStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** Versioned: a shape change must not be read as valid state by a client that half-upgraded. */
export const DEPARTURE_WATCH_STATE_KEY = "aquarunner.departureWatch.v1";

/**
 * How stale a persisted marker may be and still be resumed.
 *
 * Deliberately only a little longer than the dwell it is protecting. The marker says "this
 * technician was last seen 180m away at T" -- and while the process was dead we saw nothing at
 * all, so we cannot know they did not walk back. Resuming a marker from hours ago would risk
 * closing a visit that was still being worked, which is the failure the arrival route's own
 * comment describes landing 126-hour durations in customers' reports. Within a few minutes the
 * guess is safe; past that, concluding nothing is the correct answer.
 */
export const DEPARTURE_RESUME_WINDOW_MS = DEPARTURE_SUSTAINED_MS + 5 * 60 * 1000;

type Persisted = {
  /** Local yyyy-mm-dd. Yesterday's markers must never resurrect onto today's stops. */
  day: string;
  /** visitId -> epoch ms of the first away-fix in the current run. */
  awaySince: Record<string, number>;
};

/** Local calendar day, which is the only thing this needs a date for -- see `day` above. */
export function localDayKey(now: Date): string {
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/**
 * The markers worth resuming: this day's, and recent enough to still mean something.
 *
 * Returns an empty map for anything it cannot trust -- absent, unparseable, a different day, or
 * simply too old. Silence is always the safe answer here: an empty map means the dwell starts
 * over, which is exactly the behaviour this module exists to improve on and never worse than it.
 */
export function loadAwaySince(storage: WatchStateStorage | null, now: Date): Map<string, Date> {
  const empty = new Map<string, Date>();
  if (!storage) return empty;

  let parsed: Persisted;
  try {
    const raw = storage.getItem(DEPARTURE_WATCH_STATE_KEY);
    if (!raw) return empty;
    parsed = JSON.parse(raw) as Persisted;
  } catch {
    return empty; // corrupt or half-written -- start over rather than guess
  }
  if (!parsed || typeof parsed !== "object") return empty;
  if (parsed.day !== localDayKey(now)) return empty;
  if (!parsed.awaySince || typeof parsed.awaySince !== "object") return empty;

  const resumed = new Map<string, Date>();
  for (const [visitId, at] of Object.entries(parsed.awaySince)) {
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    // A marker from the future is a clock that moved, not an observation. Drop it.
    if (at > now.getTime()) continue;
    if (now.getTime() - at > DEPARTURE_RESUME_WINDOW_MS) continue;
    resumed.set(visitId, new Date(at));
  }
  return resumed;
}

/** Mirrors the live markers. Writing nothing clears the key rather than leaving a stale day behind. */
export function saveAwaySince(storage: WatchStateStorage | null, markers: Map<string, Date>, now: Date): void {
  if (!storage) return;
  try {
    if (markers.size === 0) {
      storage.removeItem(DEPARTURE_WATCH_STATE_KEY);
      return;
    }
    const awaySince: Record<string, number> = {};
    for (const [visitId, at] of markers) awaySince[visitId] = at.getTime();
    const payload: Persisted = { day: localDayKey(now), awaySince };
    storage.setItem(DEPARTURE_WATCH_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full, or disabled by the WebView. Losing the mirror costs us the resume, which is
    // the status quo this module improves on -- it must never break the live watcher.
  }
}
