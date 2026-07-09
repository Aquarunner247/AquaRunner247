import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { createChemicalProduct, updateChemicalProduct, deleteChemicalProduct } from "./actions";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";

type PageProps = {
  searchParams?: Promise<{ from?: string; to?: string; propertyId?: string; edit?: string }>;
};

function toYmd(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function ChemicalsPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const now = new Date();
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : startOfMonth(now);
  const to = sp.to ? new Date(`${sp.to}T23:59:59`) : now;
  const propertyId = sp.propertyId ?? "";
  const editingId = sp.edit ?? "";

  const products = await prisma.chemicalProduct.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const properties = await prisma.property.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const doses = await prisma.visitChemicalDose.findMany({
    where: {
      visit: {
        organizationId: appUser.organizationId,
        completedAt: { gte: from, lte: to },
        ...(propertyId ? { propertyId } : {}),
      },
    },
    select: {
      productName: true,
      quantity: true,
      unit: true,
      unitCost: true,
      unitCharge: true,
      visit: { select: { property: { select: { id: true, name: true } } } },
    },
  });

  type ChemRow = { quantity: number; unit: string; cost: number; charge: number };
  type PropertyTotals = { propertyId: string; propertyName: string; totalCost: number; totalCharge: number; chemicals: Map<string, ChemRow> };

  const byProperty = new Map<string, PropertyTotals>();
  let grandCost = 0;
  let grandCharge = 0;

  for (const d of doses) {
    const qty = Number(d.quantity);
    const cost = (d.unitCost != null ? Number(d.unitCost) : 0) * qty;
    const charge = (d.unitCharge != null ? Number(d.unitCharge) : 0) * qty;
    const pId = d.visit.property.id;
    const pName = d.visit.property.name;

    const entry = byProperty.get(pId) ?? { propertyId: pId, propertyName: pName, totalCost: 0, totalCharge: 0, chemicals: new Map<string, ChemRow>() };
    entry.totalCost += cost;
    entry.totalCharge += charge;
    const chem = entry.chemicals.get(d.productName) ?? { quantity: 0, unit: d.unit, cost: 0, charge: 0 };
    chem.quantity += qty;
    chem.cost += cost;
    chem.charge += charge;
    entry.chemicals.set(d.productName, chem);
    byProperty.set(pId, entry);

    grandCost += cost;
    grandCharge += charge;
  }

  const propertyTotals = Array.from(byProperty.values()).sort((a, b) => b.totalCharge - a.totalCharge);
  const maxCharge = Math.max(...propertyTotals.map((p) => p.totalCharge), 1);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Admin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Chemicals</h1>
        <p className="mt-1 text-sm text-slate-500">Manage the chemical catalog and review usage/billing by property.</p>
      </header>

      {/* Catalog */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Chemical products</h2>
        <div className="mt-3 space-y-2">
          {products.map((p) => {
            const isEditing = editingId === p.id;
            return (
              <div key={p.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                {!isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-4 items-center gap-2 text-sm">
                      <span className="font-medium text-slate-900">{p.name}</span>
                      <span className="text-slate-600">{p.unit}</span>
                      <span className="text-slate-600">Cost: {fmtMoney(Number(p.costPerUnit))}</span>
                      <span className="text-slate-600">Charge: {fmtMoney(Number(p.chargePerUnit))}</span>
                    </div>
                    <a
                      href={`/dashboard/chemicals?edit=${p.id}`}
                      className="rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                    >
                      Edit
                    </a>
                    <form action={deleteChemicalProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmitButton
                        label="🗑"
                        confirmMessage={`Permanently delete "${p.name}"? Past billing history keeps its own cost/charge record.`}
                        className="rounded px-2 py-1 text-base hover:bg-slate-200"
                      />
                    </form>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <form action={updateChemicalProduct} className="grid flex-1 grid-cols-5 items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="name" defaultValue={p.name} className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm" />
                      <input name="unit" defaultValue={p.unit} placeholder="Unit" className="rounded border border-slate-300 px-2 py-1 text-sm" />
                      <input
                        name="costPerUnit"
                        type="number"
                        step="0.0001"
                        defaultValue={p.costPerUnit.toString()}
                        placeholder="Cost/unit"
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                      <input
                        name="chargePerUnit"
                        type="number"
                        step="0.0001"
                        defaultValue={p.chargePerUnit.toString()}
                        placeholder="Charge/unit"
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button type="submit" className="rounded bg-[#0A5FA4] px-2 py-1 text-xs font-medium text-white">
                        Save
                      </button>
                    </form>
                    <a
                      href="/dashboard/chemicals"
                      className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      Cancel
                    </a>
                  </div>
                )}
              </div>
            );
          })}
          {products.length === 0 ? <p className="text-sm text-slate-500">No chemical products yet.</p> : null}
        </div>

        <form action={createChemicalProduct} className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">Add chemical product</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <input name="name" required placeholder="Name (e.g. Cal Hypo)" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="unit" required placeholder="Unit (e.g. lb, gal)" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="costPerUnit" type="number" step="0.0001" required placeholder="Your cost/unit ($)" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="chargePerUnit" type="number" step="0.0001" required placeholder="Charge/unit ($)" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <button className="mt-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Add product
          </button>
        </form>
      </section>

      {/* Usage / billing report */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Usage &amp; billing by property</h2>

        <form className="mt-3 flex flex-wrap items-center gap-2" method="GET">
          <label className="text-sm text-slate-600">
            From{" "}
            <input type="date" name="from" defaultValue={toYmd(from)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-sm text-slate-600">
            To{" "}
            <input type="date" name="to" defaultValue={toYmd(to)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <select name="propertyId" defaultValue={propertyId} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white">
            Update
          </button>
        </form>

        {propertyTotals.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No chemical doses logged for this range.</p>
        ) : (
          <>
            {/* Bar chart: $ charged per property */}
            <div className="mt-4 space-y-2">
              {propertyTotals.map((p) => (
                <div key={p.propertyId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">{p.propertyName}</span>
                    <span className="text-slate-600">{fmtMoney(p.totalCharge)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-[#0A5FA4]"
                      style={{ width: `${Math.max((p.totalCharge / maxCharge) * 100, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Detail table per property */}
            <div className="mt-6 space-y-4">
              {propertyTotals.map((p) => (
                <div key={`detail-${p.propertyId}`} className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{p.propertyName}</p>
                    <p className="text-sm text-slate-600">
                      Cost {fmtMoney(p.totalCost)} · Charge {fmtMoney(p.totalCharge)}
                    </p>
                  </div>
                  <table className="mt-2 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-slate-500">
                        <th className="py-1">Chemical</th>
                        <th className="py-1">Quantity</th>
                        <th className="py-1">Cost</th>
                        <th className="py-1">Charge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(p.chemicals.entries()).map(([name, c]) => (
                        <tr key={name} className="border-t border-slate-200">
                          <td className="py-1">{name}</td>
                          <td className="py-1">
                            {c.quantity} {c.unit}
                          </td>
                          <td className="py-1">{fmtMoney(c.cost)}</td>
                          <td className="py-1">{fmtMoney(c.charge)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-6 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
              <span>Total cost: {fmtMoney(grandCost)}</span>
              <span>Total charge: {fmtMoney(grandCharge)}</span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
