import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { LocationPicker } from "@/app/components/location-picker";
import { setMyStartLocation, clearMyStartLocation } from "@/app/dashboard/actions";

type PageProps = {
  searchParams?: Promise<{ saved?: string; cleared?: string }>;
};

/// Only used when the person has no pin yet AND their org has no geocoded properties to
/// average — the valley this org services, so the map opens somewhere recognizable.
const FALLBACK_CENTER = { latitude: 36.1699, longitude: -115.1398 };

export default async function MyStartLocationPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  const sp = (await searchParams) ?? {};

  const me = await prisma.user.findUnique({
    where: { id: appUser.id },
    select: { startLatitude: true, startLongitude: true, startAddress: true },
  });

  const hasPin = me?.startLatitude != null && me?.startLongitude != null;

  // Centre on the existing pin, else roughly where this org works — the centroid of its
  // geocoded properties. Better than a national view for someone about to find their own house.
  let center = FALLBACK_CENTER;
  let zoom = 11;
  if (hasPin) {
    center = { latitude: Number(me!.startLatitude), longitude: Number(me!.startLongitude) };
    zoom = 19;
  } else {
    const others = await prisma.property.findMany({
      where: { organizationId: appUser.organizationId, latitude: { not: null }, longitude: { not: null } },
      select: { latitude: true, longitude: true },
      take: 200,
    });
    if (others.length > 0) {
      center = {
        latitude: others.reduce((sum, o) => sum + Number(o.latitude), 0) / others.length,
        longitude: others.reduce((sum, o) => sum + Number(o.longitude), 0) / others.length,
      };
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-24">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/more" className="underline">
          More
        </Link>
      </div>

      <header className="mt-2 border-b border-brand-border pb-4">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-brand-ink">Where your day starts</h1>
        <p className="mt-2 text-sm text-brand-ink">
          Set the place you leave from and come back to — usually home. &ldquo;Optimize stop order&rdquo; then plans the day
          as a round trip, so your last stop is the one nearest here instead of whichever one was left over.
        </p>
        <p className="mt-2 text-sm text-brand-muted">
          Leave it unset and nothing changes: your route just starts at whichever stop is first.
        </p>
      </header>

      {sp.saved ? <p className="mt-4 text-sm text-brand-ok">Saved.</p> : null}
      {sp.cleared ? <p className="mt-4 text-sm text-brand-ok">Cleared — your route will start at its first stop again.</p> : null}

      <section className="mt-4 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-brand-ink">
          {hasPin ? me?.startAddress || "Start point set" : "No start point yet"}
        </p>
        {hasPin ? (
          <p className="mt-1 text-xs text-brand-muted">
            <span className="app-metric">
              {Number(me!.startLatitude).toFixed(6)}, {Number(me!.startLongitude).toFixed(6)}
            </span>
          </p>
        ) : null}
        {hasPin ? (
          <form action={clearMyStartLocation} className="mt-3">
            <button type="submit" className="app-btn-secondary-sm">
              Remove start point
            </button>
          </form>
        ) : null}
      </section>

      <section className="mt-4">
        <LocationPicker
          action={setMyStartLocation}
          hiddenFields={{}}
          initialLatitude={center.latitude}
          initialLongitude={center.longitude}
          initialZoom={zoom}
          hasConfidentStart={hasPin}
          instruction="Click the map where you set off from each morning, then drag the pin to fine-tune it."
          saveLabel={hasPin ? "Update start point" : "Save start point"}
          noteField={{
            name: "startAddress",
            label: "Label (optional)",
            placeholder: "Home",
            defaultValue: me?.startAddress ?? "",
          }}
        />
      </section>
    </main>
  );
}
