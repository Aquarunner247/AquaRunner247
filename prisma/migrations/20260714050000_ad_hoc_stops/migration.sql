-- CreateTable
CREATE TABLE "AdHocStop" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "technicianId" TEXT,
    "propertyId" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdHocStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdHocStop_organizationId_idx" ON "AdHocStop"("organizationId");

-- CreateIndex
CREATE INDEX "AdHocStop_technicianId_idx" ON "AdHocStop"("technicianId");

-- CreateIndex
CREATE INDEX "AdHocStop_scheduledDate_idx" ON "AdHocStop"("scheduledDate");

-- AddForeignKey
ALTER TABLE "AdHocStop" ADD CONSTRAINT "AdHocStop_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHocStop" ADD CONSTRAINT "AdHocStop_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHocStop" ADD CONSTRAINT "AdHocStop_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHocStop" ADD CONSTRAINT "AdHocStop_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
