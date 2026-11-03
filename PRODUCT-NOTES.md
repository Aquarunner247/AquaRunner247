# Product notes — things found in live use

Decisions and gaps surfaced by running the business on this software, as opposed to
findings from reading the code (those are in the code review). Each one is here because it
cost someone real time or would have, and because the answer needs the operator rather
than a developer.

Dated, newest first. Delete an entry when it ships or is decided against.

---

## 2026-11-03 — Moving a stop AND changing its route day makes a duplicate

Moving Monday's Fifty101 to Tuesday creates a hand-added visit on Tuesday. Separately
changing the route so Fifty101 runs Tuesday makes generation create a *route* visit on
Tuesday as well. Two rows for one job.

Neither mechanism can see the other, and that is structural rather than a bug:

- `ensureVisitsGeneratedForDate` dedupes on `recurringStopId`, and a moved visit has none.
- `retractVisitsNoLongerOnThisDay` only removes route-sourced visits, so it will never
  clean up a move.

The operator resolved it by cancelling one of each pair, which leaves two "Skipped"
entries on the technician's day representing no real skipped work.

**Also worth writing down, because it reads as a bug and is not:** a move does NOT stick to
the new day. It creates exactly one dated row. What sticks is the route change. Confirmed
on 2026-11-03 — Pacific Harbors and Playa Vista were moved to Tuesday without a route
change and remain Mon/Wed/Fri/Sat, while Fifty101 had its route changed and is now
permanently Tue/Thu/Fri.

**Options:** detect the collision when a day is viewed and fold the pair into one; or warn
at the moment a route day is changed that this week already has a moved stop for it; or
leave it and document that changing the route day alone is enough.

---

## 2026-11-03 — The dosing calculator has no shock or breakpoint path

Milennium East read FC 0.0 at 19,000 gal. The app recommended 2 tablets or 0.79 gal of
12% liquid, which is arithmetically right and operationally short — the owner said so
immediately.

`(target - current) x constant x volume` is the dose to raise FC in water with nothing
consuming it. A pool reading zero has demand by definition, and the first several ppm will
be destroyed on contact. There is no breakpoint, shock or chlorine-demand logic anywhere in
the dosing path.

Two separate gaps:

1. **Total chlorine is not being entered.** It was null on that reading. Without it nobody
   can tell a top-up from a breakpoint job, and breakpoint is roughly 10x the combined
   chlorine rather than a linear delta. The field already exists; this is a prompting and
   habit problem, not a code one.
2. **The calculator does not flag the case.** When FC is at or near zero, or combined
   chlorine is present, a linear maintenance dose is the wrong answer and arguably should
   not be offered silently. Thresholds need the owner's input rather than a textbook.

---

## 2026-11-02 — Three hostnames serve the marketing site, none redirects

```
aquarunner247.com         200
www.aquarunner247.com     200
aquarunner247.vercel.app  200   <- serves the same permissive robots.txt
```

Three indexable copies split ranking signals and let the wrong host rank. Canonical URLs
shipped in ed77ca0 and mitigate it; the real fix is a redirect to one host.

**The guard that makes it safe is `VERCEL_ENV`.** Redirect only when it is `production`, so
preview deployments on `*.vercel.app` keep working. Without that guard every preview URL
breaks, which is worse than the problem being solved.

Deferred during the Play review because it changes runtime routing.

---

## 2026-11-02 — Customers can see every document on their record

`CustomerDocument` has no visibility flag — I grepped for `internalOnly`,
`visibleToCustomer`, `sharedWithCustomer` and `isPrivate`, and none exists. So anything
staff attach to a customer appears in their portal immediately, including a cost sheet or a
note never meant for them.

Deleting from the portal was removed in 52d269f. Seeing was left alone because hiding
documents is a product decision, not a bug fix.

**If wanted:** a boolean on `CustomerDocument` defaulted so existing rows stay visible, a
filter in the portal query, and a toggle on the admin upload form. Worth deciding
separately whether customers should keep delete rights over documents *they* uploaded —
those are two different permissions and were one before.

---

## 2026-10-19 — Day order is copied from the route, not derived from it

`alignDaysToRoutes` resequences today's route stops toward route order on every schedule
load, and stops doing so once any stop has been started that day ("freeze at first
arrival"). So a hand reorder made in the morning is not guaranteed to survive until the
technician arrives somewhere. Hand-added and moved stops are pinned and unaffected.

Deferred pending an after-hours window; the fix is to derive the day's order from the route
rather than copying it.
