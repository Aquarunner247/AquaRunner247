import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";
import { LoginForm } from "./login-form";

type PageProps = {
  searchParams: Promise<{ error?: string; reset?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const appUser = await getCurrentAppUser();
  if (appUser) redirect(await resolvePostLoginPath(appUser));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Sign in</h1>
        {params.error === "auth" ? (
          <p className="mt-3 text-sm text-brand-danger">Email link sign-in failed. Try again or use password.</p>
        ) : null}
        {params.error === "email-in-use" ? (
          <p className="mt-3 text-sm text-brand-danger">That email already has an account. Sign in below.</p>
        ) : null}
        {params.reset === "success" ? (
          <p className="mt-3 text-sm text-brand-ok">Password updated — sign in with your new password.</p>
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
