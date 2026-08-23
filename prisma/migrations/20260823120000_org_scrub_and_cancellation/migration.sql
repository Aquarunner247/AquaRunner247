-- Cancellation data-scrub tracking: when a subscription ends, the org gets a grace
-- period to export before the scrub cron permanently deletes everything not on the
-- compliance-retained allowlist.
ALTER TABLE "Organization" ADD COLUMN "dataScrubScheduledAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "dataScrubbedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "dataScrubSafetyExportBlobPath" TEXT;

-- One row per cancellation-scrub attempt (dry-run or live), for audit/review before the
-- dry-run trial period is turned off.
CREATE TABLE "OrganizationScrubRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "error" TEXT,
    "safetyExportBlobPath" TEXT,
    "deletedCounts" JSONB,

    CONSTRAINT "OrganizationScrubRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationScrubRun_organizationId_idx" ON "OrganizationScrubRun"("organizationId");

ALTER TABLE "OrganizationScrubRun" ADD CONSTRAINT "OrganizationScrubRun_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown --
-- each new table needs it set explicitly, same convention as every other feature this session.
ALTER TABLE "OrganizationScrubRun" ENABLE ROW LEVEL SECURITY;
