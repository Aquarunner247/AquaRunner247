-- A body of water's own pin, separate from its property's single shared coordinate.
-- Null = not pinned; consumers fall back to the property coordinate, so this is additive.
ALTER TABLE "BodyOfWater" ADD COLUMN     "latitude" DECIMAL(10,7);
ALTER TABLE "BodyOfWater" ADD COLUMN     "longitude" DECIMAL(10,7);

-- Where a technician's day starts and ends (usually home), so a route can be optimized as a
-- round trip. Null = today's behavior, where the route starts at whichever stop is first.
ALTER TABLE "User" ADD COLUMN     "startLatitude" DECIMAL(10,7);
ALTER TABLE "User" ADD COLUMN     "startLongitude" DECIMAL(10,7);
ALTER TABLE "User" ADD COLUMN     "startAddress" TEXT;
