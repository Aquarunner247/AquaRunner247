import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resolveFromAddress } from "@/lib/mail/from-address";

const ORIGINAL = process.env.RESEND_FROM_EMAIL;

describe("resolveFromAddress", () => {
  beforeEach(() => {
    process.env.RESEND_FROM_EMAIL = "service@mail.example.com";
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = ORIGINAL;
  });

  it("uses the platform name when no organization name is given", () => {
    expect(resolveFromAddress()).toBe('"AquaRunner 24/7" <service@mail.example.com>');
    expect(resolveFromAddress(null)).toBe('"AquaRunner 24/7" <service@mail.example.com>');
  });

  it("shows the organization's own name when it has one", () => {
    expect(resolveFromAddress("Lindley's Pool & Spa Service LLC")).toBe(
      '"Lindley\'s Pool & Spa Service LLC" <service@mail.example.com>',
    );
  });

  /**
   * The security-relevant case. The name is operator-entered and lands in a mail header, so a CR or
   * LF would let it inject headers of its own -- a Bcc, or a forged Reply-To.
   */
  it("strips newlines so a business name cannot inject headers", () => {
    const injected = resolveFromAddress("Acme Pools\r\nBcc: attacker@example.com");
    expect(injected).not.toContain("\r");
    expect(injected).not.toContain("\n");
    expect(injected).toBe('"Acme Pools Bcc: attacker@example.com" <service@mail.example.com>');
  });

  it("drops quotes and backslashes, which would otherwise break out of the quoted name", () => {
    expect(resolveFromAddress('Acme "Best" Pools')).toBe('"Acme Best Pools" <service@mail.example.com>');
    expect(resolveFromAddress('Acme\\Pools')).toBe('"AcmePools" <service@mail.example.com>');
  });

  it("keeps characters that only matter unquoted", () => {
    // An ampersand, apostrophe, comma and period are all fine inside a quoted string.
    expect(resolveFromAddress("Smith, Jones & Co. Pools")).toContain('"Smith, Jones & Co. Pools"');
  });

  it("collapses runs of whitespace rather than emitting them", () => {
    expect(resolveFromAddress("Acme    Pools\t\tLLC")).toBe('"Acme Pools LLC" <service@mail.example.com>');
  });

  it("caps an absurdly long name", () => {
    const name = resolveFromAddress("A".repeat(300));
    const shown = name.slice(1, name.indexOf('"', 1));
    expect(shown.length).toBe(78);
  });

  it("falls back to the platform name for a name that sanitizes to nothing", () => {
    expect(resolveFromAddress('   ""   ')).toBe('"AquaRunner 24/7" <service@mail.example.com>');
  });

  it("honours RESEND_FROM_EMAIL, and falls back to the verified sending subdomain", () => {
    process.env.RESEND_FROM_EMAIL = "hello@mail.other.com";
    expect(resolveFromAddress()).toContain("<hello@mail.other.com>");
    delete process.env.RESEND_FROM_EMAIL;
    // The fallback must stay on a Resend-verified domain -- an unverified one stops ALL mail.
    expect(resolveFromAddress()).toContain("<service@mail.aquarunner247.com>");
  });
});
