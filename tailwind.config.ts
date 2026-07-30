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
        // Core system: deep navy + pool-water teal + coral accent, grounded in what this
        // product actually is (technicians reading water chemistry outdoors, on phones) —
        // not a generic SaaS palette. Every dashboard surface should draw from this set
        // rather than one-off hex literals. `blue`/`blueDark`/`sky`/etc are kept as aliases
        // of the teal family so existing .app-* consumers (forms, links) shift automatically.
        brand: {
          navy: "#0F2A3D",
          navyLight: "#1C4257",
          teal: "#1F8A80",
          tealDark: "#146A62",
          coral: "#E2775E",
          coralDark: "#C65D46",
          ink: "#16242B",
          surface: "#F5F8F7",
          foam: "#E6F3F1",
          border: "#CFE3E0",
          icon: "#6E8E8A",
          // Aliases so existing usages of brand-blue/brand-sky/brand-mist/brand-alert
          // continue to resolve, now pointed at the new teal-forward palette.
          blue: "#1F8A80",
          blueDark: "#146A62",
          sky: "#9FCFC8",
          mist: "#E6F3F1",
          alert: "#E2775E",
        },
      },
      boxShadow: {
        soft: "0 8px 30px -12px rgba(15, 42, 61, 0.16)",
        softLg: "0 16px 40px -16px rgba(15, 42, 61, 0.22)",
        nav: "0 4px 24px -8px rgba(15, 42, 61, 0.10)",
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
