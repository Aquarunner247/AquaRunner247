/**
 * The demo organization Apple and Google reviewers sign into.
 *
 * App Review requires working credentials, and the app is a remote-URL shell loading
 * aquarunner247.com, so the account has to exist in PRODUCTION -- a reviewer gets the live site.
 * Production today holds exactly one real organization, and a reviewer poking around inside a
 * customer's actual route, chemistry records and property addresses is not acceptable. Hence a
 * separate org with invented data that still looks like a working week.
 *
 * NOT prisma/seed.ts. That script upserts the organization id `seed-org-aquarunner`, which is
 * the id production's real organization happens to carry -- running it against production would
 * rename Lindley's Pool & Spa Service to "AquaRunner (seed)". Everything here is namespaced
 * under DEMO_PREFIX instead, and assertOwnedId() refuses to write any row whose id falls outside
 * it, so this script cannot touch the real org even by accident.
 *
 *   npx tsx scripts/seed-app-review-org.ts            # dry run: says what it would write
 *   DEMO_ADMIN_PASSWORD=... npx tsx scripts/seed-app-review-org.ts --apply
 *
 * The password is read from the environment and never printed, stored in the repo, or echoed --
 * it goes straight from your shell to Supabase, and from your password manager into App Store
 * Connect's review notes.
 *
 * Idempotent: every write is an upsert keyed on a fixed id, so re-running refreshes the demo
 * data (dates move forward) without duplicating anything.
 */
import { BodyOfWaterType, VisitStatus } from "@/generated/prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { describeDatabaseTarget } from "./db-target";

/** Everything this script owns. Nothing outside it is ever written. */
const DEMO_PREFIX = "demo-appreview-";
const ORG_ID = `${DEMO_PREFIX}org`;

const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? "appreview@aquarunner247.com";
const TECH_EMAIL = process.env.DEMO_TECH_EMAIL ?? "appreview-tech@aquarunner247.com";

const APPLY = process.argv.includes("--apply");

/**
 * The guard that makes this safe to run against production.
 *
 * Every id this script writes passes through here first. A typo that pointed at
 * `seed-org-aquarunner` would throw rather than overwrite a real organization.
 */
function assertOwnedId(id: string): string {
  if (!id.startsWith(DEMO_PREFIX)) {
    throw new Error(`Refusing to write id outside the demo namespace: ${id}`);
  }
  return id;
}

type Venue = {
  key: string;
  propertyName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  bodies: {
    key: string;
    name: string;
    type: BodyOfWaterType;
    gallons: number;
    group: string | null;
    /**
     * Minimum required flow, when this body has a figure worth showing.
     *
     * Nevada's ruleset requires FLOW_METER for every body type, so the reading form asks for a
     * flow rate and the public inspector log draws a flow chart against this number as its
     * target band. Left undefined, both the chart band and the "Min required flow" row on the
     * log read as an em-dash.
     *
     * Deliberately per-body rather than derived from `gallons`: a pool's 6-hour turnover and a
     * spa's half-hour one are different rules, and inventing one formula for both would put a
     * wrong number on a compliance page.
     */
    minFlowGpm?: number;
  }[];
};

/**
 * Three properties, chosen to show the three shapes the product actually has rather than three
 * copies of the same thing: a single pool, a pool-and-spa walk-up that groups into one card, and
 * a site with two separately logged venues.
 *
 * Coordinates are real Las Vegas locations so the map renders somewhere plausible, but the
 * properties and people are invented.
 */
