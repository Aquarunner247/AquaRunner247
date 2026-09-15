import { describe, it, expect } from "vitest";
import { hasProAccess, userLimitFor, PLAN_TIER_USER_LIMITS } from "@/lib/plan-tiers-core";

describe("hasProAccess", () => {
  it("grants Pro access to SOLO, PRO, and ENTERPRISE tiers", () => {
    expect(hasProAccess({ planStatus: "ACTIVE", planTier: "SOLO" })).toBe(true);
    expect(hasProAccess({ planStatus: "ACTIVE", planTier: "PRO" })).toBe(true);
    expect(hasProAccess({ planStatus: "ACTIVE", planTier: "ENTERPRISE" })).toBe(true);
  });

  it("withholds Pro access from STARTER -- the one tier meant to sit below it", () => {
    expect(hasProAccess({ planStatus: "ACTIVE", planTier: "STARTER" })).toBe(false);
  });

  it("withholds Pro access from a non-comped COMPLIANCE org", () => {
    expect(hasProAccess({ planStatus: "ACTIVE", planTier: "COMPLIANCE" })).toBe(false);
  });

  it("COMPED bypasses the tier check entirely, even with no tier set", () => {
    expect(hasProAccess({ planStatus: "COMPED", planTier: null })).toBe(true);
    expect(hasProAccess({ planStatus: "COMPED", planTier: "STARTER" })).toBe(true);
  });

  it("withholds access from a plain ACTIVE org with no tier", () => {
    expect(hasProAccess({ planStatus: "ACTIVE", planTier: null })).toBe(false);
  });
});

describe("userLimitFor", () => {
  it("matches the pricing page's per-tier seat counts", () => {
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "SOLO" })).toBe(1);
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "STARTER" })).toBe(5);
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "PRO" })).toBe(10);
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "COMPLIANCE" })).toBe(2);
  });

  it("is unlimited for ENTERPRISE and for any COMPED org", () => {
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "ENTERPRISE" })).toBeNull();
    expect(userLimitFor({ planStatus: "COMPED", planTier: "STARTER" })).toBeNull();
  });

  it("falls back to the Starter limit for an untiered org", () => {
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: null })).toBe(PLAN_TIER_USER_LIMITS.STARTER);
  });
});
