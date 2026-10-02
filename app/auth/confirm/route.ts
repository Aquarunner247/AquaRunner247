import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { confirmFailurePath } from "@/lib/auth/activation-link";

/**
 * Turns an emailed one-time token into a real session, server-side.
 *
 * This exists because /auth/callback could not do it. That route expects `?code=`, the PKCE exchange,
 * which only works when the BROWSER started the flow and still holds the matching code verifier --
 * true of /forgot-password, which is why that path always worked. The customer welcome link is minted
 * by the admin API with no browser involved, so there is no verifier and no code: Supabase's own verify
 * endpoint hands back the session in the URL FRAGMENT instead, which is never sent to a server. The
 * callback therefore saw no code, fell through to its failure branch, and dropped the customer on the
 * staff /login with ?error=auth.
 *
 * Observed exactly that way on 2026-10-02: the activation link in a maintenance login's welcome email
 * landed on the staff login, then errored again on the portal, and only "forgot my password" worked --
 * because that one is the PKCE flow.
 *
 * So the welcome email now carries the hashed token and this route redeems it with verifyOtp, which
 * sets the session cookies here on the server. Nothing depends on a URL fragment, and nothing depends
 * on Supabase's redirect allow-list either, since the link points at this app rather than at Supabase.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const failurePath = confirmFailurePath(next);

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}${failurePath}`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Same as /auth/callback: a Server Component render cannot set cookies, and the redirect
            // response carries them anyway.
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(`${origin}${failurePath}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
