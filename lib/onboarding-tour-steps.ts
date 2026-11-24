import type { TourStep } from "@/app/components/onboarding-tour";

export type { TourStep };

/**
 * Each role's tours are keyed by pathname (usePathname()'s exact value) except the
 * dynamic /dashboard/visits/[id] route, which the launcher special-cases separately
 * since a real visit id can't be a map key -- see VISIT_DETAIL_TOUR_STEPS below.
 *
 * A step whose target isn't on the page is dropped and the rest renumbered. Mark a step
 * `optional` when that absence is normal and permanent for some accounts (a warning
 * banner for a problem they don't have, a section residential-only orgs never see);
 * leave it off when the target is missing only because the org hasn't built anything
 * yet, which keeps the page unseen so the full tour runs again once it has content.
 */
export const ADMIN_TOURS: Record<string, TourStep[]> = {
  "/dashboard": [
    {
      target: "admin-quick-stats",
      title: "Your org at a glance",
      body: "Customers, property management companies, aquatic venues, and what's scheduled this week — a quick pulse check every time you land here.",
    },
    {
      target: "admin-week-progress",
      title: "Week progress",
      body: "How much of this week's stops are already done, updated live as your techs complete visits.",
    },
    {
      target: "admin-out-of-range",
      title: "Out-of-range readings",
      body: "Any commercial reading from the last 7 days that fell outside its ideal range shows up here first.",
    },
    {
      target: "admin-recent-activity",
      title: "Recent activity",
      body: "A running log of completed visits and new customers — click to expand it any time.",
    },
    {
      target: "chemicals-usage",
      title: "Chemical usage & billing",
      body: "How much of each chemical went into each property over a date range, for cost tracking or billing. Pick a range, then open the detail for the per-chemical breakdown.",
    },
  ],
  // Ordered top-to-bottom down the page rather than by importance, so the spotlight never
  // jumps back up past something it already covered.
  "/dashboard/routes": [
    {
      target: "routes-geocode",
      title: "Start by geocoding your properties",
      body: "Routing and the stop maps both need coordinates for every property. Run this once after you've added your customers — it's safe to re-run any time, since it skips properties that already have a location.",
    },
    {
      target: "routes-missing-coords",
      title: "Properties missing a map location",
      body: "Any property the address lookup couldn't place shows up here, with a link to drop its pin on a satellite map. Worth clearing — a property with no coordinates can't be mapped or auto-suggested to a route.",
      optional: true,
    },
    {
      target: "routes-missing-pins",
      title: "Venues without their own map pin",
      body: "A property has one location that every pool and spa on it shares, so a front pool and a back pool look like the same place. Pin each venue on satellite imagery here and routing knows where they actually are. Entirely optional — everything works without it.",
      optional: true,
    },
    {
      target: "routes-view-toggle",
      title: "List or Week",
      body: "List is where you build and edit a route's stops. Week lays all seven days out side by side so you can see how the work is spread across your techs — click any day there to come back here and edit it. The filters below apply to both.",
    },
    {
      target: "routes-add-form",
      title: "Add a route",
      body: "A route is one technician's day: pick the weekday, who runs it, and optionally the dates it starts and stops running — leave the end date blank to run indefinitely. Routes repeat weekly. Once it exists you'll set its stops and its stop limit on the route itself, just below.",
    },
    {
      target: "routes-stop-list",
      title: "Build the route's stops",
      body: "Add an aquatic venue, then drag stops into the order the tech will drive them — the map on the right updates as you go. The ETA offset is how many minutes after the day's start this stop is expected.",
    },
    {
      target: "routes-capacity",
      title: "Set a stop limit for the day",
      body: "The most stops you want on this tech's day — say 12. When you add a new customer, AquaRunner suggests the route with pools nearest their address, and skips any route already at its limit so one tech doesn't get overloaded. Leave it blank for no limit. It won't stop you adding stops by hand; the counter just turns orange when you go over.",
    },
    {
      target: "routes-delete",
      title: "Deleting a route",
      body: "Removes the route, its stops, and any of its visits that aren't started yet. Completed visits stay on the customer's record with their readings, doses and photos — deleting a route never erases service history. To move a day's work instead, use “Duplicate to…” and then delete the original.",
    },
  ],
  "/dashboard/customers": [
    {
      target: "customers-add",
      title: "Add a customer",
      body: "Creates a customer along with their first property in one step.",
    },
    {
      target: "customers-list",
      title: "Your customer directory",
      body: "Click any customer to manage their properties, aquatic venues, and service history.",
    },
  ],
  "/dashboard/users": [
    {
      target: "users-tabs",
      title: "Staff vs. customer logins",
      body: "Team member accounts live under Staff; customer portal logins are managed separately under Customers.",
    },
    {
      target: "users-roles",
      title: "What each role can do",
      body: "Admin, Office, and Technician have different levels of access — a quick reference before you add someone.",
    },
    {
      target: "users-team-list",
      title: "Your team",
      body: "Change a team member's role or remove their access here. Add a new team member at the bottom of this list.",
    },
  ],
  "/dashboard/chemicals": [
    {
      target: "chemicals-products",
      title: "Chemical products",
      body: "The products your org actually stocks and doses with.",
    },
    {
      target: "chemicals-catalog",
      title: "Dosing product catalog",
      body: "Enable the specific products the dosing calculator should offer, and set pricing for billing.",
    },
    {
      target: "chemicals-sds",
      title: "Safety Data Sheets",
      body: "Manufacturer SDS documents for every enabled product — upload your own to override one if your supplier differs.",
    },
  ],
  "/dashboard/checklist": [
    {
      target: "checklist-list",
      title: "Your service checklist",
      body: "Tasks technicians check off at every visit. Drag the arrows to reorder, or delete an item your org doesn't use.",
    },
    {
      target: "checklist-add-form",
      title: "Add a checklist item",
      body: "New items are added to the bottom of the list by default.",
    },
  ],
  "/dashboard/compliance": [
    {
      target: "compliance-rules",
      title: "Your state's compliance rules",
      body: "How AquaRunner applies your state's health department rules to closure-risk banners and the public inspector log.",
    },
  ],
  "/dashboard/billing": [
    {
      target: "billing-status",
      title: "Subscription status",
      body: "Your current plan status, trial end date, and renewal date, at a glance.",
    },
    {
      target: "billing-manage",
      title: "Manage billing",
      body: "Update your card, view invoices, or change plans through Stripe's billing portal.",
    },
  ],
  /**
   * Written 2026-11-24, after the audit that prompted this: the dosing recommendation had changed
   * from "what gets this pool to target" to "what your state requires today, and only projects
   * past today if you ask" -- and the switch that governs it had no mention anywhere a person
   * would look. A setting nobody can find is a setting that does not exist.
   */
  "/dashboard/settings": [
    {
      target: "settings-identity",
      title: "What inspectors and customers see",
      body: "Your business name and phone appear on the public QR and inspector-log pages and on every CSV export — so this is the name an inspector reads, not just a label in the app.",
    },
    {
      target: "settings-customization",
      title: "Customization",
      body: "What the people outside your office see: your branding on the portal and emails, the messages technicians pick from at completion, and which readings they are asked for.",
    },
    {
      target: "settings-company",
      title: "Your account, pay and exports",
      body: "Billing, pay rates, the QuickBooks export, and the account itself.",
    },
    {
      target: "settings-smart-dosing",
      title: "How doses get sized",
      body: "By default every recommended dose is sized to put the water inside your state's required range today, and the dosing card says so by name. Turn Smart dosing on and chlorine is also sized to still be above the minimum at your next visit, measured from each pool's own service history — the page shows you how many of your pools have enough history to measure, so you can judge it before switching it on.",
    },
  ],
  "/dashboard/phone-agent": [
    {
      target: "phone-agent-setup",
      title: "Finish phone agent setup",
      body: "A Twilio number and your primary business number are both needed before the AI phone agent can take calls.",
      optional: true,
    },
    {
      target: "phone-agent-calls",
      title: "Calls that reached the agent",
      body: "Every call that fell through to the interactive voicemail — after-hours or a busy line — lands here as a ticket.",
    },
  ],
  // Shares app/dashboard/alerts/page.tsx with the technician tour below -- same two sections, read
  // differently: a technician sees what they reported and what they missed, an admin sees what the
  // company has outstanding. No new anchors needed, which is why this went unwritten for so long
  // rather than for any good reason.
  "/dashboard/alerts": [
    {
      target: "tech-alerts-issues",
      title: "Open issues",
      body: "Anything a technician flagged on a visit stays here until someone resolves it — a torn liner, a pump that would not prime, a gate nobody could open.",
    },
    {
      target: "tech-alerts-overdue",
      title: "Overdue stops",
      body: "Stops that missed their scheduled window. Worth a look before a customer notices first.",
    },
  ],
  "/dashboard/schedule": [
    {
      target: "admin-schedule-tabs",
      title: "Day, Week, Month, Map or List",
      body: "Month is the overview — the whole month's workload at a glance, with each day clickable. Days nobody has opened yet show a projection from your weekly route template, marked with a dot, since their visits aren't created until the day is opened.",
    },
    {
      target: "admin-schedule-tech-filter",
      title: "View one technician or all of them",
      body: "Narrow to a single technician to see (and reorder) their stops, or view everyone's routes combined for the day.",
    },
    {
      target: "admin-schedule-stats",
      title: "Tap a tile to filter",
      body: "Total, Completed, In Progress, and Pending — tap any of these to filter the stop list down to just that group.",
      optional: true,
    },
  ],
};

