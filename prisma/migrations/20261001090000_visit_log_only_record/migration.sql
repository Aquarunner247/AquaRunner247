-- Separates "a reading was recorded" from "a service was performed".
--
-- The CSV importer and CPO's log-a-reading action both created ServiceVisit rows with
-- status = COMPLETED and serviceComplete = true, because the public inspector log
-- (getMonthlyReadingRows) only counts COMPLETED visits. That made every imported logbook row look
-- like a performed service: eligible for a customer summary email, counted in "completed this week",
-- and indistinguishable from real work.

ALTER TABLE "ServiceVisit" ADD COLUMN "logOnlyRecord" BOOLEAN NOT NULL DEFAULT false;

-- Backfill the existing imported rows. The signature is exact rather than heuristic: both producers
-- leave technicianId and startedAt null, and a check against production found 266 rows matching it
-- and ZERO technician-performed visits without a photo -- so there is no real visit that could be
-- caught by mistake. Reversible with: UPDATE "ServiceVisit" SET "logOnlyRecord" = false;
UPDATE "ServiceVisit"
SET "logOnlyRecord" = true
WHERE status = 'COMPLETED'
  AND "technicianId" IS NULL
  AND "startedAt" IS NULL;
