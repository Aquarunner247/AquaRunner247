import { describe, expect, it } from "vitest";
import { propertyContactEmail } from "@/lib/property-contact";

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
