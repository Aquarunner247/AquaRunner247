# Working conventions for this project

## Design — read DESIGN-SYSTEM.md before touching any UI

`DESIGN-SYSTEM.md` at the repo root is the single source of truth for color and type.
Read it before writing UI code. It exists because this repo previously accumulated five
competing palettes — the Tailwind config declared one thing, components used another, the
landing page CSS module defined a third, and a stale patch file carried a fourth. Every
agent and human working here follows the same document so that cannot happen again.

The short version, so it is impossible to miss:

- **One palette**, in `tailwind.config.ts` under `theme.extend.colors.brand`. Need a color
  that isn't there? Add it there. **Never inline a hex** in `className`, inline `style`, or
  a CSS module.
- **Cool teal = the product** (dashboard, technician screens, inspector record, portal).
  **Warm clay = marketing** plus the single "act now" accent inside the product.
- **`brand-accent` (`#F6AD93`) is dark-background only.** It is 1.6:1 on white. Never text
  on light, never a fill behind white text.
- **Status colors are reserved.** `ok`/`warn`/`danger` mean a water-reading result. Never
  use `cta` or `accent` to signal a chemical value, and never restyle a status chip to match
  a brand color. A failed chlorine reading must not compete visually with a marketing button.
- **Never use `slate-*`, `gray-*`, `zinc-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*`,
  `blue-*`.** Use `brand-ink`, `brand-muted`, `brand-foam`, `brand-border`, status tokens.
- **Reach for the `.app-*` classes in `globals.css` first.** Cards, fields, buttons, links,
  badges, pills, and tabs are already defined on tokens. Needing to restyle one inline means
  the shared class should change instead.
- **Legacy aliases** (`brand-navy`, `brand-teal`, `brand-coral`, `brand-blue`, `brand-sky`,
  `brand-mist`, `brand-alert`) still resolve so old screens compile. **Do not use them in
  new code.**
- **Type is fixed**: Satoshi for both `font-display` and `font-sans` (differentiated by
  weight), IBM Plex Mono (`.app-metric` for readings, permit numbers, timestamps, route
  IDs). Add no families.
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
