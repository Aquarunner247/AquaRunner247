-- Residential checklist: a second, separate list of checklist items.
--
-- Commercial is deliberately untouched. Every existing ChecklistItemDefinition row takes
-- scope = COMMERCIAL by the column default, so commercial visits see exactly what they saw before;
-- residential visits previously got an empty list in code (`isResidential ? [] : ...`) and now get
-- the list below.
--
-- `required` blocks closing the stop, like a required reading. `billable` marks the work normally
-- charged for on top of the service -- the ($) items on the list the operator supplied. No price is
-- seeded: what to charge is each company's decision, and VisitChecklistCompletion.chargeAmount
-- snapshots whatever it was when the item was ticked, so changing it never rewrites a past visit.

-- CreateEnum
CREATE TYPE "ChecklistScope" AS ENUM ('COMMERCIAL', 'RESIDENTIAL');

-- AlterTable
ALTER TABLE "ChecklistItemDefinition" ADD COLUMN     "billable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "chargeAmount" DECIMAL(10,2),
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scope" "ChecklistScope" NOT NULL DEFAULT 'COMMERCIAL';

-- AlterTable
ALTER TABLE "VisitChecklistCompletion" ADD COLUMN     "chargeAmount" DECIMAL(10,2);

-- Seed the residential list for every organization that already exists. New organizations get the
-- same list from lib/default-residential-checklist.ts at signup; this is the one-off for the ones
-- created before it existed. Guarded by NOT EXISTS so re-running changes nothing.
INSERT INTO "ChecklistItemDefinition" ("id", "organizationId", "label", "category", "billable", "sortOrder", "scope", "active", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    o."id",
    seed.label,
    seed.category,
    seed.billable,
    seed.sort_order,
    'RESIDENTIAL',
    true,
    now(),
    now()
FROM "Organization" o
CROSS JOIN (VALUES
    ('Water level', 'Daily & As-Needed', false, 0),
    ('Skimmer baskets', 'Daily & As-Needed', false, 1),
    ('Pump baskets', 'Daily & As-Needed', false, 2),
    ('Pressure gauge', 'Daily & As-Needed', false, 3),
    ('Sanitizer output', 'Daily & As-Needed', false, 4),
    ('Surface skimming', 'Weekly Maintenance', false, 5),
    ('Wall and floor brushing', 'Weekly Maintenance', false, 6),
    ('Waterline tile', 'Weekly Maintenance', false, 7),
    ('Vacuuming', 'Weekly Maintenance', false, 8),
    ('pH testing and adjustment', 'Weekly Maintenance', false, 9),
    ('Total Alkalinity testing and adjustment', 'Weekly Maintenance', false, 10),
    ('Free Chlorine testing and adjustment', 'Weekly Maintenance', false, 11),
    ('Shock treatment', 'Weekly Maintenance', true, 12),
    ('Pump schedule verification', 'Weekly Maintenance', false, 13),
    ('Backwashing', 'Weekly Maintenance', false, 14),
    ('Filter deep cleaning', 'Monthly & Seasonal', true, 15),
    ('Calcium Hardness testing and adjustment', 'Monthly & Seasonal', true, 16),
    ('Cyanuric Acid (stabilizer) testing and adjustment', 'Monthly & Seasonal', true, 17),
    ('Salt cell scale inspection', 'Monthly & Seasonal', true, 18),
    ('O-ring and gasket lubrication', 'Monthly & Seasonal', true, 19),
    ('Equipment pad leak checks', 'Monthly & Seasonal', false, 20)
) AS seed(label, category, billable, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM "ChecklistItemDefinition" existing
    WHERE existing."organizationId" = o."id"
      AND existing."scope" = 'RESIDENTIAL'
      AND existing."label" = seed.label
);
