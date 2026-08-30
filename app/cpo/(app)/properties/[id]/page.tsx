import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { generateQrDataUrl, publicBodyOfWaterUrl } from "@/lib/qr";
import { BodyQrCode } from "@/app/components/body-qr-code";
import { createBodyOfWater, logReadingNow } from "@/app/cpo/actions";
import { getOrganizationRuleset, activeReadingFields, type ReadingFieldKey } from "@/lib/compliance";

const EQUIPMENT_FIELD_KEYS: ReadingFieldKey[] = ["pumpPressurePsi", "vacGaugeReading", "filterPressurePsi", "flowMeterGpm"];

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CpoPropertyPage({ params }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const { id } = await params;
  const property = await prisma.property.findFirst({
    where: { id, organizationId: appUser.organizationId },
    include: {
      bodiesOfWater: {
        orderBy: { name: "asc" },
        include: {
          visits: {
            where: { status: "COMPLETED" },
            orderBy: { completedAt: "desc" },
            take: 1,
            include: { reading: true },
          },
        },
      },
    },
  });
  if (!property) notFound();

  const ruleset = await getOrganizationRuleset(appUser.organizationId);

  const bodiesWithQr = await Promise.all(
    property.bodiesOfWater.map(async (body) => {
      const publicUrl = publicBodyOfWaterUrl(body.publicSlug);
      const dataUrl = await generateQrDataUrl(publicUrl);
      // cyaRequired is passed as true unconditionally -- it only affects the CYA
      // chemistry field's required-ness/label (not modeled on this simplified form at
      // all), never the equipment fields this is actually here for.
      const equipmentFields = activeReadingFields(ruleset, body.type, body.disinfectionMethod, true).filter((f) =>
        EQUIPMENT_FIELD_KEYS.includes(f.key),
      );
      return { ...body, publicUrl, dataUrl, equipmentFields };
    }),
  );

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-brand-muted">
        <Link href="/cpo/properties" className="underline">
          Compliance Logs
        </Link>
      </div>

      <header className="mt-2 border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Property</p>
        <h1 className="text-2xl font-semibold text-brand-ink">{property.name}</h1>
        {property.managerName ? <p className="mt-1 text-sm text-brand-muted">{property.managerName}</p> : null}
      </header>

      <section className="mt-6 space-y-4">
        {bodiesWithQr.map((body) => {
          const lastVisit = body.visits[0] ?? null;
          const { publicUrl, dataUrl } = body;

          return (
            <article key={body.id} className="app-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-brand-ink">{body.name}</h2>
                {lastVisit?.completedAt ? (
                  <span className="text-xs text-brand-muted">
                    Last reading logged {lastVisit.completedAt.toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs text-brand-muted">No readings logged yet</span>
                )}
              </div>

              <BodyQrCode bodyName={body.name} dataUrl={dataUrl} publicUrl={publicUrl} />

              <form action={logReadingNow} className="mt-4 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="bodyId" value={body.id} />
                <label className="text-sm text-brand-ink">
                  Free chlorine (ppm)
                  <input name="freeChlorinePpm" type="number" step="0.1" className="app-field mt-1" defaultValue={lastVisit?.reading?.freeChlorinePpm?.toString() ?? ""} />
                </label>
                <label className="text-sm text-brand-ink">
                  pH
                  <input name="ph" type="number" step="0.1" className="app-field mt-1" defaultValue={lastVisit?.reading?.ph?.toString() ?? ""} />
                </label>
                <label className="text-sm text-brand-ink">
                  Alkalinity (ppm)
                  <input name="alkalinityPpm" type="number" step="1" className="app-field mt-1" defaultValue={lastVisit?.reading?.alkalinityPpm?.toString() ?? ""} />
                </label>
                <label className="text-sm text-brand-ink">
                  Bromine (ppm)
                  <input name="brominePpm" type="number" step="0.1" className="app-field mt-1" defaultValue={lastVisit?.reading?.brominePpm?.toString() ?? ""} />
                </label>
                <label className="text-sm text-brand-ink">
                  Cyanuric acid (ppm)
                  <input name="cyanuricAcidPpm" type="number" step="1" className="app-field mt-1" defaultValue={lastVisit?.reading?.cyanuricAcidPpm?.toString() ?? ""} />
                </label>
                <label className="text-sm text-brand-ink">
                  Water temp (°F)
                  <input name="temperatureF" type="number" step="1" className="app-field mt-1" defaultValue={lastVisit?.reading?.temperatureF?.toString() ?? ""} />
                </label>
                {body.equipmentFields.map((f) => (
                  <label key={f.key} className="text-sm text-brand-ink">
                    {f.label} {f.unitLabel ? `(${f.unitLabel})` : ""}
                    <input
                      name={f.key}
                      type="number"
                      step="1"
                      className="app-field mt-1"
                      defaultValue={lastVisit?.reading?.[f.key]?.toString() ?? ""}
                    />
                  </label>
                ))}
                <button type="submit" className="app-btn-primary-sm justify-self-start sm:col-span-3">
                  Log today&rsquo;s reading
                </button>
              </form>
            </article>
          );
        })}
      </section>

      <section className="app-card mt-6">
        <h2 className="font-display text-base font-semibold text-brand-ink">Add a body of water</h2>
        <form action={createBodyOfWater} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="propertyId" value={property.id} />
          <label className="text-sm text-brand-ink">
            Name
            <input name="name" required className="app-field mt-1" placeholder="e.g. Main Pool" />
          </label>
          <label className="text-sm text-brand-ink">
            Type
            <select name="type" className="app-field mt-1" defaultValue="POOL">
              <option value="POOL">Pool</option>
              <option value="SPA">Spa</option>
              <option value="WADING_POOL">Wading pool</option>
              <option value="FOUNTAIN">Fountain</option>
              <option value="WATER_FEATURE">Water feature</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="text-sm text-brand-ink">
            Volume (gallons)
            <input name="volumeGallons" type="number" className="app-field mt-1" />
          </label>
          <label className="text-sm text-brand-ink">
            Maximum occupancy
            <input name="maximumOccupancy" type="number" className="app-field mt-1" />
          </label>
          <button type="submit" className="app-btn-primary-sm justify-self-start sm:col-span-2">
            Add body of water
          </button>
        </form>
      </section>
    </main>
  );
}
