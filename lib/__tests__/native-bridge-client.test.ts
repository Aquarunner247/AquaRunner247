import { describe, expect, it, vi } from "vitest";
import { NativeBridgeClient, NativeBridgeError } from "@/lib/native-bridge-client";
import { NATIVE_BRIDGE_VERSION, type NativeEventTopic } from "@/lib/native-bridge-protocol";

/**
 * Correlation and routing over a fake transport.
 *
 * These are the parts of the bridge that can actually be wrong in a way nobody notices: a reply
 * delivered to the wrong caller, a fix from a torn-down watcher acted on by a new one, a call
 * that hangs forever because the shell died mid-request. All of it is pure logic over one string
 * channel, so it is tested as pure logic rather than discovered on a handset in a dead zone.
 */

function harness() {
  const sent: Array<{ id: string; capability: string; args: Record<string, unknown> }> = [];
  let next = 0;
  const client = new NativeBridgeClient({
    post: (encoded) => sent.push(JSON.parse(encoded)),
    newId: () => `id-${++next}`,
  });
  const reply = (id: string, value: unknown) => client.receive({ v: NATIVE_BRIDGE_VERSION, t: "res", id, ok: true, value });
  const fail = (id: string, code: string, message = "") =>
    client.receive({ v: NATIVE_BRIDGE_VERSION, t: "res", id, ok: false, code, message });
  const event = (topic: NativeEventTopic, payload: unknown, watchId?: string) =>
    client.receive({ v: NATIVE_BRIDGE_VERSION, t: "evt", topic, ...(watchId ? { watchId } : {}), payload });
  return { client, sent, reply, fail, event };
}

