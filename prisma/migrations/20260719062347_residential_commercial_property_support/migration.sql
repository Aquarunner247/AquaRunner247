-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');

-- AlterTable
ALTER TABLE "BodyOfWater" ADD COLUMN     "cartridgeCleaningFrequencyPerMonth" INTEGER,
ADD COLUMN     "cartridgeCleaningIncluded" BOOLEAN,
ADD COLUMN     "filterType" "FilterMedia",
ADD COLUMN     "requiresAlkalinity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiresCYA" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiresFC" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiresPH" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "propertyType" "PropertyType" NOT NULL DEFAULT 'COMMERCIAL';
