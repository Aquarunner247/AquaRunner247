/**
 * Every colour and font in the product, defined once.
 *
 * This is the source. `tailwind.config.ts` imports from here rather than restating the palette, so a
 * Tailwind class and a TypeScript constant cannot drift -- which they already had: app/lib/chart-colors.ts
 * carried a hand-kept copy whose own comment read "these values mirror it. Change them there first, then
 * here", and the email templates each held their own literals.
 *
 * WHY A .ts FILE RATHER THAN CSS VARIABLES: three consumers cannot read a CSS variable at all.
 * Email clients strip them, so mail markup needs literal hex at render time; SVG `fill`/`stroke` written
 * from JS needs a string; and Leaflet takes colours as options. A TypeScript module serves all three and
 * Tailwind too, where a stylesheet could only serve the browser.
 *
 * Everything that CAN use a Tailwind class still should -- see DESIGN-SYSTEM.md. Importing from here is
 * for the places that cannot, not an escape from `text-brand-ink`.
 */

/**
 * Derived from pool water at sunset. Cool teal is the product -- every dashboard, technician and
 * inspector surface. Warm clay is marketing, plus the single "act now" accent inside the product.
 * Status colours mean a water-reading result and nothing else.
 *
 * Contrast figures are measured, not estimated, and are the reason several of these exist.
 */
export const COLOR = {
  // — Dark chrome (navy) —
  /** Dark chrome, header and navigation, dark sections, the app frame. Also primary text on light
   *  surfaces: the handoff separates these (Navy #0B2A4A vs Ink #12283E), but one token carries both
   *  here because `brand-ink` is already used for both across 2,000-odd class usages, and the two
   *  differ by a hue step invisible at text size. 11.9:1 on cream either way. */
  ink: "#0B2A4A", //          Navy
  anchor: "#0E3A5C", //       Deep Sea -- secondary dark panels and cards on Navy
  /** Secondary detail: icons, chips, links, data accents. NOT the primary call to action -- that is
   *  Coral. This is the quieter interactive colour. */
  /** Pool Blue, darkened 6% from the handoff's #1B7BB8. The published value measures 4.19:1 on Cream,
   *  which fails AA for link text on exactly the sections this design uses Cream for. This is the same
   *  colour to the eye and clears it on both: 4.62:1 on Cream, 5.07:1 on White. */
  primary: "#1974AD", //      Pool Blue (text-safe)
  primaryHover: "#0E3A5C", // Deep Sea, staying inside the palette rather than inventing a shade
  /** Lighter pool-blue detail and active/interactive accents, e.g. an active tab-bar icon on navy. */
  poolLight: "#2E9BD6",

  // — Light surfaces —
  surface: "#F7F4EF", //      Cream -- light page and section backgrounds
  foam: "#E7EEF4", //         Foam  -- quiet contrast, and supporting text on Navy
  /**
   * Borders and dividers on light surfaces: the handoff's rgba(11,42,74,0.12), flattened.
   *
   * Flattened on purpose. Tailwind's opacity modifier REPLACES a colour's alpha rather than multiplying
   * it, so with an rgba token `border-brand-border/70` compiles to rgba(11,42,74,.7) -- a near-solid
   * navy rule where the author wrote "a slightly stronger hairline". Eight places in this codebase do
   * exactly that. A solid hex keeps every one of them behaving as written.
   *
   * #DFE2E6 sits between the alpha value composited on Cream (#DBDCDB) and on White (#E2E5E9), so it
   * reads as the same hairline on both. `borderSoft` below keeps the true alpha for anything that needs
   * to sit over a photograph or a gradient.
   */
  border: "#DFE2E6",
  borderSoft: "rgba(11,42,74,0.12)",
  /** Borders and dividers on Navy or Deep Sea. */
  borderOnDark: "rgba(255,255,255,0.14)",
  control: "#44586D", //      Ink Soft -- input and control outlines
  muted: "#44586D", //        Ink Soft -- supporting text, captions, secondary labels

  // — Accent (used sparingly) —
  /** Primary CTA, eyebrow labels, highlighted words. Never a large fill -- see the handoff's "do not". */
  cta: "#F2685A", //          Coral
  ctaHover: "#E05546", //     Coral Dark
  /**
   * What a label on a Coral fill is written in.
   *
   * The handoff specifies White, which measures 3.04:1 on Coral -- below AA for button text, and this
   * is the primary call to action on every page. Navy on the same Coral is 4.78:1 and keeps the brand
   * colour exactly, where darkening Coral enough for white text (#C25348 at 20%) turns it into a
   * different, muddier colour. Flagged for the owner rather than decided quietly.
   */
  ctaText: "#0B2A4A",
  accent: "#F2685A", //       Coral, for the dark-background uses this token already had

  // — Marketing surfaces —
  // The warm family predates this palette, where light marketing sections are Cream and cards are
  // White. Kept as names so existing classes resolve, pointed at the new equivalents.
  warmSurface: "#F7F4EF", //  Cream
  warmFoam: "#FFFFFF", //     White -- cards and light surfaces
  warmBorder: "#DFE2E6",
  warmControl: "#44586D",
  warmMuted: "#44586D",

  // — Status: reading results only —
  /**
   * Status colours are NOT taken from the handoff, and that is deliberate.
   *
   * Its Success #1E8E5A measures 4.14:1 on white and 3.51:1 on its own chip; its Error #C8452F, 3.95:1
   * on a chip. These are read on a phone, outdoors, in Nevada sun, to decide whether a pool is safe --
   * DESIGN-SYSTEM.md calls that a functional requirement rather than polish. The values kept here were
   * measured for it: 6.44:1 and 7.07:1 on white, 5.48:1 and 5.73:1 on their chips.
   */
  ok: "#0F6B57", //           PASS
  danger: "#A32E22", //       FAIL
  /**
   * WATCH has no equivalent in the handoff, which supplies only Success and Error. A reading that is
   * drifting is not a pass and is not a failure, and collapsing it into either would misreport water
   * chemistry -- so the amber survives the repalette deliberately. Flagged rather than silently kept.
   */
  warn: "#9A6212",
  okFill: "#E2F0EA",
  warnFill: "#F7EBD6",
  dangerFill: "#F7E3E0",
  /** Icon-chip fill behind a Pool Blue icon. */
  mist: "#E5F2F8",

  icon: "#1B7BB8", //         Pool Blue, per the handoff: icons are secondary detail
  /** Supporting text and icons on Navy. Foam, per the handoff. */
  mutedOnDark: "#E7EEF4",
} as const;

