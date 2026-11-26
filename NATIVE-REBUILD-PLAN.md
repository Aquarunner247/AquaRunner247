# Native rebuild plan

Status: **Phase 0a, 0b, the Capacitor half of 0c, Phase 1a-1d and Phase 2 are built and tested.**
Outstanding: the OS-geofence half of 0c, and Phases 3-4. **Phase 1d is done (2026-11-25)** --
Phase 1's own "done when" turned out to depend on it, and the app now opens and works a stop with
no network at all. **Phase 2 is done (2026-11-25)** -- a React Native shell builds, runs and
round-trips the bridge on Android, with the hardware half still to be measured on a real phone.
Written 2026-11-24.

Supersedes the sizing done 2026-11-17, which deferred this work. Two of that assessment's
premises turned out to be wrong when checked against the code — see
[What the earlier sizing got wrong](#what-the-earlier-sizing-got-wrong). The conclusion it
reached (start with the API and local-read layer, inside Capacitor) survives anyway, for a
different and better reason.

---

## What we are actually building

**One app. Native where native earns it, WebView for everything else.**

Not a port. `capacitor.config.ts` is a remote-URL shell pointing at `https://aquarunner247.com`,
so the native binary today contains no app logic at all — all ~68k lines of `app/` + `lib/` are
server-rendered Next.js across 84 routes. "Going native" therefore means building a second client
against the same backend, not translating an existing one.

| Surface | Where it runs after this | Why |
| --- | --- | --- |
| Today's route, stop list, visit form, camera, background location | **Native** | Needs offline reads, hardware, and all-day responsiveness |
| Admin dashboard, routes builder, customers, users, settings, billing | **WebView** | Desk work, online, already good. Rebuilding buys nothing |
| Customer portal | **WebView** (and the browser) | Read-mostly, occasional, on wifi |

### Decisions already made

- **React Native**, not Kotlin/Swift. It embeds a WebView naturally, which this design depends
  on, and the 84 Prisma-free `lib/` modules stay single-source. Two native codebases would put
  the chlorine-decay maths in three languages that all have to agree — after three weeks spent
  getting that maths right, that is the last thing to volunteer for.
- **One app, not a tech app plus a portal app.** A standalone portal app is a read-only website
  wrapper, which is what App Store Guideline 4.2 rejects, and it would make
  `/portal/subscribe` — a consumer single-user purchase that Guideline 3.1.3(c)'s enterprise
  exemption explicitly does not cover — the app's main purpose. The November conclusion there was
  link-out, not full IAP. Nothing about that has changed.
- **Inherit `com.aquarunner247.pro`.** Play has seen it (submitted 2026-10-31), so it is
  permanent; a new id means a new listing and losing reviews, ratings and installs. If the portal
  ever does get its own app it takes `com.aquarunner247.portal`, matching the
  `com.aquarunner247.compliance` slot already reserved in `capacitor.config.ts`.
- **Technician-only was considered and rejected.** `app/dashboard/routes/page.tsx:74` populates
  the technician picker from every active user with **no role filter**, and
  `app/dashboard/visits/[id]/page.tsx:114` grants visit access on
  `isAdminOrOffice || visit.technicianId === appUser.id`. So an ADMIN can be assigned stops and
  can work them, and `UserRole` is a single enum — the owner-operator is not "both roles", he is
  an ADMIN with stops. A technician-only native app would hand the person most likely to be in
  the field all day a blank product.

### Non-goals

- Parity with the web app. Parity is the ceiling, never the win. Any screen not ported stays on
  the WebView, indefinitely if that is where it is most useful.
- Porting admin or portal screens. Not in this plan at any phase.
- Offline **writes**. Already solved — `lib/client/offline-queue.ts` replays readings, doses,
  checklist and photos from IndexedDB after a dead zone.
- Rewriting location tracking wholesale. Phase 0 fixes the defects and Phase 2 adds OS
  geofences; neither requires the native screens.

---

## What the earlier sizing got wrong

Both worth recording, because the second one moves the start line a long way forward.

**1. "A JSON API for every technician mutation would have to be built first. That is the bulk of
the cost."** It already exists, and predates the assessment by months. Eighteen endpoints under
`app/api/visits/` and `app/api/routes/`, built for the offline queue:

```
visits/[id]            DELETE      visits/[id]/doses          POST
visits/[id]/arrival    PATCH       visits/[id]/doses/[doseId] DELETE
visits/[id]/departure  PATCH       visits/[id]/photos         POST
visits/[id]/reading    PATCH       visits/[id]/photos/[id]    DELETE
visits/[id]/checklist  PATCH       visits/[id]/issues         POST
visits/[id]/status     PATCH       visits/[id]/volume         POST
visits/[id]/complete   POST        visits/[id]/ph-dose        POST
visits/[id]/reschedule PATCH       visits/reorder             PATCH
                                   routes/[routeId]/stops/reorder PATCH
```

The oldest landed 2026-07-08. The write API is not the work.

**2. The real gap is reads, and it is narrower than "build an API".** Every one of those
eighteen is a `PATCH`, `POST` or `DELETE`. **There is not a single `GET`.** Reads happen only by
server-rendering a page, which is exactly why a stop cannot be opened with no signal — and
exactly the trigger the 2026-11-17 note identified as the one that would justify this work.

So Phase 1 is not "build the technician API". It is "add the read half and let a native client
authenticate".

---

## Phase 0 — Fix departure detection (do this first, it is not a native problem)

The 2026-11-17 note blamed the ~50% departure-detection rate on "the OS killing a backgrounded
app" and concluded native would not help. That was wrong, and it was wrong in the direction that
matters: **two of the three causes are defects in our own JavaScript**, fixable in the Capacitor
app now, with no native code and no new API.

Departure is decided in the WebView: `@capacitor-community/background-geolocation` keeps a
foreground service alive and delivers fixes to a callback in
`app/components/route-day-view.tsx`, which keeps a per-stop "first seen away" marker and applies
the 30m margin + 3-minute dwell from `lib/departure-detection.ts`. Three things break that.

### 0a. DONE — we tore the watcher down before the last departure could happen

`route-day-view.tsx:493` —

```ts
function isDayFullyDone() {
  const visitItems = itemsRef.current.filter(...);
  return visitItems.every((v) => v.status === "COMPLETED" || v.status === "CANCELLED");
}
```

It does not look at `departedAt`. `handleFix` returns it, and the caller acts on it immediately
(`route-day-view.tsx:670`):

```ts
if (handleFix(location.latitude, location.longitude, location.accuracy)) {
  setLocationState("idle");
  teardown();            // removeWatcher
}
```

So the moment a technician taps Complete on the final stop — **while still standing at the
pool** — the watcher is removed. They then drive away and not one further fix is delivered, so
the 3-minute dwell can never elapse and that stop's departure can never be recorded. The app
being "shut for the day" is not what loses it; we are, several minutes earlier, with the app open
in their hand. The same teardown exists on both web paths (`:696`, `:720`).

**Fix:** the day is not done while any visit has `startedAt != null && departedAt == null` and is
not `CANCELLED`. Keep the watcher until the last departure resolves or the day rolls over. This
alone should recover the entire last-stop-of-day case, which is the one the operator cares about
most, since it is the stop whose duration ends up in a customer's report.

### 0b. DONE — a departure detected offline was dropped, not queued

`stampDeparture` (`route-day-view.tsx:434`) is a bare `fetch`. On failure it deletes the marker
and relies on a later fix retrying. But `lib/client/offline-queue.ts` already exists and already
replays readings, doses, checklist and photos through IndexedDB — and **neither arrival nor
departure goes through it.** A departure detected in a dead zone therefore survives only if the
technician regains coverage while the watcher is still running; combined with 0a, the last stop
of the day loses both ways.

**Fix:** route arrival and departure through `queuedSubmitJson` like every other technician
mutation. The timestamp is decided on the device anyway, so a replayed departure is just as
accurate as a live one — it has to be sent with its own `departedAt` rather than letting the
server stamp receipt time, which is a small change to
`app/api/visits/[id]/departure/route.ts` (it currently records the moment it is called).

### 0c. PART DONE — the dwell needs our JS alive for three minutes

The away-marker lives in a `useRef`. If the WebView process goes away during those three minutes
— the technician swipes the app off, taps **Cancel** on the "Tracking your route" notification
(our own `backgroundMessage` invites exactly that), or Android reclaims the process — the marker
is lost and the dwell restarts from nothing on relaunch. The foreground service makes this
*unlikely*, not impossible, and it is the residual cause after 0a and 0b.

Two levels of fix. The first is done; the second needs native code this app does not have yet.

**DONE — persist the dwell (`lib/departure-watch-state.ts`).** The away-markers are mirrored to
localStorage whenever a run starts or resets, and a relaunched app resumes a dwell in progress
instead of forgetting it. Two details carry most of the value:

- **A resumed departure records when the dwell *elapsed*, not when the app came back.** That is
  `departureTimeFor(awaySince)` in `lib/departure-detection.ts`. Recording "now" would pad the
  visit by the whole outage — exactly the class of defect that put 18-, 20- and 126-hour
  durations in customers' reports once before. This also fixed the live path, which was padding
  by however long the gap between fixes happened to be on a phone with poor signal.
- **A live fix always beats the mirror.** If the technician walked back to the pool during the
  outage, the first in-radius fix after relaunch clears the marker through the ordinary
  `nextAwaySince` reset, so a stale marker cannot conclude a departure for somebody standing
  there. Resuming only concludes anything when they were away before the gap *and* are still away
  after it.

Every doubtful input yields nothing: a different day, a marker past the resume window
(`DEPARTURE_SUSTAINED_MS` + 5 min), a timestamp in the future, corrupt JSON, or storage that
throws. The asymmetry is deliberate — failing to resume costs a departure, which is the bug we
already had; resuming wrongly writes a false duration into a customer's report.

**Still to do, and the honest native argument: register the stops as OS geofences** instead of
computing distance ourselves. Android's `GeofencingClient` supports an EXIT transition with a
loitering delay — precisely our 30m margin plus 3-minute dwell, implemented by the platform — and
delivers it to a `PendingIntent` that **starts the app process even after it has been killed**.
iOS region monitoring relaunches a terminated app the same way. The fence is held by the OS, so
there is nothing of ours that has to stay alive, which is the one thing persistence cannot buy:
if the process stays dead, nothing of ours runs to resume anything.

The cost is coarser geometry (~100m minimum radius is the documented guidance, and transitions
are rate-limited), so this coexists with the fix-based logic rather than replacing it — geofences
catch the app-is-dead case, the watcher keeps the precision while the app lives. It belongs in
Phase 2's plugin work and needs no screen ported.

**This is the one honest location argument for going native** — and it is narrower than "native
makes background location work". Worth noting it needs no screen ported: it belongs in Phase 2's
plugin work, so it lands long before any technician screen is rewritten.

### The baseline, measured before any of this deployed

Read from production on **2026-11-24**, before 0a/0b shipped, so the improvement is attributable
rather than argued. Lindley's org (`seed-org-aquarunner`) only, arrived and non-CANCELLED stops,
from **2026-10-27** — the day departures first appear at all, which matches the fix recorded in
`lib/departure-detection.ts`'s own comment. Everything before that date is zero and would only
dilute the number.

| | Arrived | Departure recorded | Rate |
| --- | --- | --- | --- |
| **Last stop of the day** | 54 | **1** | **1.9%** |
| Every other stop | 381 | 207 | 54.3% |

**This is the signature of 0a, and nothing else looks like this.** The hypothesis came from
reading the code, before any of it was measured: tearing the watcher down at the final Complete
should break the last stop of the day *specifically and almost totally*, while leaving the other
stops alone. A 28× gap between the two buckets is that prediction landing. It is not the OS
killing a backgrounded app — that would not care which stop was last.

The remaining 46% on ordinary stops is the other two causes, and those are the ones to judge
0b and 0c against. 0b (dead-zone losses) should take a bite out of it; whatever survives both is
0c, the WebView process dying mid-dwell, which is the only part that wants native.

**Done when:** a full day's stops each record a departure, including the last one, with the app
closed immediately after the final Complete and the phone in a dead zone on the drive home.
Re-run the query above a week after deploy. The number to watch is the last-stop row: it should
go from 1.9% to roughly the other bucket's rate, and if it does not, 0a was not the whole story.

---

## Phase 1 — Read API, bearer auth, local store

**Built inside the current Capacitor app. Ships and is useful on its own, with no native code.**
This is the phase that matters; everything after it is comparatively mechanical.

### 1a. DONE — bearer-token auth, one change point unlocking all eighteen endpoints

Today every API route resolves the user through `getCurrentAppUser()` →
`lib/supabase/server.ts` → `createServerClient` reading `cookies()`. Native clients cannot send
those cookies.

The change is small and lives in one place: let the server client accept
`Authorization: Bearer <access_token>` and validate it with `supabase.auth.getUser(token)`,
falling back to cookies when the header is absent. `getCurrentAppUser()` then works unchanged for
both callers, and every existing write endpoint becomes callable from native without being
touched.

Two things to be careful of:

- `getCurrentAppUser()`'s own doc comment notes `supabase.auth.getUser()` is a network round trip
  and "not cheap", called from 78 modules. A native client hitting a dozen endpoints per stop
  makes that cost visible in a way page rendering does not. Measure before adding endpoints that
  fan out.
- The same Supabase project and anon key serve both clients. **No new Supabase project, no new
  Vercel project, no migration.** The native app is another consumer of this backend; the API is
  more `app/api/*/route.ts` files in this repo, deployed by the same Vercel project.

### 1b. DONE — the read endpoints

Enough to open a day and work a stop offline. Field shapes come from the queries already feeding
`app/dashboard/schedule/page.tsx`, `app/components/route-day-view.tsx` (1,971 lines — the real
spec) and `app/dashboard/visits/[id]/page.tsx`:

- `GET /api/technician/day?date=YYYY-MM-DD` — the day's stops in order, with property, body of
  water, ETA offsets, status, and the sequence rules from `lib/day-sequence.ts`
- `GET /api/visits/[id]` — one stop in full: body, volume, feed mechanism, required readings,
  checklist definitions, last readings, dosing targets
- `GET /api/technician/reference` — the slow-changing org-wide set: enabled chemical products,
  service messages (interpolated), and the org's own flags (state, `trackCalciumHardness`,
  `trackSaltPpm`)

