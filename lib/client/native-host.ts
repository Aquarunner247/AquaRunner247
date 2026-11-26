"use client";

/**
 * The ONE place the web app asks what it is running inside and what that host can do.
 *
 * Before this, four files imported `@capacitor/*` directly and asked `Capacitor` the question.
 * That was fine while Capacitor was the only shell. It stops being fine the moment Phase 2 of
 * NATIVE-REBUILD-PLAN.md puts a React Native shell around the same WebView, because React Native
 * injects no `window.Capacitor` -- so every one of those checks goes false and the app falls back
 * to BROWSER behaviour without a single error: no background location watcher, no OS camera, no
 * hardware back button. The app would look fine and the thing it exists to do would be off.
 *
 * So capability lives here, host detection lives here, and the rest of the app asks for what it
 * needs rather than for who is listening. Capacitor is now one implementation of three
 * (Capacitor / React Native / plain browser), and adding a fourth, or deleting Capacitor in
 * Phase 4, is a change to this file alone.
 *
 * Detection is SYNCHRONOUS because some of it is used during render -- both shells inject their
 * global before any page script runs, so there is nothing to await. On the server there is no
 * window and every answer is the browser's, which is what Capacitor's own `getPlatform()` does
 * during SSR too, so this changes no hydration behaviour.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";
import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import {
  NATIVE_BRIDGE_VERSION,
  NATIVE_HOST_GLOBAL,
  type BridgeLocationFix,
  type NativeHostGlobal,
  parseLocationFix,
} from "@/lib/native-bridge-protocol";
import { NativeBridgeClient, NativeBridgeError } from "@/lib/native-bridge-client";

// No JS entrypoint ships from @capacitor-community/background-geolocation (it's types-only --
// see its package.json), so this is the documented way to obtain the plugin.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

/**
 * - `capacitor` — today's shipping shell.
 * - `react-native` — the Phase 2 shell, speaking a bridge version this page understands.
 * - `react-native-incompatible` — a React Native shell whose bridge version this page does not
 *   speak. Still a native app, deliberately: an installed binary can be months older than the
 *   site it loads, and reporting "browser" there would resurrect the exact silent degradation
 *   this module exists to prevent. Capabilities refuse instead, which the callers already show.
 * - `browser` — a real browser, and the server.
 */
export type NativeHostKind = "capacitor" | "react-native" | "react-native-incompatible" | "browser";

export type NativePlatform = "android" | "ios" | "web";

function hostGlobal(): NativeHostGlobal | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as Record<string, unknown>)[NATIVE_HOST_GLOBAL];
  if (typeof candidate !== "object" || candidate === null) return null;
  const host = candidate as Partial<NativeHostGlobal>;
  if (host.platform !== "android" && host.platform !== "ios") return null;
  if (typeof host.bridge !== "number") return null;
  return host as NativeHostGlobal;
}

export function nativeHostKind(): NativeHostKind {
  const host = hostGlobal();
  if (host) return host.bridge === NATIVE_BRIDGE_VERSION ? "react-native" : "react-native-incompatible";
  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) return "capacitor";
  return "browser";
}

/** The replacement for `Capacitor.getPlatform()`. "web" covers both a real browser and the
 * server, which is what every caller already assumed. */
export function nativePlatform(): NativePlatform {
  const host = hostGlobal();
  if (host) return host.platform;
  if (typeof window === "undefined") return "web";
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : "web";
}

/** The replacement for `Capacitor.isNativePlatform()`. */
export function isNativeApp(): boolean {
  return nativeHostKind() !== "browser";
}

/** The shell binary's own version, for support questions. Null in a browser or in Capacitor,
 * which does not report one. */
export function nativeShellVersion(): string | null {
  const host = hostGlobal();
  return host && typeof host.shellVersion === "string" ? host.shellVersion : null;
}

/* -------------------------------------------------------------------------------------------- */
/* React Native transport                                                                        */
/* -------------------------------------------------------------------------------------------- */

type ReactNativeWebView = { postMessage: (message: string) => void };

let client: NativeBridgeClient | null = null;

/**
 * The bridge client, wired to the WebView channel, created once on first use.
 *
 * Installing `receive` here is what connects the shell to the page. Nothing that arrived before
 * this point is replayed, and nothing needs to be: see NATIVE_HOST_GLOBAL for why a buffer would
 * only ever hold events belonging to subscriptions that do not exist yet.
 */
function bridge(): NativeBridgeClient | null {
  if (nativeHostKind() !== "react-native") return null;
  if (client) return client;

  const host = hostGlobal();
  const webview = (window as unknown as { ReactNativeWebView?: ReactNativeWebView }).ReactNativeWebView;
  if (!host || !webview) return null;

  const created = new NativeBridgeClient({
    post: (encoded) => webview.postMessage(encoded),
    newId: () =>
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  });

  host.receive = (message) => created.receive(message);

  client = created;
  return created;
}

