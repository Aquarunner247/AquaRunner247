import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

export default async function TechnicianAlertsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const now = new Date();

  const [openIssues, overdueVisits] = await Promise.all([
    prisma.visitIssueFlag.findMany({
      where: { resolved: false, visit: { technicianId: appUser.id, organizationId: appUser.organizationId } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        description: true,
        severity: true,
        createdAt: true,
        visit: { select: { id: true, property: { select: { name: true } }, bodyOfWater: { select: { name: true } } } },
      },
    }),
    prisma.serviceVisit.findMany({
      where: { technicianId: appUser.id, organizationId: appUser.organizationId, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledStart: { lt: now } },
      orderBy: { scheduledStart: "asc" },
      select: { id: true, scheduledStart: true, property: { select: { name: true } }, bodyOfWater: { select: { name: true } } },
    }),
  ]);

  const severityColor = { LOW: "#94A3B8", MEDIUM: "#D97706", HIGH: "#FF6B5B" } as const;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-24">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-wide text-[#12234A]">Alerts</h1>

      <section className="mt-4 rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#4A6572]">Open issues you&rsquo;ve reported</p>
        {openIssues.length === 0 ? (
          <p className="mt-2 text-sm text-[#4A6572]">Nothing open right now.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {openIssues.map((issue) => (
              <li key={issue.id} className="rounded border border-[#C9E3EC] bg-[#EAF6FA] p-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/dashboard/visits/${issue.visit.id}`} className="text-sm font-medium text-[#12234A] underline">
                    {issue.visit.property.name} — {issue.visit.bodyOfWater.name}
                  </Link>
                  <span className="shrink-0 text-xs font-semibold" style={{ color: severityColor[issue.severity as keyof typeof severityColor] ?? "#4A6572" }}>
                    {issue.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#16324A]">{issue.description}</p>
                <p className="mt-0.5 text-xs text-[#94A3B8]">{issue.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#4A6572]">Overdue stops</p>
        {overdueVisits.length === 0 ? (
          <p className="mt-2 text-sm text-[#4A6572]">Nothing overdue.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {overdueVisits.map((v) => (
              <li key={v.id} className="rounded border border-[#FF6B5B] bg-[#FF6B5B]/10 p-2">
                <Link href={`/dashboard/visits/${v.id}`} className="text-sm font-medium text-[#12234A] underline">
                  {v.property.name} — {v.bodyOfWater.name}
                </Link>
                <p className="mt-0.5 text-xs text-[#FF6B5B]">
                  Was due {v.scheduledStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at{" "}
                  {v.scheduledStart.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
