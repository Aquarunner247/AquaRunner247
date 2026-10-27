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

Answer it to match `ios/App/App/PrivacyInfo.xcprivacy`, so the two stores are not told different
things. Collected, **linked to the user**, **none used for tracking**, none shared with third
parties for advertising:

| Play category | What it is |
|---|---|
| Personal info → Name | Technician and customer names |
| Personal info → Email address | Logins and report recipients |
| Personal info → Phone number | Customer and technician contact |
| Personal info → Address | Service property addresses |
| Personal info → User IDs | Account identifiers |
| Location → Precise location | The arrival position fix only |
| Photos and videos → Photos | Proof-of-service photos |
| App activity → Other user-generated content | Readings, notes, checklists, documents |
| App performance → Crash logs | Sentry |
| App performance → Diagnostics | Performance traces |

- **Is data encrypted in transit?** Yes.
- **Can users request data deletion?** Yes — URL below.
- **Data deletion URL:** `https://aquarunner247.com/account-deletion`

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

> AquaRunner 24/7 Pro is the field app for pool service companies running residential and
> commercial routes.
>
> Technicians see the day's stops in driving order, log chemistry readings and chemical doses at
> the poolside, capture proof-of-service photos, and work through state-specific compliance
> checklists for commercial pools. Arrival at each stop is timestamped automatically, so the
> record is made without stopping to tap anything.
>
> • Route and schedule for the day, in driving order
> • Water chemistry logging with dosage calculations
> • Proof-of-service photos, with a blur check before they are accepted
> • State-specific commercial compliance log sheets
> • QR-coded public record for each body of water
> • Works offline and syncs when signal returns
>
> This app is for staff of a pool service company with an AquaRunner account. It is not a
> consumer app and does not sell subscriptions inside the app.

**Graphics you still need to make:**

- [ ] App icon 512×512 — **already generated** at `store/google-play/icon-512.png`
- [ ] Feature graphic 1024×500 — required, no exceptions
- [ ] At least 2 phone screenshots (4 or more is better). Best candidates: the day's route list,
      a reading entry screen, the compliance log sheet, the QR record page.

**Category:** Business. **Content rating:** answer the questionnaire honestly — no user-generated
content shared publicly, no ads, no purchases in the app. Expect "Everyone".

---

## Things that will catch you out

**Closed testing is NOT required here.** The developer account is an **organisation**
(confirmed 2026-10-27), so the 12-testers-for-14-days rule that gates individual accounts does
not apply and this can go straight to production. Worth writing down because it is the single
biggest difference in how long a first submission takes, and the answer is not visible from the
code.

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
