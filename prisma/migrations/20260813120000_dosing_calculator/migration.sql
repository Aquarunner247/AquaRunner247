-- CreateEnum
CREATE TYPE "ChemicalType" AS ENUM ('FREE_CHLORINE', 'PH_UP', 'PH_DOWN', 'ALKALINITY_UP', 'ALKALINITY_DOWN', 'CYA', 'CALCIUM_HARDNESS', 'SALT');

-- CreateEnum
CREATE TYPE "ChemicalProductForm" AS ENUM ('LIQUID', 'GRANULAR');

-- CreateEnum
CREATE TYPE "DosingUnit" AS ENUM ('OZ', 'FL_OZ');

-- CreateTable
CREATE TABLE "ChemicalProductCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chemicalType" "ChemicalType" NOT NULL,
    "activePercent" DECIMAL(6,2),
    "form" "ChemicalProductForm" NOT NULL,
    "dosingUnit" "DosingUnit" NOT NULL,
    "dosingConstant" DECIMAL(10,4) NOT NULL,
    "isDemandBased" BOOLEAN NOT NULL DEFAULT false,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgChemicalProductSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgComplianceTarget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" TEXT,
    "chemicalType" "ChemicalType" NOT NULL,
    "orgTargetMin" DECIMAL(10,3),
    "orgTargetMax" DECIMAL(10,3),
    "orgTargetValue" DECIMAL(10,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgComplianceTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChemicalProductCatalog_name_key" ON "ChemicalProductCatalog"("name");

-- CreateIndex
CREATE INDEX "ChemicalProductCatalog_chemicalType_idx" ON "ChemicalProductCatalog"("chemicalType");

-- CreateIndex
CREATE INDEX "OrgChemicalProductSetting_organizationId_idx" ON "OrgChemicalProductSetting"("organizationId");

-- CreateIndex
CREATE INDEX "OrgChemicalProductSetting_catalogProductId_idx" ON "OrgChemicalProductSetting"("catalogProductId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgChemicalProductSetting_organizationId_catalogProductId_key" ON "OrgChemicalProductSetting"("organizationId", "catalogProductId");

-- CreateIndex
CREATE INDEX "OrgComplianceTarget_organizationId_idx" ON "OrgComplianceTarget"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgComplianceTarget_organizationId_chemicalType_key" ON "OrgComplianceTarget"("organizationId", "chemicalType");

-- AddForeignKey
ALTER TABLE "OrgChemicalProductSetting" ADD CONSTRAINT "OrgChemicalProductSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChemicalProductSetting" ADD CONSTRAINT "OrgChemicalProductSetting_catalogProductId_fkey" FOREIGN KEY ("catalogProductId") REFERENCES "ChemicalProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgComplianceTarget" ADD CONSTRAINT "OrgComplianceTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown
-- (20260803194700) -- each new table needs it set explicitly. Grants are already revoked
-- by that migration's ALTER DEFAULT PRIVILEGES, so this is defense-in-depth, same
-- convention as 20260810120000's TechnicianPayRate/OrgPayrollSettings tables.
-- ChemicalProductCatalog is global system-seeded reference data (no organizationId
-- column), same posture as other lookup tables -- RLS enabled regardless since Prisma
-- (the table owner) bypasses it and no other role has any grants either way.
ALTER TABLE "ChemicalProductCatalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgChemicalProductSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgComplianceTarget" ENABLE ROW LEVEL SECURITY;
