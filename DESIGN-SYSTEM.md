# AquaRunner 24/7 — Design System ("Sunset Water")

One palette. It lives in `lib/design-tokens.ts` under `COLOR`.
If you need a color that isn't here, add it there — never inline a hex in a component.

`tailwind.config.ts` imports from that file rather than restating the palette, so a Tailwind
class and a TypeScript constant cannot drift. Three consumers can't use a Tailwind class at
all — email markup (clients strip CSS variables), SVG `fill`/`stroke` written from JS, and
Leaflet options — and those import `COLOR` directly. That is what importing it is for, not an
escape from `text-brand-ink`.

## The idea

Pool water at sunset: deep navy below, pool blue through it, coral light on the surface, warm
cream sand. Two temperatures, two jobs.

| Temperature | Job | Where |
|---|---|---|
| **Cool** (navy / pool blue) | The product. Calm, legible, gets out of the way. | Dashboard, technician screens, inspector record, portal |
| **Warm** (coral) | Marketing, and the one "act now" accent inside the product. | Landing page; primary conversion buttons |

Contrast figures below are measured, not estimated, and several tokens exist *because* of
them.

## Tokens

### Cool — product
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `brand-ink` | `#0B2A4A` | Primary text; deepest dark surface | 14.5:1 on white, 13.3:1 on cream |
| `brand-anchor` | `#0E3A5C` | Dark chrome, headers, filled panels on navy | 11.8:1 on white |
| `brand-primary` | `#1974AD` | Links, secondary buttons, focus rings, data accents | 5.1:1 on white, 4.6:1 on cream |
| `brand-primaryHover` | `#0E3A5C` | Hover/active for the above | |
| `brand-poolLight` | `#2E9BD6` | Lighter detail on dark — an active tab-bar icon on navy | 4.7:1 on ink |
| `brand-icon` | `#1B7BB8` | Icons, which are secondary detail | 4.6:1 on white |
| `brand-surface` | `#F7F4EF` | Cream — light page and section background | |
| `brand-foam` | `#E7EEF4` | Quiet contrast; also supporting text *on* navy | |
| `brand-mist` | `#E5F2F8` | Icon-chip fill behind a pool-blue icon | |
| `brand-border` | `#DFE2E6` | Hairline dividers on light (decorative only) | |
| `brand-borderSoft` | `rgba(11,42,74,0.12)` | Hairline over a photo or gradient, where true alpha is needed | |
| `brand-borderOnDark` | `rgba(255,255,255,0.14)` | Hairline on navy or deep sea | |
| `brand-control` | `#44586D` | Input and control outlines | 6.7:1 on cream |
| `brand-muted` | `#44586D` | Secondary text, captions, labels | 7.3:1 on white, 6.7:1 on cream |
| `brand-mutedOnDark` | `#E7EEF4` | Supporting text and icons on navy | 12.4:1 on ink |

`brand-border` is a flat hex on purpose. Tailwind's opacity modifier **replaces** a color's
alpha rather than multiplying it, so with an `rgba` token `border-brand-border/70` compiles to
a near-solid navy rule where the author wrote "a slightly stronger hairline". Use
`brand-borderSoft` only where real transparency is required.

### Warm — marketing + urgent accent
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `brand-cta` | `#F2685A` | Coral. Primary conversion button fill, eyebrow labels, highlighted words | 3.0:1 on white |
| `brand-ctaHover` | `#E05546` | Hover for the above | |
| `brand-ctaText` | `#0B2A4A` | **What a label on a coral fill is written in** | 4.8:1 on coral |
| `brand-accent` | `#F2685A` | Same coral, for the dark-background uses this token already had | 4.8:1 on ink |
| `brand-warmSurface` | `#F7F4EF` | Cream, same as `brand-surface` | |
| `brand-warmFoam` | `#FFFFFF` | White — marketing cards and light surfaces | |
| `brand-warmBorder` | `#DFE2E6` | Marketing hairlines | |
| `brand-warmControl` | `#44586D` | Marketing input outlines | |
| `brand-warmMuted` | `#44586D` | Marketing secondary text | |

**White text on coral is 3.0:1 and fails AA.** That is why `brand-ctaText` exists: navy on the
same coral is 4.8:1 and keeps the brand color exactly, where darkening coral far enough for
white text turns it into a different, muddier color. Label a coral fill `text-brand-ink` or
`text-brand-ctaText` — they are the same hex, the second one just says why — and never
`text-white`. `PrimaryButton` in `app/components/landing/ui.tsx` is the reference.

The warm family is mostly aliases now — cream, white and the same ink-soft gray as the product
side. The names are kept so existing marketing classes resolve.

