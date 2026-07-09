-- AlterEnum
ALTER TYPE "EquipmentKind" ADD VALUE 'SKIMMER_COVER';
ALTER TYPE "EquipmentKind" ADD VALUE 'VALVE';

-- AlterTable
ALTER TABLE "BodyOfWater" ADD COLUMN "maximumOccupancy" INTEGER;

-- AlterTable: rename portSize -> pipeSize, preserving existing data
ALTER TABLE "Equipment" RENAME COLUMN "portSize" TO "pipeSize";
ALTER TABLE "Equipment" ADD COLUMN "lastServicedAt" TIMESTAMP(3);
