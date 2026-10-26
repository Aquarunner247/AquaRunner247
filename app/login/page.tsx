import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";
import { LoginForm } from "./login-form";

type PageProps = {
  searchParams: Promise<{ error?: string; reset?: string; deleted?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const appUser = await getCurrentAppUser();
  if (appUser) redirect(await resolvePostLoginPath(appUser));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Sign in</h1>
        {params.error === "auth" ? (
          <p className="mt-3 text-sm text-brand-danger">Email link sign-in failed. Try again or use password.</p>
        ) : null}
        {params.error === "email-in-use" ? (
          <p className="mt-3 text-sm text-brand-danger">That email already has an account. Sign in below.</p>
        ) : null}
        {/* Signup finished and the organization exists, but this email already had a login, so the
            password chosen during signup was never applied to it. Saying that plainly is the whole
            point -- the alternative is a correct password being rejected with no explanation. */}
        {params.error === "existing-login" ? (
          <p className="mt-3 text-sm text-brand-ink">
            Your account is ready. This email already had a password with us, so sign in with that one
            rather than the password you just chose.{" "}
            <Link href="/forgot-password" className="font-medium text-brand-primary underline">
              Reset it
            </Link>{" "}
            if you don&rsquo;t remember it.
          </p>
        ) : null}
        {params.reset === "success" ? (
          <p className="mt-3 text-sm text-brand-ok">Password updated — sign in with your new password.</p>
        ) : null}
        {/* Where deleteAccount lands. Somebody who just deleted their business account should
            be told it worked, rather than being dropped on a sign-in box with no explanation. */}
        {params.deleted === "1" ? (
          <p className="mt-3 text-sm text-brand-ink">
            Your account has been deleted. Health-department compliance logs remain available at each
            pool&rsquo;s QR code; everything else has been removed.
          </p>
        ) : null}
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-brand-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand-primary underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
