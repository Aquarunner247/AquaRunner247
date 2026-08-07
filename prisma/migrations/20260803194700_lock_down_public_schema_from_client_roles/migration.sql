-- Lock the public schema down to Prisma only.
--
-- WHY
-- All application data access goes through Prisma on a direct Postgres
-- connection (owner role). The Supabase JS client is used for auth only, plus
-- storage buckets via the service_role key. No client role needs privileges on
-- public.*, but they had them, which meant:
--
--   1. "ComplianceRuleset" had RLS disabled entirely and a SELECT grant to
--      anon, so all 51 state compliance rulesets were readable by anyone
--      holding the publishable key -- which ships in the frontend bundle.
--
--   2. "_prisma_migrations" had a policy named "deny_all_clients" that looked
--      protective but is PERMISSIVE. Postgres combines permissive policies with
--      OR, not AND, so the four prisma_allow_authenticated_* policies granting
--      USING (true) overrode it. Any signed-in user could rewrite migration
--      history.
--
--   3. Every other table, while correctly protected by RLS returning zero rows,
--      still had table-level SELECT granted to anon and authenticated. That
--      exposed the full schema shape (table and column names) through the
--      PostgREST and GraphQL endpoints even though no data leaked.
--
-- This migration is idempotent and was already applied to production on
-- 2026-08-03. Re-running it is a no-op.

-- 1. RLS on the one table that had it disabled.
ALTER TABLE public."ComplianceRuleset" ENABLE ROW LEVEL SECURITY;

-- 2. Drop the policies that made "deny_all_clients" ineffective.
--    migrations_role keeps its own policies and Prisma bypasses RLS as owner.
DROP POLICY IF EXISTS "prisma_allow_authenticated_select" ON public."_prisma_migrations";
DROP POLICY IF EXISTS "prisma_allow_authenticated_insert" ON public."_prisma_migrations";
DROP POLICY IF EXISTS "prisma_allow_authenticated_update" ON public."_prisma_migrations";
DROP POLICY IF EXISTS "prisma_allow_authenticated_delete" ON public."_prisma_migrations";

-- 3. Remove all privileges from the client roles.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- 4. Stop future Prisma-created tables from silently regaining those grants.
--    Without this, the next `prisma migrate` reintroduces the exposure.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Auth (auth schema), storage buckets, Prisma, and the service_role key are
-- unaffected. Login and photo uploads keep working.
--
-- To reverse:
--   GRANT USAGE ON SCHEMA public TO anon, authenticated;
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
