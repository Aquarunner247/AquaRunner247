-- Links OrgChemicalProductSetting to the org's own free-text billing catalog
-- (ChemicalProduct), so a computed dosing recommendation can be applied as a logged
-- VisitChemicalDose without the technician re-entering the amount in a second place.
-- SET NULL on delete -- losing the linked billing product falls back to manual entry
-- rather than breaking the dosing setting itself.
ALTER TABLE "OrgChemicalProductSetting" ADD COLUMN "linkedBillingProductId" TEXT;

-- CreateIndex
CREATE INDEX "OrgChemicalProductSetting_linkedBillingProductId_idx" ON "OrgChemicalProductSetting"("linkedBillingProductId");

-- AddForeignKey
ALTER TABLE "OrgChemicalProductSetting" ADD CONSTRAINT "OrgChemicalProductSetting_linkedBillingProductId_fkey" FOREIGN KEY ("linkedBillingProductId") REFERENCES "ChemicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS already enabled on OrgChemicalProductSetting/ChemicalProduct by prior migrations --
-- this migration only adds a column/FK/index, no new table.
