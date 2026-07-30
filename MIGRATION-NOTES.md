# Color migration → `brand-*` tokens

Migration of the product screens off hardcoded hex literals and off-palette Tailwind
color families onto the `brand-*` tokens defined in `tailwind.config.ts`
(`theme.extend.colors.brand`), per `DESIGN-SYSTEM.md`.

## Result

Scanned all 103 `.ts` / `.tsx` / `.css` files under `app/`, excluding the four files
this migration was told not to touch and the new `app/lib/chart-colors.ts`:

| Category | Remaining |
| --- | --- |
| Raw hex literals (`#RRGGBB`, incl. `text-[#...]` arbitrary values) | **0** |
| Off-palette Tailwind families (`slate/gray/zinc/emerald/rose/amber/sky/blue/...`) | **0** |
| Legacy brand aliases (`brand-navy/teal/coral/blue/sky/mist/alert`) | **0** |

Approximate volume removed, measured against inventories taken before each pass:

- **~412** hex literals
- **~425** off-palette Tailwind utilities
- **~116** legacy `brand-*` alias references

These counts were measured by scanning the files before and after each pass, not by
diffing against the branch base — no git commands were run (see Constraints below).

`npx tsc --noEmit` → exit 0. `next build` → succeeds, all 41 routes emitted (see
"Build verification" for why it must be run without a dev server attached).

---

## Files changed

### Priority 1 — public inspector record

- `app/p/[publicSlug]/page.tsx` — 46 hex → 0. Highest-priority surface (health inspectors).

### New module

- `app/lib/chart-colors.ts` — **new**. Named constants mirroring the token hexes, for the
  consumers that cannot take a Tailwind class: SVG `fill`/`stroke` attributes, Leaflet
  `divIcon` HTML strings and polyline options, `themeColor` metadata, and inline
  `style={{ }}` values. `tailwind.config.ts` remains the source of truth; this module
  mirrors it.

### Priority 2–3 — visit forms

- `app/dashboard/visits/[id]/visit-form.tsx` — 61 hex → 0
- `app/dashboard/visits/[id]/residential-visit-form.tsx` — 45 hex → 0

### Priority 4 — schedule / route / technician home

- `app/dashboard/schedule/page.tsx` — 25 hex + rose utilities → 0
- `app/components/route-day-view.tsx` — 24 hex → 0
- `app/dashboard/technician-home.tsx` — 21 hex → 0
- `app/dashboard/schedule/admin-schedule.tsx` — 1 hex + 14 legacy aliases → 0

### Priority 5 — charts and signature motifs

- `app/components/reading-chart.tsx` — 14 hex → 0
- `app/components/route-suggestion-panel.tsx` — 13 hex → 0
- `app/components/backwash-calendar.tsx` — 5 hex → 0
- `app/components/body-qr-code.tsx` — 4 hex → 0
- `app/components/route-suggestion-map-preview.tsx` — 3 hex → 0
- `app/components/camera-capture.tsx` — 3 hex → 0
- `app/components/wave-progress.tsx` — 1 hex + 3 legacy aliases → 0
- `app/components/chem-gauge.tsx` — 1 hex + 1 `rgba()` literal → 0

### Priority 6 — sweep of the rest of `app/`

48 further files, largest first:

