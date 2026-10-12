/**
 * Does @prisma/adapter-pg work against Supabase's TRANSACTION pooler (port 6543)?
 *
 * Production runs the SESSION pooler (5432) because the transaction pooler was documented as
 * breaking prepared statements, which this driver-adapter setup relies on. That finding was never
 * re-tested against this stack -- a web search came back ambiguous -- and it matters: the session
 * pooler's connection ceiling is what produced the EMAXCONNSESSION outage on 2026-09-18, while the
 * transaction pooler scales to far more clients.
 *
 * STRICTLY READ-ONLY. Every statement below is a SELECT or a count. It opens a transaction, but
 * only to read inside it, and nothing is written at any point.
 *
 * Run it yourself so no credential passes through a chat:
 *
 *   POOLER_URL='postgresql://postgres.<ref>:<password>@<host>:6543/postgres' \
 *     node --env-file=.env node_modules/.bin/tsx scripts/test-transaction-pooler.ts
 *
 * The URL is the one in Supabase under Project Settings > Database > Connection string >
 * Transaction pooler. It differs from production's only in the port (6543, not 5432).
 *
 * Repetition is the point. A prepared-statement clash does not appear on first use -- it appears
 * when the same statement is re-prepared on a connection that already has it, which needs several
 * runs across a pool of more than one connection. Each shape runs REPEATS times.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";

const REPEATS = 8;

function stripSslModeQuery(connectionString: string): string {
  const q = connectionString.indexOf("?");
  if (q === -1) return connectionString;
  const base = connectionString.slice(0, q);
  const parts = connectionString
    .slice(q + 1)
    .split("&")
    .filter((p) => p.length > 0 && !/^sslmode=/i.test(p));
  return parts.length > 0 ? `${base}?${parts.join("&")}` : base;
}

type Result = { shape: string; ok: boolean; detail: string };

/** Prisma prefixes a message with a numbered code frame, so the first line is usually blank or a
 *  fragment of this file. Take the first line that actually says something. */
function firstUsefulLine(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const line = message
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^\d+\s/.test(l) && !l.startsWith("→") && !l.startsWith("|"));
  return (line ?? message.trim() ?? "unknown error").slice(0, 160);
}

async function run(shape: string, fn: () => Promise<unknown>, results: Result[]) {
  try {
    for (let i = 0; i < REPEATS; i++) await fn();
    results.push({ shape, ok: true, detail: `${REPEATS}/${REPEATS} runs` });
  } catch (err) {
    const detail = firstUsefulLine(err);
    results.push({
      shape,
      ok: false,
      // An auth failure says nothing about prepared statements, which is the whole question here --
      // make sure it is never mistaken for a pooler incompatibility.
      detail: /SASL|password authentication|authentication failed/i.test(detail)
        ? `${detail}  <- credentials, NOT a pooler limitation`
        : detail,
    });
  }
}

