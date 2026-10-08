# AquaRunner247.com design system handoff

AquaRunner247.com is the source of truth for the product experience; the owner's mobile app must mirror the website exactly in visual language, terminology, hierarchy, and interaction treatment.

## Colour

Use the following canonical tokens. Consume them from the single `@theme` block in `src/styles/global.css`; do not introduce page-specific colour values.

| Token | Hex / value | Where used |
| --- | --- | --- |
| Navy | `#0B2A4A` | Dark chrome, header and navigation, dark sections, primary app frame |
| Deep Sea | `#0E3A5C` | Secondary dark panels and cards on Navy |
| Pool Blue | `#1B7BB8` | Secondary detail such as icons, chips, links, and data accents |
| Pool Light | `#2E9BD6` | Lighter pool-blue detail and active/interactive accents |
| Coral | `#F2685A` | Primary CTA, eyebrow labels, highlighted words, and small accent details |
| Coral Dark | `#E05546` | Coral hover and pressed state |
| Cream | `#F7F4EF` | Light page and section backgrounds |
| White | `#FFFFFF` | Cards, light surfaces, and text on dark backgrounds |
| Ink | `#12283E` | Primary text on light surfaces |
| Ink Soft | `#44586D` | Supporting text, captions, and secondary labels |
| Foam | `#E7EEF4` | Supporting text and quiet contrast on Navy |
| Success | `#1E8E5A` | Passing, compliant, or successful states |
| Error | `#C8452F` | Errors, failures, or action-required states |
| Border light | `rgba(11,42,74,0.12)` | Borders and dividers on light surfaces |
| Border dark | `rgba(255,255,255,0.14)` | Borders and dividers on Navy or Deep Sea surfaces |

Navy should dominate dark chrome and dark sections. Cream supports light sections. Coral is an accent used sparingly for CTAs and highlighted words. Use Pool Blue for secondary detail, including icons, chips, and links.

## Typography

Use the display font stack exactly: `"Arial Narrow", "Roboto Condensed", Impact, sans-serif`. Use weight 800 or 900 (extrabold or black), tracking from `-0.04em` to `-0.06em`, and an uppercase italic treatment for display headlines and display labels.

Use Inter for body copy: `Inter, ui-sans-serif, system-ui, sans-serif`. Use weight 400 for body text and 700 for bold labels and buttons. Set body line-height to approximately 1.6.

Use the serif accent stack `Georgia, serif` only for the pull quote.

There are no Google Fonts installed: the display stack is a system condensed stack. The closest free installable equivalents are Roboto Condensed (Google Fonts, use Black Italic for the display treatment) or Archivo Condensed Black Italic. Inter is free on Google Fonts. If the app cannot rely on system fonts, install Inter and Roboto Condensed from Google Fonts.

### Accent word rule

Render the last word or words of a display headline in Coral `#F2685A`, keeping the same uppercase italic display treatment. On Navy backgrounds, the base headline is White; on Cream backgrounds, the base headline is Navy.

## Component specifications

### Primary button

Use a Coral `#F2685A` fill, White text, and bold type. Set radius to `0.375rem`; use `1rem 1.5rem` padding on desktop and `0.75rem 1rem` in compact contexts. On hover, use Coral Dark `#E05546`.

### Secondary / outline button

Use a transparent background, a `1px` border, and bold text. On Navy, use a White border at 35% opacity and White text. On light surfaces, use a Navy border at 35% opacity and Navy text. Use the same `0.375rem` radius and padding as the primary button. On hover, change the border and text to Coral.

### Eyebrow / kicker label

Use the display font at `0.875rem`, bold, uppercase italic, with `letter-spacing: 0.12em` and Coral text.

### Card

Use a White background, `1rem` radius, a `1px` border in Pool Blue at 20% opacity or Navy at 12% opacity, and `1.75rem` padding on desktop / `1.5rem` on mobile. Feature cards lift `-4px` on hover and use a Coral border on hover. On Navy sections, use Deep Sea `#0E3A5C` fill with a White-at-10%-opacity border.

### Icon chip

Use `0.75rem` radius and `0.75rem` padding. Set the background to mist `#E5F2F8` and the icon to Pool Blue.

### Section rhythm

Use `px-5 py-20` on mobile, `sm:px-8`, and `lg:px-12 lg:py-28` on desktop. Use the shorter rhythm `lg:py-24` where a section needs less vertical weight. Use `py-12` for the footer.

### Shadow scale

Use the Tailwind `shadow-lg`, `shadow-xl`, and `shadow-2xl` scale. Cards use `shadow-xl`.

## Do not

- Do not introduce new accent colours.
- Do not use Coral on large fills; reserve it for CTAs, the small quote block, and accent words.
- Do not mix in the old near-black (`#0B2E33`) or old burnt orange (`#df584d`).
- Keep Navy `#0B2A4A` for the app's dark chrome.
- Do not apply the display font to body copy.

## Mobile app adoption checklist

- Header/nav: use Navy chrome, a White display logo, and Coral `247`.
- Tab bar: use a Navy bar, Pool Light active icons, and Foam inactive labels.
- Status chips: use Pass with Success green on a `#d9f2e5`-style soft green; use Action needed with Coral or Error tones on a soft Coral background.
- Log tables: use a White card, Navy-at-12%-opacity borders, and uppercase `0.75rem` column headers with `0.12em` tracking.
- QR code plaque: use a White rounded card, a Navy QR frame, and a caption in the style of “One code per body of water”.
- CTA buttons: use the Coral primary button exactly as specified above.

Canonical tokens live in the single `@theme` block in `src/styles/global.css`; the website is the source of truth.
