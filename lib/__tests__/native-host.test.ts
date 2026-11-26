// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetNativeHostForTests,
  getNativeCurrentPosition,
  isNativeApp,
  listenForHardwareBack,
  nativeHostKind,
  nativePlatform,
  nativeShellVersion,
  requestNotificationPermission,
  startBackgroundLocationWatch,
  takeNativePhoto,
} from "@/lib/client/native-host";
import { NATIVE_BRIDGE_VERSION, NATIVE_HOST_GLOBAL, type NativeHostGlobal } from "@/lib/native-bridge-protocol";

/**
 * Host detection and the React Native capability path.
 *
 * WHAT IS NOT COVERED, AND CANNOT BE HERE: the Capacitor branches. Those call a native bridge
 * that only exists inside a built binary, and faking `window.Capacitor` convincingly enough to
 * exercise them would be testing the fake rather than the code -- @capacitor/core reads a native
 * bridge object whose protocol is internal and unversioned, which is the same reason the shell
 * does not impersonate it. Those branches are a transcription of the code that shipped before
 * this seam existed and are verified the only way they can be, on a device.
 *
 * What IS covered is the part that is new, and therefore the part that can be newly wrong: that
 * a React Native shell is recognised, that a version mismatch is surfaced instead of silently
 * degrading to browser behaviour, and that each capability reaches the shell and comes back.
 */

type Shell = {
  posted: Array<{ id: string; capability: string; args: Record<string, unknown> }>;
  /** What the bootstrap stub swallowed before native-host.ts took over. */
  dropped: unknown[];
  reply: (id: string, value: unknown) => void;
  fail: (id: string, code: string, message?: string) => void;
  push: (topic: string, payload: unknown, watchId?: string) => void;
  lastId: () => string;
};

/** Stand in for the React Native shell: the injected global, the postMessage channel, and the
 * ability to answer. Mirrors the real bootstrap, including its drop-everything `receive`. */
function installShell(options?: { bridge?: number; platform?: "android" | "ios" }): Shell {
  const posted: Shell["posted"] = [];
  const dropped: unknown[] = [];
  const host: NativeHostGlobal = {
    bridge: options?.bridge ?? NATIVE_BRIDGE_VERSION,
    platform: options?.platform ?? "android",
    shellVersion: "2.0.0",
    receive(message) {
      dropped.push(message);
    },
  };
  (window as unknown as Record<string, unknown>)[NATIVE_HOST_GLOBAL] = host;
  (window as unknown as Record<string, unknown>).ReactNativeWebView = {
    postMessage: (encoded: string) => posted.push(JSON.parse(encoded)),
  };
  const send = (message: unknown) => host.receive(message);
  return {
    posted,
    dropped,
    lastId: () => posted[posted.length - 1].id,
    reply: (id, value) => send({ v: NATIVE_BRIDGE_VERSION, t: "res", id, ok: true, value }),
    fail: (id, code, message = "") => send({ v: NATIVE_BRIDGE_VERSION, t: "res", id, ok: false, code, message }),
    push: (topic, payload, watchId) =>
      send({ v: NATIVE_BRIDGE_VERSION, t: "evt", topic, ...(watchId ? { watchId } : {}), payload }),
  };
}

afterEach(() => {
  __resetNativeHostForTests();
  delete (window as unknown as Record<string, unknown>)[NATIVE_HOST_GLOBAL];
  delete (window as unknown as Record<string, unknown>).ReactNativeWebView;
});

describe("host detection", () => {
  it("reports a browser when no shell injected anything", () => {
    expect(nativeHostKind()).toBe("browser");
    expect(isNativeApp()).toBe(false);
    expect(nativePlatform()).toBe("web");
    expect(nativeShellVersion()).toBeNull();
  });

  it("recognises a React Native shell and its platform", () => {
    installShell({ platform: "ios" });
    expect(nativeHostKind()).toBe("react-native");
    expect(isNativeApp()).toBe(true);
    expect(nativePlatform()).toBe("ios");
    expect(nativeShellVersion()).toBe("2.0.0");
  });

  it("calls a shell on another bridge version native, not browser", () => {
    // THE WHOLE POINT. An installed binary can be months older than the site it loads. Reporting
    // "browser" there is what silently turns off background location while the app looks fine.
    installShell({ bridge: 99 });
    expect(nativeHostKind()).toBe("react-native-incompatible");
    expect(isNativeApp()).toBe(true);
    expect(nativePlatform()).toBe("android");
  });

  it("refuses to be fooled by a half-built global", () => {
    for (const bad of [{}, { platform: "android" }, { bridge: 1 }, { bridge: 1, platform: "windows" }, "yes", 1]) {
      (window as unknown as Record<string, unknown>)[NATIVE_HOST_GLOBAL] = bad;
      expect(nativeHostKind(), JSON.stringify(bad)).toBe("browser");
    }
  });
});

