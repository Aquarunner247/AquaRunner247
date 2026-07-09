import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { VisitForm } from "./visit-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function VisitPage({ params }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    redirect("/login");
  }

  const { id } = await params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    include: {
      property: { select: { name: true } },
      bodyOfWater: { select: { id: true, name: true, type: true } },
      reading: true,
      doses: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, takenAt: true } },
      checklistCompletions: { select: { checklistItemId: true, completed: true } },
      issues: { orderBy: { createdAt: "desc" }, select: { id: true, description: true, severity: true, createdAt: true } },
    },
  });

  if (!visit || visit.organizationId !== appUser.organizationId) notFound();

  const canAccess = appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id;
  if (!canAccess) notFound();

  // Cyanuric acid only needs checking once every 30 days per body of water —
  // skip requiring it again if a recent reading already covers this period.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentCya = await prisma.visitWaterReading.findFirst({
    where: {
      visit: {
        bodyOfWaterId: visit.bodyOfWaterId,
        id: { not: visit.id },
        completedAt: { gte: thirtyDaysAgo },
      },
      cyanuricAcidPpm: { not: null },
    },
    select: { id: true },
  });
  const cyaRequired = !recentCya;

  const chemicalProducts = await prisma.chemicalProduct.findMany({
    where: { organizationId: appUser.organizationId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });

  const checklistItemDefs = await prisma.checklistItemDefinition.findMany({
    where: { organizationId: appUser.organizationId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true },
  });
  const completionById = new Map(visit.checklistCompletions.map((c) => [c.checklistItemId, c.completed]));
  const checklistItems = checklistItemDefs.map((item) => ({
    id: item.id,
    label: item.label,
    completed: completionById.get(item.id) ?? false,
  }));

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-[#0A5FA4] underline">
          Back to dashboard
        </Link>
      </div>
      <header className="rounded-lg border border-[#12234A] bg-[#12234A] p-4 shadow-sm">
        <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[#FF6B5B]">
          Technician visit
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold uppercase text-white">{visit.property.name}</h1>
        <p className="mt-1 text-sm text-[#A9D3E0]">
          {visit.bodyOfWater.name} • {visit.scheduledStart.toLocaleString()}
        </p>
      </header>

      <VisitForm
        visitId={visit.id}
        visitStatus={visit.status}
        bodyOfWaterType={visit.bodyOfWater.type}
        cyaRequired={cyaRequired}
        chemicalProducts={chemicalProducts}
        checklistItems={checklistItems}
        initialIssues={visit.issues.map((i) => ({
          id: i.id,
          description: i.description,
          severity: i.severity,
          createdAt: i.createdAt.toISOString(),
        }))}
        initialReading={visit.reading}
        initialPhotoCount={visit.photos.length}
        initialDoses={visit.doses.map((d) => ({
          id: d.id,
          productName: d.productName,
          quantity: d.quantity.toString(),
          unit: d.unit,
        }))}
      />
    </main>
  );
}
