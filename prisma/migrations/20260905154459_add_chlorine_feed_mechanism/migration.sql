-- AlterEnum
ALTER TYPE "ChemicalProductForm" ADD VALUE 'TABLET';

-- AlterEnum
ALTER TYPE "DosingUnit" ADD VALUE 'TABLET';

-- CreateEnum
CREATE TYPE "ChlorineFeedMechanism" AS ENUM ('MANUAL', 'TABLET_FEEDER', 'LIQUID_FEED_PUMP');

-- AlterTable
ALTER TABLE "BodyOfWater" ADD COLUMN     "chlorineFeedMechanism" "ChlorineFeedMechanism" NOT NULL DEFAULT 'MANUAL';
