import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { LocationPicker } from "@/app/components/location-picker";
import { setMyEndLocation, clearMyEndLocation } from "@/app/dashboard/actions";

type PageProps = {
  searchParams?: Promise<{ saved?: string; cleared?: string }>;
};

/// Same fallback as the start page — the valley this org services, so the map opens somewhere
/// recognizable when there's nothing else to centre on.
const FALLBACK_CENTER = { latitude: 36.1699, longitude: -115.1398 };

export default async function MyEndLocationPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  const sp = (await searchParams) ?? {};

  const me = await prisma.user.findUnique({
    where: { id: appUser.id },
    select: {
      endLatitude: true,
      endLongitude: true,
      endAddress: true,
      startLatitude: true,
      startLongitude: true,
      startAddress: true,
    },
  });

  const hasPin = me?.endLatitude != null && me?.endLongitude != null;
  const hasStart = me?.startLatitude != null && me?.startLongitude != null;

  // Centre on the end pin if there is one, else the start pin — most people finish near where
  // they began, so that's a far better opening view than a city centroid.
  let center = FALLBACK_CENTER;
  let zoom = 11;
  if (hasPin) {
    center = { latitude: Number(me!.endLatitude), longitude: Number(me!.endLongitude) };
    zoom = 19;
  } else if (hasStart) {
    center = { latitude: Number(me!.startLatitude), longitude: Number(me!.startLongitude) };
    zoom = 15;
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
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-brand-ink">Where your day ends</h1>
        <p className="mt-2 text-sm text-brand-ink">
          Only set this if you finish somewhere other than where you started — a shop, a yard, a second address.
          &ldquo;Optimize stop order&rdquo; then plans the day as a line from your start to here, instead of a loop.
        </p>
        <p className="mt-2 text-sm text-brand-muted">
          Leave it unset and your day finishes back at{" "}
          {hasStart ? me?.startAddress || "your start point" : "whichever stop is last"} — which is what it does today.
        </p>
      </header>

      {sp.saved ? <p className="mt-4 text-sm text-brand-ok">Saved.</p> : null}
      {sp.cleared ? (
        <p className="mt-4 text-sm text-brand-ok">Cleared — your day finishes back where it starts again.</p>
      ) : null}

      {!hasStart ? (
        <p className="mt-4 rounded-lg border border-brand-border bg-brand-surface p-3 text-sm text-brand-ink">
          You haven&rsquo;t set a start point yet.{" "}
          <Link href="/dashboard/more/start-location" className="app-link">
            Set where your day starts
          </Link>{" "}
          first — on its own, an end point only pins your last stop and can&rsquo;t plan the drive out.
        </p>
      ) : null}

      <section className="mt-4 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-brand-ink">{hasPin ? me?.endAddress || "End point set" : "No end point yet"}</p>
        {hasPin ? (
          <p className="mt-1 text-xs text-brand-muted">
            <span className="app-metric">
              {Number(me!.endLatitude).toFixed(6)}, {Number(me!.endLongitude).toFixed(6)}
            </span>
          </p>
        ) : null}
        {hasPin ? (
          <form action={clearMyEndLocation} className="mt-3">
            <button type="submit" className="app-btn-secondary-sm">
              Remove end point
            </button>
          </form>
        ) : null}
      </section>

      <section className="mt-4">
        <LocationPicker
          action={setMyEndLocation}
          hiddenFields={{}}
          initialLatitude={center.latitude}
          initialLongitude={center.longitude}
          initialZoom={zoom}
          hasConfidentStart={hasPin || hasStart}
          instruction="Click the map where you finish up each day, then drag the pin to fine-tune it."
          saveLabel={hasPin ? "Update end point" : "Save end point"}
          noteField={{
            name: "endAddress",
            label: "Label (optional)",
            placeholder: "Shop",
            defaultValue: me?.endAddress ?? "",
          }}
        />
      </section>
    </main>
  );
}
