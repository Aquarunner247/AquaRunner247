import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalPage } from "@/lib/auth/portal-page-guard";
import { canLogReadings, PORTAL_LOG_PATH, portalHomePath } from "@/lib/portal-access";
import { getOrganizationRuleset, activeReadingFields, type ReadingFieldKey } from "@/lib/compliance";
import { READING_BOUNDS } from "@/lib/reading-bounds";
import { timeZoneForState, localDayBounds, ymdInTimeZone, formatLocalTime, formatLocalDate } from "@/lib/timezone";
import { logPortalReading } from "./actions";

/** Gauges and meters, shown only when this org's state ruleset actually asks for them. */
const EQUIPMENT_FIELD_KEYS: ReadingFieldKey[] = ["pumpPressurePsi", "vacGaugeReading", "filterPressurePsi", "flowMeterGpm"];

type PageProps = { searchParams?: Promise<{ saved?: string; error?: string }> };

function stepFor(key: string): number {
  return READING_BOUNDS[key]?.step ?? 0.1;
}

/**
 * The daily chemistry log, for the property's own maintenance person.
 *
 * Fields are left empty rather than pre-filled with yesterday's numbers. The CPO form pre-fills, and its
 * own comment records the problem that causes: submitting a value that happens to match looks identical
 * to submitting nothing. On a log somebody fills in every day, a pre-filled field is a stale reading
 * waiting to be saved by accident, so the last reading is shown as text beside the form instead.
 */
