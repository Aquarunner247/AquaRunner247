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
        // The app's actual brand palette (navy/blue/coral) previously only existed as
        // one-off hex literals scattered across ~15 files, while most dashboard pages
        // ran on the generic teal/slate defaults baked into globals.css's .app-* classes.
        // Centralizing it here lets every component reference the same tokens.
        brand: {
          navy: "#12234A",
          navyLight: "#1B3364",
          blue: "#0A5FA4",
          blueDark: "#084A82",
          sky: "#A9D3E0",
          border: "#C9E3EC",
          mist: "#EAF6FA",
          icon: "#7FA0AC",
          coral: "#E29B8F",
          alert: "#FF6B5B",
        },
      },
      boxShadow: {
        soft: "0 8px 30px -12px rgba(18, 35, 74, 0.14)",
        nav: "0 4px 24px -8px rgba(18, 35, 74, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
