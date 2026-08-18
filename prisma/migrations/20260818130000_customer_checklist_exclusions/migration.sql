-- Opt-out per customer: a checklist item applies to every customer unless a row exists here.
CREATE TABLE "CustomerChecklistExclusion" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerChecklistExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerChecklistExclusion_customerId_checklistItemId_key" ON "CustomerChecklistExclusion"("customerId", "checklistItemId");
CREATE INDEX "CustomerChecklistExclusion_customerId_idx" ON "CustomerChecklistExclusion"("customerId");
CREATE INDEX "CustomerChecklistExclusion_checklistItemId_idx" ON "CustomerChecklistExclusion"("checklistItemId");

ALTER TABLE "CustomerChecklistExclusion" ADD CONSTRAINT "CustomerChecklistExclusion_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerChecklistExclusion" ADD CONSTRAINT "CustomerChecklistExclusion_checklistItemId_fkey"
    FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItemDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown --
-- each new table needs it set explicitly, same convention as every other feature this session.
ALTER TABLE "CustomerChecklistExclusion" ENABLE ROW LEVEL SECURITY;
