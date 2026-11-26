/**
 * The page's half of the React Native bridge: turns one string channel into correlated calls and
 * routed subscriptions.
 *
 * Kept separate from lib/client/native-host.ts, and free of both DOM and Capacitor, because this
 * is where the part that can actually be wrong lives. Matching a reply to its call, keeping two
 * concurrent location watchers from reading each other's fixes, and ignoring a message nobody
 * asked for are all pure logic over a transport, so they are tested as pure logic over a fake
 * transport rather than guessed at on a handset.
 *
 * `postMessage` into a WebView host is fire-and-forget with no delivery guarantee and no error
 * channel: if the shell is mid-crash, mid-background-kill, or simply older than the page and
 * does not know a capability, the reply never comes. So nothing here waits forever by default
 * and every caller decides its own patience -- see `timeoutMs`.
 */

import {
  NATIVE_BRIDGE_VERSION,
  parseHostMessage,
  type BridgeEvent,
  type BridgeRequest,
  type NativeCapability,
  type NativeErrorCode,
  type NativeEventTopic,
} from "@/lib/native-bridge-protocol";

export class NativeBridgeError extends Error {
  readonly code: NativeErrorCode;

  constructor(code: NativeErrorCode, message: string) {
    super(message || code);
    this.name = "NativeBridgeError";
    this.code = code;
  }
}

export type BridgeTransport = {
  /** Hands one encoded request to the shell. Throwing is treated as a dead channel. */
  post: (encoded: string) => void;
  /** Request ids. Injected so tests get a stable sequence; production passes crypto randomness. */
  newId: () => string;
  /** Milliseconds since epoch, injected for the same reason. */
  now?: () => number;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: NativeBridgeError) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

type Subscription = {
  topic: NativeEventTopic;
  watchId: string | null;
  handler: (payload: unknown) => void;
};

export class NativeBridgeClient {
  private readonly transport: BridgeTransport;
  private readonly pending = new Map<string, Pending>();
  private readonly subscriptions = new Set<Subscription>();
  private closed = false;

  constructor(transport: BridgeTransport) {
    this.transport = transport;
  }

  /**
   * Call a capability and wait for its reply.
   *
   * `timeoutMs` is per call and has no default on purpose. `camera.takePhoto` is unbounded --
   * someone is holding a phone over a pool trying to get the gauge in frame, and a timeout there
   * would cancel a photo that was about to be taken. `location.getCurrent` on the other hand
   * already means "best effort, give up quickly", so it sets one.
   */
  async call(
    capability: NativeCapability,
    args: Record<string, unknown> = {},
    options?: { timeoutMs?: number },
  ): Promise<unknown> {
    if (this.closed) throw new NativeBridgeError("unavailable", "The native bridge is closed.");

    const id = this.transport.newId();
    const request: BridgeRequest = { v: NATIVE_BRIDGE_VERSION, t: "req", id, capability, args };

    return new Promise<unknown>((resolve, reject) => {
      const timer =
        options?.timeoutMs === undefined
          ? null
          : setTimeout(() => {
              this.pending.delete(id);
              reject(new NativeBridgeError("unavailable", `The app shell did not answer ${capability}.`));
            }, options.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.transport.post(JSON.stringify(request));
      } catch (err) {
        // Nothing was sent, so no reply is coming -- fail now rather than on the timeout, which
        // some callers do not set.
        this.settle(id);
        reject(new NativeBridgeError("unavailable", err instanceof Error ? err.message : String(err)));
      }
    });
  }

  /**
   * Listen for pushed events. `watchId` null means "every event on this topic" (the back button,
   * which belongs to the app rather than to a subscription).
   *
   * A fix carrying a watchId reaches only the subscription that asked for that id. Without that
   * routing, a screen that tore its watcher down and started a new one would act on fixes from
   * the old one -- which is how a stale fix logs an arrival at a stop the technician has already
   * driven away from.
   */
  subscribe(topic: NativeEventTopic, watchId: string | null, handler: (payload: unknown) => void): () => void {
    const subscription: Subscription = { topic, watchId, handler };
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /** Feed in one raw message from the shell. Anything that does not parse is dropped silently:
   * the page cannot tell a forged `message` from a real one, so shape is all it checks, and an
   * id it never issued matches nothing. */
  receive(raw: unknown): void {
    if (this.closed) return;
    const message = parseHostMessage(raw);
    if (!message) return;

    if (message.t === "res") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.settle(message.id);
      if (message.ok) pending.resolve(message.value);
      else pending.reject(new NativeBridgeError(message.code, message.message));
      return;
    }

    this.deliver(message);
  }

  /** Fail every outstanding call. Used when the host goes away, so awaiting UI unblocks instead
   * of spinning on a promise that can no longer be answered. */
  close(reason = "The native bridge went away."): void {
    this.closed = true;
    for (const id of [...this.pending.keys()]) {
      const pending = this.pending.get(id);
      this.settle(id);
      pending?.reject(new NativeBridgeError("unavailable", reason));
    }
    this.subscriptions.clear();
  }

  private deliver(event: BridgeEvent): void {
    // Copied before iterating: a handler is allowed to unsubscribe itself, which the location
    // watcher does the moment it recognises an arrival.
    for (const subscription of [...this.subscriptions]) {
      if (subscription.topic !== event.topic) continue;
      if (subscription.watchId !== null && subscription.watchId !== event.watchId) continue;
      if (!this.subscriptions.has(subscription)) continue;
      subscription.handler(event.payload);
    }
  }

  private settle(id: string): void {
    const pending = this.pending.get(id);
    if (pending?.timer) clearTimeout(pending.timer);
    this.pending.delete(id);
  }
}
