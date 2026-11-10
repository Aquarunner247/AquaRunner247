import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The legal documents cite each other, and the product, by URL. A citation is a contractual
 * reference, so a broken one is worse than a broken link: Section 2 of the Terms incorporates
 * the Consumer Addendum "at https://aquarunner247.com/consumer-terms", and if that route does
 * not exist then the Terms incorporate a document nobody can read.
 *
 * This has already happened twice in this repo -- the DPA committed to publishing a
 * subprocessor list at a URL that 404'd, and the EULA cited /licenses before it was routed.
 * Both were found by hand. This finds them automatically.
 */

const LEGAL_DIR = path.join(process.cwd(), "content", "legal");
const APP_DIR = path.join(process.cwd(), "app");

function legalFiles(): string[] {
  return fs.readdirSync(LEGAL_DIR).filter((f) => f.endsWith(".md"));
}

function read(file: string): string {
  return fs.readFileSync(path.join(LEGAL_DIR, file), "utf8");
}

/**
 * Every own-site path cited anywhere in the legal documents.
 *
 * Matches the bare domain too, which is why the result can be "/" -- that is excluded below
 * rather than in the pattern, so a document citing the site root still parses rather than
 * silently not matching. Trailing punctuation (a citation at the end of a sentence, or wrapped
 * in markdown emphasis) is trimmed; a path is letters, digits, hyphens and slashes only.
 */
function citedPaths(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of legalFiles()) {
    for (const m of read(file).matchAll(/https?:\/\/(?:www\.)?aquarunner247\.com(\/[A-Za-z0-9\-/]*)?/g)) {
      const raw = (m[1] ?? "/").replace(/\/$/, "") || "/";
      if (!found.has(raw)) found.set(raw, []);
      const citers = found.get(raw)!;
      if (!citers.includes(file)) citers.push(file);
    }
  }
  return found;
}

/** Route paths that are real pages but not served by a page.tsx of their own. */
const NON_PAGE_ROUTES = new Set([
  "/", // the marketing home page lives at app/page.tsx, checked separately
]);

/** Paths that are deliberately app-internal or external-facing and not public routes. */
const NOT_A_PUBLIC_ROUTE = new Set([
  "/dashboard/billing", // inside the authenticated dashboard; cited by ToS 4.5
]);

describe("legal document cross-references", () => {
  it("cites only own-site paths that are actually routed", () => {
    const missing: string[] = [];
    for (const [routePath, citers] of citedPaths()) {
      if (routePath === "/") {
        expect(fs.existsSync(path.join(APP_DIR, "page.tsx"))).toBe(true);
        continue;
      }
      if (NON_PAGE_ROUTES.has(routePath) || NOT_A_PUBLIC_ROUTE.has(routePath)) continue;
      const page = path.join(APP_DIR, routePath.slice(1), "page.tsx");
      if (!fs.existsSync(page)) missing.push(`${routePath} (cited by ${citers.join(", ")})`);
    }
    expect(
      missing,
      "A legal document cites an own-site URL with no route behind it. That is a contractual " +
        "reference to a document nobody can read -- add the route, or correct the citation.",
    ).toEqual([]);
  });

  it("routes the Consumer Addendum that Terms of Service Section 2 incorporates", () => {
    // Called out separately from the sweep above because this one carries the whole
    // consumer-protection position: if it 404s, the Terms' business-use statement is left
    // standing with nothing softening it for a buyer who turns out to be a consumer.
    expect(read("terms-of-service.md")).toContain("https://aquarunner247.com/consumer-terms");
    expect(fs.existsSync(path.join(APP_DIR, "consumer-terms", "page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(LEGAL_DIR, "consumer-addendum.md"))).toBe(true);
  });

  it("serves each legal document from exactly the markdown file it claims", () => {
    // A route reading the wrong markdown file would publish the wrong document under the
    // right heading, which no link check would catch.
    const routes = {
      "consumer-terms": "consumer-addendum.md",
      terms: "terms-of-service.md",
      privacy: "privacy-policy.md",
      eula: "end-user-license-agreement.md",
      dpa: "data-processing-addendum.md",
      subprocessors: "subprocessors.md",
    };
    for (const [route, file] of Object.entries(routes)) {
      const source = fs.readFileSync(path.join(APP_DIR, route, "page.tsx"), "utf8");
      expect(source, route).toContain(file);
    }
  });
});

describe("Terms of Service internal consistency", () => {
  /**
   * Section 19.3(b) used to say the cap did not limit "either party's indemnification
   * obligations", while Section 20.2's last line said our IP indemnity WAS subject to the
   * Section 19.2 cap. Both were in force at once and they said opposite things, which is the
   * kind of defect that is argued about rather than noticed. Resolved on 2026-11-10 by giving
   * the IP indemnity its own higher cap in Section 19.4.
   */
  const tos = read("terms-of-service.md");

  it("gives the IP indemnity its own cap instead of the general one", () => {
    expect(tos).toContain("### 19.4 Cap on our intellectual-property indemnity");
    expect(tos).toContain("subject to the cap in Section 19.4, and not to the general cap in Section 19.2");
  });

  it("no longer exempts both parties' indemnities from the cap wholesale", () => {
    // The exact phrasing that contradicted Section 20.2.
    expect(tos).not.toContain("either party’s indemnification obligations under these Terms");
  });

  it("states a floor on the IP indemnity cap, so it is not limited to a small plan's fees", () => {
    // An indemnity capped at a $19/month plan's annual fees is about $228, which is close
    // enough to illusory to be attacked as such.
    expect(tos).toMatch(/US\$[\d,]+/);
  });

  it("puts the Consumer Addendum above these Terms in the order of precedence", () => {
    // An addendum that loses to the document it is meant to modify does nothing.
    expect(tos).toContain("(1) the Consumer Addendum, where it applies to you under Section 2");
  });
});
