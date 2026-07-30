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

  const severityColor = { LOW: "#6E8E8A", MEDIUM: "#0F2A3D", HIGH: "#C65D46" } as const;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-24">
      <h1 className="font-display text-xl font-bold uppercase tracking-wide text-brand-navy">Alerts</h1>

      <section className="app-card mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Open issues you&rsquo;ve reported</p>
        {openIssues.length === 0 ? (
          <p className="mt-2 text-sm text-brand-navy/60">Nothing open right now.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {openIssues.map((issue) => (
              <li key={issue.id} className="app-card-inset">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/dashboard/visits/${issue.visit.id}`} className="app-link text-sm font-medium">
                    {issue.visit.property.name} — {issue.visit.bodyOfWater.name}
                  </Link>
                  <span
                    className="shrink-0 text-xs font-semibold"
                    style={{ color: severityColor[issue.severity as keyof typeof severityColor] ?? "#6E8E8A" }}
                  >
                    {issue.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm text-brand-navy">{issue.description}</p>
                <p className="app-metric mt-0.5 text-xs text-brand-icon">
                  {issue.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="app-card mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-icon">Overdue stops</p>
        {overdueVisits.length === 0 ? (
          <p className="mt-2 text-sm text-brand-navy/60">Nothing overdue — every stop is on schedule.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {overdueVisits.map((v) => (
              <li key={v.id} className="rounded-xl border border-brand-coral bg-brand-coral/10 p-2.5">
                <Link href={`/dashboard/visits/${v.id}`} className="app-link text-sm font-medium">
                  {v.property.name} — {v.bodyOfWater.name}
                </Link>
                <p className="app-metric mt-0.5 text-xs text-brand-coralDark">
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
