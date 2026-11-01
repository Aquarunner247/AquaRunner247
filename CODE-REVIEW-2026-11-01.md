# Code review — 2026-11-01

A read-only pass over the codebase, written down for after the Google Play review clears.
**Nothing here has been changed yet.** Every item cites `file:line` as of master `1056282`.

Method: five parallel passes (authorization/tenant isolation; webhooks, cron, email, exports;
core domain logic; frontend/PWA/native shell/CSP; schema/config/ops), each verified against the
source, then the top-severity items re-checked by hand. "Confirmed" means the code was read and
the failure traced; "likely" means the mechanism is real but a runtime detail wasn't reproduced.

Delete or fold this into HANDOFF.md once the items are worked — a stale review is worse than none.

---

## Start here: the seven that matter most

| # | Sev | What | Where |
|---|-----|------|-------|
| 1 | **Critical** | Voice dictation turns "pH seven four" into **11** and saves it as a real reading | `lib/reading-dictation.ts:233-236` |
| 2 | **High** | Deleting a body of water or customer **cascades away the compliance records the product promises to keep** | `customers/[id]/actions.ts:733-757, 1115-1146`; `schema.prisma:1011,1131,1214,1493,1641` |
| 3 | **High** | Kidney/freeform pool volume is ~2.2× too high → **~2.2× chemical dose recommendations** | `lib/volume-calculator.ts:60-64` |
| 4 | **High** | **Open redirect** in both auth callbacks via `?next=` — lands on an attacker host right after a real session is set | `app/auth/confirm/route.ts:31,69`; `app/auth/callback/route.ts:9,33` |
| 5 | **High** | Signup completion can provision a **free, never-expiring org with no Stripe session** once `SIGNUPS_ENABLED` is on | `app/signup/actions.ts:293-343` |
| 6 | **High** | Pay periods, "today" totals and rate effective-dates are computed in **UTC, not the org's zone** | `lib/technician-pay.ts:44-50,65-121,227-228` |
| 7 | **High** | Four **critical npm advisories in direct deps** with fixes available — incl. `@capacitor/android` (remote-content-at-app-origin) and `next` (image optimizer RCE) | `package.json` |

Items 1–3 are correctness bugs in the compliance/chemistry core — the thing the product is for.
Items 4–5 are security. Item 7 needs a native rebuild (versionCode 5) so it should ride the first
post-review build.

---

## Critical

### C1. Dictation sums adjacent digit words instead of refusing — fabricates compliance values
- **Where:** `lib/reading-dictation.ts:233-236` (`if (w in SMALL_WORDS) { current += SMALL_WORDS[w] }`), contradicting the module's own comment at `:193-197` ("'seven four' is genuinely ambiguous … guessing at a reading is the one thing this must not do").
- **What:** "pH seven four" → 7 + 4 = **11**; "free chlorine three two" → **5**. Both fall inside the plausibility window and are saved with no `suspect` flag. Verified by execution.
- **Fix:** In the SMALL_WORDS branch, when `current` already holds a completed unit (0 < current < 10) and no tens/hundred word intervened, return `null` so the phrase surfaces as unmatched for confirmation.
- **Confidence:** confirmed

## High

### H1. Deleting a body of water / customer destroys retained compliance records
- **Where:** `app/dashboard/customers/[id]/actions.ts:733-757` (`deleteBodyOfWater`, bare `delete`), `:1115-1146` (`deleteCustomer`, `deleteMany` on properties). Cascades: `prisma/schema.prisma:1011` BodyOfWater→Property, `:1131` InspectionReport, `:1214` ContaminationIncident, `:1493`/`:1641` ServiceVisit→VisitWaterReading.
- **What:** One admin click erases the pool's full reading history, incidents, inspection reports and its public `/p/[slug]` inspector log — exactly what `RETAINED_AFTER_DELETION`, `app/account-deletion/page.tsx:85-91` and `lib/org-scrub.ts:15-30` promise survives even account deletion. No guard checks for existing visits. Storage objects for cascaded `VisitPhoto` rows are orphaned too. `endCustomerRelationship` is the only safe path and nothing steers admins to it.
- **Fix:** Refuse (or gate behind the typed-confirmation pattern) when the body/customer has any `VisitWaterReading`, `ContaminationIncident` or `InspectionReport`; point to "end relationship". Consider `onDelete: Restrict` on those FKs.
- **Confidence:** confirmed (found independently by two passes)

