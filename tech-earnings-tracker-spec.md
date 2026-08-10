# AquaRunner 24/7 Pro — Technician Running Earnings Tracker

## Overview
Add a live "Estimated Earnings" total to the technician's main dashboard
(`TechnicianHome`) that increases as each scheduled stop is marked
complete. Pay is per body of water, admin-set and admin-only visible as a
rate table. Techs never see the rate table — only the running total.

**Framing requirement:** this is an estimate, not an official paycheck.
Actual payroll runs through QuickBooks and remains the source of truth.
Label it clearly in the UI (e.g. "Estimated today: $128 — confirmed
amount appears on your paycheck") so there's no ambiguity if a number
here ever differs from an actual pay stub.

---

## 1. Data Model

```
TechnicianPayRate
- id
- orgId
- technicianId              FK to technician/user
- bodyOfWaterId              FK to body of water
- rateAmount                 decimal — flat $ paid to THIS tech for
                              completing a service visit at THIS body
                              of water. Can legitimately be 0 — see
                              isBundled below.
- isBundled                  bool — true when this body of water's pay
                              is folded into another body at the same
                              property (the common case: a spa's pay is
                              bundled into its paired pool's rate, so the
                              spa itself pays $0 on its own).
- bundledIntoBodyOfWaterId    nullable FK — which body of water actually
                              carries the combined rate, for admin
                              clarity/audit. Not used in calculation
                              (rateAmount already reflects the real
                              number to add, even if 0) — purely so an
                              admin looking at the rate table later
                              understands WHY a row is $0 instead of
                              wondering if it was missed.
- isActive
- effectiveDate              date this rate takes effect
- createdByUserId            audit — which admin set it
- createdAt / updatedAt
```

**Why this matters:** this is also the reason no per-stop dollar amount
is ever shown to the tech (confirmed in section 5 below) — a bundled
spa's true rate is $0 by design, and a tech seeing "Spa: $0" next to
"Pool: $45" would read as a mistake rather than the intended bundled
pricing. The aggregate-only total sidesteps that entirely: the tech sees
one correct number for the full stop, not two lines that look wrong.

Notes:
- Rate is keyed on (technicianId, bodyOfWaterId) — the same property can
  pay two different techs two different amounts if needed, matching
  "rate varies per customer/body of water."
- No rate row = no earnings counted for that stop. Don't default to $0
  silently without surfacing it — see admin UX note below on flagging
  unset rates so nothing gets missed.
- Keep a full history rather than overwriting — if `effectiveDate` is in
  the future or a rate changes mid-period, past visits should still
  calculate using the rate that was active on the visit's completion
  date, not today's rate. Store `isActive` + `effectiveDate` and query
  "rate active as of visit completion timestamp" rather than always
  joining the latest row.

---

## 2. Calculation Service

New service, e.g. `TechnicianEarningsService`.

### Trigger
Runs when a `ServiceVisit` status transitions to `COMPLETED` (hook into
the existing visit-completion flow — GPS arrival/checklist-complete logic
already in place).

### Logic
1. On visit completion, look up `TechnicianPayRate` for
   (technicianId, bodyOfWaterId) active as of the completion timestamp.
2. If found → add `rateAmount` to that tech's running total for the
   current period (see "period" below).
3. If NOT found (no `TechnicianPayRate` row exists at all for this
   tech+property pair) → do NOT silently add $0. Log/flag it (e.g. an
   admin-facing "Unrated visits" list) so a missing rate doesn't quietly
   cost a tech money without anyone noticing.
   **Important distinction:** this flag fires only when no row exists.
   A row that exists with `rateAmount: 0` and `isBundled: true` (a spa
   folded into its paired pool's rate) is a valid, intentional state and
   must NOT trigger the missing-rate flag — that's expected data, not an
   oversight.

### Period scope
- Default: running total resets daily, shown as "Today's estimated
  earnings" on `TechnicianHome`.
- **Pay period confirmed: semi-monthly** — 1st through the 15th, then
  16th through the last day of the month (paychecks issued on the 15th
  and last day of month). Add a second total, "This pay period," summing
  all completed-visit earnings within whichever half-month window
  `today` falls into. Period boundaries: if today ≤ 15, period is
  [1st, 15th] of the current month; otherwise [16th, last day] of the
  current month — watch the month-length edge case (28/29/30/31) when
  calculating the period end date.

### Output (returned to technician dashboard)
```json
{
  "technicianId": "...",
  "today": "2026-08-09",
  "estimatedTotalToday": 128.00,
  "visitsCompletedToday": 6,
  "payPeriod": "2026-08-01_to_2026-08-15",
  "estimatedTotalPayPeriod": 842.50
}
```
No per-visit dollar breakdown returned to the tech client — only the
aggregate. (Per the discussion above: the running total updating live
after each stop does let a tech infer a single property's rate by
subtraction — that's accepted as fine. What's NOT exposed is the rate
table itself, or any other tech's numbers.)

---

## 3. Security

- **Rate table access:** `TechnicianPayRate` CRUD is admin/owner role
  only, enforced server-side (not just hidden in the UI — a tech account
  must get a 403 on the endpoint itself if they somehow hit it directly).
- **Cross-technician isolation:** the earnings endpoint must scope
  strictly to `req.user.technicianId` — a tech can only ever fetch their
  own total, never another tech's, even by manipulating a technicianId
  param. Enforce this at the query layer, not just by hiding the input
  in the UI.
- **No rate data in tech-facing API responses:** double-check the
  earnings endpoint's response shape never accidentally includes
  `rateAmount` or `TechnicianPayRate` records nested in a visit object
  the tech's app already fetches (easy accidental leak if a shared
  `ServiceVisit` serializer includes pay data for the admin view and
  the same serializer gets reused on the tech-facing route).
- **Audit trail:** `createdByUserId`/`updatedAt` on every rate change —
  if a tech ever disputes an earnings total, you want a clean record of
  what the rate was and who set it, when.

---

## 4. Admin UX

**Two entry points, one underlying table.** Pay rates are editable from
both locations below — both read/write the same `TechnicianPayRate`
records, so a change made in one place is immediately reflected in the
other. No separate "which one is authoritative" question — there's one
source of truth, just two convenient doors into it.

- **Inline on Customer Detail page** — next to the existing route/
  technician/weekday assignment for that venue, add a "Pay rate" field
  per assigned technician for each body of water at that property. This
  is the fast path for day-to-day setup: an admin assigning a tech to a
  property can set their rate for it in the same screen, same moment.
- **Dedicated "Pay Rates" page under Settings** — a full list/table view
  across all bodies of water and technicians, useful for bulk review,
  auditing who's rated what, and spotting gaps at a glance rather than
  clicking into properties one at a time.
- Surface an "Unrated visits" or "Missing pay rates" list on the
  Settings page — properties actively being serviced that have no
  `TechnicianPayRate` row set for their assigned tech, so nothing falls
  through the cracks silently, regardless of which entry point was used
  (or wasn't) to set rates.

---

## 5. Technician-facing UI

- Add an earnings card to `TechnicianHome`, near the existing stats
  dashboard — per Sunset Water design system:
  - Large `.app-metric` (IBM Plex Mono) styled dollar figure —
    consistent with how other key numbers are already displayed
  - `brand-primary`/`brand-ink` for the figure itself — this is a
    product stat, not a status reading, so no `brand-ok/warn/danger`
    tokens here
  - Small caption beneath: "Estimated — confirmed on your paycheck"
  - Updates immediately (optimistic UI is fine here) when a visit is
    marked complete, matching how other TechnicianHome stats already
    refresh after visit actions

---

## 6. Confirmed decisions (for reference)

- Pay period: semi-monthly, 1st–15th and 16th–end of month.
- Missing pay rate never blocks visit completion — admin-facing alert
  only, non-blocking for field work.
- Reverted/rescheduled visits retroactively adjust the running total —
  totals always reflect current visit state, not a completion-time
  snapshot.
- Bundled bodies of water (e.g. spa folded into pool pay) are modeled as
  an intentional `rateAmount: 0` + `isBundled: true` row, not treated as
  a missing rate.

## 7. ADDENDUM — Multi-tenant: org-configurable pay period settings

**Supersedes the hardcoded semi-monthly assumption in Section 2 and the
first bullet of Section 6.** This app is white-labeled for other pool
service companies, and pay cycles vary by org (weekly, biweekly,
semi-monthly, monthly, and different anchor dates within those). The
period logic must be config-driven per org from the start — Lindley's
specific 15th/last-day cycle becomes that org's *seeded setting*, not
global application logic.

### New table

```
OrgPayrollSettings
- id
- orgId                      unique — one row per org
- payPeriodType: enum [WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY]
- weeklyStartDayOfWeek        nullable enum [SUN..SAT] — used when
                              payPeriodType = WEEKLY
- biweeklyAnchorStartDate     nullable date — first day of a known past
                              pay period, used when payPeriodType =
                              BIWEEKLY to calculate all subsequent
                              14-day windows (biweekly isn't calendar-
                              aligned like semi-monthly, so it needs a
                              fixed reference point)
- semiMonthlySplitDay         nullable int, default 15 — used when
                              payPeriodType = SEMI_MONTHLY (standard is
                              1st–15th / 16th–end of month; this field
                              exists in case an org splits differently,
                              though 15 covers the common case)
- monthlyPayDay               nullable int — used when payPeriodType =
                              MONTHLY, day of month the period resets
- updatedByUserId / updatedAt  audit
```

### Calculation service change
`TechnicianEarningsService`'s period-boundary logic (Section 2) should
take `orgId`, load that org's `OrgPayrollSettings`, and branch on
`payPeriodType` to compute the current period's start/end dates —
rather than the hardcoded 1–15/16–end logic described earlier. Lindley's
org gets seeded with `payPeriodType: SEMI_MONTHLY`, default split day 15
— functionally identical behavior to what's already spec'd, just sourced
from org config instead of hardcoded.

### Settings UI
Nested under **Settings** (matches the existing pattern used for
compliance targets, chemical pricing, etc. — one place admins expect to
find org-wide configuration). New "Payroll" section:
- Pay period type selector (Weekly / Biweekly / Semi-monthly / Monthly)
- Conditional fields based on selection (start day / anchor date / split
  day / pay day)
- This can live on the same Settings page as, or adjacent to, the
  earnings-tracker pay-rate table itself — both are payroll-adjacent
  and an admin setting these up will likely do both in one sitting.

### Note for CC
If Section 2 / Section 6 of this spec were already implemented with the
hardcoded semi-monthly logic before this addendum was read, refactor the
period calculation to pull from `OrgPayrollSettings` rather than leaving
Lindley's cycle hardcoded — this is a correctness issue for any other
org using the product, not just a nice-to-have.

## 8. ADDENDUM — Multi-tenant: configurable pay structure type

**V1 SCOPE: `PER_PROPERTY` only.** Everything spec'd in Sections 1–6
(flat rate per specific body of water, per tech) is what actually gets
built now. Hourly and the other structure types below are architectural
groundwork for future orgs, not v1 work — don't build the
`TechnicianHourlyRate`, `TechnicianFlatVisitRate`, or
`TechnicianPropertyTypeRate` tables or their calculation branches yet.

**What IS worth doing now, cheaply:** add the `payStructureType` enum
field to `OrgPayrollSettings` (Section 7) with `PER_PROPERTY` as the only
value actually wired up, and route the rate lookup through a single
function (see "Note for CC" below) rather than calling `TechnicianPayRate`
directly all over the codebase. That one small discipline choice means
adding a second structure type later is a matter of adding a new branch
to one function, not hunting down every place a rate gets looked up.
Everything below is reference for that future work, not a v1 build list.

<details>
<summary>Future structure types (not v1 — reference only)</summary>

Other orgs may pay hourly, a flat rate per pool regardless of property,
or a rate tiered by property type (residential vs commercial). Hourly in
particular runs on a fundamentally different trigger (time elapsed, not
visits completed), so it needs a real calculation-service branch, not
just more columns, whenever it does get built.

```
TechnicianHourlyRate                 -- payStructureType = HOURLY
- id, orgId, technicianId, hourlyRate, effectiveDate, isActive

TechnicianFlatVisitRate              -- payStructureType = FLAT_PER_VISIT
- id, orgId, technicianId, rateAmount, effectiveDate, isActive

TechnicianPropertyTypeRate           -- payStructureType = PROPERTY_TYPE_TIERED
- id, orgId, technicianId, propertyType, rateAmount, effectiveDate, isActive
```

Hourly dependency: needs clock-in/clock-out data, which may not exist
yet — check for existing time-tracking (or reuse the GPS-gated "I've
arrived" system as the trust anchor) before building this, whenever it
becomes a real request.

</details>

### Note for CC
Build the rate-lookup as a single interface/function (e.g.
`resolveRateForVisit(orgId, technicianId, bodyOfWaterId, visitDate)`)
that returns `{ rateAmount, isBundled }`. For v1 it only needs one
internal path (`PER_PROPERTY`, i.e. `TechnicianPayRate` lookup), but
funneling everything through this one function — rather than querying
`TechnicianPayRate` ad hoc from multiple places — is what makes adding
`payStructureType` branches later a small change instead of a rewrite.

## 9. Remaining open items

- Confirm how visit reversal should be implemented technically — does
  the existing visit-status system support a clean "revert to
  incomplete" transition already (used elsewhere for corrections), or
  does this feature need to add that state-change hook itself?
- CC to confirm whether any time-tracking/clock-in mechanism already
  exists in the codebase (Section 8) before building HOURLY pay
  structure support — this is a real prerequisite, not something to
  assume. If nothing exists, hourly support should be scoped as its own
  follow-up rather than bundled into this feature's initial build.
