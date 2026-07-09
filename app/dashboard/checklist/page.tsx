import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { createChecklistItem, deleteChecklistItem } from "./actions";

export default async function ChecklistPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const items = await prisma.checklistItemDefinition.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Admin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Service checklist</h1>
        <p className="mt-1 text-sm text-slate-500">Tasks technicians check off at every visit.</p>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="text-slate-900">{item.label}</span>
              <form action={deleteChecklistItem}>
                <input type="hidden" name="id" value={item.id} />
                <ConfirmSubmitButton
                  label="🗑"
                  confirmMessage={`Permanently delete "${item.label}"? Past visit history keeps its record of whether this was completed.`}
                  className="rounded px-2 py-1 text-base hover:bg-slate-200"
                />
              </form>
            </li>
          ))}
          {items.length === 0 ? <p className="text-sm text-slate-500">No checklist items yet.</p> : null}
        </ul>

        <form action={createChecklistItem} className="mt-4 flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-3">
          <input
            name="label"
            required
            placeholder="New checklist item"
            className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Add item
          </button>
        </form>
      </section>
    </main>
  );
}
