# AquaRunner 24/7 — Design System ("Sunset Water")

One palette. It lives in `tailwind.config.ts` under `theme.extend.colors.brand`.
If you need a color that isn't here, add it there — never inline a hex in a component.

## The idea

Pool water at sunset: deep turquoise below, warm salmon light on the surface.
Two temperatures, two jobs.

| Temperature | Job | Where |
|---|---|---|
| **Cool** (teal/turquoise) | The product. Calm, legible, gets out of the way. | Dashboard, technician screens, inspector record, portal |
| **Warm** (salmon/clay) | Marketing, and the one "act now" accent inside the product. | Landing page; primary conversion buttons |

## Tokens

### Cool — product
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `brand-ink` | `#06333B` | Primary text; deepest dark surface | 13.6:1 on white |
| `brand-anchor` | `#07606D` | Dark chrome, headers, filled panels | 7.2:1 on white |
| `brand-primary` | `#0A6E7C` | Primary buttons, links, focus rings | 5.9:1 on white |
| `brand-primaryHover` | `#054E58` | Hover/active for the above | |
| `brand-surface` | `#F4F8F8` | Product page background | |
| `brand-foam` | `#E4EFEF` | Subtle raised fill, zebra rows, chips | |
| `brand-border` | `#C4D9DA` | Hairline dividers (decorative only) | |
| `brand-control` | `#6C8F93` | Input and control outlines | 3.3:1 on surface |
| `brand-muted` | `#55696C` | Secondary text | 5.2:1 on surface |

### Warm — marketing + urgent accent
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `brand-cta` | `#B8503E` | Warm button fill, white text | 4.9:1 on white |
| `brand-ctaHover` | `#9C4132` | Hover for the above | |
| `brand-accent` | `#F6AD93` | **Dark backgrounds only** — eyebrows, tags, highlights | 7.3:1 on ink |
| `brand-warmSurface` | `#FBF6F3` | Marketing page background | |
| `brand-warmFoam` | `#F2E5DE` | Marketing raised fill | |
| `brand-warmBorder` | `#DCC8BE` | Marketing hairlines | |
| `brand-warmControl` | `#9A7C68` | Marketing input outlines | 3.3:1 on warmSurface |
| `brand-warmMuted` | `#5C6F72` | Marketing secondary text | 4.9:1 |

### Status — reading results only
| Token | Hex | Meaning | Fill |
|---|---|---|---|
| `brand-ok` | `#0F6B57` | PASS / in range | `brand-okFill` `#E2F0EA` |
| `brand-warn` | `#9A6212` | WATCH / borderline | `brand-warnFill` `#F7EBD6` |
| `brand-danger` | `#A32E22` | FAIL / out of range, destructive actions | `brand-dangerFill` `#F7E3E0` |

## Non-negotiable rules

1. **No hex literals in components.** Not in `className`, not in inline `style`, not in
   CSS modules outside the marketing page's own `:root`. Add a token instead.
2. **`brand-accent` never appears on a light background.** It is 1.6:1 on white — it is
   decoration on dark surfaces, never text on light, never a fill behind white text.
3. **Status colors are reserved.** `ok`/`warn`/`danger` mean a reading result. Never use
   `cta` or `accent` to signal a chemical value, and never restyle a status chip to match
   a brand color. A failed chlorine reading must be unmistakable and must not compete with
   a marketing color.
4. **No `slate-*`, `gray-*`, `zinc-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*`, `blue-*`.**
   Use `brand-ink`, `brand-muted`, `brand-foam`, `brand-border`, and the status tokens.
5. **Reach for the `.app-*` classes first.** `globals.css` already defines cards, fields,
   buttons, links, badges, pills, and tabs on tokens. Restyling one of those inline is a
   sign the shared class needs changing instead.
6. **Legacy aliases are temporary.** `brand-navy`, `brand-teal`, `brand-coral`,
   `brand-blue`, `brand-sky`, `brand-mist`, `brand-alert` still resolve so unmigrated
   screens compile. Do not use them in new code.

## Type

Set in `app/layout.tsx`, exposed as CSS variables. Do not add new families.

- Display — Big Shoulders Display → `font-display`
- Body — Inter → `font-sans`
- Mono — IBM Plex Mono → `.app-metric` for readings, permit numbers, timestamps, route IDs

## Outdoor legibility

Technicians use this on phones in direct Nevada sun. Body text at or below 14px must sit on
`white` or `brand-surface`, never on `brand-foam` with `brand-muted`. Touch targets 44px
minimum. Prefer solid fills over translucency for anything a tech taps while working.
