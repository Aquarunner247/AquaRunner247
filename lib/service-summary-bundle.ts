/**
 * Which bodies of water belong to one service visit, for the purpose of sending one email.
 *
 * A pool and its spa are one occasion from the customer's side: the technician parks once, works
 * both, and the customer should hear about it once. Each body keeps its own ServiceVisit, reading,
 * photo and completion, so nothing about the compliance record changes -- only how many emails go
 * out.
 *
 * Built on lib/stop-grouping.ts so there is exactly one definition of "one walk-up" in the app, the
 * same one the schedule uses to draw a bundled card: same property, within BUNDLE_RADIUS_METERS, and
 * at most one body of each kind.
 *
 * Route-order adjacency is NOT required here, unlike the card. The card needs it because it renders
 * contiguous rows; an email is about what happened at a property today. A technician who does the
 * pool, leaves for another property, and comes back for the spa has still made one visit as far as
 * the customer is concerned, and should not get two emails for it. Passing only that property's own
 * visits, in route order, makes them adjacent within the subset, so groupNearbyStops sees exactly
 * the run this cares about.
 */
import { groupNearbyStops, type GroupableStop } from "@/lib/stop-grouping";

/** What the resolver needs about each of a property's visits on one day, in route order. */
export type BundleCandidate = {
  visitId: string;
  /** BodyOfWater.type -- decides whether two nearby bodies can share a card and an email. */
  bodyType: string | null;
  latitude: number | null;
  longitude: number | null;
  /** ServiceVisit.status. COMPLETED and CANCELLED both count as finished; anything else is still
   *  outstanding and holds the email back. */
  status: string;
  /** Set once this visit's summary has been emailed, so a re-send can't happen. */
  summaryEmailSentAt: Date | null;
};

export type BundleDecision = {
  /** The visits that belong with this one, in route order, including it. */
  memberIds: string[];
  /** Members that were completed -- the ones with something to report. */
  completedIds: string[];
  /** Members that were skipped. Named in the email, without readings. */
  skippedIds: string[];
  /**
   * True when every member has finished (completed or skipped) and none has been emailed yet.
   * False while any member is still outstanding, which is what makes the email wait for the spa
   * instead of going out twice.
   */
  readyToSend: boolean;
  /** Why it isn't ready, for a log line that explains itself. */
  reason: "ready" | "members-outstanding" | "already-sent" | "nothing-completed";
};

const FINISHED = new Set(["COMPLETED", "CANCELLED"]);

/**
 * Resolves the bundle containing `visitId` and decides whether its email should go now.
 *
 * `candidates` must be that property's non-cancelled-route visits for one technician on one local
 * day, ordered by routeSequence. The caller owns that query; this function stays pure so the rule
 * is testable.
 */
export function resolveSummaryBundle(visitId: string, candidates: BundleCandidate[]): BundleDecision {
  const groupable: GroupableStop[] = candidates.map((c) => ({
    id: c.visitId,
    // One property, so a constant is enough -- groupNearbyStops only compares these for equality.
    propertyId: "property",
    latitude: c.latitude,
    longitude: c.longitude,
    bodyType: c.bodyType,
  }));

  const groups = groupNearbyStops(groupable);
  const group = groups.find((g) => g.memberIds.includes(visitId));

  // A visit always belongs to some group, even alone; falling back to itself keeps a caller from
  // having to handle an impossible null.
  const memberIds = group?.memberIds ?? [visitId];
  const members = memberIds
    .map((id) => candidates.find((c) => c.visitId === id))
    .filter((c): c is BundleCandidate => c != null);

  const completedIds = members.filter((m) => m.status === "COMPLETED").map((m) => m.visitId);
  const skippedIds = members.filter((m) => m.status === "CANCELLED").map((m) => m.visitId);

  // Any member already emailed means this bundle has been reported on. Re-sending would give the
  // customer a duplicate, which is worse than a missing late addition.
  if (members.some((m) => m.summaryEmailSentAt != null)) {
    return { memberIds, completedIds, skippedIds, readyToSend: false, reason: "already-sent" };
  }
  if (!members.every((m) => FINISHED.has(m.status))) {
    return { memberIds, completedIds, skippedIds, readyToSend: false, reason: "members-outstanding" };
  }
  // Every member skipped: there are no readings, no photos and nothing serviced, so there is
  // nothing to send. The technician's message on a skipped visit is for the office, not a summary.
  if (completedIds.length === 0) {
    return { memberIds, completedIds, skippedIds, readyToSend: false, reason: "nothing-completed" };
  }

  return { memberIds, completedIds, skippedIds, readyToSend: true, reason: "ready" };
}
