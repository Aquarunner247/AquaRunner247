import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getTechnicianEarnings } from "@/lib/technician-pay";

function startOfWeek(d: Date) {
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // back up to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function parseMonthParam(raw: string | undefined): Date {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function toMonthParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export async function TechnicianHome({
  appUser,
  monthParam,
}: {
  appUser: { id: string; name: string | null; email: string; organizationId: string };
  monthParam: string | undefined;
}) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const monthStart = parseMonthParam(monthParam);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const prevMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const isCurrentMonth = monthStart.getFullYear() === now.getFullYear() && monthStart.getMonth() === now.getMonth();

  const [weekVisits, monthVisits, earnings] = await Promise.all([
    prisma.serviceVisit.findMany({
      where: { technicianId: appUser.id, scheduledStart: { gte: weekStart, lt: weekEnd }, status: { in: ["COMPLETED", "CANCELLED"] } },
      select: { status: true },
    }),
    prisma.serviceVisit.findMany({
      where: { technicianId: appUser.id, scheduledStart: { gte: monthStart, lt: monthEnd }, status: { in: ["COMPLETED", "CANCELLED"] } },
      select: { status: true },
    }),
    getTechnicianEarnings(appUser.organizationId, appUser.id, now),
  ]);

  const weekStats = {
    completed: weekVisits.filter((v) => v.status === "COMPLETED").length,
    skipped: weekVisits.filter((v) => v.status === "CANCELLED").length,
  };
  const monthStats = {
    completed: monthVisits.filter((v) => v.status === "COMPLETED").length,
    skipped: monthVisits.filter((v) => v.status === "CANCELLED").length,
  };

  const firstName = (appUser.name ?? appUser.email).split(" ")[0];

  return (
    <main className="mx-auto min-h-screen max-w-2xl pb-24 lg:max-w-4xl">
      <header className="bg-brand-ink px-4 pb-6 pt-6 lg:px-8 lg:pb-8 lg:pt-8">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-brand-border">AquaRunner 24/7 Pro</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-white lg:text-3xl">Welcome back, {firstName}!</h1>
      </header>

      <div className="space-y-4 px-4 py-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-8 lg:py-6">
        <Link
          href="/dashboard/schedule"
          data-tour="tech-home-schedule-link"
          className="app-card flex items-center justify-between lg:col-span-2"
        >
          <div>
            <p className="text-sm font-semibold text-brand-ink">View today&rsquo;s schedule</p>
            <p className="text-xs text-brand-muted">See your route, map, and stop list</p>
          </div>
          <span className="text-xl text-brand-primary">›</span>
        </Link>

        <section data-tour="tech-home-earnings" className="app-card lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Estimated earnings</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="app-metric text-3xl font-bold text-brand-primary">{fmtMoney(earnings.todayTotal)}</p>
              <p className="text-xs text-brand-muted">Today ({earnings.todayVisitCount} stop{earnings.todayVisitCount === 1 ? "" : "s"})</p>
            </div>
            <div>
              <p className="app-metric text-3xl font-bold text-brand-ink">{fmtMoney(earnings.periodTotal)}</p>
              <p className="text-xs text-brand-muted">
                This pay period ({earnings.periodStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–
                {earnings.periodEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })})
              </p>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-brand-muted">Estimated — confirmed amount appears on your paycheck.</p>
        </section>

        <section data-tour="tech-home-week-stats" className="app-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">This week</p>
          <p className="text-xs text-brand-muted">
            {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
            {new Date(weekEnd.getTime() - 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-brand-ok">{weekStats.completed}</p>
              <p className="text-xs text-brand-muted">Stops made</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-brand-danger">{weekStats.skipped}</p>
              <p className="text-xs text-brand-muted">Skipped</p>
            </div>
          </div>
        </section>

        <section data-tour="tech-home-month-stats" className="app-card">
          <div className="flex items-center justify-between">
            <Link href={`/dashboard?month=${toMonthParam(prevMonth)}`} className="rounded px-2 py-1 text-lg text-brand-primary" aria-label="Previous month">
              ‹
            </Link>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              {monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            {!isCurrentMonth ? (
              <Link href={`/dashboard?month=${toMonthParam(nextMonth)}`} className="rounded px-2 py-1 text-lg text-brand-primary" aria-label="Next month">
                ›
              </Link>
            ) : (
              <span className="w-7" />
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-brand-ok">{monthStats.completed}</p>
              <p className="text-xs text-brand-muted">Stops made</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-brand-danger">{monthStats.skipped}</p>
              <p className="text-xs text-brand-muted">Skipped</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
