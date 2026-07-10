// Deliberately minimal: this service worker exists only so browsers treat the
// app as installable (add-to-home-screen). It does not cache anything — every
// request still goes to the network — so field data always stays fresh and
// the "Sync" button in the nav keeps working as expected.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: fall through to normal network handling.
});
