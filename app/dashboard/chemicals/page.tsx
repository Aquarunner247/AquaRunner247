import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { createChemicalProduct, updateChemicalProduct, deleteChemicalProduct, updateChemicalTypeSettings } from "./actions";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { getOrganizationRuleset } from "@/lib/compliance";
import { legalBoundsFor, dosingChemicalKeyFor, CHEMICAL_LABELS } from "@/lib/dosing-calculator";
import type { ChemicalType } from "@/generated/prisma/enums";

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

  // --- Dosing Product Catalog (dosing-calculator-spec.md Section 3) ---
  const catalog = await prisma.chemicalProductCatalog.findMany({ orderBy: [{ chemicalType: "asc" }, { displayOrder: "asc" }] });
  const orgSettings = await prisma.orgChemicalProductSetting.findMany({ where: { organizationId: appUser.organizationId } });
  const orgTargets = await prisma.orgComplianceTarget.findMany({ where: { organizationId: appUser.organizationId } });
  const ruleset = await getOrganizationRuleset(appUser.organizationId);

  const settingByProductId = new Map(orgSettings.map((s) => [s.catalogProductId, s]));
  const targetByChemicalType = new Map(orgTargets.map((t) => [t.chemicalType, t]));

  const catalogGroups = new Map<ChemicalType, typeof catalog>();
  for (const p of catalog) {
    const arr = catalogGroups.get(p.chemicalType) ?? [];
    arr.push(p);
    catalogGroups.set(p.chemicalType, arr);
  }

  // FREE_CHLORINE's legal bounds are per body-of-water type/disinfection method; this page
  // has no specific body of water, so POOL/CHLORINE is shown as a representative default
  // preview only -- the actual per-visit calculation always resolves fresh per body.
  function legalPreviewFor(chemicalType: ChemicalType) {
    return legalBoundsFor(dosingChemicalKeyFor(chemicalType), ruleset, "POOL", "CHLORINE");
  }

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

      {/* Chemical products -- the org's own selected/active catalog, shown first since
          it's what most admins actually want to see and edit day to day. The Dosing
          Product Catalog (enable/price/primary picker feeding the dosing calculator)
          follows directly below it. */}
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

      {/* Dosing Product Catalog */}
      <section className="app-card mt-6">
        <h2 className="text-base font-semibold text-brand-ink">Dosing Product Catalog</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Enable the products you actually use, set your price, and pick which one the dosing calculator defaults to
          when more than one is enabled for the same chemical. Formula, active %, and form are system-maintained and
          not editable here.
        </p>

        <div className="mt-4 space-y-4">
          {Array.from(catalogGroups.entries()).map(([chemicalType, groupProducts]) => {
            const key = dosingChemicalKeyFor(chemicalType);
            const legal = legalPreviewFor(chemicalType);
            const target = targetByChemicalType.get(chemicalType);
            const groupLabel =
              CHEMICAL_LABELS[key] + (chemicalType === "PH_DOWN" ? " (lower)" : chemicalType === "PH_UP" ? " (raise)" : "");
            const midpoint = legal.min != null && legal.max != null ? (legal.min + legal.max) / 2 : (legal.min ?? legal.max);

            return (
              <form key={chemicalType} action={updateChemicalTypeSettings} className="app-card-inset">
                <input type="hidden" name="chemicalType" value={chemicalType} />
                <h3 className="text-sm font-semibold text-brand-ink">{groupLabel}</h3>

                <div className="mt-2 space-y-2">
                  {groupProducts.map((p) => {
                    const setting = settingByProductId.get(p.id);
                    return (
                      <div key={p.id} className="flex flex-wrap items-center gap-3 rounded border border-brand-border px-3 py-2 text-sm">
                        <label className="flex items-center gap-2 text-brand-ink">
                          <input type="checkbox" name={`enabled_${p.id}`} defaultChecked={setting?.isEnabled ?? false} />
                          {p.name}
                        </label>
                        <span className="app-metric text-xs text-brand-ink/60">
                          {p.activePercent != null ? `${p.activePercent}% · ` : ""}
                          {p.form}
                        </span>
                        <label className="ml-auto flex items-center gap-1 text-xs text-brand-muted">
                          Price
                          <input
                            name={`price_${p.id}`}
                            type="number"
                            step="0.0001"
                            defaultValue={setting?.price?.toString() ?? ""}
                            className="w-20 rounded border border-brand-control px-1.5 py-0.5 text-sm"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-brand-muted">
                          <input type="radio" name="primary" value={p.id} defaultChecked={setting?.isPrimary ?? false} />
                          Primary
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 rounded border border-brand-border bg-brand-surface p-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Compliance target</p>
                  {midpoint == null ? (
                    <p className="mt-1 text-xs text-brand-ink/60">No state compliance data for this chemical — set your own target below.</p>
                  ) : (
                    <p className="mt-1 app-metric text-xs text-brand-ink">
                      State range: {legal.min ?? "—"}–{legal.max ?? "—"} · midpoint {midpoint}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1 text-xs text-brand-ink">
                      <input
                        type="radio"
                        name="targetMode"
                        value="STATE_MIDPOINT"
                        defaultChecked={(target?.targetMode ?? "STATE_MIDPOINT") === "STATE_MIDPOINT"}
                      />
                      Use state midpoint
                    </label>
                    <label className="flex items-center gap-1 text-xs text-brand-ink">
                      <input type="radio" name="targetMode" value="ORG_CUSTOM" defaultChecked={target?.targetMode === "ORG_CUSTOM"} />
                      Custom
                    </label>
                    {key === "SALT" ? (
                      <input
                        name="targetValue"
                        type="number"
                        step="1"
                        placeholder="Target ppm"
                        defaultValue={target?.orgTargetValue?.toString() ?? ""}
                        className="w-24 rounded border border-brand-control px-1.5 py-0.5 text-sm"
                      />
                    ) : (
                      <>
                        <input
                          name="targetMin"
                          type="number"
                          step="0.1"
                          placeholder="Min"
                          defaultValue={target?.orgTargetMin?.toString() ?? ""}
                          className="w-20 rounded border border-brand-control px-1.5 py-0.5 text-sm"
                        />
                        <input
                          name="targetMax"
                          type="number"
                          step="0.1"
                          placeholder="Max"
                          defaultValue={target?.orgTargetMax?.toString() ?? ""}
                          className="w-20 rounded border border-brand-control px-1.5 py-0.5 text-sm"
                        />
                      </>
                    )}
                  </div>
                </div>

                <button type="submit" className="app-btn-primary-sm mt-3">
                  Save
                </button>
              </form>
            );
          })}
        </div>
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
