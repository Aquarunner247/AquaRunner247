/*
  Warnings:

  - You are about to drop the column `alkalinityTargetMaxPpm` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `alkalinityTargetMinPpm` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `closureFeeAmount` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `closureFeeNote` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `county` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `cyaHazardMaxPpm` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `cyaTargetMaxPpm` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `cyaTargetMinPpm` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `cyaTestFrequencyDays` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `freeChlorineMaxPpm` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `freeChlorineMinPoolPpm` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `freeChlorineMinSpaPpm` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `phHazardMax` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `phHazardMin` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `phTargetMax` on the `ComplianceRuleset` table. All the data in the column will be lost.
  - You are about to drop the column `phTargetMin` on the `ComplianceRuleset` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "LogSheetSource" AS ENUM ('STATE_PROVIDED', 'BUILT_FROM_CODE');

-- CreateEnum
CREATE TYPE "DisinfectionMethod" AS ENUM ('CHLORINE', 'BROMINE', 'HYDROGEN_PEROXIDE', 'COPPER_ION', 'SILVER_ION', 'OZONE', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "ComplianceRuleset" DROP COLUMN "alkalinityTargetMaxPpm",
DROP COLUMN "alkalinityTargetMinPpm",
DROP COLUMN "closureFeeAmount",
DROP COLUMN "closureFeeNote",
DROP COLUMN "county",
DROP COLUMN "cyaHazardMaxPpm",
DROP COLUMN "cyaTargetMaxPpm",
DROP COLUMN "cyaTargetMinPpm",
DROP COLUMN "cyaTestFrequencyDays",
DROP COLUMN "freeChlorineMaxPpm",
DROP COLUMN "freeChlorineMinPoolPpm",
DROP COLUMN "freeChlorineMinSpaPpm",
DROP COLUMN "phHazardMax",
DROP COLUMN "phHazardMin",
DROP COLUMN "phTargetMax",
DROP COLUMN "phTargetMin",
ADD COLUMN     "countyName" TEXT,
ADD COLUMN     "jurisdictionLevel" TEXT,
ADD COLUMN     "logSheetSource" "LogSheetSource",
ADD COLUMN     "officialCitation" TEXT,
ADD COLUMN     "recordRetentionMonths" INTEGER,
ADD COLUMN     "sourceDocument" TEXT;

-- CreateTable
CREATE TABLE "ChemistryThreshold" (
    "id" TEXT NOT NULL,
    "complianceRulesetId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "disinfectionMethod" "DisinfectionMethod" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "bodyOfWaterCategory" TEXT,
    "indoorOutdoor" TEXT,
    "appliesWhen" TEXT,
    "minValue" DECIMAL(10,3),
    "idealMin" DECIMAL(10,3),
    "idealMax" DECIMAL(10,3),
    "maxValue" DECIMAL(10,3),
    "hazardMin" DECIMAL(10,3),
    "hazardMax" DECIMAL(10,3),
    "unit" TEXT,
    "relationalRule" TEXT,
    "isCurveBased" BOOLEAN NOT NULL DEFAULT false,
    "curveDescription" TEXT,
    "curveDataPoints" JSONB,
    "sourceConfidence" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChemistryThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrequencyRule" (
    "id" TEXT NOT NULL,
    "complianceRulesetId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "bodyOfWaterCategory" TEXT,
    "facilityAttribute" TEXT,
    "cadence" TEXT,
    "intervalMinutes" INTEGER,
    "isPerformanceBased" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrequencyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventProtocol" (
    "id" TEXT NOT NULL,
    "complianceRulesetId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerLabel" TEXT NOT NULL,
    "closureKind" TEXT NOT NULL,
    "minimumDurationMinutes" INTEGER,
    "consecutiveFailuresRequired" INTEGER,
    "reopeningCondition" TEXT NOT NULL,
    "remediationSteps" TEXT,
    "requiresSeparateTestKit" BOOLEAN NOT NULL DEFAULT false,
    "labAnalysisFrequency" TEXT,
    "externalReferenceLabel" TEXT,
    "externalReferenceUrl" TEXT,
    "feeAmount" DECIMAL(10,2),
    "feeNote" TEXT,
    "sourceConfidence" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceNote" (
    "id" TEXT NOT NULL,
    "complianceRulesetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChemistryThreshold_complianceRulesetId_idx" ON "ChemistryThreshold"("complianceRulesetId");

-- CreateIndex
CREATE INDEX "FrequencyRule_complianceRulesetId_idx" ON "FrequencyRule"("complianceRulesetId");

-- CreateIndex
CREATE INDEX "EventProtocol_complianceRulesetId_idx" ON "EventProtocol"("complianceRulesetId");

-- CreateIndex
CREATE INDEX "ComplianceNote_complianceRulesetId_idx" ON "ComplianceNote"("complianceRulesetId");

-- AddForeignKey
ALTER TABLE "ChemistryThreshold" ADD CONSTRAINT "ChemistryThreshold_complianceRulesetId_fkey" FOREIGN KEY ("complianceRulesetId") REFERENCES "ComplianceRuleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrequencyRule" ADD CONSTRAINT "FrequencyRule_complianceRulesetId_fkey" FOREIGN KEY ("complianceRulesetId") REFERENCES "ComplianceRuleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventProtocol" ADD CONSTRAINT "EventProtocol_complianceRulesetId_fkey" FOREIGN KEY ("complianceRulesetId") REFERENCES "ComplianceRuleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceNote" ADD CONSTRAINT "ComplianceNote_complianceRulesetId_fkey" FOREIGN KEY ("complianceRulesetId") REFERENCES "ComplianceRuleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
