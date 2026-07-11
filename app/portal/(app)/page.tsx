import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";

export default async function PortalHomePage() {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const upcomingVisits = await prisma.serviceVisit.findMany({
    where: {
      property: { customerId: customerUser.customerId },
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
    },
    orderBy: { scheduledStart: "asc" },
    take: 50,
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      property: { select: { name: true } },
      bodyOfWater: { select: { name: true } },
    },
  });

  const byProperty = new Map<string, { propertyName: string; visits: typeof upcomingVisits }>();
  for (const v of upcomingVisits) {
    const key = v.property.name;
    const entry = byProperty.get(key) ?? { propertyName: key, visits: [] };
    entry.visits.push(v);
    byProperty.set(key, entry);
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-[#12234A]">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-slate-900">Upcoming service days</h1>
        <p className="mt-1 text-sm text-slate-600">{customerUser.name ?? customerUser.email}</p>
      </header>

      <section className="mt-6 space-y-4">
        {byProperty.size === 0 ? (
          <p className="text-sm text-slate-500">No upcoming visits scheduled right now.</p>
        ) : (
          Array.from(byProperty.values()).map((group) => (
            <div key={group.propertyName} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">{group.propertyName}</h2>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {group.visits.map((v) => (
                  <li key={v.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="font-medium text-slate-900">{v.bodyOfWater.name}</p>
                    <p className="text-slate-600">
                      {v.scheduledStart.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                      {" · "}
                      {v.scheduledStart.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="text-xs text-slate-500">{v.status === "IN_PROGRESS" ? "In progress" : "Scheduled"}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
