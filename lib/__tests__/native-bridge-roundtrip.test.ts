import { describe, expect, it } from "vitest";
import { NativeBridgeClient } from "@/lib/native-bridge-client";
import { HostCapabilityError, createBridgeHost, type HostCapabilities } from "@/lib/native-bridge-host";
import type { NativeEventTopic } from "@/lib/native-bridge-protocol";

/**
 * The page's half and the shell's half, wired to each other through the one thing that actually
 * connects them in production: a channel that carries strings.
 *
 * The unit tests either side of this one check each half against a stand-in for the other, which
 * is exactly how two halves of a protocol drift apart while both their test suites stay green.
 * These assert that the real client and the real host agree -- including that a string is all
 * that crosses, since `postMessage` into a WebView cannot carry anything else and a test passing
 * objects around would never notice something unserialisable going over the wire.
 */

function connect(overrides: Partial<HostCapabilities> = {}) {
  const capabilities: HostCapabilities = {
    takePhoto: async ({ quality }) => ({ dataUrl: `data:image/jpeg;base64,q${quality}` }),
    getCurrentPosition: async () => ({ latitude: 36.17, longitude: -115.14, accuracyMeters: 10 }),
    startWatch: async () => {},
    stopWatch: async () => {},
    requestNotificationPermission: async () => ({ granted: true }),
    openSettings: async () => {},
    minimizeApp: async () => {},
    ...overrides,
  };

  // A box, because the two halves genuinely refer to each other: the host sends into the client
  // and the client posts into the host. In the app that cycle is the WebView itself.
  const channel: { client: NativeBridgeClient | null } = { client: null };

  const host = createBridgeHost({
    capabilities,
    currentUrl: () => "https://aquarunner247.com/dashboard/schedule",
    // Serialised on the way back too, matching `injectJavaScript`, which can only carry source
    // text into the page.
    send: (message) => channel.client?.receive(JSON.stringify(message)),
  });

  let id = 0;
  const client = new NativeBridgeClient({
    post: (encoded) => void host.handleMessage(encoded),
    newId: () => `id-${++id}`,
  });
  channel.client = client;

  return { client, host };
}

describe("page and shell over one string channel", () => {
  it("round-trips a photo", async () => {
    const { client } = connect();
    await expect(client.call("camera.takePhoto", { quality: 80 })).resolves.toEqual({
      dataUrl: "data:image/jpeg;base64,q80",
    });
  });

  it("round-trips a position", async () => {
    const { client } = connect();
    await expect(client.call("location.getCurrent", { timeoutMs: 7000 })).resolves.toEqual({
      latitude: 36.17,
      longitude: -115.14,
      accuracyMeters: 10,
    });
  });

  it("round-trips a cancel as a cancel", async () => {
    const { client } = connect({ takePhoto: async () => null });
    await expect(client.call("camera.takePhoto", { quality: 90 })).rejects.toMatchObject({ code: "cancelled" });
  });

  it("round-trips a denial as a denial", async () => {
    const { client } = connect({
      takePhoto: async () => {
        throw new HostCapabilityError("denied", "Camera permission denied");
      },
    });
    await expect(client.call("camera.takePhoto", { quality: 90 })).rejects.toMatchObject({
      code: "denied",
      message: "Camera permission denied",
    });
  });

  it("delivers a watcher's fixes to that watcher only", async () => {
    const { client, host } = connect();
    const fixes: number[] = [];
    client.subscribe("location.fix", "watch-a", (payload) => {
      fixes.push((payload as { latitude: number }).latitude);
    });

    await client.call("location.startWatch", { watchId: "watch-a", title: "t", message: "m" });
    host.emit("location.fix", { latitude: 36.1, longitude: -115, accuracyMeters: 8 }, "watch-a");
    host.emit("location.fix", { latitude: 36.2, longitude: -115, accuracyMeters: 8 }, "watch-b");

    expect(fixes).toEqual([36.1]);
  });

  it("delivers a back press", async () => {
    const { client, host } = connect();
    const seen: unknown[] = [];
    client.subscribe("app.backButton", null, (payload) => seen.push(payload));
    host.emit("app.backButton", { canGoBack: true });
    expect(seen).toEqual([{ canGoBack: true }]);
  });

  it("carries every capability and every event topic the protocol declares", async () => {
    // A protocol entry that neither half implements is the thing that looks fine in both unit
    // suites and does nothing on a phone.
    const { client, host } = connect();
    const args: Array<[string, Record<string, unknown>]> = [
      ["camera.takePhoto", { quality: 90 }],
      ["location.getCurrent", { timeoutMs: 7000 }],
      ["location.startWatch", { watchId: "w1", title: "t", message: "m" }],
      ["location.stopWatch", { watchId: "w1" }],
      ["notifications.requestPermission", {}],
      ["settings.open", {}],
      ["app.minimize", {}],
    ];
    for (const [capability, a] of args) {
      await expect(client.call(capability as never, a), capability).resolves.not.toThrow();
    }

    const topics: NativeEventTopic[] = ["location.fix", "location.error", "app.backButton"];
    const seen: NativeEventTopic[] = [];
    for (const topic of topics) {
      client.subscribe(topic, "w1", () => seen.push(topic));
      host.emit(topic, {}, "w1");
    }
    expect(seen).toEqual(topics);
  });
});
