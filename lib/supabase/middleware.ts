import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * `requestHeaders` defaults to the incoming request's own headers, but the top-level
 * middleware.ts passes in a copy with `x-nonce` added (for the CSP nonce -- see that
 * file), which needs to survive every `NextResponse.next({request})` this function
 * constructs so app/layout.tsx can read it back out via headers(). Passed through as-is,
 * not merged with `request.headers` again, since the caller already built it from those.
 */
export async function updateSession(request: NextRequest, requestHeaders: Headers = new Headers(request.headers)) {
  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && path.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Note: deliberately no "authenticated -> /dashboard" redirect here. A Supabase auth
  // session alone doesn't mean the user is staff — customer-portal users share the same
  // auth pool, and bouncing them off /login toward /dashboard (which then bounces them
  // back, since they have no staff User row) would loop forever. app/login/page.tsx does
  // this redirect itself, scoped to real staff app users only.

  return supabaseResponse;
}
