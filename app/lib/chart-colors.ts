/**
 * Brand hexes for consumers that cannot use a Tailwind class: SVG `fill`/`stroke` attributes, Leaflet
 * marker and polyline options, and inline styles built as strings.
 *
 * These are now re-exports of lib/design-tokens.ts rather than their own copies. They used to be a
 * hand-kept mirror, and this file's own comment said so -- "change them there first, then here" -- which
 * is a rule that holds right up until somebody doesn't. It stopped holding the moment the palette moved
 * to navy and coral: every value below was still the old teal, and nothing would have failed to tell us.
 *
 * The names are kept because ~15 modules import them. New code can import COLOR directly.
 */
import { COLOR } from "@/lib/design-tokens";

export const BRAND_INK = COLOR.ink;
export const BRAND_ANCHOR = COLOR.anchor;
export const BRAND_PRIMARY = COLOR.primary;
export const BRAND_SURFACE = COLOR.surface;
export const BRAND_FOAM = COLOR.foam;
export const BRAND_BORDER = COLOR.border;
export const BRAND_CONTROL = COLOR.control;
export const BRAND_MUTED = COLOR.muted;

export const BRAND_CTA = COLOR.cta;

export const BRAND_OK = COLOR.ok;
export const BRAND_WARN = COLOR.warn;
export const BRAND_DANGER = COLOR.danger;

export const BRAND_OK_FILL = COLOR.okFill;
export const BRAND_WARN_FILL = COLOR.warnFill;
export const BRAND_DANGER_FILL = COLOR.dangerFill;
