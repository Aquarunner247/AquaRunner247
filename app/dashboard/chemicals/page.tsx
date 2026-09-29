import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { createChemicalProduct, updateChemicalProduct, deleteChemicalProduct, updateChemicalTypeSettings, uploadChemicalSds, removeChemicalSds } from "./actions";
import { AddChemicalProductForm } from "./add-chemical-product-form";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { getOrganizationRuleset, isComplianceActive, chlorineFamilyThreshold, activeChemistryThresholds } from "@/lib/compliance";
import { getSdsSignedUrl, resolveSds } from "@/lib/sds-documents";
import type { ChemicalType } from "@/generated/prisma/enums";

type PageProps = {
  searchParams?: Promise<{ edit?: string; targetSaveError?: string; saved?: string }>;
};

const CHEMICAL_GROUP_LABELS: Record<ChemicalType, string> = {
  FREE_CHLORINE: "Free Chlorine",
  PH_UP: "pH (raise)",
  PH_DOWN: "pH (lower)",
  ALKALINITY_UP: "Total Alkalinity (raise)",
  ALKALINITY_DOWN: "Total Alkalinity (lower)",
  CYA: "Cyanuric Acid",
  CALCIUM_HARDNESS: "Calcium Hardness",
  SALT: "Salt",
};
/** PH_DOWN/ALKALINITY_DOWN share a compliance target with their _UP counterpart, and pH
 * has no ppm-delta bounds preview at all (it's titration-based, see
 * lib/dosing-calculator.ts) -- so neither gets a target form on this page. */
