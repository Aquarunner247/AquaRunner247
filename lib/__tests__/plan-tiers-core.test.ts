import { describe, it, expect } from "vitest";
import {
  allowsExtraSeats,
  billableSeatsFor,
  hardSeatCapFor,
  hasWhiteLabelBranding,
  includedSeatsFor,
  isComplianceTier,
  outcomeOfAddingSeat,
  PLAN_TIER_INCLUDED_SEATS,
} from "@/lib/plan-tiers-core";

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

describe("includedSeatsFor", () => {
  it("matches the pricing page's per-tier included seats", () => {
    expect(includedSeatsFor({ planStatus: "ACTIVE", planTier: "SERVICE" })).toBe(PLAN_TIER_INCLUDED_SEATS.SERVICE);
    expect(includedSeatsFor({ planStatus: "ACTIVE", planTier: "WHITE_LABEL" })).toBe(PLAN_TIER_INCLUDED_SEATS.WHITE_LABEL);
    expect(includedSeatsFor({ planStatus: "ACTIVE", planTier: "COMPLIANCE" })).toBe(2);
  });

  it("is unlimited for ENTERPRISE and for any COMPED org", () => {
    expect(includedSeatsFor({ planStatus: "ACTIVE", planTier: "ENTERPRISE" })).toBeNull();
    expect(includedSeatsFor({ planStatus: "COMPED", planTier: "SERVICE" })).toBeNull();
  });

  it("falls back to Service for an untiered org", () => {
    expect(includedSeatsFor({ planStatus: "ACTIVE", planTier: null })).toBe(PLAN_TIER_INCLUDED_SEATS.SERVICE);
  });
});

describe("hardSeatCapFor", () => {
  it("is a wall only on Compliance, where extra seats are not sold", () => {
    expect(hardSeatCapFor({ planStatus: "ACTIVE", planTier: "COMPLIANCE" })).toBe(2);
  });

  it("is null on every pool-service tier -- going past the included count bills, it does not block", () => {
    expect(hardSeatCapFor({ planStatus: "ACTIVE", planTier: "SERVICE" })).toBeNull();
    expect(hardSeatCapFor({ planStatus: "ACTIVE", planTier: "WHITE_LABEL" })).toBeNull();
    expect(hardSeatCapFor({ planStatus: "ACTIVE", planTier: "ENTERPRISE" })).toBeNull();
    expect(hardSeatCapFor({ planStatus: "ACTIVE", planTier: null })).toBeNull();
  });

  it("is waived for a COMPED Compliance org, like every other billing rule", () => {
    expect(hardSeatCapFor({ planStatus: "COMPED", planTier: "COMPLIANCE" })).toBeNull();
  });
});

describe("allowsExtraSeats", () => {
  it("is true for the pool-service tiers that have an included count to exceed", () => {
    expect(allowsExtraSeats({ planStatus: "ACTIVE", planTier: "SERVICE" })).toBe(true);
    expect(allowsExtraSeats({ planStatus: "ACTIVE", planTier: "WHITE_LABEL" })).toBe(true);
  });

  it("is false for Compliance (walled) and for the unlimited tiers (nothing to buy)", () => {
    expect(allowsExtraSeats({ planStatus: "ACTIVE", planTier: "COMPLIANCE" })).toBe(false);
    expect(allowsExtraSeats({ planStatus: "ACTIVE", planTier: "ENTERPRISE" })).toBe(false);
    expect(allowsExtraSeats({ planStatus: "COMPED", planTier: "SERVICE" })).toBe(false);
  });
});

describe("billableSeatsFor", () => {
  const service = { planStatus: "ACTIVE", planTier: "SERVICE" } as const;

  it("is zero while headcount is at or under the included count", () => {
    expect(billableSeatsFor(service, 0)).toBe(0);
    expect(billableSeatsFor(service, 3)).toBe(0);
  });

  it("counts only the staff past the included count", () => {
    expect(billableSeatsFor(service, 4)).toBe(1);
    expect(billableSeatsFor(service, 7)).toBe(4);
  });

  it("is zero for unlimited orgs no matter the headcount", () => {
    expect(billableSeatsFor({ planStatus: "ACTIVE", planTier: "ENTERPRISE" }, 40)).toBe(0);
    expect(billableSeatsFor({ planStatus: "COMPED", planTier: "SERVICE" }, 40)).toBe(0);
  });

  it("never goes negative when an org drops below its included count", () => {
    expect(billableSeatsFor(service, 1)).toBe(0);
  });
});

describe("outcomeOfAddingSeat", () => {
  const service = { planStatus: "ACTIVE", planTier: "SERVICE" } as const;

  it("is included up to the bundled count, then billable", () => {
    expect(outcomeOfAddingSeat(service, 2)).toBe("included");
    expect(outcomeOfAddingSeat(service, 3)).toBe("billable");
    expect(outcomeOfAddingSeat(service, 9)).toBe("billable");
  });

  it("blocks Compliance at its wall instead of selling a seat", () => {
    expect(outcomeOfAddingSeat({ planStatus: "ACTIVE", planTier: "COMPLIANCE" }, 1)).toBe("included");
    expect(outcomeOfAddingSeat({ planStatus: "ACTIVE", planTier: "COMPLIANCE" }, 2)).toBe("blocked");
  });

  it("never charges or blocks an unlimited org", () => {
    expect(outcomeOfAddingSeat({ planStatus: "ACTIVE", planTier: "ENTERPRISE" }, 99)).toBe("included");
    expect(outcomeOfAddingSeat({ planStatus: "COMPED", planTier: "SERVICE" }, 99)).toBe("included");
  });

  it("treats an untiered org as Service rather than as unlimited", () => {
    expect(outcomeOfAddingSeat({ planStatus: "ACTIVE", planTier: null }, 3)).toBe("billable");
  });
});

describe("hasWhiteLabelBranding", () => {
  it("is true for the tiers whose pricing card includes branding", () => {
    expect(hasWhiteLabelBranding({ planStatus: "ACTIVE", planTier: "WHITE_LABEL" })).toBe(true);
    expect(hasWhiteLabelBranding({ planStatus: "ACTIVE", planTier: "ENTERPRISE" })).toBe(true);
  });

  it("is false for Service -- branding is the whole reason to upgrade", () => {
    expect(hasWhiteLabelBranding({ planStatus: "ACTIVE", planTier: "SERVICE" })).toBe(false);
  });

  it("is false for Compliance and for an untiered legacy org", () => {
    expect(hasWhiteLabelBranding({ planStatus: "ACTIVE", planTier: "COMPLIANCE" })).toBe(false);
    expect(hasWhiteLabelBranding({ planStatus: "ACTIVE", planTier: null })).toBe(false);
  });

  it("is true for any COMPED org, matching how the seat rules treat them", () => {
    expect(hasWhiteLabelBranding({ planStatus: "COMPED", planTier: null })).toBe(true);
    expect(hasWhiteLabelBranding({ planStatus: "COMPED", planTier: "SERVICE" })).toBe(true);
  });
});
