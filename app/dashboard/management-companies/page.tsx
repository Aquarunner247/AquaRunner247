import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

/**
 * The list behind the dashboard's "Property mgmt. cos." card.
 *
 * Management companies had a count on the dashboard and an entry on every property, but
 * nowhere that answered "who are they, and which properties does each one hold" -- the only
 * way to see a company's properties was to open properties one at a time and read the field.
 *
 * The query is deliberately the same shape as the card's count: every company in the
 * organization, with NO property-type filter. The dashboard says why it does not filter this
 * one -- a management company has no propertyType of its own -- and a list that disagreed
 * with the number that led here would be worse than no link at all.
 */
export default async function ManagementCompaniesPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const companies = await prisma.managementCompany.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      properties: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, city: true, region: true, customerId: true },
      },
    },
  });

  // DB collation cannot be relied on for case-insensitive alphabetical order -- same reason
  // the customers list re-sorts in JS.
  companies.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const propertyCount = companies.reduce((total, c) => total + c.properties.length, 0);

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Dashboard</p>
        <h1 className="app-h1">Property management companies</h1>
        <p className="app-subhead">
          {companies.length === 0
            ? "None on file yet"
            : `${companies.length} ${companies.length === 1 ? "company" : "companies"} · ${propertyCount} ${
                propertyCount === 1 ? "property" : "properties"
              }`}
        </p>
      </header>

      <section className="mt-6 space-y-4">
        {companies.length === 0 ? (
          <div className="app-card">
            <p className="text-sm text-brand-ink">No management companies yet.</p>
            <p className="mt-1 text-sm text-brand-muted">
              One is created the first time you name it on a property, so add it while editing a property
              under{" "}
              <Link href="/dashboard/customers" className="app-link">
                Customers
              </Link>
              .
            </p>
          </div>
        ) : (
          companies.map((company) => (
            <div key={company.id} className="app-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-brand-ink">{company.name}</h2>
                <p className="text-xs text-brand-muted">
                  {company.properties.length} {company.properties.length === 1 ? "property" : "properties"}
                </p>
              </div>

              {company.phone || company.email ? (
                <p className="mt-1 text-sm text-brand-muted">
                  {company.phone ? <span className="app-metric">{company.phone}</span> : null}
                  {company.phone && company.email ? " · " : null}
                  {company.email ? (
                    <a href={`mailto:${company.email}`} className="app-link">
                      {company.email}
                    </a>
                  ) : null}
                </p>
              ) : null}

              {company.properties.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {company.properties.map((property) => {
                    const place = [property.city, property.region].filter(Boolean).join(", ");
                    return (
                      <li key={property.id} className="text-sm">
                        {/* A property reached through its customer, because that is the page that
                            actually exists. A standalone CPO property has no customer, so it is
                            named rather than linked into a route that would 404. */}
                        {property.customerId ? (
                          <Link href={`/dashboard/customers/${property.customerId}`} className="app-link">
                            {property.name}
                          </Link>
                        ) : (
                          <span className="text-brand-ink">{property.name}</span>
                        )}
                        {place ? <span className="text-brand-muted"> — {place}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-brand-muted">No properties assigned to this company yet.</p>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