const VENUES: Venue[] = [
  {
    key: "desert-palms",
    propertyName: "Desert Palms Apartments",
    address: "4825 W Flamingo Rd",
    city: "Las Vegas",
    lat: 36.1147,
    lng: -115.2041,
    bodies: [
      // 92,000 gal / 6-hour turnover = 256 gpm. This is the body the store screenshots are
      // taken from, which is why it is the one carrying a flow figure.
      { key: "dp-pool", name: "Main Pool", type: BodyOfWaterType.POOL, gallons: 92000, group: "Main", minFlowGpm: 256 },
      { key: "dp-spa", name: "Spa", type: BodyOfWaterType.SPA, gallons: 900, group: "Main" },
    ],
  },
  {
    key: "canyon-ridge",
    propertyName: "Canyon Ridge HOA",
    address: "7120 W Sahara Ave",
    city: "Las Vegas",
    lat: 36.1445,
    lng: -115.2531,
    bodies: [{ key: "cr-pool", name: "Community Pool", type: BodyOfWaterType.POOL, gallons: 120000, group: null }],
  },
  {
    key: "sunridge-inn",
    propertyName: "Sunridge Inn & Suites",
    address: "3850 S Decatur Blvd",
    city: "Las Vegas",
    lat: 36.1098,
    lng: -115.2077,
    bodies: [
      { key: "si-indoor", name: "Indoor Pool", type: BodyOfWaterType.POOL, gallons: 48000, group: null },
      { key: "si-spa", name: "Courtyard Spa", type: BodyOfWaterType.SPA, gallons: 750, group: null },
    ],
  },
];

function id(...parts: string[]): string {
  return assertOwnedId(DEMO_PREFIX + parts.join("-"));
}

/** Local midnight for `daysAgo` days back, plus an ETA offset, matching visit-generation. */
function visitAnchor(daysAgo: number, offsetMinutes: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return new Date(d.getTime() + offsetMinutes * 60 * 1000);
}

async function resolveAuthUserId(supabaseAdmin: SupabaseClient, email: string, password: string): Promise<string> {
  const created = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error && created.data.user?.id) return created.data.user.id;

  const msg = created.error?.message ?? "";
  if (!msg.toLowerCase().includes("already")) {
    throw new Error(`Supabase createUser failed for ${email}: ${msg || "unknown error"}`);
  }
  // Already there from a previous run -- reset the password so the credentials in App Store
  // Connect keep working even if nobody remembers what was used last time.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) {
      await supabaseAdmin.auth.admin.updateUserById(hit.id, { password });
      return hit.id;
    }
    if (data.users.length < 200) break;
  }
  throw new Error(`${email} exists in Supabase but could not be listed.`);
}

