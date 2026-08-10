-- CreateEnum
CREATE TYPE "VolumeShape" AS ENUM ('RECTANGLE', 'CIRCLE', 'OVAL', 'KIDNEY_FREEFORM', 'MULTI_DEPTH');

-- CreateEnum
CREATE TYPE "ChemicalType" AS ENUM ('FREE_CHLORINE', 'PH_UP', 'PH_DOWN', 'ALKALINITY_UP', 'CYA', 'CALCIUM_HARDNESS', 'SALT');

-- CreateEnum
CREATE TYPE "PoolOrSpa" AS ENUM ('POOL', 'SPA', 'BOTH');

-- CreateEnum
CREATE TYPE "ChemicalProductForm" AS ENUM ('LIQUID', 'GRANULAR', 'TABLET', 'PUCK');

-- CreateEnum
CREATE TYPE "DosingUnit" AS ENUM ('OZ', 'LB', 'GAL', 'QUART', 'TABLET', 'SCOOP', 'TSP', 'TBSP');

-- CreateEnum
CREATE TYPE "ComplianceTargetMode" AS ENUM ('STATE_MIDPOINT', 'ORG_CUSTOM');

-- CreateTable
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
    "calculatedGallons" DECIMAL(12,2),
    "lastCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalProductCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chemicalType" "ChemicalType" NOT NULL,
    "poolOrSpa" "PoolOrSpa" NOT NULL DEFAULT 'BOTH',
    "form" "ChemicalProductForm" NOT NULL,
    "activePercent" DECIMAL(5,2),
    "dosingUnit" "DosingUnit" NOT NULL,
    "dosingFactor" DECIMAL(10,4) NOT NULL,
    "cyaAddedPerFcPpm" DECIMAL(6,3),
    "defaultMaxDosePerVisit" DECIMAL(10,2),
    "defaultRoundingIncrement" DECIMAL(10,4) NOT NULL,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChemicalProductCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgChemicalProductSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "catalogProductId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "price" DECIMAL(10,4),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "maxDosePerVisit" DECIMAL(10,2),
    "roundingIncrement" DECIMAL(10,4),
    "linkedBillingProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgChemicalProductSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgComplianceTarget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "chemicalType" "ChemicalType" NOT NULL,
    "targetMode" "ComplianceTargetMode" NOT NULL DEFAULT 'STATE_MIDPOINT',
    "orgTargetMin" DECIMAL(10,3),
    "orgTargetMax" DECIMAL(10,3),
    "orgTargetValue" DECIMAL(10,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgComplianceTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolumeCalculation_bodyOfWaterId_key" ON "VolumeCalculation"("bodyOfWaterId");

-- CreateIndex
CREATE UNIQUE INDEX "ChemicalProductCatalog_name_key" ON "ChemicalProductCatalog"("name");

-- CreateIndex
CREATE INDEX "ChemicalProductCatalog_chemicalType_idx" ON "ChemicalProductCatalog"("chemicalType");

-- CreateIndex
CREATE INDEX "OrgChemicalProductSetting_organizationId_idx" ON "OrgChemicalProductSetting"("organizationId");

-- CreateIndex
CREATE INDEX "OrgChemicalProductSetting_catalogProductId_idx" ON "OrgChemicalProductSetting"("catalogProductId");

-- CreateIndex
CREATE INDEX "OrgChemicalProductSetting_linkedBillingProductId_idx" ON "OrgChemicalProductSetting"("linkedBillingProductId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgChemicalProductSetting_organizationId_catalogProductId_key" ON "OrgChemicalProductSetting"("organizationId", "catalogProductId");

-- CreateIndex
CREATE INDEX "OrgComplianceTarget_organizationId_idx" ON "OrgComplianceTarget"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgComplianceTarget_organizationId_state_chemicalType_key" ON "OrgComplianceTarget"("organizationId", "state", "chemicalType");

-- AddForeignKey
ALTER TABLE "VolumeCalculation" ADD CONSTRAINT "VolumeCalculation_bodyOfWaterId_fkey" FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChemicalProductSetting" ADD CONSTRAINT "OrgChemicalProductSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChemicalProductSetting" ADD CONSTRAINT "OrgChemicalProductSetting_catalogProductId_fkey" FOREIGN KEY ("catalogProductId") REFERENCES "ChemicalProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChemicalProductSetting" ADD CONSTRAINT "OrgChemicalProductSetting_linkedBillingProductId_fkey" FOREIGN KEY ("linkedBillingProductId") REFERENCES "ChemicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgComplianceTarget" ADD CONSTRAINT "OrgComplianceTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown
-- (20260803194700) -- each new table needs it set explicitly. Grants are already revoked
-- by that migration's ALTER DEFAULT PRIVILEGES, so this is defense-in-depth, same
-- convention as 20260807120000's ContaminationIncident tables.
ALTER TABLE "VolumeCalculation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChemicalProductCatalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgChemicalProductSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgComplianceTarget" ENABLE ROW LEVEL SECURITY;

-- AlterTable: Calcium Hardness/Salt readings, dosing-calculator inputs not required by
-- any state's compliance log.
ALTER TABLE "VisitWaterReading" ADD COLUMN     "calciumHardnessPpm" DECIMAL(8,2);
ALTER TABLE "VisitWaterReading" ADD COLUMN     "saltPpm" DECIMAL(8,2);
