import Link from "next/link";

export default function SignupCancelledPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7 Pro</p>
      <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Checkout cancelled</h1>
      <p className="mt-2 text-sm text-brand-muted">No charge was made. You can try starting your trial again anytime.</p>
      <Link
        href="/signup"
        className="mt-6 inline-block rounded-md bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-ink"
      >
        Back to signup
      </Link>
    </main>
  );
}
