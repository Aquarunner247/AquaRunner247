-- Adds indexes on foreign key columns flagged by Supabase's performance advisor
-- (unindexed_foreign_keys) as missing a covering index. All 8 tables here are small at
-- current data volume, so a plain CREATE INDEX (brief table lock) is fine -- no need for
-- CONCURRENTLY, which can't run inside Prisma's migration transaction anyway.

CREATE INDEX "CustomerAlert_createdByUserId_idx" ON "CustomerAlert"("createdByUserId");
CREATE INDEX "ContaminationIncident_recordedByUserId_idx" ON "ContaminationIncident"("recordedByUserId");
CREATE INDEX "RecurringStop_bodyOfWaterId_idx" ON "RecurringStop"("bodyOfWaterId");
CREATE INDEX "AdHocStop_propertyId_idx" ON "AdHocStop"("propertyId");
CREATE INDEX "AdHocStop_createdByUserId_idx" ON "AdHocStop"("createdByUserId");
CREATE INDEX "OrgPayrollSettings_updatedByUserId_idx" ON "OrgPayrollSettings"("updatedByUserId");
CREATE INDEX "TechnicianPayRate_bundledIntoBodyOfWaterId_idx" ON "TechnicianPayRate"("bundledIntoBodyOfWaterId");
CREATE INDEX "TechnicianPayRate_createdByUserId_idx" ON "TechnicianPayRate"("createdByUserId");
