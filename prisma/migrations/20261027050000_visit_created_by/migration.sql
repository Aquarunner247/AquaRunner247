-- Who created this visit by hand, when a person did.
--
-- Nullable with no default and never backfilled. Null means "no staff member created this",
-- which is the honest answer for the three cases that already record themselves: a generated
-- visit has recurringStopId, a portal reading has loggedByCustomerUserId, a move has a
-- movedFrom. It is also the only possible answer for every row written before this column
-- existed, and inventing an author for those would be worse than admitting we cannot say.
--
-- ON DELETE SET NULL, not CASCADE: removing a staff member must never delete service history.
-- A visit outlives the person who entered it, and the compliance log depends on that.
ALTER TABLE "ServiceVisit" ADD COLUMN "createdById" TEXT;

ALTER TABLE "ServiceVisit"
  ADD CONSTRAINT "ServiceVisit_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
