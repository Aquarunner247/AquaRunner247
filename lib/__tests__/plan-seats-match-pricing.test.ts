import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { PLAN_TIER_USER_LIMITS } from "../plan-tiers-core";

/**
 * PLAN_TIER_USER_LIMITS says in its own doc comment that it matches the pricing cards, but nothing
 * made that true -- the seat counts are enforced in app/dashboard/users/actions.ts and advertised in
 * app/pricing/page.tsx, and the two could drift silently. Selling 5 seats while the app stops a
 * customer at 3 is a support ticket; selling 3 while the app allows 5 is money left on the table.
 */
describe("the advertised seat counts", () => {
  const pricing = fs.readFileSync(path.join(process.cwd(), "app", "pricing", "page.tsx"), "utf8");
  const advertised = [...pricing.matchAll(/Up to (\d+) staff logins/g)].map((m) => Number(m[1]));

  it("appears once per capped plan, in card order", () => {
    // Service then White Label. Enterprise says "Unlimited staff logins" and has no number.
    expect(advertised).toEqual([PLAN_TIER_USER_LIMITS.SERVICE, PLAN_TIER_USER_LIMITS.WHITE_LABEL]);
  });

  it("never advertises more seats than White Label on the cheaper plan", () => {
    expect(PLAN_TIER_USER_LIMITS.SERVICE!).toBeLessThan(PLAN_TIER_USER_LIMITS.WHITE_LABEL!);
  });

  it("still describes Enterprise as uncapped, matching a null limit", () => {
    expect(PLAN_TIER_USER_LIMITS.ENTERPRISE).toBeNull();
    expect(pricing).toContain("Unlimited staff logins");
  });
});
