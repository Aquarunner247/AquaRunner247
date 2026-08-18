"use client";

export type BestEffortLocation = { latitude: number; longitude: number; accuracyMeters: number };

/** Best-effort device geolocation -- resolves null on denial/timeout/unsupported rather
 * than rejecting, since every caller treats location as optional (never blocks the actual
 * action it's attached to). Shared by photo capture and visit-arrival logging so both grab
 * location the same way. */
export function getBestEffortLocation(): Promise<BestEffortLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
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
