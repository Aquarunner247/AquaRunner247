-- AlterTable
ALTER TABLE "PhoneAgentCall" ADD COLUMN     "matchedPhoneField" TEXT,
ADD COLUMN     "matchedPropertyId" TEXT;

-- CreateIndex
CREATE INDEX "PhoneAgentCall_matchedPropertyId_idx" ON "PhoneAgentCall"("matchedPropertyId");

-- AddForeignKey
ALTER TABLE "PhoneAgentCall" ADD CONSTRAINT "PhoneAgentCall_matchedPropertyId_fkey" FOREIGN KEY ("matchedPropertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
