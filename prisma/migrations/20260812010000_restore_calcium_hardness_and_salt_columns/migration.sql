-- Re-adds VisitWaterReading.calciumHardnessPpm/saltPpm, which were previously only
-- created by the dosing-calculator schema migration (20260809000000_dosing_calculator_schema).
-- That migration was removed when the dosing calculator was excluded from the
-- master/feature-compliance-ruleset reconciliation, but these two columns are used
-- independently as opt-in reading inputs on the visit chemistry form, unrelated to the
-- dosing calculator itself -- see app/dashboard/visits/[id]/visit-form.tsx.
ALTER TABLE "VisitWaterReading" ADD COLUMN     "calciumHardnessPpm" DECIMAL(8,2);
ALTER TABLE "VisitWaterReading" ADD COLUMN     "saltPpm" DECIMAL(8,2);
