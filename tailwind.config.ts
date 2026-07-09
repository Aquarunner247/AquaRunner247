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
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-outfit)", "var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 8px 30px -12px rgba(15, 118, 110, 0.12)",
        nav: "0 4px 24px -8px rgba(15, 118, 110, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
