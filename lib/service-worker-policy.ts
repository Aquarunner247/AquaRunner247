/**
 * What the service worker is allowed to keep, and -- far more importantly -- what it must never
 * keep.
 *
 * Phase 1d of NATIVE-REBUILD-PLAN.md. Phases 1a-1c put the technician's DATA on the device and
 * that turned out not to be enough: `capacitor.config.ts` points the WebView at the live site and
 * the old `public/sw.js` cached nothing, so with no network the app could not load a single
 * document to display the mirror with. This is the policy for the one document it now keeps.
 *
 * THE RULE THAT MATTERS IS THE DEFAULT. Every path not named here falls through to
 * "network", uncached, because almost everything this app serves is specific to one signed-in
 * person: `app/layout.tsx` renders the user's name and their organization's name into EVERY
 * document (see SideNav), and the API returns one organization's customers. A cached copy of any
 * of that, replayed to whoever opens the app next on a shared phone, is a data leak -- so the
 * allowlist is short, explicit, and contains nothing that varies by who is asking.
 *
 * /field is cacheable precisely because it is the one route built to carry no identity at all:
 * it is client-rendered, it fetches its own data, and app/layout.tsx skips the user lookup for
 * it. If that ever stops being true, this stops being safe.
 *
 * Pure and dependency-free so every branch is tested without a browser --
 * lib/__tests__/service-worker-policy.test.ts. public/sw.js carries the same rules, because a
 * service worker is a static file that cannot import from here; the drift between the two is
 * pinned by a test that reads public/sw.js and compares the literals.
 */

/**
 * The one route served from cache when the network is gone.
 *
 * A single document, with the stop shown via the URL hash rather than its own path, so there is
 * exactly one thing to cache and no way to navigate to a URL the cache has never seen. A hash is
 * also never sent to the server and never asks Next's router for a payload, so opening a stop
 * behaves identically with no signal.
 */
export const FIELD_SHELL_PATH = "/field";

/**
 * Immutable, identity-free build output and static art.
 *
 * `/_next/static/` is content-hashed, so a cached entry can never be stale -- a changed file is
 * a different URL. That is also why a deploy does not break an offline device: the old document
 * still names the old chunks, and the old chunks are still in the cache beside it.
 */
export const CACHEABLE_ASSET_PREFIXES = ["/_next/static/", "/fonts/", "/icons/"];

/** Individually named static files, same reasoning as the prefixes above. */
export const CACHEABLE_ASSET_PATHS = ["/manifest.webmanifest", "/favicon.ico"];

export type CacheStrategy =
  /** Network first, falling back to the cached copy. Only ever the field shell document. */
  | "shell"
  /** Cache first, falling back to the network. Only ever content-hashed or static assets. */
  | "asset"
  /** Straight to the network, and never stored. Everything else, by default. */
  | "network";

export function isFieldShellPath(pathname: string): boolean {
  return pathname === FIELD_SHELL_PATH || pathname.startsWith(`${FIELD_SHELL_PATH}/`);
}

/**
 * Which of the three strategies applies to one request.
 *
 * `isNavigation` is the request's own mode, not a guess from the path: an RSC payload fetch and a
 * `fetch()` from the page both ask for /field-ish URLs without being a document request, and
 * answering those from the document cache would hand JavaScript an HTML page.
 */
export function cacheStrategy(request: {
  pathname: string;
  sameOrigin: boolean;
  method: string;
  isNavigation: boolean;
}): CacheStrategy {
  // A cache is for responses that can be replayed. Nothing else can be.
  if (request.method !== "GET") return "network";
  // Another origin's response is not ours to store, and the tile server and Supabase are both
  // reached cross-origin from the technician's screen.
  if (!request.sameOrigin) return "network";

  if (request.isNavigation) {
    // ONLY the field shell. A navigation to /dashboard or /portal must reach the server or fail
    // visibly -- serving a previous render of one would show the last user's name to this one.
    return isFieldShellPath(request.pathname) ? "shell" : "network";
  }

  if (CACHEABLE_ASSET_PATHS.includes(request.pathname)) return "asset";
  if (CACHEABLE_ASSET_PREFIXES.some((prefix) => request.pathname.startsWith(prefix))) return "asset";

  // Everything left: /api, Server Actions, RSC payloads, /dashboard, /portal, uploads.
  return "network";
}
