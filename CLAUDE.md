# Working conventions for this project

## Design — read DESIGN-SYSTEM.md before touching any UI

`DESIGN-SYSTEM.md` at the repo root is the single source of truth for color and type.
Read it before writing UI code. It exists because this repo previously accumulated five
competing palettes — the Tailwind config declared one thing, components used another, the
landing page CSS module defined a third, and a stale patch file carried a fourth. Every
agent and human working here follows the same document so that cannot happen again.

The short version, so it is impossible to miss:

- **One palette**, in `lib/design-tokens.ts` under `COLOR`. Need a color that isn't there?
  Add it there — `tailwind.config.ts` imports from it rather than restating it. **Never
  inline a hex** in `className`, inline `style`, or a CSS module. Email markup cannot use a
  Tailwind class — mail clients strip CSS variables — so the templates import `COLOR` and
  interpolate it: write `${COLOR.ink}` inside a **template literal**, never a raw hex, and
  never inside a normal double-quoted string (there it renders as the literal characters
  `${COLOR.ink}`). `lib/__tests__/email-palette.test.ts` renders every sender and catches
  both mistakes. The neutral greys in `EMAIL_COLOR` are deliberately separate — leave them.
- **Cool navy + pool blue = the product** (dashboard, technician screens, inspector record,
  portal). **Warm coral = marketing** plus the single "act now" accent inside the product.
- **Coral (`brand-cta` / `brand-accent`, both `#F2685A`) is never small text on light.** It
  is 3.0:1 on white and 2.8:1 on cream — a fill, an eyebrow, or a highlight on dark, not body
  text on light.
- **A coral fill is labelled `text-brand-ctaText` (or `text-brand-ink`, the same hex), never
  `text-white`.** White on coral is 3.0:1 and fails AA; navy on it is 4.8:1. That is the
  whole reason `brand-ctaText` exists.
- **Status colors are reserved.** `ok`/`warn`/`danger` mean a water-reading result. Never
  use `cta` or `accent` to signal a chemical value, and never restyle a status chip to match
  a brand color. A failed chlorine reading must not compete visually with a marketing button.
  The one sanctioned non-reading use is `brand-danger` for a destructive action.
- **Never use `slate-*`, `gray-*`, `zinc-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*`,
  `blue-*`.** Use `brand-ink`, `brand-muted`, `brand-foam`, `brand-border`, status tokens.
- **Reach for the `.app-*` classes in `globals.css` first.** Cards, fields, buttons, links,
  badges, pills, and tabs are already defined on tokens. Needing to restyle one inline means
  the shared class should change instead.
- **The old teal palette is gone.** `brand-navy`, `brand-teal`, `brand-coral`, `brand-blue`,
  `brand-sky` and `brand-alert` are not in `COLOR` and resolve to **nothing** — a class using
  one renders unstyled rather than the wrong color. Nothing references them. (`brand-mist`
  survives, but as a real token: the icon-chip fill.)
- **Type is fixed**, four families each with one job: `font-display` is Satoshi (product
  headings), `font-sans` is Inter (anything read rather than looked at), `font-marketing` is
  Roboto Condensed (**landing pages only** — condensed, heavy, uppercase italic), and
  `.app-metric` is IBM Plex Mono (readings, permit numbers, timestamps, route IDs). Note
  `font-mono` is **not** mapped to IBM Plex Mono — use `.app-metric`. Add no families.
- **Outdoor legibility is a functional requirement, not polish.** Technicians use this on
  phones in direct Nevada sun. Text at or below 14px sits on `white` or `brand-surface`,
  never `brand-muted` on `brand-foam`. Touch targets 44px minimum. Prefer solid fills over
  translucency for anything a tech taps while working.

Before claiming a UI change is done, grep your own diff for hex literals and for the banned
utility prefixes above.

## Credentials and secrets
- Never ask the user to paste a real credential (DATABASE_URL, API keys, passwords)
  into chat, even to run a script for them. Instead: confirm the script/command is
  correct, then have the user run it themselves in their own terminal with the
  real value substituted in.
- Before claiming a credential or file was ever exposed/leaked/rotated, actually
  check (git history, current file contents) rather than assuming based on the
  file's current state.

## Database migrations

- **Prisma owns migrations. Do not apply schema changes through the Supabase MCP tools**
  (`apply_migration`, or DDL via `execute_sql`). Those record into
  `supabase_migrations.schema_migrations`, which Prisma cannot see, so the column lands in
  production while `_prisma_migrations` stays behind. The drift is invisible until someone
  runs `prisma migrate deploy`, which then tries to re-apply everything, fails on "already
  exists", and leaves a failed row that blocks every later migration.
- Write the migration under `prisma/migrations/<timestamp>_<name>/migration.sql`, apply it
  **locally** with `prisma migrate deploy`, then hand it to the user to apply to production
  themselves — they run `prisma migrate deploy` against the direct (non-pooled) production URL,
  which is how every migration before 2026-10-22 was applied and what keeps `_prisma_migrations`
  correct without anybody maintaining it by hand. Never ask for that connection string.
- The Vercel build has never run migrations and should not start: `build` is plain `next build`
  and `postinstall` is `prisma generate`. Applying schema changes mid-deploy would break the
  ordering rule below.
- The ordering rule still holds: the migration reaches production **before** the code that
  uses the new column deploys. Prisma selects every scalar field, so code referencing a
  column the database lacks fails every query against that table, not just the new path.
- Reading production with `execute_sql` (SELECTs, `information_schema` checks) is fine and
  is the right way to confirm a migration landed.

## Destructive operations
- Any script that deletes or modifies production data must default to a dry run
  (list what it would do, change nothing) unless explicitly told to apply.
- Before running anything against production, state in plain language what it
  will do and what could go wrong if the assumption behind it is incorrect.

## Verifying claims before reporting them
- When reporting "done," confirm it against the actual source of truth (re-read
  the file, re-check git log/diff, re-run the test) rather than restating what
  was intended or what a previous step was supposed to do.
- If asked to summarize what changed, diff against the actual base rather than
  assuming a plan was followed exactly.

## Communication style
- Lead with the direct answer or fix, not a restatement of the problem.
- Flag security/architectural implications plainly when they exist, even if not
  asked — but don't manufacture urgency where none exists.
- When something is uncertain, say so explicitly rather than presenting a guess
  as confirmed fact.
- Keep going on a multi-step task rather than stopping to ask permission at each
  small step, unless the step is destructive, irreversible, or genuinely ambiguous.
