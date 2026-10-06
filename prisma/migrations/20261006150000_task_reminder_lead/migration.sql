-- How far ahead of its due date a to-do starts showing in the notification bell.
--
-- remindOn is dueOn minus remindDaysBefore, stored rather than derived at query time: the bell filters
-- across every customer, and "dueOn - remindDaysBefore <= today" is a column comparison that a Prisma
-- where cannot express. It is written only by the actions that set dueOn, from one pure helper.
--
-- Existing rows have no due date, so both stay null -- and an undated to-do now appears in the bell
-- immediately rather than never, which is the other half of this change.
ALTER TABLE "CustomerTask" ADD COLUMN "remindDaysBefore" INTEGER;
ALTER TABLE "CustomerTask" ADD COLUMN "remindOn" DATE;

CREATE INDEX "CustomerTask_remindOn_idx" ON "CustomerTask"("remindOn");
-- dueOn is no longer what the bell filters on; it is only ever read within one customer, which the
-- customerId index already covers.
DROP INDEX IF EXISTS "CustomerTask_dueOn_idx";
