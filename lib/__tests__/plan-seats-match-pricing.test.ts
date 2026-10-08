import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { EXTRA_SEAT_PRICE_USD, PLAN_TIER_INCLUDED_SEATS } from "../plan-tiers-core";

/**
 * The seat numbers are enforced in app/dashboard/users/actions.ts and advertised in
 * app/pricing/page.tsx, and nothing used to stop the two drifting. Selling 5 included seats
 * while the app starts charging at 3 is a support ticket; selling a $15 seat while the app
 * bills a different number is a chargeback.
 */
describe("the advertised seat terms", () => {
  const pricing = fs.readFileSync(path.join(process.cwd(), "app", "pricing", "page.tsx"), "utf8");
  const advertised = [...pricing.matchAll(/(\d+) staff logins included, then \$(\d+)\/month each/g)].map((m) => ({
    included: Number(m[1]),
    seatPrice: Number(m[2]),
  }));

  it("states the included count for each capped plan, in card order", () => {
    expect(advertised.map((a) => a.included)).toEqual([
      PLAN_TIER_INCLUDED_SEATS.SERVICE,
      PLAN_TIER_INCLUDED_SEATS.WHITE_LABEL,
    ]);
  });

  it("quotes the same extra-seat price the app charges, on every card that mentions one", () => {
    expect(advertised.length).toBeGreaterThan(0);
    for (const { seatPrice } of advertised) {
      expect(seatPrice).toBe(EXTRA_SEAT_PRICE_USD);
    }
  });

  it("never includes more seats on the cheaper plan than on the dearer one", () => {
    expect(PLAN_TIER_INCLUDED_SEATS.SERVICE!).toBeLessThan(PLAN_TIER_INCLUDED_SEATS.WHITE_LABEL!);
  });

  it("still describes Enterprise as uncapped, matching a null included count", () => {
    expect(PLAN_TIER_INCLUDED_SEATS.ENTERPRISE).toBeNull();
    expect(pricing).toContain("Unlimited staff logins");
  });
});