/**
 * Neutrals used only inside email markup.
 *
 * Deliberately separate from COLOR and deliberately not replaced with it: these are the greys the mail
 * templates were written against, and swapping them for brand tokens would change how existing emails
 * look. That is a design decision, not a refactor, and it is not what pulling values into one file is
 * for. Several are near-duplicates of COLOR entries -- worth unifying on purpose one day.
 */
export const EMAIL_COLOR = {
  white: "#FFFFFF",
  /** Headings inside a white email card. */
  heading: "#111827",
  /** Body copy inside a white email card. */
  body: "#374151",
  /** Secondary copy and footers. */
  muted: "#6B7280",
  /** Hairline rules inside email cards. */
  rule: "#E5E7EB",
  /** Panel fill behind a footer or a quoted block. */
  panel: "#F9FAFB",
  /** The page behind the email card. */
  page: "#F4F5F6",
} as const;

/**
 * Satoshi for both display and body, told apart by weight; IBM Plex Mono for readings, permit numbers,
 * timestamps and route IDs. No other families -- see DESIGN-SYSTEM.md.
 *
 * The `--font-satoshi` and `--font-mono` variables are set by next/font in app/layout.tsx; these stacks
 * name them plus the fallbacks used before the webfont loads.
 */
export const FONT = {
  /**
   * Condensed, heavy, and used UPPERCASE ITALIC with tight tracking for display headlines and eyebrow
   * labels. This is a marketing treatment: the handoff's own rule is "do not apply the display font to
   * body copy", and in dense product UI -- a reading table, a technician's checklist -- it would cost
   * legibility for nothing. Sparingly inside the app.
   */
  display: ["var(--font-display)", "Arial Narrow", "Roboto Condensed", "Impact", "sans-serif"],
  /** Inter carries everything that is read rather than looked at, in both marketing and product. */
  sans: ["var(--font-body)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
  /**
   * Readings, permit numbers, timestamps and route IDs. The handoff has no mono, but compliance data
   * wants tabular figures -- a column of chlorine values has to line up to be scanned. Kept on purpose.
   */
  mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
  /** The pull quote, and nothing else. */
  serif: ["Georgia", "serif"],
  /** Email clients cannot load a webfont reliably, so mail markup names a stack they already have. */
  email: "Arial, sans-serif",
} as const;

export type BrandColorName = keyof typeof COLOR;
