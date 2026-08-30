import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { getOrganizationRuleset, isComplianceActive } from "@/lib/compliance";

export default async function CpoHomePage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const [properties, ruleset] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId: appUser.organizationId },
      orderBy: { name: "asc" },
      include: { bodiesOfWater: { select: { id: true, name: true, publicSlug: true }, orderBy: { name: "asc" } } },
    }),
    getOrganizationRuleset(appUser.organizationId),
  ]);

  const active = isComplianceActive(ruleset);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">AquaRunner Compliance</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Dashboard</h1>
      </header>

      <section className="app-card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-brand-ink">
            {ruleset ? `${ruleset.stateName}${ruleset.healthDepartmentName ? ` — ${ruleset.healthDepartmentName}` : ""}` : "State not set"}
          </p>
          {active ? <span className="app-pill-good">Compliance active</span> : <span className="app-pill-inactive">Not active yet</span>}
        </div>
        <p className="mt-2 text-sm text-brand-muted">
          <Link href="/cpo/compliance" className="app-link">
            View the full compliance reference
          </Link>{" "}
          for what your state requires at every reading.
        </p>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-brand-ink">Your properties</h2>
          <Link href="/cpo/properties" className="app-btn-secondary-sm">
            Manage properties
          </Link>
        </div>

        {properties.length === 0 ? (
          <p className="app-card-inset mt-3 text-sm text-brand-muted">
            No properties yet.{" "}
            <Link href="/cpo/properties" className="app-link">
              Add your first property
            </Link>{" "}
            to get a QR code and start logging readings.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {properties.map((property) => (
              <div key={property.id} className="app-card">
                <Link href={`/cpo/properties/${property.id}`} className="font-medium text-brand-ink hover:underline">
                  {property.name}
                </Link>
                {property.bodiesOfWater.length === 0 ? (
                  <p className="mt-1 text-sm text-brand-muted">No bodies of water added yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {property.bodiesOfWater.map((body) => (
                      <li key={body.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-brand-ink">{body.name}</span>
                        <span className="flex gap-3">
                          <Link href={`/cpo/properties/${property.id}`} className="app-link">
                            Log a reading
                          </Link>
                          <a href={`/p/${body.publicSlug}`} target="_blank" rel="noreferrer" className="app-link">
                            View public log
                          </a>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
