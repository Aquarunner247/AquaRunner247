# Spec — portal notification feed

**Status:** draft, not started. Needs a migration, so it waits for the Play review.

## Why

Custom notifications to portal customers already work. `CustomerAlert` carries a free-text
subject and message, an admin can send to one customer or in bulk with a shared `batchId`,
and delivery outcome is recorded per alert. Customers read them at `/portal/alerts`.

Two things are missing, and they are what make it a notification rather than a page:

1. **Nothing appears on the portal home.** `/portal` does not reference `CustomerAlert` at
   all, so a customer sees an alert only if they go looking under the Alerts link.
2. **There is no read/unread state.** No `readAt`, `isRead`, `unread` or `acknowledged`
   anywhere in the schema. Without it there is no badge, no count, and no "new since you
   last looked" — everything would show forever, which makes a home-page panel useless
   after the first week.

## Scope

A feed on the portal home, drawn from **two** sources:

| Source | Exists today | What the customer sees |
|---|---|---|
| `CustomerAlert` | yes, fully built | the subject and message an admin typed |
| Service summary | email only | "Your service report for 3 Nov is ready" |

**Explicitly out of scope: out-of-range or failed readings.** Decided by the operator on
2026-11-04. Do not add it later without revisiting that decision — a customer-facing
"your pool failed" notification is a different product with different consequences, and
the compliance record already carries the readings for anyone entitled to see them.

## Read state — DECIDED 2026-11-04: per login

The operator chose **per portal login**, not per customer. A property with an on-site
manager and a head office contact: each person sees their own unread state, and one
reading a notice does not clear it for the other.

**That rules out a `readAt` column on `CustomerAlert`.** One alert row holds one stamp, so
the first reader would clear it for everybody — which is exactly the per-customer behaviour
that was rejected. An earlier draft of this spec proposed that column; it is wrong for the
decision taken.

Two shapes work. They are not exclusive, and the second can be added later without undoing
the first.

### Recommended: a watermark per login

```
CustomerUser.feedLastSeenAt  DateTime?
```

Anything in the feed newer than this login's `feedLastSeenAt` is unread. Null means
everything is unread, which is correct — none of it has ever been shown on the home page.

Why this one:

- **It handles both sources with one mechanism.** A service summary has no row to mark
  read, so any per-row scheme needs a watermark for summaries anyway. This is that
  watermark, used for both.
- One nullable column, no join table, no write per alert per reader.
- It satisfies "per login" literally: each `CustomerUser` carries their own.

What it cannot do: express "I read this one but not that one." Opening the feed marks
everything currently in it as seen. For operational notices — a closure, a schedule change
— that is the normal behaviour of every inbox badge and is almost certainly fine.

### If per-alert precision is ever needed

```
model CustomerAlertRead {
  alertId        String
  customerUserId String
  readAt         DateTime @default(now())
  @@unique([alertId, customerUserId])
}
```

One row per (alert, reader). Supports partial reading and answers "did this specific person
open this specific notice", which the watermark cannot.

◆ **Only build this if there is a reason to prove a particular person read a particular
alert.** Note the sending side already records `sendOutcome`, `recipientCount` and
`failedRecipientCount`, so delivery is evidenced — this would be about *reading*, which is
a different and weaker claim. Adding the table later does not require migrating away from
the watermark; the two answer different questions.

## Service entries — DECIDED 2026-11-04: keyed on the service DAY

Summaries join the feed, and the home page's existing service block **becomes** the feed
rather than sitting beside it. The operator chose to eliminate the redundancy rather than
link between two things that say the same thing.

That decision changes what a service entry is keyed on, and the first draft of this spec
had it wrong.

**Not `summaryEmailSentAt`.** Summary emails are sent by a cron, so a pool serviced this
morning has no stamp until that job runs. Keying the feed on the send would make the portal
LESS current than it is today, where `/portal` shows the most recent completed service day
as soon as it is completed. That is a regression dressed as a feature.

**Keyed on the service day.** One entry per customer per day on which work was completed,
listing the venues serviced. This also removes the bundling problem rather than solving it:
a pool and its spa serviced on one arrival are by definition the same day, so they are one
entry without `resolveSummaryBundle` being involved at all. Day-grouping is coarser than
bundle-grouping and strictly safe — a bundle never spans days.

`summaryEmailSentAt` becomes **display metadata on the entry** ("report emailed 3 Nov"),
not its identity. Useful to show, and it answers "did my report go out" without governing
whether the service appears.

Unread is the same rule as for alerts: the entry's date is newer than this login's
`feedLastSeenAt`. No new storage for service entries either.

### What this does to the current home page

`/portal` today is a single-day view with previous/next day navigation. As a feed it
becomes a reverse-chronological list, so that navigation has nowhere to live.

◆ The natural resolution is that a feed entry links through to the existing day detail —
the day view stops being the landing page and becomes the drill-down. That preserves
everything a customer can see today and removes the duplication, but it is a change to how
they browse history, not only to what the home shows. Worth saying out loud to the operator
before it is built, because "eliminate the redundancy" and "move the day view" are the same
decision and only the first was explicitly taken.

## UI

- **Portal home:** a panel showing unread items, newest first, with a link to the full
  list. Empty state matters — most customers will have nothing most of the time, and an
  empty panel every visit trains people to ignore it. Consider hiding the panel entirely
  when there is nothing unread.
- **Nav badge:** unread count on the existing "Alerts" link. ◆ If summaries join the feed,
  that link's label stops matching its contents — "Alerts" versus something like "Updates".
- **Marking read:** ◆ on view, or an explicit dismiss? Explicit is better for anything you
  would want to show the customer acknowledged; on-view is less friction. Given alerts are
  operational notices rather than agreements, on-view is probably right — but it is a
  choice, not an obvious default.

## What this is not

- Not push notifications. Nothing here reaches a phone that is not open on the portal.
- Not a reading-failure alert. See Scope.
- Not a replacement for the alert email. The email is what actually reaches someone who is
  not logged in; the feed is for someone who is.

## Integration points

| File | Change |
|---|---|
| `prisma/schema.prisma` | `feedLastSeenAt DateTime?` on `CustomerUser` — nothing on `CustomerAlert`. Migration applied to production BEFORE the code deploys |
| `app/portal/(app)/page.tsx` | becomes the feed: alerts + completed service days, unread = newer than this login's `feedLastSeenAt`. Today's single-day view moves to a drill-down |
| `app/portal/(app)/alerts/page.tsx` | stamp `feedLastSeenAt`; show read state |
| `app/portal/components/portal-nav.tsx` | unread badge; possible relabel |
| `lib/customer-alerts.ts` | unchanged — sending is done |

## Open questions

Resolved 2026-11-04: read is **per login**; summaries **do** join the feed; the home page's
service block **becomes** the feed rather than sitting beside it, and service entries are
keyed on the service day rather than the email send.

Still open:

1. ◆ Confirm the day view becomes a drill-down rather than the landing page — see the end
   of "Service entries". Implied by eliminating the redundancy, but not explicitly decided.
2. ◆ Mark seen on view, or on an explicit dismiss? With a watermark, "on view" means
   stamping `feedLastSeenAt` when the feed renders. Lower friction, and right for
   operational notices; wrong if anything here ever needs to look acknowledged.
3. ◆ Keep the nav label "Alerts", or widen it? Once summaries are in it, the contents no
   longer match the word.