**The endpoints return the props the forms already take, not rows.** The first cut returned raw
Prisma rows, which pushed the derivation onto the caller — and `readingFields` comes out of the
organization's compliance ruleset, so a second copy of that derivation is a technician being
asked for the wrong readings the first time the two drift. `lib/visit-form-data.ts` now assembles
it once, and **`app/dashboard/visits/[id]/page.tsx` renders from the same function** rather than
keeping its own copy: that page lost 279 lines and no prop at either form's call site changed.
TypeScript checks all 18 props of `VisitForm` and 21 of `ResidentialVisitForm` against the
assembled bundle, so a wrong shape fails the build rather than the field.

This also closes the drift risk this plan previously only documented — with one still open:
`lib/technician-day.ts` and the schedule page's own day query remain two copies, and that page
has ad-hoc stops, the week tab and the admin view mixed into it, so unpicking it is Phase 3.

It fixed a quieter bug too. The first cut sent `reading` straight off Prisma; `JSON.stringify`
renders a Decimal as an object, so a client would have received something structurally different
from what the page passes its form, with nothing failing to say so. `serializeReading` now
applies on both paths and lives in a Prisma-free module so it can be tested — a module importing
`lib/prisma` cannot even be loaded in the node test environment.

**Correction to this plan's own list:** checklist definitions were listed under `reference` and
do not belong there. The query in `app/dashboard/visits/[id]/page.tsx` scopes them per visit —
`RESIDENTIAL` or `COMMERCIAL` by the property's type, minus any item that customer has opted out
of — so they are part of the stop, not of the organization, and they ship inside
`GET /api/visits/[id]`. Had they gone in the shared set, a residential technician would have been
handed the commercial checklist.

