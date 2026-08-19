import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

/**
 * Admins land on the Schedule tab instead of the Dashboard overview when they're
 * personally assigned as the technician on a route running today -- same as a technician
 * would want to see their day, not the org-wide stats. Every other role/case keeps the
 * existing Dashboard landing.
 */
export async function resolvePostLoginPath(appUser: Pick<User, "id" | "organizationId" | "role">): Promise<string> {
  if (appUser.role !== "ADMIN") return "/dashboard";

  const now = new Date();
  // JS getDay(): Sun=0..Sat=6. Our schema uses ISO weekday: Mon=1..Sun=7 (see lib/service-weekdays.ts).
  const isoWeekday = ((now.getDay() + 6) % 7) + 1;

  const routeToday = await prisma.recurringRoute.findFirst({
    where: { organizationId: appUser.organizationId, technicianId: appUser.id, active: true, dayOfWeek: isoWeekday },
    select: { id: true },
  });

  return routeToday ? "/dashboard/schedule" : "/dashboard";
}
