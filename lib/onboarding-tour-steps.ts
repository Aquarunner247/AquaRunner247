import type { TourStep } from "@/app/components/onboarding-tour";

export type { TourStep };

/**
 * Each role's tours are keyed by pathname (usePathname()'s exact value) except the
 * dynamic /dashboard/visits/[id] route, which the launcher special-cases separately
 * since a real visit id can't be a map key -- see VISIT_DETAIL_TOUR_STEPS below.
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
      target: "admin-overdue-stops",
      title: "Overdue stops",
      body: "Stops that missed their scheduled window land here so nothing slips through unnoticed.",
    },
    {
      target: "admin-recent-activity",
      title: "Recent activity",
      body: "A running log of completed visits and new customers — click to expand it any time.",
    },
  ],
  "/dashboard/routes": [
    {
      target: "routes-missing-coords",
      title: "Properties missing a map location",
      body: "Any property without coordinates shows up here, with a link to drop its pin on a satellite map.",
    },
    {
      target: "routes-stop-list",
      title: "Build a route's stops",
      body: "Drag stops to reorder them, and watch the map on the right update live as you go.",
    },
    {
      target: "routes-add-form",
      title: "Add a new route",
      body: "Create another weekday route and assign a technician to it.",
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
    {
      target: "chemicals-usage",
      title: "Usage & billing by property",
      body: "See how much of each chemical was used per property over a date range, for cost tracking or billing.",
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
  "/dashboard/phone-agent": [
    {
      target: "phone-agent-setup",
      title: "Finish phone agent setup",
      body: "A Twilio number and your primary business number are both needed before the AI phone agent can take calls.",
    },
    {
      target: "phone-agent-calls",
      title: "Calls that reached the agent",
      body: "Every call that fell through to the interactive voicemail — after-hours or a busy line — lands here as a ticket.",
    },
  ],
  "/dashboard/schedule": [
    {
      target: "admin-schedule-tech-filter",
      title: "View one technician or all of them",
      body: "Narrow to a single technician to see (and reorder) their stops, or view everyone's routes combined for the day.",
    },
    {
      target: "admin-schedule-stats",
      title: "Tap a tile to filter",
      body: "Total, Completed, In Progress, and Pending — tap any of these to filter the stop list down to just that group.",
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
    },
    {
      target: "schedule-optimize-route",
      title: "Optimize your route",
      body: "Reorders today's stops by straight-line distance so you're not backtracking across town.",
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
 * checklist section, so "visit-checklist" simply doesn't exist there -- the engine
 * skips that step automatically rather than erroring. */
export const VISIT_DETAIL_TOUR_STEPS: TourStep[] = [
  {
    target: "visit-checklist",
    title: "Service checklist",
    body: "Tap each item as you complete it. Skipped items are visible in your visit history.",
  },
  {
    target: "visit-chemistry",
    title: "Chemistry readings",
    body: "Log this visit's readings here — items marked required must be filled in before you can complete the visit.",
  },
  {
    target: "visit-doses",
    title: "Chemical doses",
    body: "Record what you added. Recommended amounts (when available) are calculated from the pool's volume and current readings.",
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
