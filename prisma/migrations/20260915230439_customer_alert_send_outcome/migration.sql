-- CreateEnum
CREATE TYPE "CustomerAlertSendOutcome" AS ENUM ('SENT', 'PARTIAL', 'FAILED', 'NO_RECIPIENTS');

-- AlterTable
ALTER TABLE "CustomerAlert" ADD COLUMN     "sendOutcome" "CustomerAlertSendOutcome",
ADD COLUMN     "recipientCount" INTEGER,
ADD COLUMN     "failedRecipientCount" INTEGER;
