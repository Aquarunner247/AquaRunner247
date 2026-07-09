-- AlterTable
ALTER TABLE "VisitChemicalDose" ADD COLUMN     "chemicalProductId" TEXT,
ADD COLUMN     "unitCharge" DECIMAL(10,4),
ADD COLUMN     "unitCost" DECIMAL(10,4);

-- CreateTable
CREATE TABLE "ChemicalProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "costPerUnit" DECIMAL(10,4) NOT NULL,
    "chargePerUnit" DECIMAL(10,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChemicalProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChemicalProduct_organizationId_idx" ON "ChemicalProduct"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChemicalProduct_organizationId_name_key" ON "ChemicalProduct"("organizationId", "name");

-- CreateIndex
CREATE INDEX "VisitChemicalDose_chemicalProductId_idx" ON "VisitChemicalDose"("chemicalProductId");

-- AddForeignKey
ALTER TABLE "ChemicalProduct" ADD CONSTRAINT "ChemicalProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChemicalDose" ADD CONSTRAINT "VisitChemicalDose_chemicalProductId_fkey" FOREIGN KEY ("chemicalProductId") REFERENCES "ChemicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
