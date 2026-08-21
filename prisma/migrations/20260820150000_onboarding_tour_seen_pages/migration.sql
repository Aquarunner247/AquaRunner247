-- Onboarding tour tracking moves from a single "seen the tour" timestamp to a set of
-- page keys, since each role now has several independent per-page tours instead of one.
ALTER TABLE "User" ADD COLUMN "seenTourPages" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "CustomerUser" ADD COLUMN "seenTourPages" TEXT[] NOT NULL DEFAULT '{}';

-- Preserve existing dismissals so a page a user already saw doesn't re-fire.
UPDATE "User" SET "seenTourPages" = ARRAY['/dashboard'] WHERE "role" = 'ADMIN' AND "onboardingTourSeenAt" IS NOT NULL;
UPDATE "User" SET "seenTourPages" = ARRAY['/dashboard/schedule'] WHERE "role" = 'TECHNICIAN' AND "onboardingTourSeenAt" IS NOT NULL;
UPDATE "CustomerUser" SET "seenTourPages" = ARRAY['/portal'] WHERE "onboardingTourSeenAt" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "onboardingTourSeenAt";
ALTER TABLE "CustomerUser" DROP COLUMN "onboardingTourSeenAt";