export const TECHNICIAN_TOURS: Record<string, TourStep[]> = {
  "/dashboard/schedule": [
    {
      target: "schedule-tabs",
      title: "Day, Week, Map, or List",
      body: "Switch how you see your route — a single day, the whole week, a map of your stops, or a plain list.",
    },
    {
      target: "schedule-stat-tiles",
      title: "Tap a tile to filter",
      body: "Total, Completed, In Progress, and Pending — tap any of these to filter your stop list down to just that group.",
      optional: true,
    },
    {
      target: "schedule-first-stop",
      title: "Open a stop to log it",
      body: "Tap a stop to record readings, log chemical doses, capture photos, and check off your checklist. Drag the ⠿ handle to reorder stops by hand.",
      placement: "top",
    },
    {
      target: "schedule-extra-stops",
      title: "Extra stops",
      body: "Same-day one-offs — a repair, a drop-off — that aren't part of your regular route go here.",
      optional: true,
    },
  ],
  "/dashboard": [
    {
      target: "tech-home-schedule-link",
      title: "Today's schedule",
      body: "Your route, map, and stop list for today — this is where your day starts.",
    },
    {
      target: "tech-home-earnings",
      title: "Estimated earnings",
      body: "A running total of what today's (and this pay period's) stops are worth — the confirmed amount shows on your paycheck.",
    },
    {
      target: "tech-home-week-stats",
      title: "This week",
      body: "How many stops you've completed and skipped so far this week.",
    },
    {
      target: "tech-home-month-stats",
      title: "Monthly totals",
      body: "Browse completed and skipped stops by month, using the arrows to move between months.",
    },
  ],
  "/dashboard/alerts": [
    {
      target: "tech-alerts-issues",
      title: "Issues you've reported",
      body: "Anything you flagged as an issue on a visit stays open here until it's resolved.",
    },
    {
      target: "tech-alerts-overdue",
      title: "Overdue stops",
      body: "Any stop that missed its scheduled window shows up here.",
    },
  ],
};

