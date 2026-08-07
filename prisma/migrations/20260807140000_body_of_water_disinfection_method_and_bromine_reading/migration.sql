-- AlterTable
ALTER TABLE "BodyOfWater" ADD COLUMN     "disinfectionMethod" "DisinfectionMethod" NOT NULL DEFAULT 'CHLORINE';

-- AlterTable
ALTER TABLE "VisitWaterReading" ADD COLUMN     "brominePpm" DECIMAL(6,2);

