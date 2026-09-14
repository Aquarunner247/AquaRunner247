import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { LegalDocument } from "../components/legal/legal-document";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy — AquaRunner 24/7",
  // Draft with unfilled [BRACKETED] placeholders (see the page's own warning banner) --
  // deliberately kept out of search results until the entity/attorney review is done.
  robots: { index: false, follow: false },
};

// content/legal/*.md is a drafting placeholder pending LLC formation and attorney review
// (see its own leading warning block) -- read verbatim, never edited or paraphrased here.
const CONTENT_PATH = path.join(process.cwd(), "content", "legal", "privacy-policy.md");

export default function PrivacyPage() {
  const content = fs.readFileSync(CONTENT_PATH, "utf8");
  return (
    <div className={styles.root}>
      <SiteNav current="legal" />
      <main id="main">
        <LegalDocument content={content} />
      </main>
      <SiteFooter />
    </div>
  );
}
