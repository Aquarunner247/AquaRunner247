-- Opt-in AI Interactive Answering Agent add-on (inbound-only MVP). Feature flag on
-- Organization + per-org settings + a call-record table (created early per call, updated
-- across the Twilio webhook flow's several steps) + a daily-usage aggregate for cheap cap
-- enforcement.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "aiPhoneAgentEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "PhoneAgentRouteReason" AS ENUM ('AFTER_HOURS', 'BUSY_OVERFLOW');

-- CreateEnum
CREATE TYPE "PhoneAgentCallStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PhoneAgentTicketStatus" AS ENUM ('NEW', 'REVIEWED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PhoneAgentUrgency" AS ENUM ('ROUTINE', 'SAME_DAY', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "PhoneAgentIssueType" AS ENUM ('EQUIPMENT_FAILURE', 'CHEMICAL_WATER_QUALITY', 'LEAK', 'NO_SHOW_COMPLAINT', 'BILLING', 'OTHER');

-- CreateEnum
CREATE TYPE "PhoneAgentPhoneTreeSelection" AS ENUM ('NEW_REQUEST', 'EXISTING_CUSTOMER', 'URGENT', 'MESSAGE');

-- CreateTable
CREATE TABLE "OrgPhoneAgentSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "twilioPhoneNumber" TEXT,
    "primaryPhoneNumber" TEXT,
    "ringTimeoutSeconds" INTEGER NOT NULL DEFAULT 20,
    "businessHours" JSONB,
    "escalationPhones" TEXT[],
    "escalationEmails" TEXT[],
    "serviceTerritoryDescription" TEXT,
    "afterHoursGreeting" TEXT,
    "busyOverflowGreeting" TEXT,
    "afterHoursCallbackPromise" TEXT,
    "busyOverflowCallbackPromise" TEXT,
    "allowedIssueTypes" "PhoneAgentIssueType"[],
    "maxCallsPerDay" INTEGER,
    "maxMinutesPerDay" INTEGER,
    "maxCallDurationSeconds" INTEGER,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPhoneAgentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneAgentCall" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "twilioCallSid" TEXT NOT NULL,
    "callerNumber" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "routedAs" "PhoneAgentRouteReason" NOT NULL,
    "callStatus" "PhoneAgentCallStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "phoneTreeSelection" "PhoneAgentPhoneTreeSelection",
    "recordingUrl" TEXT,
    "rawTranscript" TEXT,
    "aiSummary" TEXT,
    "callerName" TEXT,
    "callerCallbackNumber" TEXT,
    "propertyAddress" TEXT,
    "issueType" "PhoneAgentIssueType",
    "urgency" "PhoneAgentUrgency",
    "requestedCallbackTime" TEXT,
    "ticketStatus" "PhoneAgentTicketStatus" NOT NULL DEFAULT 'NEW',
    "durationSeconds" INTEGER,
    "estimatedCost" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneAgentCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneAgentDailyUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "totalDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneAgentDailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgPhoneAgentSettings_organizationId_key" ON "OrgPhoneAgentSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgPhoneAgentSettings_twilioPhoneNumber_key" ON "OrgPhoneAgentSettings"("twilioPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneAgentCall_twilioCallSid_key" ON "PhoneAgentCall"("twilioCallSid");

-- CreateIndex
CREATE INDEX "PhoneAgentCall_organizationId_idx" ON "PhoneAgentCall"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneAgentDailyUsage_organizationId_date_key" ON "PhoneAgentDailyUsage"("organizationId", "date");

-- AddForeignKey
ALTER TABLE "OrgPhoneAgentSettings" ADD CONSTRAINT "OrgPhoneAgentSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPhoneAgentSettings" ADD CONSTRAINT "OrgPhoneAgentSettings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneAgentCall" ADD CONSTRAINT "PhoneAgentCall_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneAgentDailyUsage" ADD CONSTRAINT "PhoneAgentDailyUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown --
-- each new table needs it set explicitly, same convention as every other feature this
-- session. PhoneAgentCall in particular carries caller PII (phone numbers, transcripts,
-- addresses) that must never be readable by a non-admin client role.
ALTER TABLE "OrgPhoneAgentSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhoneAgentCall" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhoneAgentDailyUsage" ENABLE ROW LEVEL SECURITY;
