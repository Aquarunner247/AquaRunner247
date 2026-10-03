-- Contacts at a customer that are not tied to one property: regional managers, assistant managers,
-- accounts payable. Property already carries manager/maintenance/HOA/owner contacts for whoever is
-- responsible for that address; a regional manager covering nine properties belongs to the account.
--
-- Reference only. Nothing reads this table to decide who gets email -- that stays with
-- propertyContactEmail -- so adding a contact cannot change who receives service summaries or alerts.
--
-- ON DELETE CASCADE: these contacts exist only as part of the customer record, and a deleted customer
-- should not leave orphaned names and phone numbers behind.
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");

ALTER TABLE "CustomerContact"
  ADD CONSTRAINT "CustomerContact_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
