import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { LoginForm } from "./login-form";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const appUser = await getCurrentAppUser();
  if (appUser) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-[#0A5FA4]">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
        {params.error === "auth" ? (
          <p className="mt-3 text-sm text-red-600">Email link sign-in failed. Try again or use password.</p>
        ) : null}
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-slate-500">
        New here?{" "}
        <Link href="/signup" className="font-medium text-[#0A5FA4] underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
