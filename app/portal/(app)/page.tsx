import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VISIT_PHOTOS_BUCKET } from "@/lib/visit-photos";
import { PhotoThumbnail } from "@/app/components/photo-thumbnail";

type PageProps = {
  searchParams?: Promise<{ date?: string }>;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function toYmd(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function parseYmd(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function fmt(n: number | null, digits = 1): string {
  return n == null ? "—" : n.toFixed(digits);
}

export default async function PortalHomePage({ searchParams }: PageProps) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const sp = (await searchParams) ?? {};

  // QR/historical-log eligibility is org-wide (one org per customer): only commercial
  // properties AND an active compliance ruleset get a working /p/[publicSlug] page --
  // see that page's own doc comment. Checked once here rather than per-venue below.
  const customer = await prisma.customer.findUnique({
    where: { id: customerUser.customerId },
    select: { organizationId: true },
  });
  const organization = customer
    ? await prisma.organization.findUnique({
        where: { id: customer.organizationId },
        select: { complianceRuleset: { select: { isSupported: true } } },
      })
    : null;
  const complianceActive = organization?.complianceRuleset?.isSupported === true;

  const visitWhere = { property: { customerId: customerUser.customerId }, status: "COMPLETED" as const, serviceComplete: true };

  // Resolve which day to show: an explicit ?date=, or the most recent day this customer
  // actually had a completed visit (never a literal "today" default -- most days have no
  // service, so that would usually land on an empty page).
  const requestedDate = sp.date ? parseYmd(sp.date) : null;
  let targetDate = requestedDate;
  if (!targetDate) {
    const latest = await prisma.serviceVisit.findFirst({
      where: visitWhere,
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });
    targetDate = latest?.completedAt ?? new Date();
  }

  const [dayVisits, prevVisit, nextVisit, upcomingVisits] = await Promise.all([
    prisma.serviceVisit.findMany({
      where: { ...visitWhere, completedAt: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) } },
      orderBy: { completedAt: "asc" },
      select: {
        id: true,
        completedAt: true,
        techNotes: true,
        property: { select: { name: true, propertyType: true } },
        bodyOfWater: { select: { name: true, disinfectionMethod: true, publicSlug: true } },
        technician: { select: { name: true } },
        reading: {
          select: {
            ph: true,
            freeChlorinePpm: true,
            brominePpm: true,
            alkalinityPpm: true,
            cyanuricAcidPpm: true,
            temperatureF: true,
            backwashAt: true,
          },
        },
        doses: { select: { productName: true, quantity: true, unit: true } },
        photos: { select: { id: true, storagePath: true } },
        checklistCompletions: { where: { completed: true }, select: { label: true } },
      },
    }),
    prisma.serviceVisit.findFirst({
      where: { ...visitWhere, completedAt: { lt: startOfDay(targetDate) } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.serviceVisit.findFirst({
      where: { ...visitWhere, completedAt: { gt: endOfDay(targetDate) } },
      orderBy: { completedAt: "asc" },
      select: { completedAt: true },
    }),
    prisma.serviceVisit.findMany({
      where: {
        property: { customerId: customerUser.customerId },
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
      orderBy: { scheduledStart: "asc" },
      take: 50,
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        property: { select: { name: true } },
        bodyOfWater: { select: { name: true } },
      },
    }),
  ]);

  const supabaseAdmin = createSupabaseAdminClient();
  const visitsWithPhotoUrls = await Promise.all(
    dayVisits.map(async (v) => {
      const photos = await Promise.all(
        v.photos.map(async (p) => {
          const { data } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).createSignedUrl(p.storagePath, 3600);
          return { id: p.id, url: data?.signedUrl ?? null };
        }),
      );
      return { ...v, photos };
    }),
  );

  const dayLabel = targetDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const upcomingByProperty = new Map<string, { propertyName: string; visits: typeof upcomingVisits }>();
  for (const v of upcomingVisits) {
    const key = v.property.name;
    const entry = upcomingByProperty.get(key) ?? { propertyName: key, visits: [] };
    entry.visits.push(v);
    upcomingByProperty.set(key, entry);
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-sm font-medium text-brand-ink">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-brand-muted">{customerUser.name ?? customerUser.email}</p>
      </header>

      <div data-tour="portal-day-nav" className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          {prevVisit ? (
            <Link href={`/portal?date=${toYmd(prevVisit.completedAt!)}`} className="app-btn-secondary-sm">
              ← Previous day
            </Link>
          ) : (
            <span className="app-btn-secondary-sm cursor-not-allowed opacity-40">← Previous day</span>
          )}
        </div>
        <p className="text-sm font-semibold text-brand-ink">{dayLabel}</p>
        <div>
          {nextVisit ? (
            <Link href={`/portal?date=${toYmd(nextVisit.completedAt!)}`} className="app-btn-secondary-sm">
              Next day →
            </Link>
          ) : (
            <span className="app-btn-secondary-sm cursor-not-allowed opacity-40">Next day →</span>
          )}
        </div>
      </div>

      <section className="mt-6 space-y-3">
        {visitsWithPhotoUrls.length === 0 ? (
          <p className="app-card text-sm text-brand-muted">No completed service visits on this day.</p>
        ) : (
          visitsWithPhotoUrls.map((v, index) => {
            const qrEligible = complianceActive && v.property.propertyType !== "RESIDENTIAL";
            return (
              <div
                key={v.id}
                data-tour={index === 0 ? "portal-visit-card" : undefined}
                className="rounded-lg border border-brand-border bg-white p-4 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-brand-ink">
                    {v.property.name} — {v.bodyOfWater.name}
                  </p>
                  <p className="text-xs text-brand-muted">
                    {v.completedAt ? v.completedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—"}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-brand-muted">Technician: {v.technician?.name ?? "—"}</p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-brand-ink">
                  <span>pH: {fmt(v.reading?.ph != null ? Number(v.reading.ph) : null)}</span>
                  <span>
                    {v.bodyOfWater.disinfectionMethod === "BROMINE" ? "Bromine" : "Free chlorine"}:{" "}
                    {fmt(
                      (v.bodyOfWater.disinfectionMethod === "BROMINE" ? v.reading?.brominePpm : v.reading?.freeChlorinePpm) != null
                        ? Number(v.bodyOfWater.disinfectionMethod === "BROMINE" ? v.reading?.brominePpm : v.reading?.freeChlorinePpm)
                        : null,
                    )}{" "}
                    ppm
                  </span>
                  <span>Alkalinity: {fmt(v.reading?.alkalinityPpm != null ? Number(v.reading.alkalinityPpm) : null, 0)} ppm</span>
                  <span>Cyanuric acid: {fmt(v.reading?.cyanuricAcidPpm != null ? Number(v.reading.cyanuricAcidPpm) : null, 0)} ppm</span>
                  <span>Water temp: {fmt(v.reading?.temperatureF != null ? Number(v.reading.temperatureF) : null, 0)}°F</span>
                  <span>
                    Backwashed:{" "}
                    {v.reading?.backwashAt
                      ? `Yes (${new Date(v.reading.backwashAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})`
                      : "No"}
                  </span>
                </div>

                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Chemicals dosed</p>
                  {v.doses.length ? (
                    <ul className="mt-0.5 text-brand-ink">
                      {v.doses.map((d, i) => (
                        <li key={i}>
                          {d.productName}: {d.quantity.toString()} {d.unit}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-brand-muted">None logged</p>
                  )}
                </div>

                {v.checklistCompletions.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Checklist completed</p>
                    <p className="text-brand-ink">{v.checklistCompletions.map((c) => c.label).join(", ")}</p>
                  </div>
                ) : null}

                {v.techNotes ? (
                  <div className="mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Notes</p>
                    <p className="whitespace-pre-wrap text-brand-ink">{v.techNotes}</p>
                  </div>
                ) : null}

                {v.photos.length ? (
                  <div className="mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Photos</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {v.photos.map((p) =>
                        p.url ? (
                          <PhotoThumbnail
                            key={p.id}
                            src={p.url}
                            alt="Service visit photo"
                            className="h-24 w-24 rounded border border-brand-border object-cover"
                          />
                        ) : null,
                      )}
                    </div>
                  </div>
                ) : null}

                {qrEligible ? (
                  <div data-tour="portal-qr-link" className="mt-3 border-t border-brand-border pt-3">
                    <a href={`/p/${v.bodyOfWater.publicSlug}`} target="_blank" rel="noreferrer" className="app-link text-sm font-medium">
                      View full history &amp; download readings for {v.bodyOfWater.name} →
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      <section data-tour="portal-upcoming" className="mt-10 border-t border-brand-border pt-6">
        <h2 className="text-lg font-semibold text-brand-ink">Upcoming service days</h2>
        <div className="mt-3 space-y-4">
          {upcomingByProperty.size === 0 ? (
            <p className="text-sm text-brand-muted">No upcoming visits scheduled right now.</p>
          ) : (
            Array.from(upcomingByProperty.values()).map((group) => (
              <div key={group.propertyName} className="rounded-lg border border-brand-border bg-white p-4 shadow-sm">
                <h3 className="text-base font-semibold text-brand-ink">{group.propertyName}</h3>
                <ul className="mt-2 space-y-2 text-sm text-brand-ink">
                  {group.visits.map((v) => (
                    <li key={v.id} className="rounded border border-brand-border bg-brand-surface px-3 py-2">
                      <p className="font-medium text-brand-ink">{v.bodyOfWater.name}</p>
                      <p className="text-brand-muted">
                        {v.scheduledStart.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                        {" · "}
                        {v.scheduledStart.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </p>
                      <p className="text-xs text-brand-muted">{v.status === "IN_PROGRESS" ? "In progress" : "Scheduled"}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
