-- CreateEnum
CREATE TYPE "ContaminationIncidentStatus" AS ENUM ('OPEN', 'UNDER_REMEDIATION', 'VERIFIED_CLEAN', 'REOPENED');

-- AlterTable
ALTER TABLE "EventProtocol" ADD COLUMN     "appliesWhen" TEXT,
ADD COLUMN     "cascadesToSharedFiltration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ctValue" DECIMAL(12,2),
ADD COLUMN     "ctValueUnit" TEXT;

-- AlterTable
ALTER TABLE "FrequencyRule" ADD COLUMN     "appliesWhen" TEXT;

-- CreateTable
CREATE TABLE "ContaminationIncident" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bodyOfWaterId" TEXT NOT NULL,
    "recordedByUserId" TEXT,
    "status" "ContaminationIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "contaminationType" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "batherCountAtTime" INTEGER,
    "cyaPresentPpm" DECIMAL(10,3),
    "targetConcentrationReachedAt" TIMESTAMP(3),
    "verifiedEvenDistributionAt" TIMESTAMP(3),
    "contactTimeEndedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "remediationSteps" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaminationIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentMonitoringReading" (
    "id" TEXT NOT NULL,
    "contaminationIncidentId" TEXT NOT NULL,
    "checkpointLabel" TEXT NOT NULL,
    "sequence" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "freeChlorinePpm" DECIMAL(10,3),
    "totalChlorinePpm" DECIMAL(10,3),
    "ph" DECIMAL(10,3),
    "temperature" DECIMAL(10,3),
    "distributionVerified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentMonitoringReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CascadedFiltrationClosure" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CascadedFiltrationClosure_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ContaminationIncident_propertyId_idx" ON "ContaminationIncident"("propertyId");

-- CreateIndex
CREATE INDEX "ContaminationIncident_bodyOfWaterId_idx" ON "ContaminationIncident"("bodyOfWaterId");

-- CreateIndex
CREATE INDEX "ContaminationIncident_status_idx" ON "ContaminationIncident"("status");

-- CreateIndex
CREATE INDEX "IncidentMonitoringReading_contaminationIncidentId_idx" ON "IncidentMonitoringReading"("contaminationIncidentId");

-- CreateIndex
CREATE INDEX "_CascadedFiltrationClosure_B_index" ON "_CascadedFiltrationClosure"("B");

-- AddForeignKey
ALTER TABLE "ContaminationIncident" ADD CONSTRAINT "ContaminationIncident_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaminationIncident" ADD CONSTRAINT "ContaminationIncident_bodyOfWaterId_fkey" FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaminationIncident" ADD CONSTRAINT "ContaminationIncident_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentMonitoringReading" ADD CONSTRAINT "IncidentMonitoringReading_contaminationIncidentId_fkey" FOREIGN KEY ("contaminationIncidentId") REFERENCES "ContaminationIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CascadedFiltrationClosure" ADD CONSTRAINT "_CascadedFiltrationClosure_A_fkey" FOREIGN KEY ("A") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CascadedFiltrationClosure" ADD CONSTRAINT "_CascadedFiltrationClosure_B_fkey" FOREIGN KEY ("B") REFERENCES "ContaminationIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: new tables don't inherit the ENABLE ROW LEVEL SECURITY from the
-- 20260803194700_lock_down_public_schema_from_client_roles migration (that migration
-- could only target tables that existed at the time). The default-privilege revocation
-- from that same migration already keeps anon/authenticated from ever being granted
-- access to these tables, but enabling RLS here too matches this project's established
-- defense-in-depth posture for every table under public.* rather than relying on grants
-- alone. All application access goes through Prisma on a direct connection, which
-- bypasses RLS as table owner, so this has no effect on the app itself.
ALTER TABLE "ContaminationIncident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentMonitoringReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_CascadedFiltrationClosure" ENABLE ROW LEVEL SECURITY;

