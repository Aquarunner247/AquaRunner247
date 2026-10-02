-- Portal logins gain a purpose, and log readings gain an author.
--
-- CustomerUserRole.MAINTENANCE is the property's own maintenance person: they may log daily chemistry
-- readings and see only the log and the chemical safety data sheets. Everything existing defaults to
-- CUSTOMER, which is the whole portal exactly as it is today.
--
-- activatedAt records the first time a login is seen signed in, so the organization can be told the
-- customer actually came through the welcome email. Null for every existing row: not backfilled,
-- because a stamp invented now would claim a date nobody observed, and the notification is only
-- interesting going forward.
--
-- ServiceVisit.loggedByCustomerUserId says who recorded a log-only reading. ON DELETE SET NULL, not
-- CASCADE: deleting a portal login must never delete the compliance records that person logged.
CREATE TYPE "CustomerUserRole" AS ENUM ('CUSTOMER', 'MAINTENANCE');

ALTER TABLE "CustomerUser" ADD COLUMN "role" "CustomerUserRole" NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "CustomerUser" ADD COLUMN "activatedAt" TIMESTAMP(3);

ALTER TABLE "ServiceVisit" ADD COLUMN "loggedByCustomerUserId" TEXT;
ALTER TABLE "ServiceVisit"
  ADD CONSTRAINT "ServiceVisit_loggedByCustomerUserId_fkey"
  FOREIGN KEY ("loggedByCustomerUserId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ServiceVisit_loggedByCustomerUserId_idx" ON "ServiceVisit"("loggedByCustomerUserId");
