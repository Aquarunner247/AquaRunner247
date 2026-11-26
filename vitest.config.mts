import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  /**
   * tsconfig.json sets `jsx: "preserve"` because Next.js runs its own transform, which leaves
   * vitest unable to parse any component a test imports. `oxc` rather than `esbuild` because
   * Vite 8 transforms with oxc and ignores the esbuild block entirely (it warns and moves on).
   * Needed by
   * lib/__tests__/onboarding-tour-scrolling.ts, the one test that mounts a component, and inert
   * for everything else: a module containing no JSX transforms identically either way.
   */
  oxc: {
    jsx: "react-jsx",
  },
  test: {
    environment: "node",
  },
});