describe("capabilities over the React Native bridge", () => {
  it("takes a photo", async () => {
    const shell = installShell();
    const pending = takeNativePhoto({ quality: 80 });
    expect(shell.posted[0]).toMatchObject({ capability: "camera.takePhoto", args: { quality: 80 } });
    shell.reply(shell.lastId(), { dataUrl: "data:image/jpeg;base64,AAA" });
    await expect(pending).resolves.toBe("data:image/jpeg;base64,AAA");
  });

  it("returns null when the technician backs out of the camera", async () => {
    const shell = installShell();
    const pending = takeNativePhoto();
    shell.fail(shell.lastId(), "cancelled", "User backed out");
    // Null, not a throw: backing out must close the sheet silently rather than claim the camera
    // permission was denied.
    await expect(pending).resolves.toBeNull();
  });

  it("throws when the camera is genuinely denied", async () => {
    const shell = installShell();
    const pending = takeNativePhoto();
    shell.fail(shell.lastId(), "denied", "Camera permission denied");
    await expect(pending).rejects.toMatchObject({ code: "denied" });
  });

  it("refuses a photo payload that is not an image data URL", async () => {
    const shell = installShell();
    const pending = takeNativePhoto();
    shell.reply(shell.lastId(), { dataUrl: "https://evil.test/tracker.gif" });
    await expect(pending).rejects.toThrow();
  });

  it("gets a position, and resolves null rather than throwing on failure", async () => {
    const shell = installShell();
    const ok = getNativeCurrentPosition(5_000);
    expect(shell.posted[0]).toMatchObject({ capability: "location.getCurrent", args: { timeoutMs: 5000 } });
    shell.reply(shell.lastId(), { latitude: 36.17, longitude: -115.14, accuracyMeters: 11 });
    await expect(ok).resolves.toEqual({ latitude: 36.17, longitude: -115.14, accuracyMeters: 11 });

    const denied = getNativeCurrentPosition();
    shell.fail(shell.lastId(), "denied");
    // Every caller treats location as optional and must never be blocked by it.
    await expect(denied).resolves.toBeNull();

    const nonsense = getNativeCurrentPosition();
    shell.reply(shell.lastId(), { latitude: 999, longitude: 0, accuracyMeters: 1 });
    await expect(nonsense).resolves.toBeNull();
  });

  it("asks for notification permission on Android only", async () => {
    const android = installShell({ platform: "android" });
    const pending = requestNotificationPermission();
    expect(android.posted[0]).toMatchObject({ capability: "notifications.requestPermission" });
    android.reply(android.lastId(), { granted: true });
    await pending;

    __resetNativeHostForTests();
    const ios = installShell({ platform: "ios" });
    await requestNotificationPermission();
    // iOS has no POST_NOTIFICATIONS requirement, and prompting there would ask for push
    // notifications the technician flow does not use.
    expect(ios.posted).toEqual([]);
  });

  it("listens for the hardware back button on Android and not on iOS", () => {
    const android = installShell({ platform: "android" });
    const seen: boolean[] = [];
    const stop = listenForHardwareBack(({ canGoBack }) => seen.push(canGoBack));
    expect(stop).not.toBeNull();
    android.push("app.backButton", { canGoBack: true });
    android.push("app.backButton", {});
    stop?.();
    android.push("app.backButton", { canGoBack: true });
    expect(seen).toEqual([true, false]);

    __resetNativeHostForTests();
    installShell({ platform: "ios" });
    expect(listenForHardwareBack(() => {})).toBeNull();
  });
});

