import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ReportIssueForm, type VisitOption } from "./report-issue-form";

export default async function ReportIssuePage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const visits = await prisma.serviceVisit.findMany({
    where: {
      technicianId: appUser.id,
      scheduledStart: { gte: startOfDay, lte: endOfDay },
      status: { not: "CANCELLED" },
    },
    orderBy: [{ routeSequence: "asc" }, { scheduledStart: "asc" }],
    select: {
      id: true,
      scheduledStart: true,
      property: { select: { name: true } },
      bodyOfWater: { select: { name: true } },
    },
  });

  // scheduledStart's time-of-day isn't a real target time (see lib/visit-generation.ts --
  // it's a same-day sort anchor, offset per stop, not a promised arrival window), so this
  // labels stops by route order instead of a fabricated clock time.
  const visitOptions: VisitOption[] = visits.map((v, i) => ({
    id: v.id,
    label: `${v.property.name} — ${v.bodyOfWater.name}`,
    stopLabel: `Stop ${i + 1}`,
  }));

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-24">
      <Link href="/dashboard" className="text-sm text-brand-primary underline">
        Back to dashboard
      </Link>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-wide text-brand-ink">Report an issue</h1>
      <p className="mt-1 text-sm text-brand-muted">Flag a problem you noticed at one of today&rsquo;s stops.</p>
      <div className="mt-4">
        <ReportIssueForm visits={visitOptions} />
      </div>
    </main>
  );
}
