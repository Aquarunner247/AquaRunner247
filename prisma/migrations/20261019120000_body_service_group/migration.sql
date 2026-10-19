-- Declared bundling: bodies of water serviced on one walk-up say so, instead of it being
-- inferred from how close their pins are and whether their types differ.
--
-- Nullable and with no default, so every existing body is "its own stop" until something says
-- otherwise. Nothing changes on read until the backfill runs
-- (scripts/backfill-service-groups.ts), which writes the groups today's inference already
-- produces -- so the first deploy after it looks identical to the last one before.
ALTER TABLE "BodyOfWater" ADD COLUMN "serviceGroup" TEXT;

-- Scoped to the property, which is what makes Borgata's clubhouse pair and gym pair two
-- different bundles rather than one of four.
CREATE INDEX "BodyOfWater_propertyId_serviceGroup_idx" ON "BodyOfWater"("propertyId", "serviceGroup");
