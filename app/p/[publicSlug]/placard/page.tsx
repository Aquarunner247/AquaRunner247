import { prisma } from "@/lib/prisma";
import { generateQrDataUrl, publicBodyOfWaterUrl } from "@/lib/qr";
import { PlacardCard } from "@/app/components/placard-card";
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
      <PlacardCard propertyName={body.property.name} bodyName={body.name} qrDataUrl={qrDataUrl} />
      <PlacardPrintButton />
    </main>
  );
}