describe("NativeBridgeClient calls", () => {
  it("resolves with the value the shell returned", async () => {
    const { client, sent, reply } = harness();
    const pending = client.call("camera.takePhoto", { quality: 90 });
    expect(sent).toEqual([{ v: 1, t: "req", id: "id-1", capability: "camera.takePhoto", args: { quality: 90 } }]);
    reply("id-1", { dataUrl: "data:image/jpeg;base64,x" });
    await expect(pending).resolves.toEqual({ dataUrl: "data:image/jpeg;base64,x" });
  });

  it("rejects with the shell's error code, which is what tells a cancel from a denial", async () => {
    const { client, fail } = harness();
    const pending = client.call("camera.takePhoto");
    fail("id-1", "cancelled", "User backed out");
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });

  it("keeps two concurrent calls apart", async () => {
    const { client, reply } = harness();
    const photo = client.call("camera.takePhoto");
    const position = client.call("location.getCurrent");
    // Answered out of order on purpose -- the OS camera takes minutes and GPS takes seconds.
    reply("id-2", { latitude: 36, longitude: -115, accuracyMeters: 9 });
    reply("id-1", { dataUrl: "data:image/jpeg;base64,x" });
    await expect(position).resolves.toMatchObject({ latitude: 36 });
    await expect(photo).resolves.toMatchObject({ dataUrl: "data:image/jpeg;base64,x" });
  });

  it("ignores a result for an id it never issued", async () => {
    const { client, reply } = harness();
    const pending = client.call("location.getCurrent");
    // A forged reply, or one from a call that already timed out. Either way it answers nothing.
    reply("id-999", { latitude: 0, longitude: 0, accuracyMeters: 1 });
    reply("id-1", { latitude: 36, longitude: -115, accuracyMeters: 9 });
    await expect(pending).resolves.toMatchObject({ latitude: 36 });
  });

  it("ignores a malformed message instead of throwing out of receive", () => {
    const { client } = harness();
    // receive() runs from a WebView callback. Throwing there takes the handler down with it.
    for (const raw of [null, "not json", 42, {}, { v: 2, t: "res", id: "id-1", ok: true }]) {
      expect(() => client.receive(raw)).not.toThrow();
    }
  });

  it("times out when the shell never answers, but only if the caller asked for one", async () => {
    vi.useFakeTimers();
    try {
      const { client } = harness();
      const impatient = client.call("settings.open", {}, { timeoutMs: 1_000 });
      // The assertion is attached BEFORE the clock moves, so the rejection is never momentarily
      // unhandled -- which vitest reports as an error even when the test itself passes.
      const impatientRejected = expect(impatient).rejects.toMatchObject({ code: "unavailable" });
      const patient = client.call("camera.takePhoto");
      let patientSettled = false;
      void patient.then(
        () => (patientSettled = true),
        () => (patientSettled = true),
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await impatientRejected;
      // The camera has no timeout on purpose: someone is holding a phone over a pool trying to
      // get the gauge in frame, and cancelling that would throw away a photo about to be taken.
      expect(patientSettled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire a timeout for a call that was already answered", async () => {
    vi.useFakeTimers();
    try {
      const { client, reply } = harness();
      const pending = client.call("settings.open", {}, { timeoutMs: 1_000 });
      reply("id-1", null);
      await expect(pending).resolves.toBeNull();
      // An uncleared timer would reject an already-resolved promise -- harmless here, but it
      // also means a leaked timer per call, all day, on a phone.
      await vi.advanceTimersByTimeAsync(5_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails immediately when the channel itself is gone, without waiting for a timeout", async () => {
    const client = new NativeBridgeClient({
      post: () => {
        throw new Error("WebView detached");
      },
      newId: () => "id-1",
    });
    // Nothing was sent, so no reply is coming -- and most callers set no timeout.
    await expect(client.call("app.minimize")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("fails every outstanding call when the host goes away", async () => {
    const { client } = harness();
    const photo = client.call("camera.takePhoto");
    const position = client.call("location.getCurrent");
    client.close();
    await expect(photo).rejects.toBeInstanceOf(NativeBridgeError);
    await expect(position).rejects.toMatchObject({ code: "unavailable" });
    await expect(client.call("app.minimize")).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("NativeBridgeClient subscriptions", () => {
  it("delivers a fix only to the watcher that asked for that id", () => {
    const { client, event } = harness();
    const first: unknown[] = [];
    const second: unknown[] = [];
    client.subscribe("location.fix", "watch-a", (p) => first.push(p));
    client.subscribe("location.fix", "watch-b", (p) => second.push(p));

    event("location.fix", { latitude: 1, longitude: 1, accuracyMeters: 5 }, "watch-a");

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("stops delivering after unsubscribe", () => {
    const { client, event } = harness();
    const seen: unknown[] = [];
    const stop = client.subscribe("location.fix", "watch-a", (p) => seen.push(p));
    event("location.fix", { latitude: 1 }, "watch-a");
    stop();
    event("location.fix", { latitude: 2 }, "watch-a");
    // A fix that lands after teardown is how a torn-down screen logs an arrival at a stop the
    // technician already drove away from.
    expect(seen).toEqual([{ latitude: 1 }]);
  });

  it("lets a handler unsubscribe itself mid-delivery", () => {
    const { client, event } = harness();
    const seen: unknown[] = [];
    const stop = client.subscribe("location.fix", "watch-a", (p) => {
      seen.push(p);
      // Exactly what route-day-view does the moment it recognises an arrival.
      stop();
    });
    event("location.fix", { n: 1 }, "watch-a");
    event("location.fix", { n: 2 }, "watch-a");
    expect(seen).toEqual([{ n: 1 }]);
  });

  it("delivers an app-wide event to a null-watchId subscriber and not to a watcher", () => {
    const { client, event } = harness();
    const back: unknown[] = [];
    const fixes: unknown[] = [];
    client.subscribe("app.backButton", null, (p) => back.push(p));
    client.subscribe("location.fix", "watch-a", (p) => fixes.push(p));
    event("app.backButton", { canGoBack: true });
    expect(back).toEqual([{ canGoBack: true }]);
    expect(fixes).toEqual([]);
  });

  it("does not leak a fix with no watchId into a specific watcher", () => {
    const { client, event } = harness();
    const seen: unknown[] = [];
    client.subscribe("location.fix", "watch-a", (p) => seen.push(p));
    event("location.fix", { latitude: 1 });
    expect(seen).toEqual([]);
  });

  it("keeps topics apart", () => {
    const { client, event } = harness();
    const fixes: unknown[] = [];
    const errors: unknown[] = [];
    client.subscribe("location.fix", "watch-a", (p) => fixes.push(p));
    client.subscribe("location.error", "watch-a", (p) => errors.push(p));
    event("location.error", { denied: true }, "watch-a");
    expect(fixes).toEqual([]);
    expect(errors).toEqual([{ denied: true }]);
  });

  it("drops events once closed", () => {
    const { client, event } = harness();
    const seen: unknown[] = [];
    client.subscribe("location.fix", "watch-a", (p) => seen.push(p));
    client.close();
    event("location.fix", { latitude: 1 }, "watch-a");
    expect(seen).toEqual([]);
  });
});
