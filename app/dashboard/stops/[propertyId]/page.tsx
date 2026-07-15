import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { VISIT_PHOTOS_BUCKET } from "@/lib/visit-photos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { StopCapture, type StopBody } from "./stop-capture";

type PageProps = {
  params: Promise<{ propertyId: string }>;
  searchParams?: Promise<{ date?: string; visits?: string }>;
};

function parseYmd(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

export default async function StopCapturePage({ params, searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const { propertyId } = await params;
  const sp = (await searchParams) ?? {};
  const day = parseYmd(sp.date);
  const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);

  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: appUser.organizationId },
    select: { id: true, name: true },
  });
  if (!property) notFound();

  const canAccess = appUser.role === "ADMIN" || appUser.role === "OFFICE";
  // The route-day view passes the exact set of visit ids that were actually visited
  // back-to-back as one occasion (see grouping logic in route-day-view.tsx). This matters
  // for properties with a split layout — e.g. a front pool/spa and a separate back
  // pool/spa — so this screen never mixes photos across two different physical visits
  // just because they share a property id and a calendar day.
  const explicitVisitIds = sp.visits ? sp.visits.split(",").filter(Boolean) : null;

  const visits = await prisma.serviceVisit.findMany({
    where: {
      propertyId,
      organizationId: appUser.organizationId,
      status: { not: "CANCELLED" },
      ...(canAccess ? {} : { technicianId: appUser.id }),
      ...(explicitVisitIds
        ? { id: { in: explicitVisitIds } }
        : { scheduledStart: { gte: startOfDay, lte: endOfDay } }),
    },
    orderBy: { routeSequence: "asc" },
    select: {
      id: true,
      status: true,
      bodyOfWater: { select: { name: true, type: true } },
      photos: { orderBy: { createdAt: "desc" }, select: { id: true, storagePath: true } },
    },
  });

  if (!visits.length) notFound();

  const supabaseAdmin = createSupabaseAdminClient();
  const bodies: StopBody[] = await Promise.all(
    visits.map(async (v) => {
      const thumbnails = await Promise.all(
        v.photos.slice(0, 6).map(async (p) => {
          const { data } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).createSignedUrl(p.storagePath, 3600);
          return { id: p.id, url: data?.signedUrl ?? null };
        }),
      );
      return {
        visitId: v.id,
        bodyName: v.bodyOfWater.name,
        bodyType: v.bodyOfWater.type,
        status: v.status,
        photoCount: v.photos.length,
        thumbnails,
      };
    }),
  );

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-[#0A5FA4] underline">
          Back to dashboard
        </Link>
      </div>
      <header className="rounded-lg border border-[#12234A] bg-[#12234A] p-4 shadow-sm">
        <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[#FF6B5B]">
          Capture all photos for this stop
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold uppercase text-white">{property.name}</h1>
        <p className="mt-1 text-sm text-[#A9D3E0]">
          {bodies.length} bod{bodies.length === 1 ? "y" : "ies"} of water · {day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </header>

      <div className="mt-6">
        <StopCapture propertyName={property.name} bodies={bodies} />
      </div>
    </main>
  );
}
