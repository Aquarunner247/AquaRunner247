import { describe, expect, it } from "vitest";
import { propertyContactEmail, propertyReportEmail } from "@/lib/property-contact";

describe("propertyContactEmail", () => {
  it("uses ownerEmail for a residential property", () => {
    expect(propertyContactEmail({ propertyType: "RESIDENTIAL", ownerEmail: "owner@example.com" })).toBe("owner@example.com");
  });

  it("uses managerEmail for a commercial property", () => {
    expect(propertyContactEmail({ propertyType: "COMMERCIAL", managerEmail: "mgr@example.com" })).toBe("mgr@example.com");
  });

  it("prefers owner over manager when residential has both", () => {
    expect(
      propertyContactEmail({ propertyType: "RESIDENTIAL", ownerEmail: "owner@example.com", managerEmail: "mgr@example.com" }),
    ).toBe("owner@example.com");
  });

  it("prefers manager over owner when commercial has both", () => {
    expect(
      propertyContactEmail({ propertyType: "COMMERCIAL", ownerEmail: "owner@example.com", managerEmail: "mgr@example.com" }),
    ).toBe("mgr@example.com");
  });

  it("falls back across fields rather than going silent", () => {
    // An address in the 'wrong' box is still the customer's address.
    expect(propertyContactEmail({ propertyType: "RESIDENTIAL", managerEmail: "mgr@example.com" })).toBe("mgr@example.com");
    expect(propertyContactEmail({ propertyType: "COMMERCIAL", ownerEmail: "owner@example.com" })).toBe("owner@example.com");
  });

  it("is null when there is genuinely no address", () => {
    expect(propertyContactEmail({ propertyType: "RESIDENTIAL" })).toBeNull();
    expect(propertyContactEmail({ propertyType: "COMMERCIAL", managerEmail: null, ownerEmail: null })).toBeNull();
  });

  it("treats whitespace as absent", () => {
    expect(propertyContactEmail({ propertyType: "RESIDENTIAL", ownerEmail: "   ", managerEmail: "mgr@example.com" })).toBe(
      "mgr@example.com",
    );
  });

  it("defaults to the commercial rule for an unknown or missing type", () => {
    expect(propertyContactEmail({ managerEmail: "mgr@example.com" })).toBe("mgr@example.com");
  });
});

describe("propertyReportEmail", () => {
  it("prefers reportEmail over the commercial manager contact", () => {
    expect(
      propertyReportEmail({
        propertyType: "COMMERCIAL",
        reportEmail: "maint@sunridge.org",
        managerEmail: "mgr@hoa-mgmt.com",
      }),
    ).toBe("maint@sunridge.org");
  });

  it("prefers reportEmail over the residential owner contact", () => {
    expect(
      propertyReportEmail({
        propertyType: "RESIDENTIAL",
        reportEmail: "tenant@example.com",
        ownerEmail: "owner@example.com",
      }),
    ).toBe("tenant@example.com");
  });

  it("falls back to the contact blocks when reportEmail is unset", () => {
    // The state of every row that existed before the column did, so this is the no-change case.
    expect(propertyReportEmail({ propertyType: "COMMERCIAL", managerEmail: "mgr@example.com" })).toBe(
      "mgr@example.com",
    );
    expect(
      propertyReportEmail({ propertyType: "RESIDENTIAL", ownerEmail: "owner@example.com", reportEmail: null }),
    ).toBe("owner@example.com");
  });

  it("falls back when reportEmail is only whitespace", () => {
    expect(propertyReportEmail({ propertyType: "COMMERCIAL", reportEmail: "   ", managerEmail: "mgr@example.com" })).toBe(
      "mgr@example.com",
    );
  });

  it("does not invent a recipient when nothing is set", () => {
    expect(propertyReportEmail({ propertyType: "COMMERCIAL" })).toBeNull();
  });

  it("is undefined-safe, which is what an omitted Prisma select produces", () => {
    // The trap this guards: a sender that selects managerEmail but forgets reportEmail gets
    // undefined back, which must read as "not set" rather than throwing mid-send.
    expect(propertyReportEmail({ propertyType: "COMMERCIAL", managerEmail: "mgr@example.com" })).toBe(
      "mgr@example.com",
    );
  });

  it("overrides outright rather than adding a second recipient", () => {
    // Deliberate: an admin who routes reports away from the manager has not asked for the
    // manager to keep receiving them. Widening to several recipients is a separate feature.
    const resolved = propertyReportEmail({
      propertyType: "COMMERCIAL",
      reportEmail: "maint@sunridge.org",
      managerEmail: "mgr@hoa-mgmt.com",
      ownerEmail: "owner@example.com",
    });
    expect(resolved).toBe("maint@sunridge.org");
    expect(resolved).not.toContain("mgr@hoa-mgmt.com");
  });
});
