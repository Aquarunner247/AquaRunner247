import { describe, expect, it } from "vitest";
import {
  NATIVE_BRIDGE_VERSION,
  NATIVE_CAPABILITIES,
  isTrustedBridgeOrigin,
  parseBridgeRequest,
  parseHostMessage,
  parseLocationFix,
} from "@/lib/native-bridge-protocol";

/**
 * These test the PRIVILEGED BOUNDARY, in both directions.
 *
 * What reaches the shell comes out of a WebView that renders remote content and follows links,
 * and the shell holds the camera, location and notification permissions for the whole app. What
 * reaches the page arrives through a channel the page cannot authenticate. So the only defence
 * either side has is refusing to act on anything it did not fully recognise, and that refusal is
 * what is checked here -- the cases below are all things a malformed, forged or simply
 * mismatched-version message would look like.
 */

function req(overrides: Record<string, unknown> = {}) {
  return { v: NATIVE_BRIDGE_VERSION, t: "req", id: "call-1", capability: "settings.open", args: {}, ...overrides };
}

describe("parseBridgeRequest", () => {
  it("accepts a well-formed call", () => {
    expect(parseBridgeRequest(req())).toEqual({
      v: 1,
      t: "req",
      id: "call-1",
      capability: "settings.open",
      args: {},
    });
  });

  it("accepts the same call as a JSON string, which is all postMessage can carry", () => {
    expect(parseBridgeRequest(JSON.stringify(req()))?.capability).toBe("settings.open");
  });

  it("refuses a capability that is not on the list", () => {
    // The whole point of a closed union: this must not become a general "run native code" pipe.
    expect(parseBridgeRequest(req({ capability: "shell.exec" }))).toBeNull();
    expect(parseBridgeRequest(req({ capability: "camera" }))).toBeNull();
    expect(parseBridgeRequest(req({ capability: "" }))).toBeNull();
  });

  it("refuses another bridge version", () => {
    // An installed binary can be months older than the site it loads. Half-speaking a protocol
    // it does not know is worse than refusing it.
    expect(parseBridgeRequest(req({ v: 2 }))).toBeNull();
    expect(parseBridgeRequest(req({ v: "1" }))).toBeNull();
  });

  it("refuses junk, nulls, arrays and unparseable strings", () => {
    for (const raw of [null, undefined, 42, "not json", "[]", [], {}, { t: "req" }]) {
      expect(parseBridgeRequest(raw)).toBeNull();
    }
  });

  it("refuses a missing or absurd id, which is what a reply has to be matched on", () => {
    expect(parseBridgeRequest(req({ id: "" }))).toBeNull();
    expect(parseBridgeRequest(req({ id: 7 }))).toBeNull();
    expect(parseBridgeRequest(req({ id: "x".repeat(65) }))).toBeNull();
  });

  it("caps the notification text the page can put in a system notification", () => {
    // Android shows this with the app's name on it, all day, to the technician. It is product
    // copy, not page content.
    expect(parseBridgeRequest(req({ capability: "location.startWatch", args: { watchId: "w1", title: "x".repeat(81) } }))).toBeNull();
    expect(
      parseBridgeRequest(req({ capability: "location.startWatch", args: { watchId: "w1", message: "x".repeat(201) } })),
    ).toBeNull();
    expect(
      parseBridgeRequest(req({ capability: "location.startWatch", args: { watchId: "w1", title: "Tracking", message: "Logs arrival" } }))
        ?.args,
    ).toEqual({ watchId: "w1", title: "Tracking", message: "Logs arrival" });
  });

  it("requires a watch id on both watch calls", () => {
    expect(parseBridgeRequest(req({ capability: "location.startWatch", args: {} }))).toBeNull();
    expect(parseBridgeRequest(req({ capability: "location.stopWatch", args: {} }))).toBeNull();
    expect(parseBridgeRequest(req({ capability: "location.stopWatch", args: { watchId: "w1" } }))?.args).toEqual({ watchId: "w1" });
  });

  it("fills in defaults rather than passing undefined to the OS", () => {
    expect(parseBridgeRequest(req({ capability: "camera.takePhoto", args: {} }))?.args).toEqual({ quality: 90 });
    expect(parseBridgeRequest(req({ capability: "location.getCurrent", args: {} }))?.args).toEqual({ timeoutMs: 7000 });
  });

  it("refuses an out-of-range quality or timeout", () => {
    expect(parseBridgeRequest(req({ capability: "camera.takePhoto", args: { quality: 0 } }))).toBeNull();
    expect(parseBridgeRequest(req({ capability: "camera.takePhoto", args: { quality: 101 } }))).toBeNull();
    expect(parseBridgeRequest(req({ capability: "location.getCurrent", args: { timeoutMs: -1 } }))).toBeNull();
    // An hour-long GPS hold would keep the radio on; nothing in the app wants one.
    expect(parseBridgeRequest(req({ capability: "location.getCurrent", args: { timeoutMs: 3_600_000 } }))).toBeNull();
  });

  it("treats a missing args object as empty, so a no-arg call need not send one", () => {
    const parsed = parseBridgeRequest({ v: 1, t: "req", id: "a", capability: "app.minimize" });
    expect(parsed?.args).toEqual({});
  });

  it("validates every capability on the list, so a new one cannot be added without a rule", () => {
    // If someone adds a capability to NATIVE_CAPABILITIES and forgets validateArgs, the switch
    // falls through to undefined and this fails rather than silently accepting anything.
    for (const capability of NATIVE_CAPABILITIES) {
      const args =
        capability === "location.startWatch" || capability === "location.stopWatch" ? { watchId: "w1" } : {};
      expect(parseBridgeRequest(req({ capability, args })), capability).not.toBeNull();
    }
  });
});

