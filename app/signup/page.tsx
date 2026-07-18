import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "./actions";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "missing-fields": "Please fill in every field.",
  "email-in-use": "That email already has an account. Try signing in instead.",
  "server-error": "Something went wrong starting checkout. Please try again.",
};

export default async function SignupPage({ searchParams }: PageProps) {
  // Mirrors the real gate in ./actions.ts (signUp) — this just avoids showing a form
  // that would immediately bounce.
  if (process.env.SIGNUPS_ENABLED !== "true") {
    redirect("/");
  }

  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "Something went wrong. Please try again." : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-[#0A5FA4]">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Start your free trial</h1>
        <p className="mt-2 text-sm text-slate-600">
          14 days free, then a flat monthly rate. A card is required to start the trial.
        </p>
        {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}
      </div>

      <form action={signUp} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Business name
          <input
            name="businessName"
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm focus:border-[#0A5FA4] focus:outline-none focus:ring-1 focus:ring-[#0A5FA4]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Your name
          <input
            name="name"
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm focus:border-[#0A5FA4] focus:outline-none focus:ring-1 focus:ring-[#0A5FA4]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm focus:border-[#0A5FA4] focus:outline-none focus:ring-1 focus:ring-[#0A5FA4]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Phone (optional)
          <input
            name="phone"
            className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm focus:border-[#0A5FA4] focus:outline-none focus:ring-1 focus:ring-[#0A5FA4]"
          />
        </label>
        <p className="text-xs text-slate-500">
          You&rsquo;ll set a password after your card is confirmed on the next step.
        </p>
        <button
          type="submit"
          className="rounded-md bg-[#0A5FA4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#12234A]"
        >
          Continue to payment
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#0A5FA4] underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
