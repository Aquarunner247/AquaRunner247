-- CreateEnum
CREATE TYPE "PayPeriodType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayStructureType" AS ENUM ('PER_PROPERTY');

-- CreateTable
CREATE TABLE "OrgPayrollSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payPeriodType" "PayPeriodType" NOT NULL DEFAULT 'SEMI_MONTHLY',
    "payStructureType" "PayStructureType" NOT NULL DEFAULT 'PER_PROPERTY',
    "weeklyStartDayOfWeek" INTEGER,
    "biweeklyAnchorStartDate" DATE,
    "semiMonthlySplitDay" INTEGER DEFAULT 15,
    "monthlyPayDay" INTEGER,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPayrollSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianPayRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "bodyOfWaterId" TEXT NOT NULL,
    "rateAmount" DECIMAL(10,2) NOT NULL,
    "isBundled" BOOLEAN NOT NULL DEFAULT false,
    "bundledIntoBodyOfWaterId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" DATE NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianPayRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgPayrollSettings_organizationId_key" ON "OrgPayrollSettings"("organizationId");

-- CreateIndex
CREATE INDEX "TechnicianPayRate_organizationId_idx" ON "TechnicianPayRate"("organizationId");

-- CreateIndex
CREATE INDEX "TechnicianPayRate_technicianId_bodyOfWaterId_effectiveDate_idx" ON "TechnicianPayRate"("technicianId", "bodyOfWaterId", "effectiveDate");

-- CreateIndex
CREATE INDEX "TechnicianPayRate_bodyOfWaterId_idx" ON "TechnicianPayRate"("bodyOfWaterId");

-- AddForeignKey
ALTER TABLE "OrgPayrollSettings" ADD CONSTRAINT "OrgPayrollSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPayrollSettings" ADD CONSTRAINT "OrgPayrollSettings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianPayRate" ADD CONSTRAINT "TechnicianPayRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianPayRate" ADD CONSTRAINT "TechnicianPayRate_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianPayRate" ADD CONSTRAINT "TechnicianPayRate_bodyOfWaterId_fkey" FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianPayRate" ADD CONSTRAINT "TechnicianPayRate_bundledIntoBodyOfWaterId_fkey" FOREIGN KEY ("bundledIntoBodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianPayRate" ADD CONSTRAINT "TechnicianPayRate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown
-- (20260803194700) -- each new table needs it set explicitly. Grants are already revoked
-- by that migration's ALTER DEFAULT PRIVILEGES, so this is defense-in-depth, same
-- convention as 20260809000000's dosing-calculator tables. TechnicianPayRate in
-- particular carries pay data that must never be readable by a non-admin client role --
-- see tech-earnings-tracker-spec.md Section 3.
ALTER TABLE "OrgPayrollSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TechnicianPayRate" ENABLE ROW LEVEL SECURITY;
