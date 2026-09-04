import { prisma } from "@/lib/prisma";
import { generateQrDataUrl, publicBodyOfWaterUrl } from "@/lib/qr";
import { PlacardPrintButton } from "./placard-print-button";

type PageProps = {
  params: Promise<{ publicSlug: string }>;
};

export default async function BodyOfWaterPlacardPage({ params }: PageProps) {
  const { publicSlug } = await params;

  const body = await prisma.bodyOfWater.findUnique({
    where: { publicSlug },
    select: {
      name: true,
      property: {
        select: {
          name: true,
          propertyType: true,
          organization: { select: { complianceRuleset: { select: { isSupported: true } } } },
        },
      },
    },
  });

  // Same treatment as the main public log page: residential venues and accounts whose
  // state isn't compliance-supported never had a public slug worth printing a placard
  // for, so this 404s identically to a genuinely-unknown slug.
  const rulesetActive = body?.property.organization.complianceRuleset?.isSupported ?? false;
  if (!body || body.property.propertyType === "RESIDENTIAL" || !rulesetActive) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center text-brand-muted">
        No aquatic venue found for this QR reference.
      </main>
    );
  }

  const publicUrl = publicBodyOfWaterUrl(publicSlug);
  const qrDataUrl = await generateQrDataUrl(publicUrl);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-6 bg-brand-surface px-4 py-10 print:min-h-0 print:gap-0 print:bg-white print:py-0">
      <div className="w-full max-w-sm rounded-sm border-t-[6px] border-brand-anchor bg-white p-6 shadow-softLg print:shadow-none print:border print:border-t-[6px] print:border-brand-border print:border-t-brand-anchor">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-bold leading-none tracking-tight text-brand-ink">{body.property.name}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-brand-muted">{body.name}</p>
          </div>
          <span className="whitespace-nowrap border border-brand-border px-2 py-1 text-[0.62rem] font-bold uppercase tracking-widest text-brand-muted">
            Scan me
          </span>
        </div>
        <div className="mt-4 aspect-square w-full border border-brand-border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt={`QR code for ${body.name} public log`} className="h-full w-full" />
        </div>
        <p className="mt-4 border-t border-brand-border pt-3 text-sm leading-relaxed text-brand-muted">
          Scan to view the current, complete record for this pool — no login needed.
        </p>
      </div>
      <PlacardPrintButton />
    </main>
  );
}
