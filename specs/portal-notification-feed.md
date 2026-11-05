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

## Service summaries — DECIDED 2026-11-04: they join the feed

Summaries are **bundled**: one email can cover several visits, and every member carries the
same `summaryEmailSentAt` stamp — see `resolveSummaryBundle` and the field's own doc
comment, which exists precisely so a pool and its spa are not reported twice.

**So a feed entry must be keyed on the bundle, not the visit.** Grouping by
`summaryEmailSentAt` within a customer is the natural key, since that is exactly what the
bundle already writes. One entry per send, listing the venues it covered.

With the watermark decision above, a summary is unread when its `summaryEmailSentAt` is
newer than the reader's `feedLastSeenAt`. No new storage for summaries at all.

## Avoiding duplication with what the home page already shows

`/portal` already loads the customer's most recent completed service day and the visits on
it. A "your service report is ready" entry sitting above a panel that already shows that
day's service is close to saying the same thing twice.

**◆ Worth deciding:** either the summary entry links to the existing detail rather than
repeating it, or the home page's service section becomes the feed and stops being a
separate block. The second is cleaner but is a redesign of the portal home, not an
addition to it.

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
| `app/portal/(app)/page.tsx` | load alerts and bundled summaries, unread = newer than this login's `feedLastSeenAt` |
| `app/portal/(app)/alerts/page.tsx` | stamp `feedLastSeenAt`; show read state |
| `app/portal/components/portal-nav.tsx` | unread badge; possible relabel |
| `lib/customer-alerts.ts` | unchanged — sending is done |

## Open questions

Resolved 2026-11-04: read is **per login**; summaries **do** join the feed.

Still open:

1. ◆ Does the home page's existing service block stay alongside the feed, or become it?
   `/portal` already shows the most recent completed service day, so a "your report is
   ready" entry above it says the same thing twice. Folding them together is the clean
   answer and is a redesign of the portal home, not an addition to it.
2. ◆ Mark seen on view, or on an explicit dismiss? With a watermark, "on view" means
   stamping `feedLastSeenAt` when the feed renders. Lower friction, and right for
   operational notices; wrong if anything here ever needs to look acknowledged.
3. ◆ Keep the nav label "Alerts", or widen it? Once summaries are in it, the contents no
   longer match the word.
