-- AlterTable
ALTER TABLE "CustomerAlert" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "CustomerAlert_batchId_idx" ON "CustomerAlert"("batchId");
