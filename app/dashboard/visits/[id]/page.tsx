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
      bodyOfWater: { select: { id: true, name: true } },
      reading: true,
      doses: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, takenAt: true } },
    },
  });

  if (!visit || visit.organizationId !== appUser.organizationId) notFound();

  const canAccess = appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id;
  if (!canAccess) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-cyan-700 underline">
          Back to dashboard
        </Link>
      </div>
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technician visit</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{visit.property.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {visit.bodyOfWater.name} • {visit.scheduledStart.toLocaleString()}
        </p>
      </header>

      <VisitForm
        visitId={visit.id}
        visitStatus={visit.status}
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
