/**
 * The wire protocol between the web app and a React Native shell hosting it in a WebView.
 *
 * WHY THIS EXISTS AT ALL. Today the native shell is Capacitor, which injects `window.Capacitor`
 * into the WebView and gives the page a bridge to its plugins. React Native's WebView injects no
 * such thing -- the only channel in either direction is `window.ReactNativeWebView.postMessage`,
 * a single string. So the moment Phase 2 of NATIVE-REBUILD-PLAN.md swaps the shell, every
 * `Capacitor.isNativePlatform()` in the app goes false and the app QUIETLY DEGRADES TO BROWSER
 * BEHAVIOUR: no background location watcher, no OS camera, no hardware back. Nothing throws and
 * nothing logs. That is the failure this file is built to make impossible -- the shell and the
 * page now agree on a named, versioned, validated set of capabilities instead of one of them
 * guessing what the other provides.
 *
 * It is deliberately pure: no DOM, no React, no Capacitor import. Both sides of the boundary
 * import THIS file -- the page through lib/client/native-host.ts, the shell through its own
 * message router -- so there is one definition of what may cross, not two that drift. That is
 * the same single-source rule the plan sets for the dosing maths, applied to the bridge.
 *
 * EVERYTHING INBOUND IS UNTRUSTED, in both directions, and that is not theoretical:
 *
 *  - What reaches the SHELL comes from a WebView that renders remote content and follows links.
 *    The shell holds the camera, location and notification permissions for the whole app, so a
 *    page that can ask it for anything can ask it for those. Hence `parseBridgeRequest`, which
 *    validates per capability, and `isTrustedBridgeOrigin`, which the shell checks before
 *    honouring a call at all.
 *  - What reaches the PAGE arrives as a `message` event on `document`, which is how
 *    react-native-webview delivers it -- and which any script or frame in the page can also
 *    fire. Hence `parseHostMessage`. A reply is only ever matched to a call the page actually
 *    made, by id, so a forged "result" answers nothing.
 */

/** Bumped only for a breaking change. A shell and a page that disagree here refuse each other
 * rather than half-work: an installed binary can be months older than the site it loads. */
export const NATIVE_BRIDGE_VERSION = 1;

/**
 * Every capability the web app actually needs from a native host, as of 2026-11-25.
 *
 * Taken from what the app actually calls -- the four files that reached for `@capacitor/*`
 * directly before lib/client/native-host.ts became the only one -- and not from the plugin list
 * in package.json: @capacitor/splash-screen and @capacitor/status-bar are configured natively and
 * never called from JS, so they are not part of this surface and the shell owes the page nothing
 * for them. Keep this closed: an unlisted string is rejected, which is what stops this growing
 * into a general "run native code for the page" channel.
 */
export const NATIVE_CAPABILITIES = [
  "camera.takePhoto",
  "location.getCurrent",
  "location.startWatch",
  "location.stopWatch",
  "notifications.requestPermission",
  "settings.open",
  "app.minimize",
] as const;

export type NativeCapability = (typeof NATIVE_CAPABILITIES)[number];

/** Topics the shell pushes without being asked. A watcher delivers many fixes for one call, and
 * a back press originates on the device, so neither fits the call/reply shape. */
export const NATIVE_EVENT_TOPICS = ["location.fix", "location.error", "app.backButton"] as const;

export type NativeEventTopic = (typeof NATIVE_EVENT_TOPICS)[number];

/**
 * Why a call failed, in the page's terms rather than the OS's.
 *
 * `cancelled` and `denied` are separated because the camera treats them differently and always
 * has: backing out of the OS camera UI is a normal exit that must close the sheet silently,
 * while a denied permission has to say so and point at Settings. Collapsing them is what would
 * show "Camera access was denied" to someone who simply changed their mind.
 */
export const NATIVE_ERROR_CODES = [
  "unsupported",
  "denied",
  "cancelled",
  "unavailable",
  "malformed",
  "untrusted",
  "internal",
] as const;

export type NativeErrorCode = (typeof NATIVE_ERROR_CODES)[number];

