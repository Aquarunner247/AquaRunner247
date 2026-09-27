-- Service window for a recurring route. Both bounds inclusive and nullable:
-- startsOn NULL = no start bound, endsOn NULL = never ends. DATE (not TIMESTAMP)
-- because a route starts on a calendar day, not at an instant.
ALTER TABLE "RecurringRoute" ADD COLUMN     "startsOn" DATE;
ALTER TABLE "RecurringRoute" ADD COLUMN     "endsOn" DATE;
