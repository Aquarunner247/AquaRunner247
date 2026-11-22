/**
 * The demo organization Apple and Google reviewers sign into, and the one shown to prospects.
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
 *
 * WHAT IT BUILDS, and why each piece is here rather than being the smallest thing that renders:
 *
 *  - Six commercial customers across eleven properties and twenty-one bodies of water. One customer
 *    with one pool demonstrates nothing: the screens this product lives on -- the customer list,
 *    the chemical cost report, the admin schedule split by technician -- are all list screens,
 *    and a list of one reads as a prototype.
 *  - Three technicians and an office user, each with a real login, so the admin schedule shows
 *    several people's days side by side and the role gating is visible rather than described.
 *  - Twelve weeks of weekly service history per body, with readings AND chemical doses, because
 *    doses are what the chemical cost report, the QuickBooks export and the customer's service
 *    summary email are made of. The previous version of this script wrote none at all, so every
 *    one of those screens was empty in the demo.
 *  - The doses are not decoration. Each body is given a decay constant and its chlorine is
 *    simulated forward from it, so the history is internally consistent with the physics in
 *    lib/chlorine-demand.ts: a pool that loses 5% a day gets dosed every third visit and a pool
 *    that loses 20% a day gets dosed every visit. That is what makes Settings > Smart dosing
 *    show a believable mix of pools that measure their own demand and pools that cannot yet.
 */
import { BodyOfWaterType, ChlorineFeedMechanism, VisitStatus } from "@/generated/prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { applyRequested, describeDatabaseTarget, rerunWithApply } from "./db-target";

/** Everything this script owns. Nothing outside it is ever written. */
const DEMO_PREFIX = "demo-appreview-";
const ORG_ID = `${DEMO_PREFIX}org`;

const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? "appreview@aquarunner247.com";
const TECH_EMAIL = process.env.DEMO_TECH_EMAIL ?? "appreview-tech@aquarunner247.com";

const APPLY = applyRequested();

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

