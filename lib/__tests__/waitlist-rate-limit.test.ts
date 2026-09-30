import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addressKey, clientAddress, WAITLIST_MAX_PER_WINDOW, WAITLIST_WINDOW_MS } from "@/lib/waitlist-rate-limit-keys";

function req(headers: Record<string, string>): Request {
  return new Request("https://aquarunner247.com/api/waitlist", { method: "POST", headers });
}

describe("clientAddress", () => {
  it("takes the leftmost x-forwarded-for entry", () => {
    // Vercel overwrites this header and puts the real client first; anything a caller appends
    // themselves lands to the right and must be ignored.
    expect(clientAddress(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientAddress(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }))).toBe("203.0.113.7");
  });

  it("ignores a spoofed entry appended after the real one", () => {
    expect(clientAddress(req({ "x-forwarded-for": "203.0.113.7, 127.0.0.1" }))).toBe("203.0.113.7");
  });

  it("trims whitespace", () => {
    expect(clientAddress(req({ "x-forwarded-for": "  203.0.113.7  , 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientAddress(req({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("returns null with no usable header, so nothing is limited rather than everything", () => {
    expect(clientAddress(req({}))).toBeNull();
    expect(clientAddress(req({ "x-forwarded-for": "" }))).toBeNull();
    expect(clientAddress(req({ "x-forwarded-for": "   " }))).toBeNull();
  });

  it("handles an IPv6 address", () => {
    expect(clientAddress(req({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" }))).toBe("2001:db8::1");
  });
});

describe("addressKey", () => {
  const ORIGINAL = process.env.WAITLIST_IP_SALT;
  beforeEach(() => {
    process.env.WAITLIST_IP_SALT = "test-salt";
  });
  // Restore so this file can't leak into another test's environment.
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.WAITLIST_IP_SALT;
    else process.env.WAITLIST_IP_SALT = ORIGINAL;
  });

  it("is stable for the same address", () => {
    expect(addressKey("203.0.113.7")).toBe(addressKey("203.0.113.7"));
  });

  it("differs between addresses", () => {
    expect(addressKey("203.0.113.7")).not.toBe(addressKey("203.0.113.8"));
  });

  it("never contains the address itself", () => {
    const key = addressKey("203.0.113.7");
    expect(key).not.toContain("203.0.113.7");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  /** The reason it is an HMAC and not a bare hash: IPv4 is ~4 billion values, so an unsalted digest
   *  is reversible by enumerating the space. Changing the salt must change the key. */
  it("depends on the salt", () => {
    const withTestSalt = addressKey("203.0.113.7");
    process.env.WAITLIST_IP_SALT = "a-different-salt";
    expect(addressKey("203.0.113.7")).not.toBe(withTestSalt);
  });
});

describe("limit configuration", () => {
  it("allows a real person several attempts but not a flood", () => {
    expect(WAITLIST_MAX_PER_WINDOW).toBeGreaterThanOrEqual(3);
    expect(WAITLIST_MAX_PER_WINDOW).toBeLessThanOrEqual(20);
    expect(WAITLIST_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});
