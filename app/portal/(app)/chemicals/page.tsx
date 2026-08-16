import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { getSdsSignedUrl, resolveSds } from "@/lib/sds-documents";

export default async function PortalChemicalsPage() {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const customer = await prisma.customer.findUnique({
    where: { id: customerUser.customerId },
    select: { organizationId: true },
  });
  if (!customer) redirect("/portal/login");

  // Only products this pool company has actually enabled -- never the full universal
  // catalog. Matches how the dosing calculator itself only ever uses enabled products.
  const settings = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId: customer.organizationId, isEnabled: true },
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
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-sm font-medium text-brand-ink">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Chemical Safety Data Sheets</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Safety Data Sheets for the chemicals your pool company uses on your account.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
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
                    <a href={resolved.url} target="_blank" rel="noreferrer" className="font-medium text-brand-primary underline">
                      View / Download
                    </a>
                  ) : resolved.kind === "system-default" ? (
                    <a href={resolved.url} target="_blank" rel="noreferrer" className="font-medium text-brand-primary underline">
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
