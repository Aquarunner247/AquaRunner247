# Google Play submission — AquaRunner 24/7 Pro

Everything the Play Console asks for, with the answers already decided and the reasoning behind
the ones that are easy to get wrong. Paste-ready sections are blockquoted.

Package name: **`com.aquarunner247.pro`** · `versionCode 1` · `versionName 1.0` ·
`minSdk 24` · `targetSdk 36`

---

## The two that actually fail apps

### 1. Background location — Permissions Declaration + video

`ACCESS_BACKGROUND_LOCATION` is the most scrutinised permission on Play. The console will make
you fill a declaration and attach a video. Expect this to be the long pole.

**Why the app needs it** (paste into the declaration):

> A technician drives a route of around nine pools in a working day, sometimes more than twenty.
> The app detects arrival at each geofenced site and timestamps it, and detects when a technician
> leaves a site they have not finished so the office can be alerted while somebody can still act
> on it. Both happen while the phone is locked or showing a navigation app, which is why
> foreground-only location cannot do the job: the technician is driving, and the whole point is
> that the record is made without them touching the phone.
>
> Only the single position fix that records an arrival is transmitted and stored. A departure is
> worked out on the device and transmitted as a timestamp with no position attached. The
> positions in between are evaluated on the device and discarded, and tracking stops on its own
> once the day's stops are complete. We do not build or retain a continuous location trail.

**The video** must show the in-app disclosure, the permission request, and the feature working.
Record: open a route for the day → the disclosure panel appears → tap "Allow location" → the OS
dialog → drive/walk into a stop's geofence → the stop stamps arrival on its own.

**The in-app disclosure is already built** (`lib/background-location-disclosure.ts`, shown by
`app/components/route-day-view.tsx` before any permission is requested). Do not reword it without
re-reading that file's comment — `lib/__tests__/background-location-disclosure.test.ts` pins the
phrases a reviewer looks for.

### 2. Data Safety form

**Corrected 2026-11-11.** The sheet the 2026-10-31 filing was made from was the previous version
of this section, and it missed the three rows marked **bold** below. The operator reports the filed
form also answers "no data shared with third parties," which Nominatim contradicts. Re-answer the
form from this table before the next release.

Scope is narrower than the Privacy Policy and the two are *supposed* to differ. Play defines
collection as "transmitting data from your app off a user's device" and sharing as "transferring
user data collected from your app to a third party." The Privacy Policy covers the whole Service
— web dashboard, inbound phone line, server-side processing — so it declares things this form
must not. Over-declaring is not the safe direction: it prints on the public store label as data
the app takes.

Everything collected is **linked to the user**. **Nothing is used for tracking.**

| Play category | What it is | Shared? |
|---|---|---|
| Personal info → Name | Technician and customer names | No |
| Personal info → Email address | Logins and report recipients | No |
| Personal info → Phone number | Customer and technician contact | No |
| Personal info → Address | Service property addresses | **Yes — see Nominatim below** |
| Personal info → User IDs | Account identifiers | No |
| Location → Precise location | The arrival position fix only | No |
| Photos and videos → Photos | Proof-of-service photos | No |
| **Files and docs** | Inspection reports an admin uploads (`app/api/inspection-reports/[reportId]/extract`) — a PDF or scan, which is a file and not "other user-generated content" | No |
| App activity → Other user-generated content | Readings, notes, checklists | No |
| **App activity → App interactions** | Page views, collected by `@vercel/analytics` and `SpeedInsights`, which `app/layout.tsx` loads in the **root** layout, unconditionally — so they run inside the Capacitor shell too, on every route | No |
| App performance → Crash logs | Sentry, client-side via `instrumentation-client.ts` | No |
| App performance → Diagnostics | Sentry performance + Speed Insights | No |

**Purpose** for every row: App functionality. Vercel Analytics and Speed Insights are additionally **Analytics**. Nothing is Advertising or personalisation.

**Why only Address is "shared".** Play excludes a transfer to a "service provider," defined as
"an entity that processes user data on behalf of the developer and based on the developer's
instructions." Supabase, Twilio, OpenAI, Dialogflow, Resend, Stripe, Sentry and Dash0 all meet
that — contracted, processing on instruction — so they are collection, not sharing. **Nominatim
(OpenStreetMap Foundation) and the OSRM demo server (FOSSGIS) do not.** DPA Section 5.2.1 says so
in as many words: they operate under a published usage policy, not a negotiated agreement, so
nobody is processing on our instructions. `app/components/address-fields.tsx` sends what an admin
types to `/api/geocode/suggest`, which forwards it to Nominatim, and `lib/geocode.ts` and
`lib/routing.ts` do the same server-side. An address collected through the app reaches a third
party that is not a service provider. That is sharing, and the answer is yes.

