/**
 * Brand token hexes for consumers that cannot use a Tailwind class: SVG `fill`/
 * `stroke` attributes, Leaflet marker and polyline options, and inline styles
 * built as strings.
 *
 * `tailwind.config.ts` (`theme.extend.colors.brand`) remains the source of
 * truth — these values mirror it. Change them there first, then here.
 *
 * The `*_ON_DARK` values are the light status tints, used when a status color
 * has to sit on `brand-ink`/`brand-anchor` chrome where the standard status
 * hues are too dark to read.
 */

export const BRAND_INK = "#06333B";
export const BRAND_ANCHOR = "#07606D";
export const BRAND_PRIMARY = "#0A6E7C";
export const BRAND_SURFACE = "#F4F8F8";
export const BRAND_FOAM = "#E4EFEF";
export const BRAND_BORDER = "#C4D9DA";
export const BRAND_CONTROL = "#6C8F93";
export const BRAND_MUTED = "#55696C";

export const BRAND_CTA = "#CF3F2A";

export const BRAND_OK = "#0F6B57";
export const BRAND_WARN = "#9A6212";
export const BRAND_DANGER = "#A32E22";

export const BRAND_OK_FILL = "#E2F0EA";
export const BRAND_WARN_FILL = "#F7EBD6";
export const BRAND_DANGER_FILL = "#F7E3E0";
