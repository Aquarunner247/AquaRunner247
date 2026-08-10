-- Supabase's Security Advisor flagged "RLS has not been enabled" on public._prisma_migrations.
-- Checking turned up the same gap on every core app table -- 20260803194700 enabled RLS on
-- ComplianceRuleset (the table actually exposed at the time) and revoked all anon/authenticated
-- grants schema-wide, but never went back and enabled RLS on the rest of the tables that predate
-- that migration. Later migrations (20260807120000, 20260809000000) enabled RLS on every NEW
-- table added since, so this gap was narrowing but never fully closed for the original tables.
--
-- This is NOT an active exposure: anon/authenticated hold zero grants on any public table
-- (verified directly against the DB before writing this), so a PostgREST/Supabase JS call would
-- already fail on the grant check before RLS policies are even consulted. This is defense in
-- depth -- closing the gap so RLS is never the single missing layer if a grant is ever
-- mistakenly restored -- same reasoning as every prior RLS-enabling migration in this project.
--
-- No policies are added. RLS enabled with zero policies denies all access to every role except
-- the table owner and superusers (postgres, which this app's DATABASE_URL connects as and which
-- has rolbypassrls=true regardless) -- exactly the deny-all posture this schema already relies on
-- via revoked grants, just enforced at both layers instead of one.

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdHocStop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BodyOfWater" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BodyOfWaterServiceWeekday" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManagementCompany" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentServiceEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringRoute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringStop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitWaterReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitChemicalDose" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitPhoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitIssueFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitChecklistCompletion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChemistryRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChemicalProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChecklistItemDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChemistryThreshold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FrequencyRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventProtocol" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WaitlistSignup" ENABLE ROW LEVEL SECURITY;
