-- Fills remindOn for to-dos that got a due date before anything was writing that column.
--
-- The window is real and will recur: a migration is applied minutes before the deploy that uses it, and
-- anything written in between is handled by the OLD code. One to-do was created exactly that way on
-- 2026-10-06 -- it had a due date and a null remindOn, which matched neither branch of the bell's filter,
-- so it would have been invisible in the one place it was supposed to appear.
--
-- Treated as "remind on the day": there is no record of a lead time having been chosen, and the due date
-- is the one thing that was definitely meant. The bell also now falls back to dueOn when remindOn is
-- null, so this is belt and braces rather than the only defence.
UPDATE "CustomerTask"
SET "remindOn" = "dueOn",
    "remindDaysBefore" = COALESCE("remindDaysBefore", 0)
WHERE "dueOn" IS NOT NULL AND "remindOn" IS NULL;
