import { describe, expect, it, vi } from "vitest";
import { HostCapabilityError, createBridgeHost, type HostCapabilities } from "@/lib/native-bridge-host";
import { NATIVE_BRIDGE_VERSION, type HostMessage } from "@/lib/native-bridge-protocol";

/**
 * The gate in front of the camera, the GPS and the notification permission.
 *
 * The React Native shell process holds every permission the app was granted, and the only thing
 * standing between a page and those permissions is this. So these are not really tests of a
 * dispatcher -- they are tests that the refusals happen, that a refusal cannot be mistaken for a
 * success, and that a failure reaches the technician as advice they can act on.
 */

function harness(overrides: Partial<HostCapabilities> = {}, options?: { url?: string; allowDevelopment?: boolean }) {
  const sent: HostMessage[] = [];
  const refusals: Array<{ reason: string; detail: string }> = [];
  const calls: string[] = [];
  const capabilities: HostCapabilities = {
    takePhoto: async () => {
      calls.push("takePhoto");
      return { dataUrl: "data:image/jpeg;base64,AAA" };
    },
    getCurrentPosition: async () => {
      calls.push("getCurrentPosition");
      return { latitude: 36.17, longitude: -115.14, accuracyMeters: 10 };
    },
    startWatch: async () => {
      calls.push("startWatch");
    },
    stopWatch: async () => {
      calls.push("stopWatch");
    },
    requestNotificationPermission: async () => {
      calls.push("requestNotificationPermission");
      return { granted: true };
    },
    openSettings: async () => {
      calls.push("openSettings");
    },
    minimizeApp: async () => {
      calls.push("minimizeApp");
    },
    ...overrides,
  };

  let url = options?.url ?? "https://aquarunner247.com/dashboard/schedule";
  const host = createBridgeHost({
    capabilities,
    currentUrl: () => url,
    allowDevelopment: options?.allowDevelopment,
    send: (message) => sent.push(message),
    onRefusal: (reason, detail) => refusals.push({ reason, detail }),
  });

  return {
    host,
    sent,
    refusals,
    calls,
    navigate: (next: string) => (url = next),
    call: (capability: string, args: Record<string, unknown> = {}, id = "call-1") =>
      host.handleMessage(JSON.stringify({ v: NATIVE_BRIDGE_VERSION, t: "req", id, capability, args })),
  };
}

describe("origin trust", () => {
  it("runs a capability for the production site", async () => {
    const h = harness();
    await h.call("camera.takePhoto", { quality: 90 });
    expect(h.calls).toEqual(["takePhoto"]);
    expect(h.sent[0]).toMatchObject({ ok: true, value: { dataUrl: "data:image/jpeg;base64,AAA" } });
  });

  it("refuses an untrusted origin WITHOUT touching the hardware, and says so", async () => {
    const h = harness({}, { url: "https://evil.test/" });
    await h.call("camera.takePhoto", { quality: 90 });
    // The refusal is what matters; that it is reported rather than left hanging is the rest.
    expect(h.calls).toEqual([]);
    expect(h.sent[0]).toMatchObject({ ok: false, code: "untrusted" });
    expect(h.refusals[0]?.reason).toBe("untrusted-origin");
  });

  it("re-checks the origin on EVERY message, not once at startup", async () => {
    const h = harness();
    await h.call("location.getCurrent", { timeoutMs: 7000 });
    expect(h.calls).toEqual(["getCurrentPosition"]);
    // The technician navigates. A trust decision made at startup would outlive the page it was
    // made about, which is the whole failure mode a single startup check has.
    h.navigate("https://aquarunner247-git-branch.vercel.app/field");
    await h.call("location.getCurrent", { timeoutMs: 7000 }, "call-2");
    expect(h.calls).toEqual(["getCurrentPosition"]);
    expect(h.sent[1]).toMatchObject({ ok: false, code: "untrusted" });
  });

  it("talks to a dev server only when the build opted in", async () => {
    const shipped = harness({}, { url: "http://localhost:3000/dashboard" });
    await shipped.call("app.minimize");
    expect(shipped.calls).toEqual([]);

    const dev = harness({}, { url: "http://localhost:3000/dashboard", allowDevelopment: true });
    await dev.call("app.minimize");
    expect(dev.calls).toEqual(["minimizeApp"]);
  });
});