const NO_TARGET_FORM: ChemicalType[] = ["PH_UP", "PH_DOWN", "ALKALINITY_DOWN"];
const SINGLE_POINT_TARGET: ChemicalType[] = ["SALT"];

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function ChemicalsPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const editingId = sp.edit ?? "";
  const targetSaveError = sp.targetSaveError ?? "";

  const products = await prisma.chemicalProduct.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  // --- Dosing Product Catalog ---
  const catalog = await prisma.chemicalProductCatalog.findMany({ orderBy: [{ chemicalType: "asc" }, { displayOrder: "asc" }] });
  const orgSettings = await prisma.orgChemicalProductSetting.findMany({ where: { organizationId: appUser.organizationId } });
  const orgTargets = await prisma.orgComplianceTarget.findMany({ where: { organizationId: appUser.organizationId } });
  const ruleset = await getOrganizationRuleset(appUser.organizationId);

  const settingByProductId = new Map(orgSettings.map((s) => [s.catalogProductId, s]));

  // Signed URLs are per-request, not cached -- only fetch one for products that actually
  // have an org upload to view.
  const sdsUrlByProductId = new Map<string, string>();
  await Promise.all(
    orgSettings
      .filter((s) => s.sdsStoragePath)
      .map(async (s) => {
        const url = await getSdsSignedUrl(s.sdsStoragePath!);
        if (url) sdsUrlByProductId.set(s.catalogProductId, url);
      }),
  );
  const targetByChemicalType = new Map(orgTargets.map((t) => [t.chemicalType, t]));

  const catalogGroups = new Map<ChemicalType, typeof catalog>();
  for (const p of catalog) {
    const arr = catalogGroups.get(p.chemicalType) ?? [];
    arr.push(p);
    catalogGroups.set(p.chemicalType, arr);
  }

  /** Representative preview only (POOL/CHLORINE) -- the real per-visit calculation always
   * resolves fresh per body of water. FREE_CHLORINE uses chlorineFamilyThreshold; every
   * other chemical type here uses activeChemistryThresholds' matching target fields. */
  function boundsPreviewFor(chemicalType: ChemicalType): { min: number | null; max: number | null } {
    if (!isComplianceActive(ruleset)) return { min: null, max: null };
    if (chemicalType === "FREE_CHLORINE") {
      const t = chlorineFamilyThreshold(ruleset, "POOL", "CHLORINE");
      return { min: t?.min ?? null, max: t?.max ?? null };
    }
    const t = activeChemistryThresholds(ruleset);
    if (chemicalType === "ALKALINITY_UP") return { min: t.alkalinityTargetMinPpm, max: t.alkalinityTargetMaxPpm };
    if (chemicalType === "CYA") return { min: t.cyaTargetMinPpm, max: t.cyaTargetMaxPpm };
    if (chemicalType === "CALCIUM_HARDNESS") return { min: t.calciumHardnessTargetMinPpm, max: t.calciumHardnessTargetMaxPpm };
    return { min: null, max: null }; // SALT: no ComplianceRuleset backing anywhere
  }

  return (
    <main className="app-page-wide">
      {/* Reached from Settings now rather than the side nav, so it needs a way back. */}
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/settings" className="app-link">
          Settings
        </Link>
        {" / "}
        <span>Chemicals</span>
      </div>

      <header className="app-page-head mt-2">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Chemicals</h1>
        <p className="app-subhead">
          The products your org stocks, which of them the dosing calculator offers, and the SDS documents customers can
          see. Usage and billing by property now lives on the dashboard.
        </p>
      </header>

      {targetSaveError === "missing-org-state" ? (
        <p className="app-card mt-6 border-brand-danger/30 text-sm text-brand-danger">
          Couldn&rsquo;t save that custom compliance target — this organization has no state on file yet. Set it on the Settings
          page, then try again.
        </p>
      ) : null}

      {sp.saved === "1" ? <p className="app-card mt-6 text-sm text-brand-ok">Saved.</p> : null}

      <section data-tour="chemicals-products" className="app-card mt-6">
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

        <AddChemicalProductForm
          action={createChemicalProduct}
          catalogOptions={catalog.map((c) => ({ id: c.id, name: c.name, dosingUnit: c.dosingUnit }))}
        />
      </section>

      {/* Dosing Product Catalog */}
      <section data-tour="chemicals-catalog" className="app-card mt-6">
        <h2 className="text-base font-semibold text-brand-ink">Dosing Product Catalog</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Enable the products you actually use, set your price, and pick which one the dosing calculator defaults to when more
          than one is enabled for the same chemical. Dosing amounts, active %, and form are sourced from Taylor Technologies&rsquo;
          printed treatment tables and aren&rsquo;t editable here. Link a product to one of your own billing products above so a
          technician can apply a recommended dose to a visit with one tap instead of re-entering it under &ldquo;Chemical
          products.&rdquo;
        </p>

        <div className="mt-4 space-y-4">
          {Array.from(catalogGroups.entries()).map(([chemicalType, groupProducts]) => {
            const bounds = boundsPreviewFor(chemicalType);
            const target = targetByChemicalType.get(chemicalType);
            const midpoint = bounds.min != null && bounds.max != null ? (bounds.min + bounds.max) / 2 : (bounds.min ?? bounds.max);
            const showTargetForm = !NO_TARGET_FORM.includes(chemicalType);

            return (
              <form key={chemicalType} action={updateChemicalTypeSettings} className="app-card-inset">
                <input type="hidden" name="chemicalType" value={chemicalType} />
                <h3 className="text-sm font-semibold text-brand-ink">{CHEMICAL_GROUP_LABELS[chemicalType]}</h3>

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
                            className="app-field-sm w-20"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-brand-muted">
                          <input type="radio" name="primary" value={p.id} defaultChecked={setting?.isPrimary ?? false} />
                          Primary
                        </label>
                        <label className="flex items-center gap-1 text-xs text-brand-muted">
                          Billing product
                          <select
                            name={`billing_${p.id}`}
                            defaultValue={setting?.linkedBillingProductId ?? ""}
                            className="app-field-sm"
                          >
                            <option value="">— not linked —</option>
                            {products
                              .filter((prod) => prod.active)
                              .map((prod) => (
                                <option key={prod.id} value={prod.id}>
                                  {prod.name} ({prod.unit})
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>

                {!showTargetForm ? (
                  <p className="mt-3 text-xs text-brand-ink/60">
                    {chemicalType === "PH_UP" || chemicalType === "PH_DOWN"
                      ? "pH has no ppm-based compliance target here -- it's corrected via an in-field Base/Acid Demand test, not a target range."
                      : "Compliance target is shared with Total Alkalinity (raise) above — set it there."}
                  </p>
                ) : (
                  <div className="mt-3 rounded border border-brand-border bg-brand-surface p-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Compliance target</p>
                    {midpoint == null ? (
                      <p className="mt-1 text-xs text-brand-ink/60">No state compliance data for this chemical — set your own target below.</p>
                    ) : (
                      <p className="mt-1 app-metric text-xs text-brand-ink">
                        State range: {bounds.min ?? "—"}–{bounds.max ?? "—"} · midpoint {midpoint}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {SINGLE_POINT_TARGET.includes(chemicalType) ? (
                        <input
                          name="targetValue"
                          type="number"
                          step="1"
                          placeholder="Target ppm"
                          defaultValue={target?.orgTargetValue?.toString() ?? ""}
                          className="app-field-sm w-24"
                        />
                      ) : (
                        <>
                          <input
                            name="targetMin"
                            type="number"
                            step="0.1"
                            placeholder="Min"
                            defaultValue={target?.orgTargetMin?.toString() ?? ""}
                            className="app-field-sm w-20"
                          />
                          <input
                            name="targetMax"
                            type="number"
                            step="0.1"
                            placeholder="Max"
                            defaultValue={target?.orgTargetMax?.toString() ?? ""}
                            className="app-field-sm w-20"
                          />
                        </>
                      )}
                      <span className="text-xs text-brand-ink/60">Leave blank to use the state midpoint above.</span>
                    </div>
                  </div>
                )}

                <button type="submit" className="app-btn-primary-sm mt-3">
                  Save
                </button>
              </form>
            );
          })}
        </div>
      </section>

      {/* Safety Data Sheets -- own section, not nested inside the settings form above
          (upload/remove need their own <form>s, and HTML doesn't allow nested forms). */}
      <section data-tour="chemicals-sds" className="app-card mt-6">
        <h2 className="text-base font-semibold text-brand-ink">Safety Data Sheets</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Every product below links to its manufacturer&rsquo;s own published SDS where one was verified. If your actual
          supplier&rsquo;s formulation differs, upload your own PDF to override it — customers only ever see documents for
          products you&rsquo;ve enabled above.
        </p>

        <div className="mt-4 space-y-4">
          {Array.from(catalogGroups.entries()).map(([chemicalType, groupProducts]) => (
            <div key={chemicalType} className="app-card-inset">
              <h3 className="text-sm font-semibold text-brand-ink">{CHEMICAL_GROUP_LABELS[chemicalType]}</h3>
              <div className="mt-2 space-y-2">
                {groupProducts.map((p) => {
                  const setting = settingByProductId.get(p.id);
                  const resolved = resolveSds(p, setting, sdsUrlByProductId.get(p.id) ?? null);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 rounded border border-brand-border px-3 py-2 text-sm">
                      <span className="font-medium text-brand-ink">{p.name}</span>

                      {resolved.kind === "org-upload" ? (
                        <a href={resolved.url} target="_blank" rel="noreferrer" className="text-brand-primary underline">
                          {resolved.fileName}
                        </a>
                      ) : resolved.kind === "system-default" ? (
                        <a href={resolved.url} target="_blank" rel="noreferrer" className="text-brand-primary underline">
                          View SDS {resolved.sourceLabel ? <span className="text-xs text-brand-muted">({resolved.sourceLabel})</span> : null}
                        </a>
                      ) : (
                        <span className="text-xs text-brand-ink/60">No SDS available yet — upload one.</span>
                      )}

                      <div className="ml-auto flex items-center gap-2">
                        <form action={uploadChemicalSds} className="flex items-center gap-1">
                          <input type="hidden" name="catalogProductId" value={p.id} />
                          <input type="file" name="file" accept="application/pdf" required className="w-40 text-xs" />
                          <button type="submit" className="app-btn-secondary-sm">
                            {resolved.kind === "org-upload" ? "Replace" : "Upload"}
                          </button>
                        </form>
                        {resolved.kind === "org-upload" ? (
                          <form action={removeChemicalSds}>
                            <input type="hidden" name="catalogProductId" value={p.id} />
                            <ConfirmSubmitButton
                              label="Remove"
                              confirmMessage={`Remove your uploaded SDS for "${p.name}"? ${
                                p.sdsDocumentUrl ? "The system default will show again." : "No document will show until you upload another."
                              }`}
                              className="app-btn-danger-sm"
                            />
                          </form>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
