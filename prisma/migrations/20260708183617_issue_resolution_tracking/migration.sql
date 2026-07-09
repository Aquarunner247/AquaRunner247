-- AlterTable
ALTER TABLE "VisitIssueFlag" ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "VisitIssueFlag_resolved_idx" ON "VisitIssueFlag"("resolved");
