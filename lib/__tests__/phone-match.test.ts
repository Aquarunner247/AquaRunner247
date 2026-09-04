import { describe, it, expect } from "vitest";
import { normalizePhone, matchCallerToProperty, PROPERTY_PHONE_FIELDS, type PropertyPhoneCandidate } from "@/lib/phone-match";

describe("normalizePhone", () => {
  it("normalizes different formats of the same number to the same 10 digits", () => {
    const expected = "7025551234";
    expect(normalizePhone("(702) 555-1234")).toBe(expected);
    expect(normalizePhone("+17025551234")).toBe(expected);
    expect(normalizePhone("702.555.1234")).toBe(expected);
    expect(normalizePhone("7025551234")).toBe(expected);
  });

  it("returns null for input with fewer than 10 digits", () => {
    expect(normalizePhone("555-1234")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

function candidate(overrides: Partial<PropertyPhoneCandidate> & { id: string }): PropertyPhoneCandidate {
  const blank = Object.fromEntries(PROPERTY_PHONE_FIELDS.map((f) => [f, null])) as Record<
    (typeof PROPERTY_PHONE_FIELDS)[number],
    string | null
  >;
  return {
    name: "Test Property",
    customerId: null,
    customer: null,
    ...blank,
    ...overrides,
  };
}

describe("matchCallerToProperty", () => {
  it("matches on each phone field individually", () => {
    for (const field of PROPERTY_PHONE_FIELDS) {
      const candidates = [candidate({ id: "prop_1", [field]: "(702) 555-1234" })];
      const match = matchCallerToProperty("+17025551234", candidates);
      expect(match).not.toBeNull();
      expect(match?.propertyId).toBe("prop_1");
      expect(match?.matchedField).toBe(field);
    }
  });

  it("returns the customer name when the property has one", () => {
    const candidates = [candidate({ id: "prop_1", ownerMobilePhone: "(702) 555-1234", customerId: "cust_1", customer: { name: "Jane Doe" } })];
    const match = matchCallerToProperty("+17025551234", candidates);
    expect(match?.customerId).toBe("cust_1");
    expect(match?.customerName).toBe("Jane Doe");
  });

  it("returns null when no candidate matches", () => {
    const candidates = [candidate({ id: "prop_1", ownerMobilePhone: "702-555-9999" })];
    expect(matchCallerToProperty("+17025551234", candidates)).toBeNull();
  });

  it("returns null for an unparseable caller number even with matching candidates", () => {
    const candidates = [candidate({ id: "prop_1", ownerMobilePhone: "5551234" })];
    expect(matchCallerToProperty("5551234", candidates)).toBeNull();
  });

  it("returns the first match, deterministically, when two properties share a number", () => {
    const candidates = [
      candidate({ id: "prop_1", ownerMobilePhone: "(702) 555-1234" }),
      candidate({ id: "prop_2", ownerMobilePhone: "(702) 555-1234" }),
    ];
    expect(matchCallerToProperty("+17025551234", candidates)?.propertyId).toBe("prop_1");
  });
});
