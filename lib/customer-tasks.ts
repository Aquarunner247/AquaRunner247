import { prisma } from "@/lib/prisma";
import { dueCutoffForTimeZone } from "@/lib/customer-task-due";

/**
 * Which to-dos are currently "due" -- the one definition, used by both the notification bell and the
 * daily digest email.
 *
 * Shared deliberately rather than written twice. An email that disagrees with the bell is worse than
 * either alone: whichever one is wrong, nobody can tell which, and the office stops trusting both.
 *
 * Three ways a to-do qualifies:
 *  - no deadline at all, which shows immediately (an undated to-do is still something someone wanted
 *    done, and waiting for a date it will never have is how one gets forgotten);
 *  - its reminder day has arrived, that being the due date minus the chosen lead time;
 *  - it has a due date but no reminder day, which happens to anything written between a migration and
 *    the deploy that starts filling the column. Falling back to the due date means late rather than
 *    never. See the 2026-10-06 backfill.
 */
export function dueTaskWhere(now: Date, timeZone: string) {
  const cutoff = dueCutoffForTimeZone(now, timeZone);
  // Not `as const`: Prisma's WhereInput will not accept a readonly OR array.
  return {
    completedAt: null,
    OR: [
      { dueOn: null },
      { remindOn: { lte: cutoff } },
      { AND: [{ remindOn: null }, { dueOn: { lte: cutoff } }] },
    ],
  };
}

export type DueTask = {
  id: string;
  title: string;
  dueOn: Date | null;
  customerId: string;
  customerName: string;
};

/**
 * `limit` exists for the bell, which shows the first handful inside a dropdown. The digest passes none,
 * because an email listing "10 of 23" and hiding the rest is how the other 13 stay forgotten.
 */
export async function findDueTasks(
  organizationId: string,
  now: Date,
  timeZone: string,
  limit?: number,
): Promise<DueTask[]> {
  const rows = await prisma.customerTask.findMany({
    where: {
      ...dueTaskWhere(now, timeZone),
      // A customer whose relationship has ended is excluded: its to-dos are history, not work owed.
      customer: { organizationId, relationshipEndedAt: null },
    },
    // Soonest deadline first, undated last -- they are the least time-critical by definition.
    orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    ...(limit != null ? { take: limit } : {}),
    select: { id: true, title: true, dueOn: true, customer: { select: { id: true, name: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    dueOn: t.dueOn,
    customerId: t.customer.id,
    customerName: t.customer.name,
  }));
}
