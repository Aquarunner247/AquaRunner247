import { describe, it, expect } from "vitest";
import { canLogReadings, canOpenPortalPath, portalHomePath, PORTAL_LOG_PATH } from "@/lib/portal-access";

describe("portal access for a maintenance login", () => {
  it("may log readings, where a customer login may not", () => {
    expect(canLogReadings("MAINTENANCE")).toBe(true);
    expect(canLogReadings("CUSTOMER")).toBe(false);
  });

  it("lands on the log, not the dashboard", () => {
    expect(portalHomePath("MAINTENANCE")).toBe(PORTAL_LOG_PATH);
    expect(portalHomePath("CUSTOMER")).toBe("/portal");
  });

  it("opens the log and the chemical safety data sheets", () => {
    expect(canOpenPortalPath("MAINTENANCE", "/portal/log")).toBe(true);
    expect(canOpenPortalPath("MAINTENANCE", "/portal/chemicals")).toBe(true);
  });

  it("opens a page nested under one it is allowed", () => {
    expect(canOpenPortalPath("MAINTENANCE", "/portal/log/abc123")).toBe(true);
  });

  it("is kept out of the rest of the customer's portal", () => {
    for (const path of ["/portal", "/portal/documents", "/portal/alerts", "/portal/compliance", "/portal/reports"]) {
      expect(canOpenPortalPath("MAINTENANCE", path)).toBe(false);
    }
  });

  /** Prefix matching must not be substring matching, or a future page gets in by sharing a name. */
  it("is not fooled by a path that merely starts with an allowed one", () => {
    expect(canOpenPortalPath("MAINTENANCE", "/portal/chemicals-pricing")).toBe(false);
    expect(canOpenPortalPath("MAINTENANCE", "/portal/logbook")).toBe(false);
  });

  it("does not restrict a customer login at all", () => {
    for (const path of ["/portal", "/portal/documents", "/portal/log", "/portal/anything"]) {
      expect(canOpenPortalPath("CUSTOMER", path)).toBe(true);
    }
  });
});