`app/dashboard/customers/[id]/page.tsx` (16 hex, 141 utils) ·
`app/dashboard/customers/[id]/bodies/[bodyId]/page.tsx` · `app/dashboard/page.tsx` ·
`app/signup/page.tsx` · `app/platform-admin/page.tsx` · `app/portal/(app)/reports/page.tsx` ·
`app/dashboard/report-issue/report-issue-form.tsx` · `app/signup/complete/page.tsx` ·
`app/dashboard/chemicals/page.tsx` · `app/portal/(app)/documents/page.tsx` ·
`app/dashboard/customers/[id]/bodies/[bodyId]/equipment-item.tsx` · `app/components/side-nav.tsx` ·
`app/components/alerts-bell.tsx` · `app/dashboard/technicians/page.tsx` ·
`app/dashboard/checklist/page.tsx` · `app/dashboard/billing/page.tsx` ·
`app/portal/login/login-form.tsx` · `app/portal/(app)/page.tsx` · `app/login/login-form.tsx` ·
`app/components/filter-type-fields.tsx` · `app/dashboard/customers/page.tsx` ·
`app/dashboard/customers/[id]/bodies/[bodyId]/equipment-form.tsx` · `app/dashboard/settings/page.tsx` ·
`app/dashboard/alerts/page.tsx` · `app/components/property-contact-fields.tsx` ·
`app/portal/(app)/alerts/page.tsx` · `app/dashboard/stops/[propertyId]/stop-capture.tsx` ·
`app/dashboard/more/page.tsx` · `app/components/address-fields.tsx` ·
`app/portal/components/portal-nav.tsx` · `app/dashboard/routes/page.tsx` ·
`app/components/confirm-submit-button.tsx` · `app/login/page.tsx` ·
`app/components/tech-bottom-nav.tsx` · `app/billing/expired/page.tsx` ·
`app/signup/cancelled/page.tsx` · `app/dashboard/visits/[id]/page.tsx` ·
`app/dashboard/stops/[propertyId]/page.tsx` · `app/portal/login/page.tsx` ·
`app/components/property-type-filter-select.tsx` · `app/components/new-customer-form-fields.tsx` ·
`app/dashboard/report-issue/page.tsx` · `app/dashboard/layout.tsx` ·
`app/components/technician-filter-select.tsx` · `app/components/inline-assign-select.tsx` ·
`app/layout.tsx` · `app/portal/(app)/layout.tsx`

### Outside `app/`

- `lib/technician-colors.ts` — **one-line addition only.** The 8-slot categorical
  technician palette was left untouched (see Judgment calls). Its slate fallback
  `#94A3B8` was promoted to an exported `UNASSIGNED_TECHNICIAN_COLOR` so that
  `app/components/route-day-view.tsx` and `app/dashboard/schedule/admin-schedule.tsx`
  could stop duplicating the literal. Zero visual change.

---

## Mapping applied

### Old palette → tokens

| Old | New | Note |
| --- | --- | --- |
| `#12234A`, `#0F2A3D` | `brand-ink` | |
| `#0A5FA4` | `brand-primary` | |
| `#084A82` | `brand-primaryHover` | only appeared as a `hover:bg-` |
| `#4A6572`, `#94A3B8` | `brand-muted` | |
| `#6E8E8A` | `brand-control` | |
| `#EAF6FA` | `brand-surface` | |
| `#C9E3EC` | `brand-border` on `border-*`, `brand-foam` on `bg-*` | line vs. fill |
| `#A9D3E0` | `brand-border` | only ever used as text on dark chrome |
| `#FF6B5B` | `brand-accent` as text on dark, `brand-cta` as a button fill | see Judgment calls |
| `#E29B8F` | `brand-accent` | on dark chrome only |
| `#C1483B`, `#C65D46` | `brand-danger` | error/severity text |
| `#16A34A` | `brand-ok` / `brand-okFill` | success confirmation |

### Tailwind families → tokens

`text-slate-900/800/700` → `text-brand-ink` · `text-slate-600/500` → `text-brand-muted` ·
`text-slate-400` → `text-brand-control` · `bg-slate-900` → `bg-brand-ink` ·
`bg-slate-200` → `bg-brand-border` · `bg-slate-100` → `bg-brand-foam` ·
`bg-slate-50` → `bg-brand-surface` · `border-slate-300` → `border-brand-control` ·
`border-slate-200/100` → `border-brand-border` · `red-*`/`rose-*` → `brand-danger` /
`brand-dangerFill` · `amber-*` → `brand-warn` / `brand-warnFill` ·
`emerald-*` → `brand-ok` · `ring-teal-500` → `ring-brand-primary`.

