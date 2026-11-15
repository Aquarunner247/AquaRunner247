-- A pay rate belongs to the VENUE, not to a technician.
--
-- TechnicianPayRate was keyed on (technicianId, bodyOfWaterId): the same figure had to be
-- re-entered for every technician who might ever cover a stop, and the first time somebody
-- new covered one it resolved to no rate at all and silently paid nothing toward their
-- estimated earnings. The job is worth what it is worth, so the rate moves onto the body of
-- water and whoever runs it that day is paid the same.
--
-- Renamed rather than rebuilt, so every existing row (and its effective-dated history)
-- carries over -- and so RLS, already enabled on this table by 20260810120000, stays
-- enabled: it is a table property and survives a rename.
--
-- WHAT THIS DOES TO EXISTING DATA: nothing to any dollar figure. Checked against production
-- on 2026-11-14 before writing this -- 41 rows, and every body of water with more than one
-- active rate had exactly ONE distinct amount across its technicians (Cornerstone Park's
-- three venues, Fifty101, Milennium East and Pacific Harbors' two each). No two rows shared
-- a (body of water, effective date) either, so the de-duplication below deleted zero rows
-- there. It is here for other databases, where two technicians' rates for one venue on one
-- day would otherwise leave the lookup choosing between two rows arbitrarily.

ALTER TABLE "TechnicianPayRate" RENAME TO "VenuePayRate";

-- Constraint and index names are generated from the model name, so they are renamed too --
-- otherwise the next migration Prisma generates for this table collides with stale names.
ALTER TABLE "VenuePayRate" RENAME CONSTRAINT "TechnicianPayRate_pkey" TO "VenuePayRate_pkey";
ALTER TABLE "VenuePayRate" RENAME CONSTRAINT "TechnicianPayRate_organizationId_fkey" TO "VenuePayRate_organizationId_fkey";
ALTER TABLE "VenuePayRate" RENAME CONSTRAINT "TechnicianPayRate_bodyOfWaterId_fkey" TO "VenuePayRate_bodyOfWaterId_fkey";
ALTER TABLE "VenuePayRate" RENAME CONSTRAINT "TechnicianPayRate_bundledIntoBodyOfWaterId_fkey" TO "VenuePayRate_bundledIntoBodyOfWaterId_fkey";
ALTER TABLE "VenuePayRate" RENAME CONSTRAINT "TechnicianPayRate_createdByUserId_fkey" TO "VenuePayRate_createdByUserId_fkey";

ALTER INDEX "TechnicianPayRate_organizationId_idx" RENAME TO "VenuePayRate_organizationId_idx";
ALTER INDEX "TechnicianPayRate_bundledIntoBodyOfWaterId_idx" RENAME TO "VenuePayRate_bundledIntoBodyOfWaterId_idx";
ALTER INDEX "TechnicianPayRate_createdByUserId_idx" RENAME TO "VenuePayRate_createdByUserId_idx";

-- One row per (organization, venue, effective date). An ACTIVE row always wins over a
-- voided one -- the active row is the rate that was actually in force, and keeping the
-- voided one instead would resurrect a rate an admin had deliberately retired. Among rows
-- of equal standing the most recently entered wins, on the same reasoning the rate table
-- itself uses: the later entry is the admin's more recent word on what the venue pays.
DELETE FROM "VenuePayRate" r
USING "VenuePayRate" keep
WHERE r."organizationId" = keep."organizationId"
  AND r."bodyOfWaterId" = keep."bodyOfWaterId"
  AND r."effectiveDate" = keep."effectiveDate"
  AND r.id <> keep.id
  AND (keep."isActive", keep."createdAt", keep.id) > (r."isActive", r."createdAt", r.id);

-- The technician dimension itself. Dropped last, so the de-duplication above runs while the
-- rows it is collapsing are still distinguishable in a failed-migration dump.
DROP INDEX "TechnicianPayRate_technicianId_bodyOfWaterId_effectiveDate_idx";
DROP INDEX "TechnicianPayRate_bodyOfWaterId_idx";
-- Still under its ORIGINAL name: the constraints renamed above are the ones that survive, and
-- renaming this one on the way to dropping it would be ceremony. (Dropping the column alone
-- would take the constraint with it, but naming it keeps the migration readable as a list of
-- what is going away.)
ALTER TABLE "VenuePayRate" DROP CONSTRAINT "TechnicianPayRate_technicianId_fkey";
ALTER TABLE "VenuePayRate" DROP COLUMN "technicianId";

-- Replaces both dropped indexes at once: the lookup is now "this venue's rates, newest
-- effective date first" (lib/technician-pay.ts's loadActiveRatesByBody).
CREATE INDEX "VenuePayRate_bodyOfWaterId_effectiveDate_idx" ON "VenuePayRate"("bodyOfWaterId", "effectiveDate");
