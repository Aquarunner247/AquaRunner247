import Link from "next/link";

export default function SignupCompletePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-[#0A5FA4]">AquaRunner 24/7 Pro</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">You&rsquo;re all set</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your trial has started. Sign in with the email and password you just created to get to your dashboard.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block rounded-md bg-[#0A5FA4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#12234A]"
      >
        Sign in
      </Link>
    </main>
  );
}