async function main() {
  const raw = process.env.POOLER_URL;
  if (!raw) {
    console.error("POOLER_URL is not set. See the header of this file for the command.");
    process.exit(1);
  }
  // ALLOW_ANY_PORT exists so this can be smoke-tested against a local database before anyone runs
  // it against production -- proving the script works is separate from what it measures.
  if (!/:6543\//.test(raw) && process.env.ALLOW_ANY_PORT !== "1") {
    console.error("POOLER_URL is not on port 6543 -- that is the session pooler, which already works.");
    console.error("Set ALLOW_ANY_PORT=1 to run it elsewhere anyway (smoke test only).");
    process.exit(1);
  }

  /**
   * Printed BEFORE connecting, and never with the password.
   *
   * The first real run of this failed with four lines of "SASL authentication failed" and nothing
   * else, because the target was only reported in the summary at the end. An auth failure is almost
   * always the username or the host rather than the pooler, and the output has to say which was
   * tried for that to be obvious.
   */
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(raw);
  } catch {
    console.error("POOLER_URL is not a valid URL. If the password contains @ / : ? # or %, it must be percent-encoded.");
    process.exit(1);
  }
  const user = decodeURIComponent(parsedUrl.username);
  console.log(`\nConnecting as  ${user}`);
  console.log(`to             ${parsedUrl.hostname}:${parsedUrl.port || "5432"}`);
  console.log(`password       ${parsedUrl.password ? `${parsedUrl.password.length} characters` : "MISSING"}`);

  const looksLikePoolerHost = /\.pooler\.supabase\.com$/i.test(parsedUrl.hostname);
  const looksLikePoolerUser = /^postgres\.[a-z0-9]+$/i.test(user);
  if (!looksLikePoolerHost || !looksLikePoolerUser) {
    console.log("\n  Heads up, this does not look like a pooler connection string:");
    if (!looksLikePoolerHost) {
      console.log(`    - host is "${parsedUrl.hostname}", expected something.pooler.supabase.com`);
      console.log("      (db.<ref>.supabase.co is the DIRECT connection -- changing its port does not reach the pooler)");
    }
    if (!looksLikePoolerUser) {
      console.log(`    - user is "${user}", expected postgres.<project-ref>`);
      console.log("      (plain \"postgres\" is the direct connection's user; the poolers need the project ref)");
    }
    console.log("    Copy the Transaction pooler string from Supabase > Project Settings > Database.\n");
  }

  // Same pool and TLS handling as lib/prisma.ts, so this tests the real setup rather than a
  // simplified one. max: 2 also means a second connection exists to clash with the first.
  // Same TLS decision as lib/prisma.ts, including its localPlain case -- a local Postgres speaks no
  // SSL, and forcing it there makes every shape fail for a reason that has nothing to do with the
  // pooler. Found exactly that way while smoke-testing this script.
  const localPlain = /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(raw) && !raw.toLowerCase().includes("sslmode=");
  const pool = new Pool({
    connectionString: localPlain ? raw : stripSslModeQuery(raw),
    ...(localPlain ? {} : { ssl: { rejectUnauthorized: false } }),
    max: 2,
    idleTimeoutMillis: 60_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error"] });

  const results: Result[] = [];

  await run("simple findMany", () => prisma.organization.findMany({ select: { id: true }, take: 1 }), results);
  await run("count", () => prisma.serviceVisit.count(), results);
  await run(
    "findMany + nested include (the visit page's shape)",
    () =>
      prisma.serviceVisit.findMany({
        take: 2,
        orderBy: { scheduledStart: "desc" },
        include: { property: { select: { name: true } }, bodyOfWater: { select: { name: true } }, doses: true },
      }),
    results,
  );
  await run(
    "varying arguments (new bind values, same statement)",
    () => prisma.serviceVisit.findMany({ take: 1 + Math.floor(Math.random() * 3), select: { id: true } }),
    results,
  );
  await run("groupBy", () => prisma.serviceVisit.groupBy({ by: ["status"], _count: { _all: true } }), results);
  await run(
    "interactive transaction (read-only inside)",
    () =>
      prisma.$transaction(async (tx) => {
        await tx.organization.count();
        await tx.serviceVisit.count();
      }),
    results,
  );
  await run("$queryRaw", () => prisma.$queryRaw`select 1 as ok`, results);
  await run(
    "concurrent Promise.all (both pool connections at once)",
    () => Promise.all([prisma.organization.count(), prisma.serviceVisit.count(), prisma.property.count()]),
    results,
  );

  await prisma.$disconnect();
  await pool.end();

  // Name the target in the output. Run with ALLOW_ANY_PORT against a local database this still
  // passes every shape, and a result that reads "the transaction pooler is viable" when it never
  // touched a pooler is worse than no result at all.
  const onTransactionPooler = /:6543\//.test(raw);
  const target = (() => {
    try {
      const u = new URL(raw);
      return `${u.hostname}:${u.port || "5432"}`;
    } catch {
      return "unknown host";
    }
  })();

  const pad = Math.max(...results.map((r) => r.shape.length));
  console.log(`\nTarget: ${target}${onTransactionPooler ? " (transaction pooler)" : " — NOT the transaction pooler"}`);
  console.log(`${REPEATS} runs per shape\n`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.shape.padEnd(pad)}  ${r.detail}`);

  const failed = results.filter((r) => !r.ok);
  if (!onTransactionPooler) {
    console.log(
      `\n${failed.length === 0 ? "All shapes passed" : `${failed.length} shape(s) failed`}, but this did not run against the transaction pooler, so it says nothing about it. This only proves the script works.\n`,
    );
  } else {
    console.log(
      failed.length === 0
        ? "\nAll shapes passed on the transaction pooler. It is viable for this stack; the remaining question is whether to move, not whether it works.\n"
        : `\n${failed.length} shape(s) failed on the transaction pooler -- the session pooler stays. Keep this output with the finding.\n`,
    );
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