/**
 * The single global the shell injects into the WebView before any page script runs, and the only
 * thing the page uses to recognise a React Native host.
 *
 * A NAMED GLOBAL RATHER THAN A FAKED `window.Capacitor`. Impersonating Capacitor would mean the
 * page needed no changes at all, which is tempting and wrong: @capacitor/core reaches for more of
 * the native bridge than a shim would reproduce, the proxy protocol between them is internal and
 * unversioned, and a Capacitor upgrade would then break the React Native shell silently. An
 * explicit global says which shell is really there and which bridge version it speaks.
 *
 * `receive` is a drop-everything stub until lib/client/native-host.ts replaces it, and the
 * bootstrap deliberately does NOT buffer what arrives first. Buffering was the obvious thing and
 * it is useless here: a result correlates to an id the page itself issued, so none can predate
 * the page; a location event carries a watchId the page itself generated, so none can either.
 * The only event that can genuinely arrive early is a back press before the app's JavaScript is
 * alive, and replaying that later is wrong -- the shell handles back itself whenever the page has
 * not claimed it, which is the same division @capacitor/app uses.
 */
export const NATIVE_HOST_GLOBAL = "__aqNativeHost";

export type NativeHostGlobal = {
  /** The shell's NATIVE_BRIDGE_VERSION. A mismatch is surfaced, never silently ignored. */
  bridge: number;
  platform: "android" | "ios";
  /** The shell binary's version, for support ("what build are you on?"). Not acted on. */
  shellVersion: string;
  receive: (message: unknown) => void;
};

export type BridgeRequest = {
  v: typeof NATIVE_BRIDGE_VERSION;
  t: "req";
  /** Correlates the reply. Opaque to the shell; the page requires it back unchanged. */
  id: string;
  capability: NativeCapability;
  args: Record<string, unknown>;
};

export type BridgeResponse =
  | { v: typeof NATIVE_BRIDGE_VERSION; t: "res"; id: string; ok: true; value: unknown }
  | {
      v: typeof NATIVE_BRIDGE_VERSION;
      t: "res";
      id: string;
      ok: false;
      code: NativeErrorCode;
      message: string;
    };

export type BridgeEvent = {
  v: typeof NATIVE_BRIDGE_VERSION;
  t: "evt";
  topic: NativeEventTopic;
  /** Present on location topics: which `location.startWatch` this belongs to. A fix for a
   * watcher the page has already stopped is dropped rather than acted on, because acting on it
   * is how a torn-down screen logs an arrival at a stop nobody is standing at. */
  watchId?: string;
  payload: unknown;
};

export type HostMessage = BridgeResponse | BridgeEvent;

/** A fix, in the shape lib/departure-detection.ts already consumes. Metres, not feet: every
 * distance in that module is metric and a unit mix-up there silently moves the arrival radius. */
export type BridgeLocationFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Per-capability argument validation, run by the shell before it touches hardware.
 *
 * Narrow on purpose. `location.startWatch` carries the text of the persistent Android
 * notification, which the OS shows to the technician with the app's name on it -- it is copy the
 * product owns, so a length cap stops a page from putting arbitrary text in a system
 * notification, and the shell substitutes its own wording if the page sends none.
 */
function validateArgs(capability: NativeCapability, args: Record<string, unknown>): Record<string, unknown> | null {
  switch (capability) {
    case "camera.takePhoto": {
      const quality = args.quality;
      if (quality !== undefined && !(isFiniteNumber(quality) && quality > 0 && quality <= 100)) return null;
      return { quality: quality === undefined ? 90 : quality };
    }
    case "location.getCurrent": {
      const timeoutMs = args.timeoutMs;
      if (timeoutMs !== undefined && !(isFiniteNumber(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60_000)) return null;
      return { timeoutMs: timeoutMs === undefined ? 7_000 : timeoutMs };
    }
    case "location.startWatch": {
      if (!isNonEmptyString(args.watchId) || args.watchId.length > 64) return null;
      const title = args.title;
      const message = args.message;
      if (title !== undefined && !(typeof title === "string" && title.length <= 80)) return null;
      if (message !== undefined && !(typeof message === "string" && message.length <= 200)) return null;
      return { watchId: args.watchId, title, message };
    }
    case "location.stopWatch": {
      if (!isNonEmptyString(args.watchId) || args.watchId.length > 64) return null;
      return { watchId: args.watchId };
    }
    case "notifications.requestPermission":
    case "settings.open":
    case "app.minimize":
      return {};
  }
}

/**
 * Validate a call that arrived from the WebView. Null means "do not act on this" -- the shell
 * replies with a `malformed` error if it can recover an id, and otherwise drops it entirely,
 * because answering an unparseable message tells a prober the shape it got wrong.
 */
export function parseBridgeRequest(raw: unknown): BridgeRequest | null {
  const parsed = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!isObject(parsed)) return null;
  if (parsed.v !== NATIVE_BRIDGE_VERSION) return null;
  if (parsed.t !== "req") return null;
  if (!isNonEmptyString(parsed.id) || parsed.id.length > 64) return null;
  if (!NATIVE_CAPABILITIES.includes(parsed.capability as NativeCapability)) return null;
  const capability = parsed.capability as NativeCapability;
  const rawArgs = parsed.args === undefined ? {} : parsed.args;
  if (!isObject(rawArgs)) return null;
  const args = validateArgs(capability, rawArgs);
  if (!args) return null;
  return { v: NATIVE_BRIDGE_VERSION, t: "req", id: parsed.id, capability, args };
}

