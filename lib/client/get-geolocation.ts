"use client";

import { getNativeCurrentPosition, isNativeApp } from "@/lib/client/native-host";

export type BestEffortLocation = { latitude: number; longitude: number; accuracyMeters: number };

/** Best-effort device geolocation -- resolves null on denial/timeout/unsupported rather
 * than rejecting, since every caller treats location as optional (never blocks the actual
 * action it's attached to). Shared by photo capture and visit-arrival logging so both grab
 * location the same way.
 *
 * Inside a native app shell, goes through lib/client/native-host.ts to the OS instead of the
 * web `navigator.geolocation` API -- not just for parity with the camera wiring, but because a
 * bare WebView doesn't reliably bridge the web geolocation permission prompt to the OS on its
 * own (a known gap, not a hypothetical one), so the plain web API can silently hang or fail to
 * prompt at all in the native app without this.
 */
export async function getBestEffortLocation(): Promise<BestEffortLocation | null> {
  if (isNativeApp()) {
    return getNativeCurrentPosition(7000);
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 7000 },
    );
  });
}
