/**
 * Says out loud which database a maintenance script is about to read or change.
 *
 * `.env` here points DATABASE_URL at the LOCAL Supabase stack (127.0.0.1:54322), which is right for
 * development and wrong for a cleanup: `db:prune-duplicate-doses --apply` was run against production
 * data in intent and against localhost in fact, found the four duplicates absent there, and printed
 * "No duplicate doses found. Nothing to do." A clean bill of health from the wrong database is worse
 * than an error, because it reads as the job being finished.
 *
 * So every destructive script names its target before doing anything. Printing it cannot be skipped
 * or misread the way remembering which shell you exported a URL in can be.
 */

/** Credentials stripped -- these lines land in terminal scrollback and pasted output. */
export type DatabaseTarget = { label: string; isLocal: boolean };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function describeDatabaseTarget(): DatabaseTarget {
  const raw = process.env.DATABASE_URL;
  if (!raw) return { label: "DATABASE_URL is not set", isLocal: false };
  try {
    const url = new URL(raw);
    const db = url.pathname.replace(/^\//, "") || "(default)";
    const host = url.hostname;
    return { label: `${host}:${url.port || "5432"}/${db}`, isLocal: LOCAL_HOSTS.has(host) };
  } catch {
    // Never echo the value itself on a parse failure -- it holds the password.
    return { label: "DATABASE_URL could not be parsed", isLocal: false };
  }
}

/**
 * Prints the target, and marks a local one as local. Call this FIRST, before any query, so the line
 * is above the report rather than below it -- a reader who stops at the first screen still sees it.
 *
 * `applyDescription` says what APPLY actually does, because the default -- written when both
 * callers were prunes -- claims rows will be deleted, and a script that only inserts or updates
 * saying "rows will be deleted" is the same class of misread this whole file exists to prevent.
 */
export function printDatabaseTarget(apply: boolean, applyDescription = "rows will be deleted"): void {
  const { label, isLocal } = describeDatabaseTarget();
  console.log(`Database: ${label}${isLocal ? "  (LOCAL dev stack, not production)" : ""}`);
  console.log(apply ? `Mode:     APPLY -- ${applyDescription}` : "Mode:     dry run -- nothing will change");
  // The whole command, not "pass --apply": through npm the bare `--` is the difference between
  // writing and silently dry-running, and someone who just typed --apply needs to see why it
  // did nothing. See rerunWithApply.
  if (!apply) console.log(`To write: ${rerunWithApply()}`);
  if (isLocal && apply) {
    console.log(
      "\nThis is your local database. To act on production, set DATABASE_URL for this one command:\n" +
        `  DATABASE_URL="<production connection string>" ${rerunWithApply()}\n` +
        "A shell value wins over .env, which node --env-file does not override.",
    );
  }
  console.log();
}

/**
 * Whether --apply reached this script.
 *
 * One definition instead of nine copies of `process.argv.includes("--apply")`, so the flag and
 * the instruction for passing it (rerunWithApply below) cannot drift apart.
 */
export function applyRequested(argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes("--apply");
}

/**
 * The exact command to re-run this script with --apply, built from how it was actually launched.
 *
 * This exists because npm silently eats the flag. Verified on npm 10.9.7:
 *
 *   npm run db:seed-nevada-temperature --apply      -> script argv []          (dry run)
 *   npm run db:seed-nevada-temperature -- --apply   -> script argv ["--apply"] (writes)
 *
 * The first form is not an error and leaves no trace: no argv entry, and no npm_config_apply
 * either, so a script cannot detect the mistake and warn about it. What it CAN do is stop
 * printing "re-run with --apply" -- true but useless, since that is what was just typed -- and
 * print the whole command including the bare `--`. The operator hit this on a production run
 * and read the dry-run banner as the script ignoring the flag.
 *
 * npm_lifecycle_event is npm's own name for the script it is running, so the npm form names
 * itself and cannot go stale when a script is renamed in package.json. Args already passed are
 * carried through, so a `--org=` or `--include-today` is not silently dropped from the re-run.
 */
export function rerunWithApply(argv: string[] = process.argv.slice(2)): string {
  const args = [...argv.filter((a) => a !== "--apply"), "--apply"].join(" ");
  const npmScript = process.env.npm_lifecycle_event;
  if (npmScript) return `npm run ${npmScript} -- ${args}`;
  // Launched directly. argv[1] is absolute; the repo-relative path is what the docs and the
  // file headers use, and is what a reader can paste.
  const script = (process.argv[1] ?? "this script").replace(`${process.cwd()}/`, "");
  return `npx tsx ${script} ${args}`;
}
