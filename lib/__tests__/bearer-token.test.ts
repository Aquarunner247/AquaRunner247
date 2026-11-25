import { describe, expect, it } from "vitest";
import { bearerTokenFrom } from "@/lib/auth/bearer-token";

/**
 * The rule these all serve: a token is unambiguously present or unambiguously absent. Anything
 * in between returns null and the caller falls through to cookie auth, because a half-understood
 * credential is the one thing an auth path must never act on.
 */
describe("bearerTokenFrom", () => {
  it("reads the ordinary form", () => {
    expect(bearerTokenFrom("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("matches the scheme case-insensitively, as RFC 7235 requires", () => {
    expect(bearerTokenFrom("bearer abc")).toBe("abc");
    expect(bearerTokenFrom("BEARER abc")).toBe("abc");
    expect(bearerTokenFrom("BeArEr abc")).toBe("abc");
  });

  it("tolerates untidy whitespace rather than rejecting a valid token over formatting", () => {
    expect(bearerTokenFrom("  Bearer   abc  ")).toBe("abc");
    expect(bearerTokenFrom("Bearer\tabc")).toBe("abc");
  });

  it("returns null for an absent or empty header", () => {
    expect(bearerTokenFrom(null)).toBeNull();
    expect(bearerTokenFrom(undefined)).toBeNull();
    expect(bearerTokenFrom("")).toBeNull();
    expect(bearerTokenFrom("   ")).toBeNull();
  });

  it("returns null for another scheme, so Basic auth is never read as a token", () => {
    expect(bearerTokenFrom("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerTokenFrom("Digest abc")).toBeNull();
  });

  it("returns null for a scheme with no token", () => {
    expect(bearerTokenFrom("Bearer")).toBeNull();
    expect(bearerTokenFrom("Bearer ")).toBeNull();
    expect(bearerTokenFrom("Bearer    ")).toBeNull();
  });

  it("returns null for a bare token with no scheme", () => {
    // Guessing that a lone string is a JWT would mean accepting credentials in a shape the
    // client never agreed to send.
    expect(bearerTokenFrom("abc.def.ghi")).toBeNull();
  });

  it("returns null when the token itself contains whitespace", () => {
    // `Bearer abc def` is malformed. Picking a half would be a guess about which was meant.
    expect(bearerTokenFrom("Bearer abc def")).toBeNull();
  });
});
