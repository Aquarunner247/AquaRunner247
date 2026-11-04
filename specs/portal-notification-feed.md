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

## Read state

Add to `CustomerAlert`:

```
readAt              DateTime?
readByCustomerUserId String?
```

Nullable, so every existing alert reads as unread. That is the right default — they were
never shown on the home page, so the customer genuinely has not seen them there.

**◆ One decision needed: is "read" per customer or per portal login?** A property with two
logins — an on-site manager and a head office contact — behaves differently depending:

- **Per customer:** either person reading it clears it for both. Right for "the pool is
  closed Thursday."
- **Per login:** each person must see it themselves. Right for anything you would later
  want to show a specific person received.

Recording `readByCustomerUserId` alongside the timestamp keeps both options open even if
the first implementation treats it as per-customer, which is why both columns are listed
rather than a bare boolean.

## Service summaries in the feed

Summaries are **bundled**: one email can cover several visits, and every member carries the
same `summaryEmailSentAt` stamp — see `resolveSummaryBundle` and the field's own doc
comment, which exists precisely so a pool and its spa are not reported twice.

**So a feed entry must be keyed on the bundle, not the visit.** Grouping by
`summaryEmailSentAt` within a customer is the natural key, since that is exactly what the
bundle already writes. One entry per send, listing the venues it covered.

A summary entry is **derived, not stored** — there is no row to mark read. Either:

- **(a)** treat summaries as always-read and show them as history rather than notifications,
  or
- **(b)** store a per-customer "feed last seen" timestamp and call anything newer unread.

◆ (b) is simpler than it sounds and gives a real unread count across both sources. (a)
means the badge only ever counts alerts.

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
| `prisma/schema.prisma` | `readAt`, `readByCustomerUserId` on `CustomerAlert`; migration applied to production BEFORE deploy |
| `app/portal/(app)/page.tsx` | load unread alerts and, if included, bundled summaries |
| `app/portal/(app)/alerts/page.tsx` | mark read; show read state |
| `app/portal/components/portal-nav.tsx` | unread badge; possible relabel |
| `lib/customer-alerts.ts` | unchanged — sending is done |

## Open questions

1. ◆ Read per customer, or per portal login?
2. ◆ Do service summaries join the feed, or do alerts stay the only source?
3. ◆ If they join: store a "feed last seen" timestamp, or treat summaries as always-read?
4. ◆ Does the home page's existing service block stay, or become the feed?
5. ◆ Mark read on view, or explicit dismiss?
6. ◆ Keep the nav label "Alerts", or widen it?
