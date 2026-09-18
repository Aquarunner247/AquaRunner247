import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { generateQrDataUrl, publicBodyOfWaterUrl } from "@/lib/qr";
import { PlacardCard } from "@/app/components/placard-card";
import { PlacardPrintButton } from "@/app/p/[publicSlug]/placard/placard-print-button";

type PageProps = {
  searchParams?: Promise<{ ids?: string | string[] }>;
};

export default async function BatchPlacardPrintPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const ids = !sp.ids ? [] : Array.isArray(sp.ids) ? sp.ids : [sp.ids];
  if (ids.length === 0) redirect("/dashboard/customers/placards");

  // Org- and propertyType-scoped exactly like the picker that links here -- a manually
  // edited URL can't pull in another org's venue or a residential one that never had a
  // real placard to print.
  const bodies = await prisma.bodyOfWater.findMany({
    where: {
      id: { in: ids },
      property: { organizationId: appUser.organizationId, propertyType: { not: "RESIDENTIAL" } },
    },
    select: { id: true, name: true, publicSlug: true, property: { select: { name: true } } },
  });
  if (bodies.length === 0) notFound();

  const placards = await Promise.all(
    bodies.map(async (body) => ({
      id: body.id,
      propertyName: body.property.name,
      bodyName: body.name,
      qrDataUrl: await generateQrDataUrl(publicBodyOfWaterUrl(body.publicSlug)),
    })),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-8 bg-brand-surface px-4 py-10 print:min-h-0 print:max-w-none print:gap-0 print:bg-white print:py-0">
      <div className="print:hidden">
        <PlacardPrintButton />
        <p className="mt-2 text-center text-sm text-brand-muted">
          {placards.length} placard{placards.length === 1 ? "" : "s"} ready to print
        </p>
      </div>

      {placards.map((placard, i) => (
        <div key={placard.id} className={i < placards.length - 1 ? "print:break-after-page" : undefined}>
          <PlacardCard propertyName={placard.propertyName} bodyName={placard.bodyName} qrDataUrl={placard.qrDataUrl} />
        </div>
      ))}
    </main>
  );
}
