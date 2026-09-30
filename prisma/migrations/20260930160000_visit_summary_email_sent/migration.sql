-- Records when a visit's details went out in a customer service-summary email.
--
-- Nullable, and null means "not emailed yet". Every existing completed visit therefore reads as
-- un-emailed, which is harmless: the stamp is only ever consulted while completing a visit, and a
-- visit already completed is never completed again.
--
-- Its real job is preventing a duplicate. A bundled pool and spa send one email between them, so
-- both completions racing (an offline queue replaying two at once) would otherwise each see "all
-- members finished" and each send. The completion route takes an advisory lock and checks this
-- column inside it.

ALTER TABLE "ServiceVisit" ADD COLUMN "summaryEmailSentAt" TIMESTAMP(3);

-- The lookup is always "this property's visits for this day", already served by the existing
-- (propertyId, scheduledStart) index, so no new index is needed.
