import { Linking, PermissionsAndroid, Platform } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as IntentLauncher from "expo-intent-launcher";
import { COLOR } from "@/lib/design-tokens";
import { HostCapabilityError, type HostCapabilities } from "@/lib/native-bridge-host";
import type { BridgeLocationFix } from "@/lib/native-bridge-protocol";
import { BACKGROUND_LOCATION_TASK, setLocationSink, toBridgeFix, type LocationSink } from "./location-task";

/**
 * The device half of the bridge: everything that actually touches hardware.
 *
 * The policy half -- who may ask, whether a call is well-formed, what a failure looks like to the
 * page -- is lib/native-bridge-host.ts, in the web app's lib/ where the test suite reaches it.
 * This file holds only what cannot be tested without a phone, and is deliberately thin for that
 * reason: anything here that could be reasoned about belongs on the other side of that line.
 */

/** Default wording for Android's persistent notification, used when the page sends none. The
 * page normally supplies its own, which is the copy the technician reads all day. */
const DEFAULT_NOTIFICATION_TITLE = "Tracking your route";
const DEFAULT_NOTIFICATION_BODY = "Logs your arrival at each stop automatically.";

type WatcherState = {
  /** Watch ids the page currently has open. The OS service runs while this is non-empty. */
  ids: Set<string>;
  /** The foreground-only fallback, used when background permission was refused. */
  foregroundSubscription: Location.LocationSubscription | null;
};

export type CapabilityDeps = {
  /** Fan a fix out to every open watcher. Owned by App.tsx, which knows the bridge. */
  emitFix: (watchIds: string[], fix: BridgeLocationFix) => void;
  emitError: (watchIds: string[], failure: { denied: boolean; message: string }) => void;
};

