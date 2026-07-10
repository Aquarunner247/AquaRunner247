import Link from "next/link";

export default function SignupCancelledPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-[#0A5FA4]">AquaRunner 24/7 Pro</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Checkout cancelled</h1>
      <p className="mt-2 text-sm text-slate-600">No charge was made. You can try starting your trial again anytime.</p>
      <Link
        href="/signup"
        className="mt-6 inline-block rounded-md bg-[#0A5FA4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#12234A]"
      >
        Back to signup
      </Link>
    </main>
  );
}