### H2. Kidney/freeform volume omits the 0.45 factor
- **Where:** `lib/volume-calculator.ts:60-64`; inputs at `app/components/volume-calculator.tsx:166-167`.
- **What:** Computes `(A + B) × width × depth × 7.5`. Industry formula is `0.45 × (A + B) × length × avg depth × 7.5`. Every ppm-delta dose scales with gallons (`lib/dosing-calculator.ts:436`), so a kidney pool gets ~2.2× the chlorine/acid recommendation. (`OVAL`'s 6.7 constant is correct.)
- **Fix:** Multiply by 0.45; relabel the "Width" input as length for this shape.
- **Confidence:** confirmed (formula); dosing impact likely

### H3. Open redirect in auth callbacks via `next`
- **Where:** `app/auth/confirm/route.ts:31,69`, `app/auth/callback/route.ts:9,33`.
- **What:** `next` is taken raw from the query and concatenated as `` `${origin}${next}` ``. `?next=@evil.com/` yields `https://aquarunner247.com@evil.com/` — host `evil.com`. On `/auth/confirm` with a valid recovery token the user is redirected to the attacker **after** a session cookie is set; the link genuinely starts on the real domain. `confirmFailurePath()` is safe; the success branch is not.
- **Fix:** One shared helper that accepts only `/^\/(?!\/)[^@\\]*$/`-style relative paths, else `/dashboard`.
- **Confidence:** confirmed

### H4. `completeSignup` provisions an unbilled org from a bare form POST
- **Where:** `app/signup/actions.ts:293-343` (branch at 340-342 → `resolveFromForm` 197-227); only gate is `SIGNUPS_ENABLED` at `:294`.
- **What:** With no `sessionId`/`orgId`, the action trusts resubmitted form fields and creates a `TRIALING` org + ADMIN user with `trialEndsAt: null` and no Stripe ids. Nothing expires it (`app/dashboard/layout.tsx:30-31` only blocks CANCELED/PAST_DUE). `checkBotId()` runs only in `signUp`. The same branch is what `signUp:102-107` takes whenever `priceIdForTier()` is null — so the stale price env names HANDOFF.md mentions would turn *every* signup into a free account. Latent today (signups off).
- **Fix:** Refuse the no-Stripe branch in production unless an explicit `ALLOW_UNBILLED_SIGNUP` flag is set; fail `signUp` loudly when a tier's price id is unset; add the bot check to `completeSignup`.
- **Confidence:** confirmed (two passes)

### H5. Pay math runs in server (UTC) time
- **Where:** `lib/technician-pay.ts:44-50,65-121,227-228`; `app/dashboard/settings/pay-rates/actions.ts:18-23`; `app/api/exports/quickbooks/technician-pay/route.ts:25-26`.
- **What:** `startOfDay(now)`, `new Date(year, month, 1)` etc. use the runtime zone (UTC on Vercel). After 5pm Pacific "today" is tomorrow — the technician's today total drops to $0; visits completed 5pm–midnight on a period boundary land in the next period/export; a rate "effective 2026-11-01" takes effect 5pm Oct 31. Same bug class `lib/timezone.ts` exists to kill.
- **Fix:** Route through `ymdInTimeZone`/`localDayBounds` with `timeZoneForState(org.state)`; parse date inputs as UTC midnight like `routes/actions.ts:49-56`.
- **Confidence:** confirmed

### H6. Database TLS verification is off by default
- **Where:** `lib/prisma.ts:29-39, 70-80`.
- **What:** Unless `DATABASE_SSL_REJECT_UNAUTHORIZED=true|1` is set, every non-localhost URL gets `ssl: { rejectUnauthorized: false }` and `sslmode` stripped. Secure is opt-in; relaxed is the default.
- **Fix:** Default to verification with Supabase's CA; make relaxed mode the explicit opt-in.
- **Confidence:** confirmed (likelihood of exploitation inside Vercel↔Supabase is low; still wrong default)

### H7. Critical/high npm advisories in direct dependencies
- **Where:** `package.json` — `@capacitor/android`/`ios` 8.5.0 (CRITICAL: remote content loaded at app origin via internal proxy — this shell *is* a remote-URL WebView), `next` 15.5.23 (CRITICAL: image-optimizer RCE w/ AVIF; `remotePatterns` is in use, `next.config.ts:25`), `@sentry/nextjs` 10.70.0 (CRITICAL: middleware bypass via tunnel route), `prisma` via `mysql2`/`deepmerge-ts`, `zod`, `@vercel/*`. `@prisma/client` 7.6.0 is also mismatched with CLI 7.9.1.
- **Fix:** After review clears: bump Next (patch), `@capacitor/*`, `@sentry/nextjs`, `prisma`+`@prisma/client` together; `npx cap sync`; rebuild at versionCode 5.
- **Confidence:** confirmed (`npm audit`: 4 critical / 23 high, all four criticals `fixAvailable`)

## Medium

### M1. Offline queue silently discards readings after 8 failed replays; not cleared on sign-out
- **Where:** `lib/client/offline-queue.ts:230-236` (`MAX_ATTEMPTS = 8`).
- **What:** Any non-OK response counts an attempt; after 8 the item is deleted with no UI/log. A session that expired in a dead zone turns every queued reading into 401s and the 30-second drain burns all 8 in ~4 minutes — gone before the tech reopens the app. IndexedDB is never cleared on sign-out, so on a shared device the next login replays the previous user's queue under their own cookie.
- **Fix:** Never auto-delete — mark `failed` and surface in the existing `pendingCount` UI with the error; namespace/clear the store by `authUserId` on sign-out.

### M2. "Works offline" is true only for an already-open screen
- **Where:** `public/sw.js:1-14` (no-op), `capacitor.config.ts:35-38` (remote `server.url`, no local bundle).
- **What:** Cold launch with no signal = blank/"webpage not available". Capture-and-sync does work once a visit page is loaded. Store copy ("Works offline and syncs when signal returns", "Nothing lost to signal") reads broader than that; a reviewer toggling airplane mode before launch sees it fail.
- **Fix:** Soften the listing wording *or* add a minimal offline fallback page for navigations in the SW.

### M3. `AndroidBackButton` HOME_PATHS misses real landing screens
- **Where:** `app/components/android-back-button.tsx:12`; `lib/auth/post-login-path.ts:22`.
- **What:** Admins with a route today land on `/dashboard/schedule`; `/cpo`, `/platform-admin`, `/login`, `/portal/login` are also roots. On those, `canGoBack` is true (history `/` → `/login` → landing), back goes to `/login`, which redirects straight back — the same "it just stays" symptom already fixed for `/`. (This is the fix from PR #10 — it is incomplete.)
- **Fix:** Add those paths, or stop trusting WebView history and treat "no in-app forward navigation since load" as the minimize condition.
- **Confidence:** likely (same mechanism as the `/` case reproduced on device)

### M4. Out-of-order Stripe events can un-cancel an org and stop its scrub clock
- **Where:** `app/api/stripe/webhook/route.ts:235-271`.
- **What:** `customer.subscription.updated` writes `planStatus` from the payload and sets `dataScrubScheduledAt: null`. Stripe doesn't guarantee order; a stale `updated` delivered after `deleted` flips the org back to ACTIVE and cancels the 30-day deletion.
- **Fix:** Re-fetch the subscription (or compare `event.created` to stored state) before writing; never clear `dataScrubScheduledAt` on a stale event.
- **Confidence:** likely

### M5. Scrub leaves PII in three places the 30-day promise doesn't cover
- **Where:** `lib/compliance-archive.ts:179-223` (Blob safety export never `del`'d); `lib/org-scrub.ts:84` deletes `User` rows but not Supabase Auth identities (contrast `lib/account-deletion.ts:85`); `org-scrub.ts:68` deletes `phoneAgentCall` but Twilio recordings/transcripts are never removed.
- **Fix:** `del()` the blob path; `auth.admin.deleteUser` each staff user; `recordings(sid).remove()` (store `RecordingSid`).

### M6. Account deletion removes auth identities *before* the irreversible scrub
- **Where:** `lib/account-deletion.ts:82-97`.
- **What:** If `runOrgScrub` throws, every login is gone, data is intact, and nobody can sign in to retry or export.
- **Fix:** Scrub first, then identities (or recreate on failure).

### M7. Account-deletion page contradicts itself about readings
- **Where:** `app/account-deletion/page.tsx:53-55` says chemistry readings are deleted; `:84-90` and `lib/org-scrub.ts:14-30` keep them. This is a Play-submitted URL — fix the wording.

### M8. Phone-agent daily caps don't count AI calls; when they trip they block the human line
- **Where:** usage written only at `app/api/twilio/voice/recording/route.ts:57-61`; conversational path (`dial-status/route.ts:47-65` → `lib/phone-agent-ticket.ts`) never touches `phoneAgentDailyUsage`. Cap check at `voice/route.ts:35-37` runs *before* the `<Dial>` at `:53-60`.
- **Fix:** Record usage in `finalizeCallTicket`; move the cap check to the AI fallthrough path only.

### M9. Manual day reorders are reverted on the next schedule view until someone arrives
- **Where:** `lib/visit-generation.ts:152-212` (`alignDaysToRoutes`) vs `app/api/visits/reorder/route.ts` (from `route-day-view.tsx:944`).
- **What:** SCHEDULED route stops are `moveKey`-able, so a drag before first arrival is overwritten by route order on the next load. Intentional per comments, but the drag UI offers an action that silently doesn't stick.
- **Fix:** Hide day-drag for route stops before first arrival, or have the drag write route `sortOrder`.

### M10. `visits/reorder` writes to an unverified AdHocStop id when `kind` is unrecognised
- **Where:** `app/api/visits/reorder/route.ts:16-17, 32, 53-57`.
- **What:** Only `kind === "visit"`/`"adhoc"` items are collected for the org-scoped checks, but the update loop treats every non-`"visit"` item as adhoc. `{kind:"x", id:<other org's AdHocStop>}` passes validation and updates `routeSequence` cross-tenant.
- **Fix:** Reject unknown kinds before the lookups; wrap `request.json()` so a bad body is a 400 (same in `routes/[routeId]/stops/reorder/route.ts:13`).

### M11. MAINTENANCE portal logins can upload/delete the customer's documents via server actions
- **Where:** `app/portal/actions.ts:20-39`.
- **What:** The documents *page* is gated by `requirePortalPage`, but the actions only check `getCurrentCustomerUser()`, so a maintenance contractor can invoke them directly.
- **Fix:** Call `requirePortalPage("/portal/documents")` inside both actions, as `portal/(app)/log/actions.ts:41-42` does.

### M12. Identity resolution falls back to an email match for any Supabase account
- **Where:** `lib/auth/prisma-user.ts:11-21`, `lib/auth/customer-user.ts:6-16, 27-40`.
- **What:** If no row matches `authUserId`, the staff/customer row is matched by `email` even if it already has a different `authUserId` or the auth email is unconfirmed. Exploitability depends on whether public email signup is enabled on the Supabase project.
- **Fix:** Fall back only when the row's `authUserId` is null, require `email_confirmed_at`, persist the link on first match; confirm "Enable email signups" is off in Supabase.
- **Confidence:** likely

### M13. Activation `token_hash` reaches persistent logs despite the "never logged" invariant
- **Where:** `app/auth/confirm/route.ts:30` (GET query param), `sentry.server.config.ts`/`instrumentation-client.ts` (no URL scrubbing).
- **What:** Every click lands the bearer token in Vercel request logs; any exception on `/auth/confirm` ships the full URL to Sentry. Contradicts `lib/mail/send-welcome-email.ts:27-29`.
- **Fix:** Sentry `beforeSend`/`beforeSendTransaction` stripping `token_hash` and `code` from `request.url` and breadcrumbs.

### M14. Deleting a staff user erases pay-rate history and visit attribution
- **Where:** `prisma/schema.prisma:2157` (TechnicianPayRate→User Cascade), `:1496` (ServiceVisit.technicianId SetNull); `app/dashboard/users/actions.ts:412-423`.
- **What:** Removing a departed technician deletes every rate row and nulls their completed visits, so `getPayrollExportRows` silently drops their last pay period.
- **Fix:** Deactivate (`active` flag) instead of delete, or `Restrict` the pay-rate FK.

### M15. `NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` in 14 customer-facing link builders
- **Where:** `lib/qr.ts:27`, `app/api/qr/[slug]/route.ts:10`, `app/api/stripe/webhook/route.ts:298`, `app/signup/actions.ts:71`, `app/billing/actions.ts:27`, `customers/[id]/actions.ts:1176,1316,1361`, `lib/portal-activation.ts:64`, the four cron routes.
- **What:** A missing var in any environment silently emails activation links, QR placards and Stripe return URLs pointing at localhost. `lib/site-url.ts:8-15` already has the right fail-safe; nothing else uses it.
- **Fix:** One `appUrl()` helper behaving like `siteUrl()`.

### M16. Dictation plausibility conflicts with server bounds; vacuum can never be dictated
- **Where:** `lib/reading-dictation.ts:110-125` vs `lib/reading-bounds.ts:27`.
- **What:** Vacuum plausibility is `[0,100]`, server bound is `[-30,0]`, and there's no "minus" handling — any dictated vacuum passes confirmation then 400s. Flow 2000 vs 300, temp 120 vs 110 likewise.
- **Fix:** Derive `PLAUSIBLE` from `READING_BOUNDS`; add negative-number words.

### M17. Unescaped untrusted input in internal emails
- **Where:** `lib/email.ts:27-28` (waitlist), `:437-450` (phone-agent ticket); `app/api/waitlist/route.ts:16` regex accepts `<img/src=x>@evil.co`.
- **What:** Waitlist email/subject and LLM-extracted caller name/address/summary land raw in the operator's inbox. Mail clients don't run script; impact is injected links/phishing content.
- **Fix:** `escapeEmailHtml` like the other senders; tighten the waitlist regex.

### M18. No CI
- **Where:** no `.github/workflows`; `package.json:9-13`.
- **What:** `tsc`, `eslint` and the 728 tests run only when someone remembers. Vercel's `next build` catches type errors only.
- **Fix:** One workflow on PR: `npm ci && npx tsc --noEmit && npm run lint && npm test`.

## Low

- **L1. Cron auth fails open if `CRON_SECRET` unset; non-constant-time compare** — all five `app/api/cron/*/route.ts` (`!== \`Bearer ${process.env.CRON_SECRET}\``). Vercel sets the var, so defence-in-depth. Fix: 401 when unset; `timingSafeEqual`.
- **L2. `android:allowBackup="true"`** — `AndroidManifest.xml:5`. WebView cookie jar (session) and IndexedDB (queued readings) go into Google backups. Fix: `false`, or `dataExtractionRules` excluding `app_webview`.
- **L3. Un-skipping a moved visit resurrects a duplicate; `IN_PROGRESS→SCHEDULED` keeps `startedAt`** — `app/api/visits/[id]/status/route.ts:31-39`; the arrival route then treats it as already arrived (`arrival/route.ts:69`).
- **L4. `deleteRoute`/`removeRouteStop` delete past unworked (pushed) visits** — `routes/actions.ts:315-317, 408-410` vs `moveRouteStop:598-600` (`>= todayStart`). Erases the "missed stop" record.
- **L5. Pay-rate `bundledIntoBodyOfWaterId` not org-scoped** — `settings/pay-rates/actions.ts:38,54,70,78`; leaks another org's venue name on the page (`page.tsx:54`).
- **L6. Pay excludes log-only visits by accident** — `lib/technician-pay.ts:232,281` never filter `logOnlyRecord` (schema `:1510-1520` says it should); only safe because all three creators leave `technicianId` null.
- **L7. Missing index for `completedAt` ranges** — `schema.prisma:1631-1635`; pay, payroll export and `send-pending-summaries` scan on it. Add `@@index([organizationId, completedAt])`.
- **L8. Open redirect via `redirectBasePath` in staff-user creation** — `users/actions.ts:225-264`; only the submitting admin is affected. Allow-list like `backToRoutes`.
- **L9. An admin can delete the org's last ADMIN** — `users/actions.ts:412-427`; `updateUserRole:207-209` has the guard, delete doesn't.
- **L10. Customer-document / inspection-report uploads have no size or type limits** — `lib/customer-documents.ts:37-80`, `lib/inspection-reports.ts:17-44` (photos and logos do).
- **L11. Money/destructive confirm buttons have no pending state** — `confirm-submit-button.tsx:50-57`, `add-user-seat-submit.tsx:66-70`; double-tap re-fires. `useFormStatus()`.
- **L12. CSV exports don't neutralize formula cells** — `lib/csv-export.ts:4-8`, `app/api/qr/[slug]/export/route.ts:28-31` (the latter is public). Prefix `=`/`+`/`-`/`@` cells with `'`.
- **L13. Export date params parsed in server zone; garbage → 500** — `exports/quickbooks/chemical-expenses/route.ts:24-25`, `technician-pay/route.ts:25-26`.
- **L14. Task digest renders the literal string `${COLOR.muted}` and a raw hex** — `lib/mail/task-digest-email.ts:60`; the exact trap CLAUDE.md describes; not covered by `email-palette.test.ts`.
- **L15. `SimpleMarkdown` uses `text-slate-*` and an inline hex** — `lib/simple-markdown.tsx:51,57,63,69`; `app/landing.module.css:111,287,566,793,799` hardcode `#fff`.
- **L16. Public log slugs are `cuid()`** — `schema.prisma:1096`; time-ordered, not random; `/p/*` and `/api/qr/*/export` unthrottled. `cuid2`/`nanoid`; Firewall rate limit on `/p/`.
- **L17. Phone-agent "day" is UTC midnight** — `recording/route.ts:55-56`, `lib/phone-agent-flow.ts:101-102`; caps reset 4–5pm Nevada.
- **L18. Twilio recording URL emailed/stored raw** — `recording/route.ts:46`, `lib/email.ts:452-455`; unauthenticated unless "HTTP auth on media URLs" is on in the Twilio account.
- **L19. Tablet-feeder projection uses server weekday; `boundsFor` re-queries per chemical** — `lib/dosing-calculator.ts:268, 124` (~6 queries/reading).
- **L20. Photo `capturedAt` unvalidated** — `app/api/visits/[id]/photos/route.ts:53`; garbage → Invalid Date → 500.
- **L21. Geocoding/routing to no-SLA EU services, autocomplete unthrottled** — `lib/geocode.ts:19`, `app/api/geocode/suggest/route.ts:37`, `lib/routing.ts:26,62`. Nominatim policy is 1 req/s; every keystroke ≥5 chars is forwarded. (Data-residency angle already in HANDOFF.md.)
- **L22. Customer emails in server logs; waitlist salt falls back to the service-role key** — `customers/[id]/actions.ts:1188,1330`, `users/actions.ts:187`, `stripe/webhook/route.ts:310,336`, `lib/portal-activation.ts:75`; `lib/waitlist-rate-limit-keys.ts:42`.
- **L23. Four write-capable scripts don't announce their target DB** — `prisma/seed.ts`, `prisma/cleanup-orphaned-visits.ts`, `prisma/fix-adhoc-stop-timezone.ts`, `scripts/repair-stop-order.ts` skip `printDatabaseTarget`.
- **L24. Docs drift** — `AGENTS.md:3,15-18,116` (Prisma 6, teal palette, stale photo note — contradicts CLAUDE.md/DESIGN-SYSTEM.md); `.env.example` missing `RESEND_API_KEY`, `TWILIO_*`, `OPENAI_*`, `SIGNUPS_ENABLED`, `DIALOGFLOW_*`, `WAITLIST_IP_SALT`, `NEXT_PUBLIC_SENTRY_DSN`; `TEST_ENVIRONMENT_SETUP.md:88-91` names env vars the code doesn't read.
- **L25. `android/.gitignore:65` has `google-services.json` commented out; `android/gradle.properties` is tracked** — the documented local JDK override will show as a diff and can ride a `git add -A`.
- **L26. `app/cpo/actions.ts:86-90` brackets "today" with the server clock** — same class `addAdHocStop` already fixed.

## Already known (recorded here so it's all in one place)

- **Ad-hoc service stops at an unrated venue pay $0 with no alert.** `lib/technician-pay.ts` resolves pay per (technician, body of water); the only "unrated" surface (`settings/pay-rates/page.tsx:57-104`) is prospective (recurring assignments), so a hand-added stop at a venue the tech isn't normally rated for completes, pays nothing, and is never flagged. The retroactive admin alert the code comments promise was never built. Agreed plan: retroactive "unrated completed visits" + live per-technician earnings table on Settings → Pay Rates.
- `isDayFullyDone()` `.every()`-over-empty (`route-day-view.tsx:470-472`) is still latent in code; mitigated by demo data only (HANDOFF.md).
- Stripe price env vars use retired tier names (HANDOFF.md) — see H4 for why that's worse than "signup breaks": it makes signup *free*.

---

## Checked and looked fine (so coverage is visible)

- Every `app/api/visits/[id]/**` route and all 40+ customer actions: consistent org re-resolution, ADMIN/OFFICE/own-technician rule, child ids re-scoped to the visit/org, org-prefixed storage paths. Platform-admin and portal page gates correct.
- Stripe `constructEvent`; P2002 race handling in webhook and `completeSignup`; portal-subscribe session ownership; 24h resume window.
- All seven Twilio routes verify `X-Twilio-Signature` with full URL; TwiML via `VoiceResponse` (escaped). Dialogflow constant-time secret; OpenAI `webhooks.unwrap`; realtime tools take no params and re-scope by org.
- Scrub defaults to dry-run; retained set matches `RETAINED_AFTER_DELETION`; cron jobs idempotent via sent-at flags. All five mutating `scripts/*` dry-run by default; `db-target` guards local-vs-prod.
- Visit generation advisory lock closes the duplicate race; `timezone.ts` day-bounds/DST round-trip; reorder endpoints sort rows to avoid deadlocks; reschedule/arrival/departure/complete state handling; dose idempotency window.
- `compliance.ts` thresholds and MAHC fallback; `reading-bounds`; dosing clamps; `reading-log-days` last-wins bucketing.
- RLS enabled on every table with zero policies and grants revoked from `anon`/`authenticated`; the app relies purely on Prisma + app scoping and no client code queries Supabase tables. Service-role client is `server-only`; no secrets in client files or `NEXT_PUBLIC_` vars.
- CSP `connect-src`/`img-src` cover every host the client calls; `frame-ancestors 'self'`; HSTS; Sentry has `tracesSampleRate: 0`, no replay, no `sendDefaultPii`.
- Both `dangerouslySetInnerHTML` sites render repo-committed markdown only; welcome-email HTML escapes every user string; forgot-password doesn't enumerate; reset flow signs out the recovery session.
- Background-geolocation watcher torn down on cleanup and never started when the day is done; iOS `UIBackgroundModes`/usage strings/`PrivacyInfo.xcprivacy` match the code; no deep links; only the launcher activity exported; no cleartext.
- Money and chemistry columns are all `Decimal` with explicit precision; 93 migrations correctly ordered, destructive ones have data steps; `lib/prisma.ts` pool sizing well-reasoned.

---

## Suggested order once Play review clears

1. **First post-review native build (versionCode 5):** H7 dependency bumps (`@capacitor/*`, `next`, `@sentry/nextjs`, `prisma`), `npx cap sync`, plus M3 (HOME_PATHS) and L2 (`allowBackup`) since they ride the same APK.
2. **Compliance/chemistry correctness, same week:** C1 dictation, H2 kidney volume, M16 plausibility bounds, H1 cascade-delete guards.
3. **Security:** H3 open redirect, H4 signup gate, H6 TLS default, M10/M11/M12, L1 cron secret, M13 Sentry scrub.
4. **Money/time:** H5 pay timezone, M14 staff-delete cascade, L6/L7, M4 Stripe ordering, then the agreed pay-watcher work.
5. **Promises vs. behaviour:** M1 offline queue, M2 listing wording (or SW fallback), M5–M7 deletion/scrub gaps.
6. **Hygiene:** M15 `appUrl()`, M18 CI, M17 email escaping, the Lows.
