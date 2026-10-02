import { describe, it, expect } from "vitest";
import { buildActivationUrl, confirmFailurePath } from "@/lib/auth/activation-link";

describe("buildActivationUrl", () => {
  it("points at this app's confirm route, not Supabase's verify endpoint", () => {
    const url = buildActivationUrl("https://app.example.com", "abc123");
    expect(url.startsWith("https://app.example.com/auth/confirm?")).toBe(true);
  });

  it("carries the token hash, the type, and where to land afterwards", () => {
    const parsed = new URL(buildActivationUrl("https://app.example.com", "abc123"));
    expect(parsed.searchParams.get("token_hash")).toBe("abc123");
    expect(parsed.searchParams.get("type")).toBe("recovery");
    expect(parsed.searchParams.get("next")).toBe("/reset-password?portal=1");
  });

  /** A token hash is opaque and may contain characters that would otherwise end the query string. */
  it("escapes a token containing url-significant characters", () => {
    const parsed = new URL(buildActivationUrl("https://app.example.com", "a+b/c=d&e"));
    expect(parsed.searchParams.get("token_hash")).toBe("a+b/c=d&e");
  });
});

describe("confirmFailurePath", () => {
  /** The bug this is all about: a customer must never be handed to the staff login or the staff reset. */
  it("keeps a portal customer in the portal", () => {
    expect(confirmFailurePath("/reset-password?portal=1")).toBe("/portal/login?error=link-expired");
    expect(confirmFailurePath("/portal/log")).toBe("/portal/login?error=link-expired");
  });

  it("sends a staff user to the staff reset", () => {
    expect(confirmFailurePath("/reset-password")).toBe("/forgot-password?error=expired");
    expect(confirmFailurePath("/dashboard")).toBe("/forgot-password?error=expired");
  });
});
