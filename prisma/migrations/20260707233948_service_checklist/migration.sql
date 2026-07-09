-- CreateTable
CREATE TABLE "ChecklistItemDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItemDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitChecklistCompletion" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VisitChecklistCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItemDefinition_organizationId_idx" ON "ChecklistItemDefinition"("organizationId");

-- CreateIndex
CREATE INDEX "VisitChecklistCompletion_visitId_idx" ON "VisitChecklistCompletion"("visitId");

-- CreateIndex
CREATE INDEX "VisitChecklistCompletion_checklistItemId_idx" ON "VisitChecklistCompletion"("checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitChecklistCompletion_visitId_checklistItemId_key" ON "VisitChecklistCompletion"("visitId", "checklistItemId");

-- AddForeignKey
ALTER TABLE "ChecklistItemDefinition" ADD CONSTRAINT "ChecklistItemDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChecklistCompletion" ADD CONSTRAINT "VisitChecklistCompletion_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChecklistCompletion" ADD CONSTRAINT "VisitChecklistCompletion_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItemDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Seed default checklist items for every existing organization
INSERT INTO "ChecklistItemDefinition" ("id", "organizationId", "label", "sortOrder", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", item.label, item.sort_order, true, now(), now()
FROM "Organization" o
CROSS JOIN (
  VALUES
    ('Empty skimmer baskets', 1),
    ('Vacuum', 2),
    ('Skim surface', 3),
    ('Brush down pool walls', 4),
    ('Clean waterline tile', 5),
    ('Wipe oil buildup from skimmers', 6),
    ('Charged with DE', 7),
    ('Visual check safety equipment', 8),
    ('Visual check pump room for cleanliness and/or leaks', 9)
) AS item(label, sort_order);
