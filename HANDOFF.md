# AquaRunner 24/7 — context handoff

Paste this into Claude.ai, or keep it in the repo root for Claude Code to read.
Repo: `Aquarunner247/AquaRunner247` · Site: aquarunner247.com · Stack: Next.js 15 App
Router, React 19, Prisma 7, Supabase (auth only), Stripe, Resend, Tailwind, Vercel.

---

## What the product is

Commercial and residential pool / water-feature maintenance software, built by a Las Vegas
pool company for its own use and now being opened up to other operators. Technicians log
service visits — water chemistry, chemical doses, equipment readings, photos. Every body of
water has its own QR code and a public logbook at `/p/[publicSlug]` that a health inspector
can scan and read without an account.

The two differentiators, which the marketing must lead with:

1. **State-specific compliance.** Each state's requirements are logged by the technician at
   the point of service.
2. **QR code per body of water.** Paperless records, instantly accessible to any inspector.

The site is currently a **waitlist landing page only**. The app is not publicly launched.

---

## What just changed (open PR — review before continuing)

**Branch `design/system-b-sunset-water`, [PR #7](https://github.com/Aquarunner247/AquaRunner247/pull/7). Not merged. Production is untouched.**

### 1. The palette problem, fixed

The repo had **five competing palettes**. `tailwind.config.ts` declared navy/teal/coral,
but the components actually used an older blue system (`#0A5FA4` ×117, `#12234A` ×95,
`#C9E3EC` ×81), `app/landing.module.css` defined its own third `:root`, a stale
`homepage-redesign.patch` carried a fourth, and ~425 `slate-*`/`gray-*`/`emerald-*`
utilities did the real work. The config described a product that did not exist on screen.

Now there is **one system, "Sunset Water"**, specced in **`DESIGN-SYSTEM.md`** at the repo
root with measured WCAG ratios on every token. Read that file before writing any UI.

The structural idea: **cool teal is the product** (dashboard, technician screens, inspector
record, portal). **Warm clay is marketing**, plus the single "act now" accent inside the
product.

64 files migrated — ~412 hex literals, ~425 off-palette utilities, 116 legacy aliases
removed. Zero remain under `app/`.

**Non-negotiables** (also in `CLAUDE.md`):
- No hex literals in components. Add a token to `tailwind.config.ts` under `brand.*`.
- `brand-accent` (`#F6AD93`) is **dark-background only** — it is 1.6:1 on white.
- `ok`/`warn`/`danger` are **reserved for water-reading results**. Never use `cta` or
  `accent` to signal a chemical value. A failed chlorine reading must not compete visually
  with a marketing button.
- No `slate-*`, `gray-*`, `zinc-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*`, `blue-*`.
- Reach for the `.app-*` classes in `globals.css` first.
- Legacy aliases (`brand-navy`, `brand-teal`, `brand-coral`, …) still resolve so old code
  compiles, but **do not use them in new code**. Safe to delete once nothing references them.
- Type is fixed: Big Shoulders Display (`font-display`), Inter (`font-sans`), IBM Plex Mono
  (`.app-metric` for readings, permit numbers, timestamps, route IDs).
- **Outdoor legibility is functional, not polish.** Technicians use this on phones in direct
  Nevada sun. Text ≤14px sits on `white` or `brand-surface`, never `brand-muted` on
  `brand-foam`. Touch targets 44px minimum. Prefer solid fills over translucency.

One judgment call worth knowing: the old `brand-coral` alias became **`brand-danger`, not
`brand-cta`**. In product screens it only ever signalled hazards, reported issues, and
skipped stops. Status must not be styled with a marketing color. This was reviewed and
approved by the owner.

### 2. The landing page was rebuilt

`app/page.tsx` + `app/landing.module.css`, with new components under
`app/components/landing/`. The module no longer defines its own palette. State compliance
and the QR system get a dedicated section.

### 3. The waitlist was silently broken

`app/waitlist-actions.ts` contained working persistence — but **nothing called it**. Every
signup since launch went nowhere; the `WaitlistSignup` table had zero rows. It now posts to
`app/api/waitlist/route.ts`, which writes via `prisma.waitlistSignup` and fires the Resend
notification, handling ok / duplicate (P2002) / invalid / error. The orphaned server action
was deleted.

### 4. Security — applied to production, and committed as a migration

Migration `prisma/migrations/20260803194700_lock_down_public_schema_from_client_roles/`.
Idempotent; already live.

- **`ComplianceRuleset` had RLS disabled** and `SELECT` granted to `anon`. All 51 state
  compliance rulesets were readable by anyone holding the publishable key, which ships in
  the frontend bundle. RLS is now enabled.
- **`_prisma_migrations` had a policy named `deny_all_clients`** that looked protective but
  is `PERMISSIVE`. Postgres combines permissive policies with **OR, not AND**, so four
  `prisma_allow_authenticated_*` policies with `USING (true)` overrode it — any signed-in
  user could rewrite migration history. Those four were dropped.
- **All privileges on schema `public` revoked from `anon` and `authenticated`**, including
  default privileges, so future Prisma-created tables cannot silently regain them. That
  default-privilege inheritance is how the exposure appeared in the first place.

Verified per role: `anon` and `authenticated` read 0 rows and hold 0 table grants; Prisma
still reads all 51 rulesets and 19 customers; 6 auth users intact. Auth, storage buckets,
and `service_role` are unaffected.

**Consequence for future work:** the database access model is now enforced, not just
conventional. **All data access goes through Prisma** on a direct Postgres connection
(owner role, bypasses RLS). The Supabase JS client is for **auth only**, plus storage
buckets via `service_role`. If you write `supabase.from("Table").select(...)` it will fail
in production **by design**. Use Prisma. If a client-side read is genuinely needed, raise it
as an architectural decision rather than re-granting privileges.

---

## Verification state

- `npx tsc --noEmit` clean
- `npm run build` clean, 41 routes
- No horizontal overflow at 1440 / 1280 / 768 / 390
- Mobile hero verified at 390px (an earlier "sticky header overlaps the eyebrow" report was
  a full-page-screenshot artifact, not a real bug)
- Known benign warning: `Failed to find font override values for font 'Big Shoulders'`.
  Pre-existing. Worth a follow-up, not a blocker.

---

## What's next, in priority order

1. **Dashboard and technician screens.** The colors are correct now, but correct is not
   designed. Layout, spacing, and visual hierarchy on those screens are the main thing still
   holding the appearance back. This is the biggest remaining win.
2. **Delete the legacy aliases** from `tailwind.config.ts` once a grep confirms no consumers.
3. **Fix the Big Shoulders font override warning.**
4. **Merge PR #7** after review.

---

## Working agreements already in the repo

`CLAUDE.md` holds the conventions and they're good — keep following them. In particular:
default destructive scripts to a dry run; never ask for a real credential to be pasted into
chat; and when reporting "done," confirm against the actual source of truth (re-read the
file, re-run the build) rather than restating what a previous step was supposed to do.

`AGENTS.md` holds environment setup — local Supabase stack on port 54322, `supabase start`,
`npm run db:seed`, seeded logins. Read it before trying to run the app locally.