async function main() {
  const target = describeDatabaseTarget();
  console.log(`\n[demo-seed] Database: ${target.label}`);
  console.log(`[demo-seed] Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);

  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (APPLY && !password) {
    throw new Error("DEMO_ADMIN_PASSWORD is not set. Refusing to create logins without one.");
  }

  const plan: string[] = [];
  const note = (line: string) => {
    plan.push(line);
    console.log(`  ${APPLY ? "+" : "would create"} ${line}`);
  };

  // Nevada, so the compliance ruleset and the public QR log pages resolve -- a reviewer tapping
  // a placard QR needs to land on a record, not a 404.
  const ruleset = await prisma.complianceRuleset.findFirst({
    where: { state: "NV" },
    select: { id: true, isSupported: true },
  });
  if (!ruleset?.isSupported) {
    console.warn("[demo-seed] WARNING: no supported NV compliance ruleset found — QR log pages will 404.");
  }

  note(`organization ${ORG_ID} "Desert Oasis Pool Service" (NV, COMPED)`);
  note(`admin login ${ADMIN_EMAIL}`);
  note(`technician login ${TECH_EMAIL}`);
  for (const v of VENUES) {
    note(`property "${v.propertyName}" with ${v.bodies.length} ${v.bodies.length === 1 ? "venue" : "venues"}`);
  }
  note("a weekday route with every property on it");
  note("14 days of completed visits with readings, plus today's schedule");

  if (!APPLY) {
    console.log(`\n[demo-seed] Dry run complete — ${plan.length} things would be written. Re-run with --apply.\n`);
    return;
  }

  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      name: "Desert Oasis Pool Service",
      businessName: "Desert Oasis Pool Service LLC",
      businessPhone: "702-555-0180",
      state: "NV",
      hasCommercialPools: true,
      planStatus: "COMPED",
      complianceRulesetId: ruleset?.id ?? null,
      // Never shown the Terms, same as every other pre-clickwrap account. Left null honestly
      // rather than backfilled -- see lib/terms-acceptance.ts.
    },
    update: {
      name: "Desert Oasis Pool Service",
      businessName: "Desert Oasis Pool Service LLC",
      state: "NV",
      hasCommercialPools: true,
      planStatus: "COMPED",
      complianceRulesetId: ruleset?.id ?? null,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to create logins.");
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const adminAuthId = await resolveAuthUserId(supabaseAdmin, ADMIN_EMAIL, password!);
  const techAuthId = await resolveAuthUserId(supabaseAdmin, TECH_EMAIL, password!);

  const admin = await prisma.user.upsert({
    where: { id: id("user", "admin") },
    create: { id: id("user", "admin"), organizationId: org.id, authUserId: adminAuthId, email: ADMIN_EMAIL, name: "Dana Reyes", role: "ADMIN", active: true },
    update: { authUserId: adminAuthId, email: ADMIN_EMAIL, name: "Dana Reyes", role: "ADMIN", active: true },
  });
  const tech = await prisma.user.upsert({
    where: { id: id("user", "tech") },
    create: { id: id("user", "tech"), organizationId: org.id, authUserId: techAuthId, email: TECH_EMAIL, name: "Marco Silva", role: "TECHNICIAN", active: true },
    update: { authUserId: techAuthId, email: TECH_EMAIL, name: "Marco Silva", role: "TECHNICIAN", active: true },
  });
  console.log(`[demo-seed] admin ${admin.email} / technician ${tech.email}`);

  const customer = await prisma.customer.upsert({
    where: { id: id("customer") },
    create: { id: id("customer"), organizationId: org.id, name: "Desert Oasis Managed Properties" },
    update: { name: "Desert Oasis Managed Properties" },
  });

  const route = await prisma.recurringRoute.upsert({
    where: { id: id("route") },
    create: {
      id: id("route"),
      organizationId: org.id,
      name: "Demo Route",
      technicianId: tech.id,
      frequency: "WEEKLY",
      dayOfWeek: new Date().getDay() === 0 ? 7 : new Date().getDay(),
      active: true,
    },
    update: { technicianId: tech.id, active: true, dayOfWeek: new Date().getDay() === 0 ? 7 : new Date().getDay() },
  });

  let sortOrder = 0;
  let etaOffset = 7 * 60; // first stop anchored at 07:00 local

  for (const venue of VENUES) {
    const property = await prisma.property.upsert({
      where: { id: id("property", venue.key) },
      create: {
        id: id("property", venue.key),
        organizationId: org.id,
        customerId: customer.id,
        name: venue.propertyName,
        addressLine1: venue.address,
        city: venue.city,
        region: "NV",
        country: "US",
        propertyType: "COMMERCIAL",
        latitude: venue.lat,
        longitude: venue.lng,
        managerName: "Property Manager",
        managerEmail: "manager@example.com",
        managerPhone: "702-555-0190",
      },
      update: {
        name: venue.propertyName,
        addressLine1: venue.address,
        propertyType: "COMMERCIAL",
        latitude: venue.lat,
        longitude: venue.lng,
      },
    });

    for (const b of venue.bodies) {
      const body = await prisma.bodyOfWater.upsert({
        where: { id: id("body", b.key) },
        create: {
          id: id("body", b.key),
          propertyId: property.id,
          name: b.name,
          type: b.type,
          volumeGallons: b.gallons,
          publicSlug: `demo-${b.key}`,
          serviceGroup: b.group,
          latitude: venue.lat,
          longitude: venue.lng,
          requiresComplianceReadings: true,
          minimumRequiredFlowGpm: b.minFlowGpm,
          // maximumFilterFlowGpm is deliberately NOT set. app/p/[publicSlug]/page.tsx passes it as
          // the target band for the FILTER PRESSURE chart -- a gpm value bounding a psi reading.
          // A realistic 400 there gives that chart a 0-400 psi band and flattens the real 17-21
          // psi readings into a line along the bottom. Left null, the chart auto-scales correctly.
        },
        update: {
          name: b.name,
          volumeGallons: b.gallons,
          publicSlug: `demo-${b.key}`,
          serviceGroup: b.group,
          minimumRequiredFlowGpm: b.minFlowGpm,
        },
      });

      // propertyId is required and separate from bodyOfWaterId -- a stop belongs to a
      // property and optionally names one venue on it.
      await prisma.recurringStop.upsert({
        where: { id: id("stop", b.key) },
        create: {
          id: id("stop", b.key),
          routeId: route.id,
          propertyId: property.id,
          bodyOfWaterId: body.id,
          sortOrder,
          etaOffsetMinutes: etaOffset,
        },
        update: { routeId: route.id, propertyId: property.id, sortOrder, etaOffsetMinutes: etaOffset },
      });
      sortOrder++;

      // Two weeks of history so the compliance log, the QR page and the dashboard charts have
      // something to show, plus one scheduled stop for today so the schedule screen is not empty.
      for (let daysAgo = 14; daysAgo >= 0; daysAgo -= 7) {
        const visitId = id("visit", b.key, String(daysAgo));
        const anchor = visitAnchor(daysAgo, etaOffset);
        const isToday = daysAgo === 0;
        const completedAt = new Date(anchor.getTime() + 40 * 60 * 1000);

        await prisma.serviceVisit.deleteMany({ where: { id: visitId } });
        await prisma.serviceVisit.create({
          data: {
            id: visitId,
            organizationId: org.id,
            propertyId: property.id,
            bodyOfWaterId: body.id,
            technicianId: tech.id,
            scheduledStart: anchor,
            routeSequence: sortOrder - 1,
            ...(isToday
              ? {
                  status: VisitStatus.SCHEDULED,
                  // The Main Pool arrives with today's readings already typed in, and ONLY the Main
                  // Pool. Two things need that. The store screenshots of the reading screen are
                  // taken here, and an empty form shows neither the numbers nor the "last reading"
                  // strip comparing them to the previous service -- which is half of what that
                  // screen is for. Every other stop stays untouched so the Play permissions video
                  // still records a genuinely fresh day.
                  // Values differ from the history below on purpose: an identical reading makes the
                  // comparison strip look broken rather than unchanged.
                  ...(b.key === "dp-pool"
                    ? {
                        reading: {
                          create: {
                            capturedAt: anchor,
                            ph: 7.6,
                            freeChlorinePpm: 3.1,
                            totalChlorinePpm: 3.3,
                            alkalinityPpm: 95,
                            cyanuricAcidPpm: 50,
                            temperatureF: 84,
                            pumpPressurePsi: 27,
                            vacGaugeReading: 7,
                            filterPressurePsi: 20,
                            flowMeterGpm: 260,
                          },
                        },
                      }
                    : {}),
                }
              : {
                  status: VisitStatus.COMPLETED,
                  serviceComplete: true,
                  startedAt: anchor,
                  completedAt,
                  techNotes: "Water clear, equipment running normally.",
                  reading: {
                    create: {
                      capturedAt: completedAt,
                      ph: 7.4,
                      freeChlorinePpm: 2.4,
                      totalChlorinePpm: 2.6,
                      alkalinityPpm: 90,
                      cyanuricAcidPpm: 45,
                      temperatureF: 82,
                      pumpPressurePsi: 26,
                      // Nevada requires PUMP_VACUUM and FLOW_METER alongside the two pressures
                      // (EquipmentReadingRequirement rows for the NV ruleset), so the reading form
                      // marks all four required and the inspector log has a column for each.
                      // Omitting these left two of eleven columns empty down the whole month.
                      vacGaugeReading: 6,
                      filterPressurePsi: 18,
                      flowMeterGpm: 268,
                    },
                  },
                }),
          },
        });
      }
      etaOffset += 25;
    }
  }

  console.log(`\n[demo-seed] Done. Sign in at /login as ${ADMIN_EMAIL}.`);
  console.log("[demo-seed] Password: the value of DEMO_ADMIN_PASSWORD (not printed).\n");
}

main()
  .catch((err) => {
    console.error("[demo-seed] FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
