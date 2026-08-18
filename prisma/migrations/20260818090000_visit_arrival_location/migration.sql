-- GPS location captured at the moment a technician logs arrival (best-effort, same
-- optional/never-required pattern as VisitPhoto's own latitude/longitude/accuracyMeters).
ALTER TABLE "ServiceVisit" ADD COLUMN "arrivalLatitude" DECIMAL(10,7);
ALTER TABLE "ServiceVisit" ADD COLUMN "arrivalLongitude" DECIMAL(10,7);
ALTER TABLE "ServiceVisit" ADD COLUMN "arrivalAccuracyMeters" DECIMAL(8,2);
