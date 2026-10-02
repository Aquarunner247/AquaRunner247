-- A portal login created by an admin starts with a temporary password that was emailed to the
-- customer in plain text. This marks those logins so the portal can require a replacement before it
-- opens.
--
-- Defaults false, so every login that already exists is left alone: their passwords were either set
-- by the customer through the activation link or have been in use for weeks, and forcing a reset on
-- people mid-season would be a support call, not a security win.
ALTER TABLE "CustomerUser" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
