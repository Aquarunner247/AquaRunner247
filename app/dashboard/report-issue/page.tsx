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

  const visitOptions: VisitOption[] = visits.map((v) => ({
    id: v.id,
    label: `${v.property.name} — ${v.bodyOfWater.name}`,
    timeLabel: v.scheduledStart.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  }));

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-24">
      <Link href="/dashboard" className="text-sm text-[#0A5FA4] underline">
        Back to dashboard
      </Link>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-wide text-[#12234A]">Report an issue</h1>
      <p className="mt-1 text-sm text-[#4A6572]">Flag a problem you noticed at one of today&rsquo;s stops.</p>
      <div className="mt-4">
        <ReportIssueForm visits={visitOptions} />
      </div>
    </main>
  );
}
