import "server-only";
import { prisma } from "@/lib/prisma";
import { stripe, extraSeatPriceId, seatItemOf } from "@/lib/stripe";
import { billableSeatsFor } from "@/lib/plan-tiers-core";

/**
 * Pushes an organization's extra-seat count to Stripe.
 *
 * Always recomputed from the live active-staff count rather than incremented and decremented,
 * so a failed sync, a seat removed outside the normal path, or a plan change all self-correct
 * the next time this runs. That also makes it safe to call more often than strictly needed.
 *
 * Deliberately never throws. Seat billing must not be able to block an admin from adding or
 * removing a user: the User row is the source of truth, the subscription item is a reflection
 * of it, and a reflection that is briefly stale is far better than an org that cannot staff
 * itself. Failures are logged for the billing page to reconcile.
 *
 * No-ops, rather than failing, when any of these is true -- all of them are normal:
 *   - Stripe is not configured (no secret key). Signup is Preview-only today.
 *   - No seat Price is configured yet.
 *   - The org has no subscription at all. The one live org is COMPED, which bills nothing.
 *   - The org is COMPED or Enterprise, where billableSeatsFor is 0 by definition.
 */
export async function syncExtraSeatQuantity(organizationId: string): Promise<void> {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return;
    const seatPriceId = extraSeatPriceId();
    if (!seatPriceId) return;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planStatus: true, planTier: true, stripeSubscriptionId: true },
    });
    if (!org?.stripeSubscriptionId) return;

    const activeStaffCount = await prisma.user.count({ where: { organizationId, active: true } });
    const quantity = billableSeatsFor(org, activeStaffCount);

    const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId, {
      expand: ["items.data.price"],
    });
    const existing = seatItemOf(subscription);

    if (!existing) {
      // Nothing to bill and no item to bill it on -- the common case for an org that has never
      // gone past its included seats.
      if (quantity === 0) return;
      await stripe.subscriptionItems.create({
        subscription: org.stripeSubscriptionId,
        price: seatPriceId,
        quantity,
        // The admin was told the charge is prorated when they confirmed it, so bill it that way
        // rather than waiting for the next period and surprising them with a bigger invoice.
        proration_behavior: "create_prorations",
      });
      return;
    }

    if (existing.quantity === quantity) return;

    if (quantity === 0) {
      // Remove the item rather than leaving a quantity-0 line, so an org back within its
      // included seats sees a clean invoice instead of a $0 "Additional staff seat" row.
      await stripe.subscriptionItems.del(existing.id, { proration_behavior: "create_prorations" });
      return;
    }

    await stripe.subscriptionItems.update(existing.id, {
      quantity,
      proration_behavior: "create_prorations",
    });
  } catch (err) {
    console.error(`[stripe seats] failed to sync extra seats for org ${organizationId}:`, err);
  }
}
