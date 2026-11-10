import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { LegalDocument } from "../components/legal/legal-document";

export const metadata: Metadata = {
  title: "Consumer Addendum — AquaRunner 24/7",
  // Same reason as the other legal routes: drafting-stage documents stay out of search
  // results until the entity/attorney review is done.
  robots: { index: false, follow: false },
};

// The document Section 2 of the Terms of Service incorporates by URL, which is a contractual
// obligation pointing at a 404 if this route does not exist -- the same mistake /eula and
// /subprocessors were made to fix.
//
// Why the Addendum is a separate document rather than a clause in the Terms: it applies only to
// a Customer who is in fact a consumer, and it has to be able to say plainly which provisions of
// the Terms it replaces. Folding it into the Terms would mean every business customer reading
// consumer carve-outs that do not apply to them, which makes the Terms harder to rely on, not
// easier.
//
// Deliberately NOT in TERMS_DOCUMENTS (lib/terms-acceptance.ts): it is incorporated by the Terms
// and operates by its own terms when it applies, so it needs no separate act of assent, and
// adding a fifth link to the signup notice would dilute the four that do require one.
//
// content/legal/*.md is read verbatim, never edited or paraphrased here.
const CONTENT_PATH = path.join(process.cwd(), "content", "legal", "consumer-addendum.md");

export default function ConsumerTermsPage() {
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
        {/* Eyebrow only -- the markdown document supplies its own <h1>. */}
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
