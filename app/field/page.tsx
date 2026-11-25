import type { Metadata } from "next";
import { FieldShell } from "./field-shell";

/**
 * The one cacheable document in the app.
 *
 * Phase 1d of NATIVE-REBUILD-PLAN.md. Everything it shows is fetched or read from the device by
 * the client component below, so this page itself holds no data and -- crucially -- no identity:
 * app/layout.tsx skips its user lookup for this path, which is what lets public/sw.js keep a copy
 * and serve it with no network. See lib/service-worker-policy.ts.
 */
export const metadata: Metadata = {
  title: "Field mode",
  // An app screen, not a page anybody should arrive at from a search result.
  robots: { index: false, follow: false },
};

export default function FieldPage() {
  return <FieldShell />;
}
