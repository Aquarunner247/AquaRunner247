import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { RESIDENTIAL_CHECKLIST_CATEGORIES } from "@/lib/default-residential-checklist";
import { ResidentialItemSettings } from "./residential-item-settings";
import {
  createChecklistItem,
  deleteChecklistItem,
  moveChecklistItem,
  updateChecklistItemSettings,
} from "./actions";

type ChecklistRow = {
  id: string;
  label: string;
  category: string | null;
  required: boolean;
  billable: boolean;
  chargeAmount: number | null;
};

export default async function ChecklistPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const items = await prisma.checklistItemDefinition.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      label: true,
      scope: true,
      category: true,
      required: true,
      billable: true,
      chargeAmount: true,
    },
  });

  // Decimal does not cross into a Client Component, and ResidentialItemSettings needs the price.
  const toRow = (item: (typeof items)[number]): ChecklistRow => ({
    id: item.id,
    label: item.label,
    category: item.category,
    required: item.required,
    billable: item.billable,
    chargeAmount: item.chargeAmount != null ? Number(item.chargeAmount) : null,
  });

  const commercial = items.filter((item) => item.scope === "COMMERCIAL").map(toRow);
  const residential = items.filter((item) => item.scope === "RESIDENTIAL").map(toRow);

  // Same grouping the technician's screen does (residential-visit-form.tsx): one heading per
  // distinct category, placed where that category first appears in sortOrder. Derived the same way
  // on purpose -- this screen is where the order gets set, so it has to show the real result.
  const residentialCategories = [...new Set(residential.map((item) => item.category ?? "Other"))];
  const knownCategories = [...new Set([...RESIDENTIAL_CHECKLIST_CATEGORIES, ...residentialCategories])];

  return (
    <main className="app-page">
      {/* Reached from Settings now rather than the side nav, so it needs a way back. */}
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/settings" className="app-link">
          Settings
        </Link>
        {" / "}
        <span>Service checklist</span>
      </div>

      <header className="app-page-head mt-2">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Service checklist</h1>
        <p className="app-subhead">
          Tasks technicians tick off at every visit. Completed items are listed in the customer&rsquo;s service summary
          email, which is what the service messages point at. Commercial and residential properties have separate
          lists.
        </p>
      </header>

      <section className="app-card mt-6">
        <h2 className="font-display text-lg font-semibold text-brand-ink">Commercial</h2>
        <p className="mt-1 text-sm text-brand-muted">Used on every commercial property.</p>

        <ul data-tour="checklist-list" className="mt-4 space-y-2">
          {commercial.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-1">
                <ReorderButtons
                  id={item.id}
                  label={item.label}
                  scope="COMMERCIAL"
                  canMoveUp={index > 0}
                  canMoveDown={index < commercial.length - 1}
                />
                <span className="text-brand-ink">{item.label}</span>
              </span>
              <DeleteButton id={item.id} label={item.label} />
            </li>
          ))}
          {commercial.length === 0 ? <p className="text-sm text-brand-muted">No checklist items yet.</p> : null}
        </ul>

        <form
          action={createChecklistItem}
          data-tour="checklist-add-form"
          className="mt-4 flex items-center gap-2 rounded border border-brand-border bg-brand-surface p-3"
        >
          <input type="hidden" name="scope" value="COMMERCIAL" />
          <input name="label" required placeholder="New checklist item" className="app-field-sm flex-1" />
          <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Add item
          </button>
        </form>
      </section>

      <section className="app-card mt-6">
        <h2 className="font-display text-lg font-semibold text-brand-ink">Residential</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Used on every residential property, grouped on the technician&rsquo;s screen by the headings below.{" "}
          <strong className="font-semibold text-brand-ink">Required</strong> items stop a technician closing the stop
          until they are ticked, the same way a required reading does.{" "}
          <strong className="font-semibold text-brand-ink">Chargeable</strong> items show their price to the technician
          as they tick them, and the price is recorded on that visit — changing it later never alters what a past visit
          charged.
        </p>

        {residentialCategories.map((category) => (
          <div key={category} className="mt-5">
            <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-muted">{category}</p>
            <ul className="mt-2 space-y-2">
              {residential
                .filter((item) => (item.category ?? "Other") === category)
                .map((item) => {
                  // Position in the whole residential list, not within the group: the arrows swap
                  // sortOrder, which is one sequence across every group.
                  const index = residential.findIndex((other) => other.id === item.id);
                  return (
                    <li key={item.id} className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1">
                          <ReorderButtons
                            id={item.id}
                            label={item.label}
                            scope="RESIDENTIAL"
                            canMoveUp={index > 0}
                            canMoveDown={index < residential.length - 1}
                          />
                          <span className="min-w-0 text-brand-ink">{item.label}</span>
                        </span>
                        <DeleteButton id={item.id} label={item.label} />
                      </div>
                      <ResidentialItemSettings
                        action={updateChecklistItemSettings}
                        id={item.id}
                        label={item.label}
                        required={item.required}
                        billable={item.billable}
                        chargeAmount={item.chargeAmount}
                      />
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
        {residential.length === 0 ? (
          <p className="mt-4 text-sm text-brand-muted">No residential checklist items yet.</p>
        ) : null}

        <form action={createChecklistItem} className="mt-5 rounded border border-brand-border bg-brand-surface p-3">
          <input type="hidden" name="scope" value="RESIDENTIAL" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <input name="label" required placeholder="New residential item" className="app-field-sm" />
            {/* Free text with suggestions rather than a select: a company adding its own grouping
                should not need a code change, which is why category is a nullable String. */}
            <input
              name="category"
              list="residential-checklist-categories"
              placeholder="Group (optional)"
              className="app-field-sm"
            />
            <datalist id="residential-checklist-categories">
              {knownCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <button
              className="min-h-[44px] rounded bg-brand-primary px-3 text-sm font-medium text-white"
              type="submit"
            >
              Add item
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4">
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-brand-ink">
              <input type="checkbox" name="required" className="h-5 w-5 accent-brand-primary" />
              Required
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-brand-ink">
              <input type="checkbox" name="billable" className="h-5 w-5 accent-brand-primary" />
              Chargeable
            </label>
            <span className="flex items-center gap-1.5 text-sm text-brand-ink">
              $
              <input
                name="chargeAmount"
                inputMode="decimal"
                placeholder="price"
                aria-label="Price for the new item"
                className="app-field-sm w-24"
              />
            </span>
          </div>
        </form>
      </section>
    </main>
  );
}

function ReorderButtons({
  id,
  label,
  scope,
  canMoveUp,
  canMoveDown,
}: {
  id: string;
  label: string;
  scope: "COMMERCIAL" | "RESIDENTIAL";
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <span className="flex flex-col">
      {canMoveUp ? (
        <form action={moveChecklistItem}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="direction" value="up" />
          <button
            type="submit"
            aria-label={`Move "${label}" up`}
            className="block px-1 leading-none text-brand-muted hover:text-brand-ink"
          >
            ▲
          </button>
        </form>
      ) : (
        <span className="block px-1 leading-none text-brand-border">▲</span>
      )}
      {canMoveDown ? (
        <form action={moveChecklistItem}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="direction" value="down" />
          <button
            type="submit"
            aria-label={`Move "${label}" down`}
            className="block px-1 leading-none text-brand-muted hover:text-brand-ink"
          >
            ▼
          </button>
        </form>
      ) : (
        <span className="block px-1 leading-none text-brand-border">▼</span>
      )}
    </span>
  );
}

function DeleteButton({ id, label }: { id: string; label: string }) {
  return (
    <form action={deleteChecklistItem}>
      <input type="hidden" name="id" value={id} />
      <ConfirmSubmitButton
        label="🗑"
        confirmMessage={`Permanently delete "${label}"? Past visit history keeps its record of whether this was completed.`}
        className="rounded px-2 py-1 text-base hover:bg-brand-border"
      />
    </form>
  );
}
