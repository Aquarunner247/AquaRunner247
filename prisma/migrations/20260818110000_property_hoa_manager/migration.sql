-- Adds HOA classification + a separate HOA manager contact block to Property.
ALTER TABLE "Property" ADD COLUMN "isHOA" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN "hoaManagerName" TEXT;
ALTER TABLE "Property" ADD COLUMN "hoaManagerPhone" TEXT;
ALTER TABLE "Property" ADD COLUMN "hoaManagerEmail" TEXT;
