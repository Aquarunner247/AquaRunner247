# App Review notes

What to paste into **App Store Connect → App Review Information → Notes**, and the Google Play
equivalent. Kept in the repo so it can be updated alongside the thing it describes, rather than
being rewritten from memory at submission time.

Three things decide whether this app passes review, and the notes exist to answer all three
before a reviewer has to ask:

1. **Guideline 4.2 (minimum functionality).** The iOS app is a Capacitor shell that loads
   `https://aquarunner247.com` (`capacitor.config.ts`, `server.url`). That is the shape reviewers
   reject as a repackaged website, so the native capability has to be stated up front and be
   immediately reachable.
2. **A reviewer cannot trigger the headline feature.** GPS auto-arrival fires inside a geofence
   at a pool in Las Vegas. Someone testing in Cupertino will never cross one. Without being told
   about the manual **"I've arrived"** button they will conclude the feature does not work.
3. **Guideline 3.1.1 (in-app purchase).** There is no purchase flow in the app at all right now,
   which is the simplest possible answer — but only if it is said plainly.

Update the credentials block before every submission, and re-run
`npm run db:seed-app-review-org -- --apply` against production so the demo data has a current
week in it.

---

## Paste-ready notes

> **What this app is**
>
> AquaRunner 24/7 Pro is a field-service tool for commercial pool maintenance companies. Their
> technicians use it on phones at pool sites to record water chemistry, chemical dosing,
> safety-checklist items and photographic proof of service, and to produce the logs that state
> health departments require for public pools. It is sold to businesses; the people using it are
> employees of those businesses.
>
> **Demo account**
>
> Username: appreview@aquarunner247.com
> Password: kept out of this repo on purpose. It is in the password manager under "AquaRunner demo review account" — paste it straight into the store console.
>
> This is a dedicated demo organization with sample properties and two weeks of sample service
> history. It contains no real customer data.
>
> **Please note: the app's core feature cannot trigger at your location, but there is a manual
> path**
>
> Arrival at a stop is normally detected automatically by geofence when a technician drives to a
> customer's pool in Las Vegas. That cannot happen during review, so every screen also offers a
> manual control. To see the full workflow:
>
> 1. Sign in with the account above.
> 2. Open **Schedule** from the bottom navigation. The demo route has five stops scheduled today.
> 3. Tap any stop to open it.
> 4. Tap **"I've arrived"**. This is the manual equivalent of the geofence trigger and works
>    anywhere in the world.
> 5. Enter water chemistry readings, tick checklist items, and tap the camera control to take a
>    proof-of-service photo. The camera is used directly — the app never reads the photo library.
> 6. Complete the stop. A service summary is generated for the property's contact.
>
> **Native capabilities (re: Guideline 4.2)**
>
> The app is not a wrapped website. It uses iOS capabilities that a browser cannot provide, and
> they are central to the product rather than decorative:
>
> - **Background location** drives automatic arrival and departure logging. A technician visits
>   around nine pools in a working day, sometimes more than twenty, driving between them with the
>   phone locked or showing Maps; the app detects arrival at each geofenced site and timestamps
>   it without the technician touching the phone, and detects leaving a site that was not
>   finished so the office is alerted. This is why the app requests "Always" location,
>   and the persistent iOS location indicator is expected behaviour.
> - **Camera** captures proof-of-service photos at the poolside, including a blur check so a
>   technician is told to retake an unusable photo before leaving the site.
> - **Push notification permission** is requested on Android to support the foreground service
>   that background location requires.
> - **Offline queueing** holds readings and photos taken in pump rooms with no signal and
>   synchronises them when connectivity returns.
>
> **In-app purchase (re: Guideline 3.1.1)**
>
> There is no purchase of any kind available in this app. Accounts are provisioned directly by us
> for business customers; self-service signup is disabled and no payment processing is configured
> in the production environment. A reviewer cannot reach a purchase screen because none exists.
>
> Subscriptions are sold business-to-business outside the app, under Guideline 3.1.3(c)
> (Enterprise Services) — the app is sold directly to organizations for use by their employees,
> not to individual consumers.
>
> **Account deletion (re: Guideline 5.1.1(v))**
>
> Account deletion is available inside the app:
>
> - An administrator deletes the whole organization account at **Settings → Billing**, at the
>   bottom of the page, confirming by typing the business name.
> - An individual portal user deletes their own login at **Your account** in the portal
>   navigation.
>
> Both delete immediately. Health-department compliance logs are retained afterwards because the
> record belongs to the body of water rather than to the service company, and this is disclosed
> in the deletion dialog and in our Privacy Policy.
>
> **Privacy**
>
> Privacy Policy: https://aquarunner247.com/privacy
> Terms: https://aquarunner247.com/terms
> End User License Agreement: https://aquarunner247.com/eula
>
> Location data is used only to timestamp arrival at and departure from a scheduled work site.
> The app reads location continuously while a technician has an unfinished route open, but only
> the single position fix that records an arrival is transmitted to our servers and stored. A
> departure is derived on the device and transmitted as a timestamp with no position attached,
> so the service visit shows how long it took. The intervening positions are evaluated on the
> device and discarded. We do not build a continuous location
> trail, and we do not use location for advertising. Our privacy manifest declares every category
> we collect.

---

## Checklist before hitting submit

- [ ] Paste the demo password into App Store Connect directly — it is deliberately not in
      this repo, so it has to come from the password manager at submission time
- [ ] Re-run the demo seeder against production so "today" has stops on it
      (the schedule is anchored to the seeding day and is empty by the next morning,
      which also stops the location watcher and the background-location disclosure)
- [ ] Sign in as the demo account on a device and walk the six steps above — if any of them has
      drifted, the notes are worse than useless
- [ ] Confirm `PrivacyInfo.xcprivacy` is in Build Phases → Copy Bundle Resources
- [ ] Confirm the bundle identifier `com.aquarunner247.pro` is still free on BOTH stores.
      App Store Connect rejects a collision when you register it, which is the real test; Play
      is the same. It is permanent on both once either has seen it
- [ ] App Store Connect privacy answers match `ios/App/App/PrivacyInfo.xcprivacy` — ten data
      types, all linked, none used for tracking
- [ ] Google Play Data Safety form mirrors the same ten types

## If it gets rejected anyway

The most likely rejection is **4.2**, and the answer is a screen recording rather than an
argument: record a technician's day — arrival, readings, photo capture, offline queueing — and
reply with it. Reviewers respond to seeing the native behaviour far better than to a description
of it.

The second most likely is a **background location** challenge, asking why "Always" is needed.
The answer is in the notes above and in `Info.plist`'s usage string: the technician is driving
with the phone locked, and the whole point is that arrival is recorded without them touching the
phone. An app that only logged location while in the foreground would not do the job.
