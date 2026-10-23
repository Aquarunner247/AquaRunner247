import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendTrialEndingEmail } from "@/lib/email";
import { timeZoneForState } from "@/lib/timezone";
import { trialReminderDecision, daysUntilTrialEnds, TRIAL_REMINDER_LEAD_DAYS } from "@/lib/trial-reminder";

export const runtime = "nodejs";

/** Plan tier as a person would say it, for the line naming what is about to be charged. */
const PLAN_LABEL: Record<string, string> = {
  SERVICE: "the Service plan",
  WHITE_LABEL: "the White Label plan",
  ENTERPRISE: "your Enterprise plan",
  COMPLIANCE: "your Compliance plan",
};

/**
 * Emails every organization whose free trial ends soon, once each.
 *
 * Terms of Service 4.7 and EULA 5.4 have both stated that this email is sent since those
 * documents were published. Nothing sent it. A 14-day trial takes a card at signup and converts
 * silently, so until now the first a customer knew about the charge was the charge.
 *
 * Runs daily. trialReminderSentAt is the idempotency marker -- the decision itself, including
 * why an organization was skipped, lives in lib/trial-reminder.ts so it can be tested without a
 * database.
 *
 * 15:00 UTC is 8am Pacific in summer and 7am in winter: a billing decision should land at the
 * start of a working day, not in the middle of the night before the charge.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Narrowed in SQL to the only status that can produce a send; trialReminderDecision re-checks
  // it anyway, so the query is an optimisation rather than the rule.
  const organizations = await prisma.organization.findMany({
    where: { planStatus: "TRIALING", trialReminderSentAt: null, trialEndsAt: { gt: now } },
    select: {
      id: true,
      name: true,
      businessName: true,
      state: true,
      planStatus: true,
      planTier: true,
      trialEndsAt: true,
      trialReminderSentAt: true,
      stripeSubscriptionId: true,
      users: { where: { active: true, role: "ADMIN" }, select: { email: true } },
    },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};
  const note = (reason: string) => {
    skipped++;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };

  // Sequential, like the other sweeps: lib/prisma.ts caps the connection pool deliberately and
  // each iteration also makes Stripe and Resend calls, so fanning out would serialize anyway.
  for (const org of organizations) {
    const decision = trialReminderDecision(org, now);
    if (!decision.send) {
      note(decision.reason);
      continue;
    }
    // Narrowed by the query and by trialReminderDecision; this satisfies the type checker.
    const trialEndsAt = org.trialEndsAt;
    if (!trialEndsAt) {
      note("no-trial-end");
      continue;
    }

    // Billing mail goes to the people who own the card, not to the org's customer-facing
    // support address -- that one belongs to the org's own customers.
    const recipients = org.users.map((u) => u.email).filter((email): email is string => Boolean(email));
    if (recipients.length === 0) {
      note("no-admin-recipient");
      continue;
    }

    /**
     * The real amount, from the live subscription.
     *
     * Not a hardcoded tier price: those already exist in two places (the pricing page and the
     * signup tier labels) and would drift. More importantly, a reminder is only worth sending
     * if the number in it is the number on the card -- a coupon, a seat add-on or a price
     * change would all make a static label wrong. Best effort: if Stripe cannot be read, the
     * email says "the current rate" rather than inventing a figure.
     */
    let amountLabel: string | null = null;
    if (org.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
        const total = subscription.items.data.reduce((sum, item) => {
          const unit = item.price.unit_amount ?? 0;
          return sum + unit * (item.quantity ?? 1);
        }, 0);
        if (total > 0) {
          amountLabel = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: (subscription.items.data[0]?.price.currency ?? "usd").toUpperCase(),
          }).format(total / 100);
        }
      } catch (err) {
        console.error("[cron send-trial-reminders] stripe read failed for org", org.id, err);
      }
    }

    const daysLeft = daysUntilTrialEnds(trialEndsAt, now);
    let anySent = false;
    for (const to of recipients) {
      const result = await sendTrialEndingEmail({
        to,
        organizationName: org.businessName ?? org.name,
        trialEndsAt,
        daysLeft,
        timeZone: timeZoneForState(org.state),
        amountLabel,
        planLabel: PLAN_LABEL[org.planTier ?? ""] ?? "your plan",
        billingUrl: `${appUrl}/dashboard/billing`,
      });
      if (result.ok) anySent = true;
      else console.error("[cron send-trial-reminders] send failed for", to, result.error);
    }

    if (anySent) {
      // Marked only after something actually went out, so a total send failure retries
      // tomorrow rather than being recorded as done. A partial failure does not retry: one
      // admin getting it twice is worse than one admin missing it, and the charge is the same
      // either way.
      await prisma.organization.update({
        where: { id: org.id },
        data: { trialReminderSentAt: new Date() },
      });
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    leadDays: TRIAL_REMINDER_LEAD_DAYS,
    candidates: organizations.length,
    sent,
    skipped,
    failed,
    reasons,
  });
}