function unsupported(capability: string): NativeBridgeError {
  return new NativeBridgeError(
    "unsupported",
    `This version of the app cannot ${capability}. Update it from the Play Store or App Store.`,
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Capabilities                                                                                  */
/* -------------------------------------------------------------------------------------------- */

/**
 * One-shot position from the OS, or null when it cannot be had.
 *
 * Null rather than throwing because every caller treats location as optional and never blocks
 * the action it is attached to -- see lib/client/get-geolocation.ts, which owns the browser half.
 */
export async function getNativeCurrentPosition(timeoutMs = 7_000): Promise<BridgeLocationFix | null> {
  const kind = nativeHostKind();

  if (kind === "capacitor") {
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: timeoutMs });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      };
    } catch {
      return null;
    }
  }

  const rn = bridge();
  if (!rn) return null;
  try {
    // A margin over the OS timeout, so the shell's own give-up answers first and the page only
    // times out when the shell has genuinely stopped replying.
    const value = await rn.call("location.getCurrent", { timeoutMs }, { timeoutMs: timeoutMs + 3_000 });
    return parseLocationFix(value);
  } catch {
    return null;
  }
}

export type BackgroundWatchOptions = {
  /** Android's persistent foreground-service notification. Both are required by the OS for
   * background location, not optional, and the technician sees them all day. */
  title: string;
  message: string;
};

export type BackgroundWatchFailure = { denied: boolean; message: string };

export type BackgroundWatchHandle = { stop: () => void };

/**
 * Start a background location watcher, which keeps delivering fixes while the app is backgrounded
 * or the phone is locked.
 *
 * Not `@capacitor/geolocation`'s `watchPosition` on the Capacitor path: that stops delivering once
 * the app is backgrounded, which is exactly the gap that made auto-arrival unreliable for a
 * technician who switches to Maps or pockets the phone between stops.
 *
 * The promise resolves with a handle as soon as the watcher is RUNNING. Callers already race a
 * teardown against this (a screen can unmount mid-start), so stopping a handle that has already
 * been stopped must be harmless, and is.
 */
export async function startBackgroundLocationWatch(
  options: BackgroundWatchOptions,
  onFix: (fix: BridgeLocationFix) => void,
  onFailure: (failure: BackgroundWatchFailure) => void,
): Promise<BackgroundWatchHandle> {
  const kind = nativeHostKind();

  if (kind === "capacitor") {
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: options.title,
        backgroundMessage: options.message,
        requestPermissions: true,
        stale: false,
        // 0, not a battery-saving distance, deliberately -- distanceFilter suppresses a fix
        // until the device has moved that many metres from the LAST one delivered. A technician
        // who parks and walks the final stretch to the pump room, then stands there working,
        // stops generating qualifying movement once inside the radius, so with a nonzero filter
        // no fix ever lands while he is actually there. That is why arrival was only getting
        // logged "at the end of the stop". The plugin's own Android LocationRequest still caps
        // delivery at 1/second, so this does not increase raw GPS polling.
        distanceFilter: 0,
      },
      (location, error) => {
        if (error) {
          onFailure({ denied: error.code === "NOT_AUTHORIZED", message: error.message });
          return;
        }
        if (!location) return;
        onFix({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracy,
        });
      },
    );
    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        void BackgroundGeolocation.removeWatcher({ id });
      },
    };
  }

  const rn = bridge();
  if (!rn) throw unsupported("track your location in the background");

  const watchId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `watch-${Date.now().toString(36)}`;

  // Subscribed BEFORE the call, not after: the shell can deliver its first fix inside the same
  // turn it acknowledges the watcher, and a fix that arrives before the handler is attached is
  // gone for good.
  const unsubscribeFix = rn.subscribe("location.fix", watchId, (payload) => {
    const fix = parseLocationFix(payload);
    if (fix) onFix(fix);
  });
  const unsubscribeError = rn.subscribe("location.error", watchId, (payload) => {
    const error = (payload ?? {}) as { denied?: unknown; message?: unknown };
    onFailure({
      denied: error.denied === true,
      message: typeof error.message === "string" ? error.message : "Location is unavailable.",
    });
  });

  try {
    await rn.call("location.startWatch", { watchId, title: options.title, message: options.message });
  } catch (err) {
    unsubscribeFix();
    unsubscribeError();
    throw err;
  }

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      unsubscribeFix();
      unsubscribeError();
      void rn.call("location.stopWatch", { watchId }).catch(() => {
        // The watcher is already unsubscribed on this side; a shell that cannot hear the stop is
        // a battery problem, not a correctness one, and there is nothing useful to show for it.
      });
    },
  };
}

