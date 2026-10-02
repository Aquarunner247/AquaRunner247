/**
 * Where "Replay tour" actually sits, per audience.
 *
 * One definition because two different screens tell people the same thing: the first-login welcome
 * when the tour is declined before it starts (app/components/onboarding-welcome.tsx), and the tour
 * itself when it is skipped part-way (app/components/onboarding-tour.tsx). Those drifting apart would
 * send someone to the wrong menu, and a wrong instruction is worse than none -- they would conclude
 * the tour cannot be restarted at all.
 *
 * Keep each value readable directly after "Open": the copy reads "Open Settings and choose Replay
 * tour."
 *
 * ADMIN -> app/dashboard/settings/page.tsx, TECHNICIAN -> app/dashboard/more/page.tsx,
 * CUSTOMER -> the portal's own side nav (app/portal/components/portal-nav.tsx). OFFICE has no tour,
 * so it has no entry.
 */
export const REPLAY_LOCATION = {
  ADMIN: "Settings",
  TECHNICIAN: "More",
  CUSTOMER: "the menu",
} as const;

export type ReplayAudience = keyof typeof REPLAY_LOCATION;