export const PORTAL_TOURS: Record<string, TourStep[]> = {
  /**
   * A maintenance login never sees /portal, so it would never meet the tour above. This is its whole
   * introduction to the product: what the page is for, that the pool company's own readings appear here
   * too, and where the safety data sheets are.
   */
  "/portal/log": [
    {
      target: "portal-log-bodies",
      title: "Your pools, every day",
      body: "One card per pool or spa. Each card says whether anything has been logged today yet — including readings your pool service company took — so you can see at a glance what still needs doing.",
    },
    {
      target: "portal-log-save",
      title: "Enter what you measured",
      body: "Fill in the numbers you took and save. Leave anything you didn't test blank. Your entry is filed under today's date on the compliance log for that pool.",
      placement: "top",
    },
    {
      target: "portal-nav-chemicals",
      title: "Safety data sheets",
      body: "Safety Data Sheets for every chemical your pool company uses on this property, if you ever need to check handling or first aid.",
      placement: "right",
      optional: true,
    },
  ],
  "/portal": [
    {
      target: "portal-day-nav",
      title: "Browse by day",
      body: "Step back and forward through your service history one visit day at a time.",
    },
    {
      target: "portal-visit-card",
      title: "Everything from that visit",
      body: "Chemical readings, doses added, checklist items completed, technician notes, and photos — all logged the moment your technician finished.",
    },
    {
      target: "portal-qr-link",
      title: "Full record for inspectors",
      body: "This link opens the complete, downloadable reading history for this pool — the same page an inspector sees when they scan the QR code on site.",
      placement: "top",
      optional: true,
    },
    {
      target: "portal-upcoming",
      title: "What's coming up",
      body: "Your next scheduled service days for every property, grouped and ready at a glance.",
    },
  ],
  "/portal/documents": [
    {
      target: "portal-documents-list",
      title: "Your documents",
      body: "Inspection reports, contracts, and any other files your pool company has shared with you.",
    },
    {
      target: "portal-documents-upload",
      title: "Upload a document",
      body: "Share a file with your pool company directly from here.",
    },
  ],
  "/portal/chemicals": [
    {
      target: "portal-chemicals-list",
      title: "Safety Data Sheets",
      body: "SDS documents for every chemical your pool company uses on your account.",
    },
  ],
  "/portal/alerts": [
    {
      target: "portal-alerts-section",
      title: "Alerts from your pool company",
      body: "Any message your pool company sends you shows up here.",
    },
  ],
  "/portal/compliance": [
    {
      target: "portal-compliance-section",
      title: "Compliance reference",
      body: "How your pool company applies your state's health department rules, when applicable to your property.",
    },
  ],
};

