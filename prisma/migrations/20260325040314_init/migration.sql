-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OFFICE', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "BodyOfWaterType" AS ENUM ('POOL', 'SPA', 'FOUNTAIN', 'WATER_FEATURE', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipmentKind" AS ENUM ('PUMP', 'FILTER', 'HEATER', 'CHLORINATOR', 'AUTOMATION', 'FLOW_METER', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'TECHNICIAN',
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "billingRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "managerName" TEXT,
    "managerPhone" TEXT,
    "managerEmail" TEXT,
    "managementCompanyName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'US',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geofenceMeters" INTEGER,
    "notes" TEXT,
    "publicSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyQrToken" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyQrToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyOfWater" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BodyOfWaterType" NOT NULL DEFAULT 'POOL',
    "volumeGallons" DECIMAL(12,2),
    "notes" TEXT,
    "minimumRequiredFlowGpm" DECIMAL(10,2),
    "maximumFilterFlowGpm" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BodyOfWater_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyOfWaterServiceWeekday" (
    "id" TEXT NOT NULL,
    "bodyOfWaterId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyOfWaterServiceWeekday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "bodyOfWaterId" TEXT NOT NULL,
    "kind" "EquipmentKind" NOT NULL DEFAULT 'OTHER',
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "installedOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentServiceEvent" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "performedByUserId" TEXT,

    CONSTRAINT "EquipmentServiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringRoute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "ScheduleFrequency" NOT NULL DEFAULT 'WEEKLY',
    "dayOfWeek" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringStop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bodyOfWaterId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "etaOffsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bodyOfWaterId" TEXT NOT NULL,
    "technicianId" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "serviceComplete" BOOLEAN NOT NULL DEFAULT false,
    "techNotes" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitWaterReading" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "ph" DECIMAL(4,2),
    "freeChlorinePpm" DECIMAL(6,2),
    "totalChlorinePpm" DECIMAL(6,2),
    "alkalinityPpm" DECIMAL(8,2),
    "cyanuricAcidPpm" DECIMAL(8,2),
    "temperatureF" DECIMAL(5,2),
    "filterPressurePsi" DECIMAL(6,2),
    "vacGaugeReading" DECIMAL(6,2),
    "pumpPressurePsi" DECIMAL(6,2),
    "filterGaugeReading" DECIMAL(6,2),
    "flowMeterGpm" DECIMAL(8,2),
    "backwashAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitWaterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitChemicalDose" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitChemicalDose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitPhoto" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT,
    "takenAt" TIMESTAMP(3),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "accuracyMeters" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitIssueFlag" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitIssueFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemistryRecommendation" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChemistryRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_publicSlug_key" ON "Property"("publicSlug");

-- CreateIndex
CREATE INDEX "Property_organizationId_idx" ON "Property"("organizationId");

-- CreateIndex
CREATE INDEX "Property_customerId_idx" ON "Property"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyQrToken_token_key" ON "PropertyQrToken"("token");

-- CreateIndex
CREATE INDEX "PropertyQrToken_propertyId_idx" ON "PropertyQrToken"("propertyId");

-- CreateIndex
CREATE INDEX "BodyOfWater_propertyId_idx" ON "BodyOfWater"("propertyId");

-- CreateIndex
CREATE INDEX "BodyOfWaterServiceWeekday_bodyOfWaterId_idx" ON "BodyOfWaterServiceWeekday"("bodyOfWaterId");

-- CreateIndex
CREATE UNIQUE INDEX "BodyOfWaterServiceWeekday_bodyOfWaterId_weekday_key" ON "BodyOfWaterServiceWeekday"("bodyOfWaterId", "weekday");

-- CreateIndex
CREATE INDEX "Equipment_bodyOfWaterId_idx" ON "Equipment"("bodyOfWaterId");

-- CreateIndex
CREATE INDEX "EquipmentServiceEvent_equipmentId_idx" ON "EquipmentServiceEvent"("equipmentId");

-- CreateIndex
CREATE INDEX "RecurringRoute_organizationId_idx" ON "RecurringRoute"("organizationId");

-- CreateIndex
CREATE INDEX "RecurringStop_routeId_idx" ON "RecurringStop"("routeId");

-- CreateIndex
CREATE INDEX "RecurringStop_propertyId_idx" ON "RecurringStop"("propertyId");

-- CreateIndex
CREATE INDEX "ServiceVisit_organizationId_scheduledStart_idx" ON "ServiceVisit"("organizationId", "scheduledStart");

-- CreateIndex
CREATE INDEX "ServiceVisit_technicianId_scheduledStart_idx" ON "ServiceVisit"("technicianId", "scheduledStart");

-- CreateIndex
CREATE INDEX "ServiceVisit_propertyId_scheduledStart_idx" ON "ServiceVisit"("propertyId", "scheduledStart");

-- CreateIndex
CREATE INDEX "ServiceVisit_bodyOfWaterId_scheduledStart_idx" ON "ServiceVisit"("bodyOfWaterId", "scheduledStart");

-- CreateIndex
CREATE UNIQUE INDEX "VisitWaterReading_visitId_key" ON "VisitWaterReading"("visitId");

-- CreateIndex
CREATE INDEX "VisitChemicalDose_visitId_idx" ON "VisitChemicalDose"("visitId");

-- CreateIndex
CREATE INDEX "VisitPhoto_visitId_idx" ON "VisitPhoto"("visitId");

-- CreateIndex
CREATE INDEX "VisitIssueFlag_visitId_idx" ON "VisitIssueFlag"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "ChemistryRecommendation_visitId_key" ON "ChemistryRecommendation"("visitId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyQrToken" ADD CONSTRAINT "PropertyQrToken_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyOfWater" ADD CONSTRAINT "BodyOfWater_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyOfWaterServiceWeekday" ADD CONSTRAINT "BodyOfWaterServiceWeekday_bodyOfWaterId_fkey" FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_bodyOfWaterId_fkey" FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentServiceEvent" ADD CONSTRAINT "EquipmentServiceEvent_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringStop" ADD CONSTRAINT "RecurringStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "RecurringRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringStop" ADD CONSTRAINT "RecurringStop_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringStop" ADD CONSTRAINT "RecurringStop_bodyOfWaterId_fkey" FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_bodyOfWaterId_fkey" FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitWaterReading" ADD CONSTRAINT "VisitWaterReading_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChemicalDose" ADD CONSTRAINT "VisitChemicalDose_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPhoto" ADD CONSTRAINT "VisitPhoto_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitIssueFlag" ADD CONSTRAINT "VisitIssueFlag_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemistryRecommendation" ADD CONSTRAINT "ChemistryRecommendation_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
