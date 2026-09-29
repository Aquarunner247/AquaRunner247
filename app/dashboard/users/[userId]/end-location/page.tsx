import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { LocationPicker } from "@/app/components/location-picker";
import { clearUserEndLocation, setUserEndLocation } from "@/app/dashboard/users/actions";

type PageProps = {
  params: Promise<{ userId: string }>;
};

/// Only when the org has no geocoded properties to average -- the valley this org services.
const FALLBACK_CENTER = { latitude: 36.1699, longitude: -115.1398 };

export default async function SetUserEndLocationPage({ params }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { userId } = await params;

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: appUser.organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      endLatitude: true,
      endLongitude: true,
      endAddress: true,
      startLatitude: true,
      startLongitude: true,
      startAddress: true,
    },
  });
  if (!target) notFound();

  const who = target.name ?? target.email;
  const hasPin = target.endLatitude != null && target.endLongitude != null;
  const hasStart = target.startLatitude != null && target.startLongitude != null;

  // End pin, else their start pin — most people finish near where they began, so that beats a
  // city centroid as an opening view.
  let center = FALLBACK_CENTER;
  let zoom = 11;
  if (hasPin) {
    center = { latitude: Number(target.endLatitude), longitude: Number(target.endLongitude) };
    zoom = 19;
  } else if (hasStart) {
    center = { latitude: Number(target.startLatitude), longitude: Number(target.startLongitude) };
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
    <main className="app-page-lg">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/users?tab=staff" className="underline">
          Users
        </Link>
      </div>

      <header className="app-page-head mt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">{who}</p>
        <h1 className="app-h1">Where {who}&rsquo;s day ends</h1>
        <p className="mt-2 text-sm text-brand-ink">
          Only needed if they finish somewhere other than where they started — a shop, a yard, a second address. Their
          routes are then optimized as a line from their start to here rather than as a loop.
        </p>
        <p className="mt-2 text-sm text-brand-muted">
          Leave it unset and their day finishes back at{" "}
          {hasStart ? target.startAddress || "their start point" : "whichever stop is last"}. They can also set this
          themselves under More → Where your day ends.
        </p>
      </header>

      {!hasStart ? (
        <p className="app-card mt-4 text-sm text-brand-ink">
          {who} has no start point yet.{" "}
          <Link href={`/dashboard/users/${target.id}/start-location`} className="app-link">
            Set where their day starts
          </Link>{" "}
          first — on its own, an end point only pins their last stop and can&rsquo;t plan the drive out.
        </p>
      ) : null}

      {hasPin ? (
        <section className="app-card mt-4">
          <p className="text-sm font-semibold text-brand-ink">{target.endAddress || "End point set"}</p>
          <p className="mt-1 text-xs text-brand-muted">
            <span className="app-metric">
              {Number(target.endLatitude).toFixed(6)}, {Number(target.endLongitude).toFixed(6)}
            </span>
          </p>
          <form action={clearUserEndLocation} className="mt-3">
            <input type="hidden" name="userId" value={target.id} />
            <button type="submit" className="app-btn-secondary-sm">
              Remove end point
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-4">
        <LocationPicker
          action={setUserEndLocation}
          hiddenFields={{ userId: target.id }}
          initialLatitude={center.latitude}
          initialLongitude={center.longitude}
          initialZoom={zoom}
          hasConfidentStart={hasPin || hasStart}
          instruction={`Search the address to jump the map there, then click where ${who} finishes up each day.`}
          saveLabel={hasPin ? "Update end point" : "Save end point"}
          noteField={{
            name: "endAddress",
            label: "Label (optional)",
            placeholder: "Shop",
            defaultValue: target.endAddress ?? "",
          }}
        />
      </section>
    </main>
  );
}