Deliberately coarse rather than REST-pure. A technician in a dead zone needs the whole day in one
round trip while they still have signal, not twelve chatty requests.

### 1c. DONE — the local store

Mirror those three responses into IndexedDB, alongside the existing outbound queue, and have the
day view and stop list read from the store with the network as refresh rather than as the source
of truth. Writes continue through `offline-queue.ts` untouched.

**Done when:** a technician can put the phone in airplane mode, open today's route, open any stop,
log readings, doses, checklist and photos, and have it all sync on reconnect. That is the entire
business case for this project, and it is reached here — before any native code exists. If the
native shell never follows, nothing is wasted and the WebView was never the problem.

---

## Phase 1d — Serve the app with no network at all

**This phase was missing from the plan, and Phase 1's "done when" cannot be met without it.**

Found while building 1c. `public/sw.js` is a deliberate no-op, and says so in its own first
comment: it exists only so browsers treat the app as installable, and it caches nothing — "every
request still goes to the network." Meanwhile `capacitor.config.ts` points `server.url` at
`https://aquarunner247.com`, so the native binary contains no app at all.

Put together: **with no network the WebView cannot load a single document.** Not the day view,
not a stop. The three read endpoints and the IndexedDB mirror from 1a–1c are necessary but not
sufficient — they ensure the *data* is on the device, and nothing yet ensures there is an
*application* to display it.

