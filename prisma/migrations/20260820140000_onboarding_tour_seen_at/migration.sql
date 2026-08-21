-- Adds a one-time "has this user seen their onboarding tour" flag; null = never seen.
ALTER TABLE "User" ADD COLUMN "onboardingTourSeenAt" TIMESTAMP(3);
ALTER TABLE "CustomerUser" ADD COLUMN "onboardingTourSeenAt" TIMESTAMP(3);
