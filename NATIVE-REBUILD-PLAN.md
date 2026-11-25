# Native rebuild plan

Status: **Phase 0a and 0b are built and tested. Everything from Phase 0c on is plan only.**
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

### 0c. TODO — the dwell needs our JS alive for three minutes, and this one is genuinely native

The away-marker lives in a `useRef`. If the WebView process goes away during those three minutes
— the technician swipes the app off, taps **Cancel** on the "Tracking your route" notification
(our own `backgroundMessage` invites exactly that), or Android reclaims the process — the marker
is lost and the dwell restarts from nothing on relaunch. The foreground service makes this
*unlikely*, not impossible, and it is the residual cause after 0a and 0b.

Two levels of fix:

- **In Capacitor, partial:** persist the away-markers (and the arrival state) to IndexedDB on
  every fix instead of holding them only in refs, so a relaunched app resumes a dwell in progress
  rather than forgetting it. Cheap, and worth doing regardless.
- **Native, actual fix:** register the stops as **OS geofences** instead of computing distance
  ourselves. Android's `GeofencingClient` supports an EXIT transition with a loitering delay —
  which is precisely our 30m margin plus 3-minute dwell, implemented by the platform — and
  delivers it to a `PendingIntent` that **starts the app process even after it has been
  killed**. iOS region monitoring relaunches a terminated app the same way. The fence is held by
  the OS, so there is nothing of ours that has to stay alive. The cost is coarser geometry
  (~100m minimum radius is the documented guidance, and transitions are rate-limited), so this
  likely coexists with the fix-based logic rather than replacing it: geofences catch the
  app-is-dead case, the watcher keeps the precision while the app lives.

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

### 1a. Bearer-token auth — one change point unlocks all eighteen endpoints

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

### 1b. The read endpoints

Enough to open a day and work a stop offline. Field shapes come from the queries already feeding
`app/dashboard/schedule/page.tsx`, `app/components/route-day-view.tsx` (1,971 lines — the real
spec) and `app/dashboard/visits/[id]/page.tsx`:

- `GET /api/technician/day?date=YYYY-MM-DD` — the day's stops in order, with property, body of
  water, ETA offsets, status, and the sequence rules from `lib/day-sequence.ts`
- `GET /api/visits/[id]` — one stop in full: body, volume, feed mechanism, required readings,
  checklist definitions, last readings, dosing targets
- `GET /api/technician/reference` — the slow-changing set the forms need: checklist definitions,
  enabled chemical products, service messages, compliance bounds

Deliberately coarse rather than REST-pure. A technician in a dead zone needs the whole day in one
round trip while they still have signal, not twelve chatty requests.

### 1c. The local store

Mirror those three responses into IndexedDB, alongside the existing outbound queue, and have the
day view and stop list read from the store with the network as refresh rather than as the source
of truth. Writes continue through `offline-queue.ts` untouched.

**Done when:** a technician can put the phone in airplane mode, open today's route, open any stop,
log readings, doses, checklist and photos, and have it all sync on reconnect. That is the entire
business case for this project, and it is reached here — before any native code exists. If the
native shell never follows, nothing is wasted and the WebView was never the problem.

---

## Phase 2 — React Native shell around the WebView

Scaffold the RN app, inherit `com.aquarunner247.pro`, and render the existing site in a WebView
for every screen. Reimplement the Capacitor plugin surface the app depends on: background
geolocation (including whatever the `useLegacyBridge` Android workaround is standing in for),
camera, push, splash, status bar.

**Done when:** the RN build is indistinguishable from today's Capacitor build to a user. Ship it
to internal testing only. The point of this phase is to prove the shell and the plugins before
any screen depends on them.

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
  real usage, not now.**
- Push notifications: currently unused by the technician flow. Native makes them cheap. Worth a
  product conversation separately, not a reason to go native.
- Does OFFICE ever need the native app? They have no tour and no field work. Assumed WebView.
