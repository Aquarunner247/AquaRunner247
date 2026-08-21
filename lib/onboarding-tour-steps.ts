import type { TourStep } from "@/app/components/onboarding-tour";

export type { TourStep };

export const ADMIN_TOUR_STEPS: TourStep[] = [
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
];

export const TECHNICIAN_TOUR_STEPS: TourStep[] = [
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
];

export const PORTAL_TOUR_STEPS: TourStep[] = [
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
];