describe("parseHostMessage", () => {
  it("accepts a success result", () => {
    expect(parseHostMessage({ v: 1, t: "res", id: "a", ok: true, value: { dataUrl: "data:image/jpeg;base64,x" } })).toEqual({
      v: 1,
      t: "res",
      id: "a",
      ok: true,
      value: { dataUrl: "data:image/jpeg;base64,x" },
    });
  });

  it("accepts a failure result and refuses an unknown error code", () => {
    expect(parseHostMessage({ v: 1, t: "res", id: "a", ok: false, code: "denied", message: "no" })).toMatchObject({
      ok: false,
      code: "denied",
    });
    expect(parseHostMessage({ v: 1, t: "res", id: "a", ok: false, code: "kaboom", message: "" })).toBeNull();
  });

  it("refuses an ok flag that is not a boolean, rather than coercing it", () => {
    // `ok: "false"` is truthy. Coercion here would turn a failure into a success.
    expect(parseHostMessage({ v: 1, t: "res", id: "a", ok: "false", code: "denied" })).toBeNull();
    expect(parseHostMessage({ v: 1, t: "res", id: "a", ok: 1, value: null })).toBeNull();
  });

  it("accepts an event and refuses an unknown topic", () => {
    expect(parseHostMessage({ v: 1, t: "evt", topic: "location.fix", watchId: "w1", payload: {} })).toMatchObject({
      topic: "location.fix",
      watchId: "w1",
    });
    expect(parseHostMessage({ v: 1, t: "evt", topic: "contacts.read", payload: {} })).toBeNull();
  });

  it("omits watchId entirely when absent, so an app-wide event never matches a watcher", () => {
    const parsed = parseHostMessage({ v: 1, t: "evt", topic: "app.backButton", payload: { canGoBack: true } });
    expect(parsed).not.toBeNull();
    expect(parsed && "watchId" in parsed).toBe(false);
  });

  it("refuses a message type it does not know", () => {
    expect(parseHostMessage({ v: 1, t: "req", id: "a", capability: "settings.open" })).toBeNull();
    expect(parseHostMessage({ v: 1, t: "hello" })).toBeNull();
  });
});

