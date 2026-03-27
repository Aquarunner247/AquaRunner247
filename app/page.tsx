import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-700">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Commercial pool maintenance</h1>
        <p className="mt-3 text-slate-600">
          Scheduling, technician visit logs, chemistry readings, and public QR logbooks. Configure{" "}
          <strong>1–7 service days per week</strong> per body of water (Monday=1 … Sunday=7).
        </p>
      </div>
      <ul className="list-inside list-disc text-slate-600">
        <li>
          Copy <code className="rounded bg-slate-200 px-1">.env.example</code> to{" "}
          <code className="rounded bg-slate-200 px-1">.env</code> — set{" "}
          <code className="rounded bg-slate-200 px-1">DATABASE_URL</code>,{" "}
          <code className="rounded bg-slate-200 px-1">NEXT_PUBLIC_SUPABASE_*</code>, and (for seeding logins){" "}
          <code className="rounded bg-slate-200 px-1">SUPABASE_SERVICE_ROLE_KEY</code> +{" "}
          <code className="rounded bg-slate-200 px-1">SEED_DEV_PASSWORD</code>
        </li>
        <li>
          In Supabase → Authentication → URL configuration: Site URL{" "}
          <code className="rounded bg-slate-200 px-1">http://localhost:3000</code>, redirect{" "}
          <code className="rounded bg-slate-200 px-1">http://localhost:3000/auth/callback</code>
        </li>
        <li>
          <code className="rounded bg-slate-200 px-1">npx prisma migrate dev</code> then{" "}
          <code className="rounded bg-slate-200 px-1">npm run db:seed</code>
        </li>
      </ul>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link className="font-medium text-cyan-700 underline" href="/login">
          Sign in
        </Link>
        <Link className="font-medium text-cyan-700 underline" href="/dashboard">
          Dashboard
        </Link>
        <Link className="text-slate-500 underline" href="/p/demo-public-slug">
          Public log (demo slug)
        </Link>
      </p>
    </main>
  );
}
