import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

/** Enum values are shouted and underscored; this is what a person calls them. */
const TYPE_LABELS: Record<string, string> = {
  POOL: "Pool",
  SPA: "Spa",
  WADING_POOL: "Wading pool",
  FOUNTAIN: "Fountain",
  WATER_FEATURE: "Water feature",
  OTHER: "Other",
};

type PageProps = {
  searchParams?: Promise<{ type?: string }>;
};

/**
 * The list behind the dashboard's "Aquatic venues" card.
 *
 * A body of water was only ever reachable by first picking a customer, then a property --
 * there was no page that answered "what do we actually service", which is the question the
 * number on the dashboard invites.
 *
 * `?type=` is honoured because the dashboard card is filtered by it. Arriving from a
 * dashboard filtered to Commercial and landing on an unfiltered list would contradict the
 * number that was just clicked, which is the one thing a drill-down must not do.
 *
 * Grouped by property rather than listed flat: a venue's name is frequently just "Pool", and
 * forty rows reading "Pool" tells nobody anything.
 */
export default async function VenuesPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const selectedType = sp.type === "RESIDENTIAL" || sp.type === "COMMERCIAL" ? sp.type : null;

  // Same filter as the dashboard count: bodies whose property belongs to this organization,
  // narrowed by property type only when one is selected.
  const properties = await prisma.property.findMany({
    where: {
      organizationId: appUser.organizationId,
      ...(selectedType ? { propertyType: selectedType } : {}),
      bodiesOfWater: { some: {} },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      region: true,
      propertyType: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
      bodiesOfWater: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, serviceGroup: true },
      },
    },
  });

  properties.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const venueCount = properties.reduce((total, p) => total + p.bodiesOfWater.length, 0);

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Dashboard</p>
        <h1 className="app-h1">Aquatic venues</h1>
        <p className="app-subhead">
          {venueCount === 0
            ? "None on file yet"
            : `${venueCount} ${venueCount === 1 ? "venue" : "venues"} across ${properties.length} ${
                properties.length === 1 ? "property" : "properties"
              }`}
          {selectedType ? ` · ${selectedType === "RESIDENTIAL" ? "Residential" : "Commercial"} only` : ""}
        </p>
      </header>

      {selectedType ? (
        <p className="mt-4 text-sm text-brand-muted">
          Filtered from the dashboard.{" "}
          <Link href="/dashboard/venues" className="app-link">
            Show all venues
          </Link>
        </p>
      ) : null}

      <section className="mt-6 space-y-4">
        {properties.length === 0 ? (
          <div className="app-card">
            <p className="text-sm text-brand-ink">No aquatic venues yet.</p>
            <p className="mt-1 text-sm text-brand-muted">
              A venue is added to a property under{" "}
              <Link href="/dashboard/customers" className="app-link">
                Customers
              </Link>
              .
            </p>
          </div>
        ) : (
          properties.map((property) => {
            const place = [property.city, property.region].filter(Boolean).join(", ");
            return (
              <div key={property.id} className="app-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-brand-ink">{property.name}</h2>
                    <p className="text-xs text-brand-muted">
                      {property.customer ? (
                        <Link href={`/dashboard/customers/${property.customer.id}`} className="app-link">
                          {property.customer.name}
                        </Link>
                      ) : (
                        "No customer"
                      )}
                      {place ? ` · ${place}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-brand-muted">
                    {property.bodiesOfWater.length} {property.bodiesOfWater.length === 1 ? "venue" : "venues"}
                  </p>
                </div>

                <ul className="mt-3 space-y-1">
                  {property.bodiesOfWater.map((body) => (
                    <li key={body.id} className="text-sm">
                      {/* The venue page lives under the customer, so a standalone property with
                          no customer is named rather than linked into a route that would 404. */}
                      {property.customerId ? (
                        <Link
                          href={`/dashboard/customers/${property.customerId}/bodies/${body.id}`}
                          className="app-link"
                        >
                          {body.name}
                        </Link>
                      ) : (
                        <span className="text-brand-ink">{body.name}</span>
                      )}
                      <span className="text-brand-muted"> — {TYPE_LABELS[body.type] ?? body.type}</span>
                      {body.serviceGroup ? (
                        <span className="text-brand-muted"> · serviced with “{body.serviceGroup}”</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
