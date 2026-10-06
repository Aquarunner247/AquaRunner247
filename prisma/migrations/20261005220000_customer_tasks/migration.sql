-- To-dos the office keeps against a customer: take the new pump basket to Borgata, chase the signed
-- contract, ask about the gym spa heater.
--
-- Distinct from a VisitIssueFlag, which a technician raises about what he found on a visit, and from a
-- CustomerAlert, which is a message sent TO the customer. This is the office's own list and is never
-- shown to a customer.
--
-- dueOn is a DATE, not a timestamp: "Tuesday" is what an office writes down, and a due time of 14:32
-- would be false precision. It round-trips as UTC midnight, so comparing it against "today" resolves
-- today in the organization's timezone first -- see lib/customer-task-due.ts, and the compliance-log
-- bug on 2026-10-02 for what happens when that step is skipped.
--
-- completedAt rather than deleting: "what did we say we would do for them" survives being done, where a
-- deleted row answers nothing later. The two user references are SET NULL so removing a staff member
-- never deletes the customer's to-do history.
CREATE TABLE "CustomerTask" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "dueOn" DATE,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerTask_customerId_idx" ON "CustomerTask"("customerId");
-- The notification bell filters on dueOn across every customer, not within one.
CREATE INDEX "CustomerTask_dueOn_idx" ON "CustomerTask"("dueOn");

ALTER TABLE "CustomerTask"
  ADD CONSTRAINT "CustomerTask_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerTask"
  ADD CONSTRAINT "CustomerTask_completedByUserId_fkey"
  FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerTask"
  ADD CONSTRAINT "CustomerTask_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
