import { describe, expect, it } from "vitest";
import { isMarketingRoute } from "../marketing-routes";

describe("isMarketingRoute", () => {
  it("covers every page the marketing site actually has", () => {
    for (const path of ["/", "/pricing", "/features", "/for-property-managers", "/privacy", "/terms"]) {
      expect(isMarketingRoute(path), path).toBe(true);
    }
  });

  it("covers nested paths under a marketing page", () => {
    expect(isMarketingRoute("/features/compliance")).toBe(true);
  });

  it("leaves the app, the portal, and the CPO product alone", () => {
    for (const path of ["/dashboard", "/dashboard/customers/1", "/login", "/portal/log", "/cpo/log", "/signup"]) {
      expect(isMarketingRoute(path), path).toBe(false);
    }
  });

  it("does not match a route that merely starts with a marketing path's name", () => {
    // /pricing-admin is not /pricing; the old startsWith("/pricing") check would have swallowed it.
    expect(isMarketingRoute("/pricing-admin")).toBe(false);
    expect(isMarketingRoute("/termsheet")).toBe(false);
  });
});
