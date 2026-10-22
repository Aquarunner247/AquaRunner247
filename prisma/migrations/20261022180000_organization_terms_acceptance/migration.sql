-- Clickwrap: record that an organization was shown, and accepted, the Terms of Service,
-- EULA and Privacy Policy.
--
-- Until now nothing in the product presented the Terms. They were reachable only from the
-- marketing footer, which is browsewrap -- the form courts decline to enforce precisely when
-- the clause being enforced is an arbitration agreement, a class-action waiver or a liability
-- cap. Terms of Service Section 23 picks Nevada law and Clark County venue, so the Ninth
-- Circuit standard governs: conspicuous notice AND an unambiguous act of assent.
--
-- Both nullable with no default. Every existing organization gets NULL, which is the honest
-- record -- they were never shown the Terms -- and must not be backfilled with a guess.
-- Applied to production before the code that selects these columns deployed.
ALTER TABLE "Organization"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsAcceptedVersion" TEXT;
