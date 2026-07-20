-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "complianceRulesetId" TEXT,
ADD COLUMN     "hasCommercialPools" BOOLEAN,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "ComplianceRuleset" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "healthDepartmentName" TEXT,
    "isSupported" BOOLEAN NOT NULL DEFAULT false,
    "county" TEXT,
    "cyaTestFrequencyDays" INTEGER,
    "freeChlorineMinPoolPpm" DECIMAL(6,2),
    "freeChlorineMinSpaPpm" DECIMAL(6,2),
    "freeChlorineMaxPpm" DECIMAL(6,2),
    "phTargetMin" DECIMAL(4,2),
    "phTargetMax" DECIMAL(4,2),
    "phHazardMin" DECIMAL(4,2),
    "phHazardMax" DECIMAL(4,2),
    "alkalinityTargetMinPpm" DECIMAL(8,2),
    "alkalinityTargetMaxPpm" DECIMAL(8,2),
    "cyaTargetMinPpm" DECIMAL(8,2),
    "cyaTargetMaxPpm" DECIMAL(8,2),
    "cyaHazardMaxPpm" DECIMAL(8,2),
    "closureFeeAmount" DECIMAL(10,2),
    "closureFeeNote" TEXT,
    "codeReferenceLabel" TEXT,
    "codeReferenceUrl" TEXT,
    "logSheetSourceLabel" TEXT,
    "logSheetSourceNotes" TEXT,
    "referenceContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRuleset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRuleset_state_key" ON "ComplianceRuleset"("state");

-- CreateIndex
CREATE INDEX "ComplianceRuleset_isSupported_idx" ON "ComplianceRuleset"("isSupported");

-- CreateIndex
CREATE INDEX "Organization_complianceRulesetId_idx" ON "Organization"("complianceRulesetId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_complianceRulesetId_fkey" FOREIGN KEY ("complianceRulesetId") REFERENCES "ComplianceRuleset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