**Not declared, deliberately.** Each of these is a real feature of the *Service* that the app
does not collect, so declaring it would describe the wrong product:

- **Audio → Voice or sound recordings.** The app never opens the microphone. There is no
  `RECORD_AUDIO` in `AndroidManifest.xml`, no `getUserMedia({audio})` anywhere
  (`app/components/camera-capture.tsx:220` passes `audio: false`), and the Regia dictation
  parser in `lib/reading-dictation.ts` is not wired to any speech API — `RegiaConfirm` is not
  mounted on any page. Twilio records *inbound phone calls* server-side, from callers who are not
  using the app at all; no audio is ever transmitted from a user's device. **A 2026-11-11 outside
  review called this the riskiest mismatch on the form. It is not a mismatch** — it is the
  Privacy Policy covering the phone line and the form covering the app. Revisit the moment
  dictation is wired up or a voice note is added, and `ios/App/App/PrivacyInfo.xcprivacy` says
  the same thing for the same reason.
- **Photos and videos → Videos**, and the photo *library*. `camera-capture.tsx` uses
  `CameraSource.Camera` only; the library is never read.
- **Financial info.** No purchase flow exists in the app. `/portal/subscribe` sends anyone in the
  shell out to a browser (`lib/native-shell.ts`), and Stripe has no production configuration.
  Declare it the day an in-app checkout ships.
- **Location → Approximate location.** `ACCESS_COARSE_LOCATION` is requested only because
  Android pairs it with fine location; only the precise arrival fix is transmitted. The Leaflet
  maps do fetch tiles straight from `tile.openstreetmap.org`, which discloses the area being
  *viewed*, but the viewport is centred on a route or a property rather than on the device, and
  Play's type is the user's or device's own position. Judgement call, recorded so it can be
  revisited rather than rediscovered.
- **Messages, Contacts, Calendar, Health and fitness, Web browsing history.** None are touched.
- **Device or other IDs.** Declared until 2026-11-12, then removed with Google Analytics itself. GA4 was the only thing on the site setting a device or browser identifier — a persistent `_ga` client ID — and it contradicted Privacy Policy Section 9. `client_storage: 'none'` was tried first and does nothing: it is a Universal Analytics option that GA4 ignores, confirmed by loading the deployed site in a clean browser and finding a fresh `_ga` written anyway. Vercel Analytics and Speed Insights set no cookie and no identifier. Restore this row if any analytics SDK that identifies a device is ever added back.

**The rest of the form:**

- **Is data encrypted in transit?** Yes.
- **Can users request data deletion?** Yes — and the app also deletes in-app: `/billing` for an
  organization, `/portal/account` for an end customer.
- **Data deletion URL:** `https://aquarunner247.com/account-deletion`

`lib/__tests__/play-data-safety-declaration.test.ts` fails if a client-side third-party data
integration appears in the app without a line in this table, which is how the three missing rows
got missed in the first place.

> **`ios/App/App/PrivacyInfo.xcprivacy` is worth a second look.** It
> declares precise location, photos and the rest, and sets `NSPrivacyTracking`
> false with an empty `NSPrivacyTrackingDomains`. With Google Analytics gone the
> gap is much smaller, but confirm it still matches before the App Store filing;
> the two stores must not be told different things.

---

## Before you can upload anything

