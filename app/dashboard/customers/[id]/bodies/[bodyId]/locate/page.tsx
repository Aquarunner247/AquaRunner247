import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { geocodeAddress, buildFullAddress } from "@/lib/geocode";
import { LocationPicker } from "@/app/components/location-picker";
import { setBodyOfWaterLocation } from "@/app/dashboard/routes/actions";

/// Last-resort centre when the property has no coordinates and its address won't geocode.
/// Las Vegas rather than the continental-US centroid the property locate page falls back to:
/// this org services the valley, and a map opening on Kansas is useless to everyone.
const FALLBACK_CENTER = { latitude: 36.1699, longitude: -115.1398 };

type PageProps = {
  params: Promise<{ id: string; bodyId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
};

export default async function LocateBodyOfWaterPage({ params, searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { id: customerId, bodyId } = await params;
  const sp = (await searchParams) ?? {};

  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyId, property: { organizationId: appUser.organizationId, customerId } },
    select: {
      id: true,
      name: true,
      type: true,
      latitude: true,
      longitude: true,
      property: {
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
        },
      },
    },
  });
  if (!body) notFound();

  // Centring, best source first. Unlike the property locate page there is no org-centroid or
  // continental-US fallback worth reaching for: a body of water always belongs to a property, so
  // that property's own coordinate is a genuinely good starting point, and the technician just
  // nudges the pin from there onto the right pool.
  let center: { latitude: number; longitude: number };
  let zoom: number;
  let hasConfidentStart: boolean;

  if (body.latitude != null && body.longitude != null) {
    center = { latitude: Number(body.latitude), longitude: Number(body.longitude) };
    zoom = 20;
    hasConfidentStart = true;
  } else if (body.property.latitude != null && body.property.longitude != null) {
    center = { latitude: Number(body.property.latitude), longitude: Number(body.property.longitude) };
    zoom = 19;
    // Deliberately false: the property's pin is the right place to LOOK, but it isn't this body
    // of water's location, and showing a marker there would invite saving it unchanged.
    hasConfidentStart = false;
  } else {
    const fullAddress = buildFullAddress(body.property);
    const geocoded = fullAddress ? await geocodeAddress(fullAddress) : null;
    center = geocoded ?? FALLBACK_CENTER;
    zoom = geocoded ? 19 : 11;
    hasConfidentStart = false;
  }

  const bodyPath = `/dashboard/customers/${customerId}/bodies/${bodyId}`;
  const returnTo = sp.returnTo === "routes" ? "/dashboard/routes" : bodyPath;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-brand-muted">
        <Link href={bodyPath} className="underline">
          Back to {body.name}
        </Link>
      </div>

      <header className="mt-2 border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">{body.property.name}</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Mark {body.name}&rsquo;s exact location</h1>
        <p className="mt-1 text-sm text-brand-muted">
          {body.latitude != null
            ? "This body of water already has a pin — drag it or click elsewhere to move it."
            : body.property.latitude != null
              ? "The map is centred on the property. Click the pool itself, which may be some distance from the property pin."
              : "This property has no coordinates yet either, so the map is centred on its address."}
        </p>
      </header>

      <section className="mt-6">
        <LocationPicker
          action={setBodyOfWaterLocation}
          hiddenFields={{ bodyOfWaterId: body.id, returnTo }}
          initialLatitude={center.latitude}
          initialLongitude={center.longitude}
          initialZoom={zoom}
          hasConfidentStart={hasConfidentStart}
          instruction={`Click the satellite image right on ${body.name} (or drag the pin once placed) to mark exactly where it sits.`}
          saveLabel="Save this pin"
        />
      </section>
    </main>
  );
}
