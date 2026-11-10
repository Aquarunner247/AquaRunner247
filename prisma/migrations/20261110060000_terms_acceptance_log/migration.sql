-- One row per act of assent to the legal documents.
--
-- Until now the only record was Organization.termsAcceptedAt/termsAcceptedVersion, which are
-- overwritten on re-acceptance. Enforcing arbitration, the liability cap or the DPA's
-- Section 9.5 retention instruction means producing evidence that a named person accepted a
-- specific version at a stated time, which an overwritten pair of columns cannot do.
--
-- Additive only: no existing column changes and nothing is backfilled. An organization that
-- has never accepted keeps termsAcceptedVersion NULL and will be prompted on next admin
-- login rather than having consent invented for it.

CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedByEmail" TEXT NOT NULL,
    "acceptedByName" TEXT,
    "acceptedByRole" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documents" TEXT[],
    "context" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TermsAcceptance_organizationId_acceptedAt_idx" ON "TermsAcceptance"("organizationId", "acceptedAt");

CREATE INDEX "TermsAcceptance_acceptedByUserId_idx" ON "TermsAcceptance"("acceptedByUserId");

ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: lib/org-scrub.ts deletes every User row for a canceled org, and
-- deleting a staff member must not delete the evidence that their organization accepted the
-- Terms. acceptedByEmail preserves who it was after the User row is gone.
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