/** Special-cased by the launcher since /dashboard/visits/[id] is a dynamic route --
 * usePathname() returns the real visit id, not a matchable map key. The same step
 * content applies regardless of which visit is open. Residential visits have no
 * checklist section, so "visit-checklist" simply doesn't exist there -- it's marked
 * `optional` so the engine drops it without holding the page open for a re-run. */
export const VISIT_DETAIL_TOUR_STEPS: TourStep[] = [
  {
    target: "visit-checklist",
    title: "Service checklist",
    body: "Tap each item as you complete it. Skipped items are visible in your visit history.",
    optional: true,
  },
  {
    target: "visit-chemistry",
    title: "Chemistry readings",
    body: "Log this visit's readings here — items marked required must be filled in before you can complete the visit.",
  },
  {
    target: "visit-doses",
    title: "Chemical doses",
    body: "Record what you added. A recommended amount is sized from this pool's volume and today's readings to land inside the range your state requires — the card itself says which state, and whether it is also carrying the pool to your next visit.",
  },
  {
    target: "visit-service-message",
    title: "Message to the customer",
    body: "Pick the preset that matches what actually happened. The one you choose is what the customer reads in their service summary email, so it is the part of this visit they will actually see.",
  },
  {
    target: "visit-photos",
    title: "Photo capture",
    body: "At least one photo is required to complete the visit. Photos must be taken live with the camera — you can't upload an existing image.",
  },
  {
    target: "visit-complete",
    title: "Complete the visit",
    body: "Once every required reading and at least one photo are in, this finishes the visit and logs it to the customer's record.",
  },
];