function id(...parts: string[]): string {
  return assertOwnedId(DEMO_PREFIX + parts.join("-"));
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * The crew. Every one of them gets a real Supabase login on the same DEMO_ADMIN_PASSWORD.
 *
 * Technicians could have been User rows with a null authUserId -- the column is optional, and
 * they would still appear on the admin schedule and in route assignment. They get real logins
 * anyway because the technician experience IS the product: being able to sign in as Priya and
 * see a different day from Marco's is the difference between demonstrating multi-technician
 * scheduling and asserting it.
 *
 * `key` is the id suffix and must stay stable: changing one orphans that person's routes rather
 * than renaming them.
 */
type Person = {
  key: string;
  email: string;
  name: string;
  role: "ADMIN" | "OFFICE" | "TECHNICIAN";
  phone: string;
};

const PEOPLE: Person[] = [
  { key: "admin", email: ADMIN_EMAIL, name: "Dana Reyes", role: "ADMIN", phone: "702-555-0181" },
  { key: "tech", email: TECH_EMAIL, name: "Marco Silva", role: "TECHNICIAN", phone: "702-555-0182" },
  {
    key: "tech2",
    email: process.env.DEMO_TECH2_EMAIL ?? "appreview-tech2@aquarunner247.com",
    name: "Priya Raman",
    role: "TECHNICIAN",
    phone: "702-555-0183",
  },
  {
    key: "tech3",
    email: process.env.DEMO_TECH3_EMAIL ?? "appreview-tech3@aquarunner247.com",
    name: "Dale Whitcomb",
    role: "TECHNICIAN",
    phone: "702-555-0184",
  },
  {
    key: "office",
    email: process.env.DEMO_OFFICE_EMAIL ?? "appreview-office@aquarunner247.com",
    name: "Nora Bennett",
    role: "OFFICE",
    phone: "702-555-0185",
  },
];

// ---------------------------------------------------------------------------
// Customers, properties, bodies of water
// ---------------------------------------------------------------------------

type DemoBody = {
  key: string;
  name: string;
  type: BodyOfWaterType;
  gallons: number;
  group: string | null;
  /** How this body's baseline chlorine actually gets into the water. It decides which branch of
   * the dosing calculator a reviewer sees, so the demo deliberately carries all four. */
  feed: ChlorineFeedMechanism;
  /**
   * Fraction of its free chlorine this body loses per day -- k in FC(t) = FC(0)*e^(-k*t), the
   * same constant lib/chlorine-demand.ts measures. Used to simulate the history below, so the
   * demand the app later measures out of this demo data comes back close to the number written
   * here. Chosen per body to span the range the real measured pools span (4%/day to 30%/day),
   * because a demo where every pool behaves identically cannot show why per-pool measurement
   * matters.
   */
  k: number;
  /** What the technician is paid for this venue, so the payroll and estimated-earnings screens
   * have real figures. Bundled bodies (a spa serviced on the same walk-up as its pool) carry 0
   * and name the body they bundle into. */
  payRate: number;
  bundledInto?: string;
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
  /**
   * What the filter is rated to take. Together with `minFlowGpm` this is the flow chart's
   * target band on the public inspector log -- two measured figures in the same unit.
   */
  maxFlowGpm?: number;
};

type DemoProperty = {
  key: string;
  propertyName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  /** Which technician runs this property. */
  techKey: string;
  /**
   * The ISO weekdays (Mon=1 .. Sun=7) this property sits on a route for.
   *
   * NOT the same thing as how often it is serviced -- see serviceWeekdays.
   *
   * EXACTLY ONE PROPERTY IS ON ALL SEVEN, and which one it is matters. The seven-day route is
   * review insurance (see the route loop for the incident behind it) and it has a side effect:
   * lib/dosing-calculator.ts asks RecurringStop for the next scheduled visit, so a body routed
   * every day is told its chlorine only has to last ONE day, and the carry projection -- the
   * interesting half of the Dosing Card -- comes out trivial on it.
   *
   * So the seven-day route sits on Canyon Ridge's Community Pool, which is on an automation
   * system and therefore gets no carry projection at any gap (see AUTOMATION_CORRECTION_NOTE):
   * the insurance costs nothing there. Desert Palms, where the store screenshots are taken,
   * keeps a realistic twice-weekly cadence and a believable gap.
   */
  routeWeekdays: number[] | "semiweekly-including-today";
  /**
   * The weekdays that actually generate service HISTORY, which is the property's real cadence.
   *
   * Defaults to routeWeekdays, and only differs for the one property routed every day: writing
   * history for all seven weekdays would mean a visit every single day, which no commercial pool
   * gets and which puts consecutive readings a day apart -- below DEMAND_MIN_GAP_DAYS, so
   * lib/chlorine-demand.ts discards every interval and that body can never measure itself.
   * See resolveWeekdays for what the literal means.
   */
  serviceWeekdays?: number[] | "semiweekly-including-today";
  bodies: DemoBody[];
};

type DemoCustomer = {
  key: string;
  name: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  properties: DemoProperty[];
};

/**
 * Six commercial customers, shaped to cover the cases the product actually has to handle rather
 * than six copies of one case.
 *
 * Coordinates are real Las Vegas locations so the map and the route legs render somewhere
 * plausible, but every property, person and phone number is invented.
 *
 * DESERT OASIS MANAGED PROPERTIES IS LOAD-BEARING AND MUST KEEP ITS THREE PROPERTIES ON ALL
 * SEVEN WEEKDAYS. Those are the venues the store screenshots and the Play permissions video were
 * shot at, their ids are referenced by `demo-dp-pool`-style public slugs on placards, and the
 * seven-day coverage exists for a specific reason recorded on the route loop below: an empty day
 * makes isDayFullyDone() report the day finished, which stops the location watcher ever starting
 * and the background-location disclosure ever appearing. The four customers added after it are
 * on ordinary weekday routes, which is what gives the admin schedule several technicians with
 * different loads.
 */
const CUSTOMERS: DemoCustomer[] = [
  {
    key: "desert-oasis",
    name: "Desert Oasis Managed Properties",
    managerName: "Property Manager",
    managerEmail: "manager@example.com",
    managerPhone: "702-555-0190",
    properties: [
      {
        key: "desert-palms",
        propertyName: "Desert Palms Apartments",
        address: "4825 W Flamingo Rd",
        city: "Las Vegas",
        lat: 36.1147,
        lng: -115.2041,
        techKey: "tech",
        routeWeekdays: "semiweekly-including-today",
        bodies: [
          // 92,000 gal / 6-hour turnover = 256 gpm. This is the body the store screenshots are
          // taken from, which is why it is the one carrying a flow figure.
          {
            key: "dp-pool",
            name: "Main Pool",
            type: BodyOfWaterType.POOL,
            gallons: 92000,
            group: "Main",
            feed: ChlorineFeedMechanism.TABLET_FEEDER,
            k: 0.11,
            payRate: 48,
            minFlowGpm: 256,
            maxFlowGpm: 400,
          },
          {
            key: "dp-spa",
            name: "Spa",
            type: BodyOfWaterType.SPA,
            gallons: 900,
            group: "Main",
            feed: ChlorineFeedMechanism.MANUAL,
            k: 0.17,
            payRate: 0,
            bundledInto: "dp-pool",
          },
        ],
      },
      {
        key: "canyon-ridge",
        propertyName: "Canyon Ridge HOA",
        address: "7120 W Sahara Ave",
        city: "Las Vegas",
        lat: 36.1445,
        lng: -115.2531,
        techKey: "tech",
        // THE REVIEW INSURANCE. Every weekday, so Marco's day is never empty whichever day a
        // reviewer opens -- and on an automation body, where routing it daily costs nothing
        // because the carry projection never applies anyway. See routeWeekdays.
        routeWeekdays: [1, 2, 3, 4, 5, 6, 7],
        serviceWeekdays: "semiweekly-including-today",
        bodies: [
          {
            key: "cr-pool",
            name: "Community Pool",
            type: BodyOfWaterType.POOL,
            gallons: 120000,
            group: null,
            feed: ChlorineFeedMechanism.LIQUID_FEED_PUMP,
            k: 0.08,
            payRate: 55,
            minFlowGpm: 334,
            maxFlowGpm: 500,
          },
        ],
      },
      {
        key: "sunridge-inn",
        propertyName: "Sunridge Inn & Suites",
        address: "3850 S Decatur Blvd",
        city: "Las Vegas",
        lat: 36.1098,
        lng: -115.2077,
        techKey: "tech",
        routeWeekdays: [2, 4, 6],
        bodies: [
          {
            key: "si-indoor",
            name: "Indoor Pool",
            type: BodyOfWaterType.POOL,
            gallons: 48000,
            group: null,
            feed: ChlorineFeedMechanism.TABLET_FEEDER,
            // Indoors: no UV, so it holds chlorine far better than anything in the sun. The
            // slowest body in the demo on purpose -- it is the one that shows a measured rate
            // nothing like the default.
            k: 0.045,
            payRate: 42,
            minFlowGpm: 134,
            maxFlowGpm: 220,
          },
          {
            key: "si-spa",
            name: "Courtyard Spa",
            type: BodyOfWaterType.SPA,
            gallons: 750,
            group: null,
            feed: ChlorineFeedMechanism.MANUAL,
            k: 0.2,
            payRate: 25,
          },
        ],
      },
    ],
  },
  {
    key: "vista-linda",
    name: "Vista Linda Community Association",
    managerName: "Eileen Marsh",
    managerEmail: "emarsh@example.com",
    managerPhone: "702-555-0191",
    properties: [
      {
        key: "vista-linda-north",
        propertyName: "Vista Linda North Clubhouse",
        address: "8420 W Charleston Blvd",
        city: "Las Vegas",
        lat: 36.1587,
        lng: -115.2772,
        techKey: "tech2",
        routeWeekdays: [1, 4],
        bodies: [
          {
            key: "vln-pool",
            name: "Clubhouse Pool",
            type: BodyOfWaterType.POOL,
            gallons: 68000,
            group: "Clubhouse",
            feed: ChlorineFeedMechanism.TABLET_FEEDER,
            k: 0.13,
            payRate: 45,
            minFlowGpm: 189,
            maxFlowGpm: 300,
          },
          {
            key: "vln-spa",
            name: "Clubhouse Spa",
            type: BodyOfWaterType.SPA,
            gallons: 1100,
            group: "Clubhouse",
            feed: ChlorineFeedMechanism.MANUAL,
            k: 0.16,
            payRate: 0,
            bundledInto: "vln-pool",
          },
          {
            key: "vln-wading",
            name: "Wading Pool",
            type: BodyOfWaterType.WADING_POOL,
            gallons: 4200,
            group: "Clubhouse",
            feed: ChlorineFeedMechanism.TABLET_FLOATER,
            k: 0.19,
            payRate: 0,
            bundledInto: "vln-pool",
          },
        ],
      },
      {
        key: "vista-linda-south",
        propertyName: "Vista Linda South Recreation Center",
        address: "9075 W Russell Rd",
        city: "Las Vegas",
        lat: 36.0686,
        lng: -115.2881,
        techKey: "tech2",
        routeWeekdays: [1, 4],
        bodies: [
          {
            key: "vls-pool",
            name: "Lap Pool",
            type: BodyOfWaterType.POOL,
            gallons: 145000,
            group: null,
            feed: ChlorineFeedMechanism.LIQUID_FEED_PUMP,
            k: 0.09,
            payRate: 62,
            minFlowGpm: 403,
            maxFlowGpm: 600,
          },
          {
            key: "vls-fountain",
            name: "Entry Fountain",
            type: BodyOfWaterType.FOUNTAIN,
            gallons: 2800,
            group: null,
            feed: ChlorineFeedMechanism.TABLET_FLOATER,
            k: 0.22,
            payRate: 18,
          },
        ],
      },
    ],
  },
  {
    key: "silver-mesa",
    name: "Silver Mesa Hospitality",
    managerName: "Theo Kwan",
    managerEmail: "tkwan@example.com",
    managerPhone: "702-555-0192",
    properties: [
      {
        key: "silver-mesa-resort",
        propertyName: "Silver Mesa Resort & Spa",
        address: "2600 W Sunset Rd",
        city: "Las Vegas",
        lat: 36.0718,
        lng: -115.1877,
        techKey: "tech2",
        routeWeekdays: [2, 5],
        bodies: [
          {
            key: "smr-pool",
            name: "Resort Pool",
            type: BodyOfWaterType.POOL,
            gallons: 186000,
            group: "Deck",
            feed: ChlorineFeedMechanism.LIQUID_FEED_PUMP,
            k: 0.12,
            payRate: 75,
            minFlowGpm: 517,
            maxFlowGpm: 750,
          },
          {
            key: "smr-spa",
            name: "Deck Spa",
            type: BodyOfWaterType.SPA,
            gallons: 1400,
            group: "Deck",
            // THE BODY NO DOSE CAN CARRY, kept that way on purpose and the only one.
            //
            // A busy resort spa at 104F burns chlorine faster than anything else on the route.
            // At 28% a day, holding 3 ppm across a three-day gap needs the water at 7 ppm and
            // across four days needs 9 -- past the 8 ppm ceiling, so projectCarryTarget reports
            // bridges: false and the Dosing Card says a feeder or a mid-week stop is the real
            // answer instead of printing a number it knows is short. That branch is worth being
            // able to show somebody, and nothing else in the demo reaches it.
            //
            // The cost is that this spa logs readings under its 3 ppm minimum from time to time.
            // That is not a flaw in the demo; it is the true consequence, and it is also what
            // gives the compliance alerts something real to fire on.
            feed: ChlorineFeedMechanism.MANUAL,
            k: 0.28,
            payRate: 30,
          },
          {
            key: "smr-feature",
            name: "Lobby Water Feature",
            type: BodyOfWaterType.WATER_FEATURE,
            gallons: 1900,
            group: null,
            feed: ChlorineFeedMechanism.TABLET_FLOATER,
            k: 0.16,
            payRate: 20,
          },
        ],
      },
      {
        key: "silver-mesa-express",
        propertyName: "Silver Mesa Express Hotel",
        address: "4155 Paradise Rd",
        city: "Las Vegas",
        lat: 36.1109,
        lng: -115.1522,
        techKey: "tech3",
        routeWeekdays: [3, 6],
        bodies: [
          {
            key: "sme-pool",
            name: "Courtyard Pool",
            type: BodyOfWaterType.POOL,
            gallons: 52000,
            group: null,
            feed: ChlorineFeedMechanism.TABLET_FEEDER,
            k: 0.14,
            payRate: 44,
            minFlowGpm: 145,
            maxFlowGpm: 240,
          },
        ],
      },
    ],
  },
  {
    key: "red-rock-athletic",
    name: "Red Rock Athletic Clubs",
    managerName: "Camille Ortiz",
    managerEmail: "cortiz@example.com",
    managerPhone: "702-555-0193",
    properties: [
      {
        key: "red-rock-summerlin",
        propertyName: "Red Rock Athletic — Summerlin",
        address: "10100 W Charleston Blvd",
        city: "Las Vegas",
        lat: 36.1591,
        lng: -115.3225,
        techKey: "tech3",
        routeWeekdays: [2, 5],
        bodies: [
          {
            key: "rrs-pool",
            name: "Indoor Lap Pool",
            type: BodyOfWaterType.POOL,
            gallons: 98000,
            group: "Natatorium",
            feed: ChlorineFeedMechanism.LIQUID_FEED_PUMP,
            k: 0.055,
            payRate: 58,
            minFlowGpm: 272,
            maxFlowGpm: 420,
          },
          {
            key: "rrs-spa",
            name: "Therapy Spa",
            type: BodyOfWaterType.SPA,
            gallons: 1600,
            group: "Natatorium",
            feed: ChlorineFeedMechanism.MANUAL,
            k: 0.19,
            payRate: 0,
            bundledInto: "rrs-pool",
          },
        ],
      },
      {
        key: "red-rock-henderson",
        propertyName: "Red Rock Athletic — Henderson",
        address: "2770 W Horizon Ridge Pkwy",
        city: "Henderson",
        lat: 36.0122,
        lng: -115.0944,
        techKey: "tech3",
        routeWeekdays: [3, 6],
        bodies: [
          {
            key: "rrh-pool",
            name: "Outdoor Pool",
            type: BodyOfWaterType.POOL,
            gallons: 76000,
            group: null,
            feed: ChlorineFeedMechanism.TABLET_FEEDER,
            k: 0.17,
            payRate: 50,
            minFlowGpm: 211,
            maxFlowGpm: 340,
          },
        ],
      },
    ],
  },
  {
    key: "mojave-ridge",
    name: "Mojave Ridge Student Living",
    managerName: "Priscilla Hahn",
    managerEmail: "phahn@example.com",
    managerPhone: "702-555-0194",
    properties: [
      {
        key: "mojave-ridge-commons",
        propertyName: "Mojave Ridge Commons",
        address: "4505 S Maryland Pkwy",
        city: "Las Vegas",
        lat: 36.1057,
        lng: -115.1424,
        techKey: "tech",
        routeWeekdays: [1, 5],
        bodies: [
          {
            key: "mrc-pool",
            name: "Courtyard Pool",
            type: BodyOfWaterType.POOL,
            gallons: 64000,
            group: null,
            feed: ChlorineFeedMechanism.TABLET_FEEDER,
            k: 0.15,
            payRate: 46,
            minFlowGpm: 178,
            maxFlowGpm: 290,
          },
          {
            key: "mrc-spa",
            name: "Courtyard Spa",
            type: BodyOfWaterType.SPA,
            gallons: 1250,
            group: null,
            feed: ChlorineFeedMechanism.MANUAL,
            k: 0.18,
            payRate: 24,
          },
        ],
      },
    ],
  },
  {
    key: "boulder-crossing",
    name: "Boulder Crossing Senior Living",
    managerName: "Walt Hennessy",
    managerEmail: "whennessy@example.com",
    managerPhone: "702-555-0195",
    properties: [
      {
        key: "boulder-crossing-village",
        propertyName: "Boulder Crossing Village",
        address: "1500 W Warm Springs Rd",
        city: "Henderson",
        lat: 36.0394,
        lng: -115.0531,
        techKey: "tech3",
        routeWeekdays: [1, 4],
        bodies: [
          {
            key: "bcv-pool",
            name: "Heated Pool",
            type: BodyOfWaterType.POOL,
            gallons: 41000,
            group: "Wellness",
            feed: ChlorineFeedMechanism.LIQUID_FEED_PUMP,
            k: 0.07,
            payRate: 40,
            minFlowGpm: 114,
            maxFlowGpm: 190,
          },
          {
            key: "bcv-spa",
            name: "Therapy Spa",
            type: BodyOfWaterType.SPA,
            gallons: 1350,
            group: "Wellness",
            feed: ChlorineFeedMechanism.MANUAL,
            // Warm, heavily used and serviced twice a week, which is just enough cadence to
            // leave a measurable gap on a spa. Its opposite number is Silver Mesa's Deck Spa at
            // k=0.33 on the same cadence, which never manages one -- the pair is the clearest
            // illustration the demo has of why the rate is measured per pool.
            k: 0.2,
            payRate: 0,
            bundledInto: "bcv-pool",
          },
        ],
      },
    ],
  },
];

const ALL_PROPERTIES = CUSTOMERS.flatMap((c) => c.properties.map((p) => ({ customer: c, property: p })));
const ALL_BODIES = ALL_PROPERTIES.flatMap(({ customer, property }) =>
  property.bodies.map((body) => ({ customer, property, body })),
);

// ---------------------------------------------------------------------------
// The chemicals the demo org stocks
// ---------------------------------------------------------------------------

/**
 * Billing products, with real-ish Las Vegas wholesale costs and a margin on top.
 *
 * These exist for two reasons that are easy to miss. A ChemicalProduct row is what the chemical
 * cost report, the QuickBooks chemical-expense CSV and the customer's service summary email are
 * built from -- without them a logged dose has a name and a quantity and no money attached, and
 * three screens come up blank. And OrgChemicalProductSetting.linkedBillingProductId points at
 * one, which is what lets the Dosing Card's "Apply" button write a dose rather than only
 * printing an amount.
 *
 * `catalogName` ties the product to a row in the GLOBAL ChemicalProductCatalog, matched by name
 * at run time rather than by id: catalog ids are cuids generated per database, so a hardcoded id
 * that worked locally would silently match nothing in production.
 */
type DemoChemical = {
  key: string;
  name: string;
  unit: string;
  cost: number;
  charge: number;
  /** Name in ChemicalProductCatalog, or null for a product with no dosing-catalog equivalent. */
  catalogName: string | null;
  /** The org's primary pick for that catalog product's chemical type. Exactly one per type. */
  primary: boolean;
};

const CHEMICALS: DemoChemical[] = [
  { key: "liquid-chlorine", name: "Liquid Chlorine 12.5%", unit: "GAL", cost: 3.95, charge: 7.5, catalogName: "Liquid Chlorine 12%", primary: true },
  { key: "tablets", name: "3\" Trichlor Tablets", unit: "TAB", cost: 0.92, charge: 2.25, catalogName: 'Trichlor Tablets 90% (3")', primary: false },
  { key: "muriatic-acid", name: "Muriatic Acid 31.45%", unit: "GAL", cost: 5.6, charge: 11.0, catalogName: "Muriatic Acid 31.45% (pH)", primary: true },
  { key: "bicarb", name: "Sodium Bicarbonate", unit: "LB", cost: 0.68, charge: 1.75, catalogName: "Baking Soda (Sodium Bicarbonate) 100%", primary: true },
  { key: "cal-hypo", name: "Cal-Hypo Shock 73%", unit: "LB", cost: 2.15, charge: 4.5, catalogName: "Cal-Hypo 75%", primary: false },
  { key: "stabilizer", name: "Cyanuric Acid Stabilizer", unit: "LB", cost: 2.8, charge: 6.0, catalogName: "Cyanuric Acid (Stabilizer)", primary: true },
  { key: "soda-ash", name: "Soda Ash", unit: "LB", cost: 0.82, charge: 2.0, catalogName: "Soda Ash (Sodium Carbonate) 100%", primary: true },
  // No dosing-catalog equivalent: there is no ppm-delta formula for an algaecide, so it is a
  // product you bill for and never a dose the calculator recommends. Here because a real
  // chemical list has a few of these on it.
  { key: "algaecide", name: "Polyquat 60 Algaecide", unit: "QT", cost: 9.4, charge: 19.0, catalogName: null, primary: false },
];

// ---------------------------------------------------------------------------
// The service checklist
// ---------------------------------------------------------------------------

const CHECKLIST: { key: string; label: string; category: string; required: boolean; billable?: number }[] = [
  { key: "skim", label: "Skim surface and empty baskets", category: "Cleaning", required: true },
  { key: "brush", label: "Brush walls, steps and waterline", category: "Cleaning", required: true },
  { key: "vacuum", label: "Vacuum floor", category: "Cleaning", required: false },
  { key: "tile", label: "Scrub tile line", category: "Cleaning", required: false },
  { key: "baskets", label: "Clean pump and skimmer baskets", category: "Equipment", required: true },
  { key: "pressure", label: "Check filter pressure and backwash if needed", category: "Equipment", required: true },
  { key: "feeder", label: "Check and refill chlorine feeder", category: "Equipment", required: true },
  { key: "deck", label: "Hose and tidy deck", category: "Site", required: false },
  { key: "gate", label: "Check gate self-closes and latches", category: "Safety", required: true },
  { key: "signage", label: "Confirm required signage is posted and legible", category: "Safety", required: true },
  { key: "hook", label: "Confirm life hook and ring are present", category: "Safety", required: true },
  { key: "filter-clean", label: "Cartridge filter deep clean", category: "Equipment", required: false, billable: 95 },
];

// ---------------------------------------------------------------------------
// Dates and chemistry
// ---------------------------------------------------------------------------

/** Local midnight for `daysAgo` days back, plus an ETA offset, matching visit-generation. */
function visitAnchor(daysAgo: number, offsetMinutes: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return new Date(d.getTime() + offsetMinutes * 60 * 1000);
}

/** ISO weekday (Mon=1 .. Sun=7) of a date, the convention RecurringRoute.dayOfWeek uses. */
function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Turns either form of weekday spec into actual ISO weekdays.
 *
 * "semiweekly-including-today" is twice a week, today plus three days later. It has to include
 * today so a reviewer who opens the app finds a scheduled stop rather than a finished day, and it
 * has to be twice rather than once a week because at a weekly cadence a pool losing 10% of its
 * chlorine a day needs a top-up at every single visit -- which leaves lib/chlorine-demand.ts no
 * undosed interval to measure. See the dose trigger in simulateHistory.
 */
function resolveWeekdays(spec: number[] | "semiweekly-including-today"): number[] {
  if (Array.isArray(spec)) return spec;
  const today = isoWeekday(new Date());
  return [today, ((today + 3 - 1) % 7) + 1];
}

/**
 * How many days back the most recent `count` occurrences of `weekday` fall, newest first.
 *
 * Today counts as the most recent occurrence when it matches, which is what puts a SCHEDULED
 * stop on the technician's screen today rather than making the demo's "today" always empty for
 * the properties that are not on all seven days.
 */
function recentWeekdayOffsets(weekday: number, count: number): number[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const back = (isoWeekday(today) - weekday + 7) % 7;
  return Array.from({ length: count }, (_, i) => back + i * 7);
}

/** How many weeks of service history every body carries. Twelve is the smallest number that
 * leaves a slow pool several measurable intervals AFTER the dosed ones are discarded, which is
 * what the Smart dosing readiness page needs to show anything but zeroes. */
const HISTORY_WEEKS = 12;

/**
 * A deterministic number in [0,1) from a string. Not cryptographic and not meant to be -- it
 * exists so the demo's jitter is reproducible: re-running the seeder must refresh the dates
 * without quietly rewriting what every reading said, or the month-over-month charts change shape
 * every time somebody runs it.
 */
function hashUnit(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join(":");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Nevada's seeded bands, which every reading below is kept inside. pH 7.0-7.8, FC 2-10 ppm,
 * alkalinity 60-180 ppm, CYA 30-50 ppm. A log sheet full of out-of-range chips is a bad
 * screenshot and a worse first impression -- the point of the page is that the record is
 * complete, not that the pool is in trouble. */
const FC_POOL_FLOOR = 2.0;
/** Nevada asks more of a spa than of a pool, and the simulated technician has to know that or
 * every spa in the demo logs a reading its own state calls non-compliant. */
const FC_SPA_FLOOR = 3.0;
const FC_TARGET = 5.0;
const FC_CEILING = 8.0;

type SimulatedVisit = {
  daysAgo: number;
  reading: {
    ph: number;
    freeChlorinePpm: number;
    totalChlorinePpm: number;
    alkalinityPpm: number;
    cyanuricAcidPpm: number;
    temperatureF: number;
    pumpPressurePsi: number;
    vacGaugeReading: number;
    filterPressurePsi: number;
    flowMeterGpm: number;
  };
  doses: { chemicalKey: string; quantity: number }[];
  techNotes: string;
};

/**
 * Twelve weeks of readings and doses for one body, simulated forward from its own decay constant.
 *
 * This is the part that makes the demo data worth anything. The obvious way to fill a history is
 * to write plausible-looking numbers into every row, and the result is a dataset that contradicts
 * the product sitting on top of it: free chlorine that wanders at random cannot be fitted by
 * lib/chlorine-demand.ts, so every pool comes out with the same default rate and the Smart dosing
 * readiness page reports that none of sixteen pools can measure itself.
 *
 * So chlorine is simulated instead of invented. Each visit the water loses e^(-k*7) of what it
 * had, the technician doses when the reading is low enough that it will not survive another week,
 * and the dose is sized by the same arithmetic the calculator uses. The consequences fall out on
 * their own and they are the realistic ones:
 *
 *  - A slow indoor pool (k=0.045) is dosed roughly every third visit, so most of its intervals
 *    open on a visit where nothing was added and ARE measurable. It reports a measured rate.
 *  - A resort spa (k=0.33) needs chlorine every single visit, so every interval opens on a dosed
 *    visit and NONE of them are measurable. It reports the account default -- correctly, and this
 *    is the case the readiness page exists to be honest about.
 *
 * pH and alkalinity drift upward instead, the way Las Vegas fill water actually behaves, and earn
 * an acid dose when they cross. CYA creeps on the tablet-fed bodies because trichlor carries
 * stabiliser in with it, which is the real mechanism and shows up on the dosing card's own CYA
 * headroom warning.
 */
function simulateHistory(body: DemoBody, weekdayOffsets: number[]): SimulatedVisit[] {
  // Oldest first, because chlorine on this visit depends on what was left after the last one.
  const offsets = [...weekdayOffsets].sort((a, b) => b - a);
  const out: SimulatedVisit[] = [];

  // An automation body is held near target by its own equipment rather than drifting between
  // visits -- that is the whole point of the pump, and the reason the dosing calculator stopped
  // projecting a carry dose for these. So it starts at target and stays near it.
  const automated = body.feed === ChlorineFeedMechanism.LIQUID_FEED_PUMP;

  const floor = body.type === BodyOfWaterType.SPA ? FC_SPA_FLOOR : FC_POOL_FLOOR;

  let fc = automated ? FC_TARGET : FC_TARGET * 0.9;
  let ph = 7.3;
  let alkalinity = 95;
  let cya = body.feed === ChlorineFeedMechanism.TABLET_FEEDER || body.feed === ChlorineFeedMechanism.TABLET_FLOATER ? 34 : 38;

  for (let i = 0; i < offsets.length; i++) {
    const daysAgo = offsets[i];
    const seed = `${body.key}:${daysAgo}`;

    if (i > 0) {
      const gap = offsets[i - 1] - daysAgo;
      if (automated) {
        // Holds its level, with the small wander a metering pump actually leaves.
        fc = FC_TARGET + (hashUnit(seed, "hold") - 0.5) * 1.6;
      } else {
        // The decay law itself, plus +-15% on the rate for weather and bather load. Scatter
        // within a single pool is about 70% of its own mean in the real data; 15% here keeps the
        // demo legible while still making the measured median land near `k` rather than on it.
        const jitter = 0.85 + hashUnit(seed, "k") * 0.3;
        fc = fc * Math.exp(-body.k * jitter * gap);
      }
      // pH climbs on its own: Las Vegas fill water is hard and alkaline, and aeration drives CO2
      // off, which is why acid is the chemical this whole region buys by the drum.
      ph = ph + 0.07 + hashUnit(seed, "ph") * 0.06;
      alkalinity = alkalinity + 2 + Math.round(hashUnit(seed, "alk") * 4);
      // Cyanuric acid LEAVES a hand-dosed body -- splash-out, backwash, the water a filter clean
      // takes with it -- and nothing puts it back. That is what earns a stabiliser dose below,
      // and it is the opposite of what happens on a trichlor body, where every puck adds more.
      if (body.feed === ChlorineFeedMechanism.MANUAL || body.feed === ChlorineFeedMechanism.LIQUID_FEED_PUMP) {
        cya = cya - 0.4 - hashUnit(seed, "cyaloss") * 0.9;
      }
      if (body.feed === ChlorineFeedMechanism.TABLET_FEEDER || body.feed === ChlorineFeedMechanism.TABLET_FLOATER) {
        // Trichlor carries stabiliser in with it, so CYA climbs on its own here -- the real
        // mechanism, and the reason the dosing card warns about headroom on these bodies. It is
        // turned back at 46 rather than being allowed to top out, because the only fix is a
        // partial drain and refill and that is what an operator actually does before it crosses
        // Nevada's 50 ppm maximum. Letting it drift past would put a permanent out-of-range chip
        // on the demo's tablet pools, which is the opposite of what these screens are for.
        cya = cya > 46 ? 34 : cya + 0.6 + hashUnit(seed, "cya") * 0.8;
      }
    }

    // What the technician measures, to the precision a test kit actually gives.
    const measuredFc = Math.max(0.2, Math.round(fc * 10) / 10);
    const doses: SimulatedVisit["doses"] = [];
    const notes: string[] = [];

    // CHLORINE, dosed THE WAY A TECHNICIAN ACTUALLY DOSES: in reaction to the reading in front
    // of them, not to a projection of next Friday.
    //
    // This started out as the projection -- dose whenever the water will not hold the floor
    // until the next visit, which is floor * e^(k*gap), the figure projectCarryTarget computes.
    // It is the correct thing to do and it is not what happens, and simulating it produced a
    // demo in which 14 of 15 pools could not measure their own demand: the trigger fires at
    // every visit on any pool losing more than about 7% a day, every interval therefore opens on
    // a dosed visit, and lib/chlorine-demand.ts has nothing left to measure.
    //
    // That is not a flaw in the simulation. It is the finding the carry projection exists because
    // of, reproduced: dosing to the middle of the band and coming back in a week does not hold a
    // thirsty pool, and on this org's real history a pool the calculator told somebody to
    // chlorinate came back under the minimum 46.4% of the time. So the simulated technician does
    // what the real ones did -- tops up when the reading looks low NOW, to the middle of the band
    // -- and the demo inherits the real consequence: the pools serviced twice a week hold their
    // chlorine well enough to leave measurable gaps, and the thirsty spas on a weekly visit do
    // not and show up on the readiness page as unmeasurable. Both halves of that are true of the
    // real data and both are worth a prospect seeing.
    // Topped up with a margin above the floor rather than at it, and aimed high enough to cover
    // about four days. A technician who waits until the reading is AT the minimum leaves a pool
    // that is under it by the next visit, which is the failure the carry projection exists to
    // fix -- but a demo in which a quarter of all readings are non-compliant is not showing the
    // product, it is showing a company that cannot keep up. The one body left deliberately
    // beyond rescue is Silver Mesa's Deck Spa; see its own k.
    // The margin is wider on a spa than on a pool, which is what a technician actually does: a
    // 1,400-gallon spa at 104F can cross its minimum in a day, and it has the higher minimum to
    // begin with. On a pool the same caution would mean topping up at every visit, which costs
    // the demo its measurable intervals for no gain in compliance.
    const doseTrigger = floor + (body.type === BodyOfWaterType.SPA ? 1.2 : 0.7);
    if (!automated && measuredFc < doseTrigger) {
      const topUpTo = Math.min(Math.max(FC_TARGET, floor * Math.exp(body.k * 4)), FC_CEILING);
      const deltaPpm = topUpTo - measuredFc;
      if (body.feed === ChlorineFeedMechanism.TABLET_FEEDER || body.feed === ChlorineFeedMechanism.TABLET_FLOATER) {
        // 1.48 oz of trichlor per ppm per 10k gal, and a 3" puck is 8 oz.
        const tablets = Math.max(1, Math.round((1.48 * deltaPpm * (body.gallons / 10000)) / 8));
        doses.push({ chemicalKey: "tablets", quantity: tablets });
        notes.push(`Loaded ${tablets} ${tablets === 1 ? "tab" : "tabs"} in the feeder.`);
      } else {
        // 10.7 fl oz of 12% per ppm per 10k gal, billed in gallons.
        const gallonsDosed = Math.max(0.25, Math.round(((10.7 * deltaPpm * (body.gallons / 10000)) / 128) * 4) / 4);
        doses.push({ chemicalKey: "liquid-chlorine", quantity: gallonsDosed });
        notes.push("Chlorinated by hand.");
      }
      fc = topUpTo;
    } else if (automated) {
      // A barrel refill rather than a dose into the water, which is exactly the confusion this
      // demo should contain honestly: it is a real cost and a real line on the invoice, and it
      // is logged on roughly one visit in three because that is how often a tank runs down.
      if (hashUnit(seed, "refill") < 0.34) {
        doses.push({ chemicalKey: "liquid-chlorine", quantity: 15 });
        notes.push("Topped up the chlorine tank.");
      }
      fc = measuredFc;
    } else {
      fc = measuredFc;
    }

    // ACID, when pH has drifted past where acid starts going in (PH_ACID_CEILING is 7.6).
    //
    // Muriatic acid lowers TOTAL ALKALINITY as well as pH -- one addition, two effects, which is
    // the real reason the Dosing Card warns to settle alkalinity before chasing pH. Modelling
    // that is what eventually pulls alkalinity below its minimum and earns a bicarbonate dose,
    // and it occasionally overshoots pH downward, which is the only thing in a Las Vegas pool
    // that ever calls for soda ash.
    const measuredPh = Math.round(Math.min(ph, 7.9) * 100) / 100;
    if (measuredPh > 7.6) {
      const acidGal = Math.max(0.25, Math.round(((9.16 * (measuredPh - 7.5) * 10 * (body.gallons / 10000)) / 128) * 4) / 4);
      doses.push({ chemicalKey: "muriatic-acid", quantity: acidGal });
      notes.push("Acid added, pH was climbing.");
      const overshot = hashUnit(seed, "overshoot") < 0.12;
      ph = overshot ? 7.1 : 7.45;
      alkalinity = alkalinity - 9 - hashUnit(seed, "alkdrop") * 7;
      if (overshot) notes.push("Went a little past on the acid — watch pH next visit.");
    } else if (measuredPh < 7.2) {
      const lbs = Math.max(1, Math.round((5.13 * (7.4 - measuredPh) * 10 * (body.gallons / 10000)) / 16));
      doses.push({ chemicalKey: "soda-ash", quantity: lbs });
      notes.push("Soda ash to bring pH back up.");
      ph = 7.4;
    }

    // ALKALINITY. Above 150 the correction is more of the same acid, so nothing new is logged --
    // it is dilution and patience. Below 80 it needs bicarbonate, which is a product in its own
    // right and a real line on the invoice.
    const measuredAlk = Math.max(62, Math.min(Math.round(alkalinity), 175));
    if (measuredAlk > 150) {
      alkalinity = 118;
    } else if (measuredAlk < 85) {
      const lbs = Math.max(1, Math.round((2.24 * (100 - measuredAlk) * (body.gallons / 10000)) / 16));
      doses.push({ chemicalKey: "bicarb", quantity: lbs });
      notes.push("Alkalinity was low, added bicarb.");
      alkalinity = 102;
    }

    // STABILISER, where nothing brings cyanuric acid in on its own. Never on a tablet body:
    // trichlor already carries it, and adding more is how a pool ends up locked up at 60 ppm.
    const measuredCya = Math.max(28, Math.min(Math.round(cya), 48));
    const tabletFed =
      body.feed === ChlorineFeedMechanism.TABLET_FEEDER || body.feed === ChlorineFeedMechanism.TABLET_FLOATER;
    if (measuredCya < 32 && !tabletFed) {
      doses.push({ chemicalKey: "stabilizer", quantity: Math.max(1, Math.round((1.328 * 12 * (body.gallons / 10000)) / 16)) });
      notes.push("Stabiliser added, CYA had drifted down.");
      cya = 44;
    }

    // SHOCK. Combined chlorine -- what is left once the free chlorine has done its job -- builds
    // on a busy pool and is what makes water smell of chlorine while testing low on it. The fix
    // is a breakpoint dose of cal-hypo, not more of the usual. On a pool only: a spa is drained
    // and refilled instead, which is cheaper than shocking 1,400 gallons.
    // Threshold set so this fires on roughly one pool visit in twelve. Not a cosmetic choice:
    // cal-hypo matches CHLORINE_PRODUCT_NAME, so lib/chlorine-demand.ts counts a shock as
    // chlorine added and the interval it opens stops being measurable. Shocking every fifth
    // visit would quietly take the demo's measured-demand coverage apart.
    const combined = hashUnit(seed, "combined") * 0.7;
    const needsShock = combined > 0.64 && body.type === BodyOfWaterType.POOL;
    if (needsShock) {
      const lbs = Math.max(1, Math.round((1.77 * 10 * (body.gallons / 10000)) / 16));
      doses.push({ chemicalKey: "cal-hypo", quantity: lbs });
      notes.push("Shocked — combined chlorine was up.");
    }

    // One algaecide and one filter clean across the whole history, on a single body, so those
    // line items exist somewhere without appearing on every invoice.
    if (body.key === "vln-pool" && i === 4) {
      doses.push({ chemicalKey: "algaecide", quantity: 1 });
      notes.push("Algaecide after the dust storm.");
    }

    out.push({
      daysAgo,
      reading: {
        ph: measuredPh,
        freeChlorinePpm: measuredFc,
        // Free chlorine plus the combined fraction, so the pair is consistent with the shock
        // decision above rather than being a second independent invention.
        totalChlorinePpm: Math.round((measuredFc + 0.15 + combined) * 10) / 10,
        alkalinityPpm: measuredAlk,
        cyanuricAcidPpm: Math.max(30, measuredCya),
        temperatureF: body.type === BodyOfWaterType.SPA ? 100 + Math.round(hashUnit(seed, "t") * 4) : 78 + Math.round(hashUnit(seed, "t") * 8),
        pumpPressurePsi: 24 + Math.round(hashUnit(seed, "pp") * 5),
        // NEGATIVE: a vacuum gauge reads below atmospheric, and lib/reading-bounds.ts bounds this
        // field to -30..0. Positive values are rejected by the form with "this didn't save",
        // which is exactly what a store screenshot caught.
        vacGaugeReading: -(4 + Math.round(hashUnit(seed, "vg") * 5)),
        filterPressurePsi: 16 + Math.round(hashUnit(seed, "fp") * 6),
        flowMeterGpm: body.minFlowGpm != null ? body.minFlowGpm + 4 + Math.round(hashUnit(seed, "flow") * 30) : 60 + Math.round(hashUnit(seed, "flow") * 20),
      },
      doses,
      techNotes: notes.length ? notes.join(" ") : "Water clear, equipment running normally.",
    });
  }

  return out;
}

/**
 * The two bodies of water that carry a full month of DAILY readings.
 *
 * A commercial pool in Nevada is tested daily, but a service company does not visit daily -- the
 * days in between are logged by the property's own CPO. ServiceVisit.logOnlyRecord is exactly that
 * row: a reading for the compliance record with nobody dispatched, kept out of pay, customer
 * summary emails and "completed this week", and deliberately counted by lib/reading-rows.ts.
 *
 * Two rather than one: the Desert Palms Main Pool is where the store screenshots and the placard
 * QR code point, and a hotel pool on a different customer shows that the inspector log is a
 * per-body record rather than something special about one screenshot. Not all sixteen, because
 * every one of them means inventing a plausible daily history, which is more fiction than the
 * demo needs and makes the seeder slow.
 */
const DAILY_LOG_BODY_KEYS = new Set(["dp-pool", "smr-pool"]);

/**
 * Deterministic readings for one day of the month, all inside Nevada's bands.
 *
 * Arithmetic rather than random so re-running the seeder reproduces the same month instead of
 * quietly rewriting history, and so the values visibly move day to day instead of flatlining.
 */
function dailyLogReading(day: number, body: DemoBody) {
  return {
    ph: Number((7.25 + (day % 5) * 0.1).toFixed(2)),
    freeChlorinePpm: Number((2.4 + ((day * 3) % 7) * 0.15).toFixed(2)),
    totalChlorinePpm: Number((2.6 + ((day * 3) % 7) * 0.15).toFixed(2)),
    alkalinityPpm: 85 + (day % 6) * 5,
    cyanuricAcidPpm: 40 + (day % 3) * 5,
    temperatureF: 80 + (day % 7),
    // All four gauges: Nevada's ruleset carries EquipmentReadingRequirement rows for
    // PUMP_PRESSURE, PUMP_VACUUM, FILTER_PRESSURE and FLOW_METER, so the inspector log has a
    // column for each and leaving two null dashed out a fifth of the sheet.
    pumpPressurePsi: 25 + (day % 4),
    vacGaugeReading: -(5 + (day % 4)),
    filterPressurePsi: 17 + (day % 5),
    flowMeterGpm: (body.minFlowGpm ?? 256) + (day % 5) * 8,
  };
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

  // Matched by NAME, not id: catalog ids are per-database cuids (see DemoChemical.catalogName).
  const catalog = await prisma.chemicalProductCatalog.findMany({
    select: { id: true, name: true, chemicalType: true },
  });
  const catalogByName = new Map(catalog.map((c) => [c.name, c]));
  const missingCatalog = CHEMICALS.filter((c) => c.catalogName && !catalogByName.has(c.catalogName));
  if (missingCatalog.length) {
    console.warn(
      `[demo-seed] WARNING: ${missingCatalog.length} chemical(s) name no row in ChemicalProductCatalog ` +
        `(${missingCatalog.map((c) => c.catalogName).join(", ")}) — the Dosing Card will have nothing to offer for them.`,
    );
  }

  const bodyCount = ALL_BODIES.length;
  note(`organization ${ORG_ID} "Desert Oasis Pool Service" (NV, COMPED)`);
  for (const p of PEOPLE) note(`${p.role.toLowerCase()} login ${p.email} (${p.name})`);
  note(`${CUSTOMERS.length} commercial customers`);
  note(`${ALL_PROPERTIES.length} properties carrying ${bodyCount} bodies of water`);
  note(`${CHEMICALS.length} chemical products, priced, with the dosing catalog wired to them`);
  note(`${CHECKLIST.length} service checklist items`);
  note("seven daily routes for the review technician, plus weekday routes for the other two");
  note(`${HISTORY_WEEKS} weeks of completed visits per body, with readings and chemical doses`);
  note(`a venue pay rate for every body of water`);
  note(`a daily compliance log for ${DAILY_LOG_BODY_KEYS.size} bodies, 1st of this month to today`);

  if (!APPLY) {
    console.log(
      `\n[demo-seed] Dry run complete — ${plan.length} things would be written. To write them:\n` +
        `  DEMO_ADMIN_PASSWORD=... ${rerunWithApply()}\n`,
    );
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
      // ON for the demo, unlike the product default. The demo exists to show what the app can
      // do, and the carry projection is the half of the dosing card that is not obvious from a
      // screenshot -- and this org's simulated history is deep enough to earn it honestly, which
      // is the condition the settings page asks an operator to check.
      smartDosingEnabled: true,
      trackCalciumHardness: true,
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
      smartDosingEnabled: true,
      trackCalciumHardness: true,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to create logins.");
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const users = new Map<string, { id: string; email: string; name: string }>();
  for (const person of PEOPLE) {
    const authUserId = await resolveAuthUserId(supabaseAdmin, person.email, password!);
    const user = await prisma.user.upsert({
      where: { id: id("user", person.key) },
      create: {
        id: id("user", person.key),
        organizationId: org.id,
        authUserId,
        email: person.email,
        name: person.name,
        role: person.role,
        phone: person.phone,
        active: true,
      },
      update: { authUserId, email: person.email, name: person.name, role: person.role, phone: person.phone, active: true },
    });
    users.set(person.key, { id: user.id, email: user.email, name: person.name });
    console.log(`  + ${person.role} ${person.email}`);
  }
  const adminUser = users.get("admin")!;

  // -------------------------------------------------------------------------
  // Chemicals, and the dosing catalog pointed at them
  // -------------------------------------------------------------------------

  const chemicalIds = new Map<string, string>();
  for (const chem of CHEMICALS) {
    const product = await prisma.chemicalProduct.upsert({
      where: { id: id("chem", chem.key) },
      create: {
        id: id("chem", chem.key),
        organizationId: org.id,
        name: chem.name,
        unit: chem.unit,
        costPerUnit: chem.cost,
        chargePerUnit: chem.charge,
        active: true,
      },
      update: { name: chem.name, unit: chem.unit, costPerUnit: chem.cost, chargePerUnit: chem.charge, active: true },
    });
    chemicalIds.set(chem.key, product.id);

    // The dosing-catalog side. Without an enabled OrgChemicalProductSetting the Dosing Card has
    // no product to recommend and prints "no enabled primary product configured" instead of a
    // dose -- which is what the demo showed before this existed.
    const catalogRow = chem.catalogName ? catalogByName.get(chem.catalogName) : undefined;
    if (!catalogRow) continue;
    await prisma.orgChemicalProductSetting.upsert({
      where: { organizationId_catalogProductId: { organizationId: org.id, catalogProductId: catalogRow.id } },
      create: {
        id: id("dosing", chem.key),
        organizationId: org.id,
        catalogProductId: catalogRow.id,
        isEnabled: true,
        isPrimary: chem.primary,
        price: chem.charge,
        linkedBillingProductId: product.id,
      },
      update: { isEnabled: true, isPrimary: chem.primary, price: chem.charge, linkedBillingProductId: product.id },
    });
  }
  console.log(`  + ${CHEMICALS.length} chemical products, dosing catalog wired`);

  for (const [index, item] of CHECKLIST.entries()) {
    await prisma.checklistItemDefinition.upsert({
      where: { id: id("checklist", item.key) },
      create: {
        id: id("checklist", item.key),
        organizationId: org.id,
        label: item.label,
        category: item.category,
        sortOrder: index,
        required: item.required,
        billable: item.billable != null,
        chargeAmount: item.billable ?? null,
        active: true,
      },
      update: {
        label: item.label,
        category: item.category,
        sortOrder: index,
        required: item.required,
        billable: item.billable != null,
        chargeAmount: item.billable ?? null,
        active: true,
      },
    });
  }
  console.log(`  + ${CHECKLIST.length} checklist items`);

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  /**
   * A route on EVERY day of the week for the review technician, not just the one the seeder
   * happened to run on.
   *
   * This used to be a single route pinned to `new Date().getDay()`, which meant the demo
   * organisation had a working schedule on exactly one weekday. lib/visit-generation.ts only
   * generates visits from routes whose dayOfWeek matches the day being viewed, so on the other
   * six the technician's day came up empty -- and an empty day is not merely a blank screen:
   * isDayFullyDone() is an .every() over no stops, so it reports the day finished, the location
   * watcher never starts and the background-location disclosure never appears.
   *
   * That is the single most dangerous thing that can happen to this app in review. The Play
   * declaration claims arrivals are logged automatically in the background; a reviewer who opens
   * the app on the wrong weekday sees a product that does nothing of the sort. It already cost a
   * re-shoot of the permissions video on 2026-10-29. Seven routes cost nothing and remove the
   * dependency on which day anybody happens to look.
   *
   * THE OTHER TECHNICIANS ARE ON ORDINARY WEEKDAY ROUTES, which is the realistic shape and is
   * safe precisely because the review login is not one of them: whichever day a reviewer opens,
   * Marco has a full day. Priya and Dale having a Tuesday and not a Sunday is what makes the
   * admin schedule look like a real company instead of three identical columns.
   */
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Deactivated rather than deleted: ServiceVisit.recurringStopId is onDelete SetNull, so removing
  // the old route's stops would quietly unlink real visits that were generated from them. Visit
  // generation filters on active, so this is enough to stop the legacy route doubling up a day.
  await prisma.recurringRoute.updateMany({ where: { id: id("route") }, data: { active: false } });

  /** routeId by (techKey, weekday), created on demand so a weekday nobody works has no route. */
  const routeIds = new Map<string, string>();
  const routeKey = (techKey: string, weekday: number) => `${techKey}:${weekday}`;

  for (const { property } of ALL_PROPERTIES) {
    for (const weekday of resolveWeekdays(property.routeWeekdays)) {
      const key = routeKey(property.techKey, weekday);
      if (routeIds.has(key)) continue;
      const tech = users.get(property.techKey);
      if (!tech) throw new Error(`Property ${property.key} names unknown technician ${property.techKey}`);
      const route = await prisma.recurringRoute.upsert({
        where: { id: id("route", property.techKey, `d${weekday}`) },
        create: {
          id: id("route", property.techKey, `d${weekday}`),
          organizationId: org.id,
          name: `${DAY_NAMES[weekday - 1]} — ${tech.name.split(" ")[0]}`,
          technicianId: tech.id,
          frequency: "WEEKLY",
          dayOfWeek: weekday,
          active: true,
        },
        update: {
          name: `${DAY_NAMES[weekday - 1]} — ${tech.name.split(" ")[0]}`,
          technicianId: tech.id,
          active: true,
          dayOfWeek: weekday,
        },
      });
      routeIds.set(key, route.id);
    }
  }
  console.log(`  + ${routeIds.size} recurring routes across ${new Set(ALL_PROPERTIES.map((p) => p.property.techKey)).size} technicians`);

  // -------------------------------------------------------------------------
  // Properties, bodies, stops, history
  // -------------------------------------------------------------------------

  /** Stop ordering and arrival times run per ROUTE, not globally: two technicians both start at
   * 07:00, and a shared counter would have Dale's first stop scheduled for the afternoon. */
  const routeSortOrder = new Map<string, number>();
  const routeEtaOffset = new Map<string, number>();
  const nextSlot = (key: string) => {
    const sortOrder = routeSortOrder.get(key) ?? 0;
    const eta = routeEtaOffset.get(key) ?? 7 * 60; // first stop anchored at 07:00 local
    routeSortOrder.set(key, sortOrder + 1);
    routeEtaOffset.set(key, eta + 25);
    return { sortOrder, eta };
  };

  /** Every stop id this run writes. Anything else in the org is removed at the end -- see the
   * cleanup below for why "not in ownedRouteIds" was not a strong enough test. */
  const ownedStopIds: string[] = [];
  /** Same idea for customers. The demo had one customer owning all three properties before it
   * had six owning eleven, and that original row survived the change -- empty, since the
   * properties were repointed, but still counted on the customer list. */
  const ownedCustomerIds: string[] = [];

  // Resolved after every body exists, since a bundled pay rate names another body.
  const bodyIdByKey = new Map<string, string>();
  const payRatePlan: { bodyKey: string; amount: number; bundledInto?: string }[] = [];

  let visitsWritten = 0;
  let dosesWritten = 0;

  for (const { customer: cust, property: venue } of ALL_PROPERTIES) {
    const customer = await prisma.customer.upsert({
      where: { id: id("customer", cust.key) },
      create: { id: id("customer", cust.key), organizationId: org.id, name: cust.name },
      update: { name: cust.name },
    });
    if (!ownedCustomerIds.includes(customer.id)) ownedCustomerIds.push(customer.id);

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
        managerName: cust.managerName,
        managerEmail: cust.managerEmail,
        managerPhone: cust.managerPhone,
      },
      update: {
        customerId: customer.id,
        name: venue.propertyName,
        addressLine1: venue.address,
        city: venue.city,
        propertyType: "COMMERCIAL",
        latitude: venue.lat,
        longitude: venue.lng,
        managerName: cust.managerName,
        managerEmail: cust.managerEmail,
        managerPhone: cust.managerPhone,
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
          chlorineFeedMechanism: b.feed,
          minimumRequiredFlowGpm: b.minFlowGpm,
          maximumFilterFlowGpm: b.maxFlowGpm,
        },
        update: {
          name: b.name,
          volumeGallons: b.gallons,
          publicSlug: `demo-${b.key}`,
          serviceGroup: b.group,
          chlorineFeedMechanism: b.feed,
          minimumRequiredFlowGpm: b.minFlowGpm,
          maximumFilterFlowGpm: b.maxFlowGpm,
        },
      });
      bodyIdByKey.set(b.key, body.id);
      payRatePlan.push({ bodyKey: b.key, amount: b.payRate, bundledInto: b.bundledInto });

      // propertyId is required and separate from bodyOfWaterId -- a stop belongs to a
      // property and optionally names one venue on it.
      //
      // One stop per (weekday this property is served, body), so the same venue appears at the
      // same position and time on each of its own days.
      const stopIdByWeekday = new Map<number, string>();
      for (const weekday of resolveWeekdays(venue.routeWeekdays)) {
        const key = routeKey(venue.techKey, weekday);
        const routeId = routeIds.get(key)!;
        // The slot is taken once per (route, body) and reused, so re-running does not march the
        // arrival times later and later down the day.
        const slotKey = `${key}:${b.key}`;
        const slot = routeSortOrder.has(slotKey)
          ? { sortOrder: routeSortOrder.get(slotKey)!, eta: routeEtaOffset.get(slotKey)! }
          : (() => {
              const s = nextSlot(key);
              routeSortOrder.set(slotKey, s.sortOrder);
              routeEtaOffset.set(slotKey, s.eta);
              return s;
            })();

        const stop = await prisma.recurringStop.upsert({
          where: { id: id("stop", venue.techKey, `d${weekday}`, b.key) },
          create: {
            id: id("stop", venue.techKey, `d${weekday}`, b.key),
            routeId,
            propertyId: property.id,
            bodyOfWaterId: body.id,
            sortOrder: slot.sortOrder,
            etaOffsetMinutes: slot.eta,
          },
          update: { routeId, propertyId: property.id, sortOrder: slot.sortOrder, etaOffsetMinutes: slot.eta },
        });
        stopIdByWeekday.set(weekday, stop.id);
        ownedStopIds.push(stop.id);
      }

      /**
       * Twelve weeks of history on this body's own service days.
       *
       * Dates come from the weekdays this property is actually served, so a Tuesday/Friday
       * property has Tuesday and Friday visits rather than a visit every seven days from
       * whenever the seeder last ran. That matters for more than tidiness: the gap between
       * consecutive readings is what lib/chlorine-demand.ts measures a decay rate over, and a
       * body whose gaps alternate 3 and 4 days is a different pool from one on a flat 7.
       */
      const serviceWeekdays = resolveWeekdays(venue.serviceWeekdays ?? venue.routeWeekdays);
      const offsets = Array.from(
        new Set(serviceWeekdays.flatMap((weekday) => recentWeekdayOffsets(weekday, HISTORY_WEEKS))),
      ).sort((a, b2) => b2 - a);
      const history = simulateHistory(b, offsets);

      // Scoped to ids this body owns, so a re-run replaces its own history rather than layering
      // a second copy underneath it. deleteMany by prefix rather than by id list because the
      // number of visits per body changes with HISTORY_WEEKS and the weekday count, and a stale
      // row from a longer previous run would otherwise survive forever.
      await prisma.serviceVisit.deleteMany({
        where: { id: { startsWith: `${DEMO_PREFIX}visit-${b.key}-svc-` } },
      });
      // The hand-numbered ids this block replaces (`visit-<body>-0`, `-7`, `-14`).
      await prisma.serviceVisit.deleteMany({
        where: { id: { in: [0, 7, 14].map((d) => `${DEMO_PREFIX}visit-${b.key}-${d}`) } },
      });

      for (const sim of history) {
        const anchorDate = visitAnchor(sim.daysAgo, 0);
        const weekday = isoWeekday(anchorDate);
        const stopId = stopIdByWeekday.get(weekday) ?? null;
        const slotKey = `${routeKey(venue.techKey, weekday)}:${b.key}`;
        const eta = routeEtaOffset.get(slotKey) ?? 7 * 60;
        const anchor = visitAnchor(sim.daysAgo, eta);
        const isToday = sim.daysAgo === 0;
        const completedAt = new Date(anchor.getTime() + 40 * 60 * 1000);
        const visitId = id("visit", b.key, "svc", String(sim.daysAgo).padStart(3, "0"));

        await prisma.serviceVisit.create({
          data: {
            id: visitId,
            organizationId: org.id,
            propertyId: property.id,
            bodyOfWaterId: body.id,
            technicianId: users.get(venue.techKey)!.id,
            // LINKED to the stop on the route for that weekday, which the previous version left
            // null. lib/visit-generation.ts dedupes today's generation on recurringStopId, so an
            // unlinked SCHEDULED visit for today got a second, generated copy alongside it and
            // the review technician's day showed every stop twice.
            recurringStopId: stopId,
            scheduledStart: anchor,
            routeSequence: routeSortOrder.get(slotKey) ?? 0,
            ...(isToday
              ? {
                  status: VisitStatus.SCHEDULED,
                  // The Main Pool arrives with today's readings already typed in, and ONLY the
                  // Main Pool. Two things need that. The store screenshots of the reading screen
                  // are taken here, and an empty form shows neither the numbers nor the "last
                  // reading" strip comparing them to the previous service -- which is half of
                  // what that screen is for. Every other stop stays untouched so the Play
                  // permissions video still records a genuinely fresh day.
                  ...(b.key === "dp-pool"
                    ? { reading: { create: { capturedAt: anchor, ...sim.reading } } }
                    : {}),
                }
              : {
                  status: VisitStatus.COMPLETED,
                  serviceComplete: true,
                  startedAt: anchor,
                  completedAt,
                  techNotes: sim.techNotes,
                  reading: { create: { capturedAt: completedAt, ...sim.reading } },
                  ...(sim.doses.length
                    ? {
                        doses: {
                          create: sim.doses.map((d) => {
                            const chem = CHEMICALS.find((c) => c.key === d.chemicalKey)!;
                            return {
                              chemicalProductId: chemicalIds.get(d.chemicalKey)!,
                              productName: chem.name,
                              quantity: d.quantity,
                              unit: chem.unit,
                              // Snapshotted, same as a real dose: the report must keep saying
                              // what this cost on the day even if the catalog price moves.
                              unitCost: chem.cost,
                              unitCharge: chem.charge,
                            };
                          }),
                        },
                      }
                    : {}),
                }),
          },
        });
        visitsWritten++;
        if (!isToday) dosesWritten += sim.doses.length;
      }

      /**
       * Every remaining day of the month, so the public inspector log is a complete sheet.
       *
       * Without this the log shows a dozen readings in a 31-row table and reads as a pool nobody
       * tests, which is the opposite of what the page is for. The days the loop above already
       * covers are skipped rather than doubled: two COMPLETED visits on one day would make the
       * header's visit count wrong, and getMonthlyReadingRows keeps only the later of them anyway.
       *
       * Future days are never written. A compliance log carrying tomorrow's reading is the single
       * fastest way to make an inspector distrust the whole record.
       *
       * Dates come from the machine's local clock, same as visitAnchor -- this is run from Las
       * Vegas, and introducing a timezone library here only for the seeder would be its own
       * source of drift.
       */
      if (DAILY_LOG_BODY_KEYS.has(b.key)) {
        const today = new Date();
        const year = today.getFullYear();
        const monthIndex = today.getMonth();
        const serviceDays = new Set(
          history
            .map((h) => visitAnchor(h.daysAgo, 0))
            .filter((d) => d.getFullYear() === year && d.getMonth() === monthIndex)
            .map((d) => d.getDate()),
        );

        const stamp = `${year}${String(monthIndex + 1).padStart(2, "0")}`;

        // Scoped to THIS month, so a re-run replaces the current sheet rather than layering a
        // second copy underneath it -- and so seeding in November does not delete October. A
        // month already logged is history the inspector page can still be asked for by its month
        // selector, and the demo is more convincing with more of it, not less.
        //
        // The second clause clears the hand-written backfill that preceded this block, which
        // numbered its ids by bare day and would otherwise duplicate every day of this month.
        await prisma.serviceVisit.deleteMany({
          where: {
            OR: [
              { id: { startsWith: `${DEMO_PREFIX}visit-${b.key}-log-${stamp}` } },
              {
                id: {
                  in: Array.from(
                    { length: 31 },
                    (_, i) => `${DEMO_PREFIX}visit-${b.key}-log-${String(i + 1).padStart(2, "0")}`,
                  ),
                },
              },
            ],
          },
        });
        let logged = 0;
        for (let day = 1; day <= today.getDate(); day++) {
          if (serviceDays.has(day)) continue;
          // 10:00 local: after the technician's 07:00 stop, so the previous-reading strip on
          // today's visit still compares against the last SERVICE visit rather than against a
          // logbook row recorded the same morning.
          const at = new Date(year, monthIndex, day, 10, 0, 0, 0);
          await prisma.serviceVisit.create({
            data: {
              id: id("visit", b.key, "log", `${stamp}${String(day).padStart(2, "0")}`),
              organizationId: org.id,
              propertyId: property.id,
              bodyOfWaterId: body.id,
              scheduledStart: at,
              routeSequence: 0,
              status: VisitStatus.COMPLETED,
              serviceComplete: true,
              completedAt: at,
              // No technicianId on purpose. The schedule page selects a day by technician, so a
              // null one keeps these off the route screen -- otherwise every logged day would
              // show up as an extra completed stop on the technician's own schedule.
              logOnlyRecord: true,
              reading: {
                create: {
                  capturedAt: at,
                  ...dailyLogReading(day, b),
                  backwashAt: day % 7 === 3 ? new Date(at.getTime() + 20 * 60 * 1000) : null,
                },
              },
            },
          });
          logged++;
        }
        console.log(`  + ${logged} daily compliance readings for ${b.name}`);
      }
    }
  }
  console.log(`  + ${visitsWritten} service visits with readings, ${dosesWritten} chemical doses`);

  // -------------------------------------------------------------------------
  // Pay rates
  // -------------------------------------------------------------------------

  /**
   * One rate per venue, effective from the start of the history so every visit in it is covered.
   *
   * A rate belongs to the VENUE rather than to a technician (see the VenuePayRate rename), which
   * is why a property changing hands between Priya and Dale does not change what the stop is
   * worth. A spa serviced on the same walk-up as its pool is BUNDLED: it carries no rate of its
   * own and names the body whose rate already covers it, so the earnings total does not pay twice
   * for one trip.
   */
  const effectiveDate = visitAnchor(HISTORY_WEEKS * 7 + 7, 0);
  for (const plan of payRatePlan) {
    const bodyId = bodyIdByKey.get(plan.bodyKey);
    if (!bodyId) continue;
    const bundledIntoId = plan.bundledInto ? bodyIdByKey.get(plan.bundledInto) ?? null : null;
    await prisma.venuePayRate.upsert({
      where: { id: id("payrate", plan.bodyKey) },
      create: {
        id: id("payrate", plan.bodyKey),
        organizationId: org.id,
        bodyOfWaterId: bodyId,
        rateAmount: plan.amount,
        isBundled: bundledIntoId != null,
        bundledIntoBodyOfWaterId: bundledIntoId,
        isActive: true,
        effectiveDate,
        createdByUserId: adminUser.id,
      },
      update: {
        rateAmount: plan.amount,
        isBundled: bundledIntoId != null,
        bundledIntoBodyOfWaterId: bundledIntoId,
        isActive: true,
        effectiveDate,
      },
    });
  }
  console.log(`  + ${payRatePlan.length} venue pay rates`);

  /**
   * Retire any route or stop in this organisation that this seeder does not own.
   *
   * Without this, anything created by hand in the demo org survives alongside the routes above --
   * and a second ACTIVE route on the same weekday makes visit generation produce the day twice,
   * because it dedupes per recurringStop and a duplicate stop is a different stop. Production had
   * exactly that: a hand-built Thursday route with a cuid id, invisible until it collided with
   * the seeded one.
   *
   * Routes are deactivated, not deleted, for the same reason as the legacy route above. Stops
   * ARE deleted, which is safe: ServiceVisit.recurringStopId is onDelete SetNull, so historical
   * visits keep their readings and simply stop claiming to come from a route that no longer
   * exists.
   *
   * STOPS ARE MATCHED AGAINST THE IDS THIS RUN ACTUALLY WROTE, not against the owned ROUTES,
   * which is the stronger test and the one that was needed. A stop's id carries its weekday, so
   * narrowing a property from seven service days to two leaves five stops behind whose route is
   * still perfectly owned -- and they are not inert. lib/dosing-calculator.ts resolves "days
   * until the next visit" from RecurringStop, so Sunridge's stale daily stops had the Courtyard
   * Spa's chlorine dose sized to last one day instead of three.
   */
  const ownedRouteIds = Array.from(routeIds.values());
  const retiredRoutes = await prisma.recurringRoute.updateMany({
    where: { organizationId: org.id, id: { notIn: ownedRouteIds }, active: true },
    data: { active: false },
  });
  const strayStops = await prisma.recurringStop.deleteMany({
    where: { route: { organizationId: org.id }, id: { notIn: ownedStopIds } },
  });
  if (retiredRoutes.count || strayStops.count) {
    console.log(`  + retired ${retiredRoutes.count} foreign route(s), removed ${strayStops.count} stray stop(s)`);
  }

  /**
   * Customers this seeder no longer owns.
   *
   * Only ones with no properties left are removed, and the rest are reported rather than deleted.
   * A customer still holding a property is either something created by hand in the demo org or a
   * sign that the repointing above did not happen -- and cascading a delete through a property
   * would take its bodies of water, their readings and their doses with it. That is never the
   * right thing for a script to decide on its own.
   */
  const strayCustomers = await prisma.customer.findMany({
    where: { organizationId: org.id, id: { notIn: ownedCustomerIds } },
    select: { id: true, name: true, _count: { select: { properties: true } } },
  });
  const empty = strayCustomers.filter((c) => c._count.properties === 0);
  const occupied = strayCustomers.filter((c) => c._count.properties > 0);
  if (empty.length) {
    await prisma.customer.deleteMany({ where: { id: { in: empty.map((c) => c.id) } } });
    console.log(`  + removed ${empty.length} empty customer(s) this seeder no longer owns`);
  }
  for (const c of occupied) {
    console.warn(`[demo-seed] NOTE: customer "${c.name}" is not owned by this script but still has ${c._count.properties} property(ies) — left alone.`);
  }

  console.log(`\n[demo-seed] Done. Sign in at /login as ${ADMIN_EMAIL}.`);
  console.log("[demo-seed] Password: the value of DEMO_ADMIN_PASSWORD (not printed).");
  console.log(`[demo-seed] Technician logins: ${PEOPLE.filter((p) => p.role === "TECHNICIAN").map((p) => p.email).join(", ")}\n`);
}

main()
  .catch((err) => {
    console.error("[demo-seed] FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
