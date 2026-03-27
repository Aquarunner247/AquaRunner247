import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";
import { prisma } from "@/lib/prisma";

type DashboardPageProps = {
  searchParams?: Promise<{ date?: string }>;
};

function parseDateParam(raw: string | undefined): Date {
  if (!raw) return new Date();
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function toYmd(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const appUser = await getAppUserForAuthUser(user);
  const params = (await searchParams) ?? {};
  const selectedDate = parseDateParam(params.date);
  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(selectedDate);
  endOfDay.setHours(23, 59, 59, 999);
  const prevDate = new Date(startOfDay);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(startOfDay);
  nextDate.setDate(nextDate.getDate() + 1);
  const selectedYmd = toYmd(startOfDay);
  const isToday = selectedYmd === toYmd(new Date());

  const todayVisits =
    appUser?.role === "TECHNICIAN"
      ? await prisma.serviceVisit.findMany({
          where: {
            technicianId: appUser.id,
            scheduledStart: { gte: startOfDay, lte: endOfDay },
            status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          },
          orderBy: { scheduledStart: "asc" },
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            property: { select: { id: true, name: true } },
            bodyOfWater: { select: { name: true } },
          },
        })
      : [];

  const visitsByProperty = new Map<
    string,
    {
      propertyId: string;
      propertyName: string;
      visits: typeof todayVisits;
    }
  >();
  for (const visit of todayVisits) {
    const key = visit.property.id;
    const existing = visitsByProperty.get(key);
    if (existing) {
      existing.visits.push(visit);
    } else {
      visitsByProperty.set(key, {
        propertyId: visit.property.id,
        propertyName: visit.property.name,
        visits: [visit],
      });
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-medium text-cyan-800">Dashboard</p>
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600">{user.email}</p>
        </div>
      </header>

      <section className="mt-8 space-y-4">
        {!appUser ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">No AquaRunner profile linked</p>
            <p className="mt-2 text-amber-900">
              Your Supabase login works, but there is no matching row in the <code className="rounded bg-amber-100 px-1">User</code> table
              (or <code className="rounded bg-amber-100 px-1">authUserId</code> is not set). Run{" "}
              <code className="rounded bg-amber-100 px-1">npm run db:seed</code> with{" "}
              <code className="rounded bg-amber-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code> and{" "}
              <code className="rounded bg-amber-100 px-1">SEED_DEV_PASSWORD</code>, then sign in with a seeded email.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</p>
              <p className="mt-1 text-lg font-medium text-slate-900">{appUser.role}</p>
              {appUser.name ? <p className="mt-1 text-sm text-slate-600">{appUser.name}</p> : null}
            </div>
            {appUser.role === "TECHNICIAN" ? (
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-900">Route day</p>
                    <p className="mt-1 text-sm font-medium text-cyan-900">
                      {startOfDay.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Link className="rounded border border-cyan-300 bg-white px-2 py-1 text-cyan-800" href={`/dashboard?date=${toYmd(prevDate)}`}>
                      Previous day
                    </Link>
                    {!isToday ? (
                      <Link className="rounded border border-cyan-300 bg-white px-2 py-1 text-cyan-800" href="/dashboard">
                        Today
                      </Link>
                    ) : null}
                    <Link className="rounded border border-cyan-300 bg-white px-2 py-1 text-cyan-800" href={`/dashboard?date=${toYmd(nextDate)}`}>
                      Next day
                    </Link>
                  </div>
                </div>
                <p className="mt-3 text-sm text-cyan-900">
                  {todayVisits.length === 0
                    ? "No assigned customers for this day."
                    : `${visitsByProperty.size} customer${visitsByProperty.size === 1 ? "" : "s"} assigned.`}
                </p>
                {visitsByProperty.size ? (
                  <div className="mt-3 space-y-3">
                    {Array.from(visitsByProperty.values()).map((group) => (
                      <div key={group.propertyId} className="rounded border border-cyan-200 bg-white px-3 py-2">
                        <div className="font-medium text-cyan-900">{group.propertyName}</div>
                        <ul className="mt-2 space-y-2 text-sm text-cyan-900">
                          {group.visits.map((visit) => (
                            <li key={visit.id} className="rounded border border-cyan-100 bg-cyan-50 px-2 py-2">
                              <div className="text-cyan-800">
                                {visit.bodyOfWater.name} - {visit.scheduledStart.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} ({visit.status})
                              </div>
                              <Link className="mt-1 inline-block text-xs font-medium text-cyan-700 underline" href={`/dashboard/visits/${visit.id}`}>
                                Open visit form
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tabs</p>
              <ul className="mt-2 list-inside list-disc text-sm text-cyan-800">
                <li>
                  <Link className="underline" href="/dashboard">
                    Dashboard
                  </Link>
                </li>
                {appUser.role === "ADMIN" ? (
                  <li>
                    <Link className="underline" href="/dashboard/customers">
                      Customers
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link className="underline" href="/p/demo-public-slug">
                    Public log (demo)
                  </Link>
                </li>
                <li>
                  <Link className="underline" href="/">
                    Home
                  </Link>
                </li>
              </ul>
            </div>
            {appUser.role === "TECHNICIAN" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Service standards</p>
                <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                  <li>At least 1 photo per body of water before completion.</li>
                  <li>Hybrid save flow: autosave + manual Save/Sync action.</li>
                  <li>Public QR log mirrors aquatic maintenance records.</li>
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
