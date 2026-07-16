import Link from "next/link";
import { prisma } from "@/lib/prisma";

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

  const [weekVisits, monthVisits] = await Promise.all([
    prisma.serviceVisit.findMany({
      where: { technicianId: appUser.id, scheduledStart: { gte: weekStart, lt: weekEnd }, status: { in: ["COMPLETED", "CANCELLED"] } },
      select: { status: true },
    }),
    prisma.serviceVisit.findMany({
      where: { technicianId: appUser.id, scheduledStart: { gte: monthStart, lt: monthEnd }, status: { in: ["COMPLETED", "CANCELLED"] } },
      select: { status: true },
    }),
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
    <main className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="bg-[#12234A] px-4 pb-6 pt-6">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[#A9D3E0]">AquaRunner 24/7 Pro</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-white">Welcome back, {firstName}!</h1>
      </header>

      <div className="space-y-4 px-4 py-4">
        <Link
          href="/dashboard/schedule"
          className="flex items-center justify-between rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm"
        >
          <div>
            <p className="text-sm font-semibold text-[#12234A]">View today&rsquo;s schedule</p>
            <p className="text-xs text-[#4A6572]">See your route, map, and stop list</p>
          </div>
          <span className="text-xl text-[#0A5FA4]">›</span>
        </Link>

        <section className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#4A6572]">This week</p>
          <p className="text-xs text-[#94A3B8]">
            {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
            {new Date(weekEnd.getTime() - 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#16A34A]">{weekStats.completed}</p>
              <p className="text-xs text-[#4A6572]">Stops made</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#FF6B5B]">{weekStats.skipped}</p>
              <p className="text-xs text-[#4A6572]">Skipped</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <Link href={`/dashboard?month=${toMonthParam(prevMonth)}`} className="rounded px-2 py-1 text-lg text-[#0A5FA4]" aria-label="Previous month">
              ‹
            </Link>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#4A6572]">
              {monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            {!isCurrentMonth ? (
              <Link href={`/dashboard?month=${toMonthParam(nextMonth)}`} className="rounded px-2 py-1 text-lg text-[#0A5FA4]" aria-label="Next month">
                ›
              </Link>
            ) : (
              <span className="w-7" />
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#16A34A]">{monthStats.completed}</p>
              <p className="text-xs text-[#4A6572]">Stops made</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#FF6B5B]">{monthStats.skipped}</p>
              <p className="text-xs text-[#4A6572]">Skipped</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
