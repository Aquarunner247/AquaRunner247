-- Per-day start/finish overrides on a route, plus a default finish on the technician.
--
-- Every column is nullable and every null preserves the behavior that existed before this
-- migration: a route with no override falls back to the technician's default start, and a
-- technician with no end default finishes back where they started (the round trip
-- "Optimize stop order" already performed). So this migration changes no existing route.
--
-- Precision matches Property.latitude/longitude and User.startLatitude/startLongitude
-- (DECIMAL(10,7)) so a coordinate round-trips identically wherever it is stored.

ALTER TABLE "User" ADD COLUMN "endLatitude"  DECIMAL(10,7);
ALTER TABLE "User" ADD COLUMN "endLongitude" DECIMAL(10,7);
ALTER TABLE "User" ADD COLUMN "endAddress"   TEXT;

ALTER TABLE "RecurringRoute" ADD COLUMN "startLatitude"  DECIMAL(10,7);
ALTER TABLE "RecurringRoute" ADD COLUMN "startLongitude" DECIMAL(10,7);
ALTER TABLE "RecurringRoute" ADD COLUMN "startAddress"   TEXT;
ALTER TABLE "RecurringRoute" ADD COLUMN "endLatitude"    DECIMAL(10,7);
ALTER TABLE "RecurringRoute" ADD COLUMN "endLongitude"   DECIMAL(10,7);
ALTER TABLE "RecurringRoute" ADD COLUMN "endAddress"     TEXT;
