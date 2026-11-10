-- Enable row-level security on the five public tables that were still without it.
--
-- Background: on 2026-07-17 every table in this database was found with RLS disabled while the
-- Supabase anon key was public, which is reachable data. That was fixed table by table, and the
-- fix has been reapplied to new tables ever since -- except these five, which Prisma created
-- after it. Prisma does not manage RLS, so a `CREATE TABLE` from a migration always lands with
-- RLS off and nobody is told.
--
-- Checked before writing this, because "enable RLS" with no policies locks a table outright if
-- the application's role is an ordinary one:
--   - All five are owned by `postgres`, and a table's owner is not subject to RLS unless the
--     table also has FORCE ROW LEVEL SECURITY, which is deliberately not set here.
--   - `postgres` and `service_role` both carry rolbypassrls; `anon` and `authenticated` do not.
--   - `Organization` and `Property` already sit in exactly this state -- rls on, force off, zero
--     policies -- and are read on every request. So this configuration is already proven in
--     production rather than assumed.
--
-- This is defence in depth, not a breach fix: `anon` and `authenticated` hold no grants at all
-- on these five, so PostgREST cannot read them today with or without RLS. It closes the gap
-- where a later `GRANT` to anon, or a table exposed through the API by someone else, would
-- silently become world-readable because RLS was never switched on.

ALTER TABLE "CustomerContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceMessageTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TermsAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WelcomeEmailSend" ENABLE ROW LEVEL SECURITY;
