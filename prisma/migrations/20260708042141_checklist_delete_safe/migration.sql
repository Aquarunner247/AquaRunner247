-- DropForeignKey
ALTER TABLE "VisitChecklistCompletion" DROP CONSTRAINT "VisitChecklistCompletion_checklistItemId_fkey";

-- AlterTable
ALTER TABLE "VisitChecklistCompletion" ADD COLUMN     "label" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "checklistItemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "VisitChecklistCompletion" ADD CONSTRAINT "VisitChecklistCompletion_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItemDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Backfill label for any completions that already exist

UPDATE "VisitChecklistCompletion" vcc
SET "label" = cid."label"
FROM "ChecklistItemDefinition" cid
WHERE vcc."checklistItemId" = cid."id" AND vcc."label" = '';
