import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { geocodeAddress, buildFullAddress } from "@/lib/geocode";
import { PropertyLocationPicker } from "@/app/components/property-location-picker";

type PageProps = {
  params: Promise<{ propertyId: string }>;
};

// Continental US center -- last-resort fallback when there's no address to geocode and no
// other geocoded property in the org to guess a neighborhood from.
const US_CENTER = { latitude: 39.8283, longitude: -98.5795 };

export default async function LocatePropertyPage({ params }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { propertyId } = await params;

  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: appUser.organizationId },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
      customer: { select: { id: true, name: true } },
    },
  });
  if (!property) notFound();

  let center: { latitude: number; longitude: number };
  let zoom: number;
  let hasConfidentStart: boolean;

  if (property.latitude != null && property.longitude != null) {
    center = { latitude: Number(property.latitude), longitude: Number(property.longitude) };
    zoom = 19;
    hasConfidentStart = true;
  } else {
    const fullAddress = buildFullAddress(property);
    const geocoded = fullAddress ? await geocodeAddress(fullAddress) : null;
    if (geocoded) {
      center = geocoded;
      zoom = 19;
      hasConfidentStart = true;
    } else {
      // Fall back to the centroid of the org's other already-geocoded properties -- a rough
      // "somewhere near your other stops" starting point, not a real guess at this address.
      const others = await prisma.property.findMany({
        where: { organizationId: appUser.organizationId, latitude: { not: null }, longitude: { not: null } },
        select: { latitude: true, longitude: true },
        take: 200,
      });
      if (others.length > 0) {
        const avgLat = others.reduce((sum, o) => sum + Number(o.latitude), 0) / others.length;
        const avgLng = others.reduce((sum, o) => sum + Number(o.longitude), 0) / others.length;
        center = { latitude: avgLat, longitude: avgLng };
        zoom = 11;
      } else {
        center = US_CENTER;
        zoom = 4;
      }
      hasConfidentStart = false;
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/routes" className="underline">
          Routes
        </Link>
      </div>

      <header className="mt-2 border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">
          {property.customer?.name ?? "No customer"}
        </p>
        <h1 className="text-2xl font-semibold text-brand-ink">Mark {property.name}&rsquo;s location</h1>
        <p className="mt-1 text-sm text-brand-muted">
          {[property.addressLine1, property.addressLine2, property.city, property.region, property.postalCode]
            .filter(Boolean)
            .join(", ") || "No address on file."}
        </p>
      </header>

      <section className="mt-6">
        <PropertyLocationPicker
          propertyId={property.id}
          initialLatitude={center.latitude}
          initialLongitude={center.longitude}
          initialZoom={zoom}
          hasConfidentStart={hasConfidentStart}
        />
      </section>
    </main>
  );
}
