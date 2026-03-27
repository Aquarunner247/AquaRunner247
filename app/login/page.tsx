import { LoginForm } from "./login-form";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-700">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use the accounts created by <code className="rounded bg-slate-100 px-1">npm run db:seed</code> (see{" "}
          <code className="rounded bg-slate-100 px-1">.env.example</code>).
        </p>
        {params.error === "auth" ? (
          <p className="mt-3 text-sm text-red-600">Email link sign-in failed. Try again or use password.</p>
        ) : null}
      </div>
      <LoginForm />
    </main>
  );
}
