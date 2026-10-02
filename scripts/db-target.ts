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
 */
export function printDatabaseTarget(apply: boolean): void {
  const { label, isLocal } = describeDatabaseTarget();
  console.log(`Database: ${label}${isLocal ? "  (LOCAL dev stack, not production)" : ""}`);
  console.log(apply ? "Mode:     APPLY -- rows will be deleted" : "Mode:     dry run -- nothing will change");
  if (isLocal && apply) {
    console.log(
      "\nThis is your local database. To act on production, set DATABASE_URL for this one command:\n" +
        '  DATABASE_URL="<production connection string>" npm run <script> -- --apply\n' +
        "A shell value wins over .env, which node --env-file does not override.",
    );
  }
  console.log();
}
