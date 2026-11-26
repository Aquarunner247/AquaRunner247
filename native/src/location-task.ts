import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { BridgeLocationFix } from "@/lib/native-bridge-protocol";

/**
 * The background location task, and the one place fixes enter the app from the OS.
 *
 * `defineTask` MUST run at module scope -- see index.js. Android can start this process directly
 * into the task without ever showing the UI, and a task defined inside a component would not
 * exist yet when that happens; the OS then logs "task not found" and the fix is gone.
 *
 * WHAT REPLACES WHAT. The Capacitor build used @capacitor-community/background-geolocation, whose
 * whole job was keeping a foreground service alive and handing fixes to a WebView callback. Here
 * that splits in two: expo-location runs the service, and this module routes what it produces to
 * whichever watchers the page currently has open. The behaviour the technician depends on is the
 * same -- fixes keep arriving with the app backgrounded or the phone locked, which is the gap
 * that made auto-arrival unreliable for anyone who switches to Maps between stops.
 */
export const BACKGROUND_LOCATION_TASK = "aquarunner-background-location";

export type LocationSink = {
  onFix: (fix: BridgeLocationFix) => void;
  onError: (failure: { denied: boolean; message: string }) => void;
};

let sink: LocationSink | null = null;

/** Where fixes go. Null while no WebView is listening -- which happens on a cold start into the
 * background task, before App.tsx has mounted. A fix then has nowhere to go and is dropped,
 * which is correct: the page it would have gone to does not exist. */
export function setLocationSink(next: LocationSink | null): void {
  sink = next;
}

/**
 * An OS fix in the shape the page already consumes, or null if it cannot be trusted.
 *
 * A fix with no reported accuracy is DROPPED rather than guessed at. The page turns accuracy
 * into a tolerance buffer around each stop's radius (route-day-view's handleFix), and there is no
 * safe stand-in: a small value makes departure fire too eagerly, a large one makes arrival
 * impossible, and picking either would silently shift when the day gets stamped. Android always
 * reports accuracy, so this is a guard rather than a path.
 */
export function toBridgeFix(location: Location.LocationObject): BridgeLocationFix | null {
  const { latitude, longitude, accuracy } = location.coords;
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy < 0) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, accuracyMeters: accuracy };
}

// `async` because TaskManager's executor type requires a promise -- it awaits the task so the OS
// knows when the work is finished and the process may be suspended again.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    // The OS reports a task error as a message, with no permission/outage distinction. Reported
    // as not-denied so the page says "signal lost" rather than sending the technician to a
    // settings screen that is already correct -- a denial arrives through the permission request
    // instead, where it is unambiguous.
    sink?.onError({ denied: false, message: error.message });
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | null)?.locations ?? [];
  for (const location of locations) {
    const fix = toBridgeFix(location);
    if (fix) sink?.onFix(fix);
  }
});
