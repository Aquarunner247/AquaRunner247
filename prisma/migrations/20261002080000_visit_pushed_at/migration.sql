-- Marks a service visit that was still IN_PROGRESS once its own local day had ended, so the nightly
-- sweep could stop it reading "In progress" forever and stop it nagging in the overdue-stops list.
--
-- Additive and nullable. Nothing is backfilled here: the sweep stamps the existing stranded visits on
-- its next run, in each org's own timezone, which is the same rule it will apply from then on rather
-- than a one-off guess made in SQL.
ALTER TABLE "ServiceVisit" ADD COLUMN "pushedAt" TIMESTAMP(3);
