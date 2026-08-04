import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // These previously pointed at --font-dm-sans/--font-outfit, which nothing
        // defines (app/layout.tsx sets --font-display/--font-body/--font-mono) --
        // font-display and font-sans utility classes were silently falling back to
        // system-ui instead of the intended brand fonts.
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        // ─────────────────────────────────────────────────────────────────────────
        // AquaRunner design system — "Sunset Water" (System B)
        //
        // Derived from pool water at sunset: deep turquoise below, warm salmon light
        // on the surface. Two temperatures with two jobs:
        //   COOL (teal/turquoise) = the product. Every dashboard, technician, and
        //     inspector surface. Calm, legible, gets out of the way.
        //   WARM (salmon/clay)    = marketing. The landing page and anything selling.
        //     Also the single "act now" accent inside the product, used sparingly.
        //
        // Every value below is contrast-checked. Rules that are NOT optional:
        //   • `accent` (#F6AD93) is DARK-BACKGROUND ONLY. 7.3:1 on ink, 1.6:1 on
        //     white — it is decoration on dark, never text on light, never a fill
        //     behind white text.
        //   • Status colors (ok / warn / danger) are reserved for reading results.
        //     Never use `cta` or `accent` to signal a chemical value. A failed
        //     chlorine reading must not compete with a marketing color.
        //   • No new hex literals in components. If a color is missing, add it here.
        // ─────────────────────────────────────────────────────────────────────────
        brand: {
          // — Core cool (product) —
          ink: "#06333B",         // deepest surface + primary text        13.6:1 on white
          anchor: "#07606D",      // headers, filled dark chrome            7.2:1 on white
          primary: "#0A6E7C",     // primary action, links, focus           5.9:1 on white
          primaryHover: "#054E58",
          surface: "#F4F8F8",     // product page background
          foam: "#E4EFEF",        // subtle raised/zebra fill
          border: "#C4D9DA",      // hairline dividers (decorative)
          control: "#6C8F93",     // input + control outlines               3.3:1 on surface
          muted: "#55696C",       // secondary text on cool surface         5.2:1

          // — Core warm (marketing + urgent accent) —
          cta: "#B8503E",         // warm button fill, white text           4.9:1 on white
          ctaHover: "#9C4132",
          accent: "#F6AD93",      // DARK BACKGROUNDS ONLY — eyebrows, tags, highlights
          warmSurface: "#FBF6F3", // marketing page background
          warmFoam: "#F2E5DE",
          warmBorder: "#DCC8BE",
          warmControl: "#9A7C68",
          warmMuted: "#5C6F72",

          // — Status: reading results only —
          ok: "#0F6B57",          // PASS      6.4:1 on white
          warn: "#9A6212",        // WATCH     5.1:1 on white
          danger: "#A32E22",      // FAIL      7.1:1 on white
          okFill: "#E2F0EA",
          warnFill: "#F7EBD6",
          dangerFill: "#F7E3E0",

          // — Legacy aliases —
          // Kept so existing brand-navy / brand-teal / brand-blue / brand-sky /
          // brand-mist / brand-alert / brand-coral consumers keep compiling while
          // screens are migrated. Do not use these in new code; they will be removed
          // once the last consumer is converted.
          navy: "#06333B",
          navyLight: "#07606D",
          teal: "#0A6E7C",
          tealDark: "#054E58",
          coral: "#B8503E",
          coralDark: "#9C4132",
          icon: "#55696C",
          blue: "#0A6E7C",
          blueDark: "#054E58",
          sky: "#9CC3C6",
          mist: "#E4EFEF",
          alert: "#B8503E",
        },
      },
      boxShadow: {
        soft: "0 8px 30px -12px rgba(6, 51, 59, 0.16)",
        softLg: "0 16px 40px -16px rgba(6, 51, 59, 0.22)",
        nav: "0 4px 24px -8px rgba(6, 51, 59, 0.10)",
      },
      transitionDuration: {
        DEFAULT: "180ms",
      },
      keyframes: {
        waveDrift: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "wave-drift": "waveDrift 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
