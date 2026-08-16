import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getSdsSignedUrl, resolveSds } from "@/lib/sds-documents";

/**
 * Read-only SDS lookup for staff (admin, office, and technicians) -- the same resolved
 * documents customers see in their portal, but reachable without one. Exists for the case
 * where a customer isn't connected to the portal but a technician on-site still needs the
 * hazard sheet for a chemical they're handling. No edit/upload controls here -- that stays
 * on the admin-only /dashboard/chemicals page.
 */
export default async function SafetyDataSheetsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const settings = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId: appUser.organizationId, isEnabled: true },
    include: { catalogProduct: true },
    orderBy: { catalogProduct: { displayOrder: "asc" } },
  });

  const sdsUrlByProductId = new Map<string, string>();
  await Promise.all(
    settings
      .filter((s) => s.sdsStoragePath)
      .map(async (s) => {
        const url = await getSdsSignedUrl(s.sdsStoragePath!);
        if (url) sdsUrlByProductId.set(s.catalogProductId, url);
      }),
  );

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-wide text-brand-ink">
          Safety Data Sheets
        </h1>
        <Link href="/dashboard/more" className="text-sm font-medium text-brand-primary underline">
          Back
        </Link>
      </div>
      <p className="mt-1 text-sm text-brand-muted">
        Hazard documents for the chemicals your company uses — useful on-site for accounts not connected to the customer portal.
      </p>

      <section className="mt-4 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        {settings.length === 0 ? (
          <p className="text-sm text-brand-muted">No chemical products configured yet.</p>
        ) : (
          <ul className="space-y-2 text-sm text-brand-ink">
            {settings.map((s) => {
              const resolved = resolveSds(s.catalogProduct, s, sdsUrlByProductId.get(s.catalogProductId) ?? null);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-brand-border bg-brand-surface px-3 py-2"
                >
                  <span className="font-medium text-brand-ink">
                    {s.catalogProduct.name}
                    {s.catalogProduct.activePercent != null ? (
                      <span className="ml-1 text-xs font-normal text-brand-muted">({Number(s.catalogProduct.activePercent)}%)</span>
                    ) : null}
                  </span>

                  {resolved.kind === "org-upload" ? (
                    <a href={resolved.url} target="_blank" rel="noreferrer" className="min-h-[44px] font-medium text-brand-primary underline">
                      View / Download
                    </a>
                  ) : resolved.kind === "system-default" ? (
                    <a href={resolved.url} target="_blank" rel="noreferrer" className="min-h-[44px] font-medium text-brand-primary underline">
                      View / Download{" "}
                      {resolved.sourceLabel ? <span className="text-xs font-normal text-brand-muted">({resolved.sourceLabel})</span> : null}
                    </a>
                  ) : (
                    <span className="text-xs text-brand-muted">Not yet available</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
