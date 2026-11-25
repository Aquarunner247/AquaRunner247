/**
 * The offline app shell.
 *
 * Until 2026-11-25 this file deliberately cached nothing -- it existed only so browsers treated
 * the app as installable. That was the gap Phase 1d of NATIVE-REBUILD-PLAN.md closes: the read
 * endpoints and the IndexedDB mirror put the technician's DATA on the device, but
 * capacitor.config.ts loads the live site remotely, so with no network the WebView could not
 * fetch a single document to display any of it. Everything was on the phone except the app.
 *
 * WHAT IS CACHED IS ALMOST NOTHING, ON PURPOSE. One document (/field) plus content-hashed build
 * output and static art. Everything else goes to the network uncached, because app/layout.tsx
 * renders the signed-in user's name and their organization's name into every document and the
 * API returns one organization's customers -- a cached copy of either, replayed to whoever picks
 * up a shared phone next, is a data leak. /field is the one route built to carry no identity.
 *
 * The rules here are the ones in lib/service-worker-policy.ts, which is where they are tested. A
 * service worker is a static file at the origin root and cannot import from the bundle, so the
 * two are kept in step by a test that reads this file and compares the literals below. Change
 * one, change the other.
 */

/**
 * Bump this to discard everything cached by an older worker. The suffix is the schema of what is
 * stored, not the app version -- a deploy does not need a bump, because /_next/static URLs are
 * content-hashed and an old document keeps naming the old chunks sitting beside it in the cache.
 */
const CACHE = "aquarunner-shell-v1";

const FIELD_SHELL_PATH = "/field";
const ASSET_PREFIXES = ["/_next/static/", "/fonts/", "/icons/"];
const ASSET_PATHS = ["/manifest.webmanifest", "/favicon.ico"];

function isFieldShellPath(pathname) {
  return pathname === FIELD_SHELL_PATH || pathname.startsWith(`${FIELD_SHELL_PATH}/`);
}

function strategyFor(request, url) {
  if (request.method !== "GET") return "network";
  if (url.origin !== self.location.origin) return "network";
  if (request.mode === "navigate") return isFieldShellPath(url.pathname) ? "shell" : "network";
  if (ASSET_PATHS.includes(url.pathname)) return "asset";
  if (ASSET_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return "asset";
  return "network";
}

/**
 * Precache the shell and everything it boots from, on install.
 *
 * WITHOUT THIS IT TAKES TWO VISITS, which is useless for the one case this exists for. A service
 * worker does not control the page that registers it, so on a first visit the document and its
 * chunks are fetched before the worker is running and nothing is intercepted -- a technician who
 * opened Field mode once at the depot and drove off would have an empty cache. Measured, not
 * assumed: the first load cached one file, the second cached thirty-four.
 *
 * The asset URLs are read OUT OF THE DOCUMENT rather than listed here, because Next.js chunk
 * names are content-hashed at build time and a static file in public/ cannot know them. The
 * shell names its own dependencies in its own HTML, so that is the only honest source for them.
 *
 * Failure is tolerated throughout: install must not fail just because the device is already
 * offline the first time this runs. The fetch handler still fills the cache on a later visit.
 */
async function precacheShell() {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(FIELD_SHELL_PATH, { credentials: "omit" });
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put(new Request(FIELD_SHELL_PATH), response);

    // Only /_next/static -- content-hashed, so every one of these is immutable and safe to keep.
    const referenced = new Set(html.match(/\/_next\/static\/[A-Za-z0-9._\/-]+/g) ?? []);
    await Promise.all(
      [...referenced].map((path) =>
        cache.add(new Request(path)).catch(() => {
          // One missing chunk is not worth failing the install over.
        }),
      ),
    );
  } catch {
    // Already offline, or the document is unreachable. Nothing cached, nothing broken.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache this version does not own, so a rename here is also a cleanup.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/**
 * Network first, cache as a fallback. The technician gets the live document whenever there is
 * signal -- which is also what keeps the cached copy current -- and the stored one only when
 * there is not.
 *
 * The stop is carried in the URL HASH (`/field#stop=<id>`), which never reaches the server at
 * all, so one cached document answers every stop on the day and there is no URL a technician can
 * reach that the cache has never seen. ignoreSearch is belt-and-braces for any query string that
 * does get appended.
 */
async function shell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(new Request(FIELD_SHELL_PATH), response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(new Request(FIELD_SHELL_PATH), { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

/**
 * Cache first. These URLs are content-hashed or static, so a hit can never be stale, and serving
 * them from disk is what makes the shell open instantly rather than after a round trip.
 */
async function asset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const strategy = strategyFor(event.request, url);
  // Not respondWith at all: an unhandled request must stay exactly as it was, so the browser's
  // own handling (range requests, redirects, credentials) is untouched.
  if (strategy === "shell") event.respondWith(shell(event.request));
  else if (strategy === "asset") event.respondWith(asset(event.request));
});
