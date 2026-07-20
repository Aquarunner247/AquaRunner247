-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "accessNotes" TEXT,
ADD COLUMN     "hasDog" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerEmail" TEXT,
ADD COLUMN     "ownerHomePhone" TEXT,
ADD COLUMN     "ownerMobilePhone" TEXT,
ADD COLUMN     "ownerName" TEXT;
