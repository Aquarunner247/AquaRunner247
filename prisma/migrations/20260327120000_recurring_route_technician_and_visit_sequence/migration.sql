-- Weekly routes: assign technician; visits link to route stops + sequence.
ALTER TABLE "RecurringRoute" ADD COLUMN IF NOT EXISTS "technicianId" TEXT;

UPDATE "RecurringRoute" SET "dayOfWeek" = 1 WHERE "dayOfWeek" IS NULL;
ALTER TABLE "RecurringRoute" ALTER COLUMN "dayOfWeek" SET NOT NULL;

ALTER TABLE "RecurringRoute"
ADD CONSTRAINT "RecurringRoute_technicianId_fkey"
FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "RecurringRoute_technicianId_idx" ON "RecurringRoute"("technicianId");

ALTER TABLE "ServiceVisit" ADD COLUMN IF NOT EXISTS "recurringStopId" TEXT;
ALTER TABLE "ServiceVisit" ADD COLUMN IF NOT EXISTS "routeSequence" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "ServiceVisit_recurringStopId_scheduledStart_idx" ON "ServiceVisit"("recurringStopId", "scheduledStart");

ALTER TABLE "ServiceVisit"
ADD CONSTRAINT "ServiceVisit_recurringStopId_fkey"
FOREIGN KEY ("recurringStopId") REFERENCES "RecurringStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
