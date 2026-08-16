-- Safety Data Sheet fields: a system-default link (external, not re-hosted) on the global
-- catalog, and an org-uploaded override (private storage object) on the org's own setting
-- row. Columns only on already-RLS-enabled tables -- no new table, no new RLS statement
-- needed, same pattern as 20260814010000_link_dosing_to_billing_products.
ALTER TABLE "ChemicalProductCatalog" ADD COLUMN "sdsDocumentUrl" TEXT;
ALTER TABLE "ChemicalProductCatalog" ADD COLUMN "sdsSourceLabel" TEXT;

ALTER TABLE "OrgChemicalProductSetting" ADD COLUMN "sdsStoragePath" TEXT;
ALTER TABLE "OrgChemicalProductSetting" ADD COLUMN "sdsFileName" TEXT;
ALTER TABLE "OrgChemicalProductSetting" ADD COLUMN "sdsContentType" TEXT;
ALTER TABLE "OrgChemicalProductSetting" ADD COLUMN "sdsFileSize" INTEGER;
ALTER TABLE "OrgChemicalProductSetting" ADD COLUMN "sdsUploadedAt" TIMESTAMP(3);
