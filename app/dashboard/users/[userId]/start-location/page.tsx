import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { LocationPicker } from "@/app/components/location-picker";
import { clearUserStartLocation, setUserStartLocation } from "@/app/dashboard/users/actions";

type PageProps = {
  params: Promise<{ userId: string }>;
};

/// Only when the org has no geocoded properties to average -- the valley this org services.
const FALLBACK_CENTER = { latitude: 36.1699, longitude: -115.1398 };

export default async function SetUserStartLocationPage({ params }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { userId } = await params;

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: appUser.organizationId },
    select: { id: true, name: true, email: true, startLatitude: true, startLongitude: true, startAddress: true },
  });
  if (!target) notFound();

  const who = target.name ?? target.email;
  const hasPin = target.startLatitude != null && target.startLongitude != null;

  let center = FALLBACK_CENTER;
  let zoom = 11;
  if (hasPin) {
    center = { latitude: Number(target.startLatitude), longitude: Number(target.startLongitude) };
    zoom = 19;
  } else {
    // Roughly where this org works, so an admin isn't starting from a national view.
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
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/users?tab=staff" className="underline">
          Users
        </Link>
      </div>

      <header className="mt-2 border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">{who}</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Where {who}&rsquo;s day starts</h1>
        <p className="mt-2 text-sm text-brand-ink">
          Their routes get optimized as a round trip from and back to this point, so the last stop is the one nearest
          here. Leave it unset and their route simply starts at whichever stop is first.
        </p>
        <p className="mt-2 text-sm text-brand-muted">
          They can also set this themselves under More → Where your day starts.
        </p>
      </header>

      {hasPin ? (
        <section className="mt-4 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-brand-ink">{target.startAddress || "Start point set"}</p>
          <p className="mt-1 text-xs text-brand-muted">
            <span className="app-metric">
              {Number(target.startLatitude).toFixed(6)}, {Number(target.startLongitude).toFixed(6)}
            </span>
          </p>
          <form action={clearUserStartLocation} className="mt-3">
            <input type="hidden" name="userId" value={target.id} />
            <button type="submit" className="app-btn-secondary-sm">
              Remove start point
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-4">
        <LocationPicker
          action={setUserStartLocation}
          hiddenFields={{ userId: target.id }}
          initialLatitude={center.latitude}
          initialLongitude={center.longitude}
          initialZoom={zoom}
          hasConfidentStart={hasPin}
          instruction={`Search their address to jump the map there, then click where ${who} sets off from each morning.`}
          saveLabel={hasPin ? "Update start point" : "Save start point"}
          noteField={{
            name: "startAddress",
            label: "Label (optional)",
            placeholder: "Home",
            defaultValue: target.startAddress ?? "",
          }}
        />
      </section>
    </main>
  );
}
