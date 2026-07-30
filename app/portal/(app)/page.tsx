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
      <header className="border-b border-brand-border pb-5">
        <p className="text-sm font-medium text-brand-ink">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Upcoming service days</h1>
        <p className="mt-1 text-sm text-brand-muted">{customerUser.name ?? customerUser.email}</p>
      </header>

      <section className="mt-6 space-y-4">
        {byProperty.size === 0 ? (
          <p className="text-sm text-brand-muted">No upcoming visits scheduled right now.</p>
        ) : (
          Array.from(byProperty.values()).map((group) => (
            <div key={group.propertyName} className="rounded-lg border border-brand-border bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-brand-ink">{group.propertyName}</h2>
              <ul className="mt-2 space-y-2 text-sm text-brand-ink">
                {group.visits.map((v) => (
                  <li key={v.id} className="rounded border border-brand-border bg-brand-surface px-3 py-2">
                    <p className="font-medium text-brand-ink">{v.bodyOfWater.name}</p>
                    <p className="text-brand-muted">
                      {v.scheduledStart.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                      {" · "}
                      {v.scheduledStart.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="text-xs text-brand-muted">{v.status === "IN_PROGRESS" ? "In progress" : "Scheduled"}</p>
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
