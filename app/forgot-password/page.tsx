import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Reset your password</h1>
        <p className="mt-2 text-sm text-brand-muted">
          Enter the email on your account and we&rsquo;ll send you a link to set a new password.
        </p>
        {params.error === "expired" ? (
          <p className="mt-3 text-sm text-brand-danger">
            That reset link expired or was already used. Request a new one below.
          </p>
        ) : null}
      </div>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm text-brand-muted">
        <Link href="/login" className="font-medium text-brand-primary underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
