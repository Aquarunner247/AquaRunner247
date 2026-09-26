-- Reworks the pool-service self-serve tiers per the finalized marketing/pricing pass:
-- SOLO ($49) and STARTER ($99) merge into one SERVICE ($99) tier that gets the full
-- feature set (dosing recommendations, route optimization, AI phone agent, pay-rate
-- tracking -- nothing held back for the price). PRO ($149)'s extra features move into
-- SERVICE too; PRO itself is renamed WHITE_LABEL, now differentiated purely by branding
-- (logo/colors/branded customer experience), not by feature access. See
-- lib/plan-tiers-core.ts for the code side of this. ENTERPRISE and COMPLIANCE are
-- unchanged.

-- AlterEnum: temporarily extend PlanTier so any existing Solo/Starter/Pro orgs can be
-- remapped onto the new tiers before those old values are dropped below (Postgres has no
-- direct "drop enum value" -- new values must exist, in use, before the old ones can go).
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'SERVICE';
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'WHITE_LABEL';

-- Remap existing orgs: SOLO/STARTER collapse into SERVICE; PRO becomes WHITE_LABEL (same
-- $149 price point, same org, branding-only differentiator now instead of extra features).
UPDATE "Organization" SET "planTier" = 'SERVICE' WHERE "planTier" IN ('SOLO', 'STARTER');
UPDATE "Organization" SET "planTier" = 'WHITE_LABEL' WHERE "planTier" = 'PRO';

-- Recreate the enum without the retired SOLO/STARTER/PRO values -- the standard
-- swap-and-rename Prisma itself generates for a removed enum member.
CREATE TYPE "PlanTier_new" AS ENUM ('SERVICE', 'WHITE_LABEL', 'ENTERPRISE', 'COMPLIANCE');
ALTER TABLE "Organization" ALTER COLUMN "planTier" TYPE "PlanTier_new" USING ("planTier"::text::"PlanTier_new");
DROP TYPE "PlanTier";
ALTER TYPE "PlanTier_new" RENAME TO "PlanTier";
