/**
 * The prominent disclosure Google Play requires before background location may be requested.
 *
 * This is a policy requirement, not a courtesy. Play's Location Permissions policy says an app
 * requesting background location must show an in-app disclosure that the user affirmatively
 * accepts BEFORE the runtime permission dialog -- and it must say what is collected, that it
 * happens in the background, and what it is for. A privacy policy does not satisfy it, a store
 * listing does not satisfy it, and neither does a passive notice the user can tap past.
 *
 * Without this the app requests ACCESS_BACKGROUND_LOCATION with nothing in front of it, which is
 * among the most reliable ways to fail Play review. Apple does not require the equivalent, which
 * is why this is reached from the Android path -- but the text is true on both.
 *
 * Kept pure and storage-free so the copy can be asserted in a test. The wording is the part that
 * gets an app rejected, and it is too easy to "improve" it into non-compliance.
 */

/**
 * The disclosure text itself.
 *
 * The first sentence is deliberately close to the shape Play's own guidance uses -- names the
 * app, says location data, says what it enables, and says "even when the app is closed or not in
 * use". Reviewers look for exactly that, and paraphrasing it is how apps fail this check.
 *
 * The rest is what makes it honest rather than merely compliant, and it matches what the Privacy
 * Policy and EULA already promise: only the arrival fix leaves the phone, a departure is a time
 * with no position attached, and the watch ends when the day does.
 */
export const BACKGROUND_LOCATION_DISCLOSURE = {
  title: "AquaRunner needs your location in the background",
  body: [
    "AquaRunner 24/7 Pro collects location data to log when you arrive at each stop on your route, and when you leave a stop you haven't finished — even when the app is closed or not in use.",
    "Only the position that records an arrival is sent to your company. Leaving is worked out on this phone and sent as a time, with no position attached. The positions in between are checked here and discarded.",
    "This runs only while you have unfinished stops for the day. It stops on its own once the day's stops are done.",
  ],
  accept: "Allow location",
  decline: "Not now",
} as const;

/**
 * Where the acceptance is remembered.
 *
 * Per device, because the OS permission it gates is per device -- and per app install, because
 * clearing app data should put a technician back in front of the disclosure rather than silently
 * resuming background tracking they last agreed to on a phone they may no longer have.
 */
export const BACKGROUND_LOCATION_DISCLOSURE_KEY = "aquarunner.backgroundLocationDisclosure.v1";

/** Minimal shape of localStorage, so this is testable without a browser. */
export type DisclosureStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * Whether the disclosure still has to be shown.
 *
 * Fails SAFE: any storage that throws -- private mode, blocked site data, a WebView with storage
 * disabled -- is treated as "not yet accepted". Showing it twice costs a tap. Skipping it costs
 * the Play listing.
 */
export function needsBackgroundLocationDisclosure(storage: DisclosureStorage | null | undefined): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(BACKGROUND_LOCATION_DISCLOSURE_KEY) !== "accepted";
  } catch {
    return true;
  }
}

/** Record that the technician accepted it. A decline is deliberately NOT recorded -- they should
 *  be asked again next time they open a route, not locked out of a feature by one tap. */
export function recordBackgroundLocationDisclosureAccepted(storage: DisclosureStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(BACKGROUND_LOCATION_DISCLOSURE_KEY, "accepted");
  } catch {
    // Nothing to do. needsBackgroundLocationDisclosure will ask again, which is the safe way to
    // be wrong.
  }
}
