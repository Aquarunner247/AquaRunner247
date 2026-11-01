# Handoff — 2026-11-01

A point-in-time snapshot for whoever picks this up next, in a cloud session or
otherwise. Written because the context it captures is not derivable from the
code: what is in flight, what was already tried, and which things look like bugs
but are not.

Delete or rewrite this file when the Play review resolves — a stale handoff is
worse than none.

## The one thing in flight

**The Android app was submitted to Google Play for review on 2026-11-01.** It is
waiting on a decision. As of the last check there had been **no reviewer
activity at all** on the demo account.

How to check for reviewer activity (all read-only):

```sql
-- a reviewer signing in
select email, last_sign_in_at from auth.users where email ilike '%appreview%';

-- a reviewer opening the schedule: visit generation creates rows with cuid ids,
-- so anything NOT prefixed demo-appreview- was created by the app, not by us
select count(*), max("createdAt") from "ServiceVisit"
 where "organizationId" = 'demo-appreview-org' and id not like 'demo-appreview-%';
```

Supabase project `dsamkhorbythfcjygpxz`. There is only one project; it is
production, and it holds the real customer (Lindley's Pool & Spa Service)
alongside the demo org (Desert Oasis Pool Service).

## Rules in force right now

- **Ask before pushing anything that changes runtime behaviour.** The app is a
  WebView over production, so every deploy reaches the reviewer. The operator's
  standing instruction was to hold until review clears; two fixes went out
  anyway with explicit per-change approval. Do not assume that generalises.
- **Demo DATA is different from the submission.** Keeping the demo org working
  is what makes the review succeed, needs no resubmission, and is fine to do.
- **The bundle is built and uploaded at versionCode 4.** Any further bundle
  needs 5. It must be built locally — `android/keystore.properties` is
  gitignored, so a cloud build produces an unsigned bundle Play will reject.
- Migrations: Prisma only, applied by the operator against the direct
  production URL. Never via the Supabase MCP. See CLAUDE.md.

## Production state that is NOT in the code

The demo org was repaired in several ways that only exist as data:

- **Seven routes**, `demo-appreview-route-d1`..`d7`, five venues each at
  07:00-08:40. Before this the route existed only on Thursdays, so on any other
  weekday the technician's schedule was empty — and an empty day is not a blank
  screen: `isDayFullyDone()` is an `.every()` over no stops, so it reports the
  day finished, the location watcher never starts, and the background-location
  disclosure never appears. A reviewer on the wrong weekday would have seen none
  of what the permissions declaration promises. This was the single biggest risk
  to the review and it is fixed.
- **A full month of daily compliance readings** on Desert Palms Main Pool for
  October (31 days) and November as it accrues. The seeder reproduces this.
- **Pump vacuum is negative** (-5..-8 inHg). `lib/reading-bounds.ts` bounds it
  to -30..0; it was seeded positive and the form rejected it in red. Fixed in
  both production and the seeder.
- `minimumRequiredFlowGpm` 256 and `maximumFilterFlowGpm` 400 on the Main Pool.

**The inspector log opens on the CURRENT month.** Each new month it is blank
until that month has a reading, so if the review runs long, November needs
topping up or the sheet looks thin beside October's 31 days.

## Things that look like bugs and are not

Checked, and each cost real time to rule out:

- **"Not on a recurring route"** on the customer page was *accurate* when it was
  seen — those venues genuinely had no stops. All five now carry seven.
- **`claude/side-menu-update-6bau6i` and `claude/deleted-routes-visibility-eov5zh`**
  are already ancestors of master. They need no rebase and no merge.
  `claude/play-store-description-admin` is redundant; its content was rebased
  into master as 76483ed.
- **The two Play upload warnings** (no deobfuscation file, no native debug
  symbols) do not apply: `minifyEnabled false`, and the three `.so` files come
  pre-stripped from AndroidX via the camera plugin.
- **`android.permission.DUMP`** in the manifest comes from the
  background-geolocation plugin. Signature-level, never granted, harmless.

## Open work, roughly ranked

1. **Nothing blocking.** The submission is complete and waiting.
2. If the review is **rejected**, the likely cause is the background-location
   declaration. Google evaluates ONE feature at a time and rejects submissions
   naming several; the declaration as submitted describes arrival and departure
   together. A single-feature rewrite is in the conversation record, and the
   store answers live in GOOGLE-PLAY-SUBMISSION.md.
3. **iOS submission** has not started. APP-REVIEW-NOTES.md has the Apple side.
   Dark and tinted app icons are already built.
4. Longer-standing: attorney review of the legal docs; Lindley's never accepted
   Terms (`termsAcceptedAt` null by design, do not backfill); Stripe price env
   vars still use retired tier names and will break signup when
   `SIGNUPS_ENABLED` is turned on; geocoding/routing send addresses to Europe.

## Where the written-down knowledge is

| File | What it holds |
|---|---|
| `CLAUDE.md` | design system, migrations, secrets, destructive ops |
| `GOOGLE-PLAY-SUBMISSION.md` | every Play console answer, paste-ready |
| `APP-REVIEW-NOTES.md` | the Apple side |
| `phone-agent-setup.md` | Twilio, including onboarding an org without giving them a new number |
| `email-branding.md` | white-labelling, and what sending from an org's own domain would take |
| `scripts/seed-app-review-org.ts` | the demo org, reproducible; dry run by default, `--apply` to write |

Commit messages in this repo carry their reasoning. `git log` is the record of
why something is the way it is, and is usually faster than re-deriving it.