describe("malformed input", () => {
  it("drops it silently rather than answering", async () => {
    const h = harness();
    for (const raw of ["not json", null, 42, "{}", JSON.stringify({ v: 2, t: "req", id: "a", capability: "app.minimize" })]) {
      await h.host.handleMessage(raw);
    }
    // No id to answer to, and answering would tell a prober the shape it got wrong.
    expect(h.sent).toEqual([]);
    expect(h.calls).toEqual([]);
    expect(h.refusals.every((r) => r.reason === "malformed")).toBe(true);
  });

  it("refuses a capability that is not on the list, even from the real site", async () => {
    const h = harness();
    await h.call("shell.exec", { cmd: "rm -rf /" });
    expect(h.sent).toEqual([]);
    expect(h.calls).toEqual([]);
  });

  it("never throws out of handleMessage, whatever it is handed", async () => {
    // It runs from a WebView callback. Throwing there takes the handler down with it, and every
    // later call from the page then hangs.
    const h = harness({
      takePhoto: async () => {
        throw new Error("camera service crashed");
      },
    });
    await expect(h.host.handleMessage(undefined)).resolves.toBeUndefined();
    await expect(h.call("camera.takePhoto", { quality: 90 })).resolves.toBeUndefined();
    await expect(h.host.handleMessage({ nested: { deeply: [1, 2, 3] } })).resolves.toBeUndefined();
  });
});

describe("results and failures", () => {
  it("reports a cancelled photo as cancelled, not as a success with no photo", async () => {
    const h = harness({ takePhoto: async () => null });
    await h.call("camera.takePhoto", { quality: 90 });
    // A success carrying null would make the page throw "no image data" at someone who simply
    // changed their mind.
    expect(h.sent[0]).toMatchObject({ ok: false, code: "cancelled" });
  });

  it("passes a chosen error code through", async () => {
    const h = harness({
      takePhoto: async () => {
        throw new HostCapabilityError("denied", "Camera permission denied");
      },
    });
    await h.call("camera.takePhoto", { quality: 90 });
    expect(h.sent[0]).toMatchObject({ ok: false, code: "denied", message: "Camera permission denied" });
  });

  it("reports an unexpected throw as internal, never as a denial", async () => {
    const h = harness({
      getCurrentPosition: async () => {
        throw new TypeError("undefined is not an object");
      },
    });
    await h.call("location.getCurrent", { timeoutMs: 7000 });
    // "Enable location permission" is useless advice for a bug, and it sends the technician to a
    // settings screen that is already correct.
    expect(h.sent[0]).toMatchObject({ ok: false, code: "internal" });
  });

  it("reports a position of null as a success, because no fix is not a failure", async () => {
    const h = harness({ getCurrentPosition: async () => null });
    await h.call("location.getCurrent", { timeoutMs: 7000 });
    expect(h.sent[0]).toMatchObject({ ok: true, value: null });
  });

  it("answers every capability on the list", async () => {
    const h = harness();
    const args: Record<string, Record<string, unknown>> = {
      "camera.takePhoto": { quality: 90 },
      "location.getCurrent": { timeoutMs: 7000 },
      "location.startWatch": { watchId: "w1", title: "Tracking", message: "Logs arrival" },
      "location.stopWatch": { watchId: "w1" },
      "notifications.requestPermission": {},
      "settings.open": {},
      "app.minimize": {},
    };
    let n = 0;
    for (const [capability, a] of Object.entries(args)) {
      await h.call(capability, a, `call-${++n}`);
    }
    expect(h.sent).toHaveLength(7);
    expect(h.sent.every((m) => m.t === "res" && m.ok === true)).toBe(true);
    expect(h.calls).toEqual([
      "takePhoto",
      "getCurrentPosition",
      "startWatch",
      "stopWatch",
      "requestNotificationPermission",
      "openSettings",
      "minimizeApp",
    ]);
  });

  it("answers the id it was given, so the page can match the reply", async () => {
    const h = harness();
    await h.call("app.minimize", {}, "whatever-the-page-chose");
    expect(h.sent[0]).toMatchObject({ id: "whatever-the-page-chose" });
  });

  it("forwards the page's notification wording to the watcher", async () => {
    const startWatch = vi.fn(async () => {});
    const h = harness({ startWatch });
    await h.call("location.startWatch", { watchId: "w1", title: "Tracking your route", message: "Logs arrival" });
    expect(startWatch).toHaveBeenCalledWith({ watchId: "w1", title: "Tracking your route", message: "Logs arrival" });
  });
});

describe("emitting events", () => {
  it("tags a location event with its watcher and leaves an app event untagged", () => {
    const h = harness();
    h.host.emit("location.fix", { latitude: 1, longitude: 2, accuracyMeters: 3 }, "w1");
    h.host.emit("app.backButton", { canGoBack: true });
    expect(h.sent[0]).toEqual({
      v: 1,
      t: "evt",
      topic: "location.fix",
      watchId: "w1",
      payload: { latitude: 1, longitude: 2, accuracyMeters: 3 },
    });
    // No watchId at all, rather than undefined -- a watcher must never match an app-wide event.
    expect(h.sent[1]).toEqual({ v: 1, t: "evt", topic: "app.backButton", payload: { canGoBack: true } });
  });
});
