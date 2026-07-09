-- Ensure UUID generation is available (harmless if already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "ManagementCompany" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagementCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagementCompany_organizationId_idx" ON "ManagementCompany"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementCompany_organizationId_name_key" ON "ManagementCompany"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "ManagementCompany" ADD CONSTRAINT "ManagementCompany_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add the new column first, keep the old text column temporarily so we can backfill from it
ALTER TABLE "Property" ADD COLUMN "managementCompanyId" TEXT;

-- Backfill: one ManagementCompany row per distinct existing company name
INSERT INTO "ManagementCompany" ("id", "organizationId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."organizationId", t."managementCompanyName", now(), now()
FROM (
  SELECT DISTINCT "organizationId", "managementCompanyName"
  FROM "Property"
  WHERE "managementCompanyName" IS NOT NULL AND btrim("managementCompanyName") <> ''
) t;

-- Backfill: point each property at its matching new company row
UPDATE "Property" p
SET "managementCompanyId" = mc."id"
FROM "ManagementCompany" mc
WHERE mc."organizationId" = p."organizationId"
  AND mc."name" = p."managementCompanyName";

-- Now safe to drop the old free-text column
ALTER TABLE "Property" DROP COLUMN "managementCompanyName";

-- CreateIndex
CREATE INDEX "Property_managementCompanyId_idx" ON "Property"("managementCompanyId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_managementCompanyId_fkey" FOREIGN KEY ("managementCompanyId") REFERENCES "ManagementCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
