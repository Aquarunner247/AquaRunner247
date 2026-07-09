-- DropForeignKey
ALTER TABLE "PropertyQrToken" DROP CONSTRAINT "PropertyQrToken_propertyId_fkey";

-- DropIndex
DROP INDEX "Property_publicSlug_key";

-- AlterTable: add publicSlug as nullable first
ALTER TABLE "BodyOfWater" ADD COLUMN "publicSlug" TEXT;

-- Backfill existing rows with a random unique slug
UPDATE "BodyOfWater" SET "publicSlug" = substr(md5(random()::text || clock_timestamp()::text), 1, 25) WHERE "publicSlug" IS NULL;

-- Now make it required
ALTER TABLE "BodyOfWater" ALTER COLUMN "publicSlug" SET NOT NULL;

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "publicSlug";

-- DropTable
DROP TABLE "PropertyQrToken";

-- CreateIndex
CREATE UNIQUE INDEX "BodyOfWater_publicSlug_key" ON "BodyOfWater"("publicSlug");
