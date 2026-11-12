import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A published contract must not read like an unfinished one.
 *
 * Three defects kept recurring in content/legal/, and all three were found by a person reading
 * the live pages rather than by anything here:
 *   - A placeholder field that was never filled in. The Privacy Policy named its privacy
 *     contact as "Privacy Contact" in three places, and the DPA's Section 12.1 did the same.
 *   - A drafting hedge left in the text. The Privacy Policy told readers that our collection
 *     categories "must be confirmed for the period before publication" and that our sale
 *     practices "should be confirmed before publication" -- in a policy that was published.
 *   - An internal note in a version history. The Consumer Addendum's own history said it was
 *     "added on outside legal review", which is drafting process, not a term.
 *
 * Each is worse than a typo: a consumer's lawyer reads an unfilled field as evidence the
 * document was never finished, which is the argument that a clickwrap acceptance of it did not
 * bind anybody.
 *
 * Scope is derived from the routes rather than hard-coded, so a document that becomes published
 * later is covered from the moment it is routed. content/legal/service-level-agreement.md is
 * deliberately NOT routed and still carries [DAYS AND HOURS, PACIFIC TIME]-style blanks; the day
 * it gets a page.tsx, this test starts holding it to the same standard, which is the point.
 */

const LEGAL_DIR = path.join(process.cwd(), "content", "legal");
const APP_DIR = path.join(process.cwd(), "app");

/** The markdown files some app route actually serves. */
function publishedDocuments(): string[] {
  const files = new Set<string>();
  for (const entry of fs.readdirSync(APP_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = path.join(APP_DIR, entry.name, "page.tsx");
    if (!fs.existsSync(page)) continue;
    const source = fs.readFileSync(page, "utf8");
    for (const m of source.matchAll(/"([a-z0-9-]+\.md)"/g)) files.add(m[1]);
  }
  return [...files].sort();
}

/**
 * A document's operative text: everything before its version history and its attorney-review
 * footer. Both of those legitimately discuss drafting -- a history row has to be able to say
 * that a draft hedge was removed, and the footer's whole job is to say the document still needs
 * a lawyer. Scanning them would make the test unable to describe its own fix.
 */
function operativeText(file: string): string {
  const full = fs.readFileSync(path.join(LEGAL_DIR, file), "utf8");
  const cut = full.indexOf("## Version History");
  return cut === -1 ? full : full.slice(0, cut);
}

describe("published legal documents are finished documents", () => {
  const documents = publishedDocuments();

  it("finds the published documents to check", () => {
    // If this ever reports an empty list the rest of the suite passes vacuously.
    expect(documents.length).toBeGreaterThanOrEqual(6);
    expect(documents).toContain("privacy-policy.md");
    expect(documents).toContain("terms-of-service.md");
    expect(documents).toContain("data-processing-addendum.md");
    expect(documents).not.toContain("service-level-agreement.md");
  });

  it.each(documents)("%s leaves no bracketed fill-in blank", (file) => {
    // [STATUS PAGE URL], [Competent Supervisory Authority], [48] -- a bracketed run of
    // upper-case words or a bracketed bare number is a field somebody meant to complete.
    // Markdown links are excluded by requiring the bracket not to be followed by "(".
    const blanks = [...operativeText(file).matchAll(/\[([A-Z][A-Za-z ,/]{3,}|\d+)\](?!\()/g)].map((m) => m[0]);
    expect(blanks, `${file} still contains an unfilled placeholder field`).toEqual([]);
  });

  it.each(documents)("%s does not defer anything to 'before publication'", (file) => {
    expect(operativeText(file).toLowerCase()).not.toContain("before publication");
  });

  it.each(documents)("%s names a real privacy contact rather than the placeholder", (file) => {
    // The literal string the Privacy Policy and the DPA carried where a name belonged.
    expect(operativeText(file)).not.toMatch(/Contact:?\*{0,2} Privacy Contact/);
    expect(operativeText(file)).not.toContain("**Privacy Contact**");
  });

  it("does not describe its own drafting process in a version history", () => {
    // The Consumer Addendum's history row said the version was "added on outside legal
    // review". Who asked for a clause is not a term of it, and a counterparty reading that
    // learns only that the document was being argued over shortly before they signed it.
    for (const file of documents) {
      const full = fs.readFileSync(path.join(LEGAL_DIR, file), "utf8");
      const cut = full.indexOf("## Version History");
      if (cut === -1) continue;
      expect(full.slice(cut), file).not.toMatch(/on outside legal review|pending attorney|TODO/i);
    }
  });
});
