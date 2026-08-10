/**
 * Prints a Cookie header that authenticates as a given local-dev user, so server-rendered
 * pages can be curled directly instead of needing a real browser. Login in this app is
 * client-side Supabase auth (signInWithPassword() in the browser, no POST-able form), which
 * curl can't drive on its own -- this logs in against the local GoTrue REST API instead,
 * then feeds the resulting tokens through @supabase/ssr's own createServerClient (the same
 * code the app itself uses) so the cookie name/format/encoding is guaranteed to match
 * exactly what app/dashboard pages expect to read back, no guessing at internals.
 *
 * Usage:
 *   npm run dev:login -- pool-admin@example.com
 *   npm run dev:login -- pool-tech@example.com some-other-password
 *
 * Then:
 *   COOKIE=$(npm run -s dev:login -- pool-admin@example.com)
 *   curl -b "$COOKIE" http://localhost:3000/dashboard/settings/pay-rates
 *
 * Password defaults to $SEED_DEV_PASSWORD (set in .env) if omitted -- matches every
 * seeded login in prisma/seed.ts.
 */
import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3] ?? process.env.SEED_DEV_PASSWORD;
  if (!email || !password) {
    console.error("Usage: npm run dev:login -- <email> [password]  (password defaults to $SEED_DEV_PASSWORD)");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env).");
    process.exit(1);
  }

  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  if (!tokenRes.ok) {
    console.error(`Login failed for ${email}:`, tokenRes.status, await tokenRes.text());
    process.exit(1);
  }
  const session = (await tokenRes.json()) as { access_token: string; refresh_token: string };

  const captured: { name: string; value: string }[] = [];
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => {
        for (const c of cookiesToSet) captured.push({ name: c.name, value: c.value });
      },
    },
  });

  const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) {
    console.error("setSession failed:", error);
    process.exit(1);
  }

  console.log(captured.map((c) => `${c.name}=${c.value}`).join("; "));
}

main();