export function createCapabilities(deps: CapabilityDeps): HostCapabilities {
  const state: WatcherState = { ids: new Set(), foregroundSubscription: null };

  const sink: LocationSink = {
    onFix: (fix) => deps.emitFix([...state.ids], fix),
    onError: (failure) => deps.emitError([...state.ids], failure),
  };

  /**
   * Ask for location, foreground first and then background.
   *
   * Returns whether BACKGROUND was granted, because that decides which of two delivery paths runs
   * and they are not equivalent. A refused foreground permission throws -- there is nothing to
   * fall back to, and the page turns that into the "open Settings" hint.
   */
  async function requestLocationPermissions(): Promise<{ background: boolean }> {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) {
      throw new HostCapabilityError("denied", "Location permission is off, so arrival cannot be logged automatically.");
    }
    // Android 13+ will not show a notification at all without this, and without the notification
    // the OS silently stops delivering background location. Asked here as well as through the
    // page's own capability call, because a watcher started without it looks like it is running
    // and quietly is not.
    await requestNotificationPermission();
    const background = await Location.requestBackgroundPermissionsAsync();
    return { background: background.granted };
  }

  async function requestNotificationPermission(): Promise<{ granted: boolean }> {
    if (Platform.OS !== "android") return { granted: true };
    // RN's own permission API rather than expo-notifications: the only thing wanted here is the
    // POST_NOTIFICATIONS prompt for the foreground service's notification. Nothing registers for
    // push, and pulling in a push SDK to show one dialog would add a token, a service and a
    // privacy surface the technician flow does not use.
    const result = await PermissionsAndroid.request("android.permission.POST_NOTIFICATIONS");
    return { granted: result === PermissionsAndroid.RESULTS.GRANTED };
  }

  async function stopDelivery(): Promise<void> {
    state.foregroundSubscription?.remove();
    state.foregroundSubscription = null;
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
    setLocationSink(null);
  }

  return {
    async takePhoto({ quality }) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new HostCapabilityError("denied", "Camera permission is off for this app.");
      }

      const result = await ImagePicker.launchCameraAsync({
        // launchCameraAsync, never launchImageLibraryAsync. A compliance photo log must only ever
        // contain a live-taken photo, and the OS camera UI presents no "choose from library"
        // option -- the same structural guarantee getUserMedia gives on the web, which is why the
        // web path uses a live stream rather than a file input.
        mediaTypes: ["images"],
        // The page runs its own blur check and review step on the pixels, so no OS-level edit.
        allowsEditing: false,
        // Expo takes 0-1 where the page speaks the Capacitor plugin's 0-100.
        quality: quality / 100,
        base64: true,
        exif: false,
      });

      if (result.canceled) return null;
      const asset = result.assets[0];
      if (!asset?.base64) {
        throw new HostCapabilityError("internal", "The camera returned no image data.");
      }
      // The page expects a data URL, which is also what the Capacitor plugin returned, so the
      // review/blur/upload path downstream is byte-identical either way.
      return { dataUrl: `data:image/jpeg;base64,${asset.base64}` };
    },

    async getCurrentPosition({ timeoutMs }) {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        const requested = await Location.requestForegroundPermissionsAsync();
        // Null, not a throw: every caller treats a one-shot position as optional and must never
        // be blocked by it -- it is attached to a photo or an arrival, not the point of either.
        if (!requested.granted) return null;
      }

      // expo-location has no timeout of its own, and a GPS hold in a pump room can outlast any
      // patience the page has. Racing it keeps the promise honest rather than leaving the page's
      // own timeout to fire with a request still running behind it.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      try {
        const position = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
          timeout,
        ]);
        return position ? toBridgeFix(position) : null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },

    async startWatch({ watchId, title, message }) {
      const alreadyRunning = state.ids.size > 0;
      state.ids.add(watchId);
      setLocationSink(sink);

      // One OS service serves every open watcher. Starting a second would double the notification
      // and the battery cost for no extra information.
      if (alreadyRunning) return;

      try {
        const { background } = await requestLocationPermissions();

        if (background) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.High,
            // 0, not a battery-saving distance, deliberately. A distance filter suppresses a fix
            // until the device has moved that far from the last one delivered -- so a technician
            // who parks, walks to the pump room and stands there working stops generating
            // qualifying movement, and no fix lands while he is actually at the stop. That is
            // exactly why arrival was only getting logged "at the end of the stop". The time
            // interval below is what bounds the GPS cost instead.
            distanceInterval: 0,
            timeInterval: 1000,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: title || DEFAULT_NOTIFICATION_TITLE,
              notificationBody: message || DEFAULT_NOTIFICATION_BODY,
              // brand-ink, the app's own navy, read from lib/design-tokens.ts rather than
              // inlined -- DESIGN-SYSTEM.md's no-hex rule is not web-only. Deliberately not a
              // status colour: ok/warn/danger mean a water reading in this product and must not
              // appear on route chrome.
              notificationColor: COLOR.ink,
            },
          });
          return;
        }

        /**
         * Background refused, foreground granted. Deliver what can still be delivered rather than
         * nothing -- fixes keep arriving while the technician has the app open, so arrival still
         * stamps itself at every stop they are looking at the screen for.
         *
         * No error is reported for this. The page already shows its own "allow all the time" hint
         * on Android (needsAlwaysAllowHint), which is the right surface for it; reporting a
         * failure here would instead replace the "Location on" banner with "location is off",
         * which is not true and would stop them trusting either message.
         */
        state.foregroundSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 1000 },
          (location) => {
            const fix = toBridgeFix(location);
            if (fix) sink.onFix(fix);
          },
        );
      } catch (err) {
        // The watcher never started, so it must not stay in the set -- otherwise the next
        // startWatch sees `alreadyRunning` and returns without starting anything at all.
        state.ids.delete(watchId);
        if (state.ids.size === 0) await stopDelivery().catch(() => {});
        throw err;
      }
    },

    async stopWatch({ watchId }) {
      state.ids.delete(watchId);
      if (state.ids.size > 0) return;
      // Last watcher out turns off the service, the notification and the GPS. Leaving it running
      // is a battery complaint and a notification the technician cannot dismiss.
      await stopDelivery();
    },

    requestNotificationPermission,

    async openSettings() {
      // The only place a technician can change location from "While using" to "Always".
      await Linking.openSettings();
    },

    async minimizeApp() {
      if (Platform.OS !== "android") return;
      /**
       * Launching the home screen, rather than finishing the Activity.
       *
       * A technician can easily be mid-visit with an unsaved reading. Finishing the Activity --
       * which is what Android's default back does at the root, and the only thing React Native's
       * BackHandler can fall through to -- tears that down and forces a full reload next launch.
       * This leaves the Activity in the background with its state intact, which is what pressing
       * Home does and what the Capacitor build's minimizeApp() did.
       */
      await IntentLauncher.startActivityAsync("android.intent.action.MAIN", {
        category: "android.intent.category.HOME",
        flags: 0x10000000, // FLAG_ACTIVITY_NEW_TASK
      });
    },
  };
}