describe("the background location watcher", () => {
  it("delivers fixes and stops cleanly", async () => {
    const shell = installShell();
    const fixes: number[] = [];
    const failures: string[] = [];
    const pending = startBackgroundLocationWatch({ title: "Tracking your route", message: "Logs arrival" }, (fix) => fixes.push(fix.latitude), (f) => failures.push(f.message));

    const start = shell.posted[0];
    expect(start).toMatchObject({ capability: "location.startWatch", args: { title: "Tracking your route" } });
    const watchId = start.args.watchId as string;
    shell.reply(shell.lastId(), null);
    const handle = await pending;

    shell.push("location.fix", { latitude: 36.1, longitude: -115, accuracyMeters: 8 }, watchId);
    shell.push("location.fix", { latitude: 36.2, longitude: -115, accuracyMeters: 8 }, watchId);
    expect(fixes).toEqual([36.1, 36.2]);

    handle.stop();
    expect(shell.posted[shell.posted.length - 1]).toMatchObject({ capability: "location.stopWatch", args: { watchId } });
    shell.push("location.fix", { latitude: 36.3, longitude: -115, accuracyMeters: 8 }, watchId);
    // A fix after teardown is how a torn-down screen stamps an arrival at a stop nobody is at.
    expect(fixes).toEqual([36.1, 36.2]);
    expect(failures).toEqual([]);
  });

  it("does not lose a fix that arrives before the watcher is acknowledged", async () => {
    const shell = installShell();
    const fixes: number[] = [];
    const pending = startBackgroundLocationWatch({ title: "t", message: "m" }, (fix) => fixes.push(fix.latitude), () => {});
    const watchId = shell.posted[0].args.watchId as string;

    // The shell can deliver its first fix in the same turn it starts the watcher. With
    // distanceFilter 0 that first fix is often the one taken while the technician is standing at
    // the pool, which is the whole reason the subscription is attached before the call.
    shell.push("location.fix", { latitude: 36.0, longitude: -115, accuracyMeters: 8 }, watchId);
    shell.reply(shell.lastId(), null);
    await pending;
    expect(fixes).toEqual([36.0]);
  });

  it("reports a denial distinctly from any other failure", async () => {
    const shell = installShell();
    const failures: Array<{ denied: boolean; message: string }> = [];
    const pending = startBackgroundLocationWatch({ title: "t", message: "m" }, () => {}, (f) => failures.push(f));
    const watchId = shell.posted[0].args.watchId as string;
    shell.reply(shell.lastId(), null);
    await pending;

    shell.push("location.error", { denied: true, message: "Location permission denied" }, watchId);
    shell.push("location.error", { message: "No signal" }, watchId);
    // "denied" points the technician at Settings; anything else says the signal was lost. The
    // advice is different, so collapsing them would send half of them to the wrong screen.
    expect(failures).toEqual([
      { denied: true, message: "Location permission denied" },
      { denied: false, message: "No signal" },
    ]);
  });

  it("keeps two watchers' fixes apart", async () => {
    const shell = installShell();
    const first: number[] = [];
    const second: number[] = [];
    const a = startBackgroundLocationWatch({ title: "t", message: "m" }, (f) => first.push(f.latitude), () => {});
    const idA = shell.posted[0].args.watchId as string;
    shell.reply(shell.lastId(), null);
    await a;
    const b = startBackgroundLocationWatch({ title: "t", message: "m" }, (f) => second.push(f.latitude), () => {});
    const idB = shell.posted[shell.posted.length - 1].args.watchId as string;
    shell.reply(shell.lastId(), null);
    await b;

    expect(idA).not.toBe(idB);
    shell.push("location.fix", { latitude: 1, longitude: 0, accuracyMeters: 5 }, idA);
    shell.push("location.fix", { latitude: 2, longitude: 0, accuracyMeters: 5 }, idB);
    expect(first).toEqual([1]);
    expect(second).toEqual([2]);
  });

  it("is harmless to stop twice", async () => {
    const shell = installShell();
    const pending = startBackgroundLocationWatch({ title: "t", message: "m" }, () => {}, () => {});
    shell.reply(shell.lastId(), null);
    const handle = await pending;
    handle.stop();
    const after = shell.posted.length;
    handle.stop();
    // Callers already race a teardown against the start, so a double stop is normal, not a bug.
    expect(shell.posted.length).toBe(after);
  });

  it("refuses rather than pretending, when the shell cannot track in the background", async () => {
    installShell({ bridge: 99 });
    // An incompatible shell is still a native app, so the screen takes the native branch and
    // then gets told, out loud, that this build cannot do it.
    await expect(startBackgroundLocationWatch({ title: "t", message: "m" }, () => {}, () => {})).rejects.toMatchObject({
      code: "unsupported",
    });
  });
});

describe("messages that arrive before the page is listening", () => {
  it("drops them, and the shell is what keeps back working until then", () => {
    const shell = installShell();
    // This is the only event that can genuinely arrive this early -- a back press before the
    // app's JavaScript is alive. A result correlates to an id the page issued, and a location
    // event carries a watchId the page generated, so neither can predate the page.
    shell.push("app.backButton", { canGoBack: false });
    expect(shell.dropped).toHaveLength(1);

    const seen: boolean[] = [];
    const stop = listenForHardwareBack(({ canGoBack }) => seen.push(canGoBack));
    shell.push("app.backButton", { canGoBack: true });
    stop?.();

    // Not replayed. Replaying it would navigate the app back in response to a press the
    // technician made before the screen existed.
    expect(seen).toEqual([true]);
  });
});
