import { describe, it, expect } from "vitest";
import { isComplianceTier, userLimitFor, PLAN_TIER_USER_LIMITS } from "@/lib/plan-tiers-core";

describe("isComplianceTier", () => {
  it("is true only for the COMPLIANCE tier", () => {
    expect(isComplianceTier({ planStatus: "ACTIVE", planTier: "COMPLIANCE" })).toBe(true);
  });

  it("is false for every pool-service tier, including an untiered legacy org", () => {
    expect(isComplianceTier({ planStatus: "ACTIVE", planTier: "SERVICE" })).toBe(false);
    expect(isComplianceTier({ planStatus: "ACTIVE", planTier: "WHITE_LABEL" })).toBe(false);
    expect(isComplianceTier({ planStatus: "ACTIVE", planTier: "ENTERPRISE" })).toBe(false);
    expect(isComplianceTier({ planStatus: "ACTIVE", planTier: null })).toBe(false);
  });

  it("is still true for a COMPED Compliance org -- COMPED only waives billing, not which product the org is on", () => {
    expect(isComplianceTier({ planStatus: "COMPED", planTier: "COMPLIANCE" })).toBe(true);
  });
});

describe("userLimitFor", () => {
  it("matches the pricing page's per-tier seat counts", () => {
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "SERVICE" })).toBe(PLAN_TIER_USER_LIMITS.SERVICE);
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "WHITE_LABEL" })).toBe(PLAN_TIER_USER_LIMITS.WHITE_LABEL);
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "COMPLIANCE" })).toBe(2);
  });

  it("is unlimited for ENTERPRISE and for any COMPED org", () => {
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: "ENTERPRISE" })).toBeNull();
    expect(userLimitFor({ planStatus: "COMPED", planTier: "SERVICE" })).toBeNull();
  });

  it("falls back to the Service limit for an untiered org", () => {
    expect(userLimitFor({ planStatus: "ACTIVE", planTier: null })).toBe(PLAN_TIER_USER_LIMITS.SERVICE);
  });
});
