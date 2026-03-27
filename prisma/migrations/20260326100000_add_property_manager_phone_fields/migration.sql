-- Add dedicated manager phone fields while keeping legacy managerPhone for compatibility.
ALTER TABLE "Property"
ADD COLUMN "managerBusinessPhone" TEXT,
ADD COLUMN "managerMobilePhone" TEXT;
