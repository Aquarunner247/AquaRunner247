import { prisma } from "@/lib/prisma";
import { ReadingChart } from "@/app/components/reading-chart";
import { BackwashCalendar } from "@/app/components/backwash-calendar";
import { getMonthlyReadingRows } from "@/lib/reading-rows";
import { DEFAULT_BUSINESS_NAME, DEFAULT_BUSINESS_PHONE } from "@/lib/service-company";
import { isComplianceActive, activeChemistryThresholds, chlorineFamilyThreshold, healthDepartmentLabel } from "@/lib/compliance";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { INSPECTION_REPORTS_BUCKET } from "@/lib/inspection-reports";
import { timeZoneForState, formatLocalDateTime } from "@/lib/timezone";

type PageProps = {
  params: Promise<{ publicSlug: string }>;
  searchParams?: Promise<{ month?: string; year?: string; section?: string }>;
};

function monthTitle(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SECTIONS = ["chemistry", "equipment", "backwash", "incidents", "inspections"] as const;
type Section = (typeof SECTIONS)[number];

function fmt(n: number | null, digits = 1) {
  return n == null ? "–" : n.toFixed(digits);
}

export default async function PublicBodyOfWaterLogPage({ params, searchParams }: PageProps) {
  const { publicSlug } = await params;
  const sp = (await searchParams) ?? {};

  const now = new Date();
  const year = Number.isFinite(Number(sp.year)) && sp.year ? Number(sp.year) : now.getFullYear();
  const monthIndex =
    Number.isFinite(Number(sp.month)) && sp.month && Number(sp.month) >= 1 && Number(sp.month) <= 12
      ? Number(sp.month) - 1
      : now.getMonth();
  const section: Section = SECTIONS.includes(sp.section as Section) ? (sp.section as Section) : "chemistry";

  const body = await prisma.bodyOfWater.findUnique({
    where: { publicSlug },
    select: {
      id: true,
      name: true,
      type: true,
      disinfectionMethod: true,
      volumeGallons: true,
      minimumRequiredFlowGpm: true,
      maximumFilterFlowGpm: true,
      property: {
        select: {
          name: true,
          propertyType: true,
          addressLine1: true,
          city: true,
          region: true,
          customer: { select: { name: true } },
          organization: {
            select: {
              businessName: true,
              businessPhone: true,
              state: true,
              complianceRuleset: {
                include: { chemistryThresholds: true, frequencyRules: true, eventProtocols: true },
              },
            },
          },
        },
      },
    },
  });

  // Residential venues have no public log — an unguessable slug is obscurity, not
  // authorization, so this must 404 identically to a genuinely-unknown slug rather than
  // leaking "this exists but is private." Same treatment for a commercial property whose
  // state's ComplianceRuleset isn't built out (or isn't linked) yet — per
  // multi-state-compliance-spec.md, an unsupported-state account gets "the same
  // experience as a residential-only account" for the QR inspector log specifically.
  const ruleset = body?.property.organization.complianceRuleset ?? null;
  if (!body || body.property.propertyType === "RESIDENTIAL" || !isComplianceActive(ruleset)) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Public maintenance log</p>
        <h1 className="mt-1 text-2xl font-semibold text-brand-ink">Aquatic venue log</h1>
        <section className="mt-8 rounded-lg border border-dashed border-brand-border bg-white p-8 text-center text-brand-muted">
          No aquatic venue found for this QR reference.
        </section>
      </main>
    );
  }

  const tz = timeZoneForState(body.property.organization.state);
  const { rows, totalDays, visitCount } = await getMonthlyReadingRows(body.id, year, monthIndex, tz);

  const [contaminationIncidents, inspectionReportRows] = await Promise.all([
    prisma.contaminationIncident.findMany({
      where: { bodyOfWaterId: body.id },
      orderBy: { discoveredAt: "desc" },
      include: { monitoringReadings: { orderBy: { sequence: "asc" } } },
    }),
    prisma.inspectionReport.findMany({ where: { bodyOfWaterId: body.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const inspectionReports = await (async () => {
    if (!inspectionReportRows.length) return [];
    const supabaseAdmin = createSupabaseAdminClient();
    return Promise.all(
      inspectionReportRows.map(async (report) => {
        const { data } = await supabaseAdmin.storage.from(INSPECTION_REPORTS_BUCKET).createSignedUrl(report.storagePath, 3600);
        return { ...report, url: data?.signedUrl ?? null };
      }),
    );
  })();

  const seriesFor = (pick: (row: (typeof rows)[number]) => number | null) =>
    rows.map((row) => ({ day: row.day, value: pick(row) }));

  const minFlow = body.minimumRequiredFlowGpm != null ? Number(body.minimumRequiredFlowGpm) : undefined;
  const maxFilterFlow = body.maximumFilterFlowGpm != null ? Number(body.maximumFilterFlowGpm) : undefined;
  const volumeGallons = body.volumeGallons != null ? Number(body.volumeGallons) : undefined;

  const tempTarget =
    body.type === "SPA"
      ? { min: 100, max: 104, domainMin: 90, domainMax: 110 }
      : { min: 78, max: 84, domainMin: 65, domainMax: 95 };

  // ruleset is guaranteed non-null and isSupported here -- the gate above already
  // returned early otherwise.
  const thresholds = activeChemistryThresholds(ruleset);
  // disinfectionMethod is per body of water -- this body's own configured method decides
  // whether the log shows Free Chlorine or Bromine, and against which state numbers.
  const chlorineFamily = chlorineFamilyThreshold(ruleset, body.type, body.disinfectionMethod);
  const chlorineFamilyLabel = chlorineFamily?.label ?? "Free Chlorine";
  const chlorineFamilyUnit = chlorineFamily?.unit ?? "ppm";

  const prevDate = new Date(year, monthIndex - 1, 1);
  const nextDate = new Date(year, monthIndex + 1, 1);
  const linkFor = (d: Date) => `?month=${d.getMonth() + 1}&year=${d.getFullYear()}&section=${section}`;
  const sectionLinkFor = (s: Section) => `?month=${monthIndex + 1}&year=${year}&section=${s}`;

  const sectionTabClass = (target: Section) => (target === section ? "app-tab-active" : "app-tab");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-6">
      <header className="border-b border-brand-border pb-6">
        <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wider text-brand-primary">
          Public maintenance log — inspector view
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-extrabold uppercase tracking-tight text-brand-ink">
          {body.property.customer?.name ?? body.property.name}
        </h1>
        <p className="mt-1 text-sm text-brand-muted">
          {body.property.name} · {body.name}
          {body.property.addressLine1 ? ` — ${body.property.addressLine1}` : ""}
          {body.property.city ? `, ${body.property.city}` : ""}
          {body.property.region ? `, ${body.property.region}` : ""}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-brand-border bg-white p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Facility</dt>
            <dd className="text-brand-ink">{body.property.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Operator / service company</dt>
            <dd className="text-brand-ink">{body.property.organization.businessName || DEFAULT_BUSINESS_NAME}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Service company phone</dt>
            <dd className="text-brand-ink">{body.property.organization.businessPhone || DEFAULT_BUSINESS_PHONE || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Water volume (gal)</dt>
            <dd className="font-[family-name:var(--font-mono)] text-brand-ink">
              {volumeGallons != null ? volumeGallons.toLocaleString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Min required flow (GPM)</dt>
            <dd className="font-[family-name:var(--font-mono)] text-brand-ink">{minFlow ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Max filter flow (GPM)</dt>
            <dd className="font-[family-name:var(--font-mono)] text-brand-ink">{maxFilterFlow ?? "—"}</dd>
          </div>
        </dl>
      </header>

      <form className="mt-5 flex flex-wrap items-center gap-3" method="GET">
        <input type="hidden" name="section" value={section} />
        <a
          href={linkFor(prevDate)}
          className="app-btn-secondary-sm"
        >
          ← Prev
        </a>
        <select name="month" defaultValue={monthIndex + 1} className="rounded-md border border-brand-control bg-white px-3 py-1.5 text-sm text-brand-ink">
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select name="year" defaultValue={year} className="rounded-md border border-brand-control bg-white px-3 py-1.5 text-sm text-brand-ink">
          {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="submit" className="app-btn-primary-sm">
          View
        </button>
        <a
          href={linkFor(nextDate)}
          className="app-btn-secondary-sm"
        >
          Next →
        </a>
        <a
          href={`/api/qr/${encodeURIComponent(publicSlug)}/export?month=${monthIndex + 1}&year=${year}`}
          className="rounded-md border border-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5"
        >
          Download CSV
        </a>
        <span className="font-[family-name:var(--font-mono)] ml-auto text-sm text-brand-muted">
          {monthTitle(year, monthIndex)} · {visitCount} completed visit{visitCount === 1 ? "" : "s"}
        </span>
      </form>

      {/* Data table — mirrors the SNHD paper log layout */}
      <section className="mt-6 overflow-x-auto rounded-lg border border-brand-border bg-white">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-foam text-left">
              <th className="px-2 py-2 font-medium text-brand-ink">Day</th>
              <th className="px-2 py-2 font-medium text-brand-ink">
                {chlorineFamily?.key === "brominePpm" ? "Br" : "Cl"} ({chlorineFamilyUnit})
              </th>
              <th className="px-2 py-2 font-medium text-brand-ink">pH</th>
              <th className="px-2 py-2 font-medium text-brand-ink">Alk (ppm)</th>
              <th className="px-2 py-2 font-medium text-brand-ink">CYA (ppm)</th>
              <th className="px-2 py-2 font-medium text-brand-ink">Temp (°F)</th>
              <th className="px-2 py-2 font-medium text-brand-ink">Pump (psi)</th>
              <th className="px-2 py-2 font-medium text-brand-ink">Vac (inHg)</th>
              <th className="px-2 py-2 font-medium text-brand-ink">Filter (psi)</th>
              <th className="px-2 py-2 font-medium text-brand-ink">Flow (gpm)</th>
              <th className="px-2 py-2 font-medium text-brand-ink">Backwash</th>
            </tr>
          </thead>
          <tbody className="font-[family-name:var(--font-mono)]">
            {rows.map((row) => (
              <tr key={row.day} className={`border-b border-brand-border last:border-0 ${row.visited ? "" : "text-brand-muted"}`}>
                <td className="px-2 py-1.5 font-sans font-medium text-brand-ink">{row.day}</td>
                <td className="px-2 py-1.5">{fmt(chlorineFamily?.key === "brominePpm" ? row.brominePpm : row.freeChlorinePpm)}</td>
                <td className="px-2 py-1.5">{fmt(row.ph)}</td>
                <td className="px-2 py-1.5">{fmt(row.alkalinityPpm, 0)}</td>
                <td className="px-2 py-1.5">{fmt(row.cyanuricAcidPpm, 0)}</td>
                <td className="px-2 py-1.5">{fmt(row.temperatureF, 0)}</td>
                <td className="px-2 py-1.5">{fmt(row.pumpPressurePsi)}</td>
                <td className="px-2 py-1.5">{fmt(row.vacGaugeReading)}</td>
                <td className="px-2 py-1.5">{fmt(row.filterPressurePsi)}</td>
                <td className="px-2 py-1.5">{fmt(row.flowMeterGpm)}</td>
                <td className="px-2 py-1.5">
                  {!row.visited ? "–" : row.backwashed ? `Yes (${row.backwashTime})` : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Chart section tabs */}
      <div className="app-tabs mt-8">
        <a href={sectionLinkFor("chemistry")} className={sectionTabClass("chemistry")}>
          Chemistry
        </a>
        <a href={sectionLinkFor("equipment")} className={sectionTabClass("equipment")}>
          Equipment
        </a>
        <a href={sectionLinkFor("backwash")} className={sectionTabClass("backwash")}>
          Backwash
        </a>
        <a href={sectionLinkFor("incidents")} className={sectionTabClass("incidents")}>
          Contamination incidents{contaminationIncidents.length ? ` (${contaminationIncidents.length})` : ""}
        </a>
        <a href={sectionLinkFor("inspections")} className={sectionTabClass("inspections")}>
          Inspection reports{inspectionReports.length ? ` (${inspectionReports.length})` : ""}
        </a>
      </div>

      {section === "chemistry" ? (
        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <ReadingChart
            label={chlorineFamilyLabel}
            unit={chlorineFamilyUnit}
            daysInMonth={totalDays}
            points={seriesFor((r) => (chlorineFamily?.key === "brominePpm" ? r.brominePpm : r.freeChlorinePpm))}
            targetMin={chlorineFamily?.min ?? undefined}
            targetMax={chlorineFamily?.max ?? undefined}
            domainMin={0}
            domainMax={10}
          />
          <ReadingChart
            label="pH"
            unit=""
            daysInMonth={totalDays}
            points={seriesFor((r) => r.ph)}
            targetMin={thresholds.phTargetMin ?? undefined}
            targetMax={thresholds.phTargetMax ?? undefined}
            hazardMin={thresholds.phHazardMin ?? undefined}
            hazardMax={thresholds.phHazardMax ?? undefined}
            domainMin={6.0}
            domainMax={8.5}
          />
          <ReadingChart
            label="Total alkalinity"
            unit="ppm"
            daysInMonth={totalDays}
            points={seriesFor((r) => r.alkalinityPpm)}
            targetMin={thresholds.alkalinityTargetMinPpm ?? undefined}
            targetMax={thresholds.alkalinityTargetMaxPpm ?? undefined}
            domainMin={0}
            domainMax={240}
          />
          <ReadingChart
            label="Cyanuric acid"
            unit="ppm"
            daysInMonth={totalDays}
            points={seriesFor((r) => r.cyanuricAcidPpm)}
            targetMin={thresholds.cyaTargetMinPpm ?? undefined}
            targetMax={thresholds.cyaTargetMaxPpm ?? undefined}
            hazardMax={thresholds.cyaHazardMaxPpm ?? undefined}
            domainMin={0}
            domainMax={120}
          />
          <ReadingChart
            label="Water temperature"
            unit="°F"
            daysInMonth={totalDays}
            points={seriesFor((r) => r.temperatureF)}
            targetMin={tempTarget.min}
            targetMax={tempTarget.max}
            domainMin={tempTarget.domainMin}
            domainMax={tempTarget.domainMax}
          />
        </section>
      ) : null}

      {section === "equipment" ? (
        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <ReadingChart label="Pump pressure" unit="psi" daysInMonth={totalDays} points={seriesFor((r) => r.pumpPressurePsi)} />
          <ReadingChart label="Pump vacuum gauge" unit="inHg" daysInMonth={totalDays} points={seriesFor((r) => r.vacGaugeReading)} />
          <ReadingChart
            label="Filter pressure"
            unit="psi"
            daysInMonth={totalDays}
            points={seriesFor((r) => r.filterPressurePsi)}
            targetMax={maxFilterFlow}
            targetMin={maxFilterFlow != null ? 0 : undefined}
            targetLabel="Max required"
          />
          <ReadingChart
            label="Flow rate"
            unit="gpm"
            daysInMonth={totalDays}
            points={seriesFor((r) => r.flowMeterGpm)}
            targetMin={minFlow}
            targetMax={minFlow != null ? minFlow * 1.5 : undefined}
            targetLabel="Min required"
          />
        </section>
      ) : null}

      {section === "backwash" ? (
        <section className="mt-4 grid gap-4">
          <BackwashCalendar days={rows.map((r) => ({ day: r.day, visited: r.visited, backwashed: r.backwashed, time: r.backwashTime }))} />
        </section>
      ) : null}

      {section === "incidents" ? (
        <section className="mt-4 grid gap-3">
          {contaminationIncidents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-brand-border bg-white p-6 text-center text-sm text-brand-muted">
              No contamination incidents on record for this venue.
            </p>
          ) : (
            contaminationIncidents.map((incident) => (
              <article key={incident.id} className="rounded-lg border border-brand-border bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-brand-ink">{incident.contaminationType}</h3>
                  <span className="app-badge">{incident.status.replace(/_/g, " ")}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-brand-muted">Discovered</dt>
                    <dd className="text-brand-ink">{formatLocalDateTime(incident.discoveredAt, tz)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-brand-muted">Target concentration reached</dt>
                    <dd className="text-brand-ink">{formatLocalDateTime(incident.targetConcentrationReachedAt, tz)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-brand-muted">Contact time ended</dt>
                    <dd className="text-brand-ink">{formatLocalDateTime(incident.contactTimeEndedAt, tz)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-brand-muted">Reopened</dt>
                    <dd className="text-brand-ink">{formatLocalDateTime(incident.reopenedAt, tz)}</dd>
                  </div>
                </dl>
                {incident.monitoringReadings.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-brand-border text-left text-brand-muted">
                          <th className="px-2 py-1 font-medium">Checkpoint</th>
                          <th className="px-2 py-1 font-medium">Recorded</th>
                          <th className="px-2 py-1 font-medium">FC (ppm)</th>
                          <th className="px-2 py-1 font-medium">TC (ppm)</th>
                          <th className="px-2 py-1 font-medium">pH</th>
                        </tr>
                      </thead>
                      <tbody className="font-[family-name:var(--font-mono)]">
                        {incident.monitoringReadings.map((reading, i) => (
                          <tr key={i} className="border-b border-brand-border last:border-0">
                            <td className="px-2 py-1 font-sans">{reading.checkpointLabel}</td>
                            <td className="px-2 py-1">{formatLocalDateTime(reading.recordedAt, tz)}</td>
                            <td className="px-2 py-1">{fmt(reading.freeChlorinePpm != null ? Number(reading.freeChlorinePpm) : null)}</td>
                            <td className="px-2 py-1">{fmt(reading.totalChlorinePpm != null ? Number(reading.totalChlorinePpm) : null)}</td>
                            <td className="px-2 py-1">{fmt(reading.ph != null ? Number(reading.ph) : null)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {incident.remediationSteps ? (
                  <p className="mt-3 text-sm text-brand-muted">
                    <span className="font-semibold text-brand-ink">Remediation: </span>
                    {incident.remediationSteps}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </section>
      ) : null}

      {section === "inspections" ? (
        <section className="mt-4 grid gap-3">
          {inspectionReports.length === 0 ? (
            <p className="rounded-lg border border-dashed border-brand-border bg-white p-6 text-center text-sm text-brand-muted">
              No inspection reports on file for this venue.
            </p>
          ) : (
            inspectionReports.map((report) => (
              <div key={report.id} className="flex items-center justify-between rounded-lg border border-brand-border bg-white p-4">
                <div>
                  <p className="text-sm font-medium text-brand-ink">{report.label}</p>
                  <p className="text-xs text-brand-muted">{formatLocalDateTime(report.createdAt, tz)}</p>
                </div>
                {report.url ? (
                  <a href={report.url} target="_blank" rel="noreferrer" className="app-btn-secondary-sm">
                    View
                  </a>
                ) : (
                  <span className="text-xs text-brand-muted">Unavailable</span>
                )}
              </div>
            ))
          )}
        </section>
      ) : null}

      <p className="mt-6 text-xs text-brand-muted">
        Target ranges shown are typical guidance for commercial pools and this property&rsquo;s configured equipment
        requirements. Refer to {healthDepartmentLabel(ruleset)}&rsquo;s code for the authoritative standard.
      </p>
    </main>
  );
}
