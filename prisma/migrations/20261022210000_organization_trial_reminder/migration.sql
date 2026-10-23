-- The "your trial ends soon" email, which Terms of Service 4.7 and EULA 5.4 have been
-- promising since those documents were published. Nothing sent it.
--
-- One nullable column, which is the idempotency marker for a daily cron: set once the
-- reminder goes out, so the sweep cannot send it twice. Every existing organization gets
-- NULL, and the cron additionally requires trialEndsAt to be in the future, so no historical
-- trial gets a reminder about a trial that already converted.
ALTER TABLE "Organization" ADD COLUMN "trialReminderSentAt" TIMESTAMP(3);
