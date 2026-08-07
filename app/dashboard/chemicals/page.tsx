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
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Chemicals</h1>
        <p className="app-subhead">Manage the chemical catalog and review usage/billing by property.</p>
      </header>

      {/* Catalog */}
      <section className="app-card mt-6">
        <h2 className="text-base font-semibold text-brand-ink">Chemical products</h2>
        <div className="mt-3 space-y-2">
          {products.map((p) => {
            const isEditing = editingId === p.id;
            return (
              <div key={p.id} className="app-card-inset">
                {!isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-4 items-center gap-2 text-sm">
                      <span className="font-medium text-brand-ink">{p.name}</span>
                      <span className="app-metric text-brand-ink/70">{p.unit}</span>
                      <span className="app-metric text-brand-ink/70">Cost: {fmtMoney(Number(p.costPerUnit))}</span>
                      <span className="app-metric text-brand-ink/70">Charge: {fmtMoney(Number(p.chargePerUnit))}</span>
                    </div>
                    <a href={`/dashboard/chemicals?edit=${p.id}`} className="app-btn-secondary-sm">
                      Edit
                    </a>
                    <form action={deleteChemicalProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmitButton
                        label="Delete"
                        confirmMessage={`Permanently delete "${p.name}"? Past billing history keeps its own cost/charge record.`}
                        className="app-btn-danger-sm"
                      />
                    </form>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <form action={updateChemicalProduct} className="grid flex-1 grid-cols-5 items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="name" defaultValue={p.name} className="app-field col-span-2" />
                      <input name="unit" defaultValue={p.unit} placeholder="Unit" className="app-field" />
                      <input
                        name="costPerUnit"
                        type="number"
                        step="0.0001"
                        defaultValue={p.costPerUnit.toString()}
                        placeholder="Cost/unit"
                        className="app-field"
                      />
                      <input
                        name="chargePerUnit"
                        type="number"
                        step="0.0001"
                        defaultValue={p.chargePerUnit.toString()}
                        placeholder="Charge/unit"
                        className="app-field"
                      />
                      <button type="submit" className="app-btn-primary-sm">
                        Save
                      </button>
                    </form>
                    <a href="/dashboard/chemicals" className="app-btn-secondary-sm">
                      Cancel
                    </a>
                  </div>
                )}
              </div>
            );
          })}
          {products.length === 0 ? <p className="app-card-inset text-sm text-brand-ink/60">No chemical products yet — add one below.</p> : null}
        </div>

        <form action={createChemicalProduct} className="app-card-inset mt-4">
          <p className="text-sm font-medium text-brand-ink">Add chemical product</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <input name="name" required placeholder="Name (e.g. Cal Hypo)" className="app-field" />
            <input name="unit" required placeholder="Unit (e.g. lb, gal)" className="app-field" />
            <input name="costPerUnit" type="number" step="0.0001" required placeholder="Your cost/unit ($)" className="app-field" />
            <input name="chargePerUnit" type="number" step="0.0001" required placeholder="Charge/unit ($)" className="app-field" />
          </div>
          <button className="app-btn-primary-sm mt-2" type="submit">
            Add product
          </button>
        </form>
      </section>

      {/* Usage / billing report */}
      <section className="app-card mt-6">
        <h2 className="text-base font-semibold text-brand-ink">Usage &amp; billing by property</h2>

        <form className="mt-3 flex flex-wrap items-center gap-2" method="GET">
          <label className="text-sm text-brand-ink/70">
            From <input type="date" name="from" defaultValue={toYmd(from)} className="app-field w-auto py-1" />
          </label>
          <label className="text-sm text-brand-ink/70">
            To <input type="date" name="to" defaultValue={toYmd(to)} className="app-field w-auto py-1" />
          </label>
          <select name="propertyId" defaultValue={propertyId} className="app-field w-auto">
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="app-btn-primary-sm">
            Update
          </button>
        </form>

        {propertyTotals.length === 0 ? (
          <p className="mt-4 text-sm text-brand-ink/60">No chemical doses logged for this range.</p>
        ) : (
          <>
            {/* Bar chart: $ charged per property */}
            <div className="mt-4 space-y-2">
              {propertyTotals.map((p) => (
                <div key={p.propertyId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-brand-ink">{p.propertyName}</span>
                    <span className="app-metric text-brand-ink/70">{fmtMoney(p.totalCharge)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-brand-ink/[0.07]">
                    <div
                      className="h-2 rounded-full bg-brand-primary transition-[width] duration-500 motion-reduce:transition-none"
                      style={{ width: `${Math.max((p.totalCharge / maxCharge) * 100, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Detail table per property */}
            <div className="mt-6 space-y-4">
              {propertyTotals.map((p) => (
                <div key={`detail-${p.propertyId}`} className="app-card-inset">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-brand-ink">{p.propertyName}</p>
                    <p className="app-metric text-sm text-brand-ink/70">
                      Cost {fmtMoney(p.totalCost)} · Charge {fmtMoney(p.totalCharge)}
                    </p>
                  </div>
                  <table className="mt-2 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-brand-icon">
                        <th className="py-1">Chemical</th>
                        <th className="py-1">Quantity</th>
                        <th className="py-1">Cost</th>
                        <th className="py-1">Charge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(p.chemicals.entries()).map(([name, c]) => (
                        <tr key={name} className="border-t border-brand-border/70">
                          <td className="py-1">{name}</td>
                          <td className="app-metric py-1">
                            {c.quantity} {c.unit}
                          </td>
                          <td className="app-metric py-1">{fmtMoney(c.cost)}</td>
                          <td className="app-metric py-1">{fmtMoney(c.charge)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-6 border-t border-brand-border/70 pt-3 text-sm font-semibold text-brand-ink">
              <span className="app-metric">Total cost: {fmtMoney(grandCost)}</span>
              <span className="app-metric">Total charge: {fmtMoney(grandCharge)}</span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