/**
 * Validate a message that arrived from the shell. Null means ignore.
 *
 * The page cannot distinguish a real shell reply from a script on the page firing the same
 * `message` event, so it does not try: this checks the shape, and `native-host.ts` only honours
 * a result whose id matches an outstanding call it made itself.
 */
export function parseHostMessage(raw: unknown): HostMessage | null {
  const parsed = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!isObject(parsed)) return null;
  if (parsed.v !== NATIVE_BRIDGE_VERSION) return null;

  if (parsed.t === "res") {
    if (!isNonEmptyString(parsed.id)) return null;
    if (parsed.ok === true) {
      return { v: NATIVE_BRIDGE_VERSION, t: "res", id: parsed.id, ok: true, value: parsed.value };
    }
    if (parsed.ok === false) {
      if (!NATIVE_ERROR_CODES.includes(parsed.code as NativeErrorCode)) return null;
      return {
        v: NATIVE_BRIDGE_VERSION,
        t: "res",
        id: parsed.id,
        ok: false,
        code: parsed.code as NativeErrorCode,
        message: typeof parsed.message === "string" ? parsed.message : "",
      };
    }
    return null;
  }

  if (parsed.t === "evt") {
    if (!NATIVE_EVENT_TOPICS.includes(parsed.topic as NativeEventTopic)) return null;
    const watchId = parsed.watchId;
    if (watchId !== undefined && !isNonEmptyString(watchId)) return null;
    return {
      v: NATIVE_BRIDGE_VERSION,
      t: "evt",
      topic: parsed.topic as NativeEventTopic,
      ...(watchId === undefined ? {} : { watchId }),
      payload: parsed.payload,
    };
  }

  return null;
}

/** A fix out of an event payload, or null. Rejects out-of-range coordinates rather than passing
 * them on: `isAwayFix` in lib/departure-detection.ts does distance maths on these, and a (0,0)
 * or swapped pair reads as a real place thousands of miles away rather than as missing data. */
export function parseLocationFix(payload: unknown): BridgeLocationFix | null {
  if (!isObject(payload)) return null;
  const { latitude, longitude, accuracyMeters } = payload;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) return null;
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) return null;
  if (!isFiniteNumber(accuracyMeters) || accuracyMeters < 0) return null;
  return { latitude, longitude, accuracyMeters };
}

/**
 * Origins whose pages the shell will run privileged calls for.
 *
 * Belt to `onShouldStartLoadWithRequest`'s braces. That handler is what keeps the WebView on
 * our own site -- a tap on a directions link or the OpenStreetMap attribution hands off to the
 * system browser instead of navigating in-app. This is the second check, for the case where
 * something gets rendered in-app anyway: being inside the WebView is then still not enough to
 * reach the camera.
 *
 * Vercel preview deployments are deliberately NOT trusted. A preview URL is world-reachable and
 * its content is whatever was last pushed to a branch, so trusting the pattern would mean any
 * branch could drive a technician's phone. Development is opt-in per build instead.
 */
export function isTrustedBridgeOrigin(url: string, options?: { allowDevelopment?: boolean }): boolean {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }
  if (origin === "https://aquarunner247.com" || origin === "https://www.aquarunner247.com") return true;
  if (!options?.allowDevelopment) return false;
  // Both loopback spellings and both schemes: `next dev` serves http, and an emulator reaches
  // the host machine at 10.0.2.2 rather than at localhost.
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(origin);
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
