-- Records that a visit was moved to another day, keeping the original row on its original day.
--
-- Moving the row itself (what shipped on 2026-10-12) left the recurring stop with no visit on the
-- day it came from, and lib/visit-generation.ts creates one whenever that is true -- so the stop
-- reappeared on the old day hours later. Cornerstone Park's Pool 2 was moved to Tuesday at 04:38
-- and regenerated on Monday at 23:59.
--
-- Nullable and unique: one visit can only have been moved into one other visit. ON DELETE SET NULL
-- so deleting the new visit leaves the old row intact rather than cascading.
ALTER TABLE "ServiceVisit" ADD COLUMN "movedToVisitId" TEXT;

CREATE UNIQUE INDEX "ServiceVisit_movedToVisitId_key" ON "ServiceVisit"("movedToVisitId");

ALTER TABLE "ServiceVisit"
  ADD CONSTRAINT "ServiceVisit_movedToVisitId_fkey"
  FOREIGN KEY ("movedToVisitId") REFERENCES "ServiceVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
