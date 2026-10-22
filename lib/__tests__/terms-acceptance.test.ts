import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { TERMS_VERSION, TERMS_DOCUMENTS, termsAcceptanceFields } from "@/lib/terms-acceptance";

/**
 * The agreement is only as good as the pairing of a conspicuous notice with a recorded act of
 * assent, so these cover both halves of what can silently rot:
 *
 *  - the version drifting away from the documents it claims to name, which would leave a stored
 *    acceptance pointing at text nobody can reproduce
 *  - the notice linking a document that does not exist, which is notice of nothing
 */

const LEGAL_DIR = path.join(process.cwd(), "content", "legal");
const APP_DIR = path.join(process.cwd(), "app");

/** The documents an organization accepts, and the markdown each notice link resolves to. */
const ACCEPTED = {
  "/terms": "terms-of-service.md",
  "/eula": "end-user-license-agreement.md",
  "/privacy": "privacy-policy.md",
} as const;

describe("TERMS_VERSION", () => {
  it("is the effective date stamped on every document it covers", () => {
    // A stored acceptance is evidence of WHICH text was agreed to. If this constant and the
    // documents disagree, that evidence points at nothing.
    const expected = new Date(`${TERMS_VERSION}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    for (const file of Object.values(ACCEPTED)) {
      const content = fs.readFileSync(path.join(LEGAL_DIR, file), "utf8");
      expect(content, file).toContain(`**Effective Date:** ${expected}`);
    }
  });

  it("is an ISO date, so versions sort and compare", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("TERMS_DOCUMENTS", () => {
  it("names exactly the documents a signup accepts", () => {
    expect(TERMS_DOCUMENTS.map((d) => d.href)).toEqual(Object.keys(ACCEPTED));
  });

  it("links only to routes that exist", () => {
    // Notice of a document behind a 404 is not notice. /eula and /licenses were both cited by
    // URL from inside other documents for weeks before either had a page.
    for (const doc of TERMS_DOCUMENTS) {
      const route = path.join(APP_DIR, doc.href.slice(1), "page.tsx");
      expect(fs.existsSync(route), `${doc.href} -> ${route}`).toBe(true);
    }
  });

  it("links only to documents that are actually served", () => {
    for (const [href, file] of Object.entries(ACCEPTED)) {
      const route = fs.readFileSync(path.join(APP_DIR, href.slice(1), "page.tsx"), "utf8");
      expect(route, href).toContain(file);
    }
  });
});

describe("termsAcceptanceFields", () => {
  it("writes both columns together", () => {
    // One without the other leaves a row that cannot be interpreted: a timestamp with no
    // version says when, but not to what.
    const now = new Date("2026-10-22T17:30:00Z");
    expect(termsAcceptanceFields(now)).toEqual({
      termsAcceptedAt: now,
      termsAcceptedVersion: TERMS_VERSION,
    });
  });

  it("defaults to the current time rather than a fixed value", () => {
    const before = Date.now();
    const { termsAcceptedAt } = termsAcceptanceFields();
    expect(termsAcceptedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
