-- CreateTable
CREATE TABLE "EquipmentReadingRequirement" (
    "id" TEXT NOT NULL,
    "complianceRulesetId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "bodyOfWaterCategory" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentReadingRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentReadingRequirement_complianceRulesetId_idx" ON "EquipmentReadingRequirement"("complianceRulesetId");

-- AddForeignKey
ALTER TABLE "EquipmentReadingRequirement" ADD CONSTRAINT "EquipmentReadingRequirement_complianceRulesetId_fkey" FOREIGN KEY ("complianceRulesetId") REFERENCES "ComplianceRuleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown --
-- each new table needs it set explicitly, same convention as every other feature this session.
ALTER TABLE "EquipmentReadingRequirement" ENABLE ROW LEVEL SECURITY;
