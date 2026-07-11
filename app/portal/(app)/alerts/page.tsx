import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";

export default async function PortalAlertsPage() {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const alerts = await prisma.customerAlert.findMany({
    where: { customerId: customerUser.customerId },
    orderBy: { createdAt: "desc" },
    select: { id: true, subject: true, message: true, createdAt: true },
  });

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-[#12234A]">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-slate-900">Alerts</h1>
      </header>

      <section className="mt-6 space-y-3">
        {alerts.length ? (
          alerts.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{a.subject}</p>
                <p className="text-xs text-slate-500">{a.createdAt.toLocaleString()}</p>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{a.message}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No alerts yet.</p>
        )}
      </section>
    </main>
  );
}
