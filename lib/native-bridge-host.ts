/**
 * The SHELL's half of the React Native bridge: what to do with a message that came out of the
 * WebView, and what never to do with one.
 *
 * This lives in lib/ rather than in native/ on purpose. It is the gate in front of the camera,
 * the GPS and the notification permission -- the decisions it makes (is this page allowed to ask;
 * is this call even well-formed; what does a failure look like to the page) are the ones worth
 * having tests for, and they are pure logic over injected capabilities. The React Native app
 * supplies the device half and owns nothing of the policy. Same single-source rule the plan sets
 * for the dosing maths: the shell and the page share one definition rather than agreeing twice.
 *
 * THE THREAT IS NOT HYPOTHETICAL. A WebView renders remote content and follows links, and this
 * process holds every permission the app was granted. So a message is acted on only when it
 * parses completely (lib/native-bridge-protocol.ts) AND the page that sent it is on an origin
 * this build trusts. Neither check alone is enough: a trusted origin still cannot ask for a
 * capability that does not exist, and a well-formed call from somewhere else is still refused.
 */

import {
  NATIVE_BRIDGE_VERSION,
  isTrustedBridgeOrigin,
  parseBridgeRequest,
  type BridgeLocationFix,
  type BridgeResponse,
  type HostMessage,
  type NativeErrorCode,
  type NativeEventTopic,
} from "@/lib/native-bridge-protocol";

/** Thrown by a capability to choose the code the page sees. Anything else that escapes becomes
 * `internal`, because an unexpected failure must not be reported as a denial -- "enable camera
 * permission" is useless advice for a bug. */
export class HostCapabilityError extends Error {
  readonly code: NativeErrorCode;

  constructor(code: NativeErrorCode, message: string) {
    super(message);
    this.name = "HostCapabilityError";
    this.code = code;
  }
}

export type HostCapabilities = {
  /** Null means the person backed out of the OS camera UI, which is a normal exit. */
  takePhoto: (args: { quality: number }) => Promise<{ dataUrl: string } | null>;
  /** Null means no fix could be had in time. Not an error: every caller treats location as
   * optional and must never be blocked by it. */
  getCurrentPosition: (args: { timeoutMs: number }) => Promise<BridgeLocationFix | null>;
  startWatch: (args: { watchId: string; title?: string; message?: string }) => Promise<void>;
  stopWatch: (args: { watchId: string }) => Promise<void>;
  requestNotificationPermission: () => Promise<{ granted: boolean }>;
  openSettings: () => Promise<void>;
  minimizeApp: () => Promise<void>;
};

export type BridgeHostOptions = {
  capabilities: HostCapabilities;
  /** The URL the WebView is showing RIGHT NOW, read per message rather than captured once: the
   * technician navigates, and a trust decision made at startup would outlive the page it was
   * made about. */
  currentUrl: () => string;
  /** Lets a development build talk to `next dev`. Off in anything shipped. */
  allowDevelopment?: boolean;
  send: (message: HostMessage) => void;
  /** Where a refusal goes. Not the page's business, but somebody has to be able to see it. */
  onRefusal?: (reason: string, detail: string) => void;
};

export type BridgeHost = {
  /** One raw string out of the WebView. Never throws: it runs from a WebView callback, and
   * throwing there takes the handler down with it. */
  handleMessage: (raw: unknown) => Promise<void>;
  /** Push an unsolicited event at the page -- a location fix, or a back press. */
  emit: (topic: NativeEventTopic, payload: unknown, watchId?: string) => void;
};

export function createBridgeHost(options: BridgeHostOptions): BridgeHost {
  const { capabilities, currentUrl, allowDevelopment, send, onRefusal } = options;

  function fail(id: string, code: NativeErrorCode, message: string): void {
    const response: BridgeResponse = { v: NATIVE_BRIDGE_VERSION, t: "res", id, ok: false, code, message };
    send(response);
  }

  function succeed(id: string, value: unknown): void {
    send({ v: NATIVE_BRIDGE_VERSION, t: "res", id, ok: true, value });
  }

  async function run(capability: string, args: Record<string, unknown>): Promise<unknown> {
    switch (capability) {
      case "camera.takePhoto":
        return capabilities.takePhoto({ quality: args.quality as number });
      case "location.getCurrent":
        return capabilities.getCurrentPosition({ timeoutMs: args.timeoutMs as number });
      case "location.startWatch":
        await capabilities.startWatch({
          watchId: args.watchId as string,
          title: args.title as string | undefined,
          message: args.message as string | undefined,
        });
        return null;
      case "location.stopWatch":
        await capabilities.stopWatch({ watchId: args.watchId as string });
        return null;
      case "notifications.requestPermission":
        return capabilities.requestNotificationPermission();
      case "settings.open":
        await capabilities.openSettings();
        return null;
      case "app.minimize":
        await capabilities.minimizeApp();
        return null;
      default:
        // Unreachable: parseBridgeRequest only yields names from the closed list. Kept so that
        // adding one there without adding it here fails loudly instead of hanging the page.
        throw new HostCapabilityError("unsupported", `This app build cannot do ${capability}.`);
    }
  }

  return {
    async handleMessage(raw) {
      const request = parseBridgeRequest(raw);
      if (!request) {
        // Deliberately silent to the page. Answering an unparseable message tells a prober the
        // shape it got wrong, and there is no id to answer to anyway.
        onRefusal?.("malformed", typeof raw === "string" ? raw.slice(0, 200) : typeof raw);
        return;
      }

      const url = currentUrl();
      if (!isTrustedBridgeOrigin(url, { allowDevelopment })) {
        // ANSWERED, unlike a malformed message: the capability names are already public, and a
        // clear refusal beats a page that hangs forever waiting for a reply.
        onRefusal?.("untrusted-origin", `${request.capability} from ${url}`);
        fail(request.id, "untrusted", "This page is not allowed to use the app's device features.");
        return;
      }

      try {
        const value = await run(request.capability, request.args);
        // A null from takePhoto is a cancel, not a value. The page has to tell those apart --
        // backing out of the camera closes the sheet silently, a denial has to say so.
        if (request.capability === "camera.takePhoto" && value === null) {
          fail(request.id, "cancelled", "Camera closed without taking a photo.");
          return;
        }
        succeed(request.id, value);
      } catch (err) {
        if (err instanceof HostCapabilityError) {
          fail(request.id, err.code, err.message);
          return;
        }
        // Never `denied` for an unexpected throw: "enable camera permission" is useless advice
        // for a bug, and it sends the technician to a settings screen that is already correct.
        fail(request.id, "internal", err instanceof Error ? err.message : String(err));
      }
    },

    emit(topic, payload, watchId) {
      send({
        v: NATIVE_BRIDGE_VERSION,
        t: "evt",
        topic,
        ...(watchId === undefined ? {} : { watchId }),
        payload,
      });
    },
  };
}
