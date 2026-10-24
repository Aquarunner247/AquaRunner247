import { describe, expect, it } from "vitest";
import {
  emailConfirmationMatches,
  confirmationMatches,
  RETAINED_AFTER_PORTAL_DELETION,
} from "@/lib/account-deletion-confirm";

/**
 * The portal gate, and the line between the two kinds of deletion.
 *
 * An End Customer deleting their portal login must never be able to reach the pool company's
 * service records: under the DPA that company is the controller and AquaRunner is its
 * processor. The gates are separate functions for separate things, and these tests pin that
 * they stay separate as well as that each one works.
 */

const EMAIL = "pat@example.com";

describe("emailConfirmationMatches", () => {
  it("accepts the address as shown", () => {
    expect(emailConfirmationMatches(EMAIL, EMAIL)).toBe(true);
  });

  it("forgives case and surrounding space", () => {
    // Phone keyboards capitalise, and CustomerUser.email is stored lower-cased, so a
    // case-sensitive compare would reject somebody typing their own address.
    expect(emailConfirmationMatches("Pat@Example.com", EMAIL)).toBe(true);
    expect(emailConfirmationMatches("  pat@example.com  ", EMAIL)).toBe(true);
    expect(emailConfirmationMatches("PAT@EXAMPLE.COM", EMAIL)).toBe(true);
  });

  it("rejects a different address", () => {
    expect(emailConfirmationMatches("pat@example.org", EMAIL)).toBe(false);
    expect(emailConfirmationMatches("pat@example.co", EMAIL)).toBe(false);
    expect(emailConfirmationMatches("someone@else.com", EMAIL)).toBe(false);
  });

  it("rejects an empty box", () => {
    expect(emailConfirmationMatches("", EMAIL)).toBe(false);
    expect(emailConfirmationMatches("   ", EMAIL)).toBe(false);
  });

  it("fails closed when the stored address is missing", () => {
    // Otherwise an empty typed string would equal an empty target and delete the login.
    expect(emailConfirmationMatches("", null)).toBe(false);
    expect(emailConfirmationMatches("", "")).toBe(false);
    expect(emailConfirmationMatches("anything", null)).toBe(false);
  });

  it("does not collapse internal whitespace, unlike the organization gate", () => {
    // Deliberate difference: a business name can legitimately be pasted with a double space,
    // but an email address with a space in it is not that address.
    expect(emailConfirmationMatches("pat @example.com", EMAIL)).toBe(false);
    expect(confirmationMatches("Acme  Pools", "Acme Pools")).toBe(true);
  });
});

describe("the two gates stay separate", () => {
  it("an organization name does not unlock a portal login, or the reverse", () => {
    // The failure that would matter: one gate quietly accepting the other's secret, letting an
    // End Customer confirm something scoped to the pool company.
    expect(emailConfirmationMatches("Acme Pools", EMAIL)).toBe(false);
    expect(confirmationMatches(EMAIL, "Acme Pools")).toBe(false);
  });
});

describe("RETAINED_AFTER_PORTAL_DELETION", () => {
  it("names what the pool company keeps, so the portal copy cannot imply otherwise", () => {
    // Deleting a portal login removes the login and nothing else. If this sentence ever stops
    // naming the service records, the UI stops telling people where those records went.
    expect(RETAINED_AFTER_PORTAL_DELETION).toContain("service history");
    expect(RETAINED_AFTER_PORTAL_DELETION).toContain("inspection records");
    expect(RETAINED_AFTER_PORTAL_DELETION).toContain("documents");
  });
});
