import Link from "next/link";
import { NextStopRibbon, type NextStopInfo } from "@/app/components/next-stop-ribbon";
import { pickNextStop } from "@/lib/next-stop";
import { coalesceCoord } from "@/lib/geocode";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getVisitFormData, serializeReading } from "@/lib/visit-form-data";
import { VisitForm } from "./visit-form";
import { ResidentialVisitForm } from "./residential-visit-form";
import { formatLocalDate, formatLocalDateTime, localDayBounds, timeZoneForState, ymdInTimeZone } from "@/lib/timezone";
import { propertyContactEmail } from "@/lib/property-contact";
import { resendServiceSummaryEmail } from "./actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string; resendError?: string; resentTo?: string }>;
};

export default async function VisitPage({ params, searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    redirect("/login");
  }

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  // Every link into this page from the Schedule tab (RouteDayView, both admin and
  // technician) appends ?from=schedule -- anything else (alerts, customer detail, etc.)
  // falls back to the Dashboard tab, which was this link's only destination before.
  const backHref = sp.from === "schedule" ? "/dashboard/schedule" : "/dashboard";
  const backLabel = sp.from === "schedule" ? "Back to schedule" : "Back to dashboard";
  /**
   * One call for the record, the authorization and every derived value this page and
   * GET /api/visits/[id] both need -- see lib/visit-form-data.ts. It used to all live here, which
   * meant the API either duplicated it or returned raw rows and made its caller duplicate it.
   *
   * Both of the old refusals (no visit / another org's visit, and a technician opening somebody
   * else's stop) are decided in there now and both still land on notFound, unchanged.
   */
  const visitData = await getVisitFormData({
    visitId: id,
    caller: { id: appUser.id, role: appUser.role, organizationId: appUser.organizationId },
  });
  if (!visitData.ok) notFound();

  const { visit, isResidential, timeZone: tz, form } = visitData.data;
  const isAdminOrOffice = appUser.role === "ADMIN" || appUser.role === "OFFICE";
  const {
    canCorrectCompleted,
    readingFields,
    cyaRequired,
    previousReading,
    chemicalProducts,
    checklistItems,
    initialDosing: dosing,
    initialPhotos: photosWithUrls,
    serviceMessages,
  } = form;

  /**
   * This body of water's neighbouring service days, so the office can walk a pool's history from
   * here -- the way the Schedule tab's day arrows step through a route -- instead of going back to
   * the schedule, picking a date, and finding the stop again.
   *
   * Scoped to the BODY, not the property, for the same reason the previous-reading lookup below is:
   * a property with a front pool and a back pool is two bodies of water, and stepping across them
   * would put a different pool's chemistry under the same heading.
   *
   * Ordered on scheduledStart, the one timestamp every visit has (an imported log-only record has
   * no completedAt and no capturedAt) and the day anchor the rest of the app sorts a service day
   * by. Strictly before/after, so a second visit sharing the exact same anchor is stepped over
   * rather than looped on.
   *
   * CANCELLED is excluded: a skipped stop carries no readings, no doses and no photos, so landing
   * on one is a dead end mid-walk. A future SCHEDULED visit is kept -- it is already reachable by
   * paging the schedule forward, and an empty form for next week is a truthful answer to "what is
   * next here".
   *
   * Technicians don't get these. They can only open their own visits (canAccess above), so the
   * chain would silently skip whatever a colleague serviced and read as history with holes in it.
   */
  const [previousVisit, nextVisit] = isAdminOrOffice
    ? await Promise.all([
        prisma.serviceVisit.findFirst({
          where: {
            organizationId: visit.organizationId,
            bodyOfWaterId: visit.bodyOfWaterId,
            status: { not: "CANCELLED" },
            scheduledStart: { lt: visit.scheduledStart },
          },
          orderBy: { scheduledStart: "desc" },
          select: { id: true, scheduledStart: true },
        }),
        prisma.serviceVisit.findFirst({
          where: {
            organizationId: visit.organizationId,
            bodyOfWaterId: visit.bodyOfWaterId,
            status: { not: "CANCELLED" },
            scheduledStart: { gt: visit.scheduledStart },
          },
          orderBy: { scheduledStart: "asc" },
          select: { id: true, scheduledStart: true },
        }),
      ])
    : [null, null];

  /**
   * Carries the back link's destination along, so paging through four visits still returns to
   * wherever the walk started instead of quietly falling back to the dashboard. Only the one value
   * this page recognizes is forwarded -- never sp.from verbatim, which is caller-supplied.
   */
  const stepQuery = sp.from === "schedule" ? "?from=schedule" : "";



  // Where to head next, shown as a ribbon once this visit is finished. Only for the technician
  // whose day it is: an admin reviewing a completed visit from the office isn't about to drive
  // anywhere, and a "Directions" button in that context is noise.
  const showsNextStop = visit.status === "COMPLETED" && visit.technicianId === appUser.id;
  // TechBottomNav renders for technicians only (app/dashboard/layout.tsx), so only they need the
  // ribbon lifted clear of it -- and only they need the extra bottom padding for two stacked bars.
  const hasBottomNav = appUser.role === "TECHNICIAN";
  let nextStop: NextStopInfo | null = null;
  if (showsNextStop) {
    const { start: dayStart, end: dayEnd } = localDayBounds(
      ymdInTimeZone(visit.scheduledStart, timeZoneForState(visit.organization.state)),
      timeZoneForState(visit.organization.state),
    );

    const [dayVisits, dayErrands] = await Promise.all([
      prisma.serviceVisit.findMany({
        where: {
          organizationId: visit.organizationId,
          technicianId: appUser.id,
          scheduledStart: { gte: dayStart, lt: dayEnd },
        },
        select: {
          id: true,
          status: true,
          routeSequence: true,
          createdAt: true,
          property: { select: { name: true, addressLine1: true, city: true, region: true, latitude: true, longitude: true } },
          bodyOfWater: { select: { name: true, latitude: true, longitude: true } },
        },
      }),
      prisma.adHocStop.findMany({
        where: {
          organizationId: visit.organizationId,
          technicianId: appUser.id,
          scheduledDate: { gte: dayStart, lt: dayEnd },
        },
        select: {
          id: true,
          description: true,
          completed: true,
          routeSequence: true,
          createdAt: true,
          property: { select: { name: true, addressLine1: true, city: true, region: true, latitude: true, longitude: true } },
        },
      }),
    ]);

    const chosen = pickNextStop(
      [
        ...dayVisits.map((v) => ({
          id: v.id,
          kind: "visit" as const,
          routeSequence: v.routeSequence,
          done: v.status === "COMPLETED" || v.status === "CANCELLED",
          createdAtMs: v.createdAt.getTime(),
          visit: v,
          errand: null,
        })),
        ...dayErrands.map((e) => ({
          id: e.id,
          kind: "adhoc" as const,
          routeSequence: e.routeSequence,
          done: e.completed,
          createdAtMs: e.createdAt.getTime(),
          visit: null,
          errand: e,
        })),
      ],
      visit.id,
    );

    if (chosen?.visit) {
      const v = chosen.visit;
      nextStop = {
        visitId: v.id,
        title: v.property.name,
        subtitle: v.bodyOfWater.name,
        address: [v.property.addressLine1, v.property.city, v.property.region].filter(Boolean).join(", ") || null,
        // Same "prefer the venue's own pin" rule the schedule and map use.
        latitude: coalesceCoord(v.bodyOfWater.latitude, v.property.latitude),
        longitude: coalesceCoord(v.bodyOfWater.longitude, v.property.longitude),
      };
    } else if (chosen?.errand) {
      const e = chosen.errand;
      nextStop = {
        visitId: null,
        title: e.description,
        subtitle: e.property?.name ?? null,
        address: e.property ? [e.property.addressLine1, e.property.city, e.property.region].filter(Boolean).join(", ") || null : null,
        latitude: coalesceCoord(null, e.property?.latitude),
        longitude: coalesceCoord(null, e.property?.longitude),
      };
    }
  }

  // Who the automatic send went to, shown so the office can see whether the person asking has
  // already had a copy. Same resolution the sender uses, rather than a second guess at it.
  const originalRecipient = propertyContactEmail(visit.property);

  return (
    <main
      className={`mx-auto min-h-screen max-w-4xl px-6 py-10 ${
        showsNextStop ? (hasBottomNav ? "pb-[calc(8rem+var(--tech-nav-h))]" : "pb-32") : ""
      }`}
    >
      <div className="mb-6">
        <Link href={backHref} className="text-sm text-brand-primary underline">
          {backLabel}
        </Link>
      </div>
      <header className="rounded-lg border border-brand-ink bg-brand-ink p-4 shadow-sm">
        <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-brand-accent">
          Technician visit
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold uppercase text-white">{visit.property.name}</h1>
        {/* scheduledStart's time-of-day isn't a real target time -- see
            lib/visit-generation.ts -- so only the date is shown here. */}
        <p className="mt-1 text-sm text-brand-border">
          {visit.bodyOfWater.name} • {formatLocalDate(visit.scheduledStart, tz, { weekday: "long", year: "numeric" })}
        </p>

        {/* Each arrow names the day it lands on rather than the day being viewed, which is already
            on the line above it. An exhausted direction keeps its side of the row and says so, so
            the remaining arrow can't be mistaken for the other one. */}
        {isAdminOrOffice ? (
          <nav
            className="mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-1"
            aria-label="Other service days for this body of water"
          >
            {previousVisit ? (
              <Link
                href={`/dashboard/visits/${previousVisit.id}${stepQuery}`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded px-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ‹
                </span>
                {formatLocalDate(previousVisit.scheduledStart, tz, { weekday: "short" })}
              </Link>
            ) : (
              <span className="inline-flex min-h-[44px] items-center px-2 text-sm text-brand-border/70">No earlier visit</span>
            )}
            {nextVisit ? (
              <Link
                href={`/dashboard/visits/${nextVisit.id}${stepQuery}`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded px-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                {formatLocalDate(nextVisit.scheduledStart, tz, { weekday: "short" })}
                <span aria-hidden="true" className="text-lg leading-none">
                  ›
                </span>
              </Link>
            ) : (
              <span className="inline-flex min-h-[44px] items-center px-2 text-sm text-brand-border/70">No later visit</span>
            )}
          </nav>
        ) : null}
      </header>

      {/* Getting in comes before anything else on a backyard pool: a locked gate stops the visit
          before chemistry is even a question. Residential only -- a commercial property has a
          manager and a pump room, not a side gate and a dog. */}
      {isResidential && (visit.property.accessNotes || visit.property.ownerMobilePhone) ? (
        <div className="mt-4 rounded-lg border-2 border-brand-cta bg-white p-4">
          <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-cta">Getting in</p>
          {visit.property.accessNotes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-brand-ink">{visit.property.accessNotes}</p>
          ) : null}
          {visit.property.ownerMobilePhone ? (
            <p className="mt-2 text-sm text-brand-ink">
              {visit.property.ownerName ? `${visit.property.ownerName}: ` : "Owner: "}
              {/* A tel: link, because the moment this is read is the moment somebody is locked out
                  and needs to call -- not retype a number from a screen. */}
              <a
                href={`tel:${visit.property.ownerMobilePhone.replace(/[^0-9+]/g, "")}`}
                className="inline-flex min-h-[44px] items-center font-semibold text-brand-primary underline"
              >
                {visit.property.ownerMobilePhone}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {isResidential ? (
        <ResidentialVisitForm
          visitId={visit.id}
          visitStatus={visit.status}
          canCorrectCompleted={canCorrectCompleted}
          checklistItems={checklistItems}
          hasVolume={visit.bodyOfWater.volumeGallons != null}
          requiresFC={visit.bodyOfWater.requiresFC}
          requiresPH={visit.bodyOfWater.requiresPH}
          requiresAlkalinity={visit.bodyOfWater.requiresAlkalinity}
          requiresCYA={visit.bodyOfWater.requiresCYA}
          cyaRequired={cyaRequired}
          chemicalProducts={chemicalProducts}
          initialIssues={visit.issues.map((i) => ({
            id: i.id,
            description: i.description,
            severity: i.severity,
            createdAt: i.createdAt.toISOString(),
          }))}
          initialReading={serializeReading(visit.reading)}
          previousReading={previousReading}
          initialPhotoCount={visit.photos.length}
          initialPhotos={photosWithUrls}
          initialDoses={visit.doses.map((d) => ({
            id: d.id,
            productName: d.productName,
            quantity: d.quantity.toString(),
            unit: d.unit,
          }))}
          initialStartedAt={visit.startedAt ? visit.startedAt.toISOString() : null}
          initialPushedAt={visit.pushedAt ? visit.pushedAt.toISOString() : null}
          initialDosing={dosing}
          serviceMessages={serviceMessages}
        />
      ) : (
        <VisitForm
          visitId={visit.id}
          visitStatus={visit.status}
          canCorrectCompleted={canCorrectCompleted}
          hasVolume={visit.bodyOfWater.volumeGallons != null}
          readingFields={readingFields}
          optionalReadingFields={[
            ...(visit.organization.trackCalciumHardness ? ["calciumHardnessPpm" as const] : []),
            ...(visit.organization.trackSaltPpm ? ["saltPpm" as const] : []),
          ]}
          previousReading={previousReading}
          chemicalProducts={chemicalProducts}
          checklistItems={checklistItems}
          initialIssues={visit.issues.map((i) => ({
            id: i.id,
            description: i.description,
            severity: i.severity,
            createdAt: i.createdAt.toISOString(),
          }))}
          initialReading={serializeReading(visit.reading)}
          initialPhotoCount={visit.photos.length}
          initialPhotos={photosWithUrls}
          initialDoses={visit.doses.map((d) => ({
            id: d.id,
            productName: d.productName,
            quantity: d.quantity.toString(),
            unit: d.unit,
          }))}
          initialStartedAt={visit.startedAt ? visit.startedAt.toISOString() : null}
          initialPushedAt={visit.pushedAt ? visit.pushedAt.toISOString() : null}
          initialDosing={dosing}
          serviceMessages={serviceMessages}
        />
      )}
      {isAdminOrOffice ? (
        <section className="app-card mt-6">
          <h2 className="font-[family-name:var(--font-display)] text-base font-semibold text-brand-ink">
            Send this report again
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            Emails this service day&rsquo;s summary — every pool and spa done on this walk-up, with its
            readings, chemicals and photos — to whoever you put below. It goes only to these addresses;
            nobody who received it the first time gets another copy.
          </p>

          <p className="mt-2 text-xs text-brand-muted">
            {visit.summaryEmailSentAt ? (
              <>
                First sent{" "}
                {formatLocalDateTime(visit.summaryEmailSentAt, timeZoneForState(visit.organization.state))}
                {originalRecipient ? <> to {originalRecipient}</> : null}.
              </>
            ) : (
              <>Never sent automatically{originalRecipient ? <> — the property contact is {originalRecipient}</> : null}.</>
            )}
          </p>

          {sp.resendError ? <p className="mt-3 text-sm text-brand-danger">{sp.resendError}</p> : null}
          {sp.resentTo ? <p className="mt-3 text-sm text-brand-ok">Sent to {sp.resentTo}.</p> : null}

          <form action={resendServiceSummaryEmail} className="mt-3 flex flex-wrap items-start gap-2">
            <input type="hidden" name="visitId" value={visit.id} />
            <input
              name="recipients"
              type="text"
              required
              placeholder="name@example.com, another@example.com"
              className="app-field-sm min-w-[18rem] flex-1"
            />
            <button type="submit" className="app-btn-primary-sm min-h-[44px]">
              Send
            </button>
          </form>
          <p className="mt-1 text-xs text-brand-muted">
            Separate several addresses with commas. Up to 10 at a time.
          </p>
        </section>
      ) : null}
      {showsNextStop ? <NextStopRibbon next={nextStop} hasBottomNav={hasBottomNav} /> : null}
    </main>
  );
}
