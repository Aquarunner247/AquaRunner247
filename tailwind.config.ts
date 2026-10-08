import type { Config } from "tailwindcss";
import { COLOR, FONT } from "./lib/design-tokens";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // className strings can live in plain .ts/.tsx helper modules too (e.g. hooks that
    // return JSX props) -- without this, Tailwind's build-time scanner silently never
    // generates CSS for classes defined only here, even though they get applied at
    // runtime. See use-drag-reorder.ts's own history for exactly this bug.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // From lib/design-tokens.ts. These previously pointed at --font-dm-sans/--font-outfit, which
        // nothing defines (app/layout.tsx sets --font-display/--font-body/--font-mono), so the
        // font-display and font-sans utilities silently fell back to system-ui instead of the brand
        // fonts -- the kind of mismatch that having one definition is meant to prevent.
        sans: [...FONT.sans],
        display: [...FONT.display],
        // Landing pages only -- see FONT.marketing.
        marketing: [...FONT.marketing],
        // FONT.mono is deliberately NOT mapped onto the `font-mono` utility here. Doing so changes what
        // `font-mono` renders -- today it resolves to Tailwind's system stack, not IBM Plex Mono, so
        // every existing `font-mono` would silently switch typeface. That may well be the right fix
        // (.app-metric already uses Plex for readings and timestamps), but it is a design decision
        // rather than part of moving values into one file, and it is not being smuggled in here.
        // lib/design-tokens.ts carries the stack for whoever makes that call.
      },
      colors: {
        /**
         * Spread from lib/design-tokens.ts, which is the source. The palette used to be written out
         * here AND mirrored by hand in app/lib/chart-colors.ts AND restated as literals in each email
         * template; a token could be changed in one and not the others, and the only thing keeping
         * them equal was somebody remembering.
         *
         * The reasoning behind each colour -- what it is for, what it must not be used for, and the
         * measured contrast that decided it -- lives with the values in that file.
         */
        brand: { ...COLOR },
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