export default async function PortalLogPage({ searchParams }: PageProps) {
  const customerUser = await requirePortalPage(PORTAL_LOG_PATH);
  // A customer's own login has no business here -- it cannot log readings, so the page would be a form
  // that refuses to save. canOpenPortalPath deliberately does not restrict a CUSTOMER, so this is where
  // that case is handled.
  if (!canLogReadings(customerUser.role)) redirect(portalHomePath(customerUser.role));

  const sp = (await searchParams) ?? {};

  const properties = await prisma.property.findMany({
    where: { customerId: customerUser.customerId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { state: true } },
      bodiesOfWater: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          disinfectionMethod: true,
        },
      },
    },
  });

  // One zone for the page's own "today", taken from the first property. Every property here belongs to
  // the same customer of the same organization, so they share a state in practice. The ACTION resolves
  // the day per body of water rather than relying on this, which is what actually decides the date a
  // reading is filed under.
  const timeZone = timeZoneForState(properties[0]?.organization.state);
  const now = new Date();
  const { start: dayStart, end: dayEnd } = localDayBounds(ymdInTimeZone(now, timeZone), timeZone);
  const bodyIds = properties.flatMap((p) => p.bodiesOfWater.map((b) => b.id));

  // Today's entries for these bodies, whoever made them -- the technician's reading counts as the day
  // being covered just as much as this person's own. Seeing that is the point: it turns the page into
  // filling gaps rather than guessing.
  const todaysVisits = bodyIds.length
    ? await prisma.serviceVisit.findMany({
        where: {
          bodyOfWaterId: { in: bodyIds },
          status: "COMPLETED",
          serviceComplete: true,
          completedAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { completedAt: "asc" },
        select: {
          bodyOfWaterId: true,
          completedAt: true,
          loggedByCustomerUserId: true,
          technicianId: true,
          loggedByCustomerUser: { select: { name: true, email: true } },
          reading: { select: { freeChlorinePpm: true, ph: true } },
        },
      })
    : [];

  // Last entry per body, at any time, for the "last reading" line.
  const lastVisits = bodyIds.length
    ? await prisma.serviceVisit.findMany({
        where: {
          bodyOfWaterId: { in: bodyIds },
          status: "COMPLETED",
          serviceComplete: true,
          completedAt: { not: null },
        },
        orderBy: { completedAt: "desc" },
        take: 200,
        select: {
          bodyOfWaterId: true,
          completedAt: true,
          reading: { select: { freeChlorinePpm: true, ph: true, alkalinityPpm: true } },
        },
      })
    : [];

  const todayByBody = new Map<string, (typeof todaysVisits)[number]>();
  for (const v of todaysVisits) todayByBody.set(v.bodyOfWaterId, v); // ascending, so the latest wins
  const lastByBody = new Map<string, (typeof lastVisits)[number]>();
  for (const v of lastVisits) if (!lastByBody.has(v.bodyOfWaterId)) lastByBody.set(v.bodyOfWaterId, v);

  const ruleset = properties[0] ? await getOrganizationRuleset(properties[0].organizationId) : null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-primary">
          {formatLocalDate(now, timeZone, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-brand-ink">Daily chemistry log</h1>
        <p className="mt-2 text-sm text-brand-muted">
          Enter what you measured. Each entry is saved under today&rsquo;s date and appears on the
          compliance log for this pool.
        </p>
      </header>

      {sp.error === "empty" ? (
        <p className="mt-4 text-sm text-brand-danger">Nothing was entered, so nothing was saved.</p>
      ) : null}

      <div className="mt-6 space-y-5" data-tour="portal-log-bodies">
        {properties.length === 0 ? (
          <p className="text-sm text-brand-muted">No pools or spas are set up on your account yet.</p>
        ) : null}

        {properties.map((property) => (
          <section key={property.id}>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-brand-muted">
              {property.name}
            </h2>

            <div className="mt-2 space-y-4">
              {property.bodiesOfWater.map((body) => {
                const today = todayByBody.get(body.id);
                const last = lastByBody.get(body.id);
                const loggedByName = today
                  ? today.loggedByCustomerUserId
                    ? (today.loggedByCustomerUser?.name ?? today.loggedByCustomerUser?.email ?? "you")
                    : today.technicianId
                      ? "your pool service company"
                      : "a logged reading"
                  : null;
                const equipmentFields = activeReadingFields(ruleset, body.type, body.disinfectionMethod, true).filter((f) =>
                  EQUIPMENT_FIELD_KEYS.includes(f.key),
                );

                return (
                  <article key={body.id} className="app-card">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-display text-base font-semibold text-brand-ink">{body.name}</h3>
                      {sp.saved === body.id ? <span className="app-badge-success">Saved</span> : null}
                    </div>

                    {today?.completedAt ? (
                      <p className="mt-1 text-sm text-brand-ink">
                        Already logged today at {formatLocalTime(today.completedAt, timeZone)} by {loggedByName}.
                        You can still add your own reading below.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-brand-muted">Nothing logged today yet.</p>
                    )}

                    {last?.completedAt ? (
                      <p className="app-metric mt-1 text-xs text-brand-muted">
                        Last reading {formatLocalDate(last.completedAt, timeZone, { month: "short", day: "numeric" })}:
                        {last.reading?.freeChlorinePpm != null ? ` FC ${last.reading.freeChlorinePpm}` : ""}
                        {last.reading?.ph != null ? ` · pH ${last.reading.ph}` : ""}
                        {last.reading?.alkalinityPpm != null ? ` · TA ${last.reading.alkalinityPpm}` : ""}
                      </p>
                    ) : null}

                    <form action={logPortalReading} className="mt-4 grid gap-3 sm:grid-cols-3">
                      <input type="hidden" name="bodyId" value={body.id} />
                      <label className="text-sm text-brand-ink">
                        Free chlorine (ppm)
                        <input name="freeChlorinePpm" type="number" inputMode="decimal" step={stepFor("freeChlorinePpm")} className="app-field mt-1" />
                      </label>
                      <label className="text-sm text-brand-ink">
                        pH
                        <input name="ph" type="number" inputMode="decimal" step={stepFor("ph")} className="app-field mt-1" />
                      </label>
                      <label className="text-sm text-brand-ink">
                        Alkalinity (ppm)
                        <input name="alkalinityPpm" type="number" inputMode="decimal" step={stepFor("alkalinityPpm")} className="app-field mt-1" />
                      </label>
                      <label className="text-sm text-brand-ink">
                        Bromine (ppm)
                        <input name="brominePpm" type="number" inputMode="decimal" step={stepFor("brominePpm")} className="app-field mt-1" />
                      </label>
                      <label className="text-sm text-brand-ink">
                        Cyanuric acid (ppm)
                        <input name="cyanuricAcidPpm" type="number" inputMode="decimal" step={stepFor("cyanuricAcidPpm")} className="app-field mt-1" />
                      </label>
                      <label className="text-sm text-brand-ink">
                        Water temp (&deg;F)
                        <input name="temperatureF" type="number" inputMode="decimal" step={stepFor("temperatureF")} className="app-field mt-1" />
                      </label>
                      {equipmentFields.map((f) => (
                        <label key={f.key} className="text-sm text-brand-ink">
                          {f.label}
                          {f.unitLabel ? ` (${f.unitLabel})` : ""}
                          <input name={f.key} type="number" inputMode="decimal" step={stepFor(f.key)} className="app-field mt-1" />
                        </label>
                      ))}
                      <div className="sm:col-span-3">
                        <button type="submit" className="app-btn-primary min-h-[44px]" data-tour="portal-log-save">
                          Save reading
                        </button>
                      </div>
                    </form>
                  </article>
                );
              })}

              {property.bodiesOfWater.length === 0 ? (
                <p className="text-sm text-brand-muted">No pools or spas on this property yet.</p>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