/**
 * The tours offered for replay, in the order a full run walks them.
 *
 * Separate from the maps above because those are keyed for lookup, where order carries no meaning
 * and nothing says which pages have a tour at all. That was the whole defect this fixes: ten admin
 * tours existed, each fired once on first visit to its own page and was then unreachable forever,
 * because the one "Replay tour" button hardcoded a single destination (`/dashboard`). A list that
 * states the sections is also the only way someone finds out the other nine exist.
 *
 * Order is the sequence a full replay follows, so it reads as a walkthrough of the product rather
 * than the arbitrary order the map literal happens to be written in: what you see when you sign in,
 * then the work, then the people and the setup behind it.
 *
 * Labels match the navigation, because a section called something the sidebar doesn't say is a
 * section nobody can find afterwards.
 *
 * `/dashboard/visits/[id]` is deliberately absent. Its tour is real (VISIT_DETAIL_TOUR_STEPS) but it
 * needs a concrete visit id, and there is no honest way to pick one on someone's behalf -- a replay
 * that opened a stranger's visit, or an old one, would be worse than not offering it. It still runs
 * by itself the first time a technician opens any visit.
 *
 * ONBOARDING_SECTIONS_MATCH_TOURS in lib/__tests__/onboarding-tour-sections.test.ts asserts these
 * lists stay in step with the maps, so adding a tour without listing it here fails the suite rather
 * than silently shipping another unreachable one.
 */
export type TourSection = { path: string; label: string };

export const ADMIN_TOUR_SECTIONS: TourSection[] = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/dashboard/schedule", label: "Schedule" },
  { path: "/dashboard/routes", label: "Routes" },
  { path: "/dashboard/customers", label: "Customers" },
  { path: "/dashboard/alerts", label: "Alerts" },
  { path: "/dashboard/chemicals", label: "Chemicals" },
  { path: "/dashboard/checklist", label: "Checklist" },
  { path: "/dashboard/compliance", label: "Compliance" },
  { path: "/dashboard/billing", label: "Billing" },
  { path: "/dashboard/users", label: "Users" },
  { path: "/dashboard/phone-agent", label: "Phone Agent" },
  { path: "/dashboard/settings", label: "Settings" },
];

export const TECHNICIAN_TOUR_SECTIONS: TourSection[] = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/dashboard/schedule", label: "Schedule" },
  { path: "/dashboard/alerts", label: "Alerts" },
];

/**
 * The portal's replayable sections, split by what the login is actually allowed to open.
 *
 * This split is not cosmetic. `lib/portal-access.ts` serves a MAINTENANCE login only the daily log,
 * the chemical safety sheets and its own account page -- everything else redirects. A full run that
 * walked the customer list would therefore bounce a maintenance person out of the tour at
 * `/portal`, so each audience gets the sections it can reach and nothing else. Keep these in step
 * with MAINTENANCE_PATHS there and with the nav lists in app/portal/components/portal-nav.tsx; the
 * tests assert the two portal lists together cover PORTAL_TOURS exactly.
 */
export const PORTAL_TOUR_SECTIONS: TourSection[] = [
  { path: "/portal", label: "Dashboard" },
  { path: "/portal/documents", label: "Documents" },
  { path: "/portal/chemicals", label: "Chemicals" },
  { path: "/portal/alerts", label: "Alerts" },
  { path: "/portal/compliance", label: "Compliance" },
];

export const MAINTENANCE_TOUR_SECTIONS: TourSection[] = [
  { path: "/portal/log", label: "Daily log" },
  { path: "/portal/chemicals", label: "Chemicals" },
];

/** The ordered sections a portal login may replay. */
export function portalTourSectionsFor(isMaintenance: boolean): TourSection[] {
  return isMaintenance ? MAINTENANCE_TOUR_SECTIONS : PORTAL_TOUR_SECTIONS;
}

/** The ordered sections for a role, or null for one with no tours at all (OFFICE). */
export function tourSectionsForRole(role: "ADMIN" | "TECHNICIAN" | "OFFICE"): TourSection[] | null {
  if (role === "ADMIN") return ADMIN_TOUR_SECTIONS;
  if (role === "TECHNICIAN") return TECHNICIAN_TOUR_SECTIONS;
  return null;
}
