-- Rate limiting for the public waitlist endpoint. Vercel BotID already blocks automated clients and
-- remains the first check; this table backs the second layer, against a human (or a bot that gets
-- past BotID) submitting repeatedly.
--
-- Postgres-backed because this runs on Fluid Compute: an in-process counter is per-instance, so a
-- caller spread across instances would never reach a limit.
--
-- ipHash is an HMAC of the caller's address, never the address itself. Rows are pruned past twice
-- the limiting window, so no long-lived record of who visited is kept.

CREATE TABLE "WaitlistAttempt" (
    "id"        TEXT NOT NULL,
    "ipHash"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistAttempt_pkey" PRIMARY KEY ("id")
);

-- Serves the per-caller count inside the window, which is the hot path.
CREATE INDEX "WaitlistAttempt_ipHash_createdAt_idx" ON "WaitlistAttempt"("ipHash", "createdAt");
-- Serves the pruning sweep.
CREATE INDEX "WaitlistAttempt_createdAt_idx" ON "WaitlistAttempt"("createdAt");

-- Matches every other table in this database: RLS on with no policies, i.e. the anon key can do
-- nothing. All access is through Prisma on the pooled connection.
ALTER TABLE "WaitlistAttempt" ENABLE ROW LEVEL SECURITY;
