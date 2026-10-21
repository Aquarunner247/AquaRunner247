import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { LegalDocument } from "../components/legal/legal-document";

export const metadata: Metadata = {
  title: "Sub-processors — AquaRunner 24/7",
  // Draft with unfilled [BRACKETED] placeholders (see the page's own warning banner) --
  // deliberately kept out of search results until the entity/attorney review is done.
  robots: { index: false, follow: false },
};

// The page the DPA's Section 6.2 commits to maintaining -- it named a URL
// ("aquarunner247.com/subprocessors") that did not exist, which is a contractual obligation
// pointing at a 404.
//
// ONE canonical list, linked to from the Privacy Policy and the DPA rather than restated in each.
// Restating it is how the Privacy Policy's Section 4.1 came to be missing Twilio, OpenAI and
// Google Dialogflow while the DPA's Exhibit B had them.
//
// content/legal/*.md is a drafting placeholder pending LLC formation and attorney review
// (see its own leading warning block) -- read verbatim, never edited or paraphrased here.
const CONTENT_PATH = path.join(process.cwd(), "content", "legal", "subprocessors.md");

export default function SubprocessorsPage() {
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