### Legacy aliases → tokens

`brand-navy`→`brand-ink` · `brand-navyLight`→`brand-anchor` · `brand-teal`/`brand-blue`→`brand-primary` ·
`brand-tealDark`/`brand-blueDark`→`brand-primaryHover` · `brand-sky`→`brand-border` ·
`brand-mist`→`brand-foam` · `brand-coral`/`brand-coralDark`/`brand-alert`→`brand-danger`
(with the exceptions listed below).

The aliases in `tailwind.config.ts` already resolve to the new hexes, so these were pure
renames with no visual change — except `brand-sky` (`#9CC3C6`, no exact successor) and the
coral exceptions.

---

## Judgment calls

1. **`brand-coral` / `brand-coralDark` → `brand-danger`, not `brand-cta`.** These aliases
   resolve to the CTA hexes (`#B8503E` / `#9C4132`), but in the product screens they were
   used exclusively to signal something wrong: `hasHazard` alerts, "Reported issues",
   "Needs attention", issue severity, and skipped-stop counts. `DESIGN-SYSTEM.md` rule 3
   forbids using `cta`/`accent` to signal a reading result, so these were mapped by
   meaning to `brand-danger` / `brand-dangerFill`. A pure alias rename would have been
   spec-violating. **This is the largest meaning-based reinterpretation in the migration
   and the most likely thing to want a second look.**

2. **`#FF6B5B` split two ways.** Eyebrow labels on the dark visit/stop headers
   (`app/dashboard/visits/[id]/page.tsx`, `app/dashboard/stops/[propertyId]/page.tsx`)
   became `brand-accent` — decorative branding on dark chrome, which is where `accent` is
   allowed. The "Report an issue" submit button
   (`app/dashboard/report-issue/report-issue-form.tsx`) is a call to action and became
   `brand-cta`.

3. **Coral-on-dark exceptions to rule 1.** `brand-danger` (`#A32E22`) is unreadable on
   `brand-ink` (`#06333B`), so three coral-on-dark usages were routed elsewhere:
   - `app/components/side-nav.tsx` sign-out button → `brand-accent`
   - `app/dashboard/page.tsx` role eyebrow on the dark card → `brand-accent`
   - `app/dashboard/schedule/admin-schedule.tsx` pending-jobs stat → `brand-warnFill`
     (pending is a status, so the light warn tint rather than the marketing accent)

4. **Status colors on dark chrome use the `*Fill` tints as text.** `brand-ok` and
   `brand-warn` are too dark to read on `brand-ink`, so the dark headers in
   `app/dashboard/schedule/page.tsx` and `app/dashboard/technician-home.tsx` use
   `text-brand-okFill` / `text-brand-warnFill` / `text-brand-border` for their stat
   labels. `brand-accent` was deliberately not used there — it would read as a status
   signal from a marketing color.

5. **`border-slate-300` → `brand-control`, `border-slate-200/100` → `brand-border`.**
   The mapping guidance sent both to `brand-border`. Inspection showed `-300` is
   consistently the outline on inputs, selects and checkboxes while `-200`/`-100` are
   decorative hairlines and dividers, so they were split to match the token definitions
   (`brand-control` = control outlines).

6. **Alert severity kept its original hue assignment.** `app/dashboard/alerts/page.tsx`
   maps `LOW → BRAND_MUTED`, `MEDIUM → BRAND_INK`, `HIGH → BRAND_DANGER`. MEDIUM was navy,
   not amber, in the original; promoting it to `brand-warn` would have changed what the UI
   communicates, which is out of scope for a color migration. Flagging it as a possible
   intentional follow-up.