describe("parseLocationFix", () => {
  it("accepts a real fix", () => {
    expect(parseLocationFix({ latitude: 36.17, longitude: -115.14, accuracyMeters: 12 })).toEqual({
      latitude: 36.17,
      longitude: -115.14,
      accuracyMeters: 12,
    });
  });

  it("refuses coordinates outside the earth", () => {
    // These go into distance maths in lib/departure-detection.ts. A bad pair does not read as
    // missing data there, it reads as a real place thousands of miles away -- which would
    // register as "away from the stop" and stamp a departure.
    expect(parseLocationFix({ latitude: 91, longitude: 0, accuracyMeters: 1 })).toBeNull();
    expect(parseLocationFix({ latitude: 0, longitude: 181, accuracyMeters: 1 })).toBeNull();
    expect(parseLocationFix({ latitude: -115.14, longitude: 36.17, accuracyMeters: 1 })).toBeNull();
  });

  it("refuses non-numbers, NaN and a negative accuracy", () => {
    expect(parseLocationFix({ latitude: "36.17", longitude: -115.14, accuracyMeters: 12 })).toBeNull();
    expect(parseLocationFix({ latitude: Number.NaN, longitude: 0, accuracyMeters: 1 })).toBeNull();
    expect(parseLocationFix({ latitude: 0, longitude: 0, accuracyMeters: -1 })).toBeNull();
    expect(parseLocationFix(null)).toBeNull();
    expect(parseLocationFix("36,-115")).toBeNull();
  });

  it("accepts (0,0) -- it is a valid coordinate and filtering it is the caller's business", () => {
    expect(parseLocationFix({ latitude: 0, longitude: 0, accuracyMeters: 5 })).not.toBeNull();
  });
});

describe("isTrustedBridgeOrigin", () => {
  it("trusts production, with and without www", () => {
    expect(isTrustedBridgeOrigin("https://aquarunner247.com/dashboard/schedule")).toBe(true);
    expect(isTrustedBridgeOrigin("https://www.aquarunner247.com/field")).toBe(true);
  });

  it("does not trust a Vercel preview", () => {
    // A preview URL is world-reachable and its content is whatever was last pushed to a branch.
    // Trusting the pattern would let any branch drive a technician's phone.
    expect(isTrustedBridgeOrigin("https://aquarunner247-git-some-branch.vercel.app/")).toBe(false);
  });

  it("does not trust lookalikes, subdomains or plain http", () => {
    expect(isTrustedBridgeOrigin("https://aquarunner247.com.evil.test/")).toBe(false);
    expect(isTrustedBridgeOrigin("https://evil.aquarunner247.com/")).toBe(false);
    expect(isTrustedBridgeOrigin("http://aquarunner247.com/")).toBe(false);
    expect(isTrustedBridgeOrigin("https://aquarunner247.com:8443/")).toBe(false);
  });

  it("does not trust junk", () => {
    for (const url of ["", "not a url", "javascript:alert(1)", "about:blank", "file:///etc/passwd"]) {
      expect(isTrustedBridgeOrigin(url), url).toBe(false);
    }
  });

  it("trusts localhost and the emulator's host alias only when development is opted in", () => {
    expect(isTrustedBridgeOrigin("http://localhost:3000/")).toBe(false);
    expect(isTrustedBridgeOrigin("http://localhost:3000/", { allowDevelopment: true })).toBe(true);
    expect(isTrustedBridgeOrigin("http://10.0.2.2:3000/", { allowDevelopment: true })).toBe(true);
    expect(isTrustedBridgeOrigin("http://127.0.0.1/", { allowDevelopment: true })).toBe(true);
    // Still not a free pass for anything else.
    expect(isTrustedBridgeOrigin("https://evil.test/", { allowDevelopment: true })).toBe(false);
  });
});
