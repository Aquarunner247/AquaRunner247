-- Explicit signal for "this state has a confirmed regulatory vacuum" (Idaho, Mississippi),
-- distinct from isSupported and never inferred from ChemistryThreshold row count -- those
-- two states now carry real CDC Model Aquatic Health Code advisory reference data despite
-- having no legal requirement, so "has any data" stopped being a reliable signal for this.
-- Column only, on an already-RLS-enabled table -- same pattern as prior additive migrations.
ALTER TABLE "ComplianceRuleset" ADD COLUMN "hasNoLegalRequirement" BOOLEAN NOT NULL DEFAULT false;
