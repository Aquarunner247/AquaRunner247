import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/app/dashboard/actions";
import { TourSectionPicker } from "@/app/components/tour-section-picker";
import { TECHNICIAN_TOUR_SECTIONS } from "@/lib/onboarding-tour-steps";
import { OnboardingHelpContent } from "@/app/components/onboarding-help-content";

export default async function MorePage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const organization = await prisma.organization.findUnique({ where: { id: appUser.organizationId }, select: { name: true } });

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-24">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-wide text-brand-ink">More</h1>

      <section className="mt-4 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Signed in as</p>
        <p className="mt-1 text-base font-bold text-brand-ink">{appUser.name ?? appUser.email}</p>
        <p className="text-sm text-brand-muted">{appUser.email}</p>
        {organization?.name ? <p className="mt-2 text-xs text-brand-muted">{organization.name}</p> : null}
      </section>

      <Link
        href="/dashboard/more/start-location"
        className="mt-4 block rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-sm"
      >
        Where your day starts
        <span className="mt-0.5 block text-xs font-normal text-brand-muted">
          {appUser.startAddress ?? (appUser.startLatitude != null ? "Start point set" : "Not set — routes start at your first stop")}
        </span>
      </Link>

      <Link
        href="/dashboard/more/end-location"
        className="mt-4 block rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-sm"
      >
        Where your day ends
        <span className="mt-0.5 block text-xs font-normal text-brand-muted">
          {appUser.endAddress ??
            (appUser.endLatitude != null ? "End point set" : "Not set — your day finishes back where it started")}
        </span>
      </Link>

      <Link
        href="/dashboard/safety-data-sheets"
        className="mt-4 block rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-sm"
      >
        Safety Data Sheets
      </Link>

      <Link
        href="/dashboard/whats-new"
        className="mt-4 block rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-sm"
      >
        What&rsquo;s new
      </Link>

      {/* Same defect as the admin button this replaces: it went to one hardcoded page, so the
          Dashboard and Alerts tours could only ever be seen once, on first arrival. */}
      <div className="mt-4">
        <TourSectionPicker sections={TECHNICIAN_TOUR_SECTIONS} />
      </div>

      <div className="mt-4">
        <OnboardingHelpContent />
      </div>

      <form action={signOut} className="mt-4">
        <button type="submit" className="w-full rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-sm">
          Sign out
        </button>
      </form>
    </main>
  );
}