### Status — reading results only
| Token | Hex | Meaning | Fill | Contrast |
|---|---|---|---|---|
| `brand-ok` | `#0F6B57` | PASS / in range | `brand-okFill` `#E2F0EA` | 6.4:1 on white, 5.5:1 on its fill |
| `brand-warn` | `#9A6212` | WATCH / borderline | `brand-warnFill` `#F7EBD6` | 5.1:1 on white, **4.3:1 on its fill** |
| `brand-danger` | `#A32E22` | FAIL / out of range, destructive actions | `brand-dangerFill` `#F7E3E0` | 7.1:1 on white, 5.7:1 on its fill |

These are deliberately not the design handoff's status colors, whose Success and Error measure
4.1:1 and 4.0:1 — read on a phone, outdoors, in Nevada sun, to decide whether a pool is safe.
WATCH has no equivalent in the handoff at all; a reading that is drifting is neither a pass nor
a failure, and collapsing it into either would misreport water chemistry.

**Known gap:** `brand-warn` on `brand-warnFill` is 4.3:1, under the 4.5:1 AA threshold for
normal-size text. It clears AA for large or bold text, so a chip label set at 14px semibold or
above is fine; don't set small regular-weight warn text on a warn chip. The other two chips
clear AA outright.

## Non-negotiable rules

1. **No hex literals in components.** Not in `className`, not in inline `style`, not in CSS
   modules outside the marketing page's own `:root`. Add a token to `lib/design-tokens.ts`
   instead. Email markup is the exception: clients strip CSS variables, so mail templates
   import `COLOR` and render literal hex.
2. **Coral is never small text on a light background.** `brand-cta` / `brand-accent` is 3.0:1
   on white and 2.8:1 on cream. It is a fill, an eyebrow, or a highlight on dark — not body
   text on light. A coral fill is labelled `text-brand-ctaText`.
3. **Status colors are reserved.** `ok`/`warn`/`danger` mean a reading result. Never use `cta`
   or `accent` to signal a chemical value, and never restyle a status chip to match a brand
   color. A failed chlorine reading must be unmistakable and must not compete with a marketing
   color. The one sanctioned non-reading use of `brand-danger` is a destructive action
   (deleting an account, removing a record), which the token table notes.
4. **No `slate-*`, `gray-*`, `zinc-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*`, `blue-*`.**
   Use `brand-ink`, `brand-muted`, `brand-foam`, `brand-border`, and the status tokens.
5. **Reach for the `.app-*` classes first.** `globals.css` already defines cards, fields,
   buttons, links, badges, pills, tabs and the legal-document prose styles on tokens.
   Restyling one of those inline is a sign the shared class needs changing instead. Check the
   class exists before using it — an undefined `.app-*` renders unstyled and silently.
6. **The old teal palette is gone.** `brand-navy`, `brand-teal`, `brand-coral`, `brand-blue`,
   `brand-sky` and `brand-alert` no longer resolve to anything — they are not in `COLOR`, so a
   class using one produces no style at all rather than a wrong color. Nothing in the codebase
   still references them. (`brand-mist` survives, but as a real token: the icon-chip fill
   above.)

## Type

Set in `app/layout.tsx`, exposed as CSS variables, mapped to utilities in `tailwind.config.ts`
from `FONT` in `lib/design-tokens.ts`. Four families, each with one job:

| Utility | Face | Variable | Job |
|---|---|---|---|
| `font-display` | Satoshi | `--font-display` | Product headings — 77 of them across dashboard, portal and technician screens |
| `font-sans` | Inter | `--font-body` | Everything that is read rather than looked at, marketing and product alike |
| `font-marketing` | Roboto Condensed | `--font-marketing` | **Landing pages only.** The handoff's display face: condensed, heavy, UPPERCASE ITALIC, tight tracking |
| `.app-metric` | IBM Plex Mono | `--font-mono` | Readings, permit numbers, timestamps, route IDs — tabular figures so a column of chlorine values lines up |

Two display faces on purpose. `font-marketing` is the condensed face from the design handoff;
`font-display` stays Satoshi because the product's headings are already set in it and the
condensed italic face is for things that are looked at, not read. Don't set body copy or a
technician's checklist in `font-marketing` — the handoff's own rule, and the same argument.

Satoshi isn't on Google Fonts, so it loads through `next/font/local` from
`public/fonts/satoshi/` (pulled once from Fontshare's CDN, its vendor-sanctioned hosting path)
and is exposed as `--font-satoshi`, wired into `--font-display` in `app/globals.css`. Inter,
Roboto Condensed and IBM Plex Mono come through `next/font/google`.

`FONT.mono` is deliberately **not** mapped onto the `font-mono` utility — that utility still
resolves to Tailwind's system stack. Use `.app-metric` for monospace, not `font-mono`.

Georgia (`FONT.serif`) is used for the marketing pull quote and nothing else. Mail markup names
`Arial, sans-serif` because email clients cannot load a webfont reliably.

Add no further families.

## Outdoor legibility

Technicians use this on phones in direct Nevada sun. Body text at or below 14px must sit on
`white` or `brand-surface`, never on `brand-foam` with `brand-muted`. Touch targets 44px
minimum. Prefer solid fills over translucency for anything a tech taps while working.
