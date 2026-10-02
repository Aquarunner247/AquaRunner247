import { describe, expect, it } from "vitest";
import { resolveFromAddress } from "@/lib/mail/from-address";

describe("resolveFromAddress", () => {

  it("uses the platform name when no organization name is given", () => {
    expect(resolveFromAddress()).toBe('"AquaRunner 24/7" <service@mail.aquarunner247.com>');
    expect(resolveFromAddress(null)).toBe('"AquaRunner 24/7" <service@mail.aquarunner247.com>');
  });

  it("shows the organization's own name when it has one", () => {
    expect(resolveFromAddress("Lindley's Pool & Spa Service LLC")).toBe(
      '"Lindley\'s Pool & Spa Service LLC" <service@mail.aquarunner247.com>',
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
    expect(injected).toBe('"Acme Pools Bcc: attacker@example.com" <service@mail.aquarunner247.com>');
  });

  it("drops quotes and backslashes, which would otherwise break out of the quoted name", () => {
    expect(resolveFromAddress('Acme "Best" Pools')).toBe('"Acme Best Pools" <service@mail.aquarunner247.com>');
    expect(resolveFromAddress('Acme\\Pools')).toBe('"AcmePools" <service@mail.aquarunner247.com>');
  });

  it("keeps characters that only matter unquoted", () => {
    // An ampersand, apostrophe, comma and period are all fine inside a quoted string.
    expect(resolveFromAddress("Smith, Jones & Co. Pools")).toContain('"Smith, Jones & Co. Pools"');
  });

  it("collapses runs of whitespace rather than emitting them", () => {
    expect(resolveFromAddress("Acme    Pools\t\tLLC")).toBe('"Acme Pools LLC" <service@mail.aquarunner247.com>');
  });

  it("caps an absurdly long name", () => {
    const name = resolveFromAddress("A".repeat(300));
    const shown = name.slice(1, name.indexOf('"', 1));
    expect(shown.length).toBe(78);
  });

  it("falls back to the platform name for a name that sanitizes to nothing", () => {
    expect(resolveFromAddress('   ""   ')).toBe('"AquaRunner 24/7" <service@mail.aquarunner247.com>');
  });

  /**
   * The regression this pins: a service summary went out as no-reply@ hours after the switch to
   * service@, because Vercel bakes environment variables into a deployment and that build still
   * carried a stale RESEND_FROM_EMAIL. Nothing may override the address now -- setting that variable
   * must have no effect at all.
   */
  it("ignores RESEND_FROM_EMAIL entirely", () => {
    const original = process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_FROM_EMAIL = "no-reply@mail.aquarunner247.com";
    try {
      expect(resolveFromAddress()).toContain("<service@mail.aquarunner247.com>");
      expect(resolveFromAddress("Lindley's Pool & Spa Service")).toContain("<service@mail.aquarunner247.com>");
      expect(resolveFromAddress()).not.toContain("no-reply");
    } finally {
      if (original === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = original;
    }
  });

  // Must stay a mailbox on the Resend-verified sending subdomain -- an unverified domain stops ALL mail.
  it("sends from the verified sending subdomain", () => {
    expect(resolveFromAddress()).toContain("<service@mail.aquarunner247.com>");
  });
});
