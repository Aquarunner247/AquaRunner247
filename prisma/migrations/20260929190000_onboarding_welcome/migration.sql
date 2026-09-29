-- First-login welcome, which asks before any tour opens by itself.
--
-- Both columns are nullable and both nulls mean "not asked yet", so every existing account sees
-- the welcome once on its next visit rather than being silently treated as having declined.
-- Nothing else changes: with toursDismissedAt null, tours behave exactly as they did.

ALTER TABLE "User" ADD COLUMN "welcomeSeenAt"    TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "toursDismissedAt" TIMESTAMP(3);
