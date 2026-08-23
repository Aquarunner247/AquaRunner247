import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, mapSubscriptionStatus } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/default-checklist-items";
import { runCancellationSafetyExport } from "@/lib/compliance-archive";
import { sendCancellationScrubWarningEmail } from "@/lib/email";
import { timeZoneForState } from "@/lib/timezone";

/** How long an org gets, after cancellation, to export its own data before the scrub
 * cron (app/api/cron/scrub-canceled-orgs/route.ts) permanently deletes everything not
 * on the compliance-retained allowlist. */
const SCRUB_GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;

export const runtime = "nodejs";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (!customerId || !subscriptionId) break;

        // Safety net only: normally `completeSignup` (app/signup/actions.ts) creates
        // the Organization right after the browser lands back from Stripe, already
        // fully populated. This exists for the case where that never happens — card
        // charged/trial started, but the tab closed before a password was set. It
        // creates the org (billed, Stripe-linked) with no User attached yet;
        // `completeSignup` attaches one later if/when the person comes back via
        // `signUp`'s abandoned-signup check. No password is available here, so no
        // User/Supabase Auth account can be created from the webhook.
        const alreadyExists = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } });
        if (alreadyExists) break;

        const businessName = String(session.metadata?.businessName ?? "").trim();
        if (!businessName) break; // shouldn't happen — always set by signUp's checkout session

        const businessPhone = session.metadata?.phone ? String(session.metadata.phone).trim() : null;
        const state = String(session.metadata?.state ?? "").trim().toUpperCase() || null;
        const hasCommercialPools = session.metadata?.hasCommercialPools === "true";
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const stateRuleset = state ? await prisma.complianceRuleset.findUnique({ where: { state }, select: { id: true } }) : null;

        try {
          const org = await prisma.organization.create({
            data: {
              name: businessName,
              businessName,
              businessPhone,
              planStatus: mapSubscriptionStatus(subscription.status),
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
              currentPeriodEnd: subscription.items.data[0]?.current_period_end
                ? new Date(subscription.items.data[0].current_period_end * 1000)
                : null,
              state,
              hasCommercialPools,
              complianceRulesetId: stateRuleset?.id ?? null,
            },
          });
          await prisma.checklistItemDefinition.createMany({
            data: DEFAULT_CHECKLIST_ITEMS.map((label, index) => ({
              organizationId: org.id,
              label,
              sortOrder: index + 1,
              active: true,
            })),
          });
        } catch (err) {
          // Unique constraint on stripeCustomerId means `completeSignup` won a race and
          // already created this org (with its User) between our check above and this
          // create — that's the normal/common case, not a real failure.
          const isDuplicate = typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
          if (!isDuplicate) throw err;
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const isCancellation = event.type === "customer.subscription.deleted";
        const planStatus = isCancellation ? "CANCELED" : mapSubscriptionStatus(subscription.status);
        const scrubScheduledAt = isCancellation ? new Date(Date.now() + SCRUB_GRACE_PERIOD_MS) : undefined;

        // Set the scrub-scheduling flag as part of the same update that flips
        // planStatus -- this is the durable source of truth the cron reads, so it must
        // land even if the best-effort export/email below fail. Cleared to null on any
        // non-cancellation update (e.g. an org resubscribes before the grace period
        // elapses) so a reactivated org's clock isn't still running. dataScrubbedAt is
        // deliberately never touched here -- it's set only by the scrub cron itself,
        // once data has actually been deleted, and a later subscription event must not
        // make already-scrubbed data look intact again.
        await prisma.organization.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            planStatus,
            currentPeriodEnd: subscription.items.data[0]?.current_period_end
              ? new Date(subscription.items.data[0].current_period_end * 1000)
              : null,
            dataScrubScheduledAt: isCancellation ? scrubScheduledAt : null,
          },
        });

        if (isCancellation && scrubScheduledAt) {
          const org = await prisma.organization.findFirst({
            where: { stripeSubscriptionId: subscription.id },
            select: {
              id: true,
              name: true,
              businessName: true,
              state: true,
              users: { where: { role: "ADMIN", active: true }, select: { email: true } },
            },
          });
          if (org) {
            // Best-effort safety net -- a failure here must not prevent
            // dataScrubScheduledAt from having already been set above.
            try {
              const { blobPath } = await runCancellationSafetyExport(org.id);
              await prisma.organization.update({ where: { id: org.id }, data: { dataScrubSafetyExportBlobPath: blobPath } });
            } catch (err) {
              console.error(`[stripe webhook] cancellation safety export failed for org ${org.id}:`, err);
            }

            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
            const organizationName = org.businessName ?? org.name;
            for (const admin of org.users) {
              try {
                await sendCancellationScrubWarningEmail({
                  to: admin.email,
                  organizationName,
                  scrubScheduledAt,
                  timeZone: timeZoneForState(org.state),
                  billingUrl: `${appUrl}/dashboard/billing`,
                });
              } catch (err) {
                console.error(`[stripe webhook] cancellation warning email failed for ${admin.email}:`, err);
              }
            }
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : invoice.parent?.subscription_details?.subscription?.id;
        if (!subscriptionId) break;

        await prisma.organization.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { planStatus: "PAST_DUE" },
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Log and still return 200 — an unexpected app-side error shouldn't make Stripe
    // retry forever; this endpoint isn't the only source of truth (the Billing admin
    // page can always re-sync from Stripe directly if something was missed).
    console.error(`[stripe webhook] error handling ${event.type}:`, err);
  }

  return NextResponse.json({ received: true });
}
