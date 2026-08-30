import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { createStandaloneProperty } from "@/app/cpo/actions";

export default async function CpoPropertiesPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const properties = await prisma.property.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { name: "asc" },
    include: { bodiesOfWater: { select: { id: true }, orderBy: { name: "asc" } } },
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">AquaRunner Compliance</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Compliance Logs</h1>
        <p className="mt-1 text-sm text-brand-muted">Every property and body of water you manage compliance for.</p>
      </header>

      <section className="mt-6 space-y-3">
        {properties.length === 0 ? (
          <p className="app-card-inset text-sm text-brand-muted">No properties yet — add your first one below.</p>
        ) : (
          properties.map((property) => (
            <Link key={property.id} href={`/cpo/properties/${property.id}`} className="app-card-hover block">
              <p className="font-medium text-brand-ink">{property.name}</p>
              <p className="mt-0.5 text-sm text-brand-muted">
                {property.bodiesOfWater.length} {property.bodiesOfWater.length === 1 ? "body of water" : "bodies of water"}
              </p>
            </Link>
          ))
        )}
      </section>

      <section className="app-card mt-6">
        <h2 className="font-display text-base font-semibold text-brand-ink">Add a property</h2>
        <form action={createStandaloneProperty} className="mt-3 grid gap-3">
          <label className="text-sm text-brand-ink">
            Property name
            <input name="name" required className="app-field mt-1" placeholder="e.g. Desert Sky Apartments" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-brand-ink">
              On-site manager name
              <input name="managerName" className="app-field mt-1" />
            </label>
            <label className="text-sm text-brand-ink">
              Manager phone
              <input name="managerBusinessPhone" type="tel" className="app-field mt-1" />
            </label>
          </div>
          <label className="text-sm text-brand-ink">
            Manager email
            <input name="managerEmail" type="email" className="app-field mt-1" />
          </label>
          <label className="text-sm text-brand-ink">
            Street address
            <input name="addressLine1" className="app-field mt-1" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-brand-ink">
              City
              <input name="city" className="app-field mt-1" />
            </label>
            <label className="text-sm text-brand-ink">
              State
              <input name="region" className="app-field mt-1" placeholder="NV" />
            </label>
            <label className="text-sm text-brand-ink">
              ZIP
              <input name="postalCode" className="app-field mt-1" />
            </label>
          </div>
          <button type="submit" className="app-btn-primary-sm justify-self-start">
            Add property
          </button>
        </form>
      </section>
    </main>
  );
}