7. **Backwash calendar "no visit" cells.** `bg-brand-foam text-brand-muted` at 10px
   violates the outdoor-legibility rule in `DESIGN-SYSTEM.md` ("body text at or below 14px
   must sit on `white` or `brand-surface`, never on `brand-foam` with `brand-muted`"), so
   those cells use `bg-brand-surface` instead. Contrast goes 4.4:1 → 4.9:1 and the cell
   still reads as a filled tile. Same rule drove two changes in
   `app/p/[publicSlug]/page.tsx` (table `<th>` → `text-brand-ink`) and
   `app/dashboard/schedule/page.tsx` (ad-hoc stop row → `bg-brand-surface`).

8. **`chem-gauge.tsx` track color.** The unfilled arc was `rgba(15, 42, 61, 0.1)` — an
   old-navy tint with no token equivalent. Replaced with solid `BRAND_FOAM`, which is the
   token for that role. Slight visual change: the track is now opaque rather than a 10%
   wash, so it reads marginally lighter over white.

9. **`.app-*` classes adopted where the element is unambiguously that component.**
   `.app-card`, `.app-field`, `.app-btn-*`, `.app-tab*`, `.app-badge*`, `.app-pill*` were
   substituted where geometry was equivalent. Bespoke geometry with token colors was kept
   where an `.app-*` class would have changed layout — notably the inline `<select>`s on
   the public inspector page, which cannot take `.app-field` because its `w-full` would
   break the flex-wrap filter row.

---

## Deliberately left alone

- **`app/page.tsx`, `app/landing.module.css`, `tailwind.config.ts`, `app/globals.css`,
  `DESIGN-SYSTEM.md`** — owned by another agent; not touched.

- **The categorical palette in `lib/technician-colors.ts`.** The 8 hexes there are a
  validated colorblind-safe categorical scale for distinguishing technicians on the map,
  not brand colors — the file's own comment records that only the first 4 slots clear the
  all-pairs safety floor. Forcing them onto `brand-*` would collapse distinguishable
  categories. Only the duplicated slate fallback was exported (see above).

- **`lib/email.ts` and `lib/qr.ts`.** Both still carry the *old* palette
  (`#12234A`, `#4A6572`, `#C9E3EC`, `#A9D3E0`, `#4FCADC`). They sit outside the `app/`
  scope of this task, and HTML email cannot use Tailwind classes so they legitimately need
  literals — but they are customer-facing (service-summary emails, and the QR codes
  printed on physical pool signage that inspectors scan). **Recommend a follow-up** to
  point them at `app/lib/chart-colors.ts`. This is the only remaining old-palette surface
  in the product.

- **`app/components/landing/*`** — no off-palette usage found; marketing surface, left as-is.

- **Layout, spacing, copy, logic, data fetching and component structure** — unchanged
  throughout. The only non-color edits are the added `import` statements for
  `app/lib/chart-colors.ts` / `lib/technician-colors.ts`, and one stale doc comment in
  `wave-progress.tsx` that referred to `brand-navy` by name.

---

## Build verification

```
npx tsc --noEmit     → exit 0
next build           → success, 41 routes
```

**`next build` must be run with no dev server attached.** There is currently a
`next dev` process running against this working tree (`sh -c next dev`, pid 9815). Dev and
build share `.next`, so the dev server overwrites `pages-manifest.json` /
`app-paths-manifest.json` mid-build and `next build` fails with a spurious
`PageNotFoundError: Cannot find module for page: /_document` (or `/_not-found`) during
"Collecting page data". This is not a code fault — it reproduces with an empty `.next`,
and the build completes cleanly when run against an isolated copy of the tree. The dev
server was left running rather than killed, since another agent is using it.

## Constraints observed

- No git commands were run. All counts above come from before/after scans of the working
  tree, not from a diff against the branch base — worth re-checking against
  `git diff --stat` once the parent agent takes over.
- `npx prisma generate` had to be run to populate `generated/prisma`, without which
  `tsc` reports ~30 unrelated errors. It was run with a throwaway placeholder
  `DATABASE_URL` passed inline for codegen only; nothing was written to disk and no
  connection was made. A `.env` has since appeared in the working tree (created outside
  this task); only its variable names were listed, no values were read or logged.