- [ ] **Create an upload keystore** and keep it somewhere you will still have in five years.
      Losing it means you cannot update the app under this package name, ever.
      `keytool -genkey -v -keystore aquarunner-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
- [ ] **Enrol in Play App Signing** (default for new apps). Google holds the release key; your
      keystore is only the upload key, which can be reset if lost — but only if you enrolled.
- [ ] Put the keystore path and passwords in `android/keystore.properties`, which is **not** in
      git and must stay that way.
- [ ] Build the bundle: `npx cap sync android` then `./gradlew bundleRelease` in `android/`.
- [ ] **Register `com.aquarunner247.pro`** in the console. It is permanent on first upload.

---

## Store listing

**App name** (30 max): `AquaRunner 24/7 Pro`

**Short description** (80 max):

> Pool service routes, chemistry logs and state compliance records, built for the field.

**Full description:**

> AquaRunner 24/7 Pro is the field and office app for pool service companies running residential
> and commercial routes.
>
> Technicians see the day's stops in driving order, log chemistry readings and chemical doses at
> the poolside, capture proof-of-service photos, and work through state-specific compliance
> checklists for commercial pools. Arrival at each stop is timestamped automatically, so the
> record is made without stopping to tap anything.
>
> Admins and office staff build and adjust routes, assign stops to technicians, and watch the day
> unfold as it happens — overdue stops, open issues, and out-of-range readings surface while
> there's still time to do something about them. A service report goes out automatically after
> every visit, and customers can check their own history without calling the office.
>
> • Route and schedule for the day, in driving order
> • Water chemistry logging with dosage calculations
> • Proof-of-service photos, with a blur check before they are accepted
> • State-specific commercial compliance log sheets
> • Route building, technician assignment, and live office alerts
> • Automatic service reports and a customer self-service portal
> • QR-coded public record for each body of water
> • Works offline and syncs when signal returns
>
> This app is for staff of a pool service company with an AquaRunner account. It is not a
> consumer app and does not sell subscriptions inside the app.

**Graphics you still need to make:**

- [ ] App icon 512×512 — **already generated** at `store/google-play/icon-512.png`
- [ ] Feature graphic 1024×500 — required, no exceptions
- [ ] At least 2 phone screenshots (4 or more is better). Best candidates: the day's route list,
      a reading entry screen, and the public QR inspector record at `/p/<publicSlug>` --
      `/p/demo-dp-pool` on the demo org. That last one IS the compliance log sheet: the monthly
      table at the top of `app/p/[publicSlug]/page.tsx` is the only surface in the app that
      renders `getMonthlyReadingRows`, and Nevada's own seed notes say it mirrors SNHD's paper
      form. An earlier version of this list named the log sheet and the QR page as two separate
      screenshots; they are one screen.

**Category:** Business. **Content rating:** answer the questionnaire honestly — no user-generated
content shared publicly, no ads, no purchases in the app. Expect "Everyone".

---

## Things that will catch you out

**Closed testing is NOT required here.** The developer account is an **organisation**
(confirmed 2026-10-27), so the 12-testers-for-14-days rule that gates individual accounts does
not apply and this can go straight to production. Worth writing down because it is the single
biggest difference in how long a first submission takes, and the answer is not visible from the
code.

### App access credentials

Paste these into **App access → All functionality is restricted** in the console. The demo
organisation is seeded on production (3 properties, 5 bodies of water, a route, 14 days of
completed visits and today's schedule) and is isolated from the real customer's data.

> **Instructions:** Sign in at https://aquarunner247.com/login with the account below. It is a
> demonstration pool-service company created for review; it contains no real customer data.
>
> Username: appreview@aquarunner247.com
> Password: kept out of this repo on purpose. It is in the password manager under "AquaRunner demo review account" — paste it straight into the store console.
>
> For the technician experience, including automatic arrival logging, sign in instead as:
> appreview-tech@aquarunner247.com — same password.

> **The demo schedule goes stale after one day.** Visits are anchored to the day the seeder
> ran, so by the next morning the technician's route is empty — and an empty day reads as
> "finished" to the app, which means no location watcher starts and the background-location
> disclosure never appears. Proven on 2026-10-29, a day after seeding. Re-run the seeder the
> morning you submit, and again before recording the permissions video.

**A reviewer has to be able to sign in.** The app opens on a login wall, so Play's **App access**
section needs working credentials or it is an automatic rejection. Use the demo organisation from
`scripts/seed-app-review-org.ts` — the same one the App Store notes use. It has NOT been run
against production yet; that is a prerequisite for this section, not an afterthought.

**No in-app purchases, deliberately.** `/portal/subscribe` is gated off inside the native shell
(`lib/native-shell.ts`), and nothing in the app sells anything. That is the answer if review asks
why a business app has no billing: subscriptions are sold to companies on the web.

**It is a WebView around aquarunner247.com, and that is fine** — but if review raises minimum
functionality, the answer is the native capabilities, not the wrapper: background location for
automatic arrival logging, camera for proof-of-service capture, notification permission for the
foreground-service notice Android itself requires, and offline queueing.

**The persistent notification is not optional.** Android requires a foreground-service notice to
keep delivering background location. "Tracking your route" with a cancel action is that notice,
and a reviewer seeing it is expected behaviour, not a bug.

---

## Order of operations

Organisation account, so production is reachable directly.

1. Keystore + Play App Signing, register the package name
2. Seed the demo organisation against production, and fill its password into **both** this file
   and `APP-REVIEW-NOTES.md` — the reviewer cannot get past the login without it
3. Build and upload the bundle
4. Data Safety form, the deletion URL, content rating, App access credentials
5. Background-location declaration and video
6. Feature graphic and screenshots
7. Submit to production

Items 5 and 6 are the only ones that need something made rather than filled in, so they set the
pace.

Apple comes after this passes. `APP-REVIEW-NOTES.md` has the App Store side, and the two filings
must keep saying the same thing about data — if one changes, change both.