/**
 * Ask for the notification permission, for its side effect only.
 *
 * Android 13+ will not show the persistent notification a foreground service needs without
 * POST_NOTIFICATIONS, and without that notification Android silently stops delivering background
 * location. No push registration happens here and none is wanted. Deliberately a no-op anywhere
 * but Android: iOS has no equivalent requirement and this would otherwise trigger an unrelated
 * "Would Like to Send You Notifications" prompt for nothing.
 */
export async function requestNotificationPermission(): Promise<void> {
  if (nativePlatform() !== "android") return;
  const kind = nativeHostKind();
  if (kind === "capacitor") {
    await PushNotifications.requestPermissions();
    return;
  }
  const rn = bridge();
  if (!rn) return;
  await rn.call("notifications.requestPermission", {}, { timeoutMs: 120_000 });
}

/** Open this app's OS settings page, which is the only place a technician can change location
 * from "While using" to "Always". */
export async function openAppSettings(): Promise<void> {
  const kind = nativeHostKind();
  if (kind === "capacitor") {
    await BackgroundGeolocation.openSettings();
    return;
  }
  const rn = bridge();
  if (!rn) throw unsupported("open your settings");
  await rn.call("settings.open", {}, { timeoutMs: 10_000 });
}

/**
 * Launch the OS camera and return a JPEG data URL, or null if the technician backed out.
 *
 * Null for a cancel, an exception for a failure. The caller has always had to tell these apart --
 * backing out of the camera must close the sheet silently, while a denied permission has to say
 * so and point at Settings -- and the Capacitor plugin only distinguishes them by the wording of
 * its rejection, so that string test lives here now instead of at the call site.
 */
export async function takeNativePhoto(options?: { quality?: number }): Promise<string | null> {
  const quality = options?.quality ?? 90;
  const kind = nativeHostKind();

  if (kind === "capacitor") {
    try {
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.DataUrl,
        quality,
        saveToGallery: false,
        correctOrientation: true,
        allowEditing: false,
      });
      if (!photo.dataUrl) throw new Error("No image data returned from camera");
      return photo.dataUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The plugin rejects with "User cancelled photos app" when someone backs out of the native
      // camera UI -- a normal exit, not an error state.
      if (/cancel/i.test(message)) return null;
      throw err;
    }
  }

  const rn = bridge();
  if (!rn) throw unsupported("open your camera");
  try {
    // No timeout: someone is holding a phone over a pool trying to get the gauge in frame.
    const value = await rn.call("camera.takePhoto", { quality });
    const dataUrl = (value as { dataUrl?: unknown } | null)?.dataUrl;
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("No image data returned from camera");
    }
    return dataUrl;
  } catch (err) {
    if (err instanceof NativeBridgeError && err.code === "cancelled") return null;
    throw err;
  }
}

/**
 * Make Android's hardware/gesture back action navigate the web app instead of closing it.
 *
 * Returns a teardown, or null when there is nothing to listen to. Android only: iOS has no
 * hardware back and `MainActivity` is a bare `BridgeActivity` with no `onBackPressed` override,
 * so without a listener every back press on any screen finishes the Activity and the app quits.
 */
export function listenForHardwareBack(handler: (event: { canGoBack: boolean }) => void): (() => void) | null {
  if (nativePlatform() !== "android") return null;
  const kind = nativeHostKind();

  if (kind === "capacitor") {
    const listenerPromise = App.addListener("backButton", ({ canGoBack }) => handler({ canGoBack: canGoBack === true }));
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }

  const rn = bridge();
  if (!rn) return null;
  return rn.subscribe("app.backButton", null, (payload) => {
    const canGoBack = (payload as { canGoBack?: unknown } | null)?.canGoBack;
    handler({ canGoBack: canGoBack === true });
  });
}

/**
 * Send the app to the background, as pressing Home does.
 *
 * Minimise rather than exit: a technician can easily be mid-visit with an unsaved reading, and
 * exiting tears the Activity down and forces a full reload next launch.
 */
export async function minimizeApp(): Promise<void> {
  const kind = nativeHostKind();
  if (kind === "capacitor") {
    await App.minimizeApp();
    return;
  }
  const rn = bridge();
  if (!rn) return;
  await rn.call("app.minimize", {}, { timeoutMs: 5_000 });
}

/** Test seam. Drops the memoised client so the next call re-detects the host. */
export function __resetNativeHostForTests(): void {
  client?.close();
  client = null;
}
