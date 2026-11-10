import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  TERMS_VERSION,
  TERMS_DOCUMENTS,
  termsAcceptanceFields,
  needsTermsAcceptance,
  canAcceptTerms,
} from "@/lib/terms-acceptance";

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
  // Added 2026-11-10. DPA Section 9.5 is the controller instruction relied on to retain
  // compliance records after cancellation, and it was not in this list before -- so that
  // instruction had never been given by any customer.
  "/dpa": "data-processing-addendum.md",
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

describe("needsTermsAcceptance", () => {
  it("prompts an organization that has never accepted anything", () => {
    // Every account created before 2026-10-22 is in this state and is deliberately not
    // backfilled -- a consent nobody gave is worse evidence than no consent at all.
    expect(needsTermsAcceptance({ termsAcceptedVersion: null })).toBe(true);
  });

  it("prompts an organization still on an earlier version", () => {
    expect(needsTermsAcceptance({ termsAcceptedVersion: "2026-10-25" })).toBe(true);
  });

  it("does not prompt an organization on the current version", () => {
    expect(needsTermsAcceptance({ termsAcceptedVersion: TERMS_VERSION })).toBe(false);
  });

  it("prompts on an unrecognized or future stored value rather than letting it pass", () => {
    // A rolled-back deploy, or a hand-edited row. Re-prompting is the safe direction; the
    // alternative is an organization silently treated as having accepted text that did not
    // exist when it clicked.
    expect(needsTermsAcceptance({ termsAcceptedVersion: "2099-01-01" })).toBe(true);
    expect(needsTermsAcceptance({ termsAcceptedVersion: "" })).toBe(true);
    expect(needsTermsAcceptance({ termsAcceptedVersion: "latest" })).toBe(true);
  });
});

describe("canAcceptTerms", () => {
  it("lets an ADMIN bind the organization", () => {
    expect(canAcceptTerms({ role: "ADMIN" })).toBe(true);
  });

  it("does not let anyone else", () => {
    // Not an authorization nicety: an acceptance clicked by a technician invites exactly the
    // apparent-authority argument the clickwrap exists to foreclose. It is also why the gate
    // lets non-admins keep working instead of holding them at a screen they cannot clear.
    for (const role of ["OFFICE", "TECHNICIAN"]) {
      expect(canAcceptTerms({ role }), role).toBe(false);
    }
  });
});

describe("the DPA is part of what is accepted", () => {
  it("is named in the notice", () => {
    // The permanent retention in DPA Section 9.5 rests on the customer's documented
    // instruction. A processor cannot rely on an instruction from a controller that never
    // agreed to give it, so dropping the DPA from this list would quietly remove the basis
    // for retaining compliance records at all.
    expect(TERMS_DOCUMENTS.map((d) => d.href)).toContain("/dpa");
  });

  it("is incorporated by the Terms of Service rather than left conditional", () => {
    const tos = fs.readFileSync(path.join(LEGAL_DIR, "terms-of-service.md"), "utf8");
    expect(tos).toContain("It applies to every Customer");
  });
});