So airplane mode needs a cached app shell, and that forces a choice this plan should not make
silently, because the two options differ by an order of magnitude:

- **Stale-document fallback.** The service worker keeps the last successful HTML response for the
  technician routes and serves it on a navigation that fails. Small, and touches no screen. But
  the served HTML is a *previous* server render, so it carries whatever stops it had when it was
  cached, and a client-side reconciliation against the mirror has to correct it after boot. The
  risk is a technician briefly reading a stale day as though it were current.
- **Client-rendered technician shell.** The day view and stop detail become client components
  that read the mirror and treat the network as refresh — which is what 1c's own description
  assumed ("read from the store with the network as refresh rather than as the source of
  truth"). Correct by construction and no staleness ambiguity. ~~But `route-day-view.tsx` is 2,067
  lines and `visit-form.tsx` 1,542, and converting them is Phase 3's work pulled forward.~~
  **WRONG, and this was the sentence that made the cheap option look reasonable.** Both files are
  already `"use client"` — they have always run in the browser, and the server pages beneath them
  only query and pass props. Nothing needed converting. The actual work was a prop-assembly shell,
  which is what was built.

The second is the real answer and the first is the cheap one.

### Done, 2026-11-25

The client-rendered shell, at `/field`. Verified in a real browser against the built app, not by
reading: offline, `/field` loads from the service worker (status 200, `fromServiceWorker: true`)
while `/dashboard` fails with `ERR_INTERNET_DISCONNECTED` — which is the control case proving the
worker is not caching documents it must not.

**The thing that makes any of it safe.** `app/layout.tsx` renders the signed-in user's name and
their organization's name into *every* document, so no document of this app could be cached
without replaying one person's identity to whoever picks up a shared handset next. `/field` is
rendered through an `isFieldShell` branch that skips the user lookup and the nav entirely, and
`lib/service-worker-policy.ts` allows exactly that one document plus content-hashed
`/_next/static` — everything else, by default, is network-only and uncached. Checked by fetching
the built document and grepping it: no name, no org, no nav, no email.

**Identity is resolved on the client instead**, from the session already on the device, and
`lib/field-pointer.ts` records which Supabase account the mirror belongs to. Offline that
comparison is the only thing between one technician and another's customer list, so it was
tested as such: with the pointer rewritten to another account, the shell shows "Saved for a
different account" and the mirrored day stays hidden.

**One real defect, found by measuring rather than assuming.** A service worker does not control
the page that registers it, so the first visit to `/field` cached one file and only the *second*
cached all thirty-four — useless for a technician who opens field mode once at the depot and
drives off. `public/sw.js` now precaches on install, reading the chunk URLs out of the shell's own
HTML (they are content-hashed, so a static file in `public/` cannot know them ahead of time). One
visit now caches the document and all 33 assets.

**Also verified, closing the gap left open after Phase 1:** `/api/technician/day` and
`/api/technician/reference` both returned 200 against real Supabase Auth with a real session.
Phase 1 shipped without that check.

**Deliberately not in it.** Ad-hoc stops, because `technicianDay()` queries service visits only —
an office addition to the day's plan does not exist in the mirror. Reordering, because the write
persists 0..N-1 for the whole day and a mirror is not the authority on the plan; the list is
read-only. The multi-body photo screen, because it is server-rendered and not mirrored, so the
prompt is hidden rather than offered as a dead end. Arrival, departure, readings, doses, checklist
and photos all work, through the queue that already existed.

**The stop is selected with the URL hash** (`/field#stop=<id>`), not a query string or a route
segment. A hash never reaches the server and never asks Next's router for a payload, so one cached
document answers every stop and there is no URL a technician can reach that the cache has not
seen. For the same reason the entry point in `app/dashboard/more/page.tsx` is a plain `<a>`: a
`<Link>` is a client-side swap that fetches an RSC payload, and the worker only caches on a request
whose mode is `navigate`, so a `<Link>` would have left the cache empty.

Legal documents updated, per the standing order: Privacy Policy 1.7 (Section 9 and the Section 13
retention table), EULA 1.2 (Sections 2.3 and 7.5), DPA 1.4 (Section 6, renamed, and Section 3).
No new collection and nothing additional transmitted — the change is that customer records now
rest on a device for up to three days.

---

---

## Phase 2 — React Native shell around the WebView

Scaffold the RN app, inherit `com.aquarunner247.pro`, and render the existing site in a WebView
for every screen. Reimplement the Capacitor plugin surface the app depends on: background
geolocation (including whatever the `useLegacyBridge` Android workaround is standing in for),
camera, push, splash, status bar.

**Done when:** the RN build is indistinguishable from today's Capacitor build to a user. Ship it
to internal testing only. The point of this phase is to prove the shell and the plugins before
any screen depends on them.

### What this plan missed, found on 2026-11-25

**The plugin surface is not a list of plugins to reimplement. It is a seam that did not exist.**

Capacitor injects `window.Capacitor` into its WebView and the page talks to its plugins through
it. React Native injects no such thing. So on the day the shell changes, every
`Capacitor.isNativePlatform()` in `app/` goes false and **the app silently degrades to browser
behaviour** -- no background location watcher, no OS camera, no hardware back. Nothing throws and
nothing logs. The app looks fine and the thing it exists to do is off.

That is not a prediction. The first build of this shell loaded the live site and the hardware back
button did nothing at all, because production was still serving the old page code.

So Phase 2 starts in the WEB app, not in `native/`, and the first part of it is worth having
whether or not the rest ever ships.

### Done, 2026-11-25

**2a. One seam, four files rewired.** `lib/client/native-host.ts` is now the only file in the app
that imports `@capacitor/*`. `route-day-view.tsx`, `camera-capture.tsx`, `android-back-button.tsx`
and `get-geolocation.ts` ask for a capability instead of asking who is listening. Capacitor is one
implementation of three -- Capacitor, React Native, plain browser -- and deleting it in Phase 4 is
a change to that one file.

A fourth host kind exists on purpose: `react-native-incompatible`, for a shell whose bridge
version the page does not speak. It reports as a native app, not a browser, because an installed
binary can be months older than the site it loads and reporting "browser" there would resurrect
the exact silent degradation above. Capabilities refuse out loud instead.

**2b. The bridge, with the decidable half under test.** `lib/native-bridge-protocol.ts` (closed
capability list, envelopes, parsers, origin trust), `lib/native-bridge-client.ts` (the page:
correlation, timeouts, watcher routing) and `lib/native-bridge-host.ts` (the shell: who may ask,
what a failure looks like). All three in `lib/`, imported by both sides through Metro, so the two
halves cannot drift -- the same single-source rule this plan sets for the dosing maths. 94 new
tests across six files (plus five added to the open-source-notices guard), including a round-trip
suite that runs the real client against the real host over one string channel.

Everything inbound is untrusted in both directions. The shell process holds the camera, GPS and
notification permissions, and the WebView renders remote content and follows links, so a call is
acted on only when it parses completely AND the page is on a trusted origin -- re-checked per
message, because the technician navigates. Vercel previews are deliberately not trusted: a preview
URL is world-reachable and its content is whatever was last pushed to a branch.

**2c. The shell.** `native/`, Expo SDK 58, RN 0.88, with the native projects NOT committed --
`android/` and `ios/` regenerate from `app.config.ts`, because the repo root already has an
`android/` and two committed native directories is how somebody signs a release from the wrong one.

Verified on an Android 37 emulator with a release APK:

- Builds, installs, launches, renders the live production site with correct safe-area insets.
- **The bridge round-trips.** A hardware back press reaches the shell, is emitted to the page, the
  page decides the screen is a home screen, calls `app.minimize`, and the shell backgrounds the app
  with the process still alive. One press exercises the injected bootstrap, host detection, event
  delivery, a page-to-shell call, origin trust and a capability.
- **No new permissions.** This one nearly went wrong: a plain `expo prebuild` added six the app has
  never asked for -- microphone, both external-storage permissions, boot-completed,
  display-over-other-apps, vibrate -- purely from what the Expo plugins declare. Play shows that
  list to users and a new entry is a visible change plus a Data safety update; "a library we added
  wanted it" is not an answer to give a technician who reads it. `blockedPermissions` removes them,
  and `lib/__tests__/native-shell-config.test.ts` pins the result against the shipping bundle's
  merged manifest.
- The release manifest in fact asks for **two fewer** than today: `ACCESS_NETWORK_STATE` and
  `WAKE_LOCK`, which the Capacitor build only carries because `@capacitor/push-notifications`
  drags in Firebase for a permission prompt it never registers with.
- `minimizeApp` needs no custom native module: an `expo-intent-launcher` HOME intent backgrounds
  the Activity with its state intact, which is what the Capacitor plugin's `minimizeApp()` did and
  what "matches pressing Home" in the back-button comment already described.

Also added, because the emulator showed it: a failed load used to leave the technician on
react-native-webview's own "Error loading page / net::ERR_CONNECTION_REFUSED" screen with nothing
to tap. It now falls back to `/field` once, and if that fails too shows the app's own screen with
a Try again button, in palette, read from `lib/design-tokens.ts`.

**What is NOT verified, and cannot be from here:** the camera, the one-shot position and the
background watcher (an emulator has no camera and a synthetic GPS); whether background fixes keep
arriving with the screen off; the offline recovery to `/field`; and iOS, which is configured and
never built. See `native/README.md` for why each needs a device or a real HTTPS deployment.

**The one to measure first** is background delivery with the screen off. Both shells declare
`foregroundServiceType="location"` and neither holds a wake lock, so there is no reason to expect
a difference -- but unreliable departure detection is what started this whole project, and that
makes it the wrong thing to assume.

**Legal:** `content/legal/open-source-notices.md` gained a "The mobile app shell" section. Those
14 packages ship inside the binaries, so the MIT attribution travels with them; the existing drift
test now covers both manifests separately, because both install `react` at different versions and
one merged list would silently drop one of them.

## Phase 3 — Port the technician screens, one at a time

In dependency order, each shipping independently, each falling back to the WebView until it
lands:

1. Today's route / day view (`route-day-view.tsx`)
2. Stop detail and the visit form (`visit-form.tsx` 1,542 lines,
   `residential-visit-form.tsx` 1,248) — camera and dosing card are the hard parts
3. Technician home (`technician-home.tsx`, 158 lines — the easy one, do it first to shake out
   the plumbing)
4. Alerts (`app/dashboard/alerts/page.tsx`, 102 lines)

~5,500 lines total. The Prisma-free `lib/` modules — dosing calculator, chlorine demand,
abandoned-stop rules, timezone helpers — import as-is. **Keep writing them that way**; that habit
is what makes this phase a port instead of a rewrite.

## Phase 4 — Submit

Replace the Capacitor build on the existing listing. `GOOGLE-PLAY-SUBMISSION.md` and
`APP-REVIEW-NOTES.md` both describe the current shell and will need rewriting. The demo org
(`demo-appreview-org`, five logins) is already seeded with twelve weeks of history, so review
credentials do not change.

---

## Risks

- **Background location is mostly not an argument for native.** Two of its three causes are our
  own bugs and are fixed in Phase 0 below, in the current app. Only the third needs native, and
  even that has a Capacitor half-measure. Do not sell this project on the location problem — fix
  the location problem first and then see what is left.
- **Two clients, one set of rules.** The moment a native screen computes something the server
  also computes, they can disagree. Mitigated by the Prisma-free `lib/` modules being shared
  code, not reimplementations — which is the whole reason for choosing React Native.
- **Auth becomes two paths.** Cookie and bearer, both reaching `getCurrentAppUser()`. Needs tests
  that assert an expired or wrong-org token is refused on the API, not only in page guards. RLS
  is on every table (since 2026-07-17) but the API routes are the gate that matters here.
- **Scope creep toward parity.** The WebView fallback is what makes partial porting safe. Any
  pressure to port an admin screen "while we're in here" is the failure mode.
- **Timeline.** The 2026-11-17 figure was 3–6 months solo for the technician surface plus the
  API. Phase 1 is the smaller part of that and the only part with standalone value.

## Open questions

- Does Phase 1 alone satisfy the need? If technicians stop hitting dead zones once the day is
  readable offline, Phases 2–4 may never earn their keep. **Decide after Phase 1 ships, with
  real usage, not now.** Still open on 2026-11-25: Phase 2 was built the same day Phase 1d
  shipped, before any real usage of it. That order was a choice, and the cost of being wrong is
  bounded -- Phase 2a (the host seam) is a strict improvement to the web app whatever happens to
  the shell, and `native/` ships to nobody until somebody uploads it. Phase 3 is the one that
  should wait for the answer.
- Push notifications: currently unused by the technician flow. Native makes them cheap. Worth a
  product conversation separately, not a reason to go native.
- Does OFFICE ever need the native app? They have no tour and no field work. Assumed WebView.
