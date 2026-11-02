import { describe, expect, it } from "vitest";
import { organizationJsonLd, softwareApplicationJsonLd, jsonLdScriptContent } from "@/lib/structured-data";

describe("structured data", () => {
  it("never claims ratings or reviews", () => {
    // Fabricated stars are both dishonest and a documented route to a Google manual action.
    for (const node of [organizationJsonLd(), softwareApplicationJsonLd()] as Record<string, unknown>[]) {
      expect(node.aggregateRating).toBeUndefined();
      expect(node.review).toBeUndefined();
    }
  });

  it("never states a price, which would be a second place for it to drift", () => {
    const app = softwareApplicationJsonLd() as Record<string, unknown>;
    expect(app.offers).toBeUndefined();
    expect(JSON.stringify(app)).not.toMatch(/\$|price/i);
  });

  it("uses the legal entity and its notice address, not a marketing name", () => {
    const org = organizationJsonLd();
    expect(org.name).toBe("AquaRunner247 LLC");
    expect(org.address.addressLocality).toBe("Las Vegas");
    expect(org.address.postalCode).toBe("89101");
  });

  it("describes itself as business software, matching the store listing and the EULA", () => {
    expect(softwareApplicationJsonLd().applicationCategory).toBe("BusinessApplication");
  });

  it("escapes < so a payload can never close the script tag early", () => {
    expect(jsonLdScriptContent({ x: "</script><img onerror=1>" })).not.toContain("</script>");
    expect(jsonLdScriptContent({ x: "</script>" })).toContain("\\u003c");
  });

  it("round-trips as valid JSON", () => {
    expect(() => JSON.parse(jsonLdScriptContent(organizationJsonLd()))).not.toThrow();
  });
});
