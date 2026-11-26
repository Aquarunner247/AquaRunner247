import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { LegalDocument } from "../components/legal/legal-document";

export const metadata: Metadata = {
  title: "Open-source notices — AquaRunner 24/7",
  // Draft with unfilled [BRACKETED] placeholders (see the page's own warning banner) --
  // deliberately kept out of search results until the entity/attorney review is done.
  robots: { index: false, follow: false },
};

// Routed 2026-10-22, because EULA Section 9 cites this URL for open-source notices.
//
// content/legal/open-source-notices.md lists the direct production dependencies of TWO
// manifests -- package.json (the service) and native/package.json (the React Native app shell,
// whose packages ship inside the iOS and Android binaries). It is maintained by hand and kept
// honest by lib/__tests__/open-source-notices.test.ts, which compares every bullet against what
// npm actually installed in each tree. Add a dependency and that test fails until the page says
// so. Read verbatim here; `marked` emits no heading ids, so do not write intra-page anchors.
const CONTENT_PATH = path.join(process.cwd(), "content", "legal", "open-source-notices.md");

export default function LicensesPage() {
  const content = fs.readFileSync(CONTENT_PATH, "utf8");
  return (
    <div className="bg-brand-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-brand-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SiteNav current="legal" />
      <main id="main">
        {/* Eyebrow only -- the markdown document supplies its own <h1>, and a second one here
            would compete with it both visually and for assistive technology. */}
        <div className="px-5 pt-14 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-3xl">
            <p className="font-marketing text-sm font-bold uppercase italic tracking-[0.12em] text-brand-cta">Legal</p>
          </div>
        </div>
        <LegalDocument content={content} />
      </main>
      <SiteFooter />
    </div>
  );
}
