-- CreateEnum
CREATE TYPE "VolumeShape" AS ENUM ('RECTANGLE', 'CIRCLE', 'OVAL', 'KIDNEY_FREEFORM', 'MULTI_DEPTH');

-- CreateTable
-- One row per BodyOfWater (1:1, cascades with it) recording how volumeGallons was
-- derived, so a technician can revisit and correct one dimension instead of
-- re-measuring from scratch. BodyOfWater.volumeGallons remains the single number
-- everything else (dosing, compliance) reads.
CREATE TABLE "VolumeCalculation" (
    "id" TEXT NOT NULL,
    "bodyOfWaterId" TEXT NOT NULL,
    "shape" "VolumeShape" NOT NULL,
    "lengthFt" DECIMAL(8,2),
    "widthFt" DECIMAL(8,2),
    "radiusFt" DECIMAL(8,2),
    "shallowDepthFt" DECIMAL(6,2),
    "deepDepthFt" DECIMAL(6,2),
    "freeformMeasurementA" DECIMAL(8,2),
    "freeformMeasurementB" DECIMAL(8,2),
    "shallowSectionLengthFt" DECIMAL(8,2),
    "shallowSectionWidthFt" DECIMAL(8,2),
    "shallowSectionDepthFt" DECIMAL(6,2),
    "deepSectionLengthFt" DECIMAL(8,2),
    "deepSectionWidthFt" DECIMAL(8,2),
    "deepSectionDepthFt" DECIMAL(6,2),
    "calculatedGallons" DECIMAL(12,2) NOT NULL,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolumeCalculation_bodyOfWaterId_key" ON "VolumeCalculation"("bodyOfWaterId");

-- AddForeignKey
ALTER TABLE "VolumeCalculation" ADD CONSTRAINT "VolumeCalculation_bodyOfWaterId_fkey" FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown
-- (20260803194700) -- each new table needs it set explicitly. Grants are already revoked
-- by that migration's ALTER DEFAULT PRIVILEGES, so this is defense-in-depth, same
-- convention as 20260810120000's TechnicianPayRate/OrgPayrollSettings tables and
-- 20260813120000's dosing-calculator tables.
ALTER TABLE "VolumeCalculation" ENABLE ROW LEVEL SECURITY;
