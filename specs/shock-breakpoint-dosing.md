# Spec — shock and breakpoint dosing

**Status:** draft, not started. Needs the owner's sign-off on every number marked ◆ before
any of it is built.

## Why

On 2026-11-02 Milennium East (19,000 gal) read **FC 0.0**. The app recommended 2 trichlor
tablets or 0.79 gal of 12% liquid. The arithmetic is right and the answer is wrong — the
owner said so on sight.

`lib/dosing-calculator.ts` computes `(target - current) x constant x volume`. That is the
dose to raise free chlorine **in water with nothing consuming it**. A pool reading zero has
chlorine demand by definition: organics, ammonia, bather waste, early algae. The first
several ppm are destroyed on contact and FC still reads zero afterwards.

There is no breakpoint, shock or demand logic anywhere in the dosing path. The only
occurrence of the word "shock" in the calculator is a code comment.

This matters beyond a short dose. A technician who follows the recommendation, retests and
sees no movement has been told something false by the software, on a commercial pool, in a
state where the health district can close it.

## The three states

Today the calculator has one. It needs three, and **the third is the one that currently
exists in the data**.

| State | Condition | What to show |
|---|---|---|
| **Maintenance** | FC in or near range, no meaningful combined chlorine | Today's linear dose, unchanged |
| **Shock** | demand present (below) | Breakpoint dose, shock-appropriate product, retest instruction |
| **Can't tell** | **TC not measured** | No dose. Ask for a total chlorine reading first. |

"Can't tell" is not a cop-out — it is the honest answer, and it is what the Milennium
reading should have produced. `totalChlorinePpm` was null, so nothing in the system could
distinguish a top-up from a breakpoint job.

## Detecting demand

Combined chlorine is the measurement that decides it:

```
CC = TC - FC
```

Proposed triggers, any one of which means shock rather than maintenance:

- ◆ **FC at or below `SHOCK_FC_FLOOR`** — suggested 0.5 ppm. A pool at or near zero has
  demand whatever else is true.
- ◆ **CC at or above `SHOCK_CC_THRESHOLD`** — suggested 0.5 ppm. CDC/MAHC treats combined
  chlorine above roughly 0.4 ppm as an action level.
- ◆ **FC below the CYA-adjusted minimum**, if the owner wants that model at all — see
  below.

## Breakpoint arithmetic

The industry rule of thumb is to raise free chlorine to **10 x the combined chlorine**:

```
targetFc = 10 x CC
doseOz   = constant x (targetFc - FC) x (gallons / 10_000)
```

Worked, for a hypothetical Milennium reading of FC 0.0 / TC 1.0 at 19,000 gal with
Cal-Hypo 60% (constant 2.23):

```
CC        = 1.0
targetFc  = 10.0 ppm
doseOz    = 2.23 x 10.0 x 1.9  =  42.4 oz
```

Against the 14.1 oz the current maintenance path produced for the same pool — three times
as much, and that is with only 1 ppm of combined chlorine assumed.

**◆ The 10x multiplier needs sign-off.** It is the standard rule of thumb, not a Taylor
table figure, and unlike every existing `dosingConstant` in the catalog it is not sourced
from a published chart. It should live as a named constant with that caveat in its doc
comment, the way `TABLET_MAINTENANCE_GALLONS_PER_WEEK` already does.

## The CYA question — needs a decision, not a default

There are two schools and they disagree, so the software must not silently pick one.

- **Taylor / conventional:** breakpoint is driven by combined chlorine. CYA is a separate
  parameter with its own compliance range.
- **CYA-ratio (TFP and similar):** the meaningful free chlorine is a percentage of CYA —
  commonly ~7.5% as a minimum and ~40% as a shock level. On this model a pool at CYA 40
  needs about 3 ppm minimum and around 16 ppm to shock, regardless of CC.

These produce very different numbers. ◆ **Which model the product follows is the owner's
call.** My recommendation is to implement the combined-chlorine path first, because it is
what the existing Taylor-sourced constants belong to, and treat CYA-ratio as a later
option rather than mixing the two.

Whichever is chosen, the existing CYA warning stays: trichlor adds roughly 3 ppm of
stabiliser per tablet per 10,000 gal, and Nevada's log flags cyanuric acid above 100 ppm as
a closure risk carrying a $909 reopening fee.

## Product selection

**Tablets must be suppressed in the shock state.** Today `lib/dosing-calculator.ts:366`
would still offer a tablet count for a pool at FC 0, which is wrong twice over: an erosion
feeder cannot raise chlorine quickly enough to matter, and trichlor adds CYA at exactly the
moment the pool least needs it.

Shock should prefer a fast, unstabilised product — cal-hypo or liquid. Lindley's has
**Cal-Hypo 60%** and **Liquid Chlorine 12%** enabled today, so no catalog change is needed.

◆ Whether to prefer cal-hypo or liquid for shock is an operational preference, not a
chemistry fact. Cal-hypo adds calcium hardness; liquid adds salt and raises pH.

## Guardrails

- **Never silently exceed the plausibility ceiling.** `PLAUSIBLE.freeChlorinePpm` is
  `[0, 50]`. A breakpoint target above that means the reading is suspect, not that the pool
  needs 60 ppm — surface it as a problem rather than a dose.
- **Say the pool must stay closed until FC falls back in range.** A shock dose puts a
  commercial pool out of compliance on purpose, and the technician needs to be told that
  explicitly, not left to infer it.
- **Always pair with a retest.** The output is "dose, wait, retest" — not a number on its
  own. A shock recommendation that does not ask for a follow-up reading is the same
  mistake in a different place.

## Getting total chlorine entered

None of the above works without TC, and it is currently not being recorded.

The field already exists on `VisitWaterReading` and renders whenever the state ruleset
includes it. So this is a prompting problem:

- ◆ Require TC when FC is below the compliance minimum, rather than always — a hard
  requirement on every visit will be worked around, and the reading only decides anything
  when chlorine is low.
- Show "can't tell" in the Dosing Card with a direct prompt to enter it, so the reason for
  the missing recommendation is visible at the point it can be fixed.

## Integration points

| File | Change |
|---|---|
| `lib/dosing-calculator.ts:366` | suppress the tablet path when in shock state |
| `lib/dosing-calculator.ts` FREE_CHLORINE branch | route to maintenance / shock / can't-tell |
| `lib/dosing-units.ts` | `computeBreakpointDose`, kept Prisma-free so it is unit-testable like `computeTabletRecommendation` |
| `DosingResult.warnings` | already a string array used for cross-chemical advice; a shock state needs more than a warning, so it should be its own field on the payload rather than a string nobody can branch on |
| `lib/reading-bounds.ts` | unchanged |

## What this must not do

- Must not return a linear maintenance dose for a pool with demand. That is the bug.
- Must not invent a CYA-ratio rule without the decision above being made explicitly.
- Must not recommend shocking through a tablet feeder.
- Must not state a breakpoint multiplier as though it were a Taylor table figure.

## Open questions for the owner

1. Combined-chlorine model, CYA-ratio model, or both?
2. ◆ FC floor and CC threshold that mean "shock".
3. ◆ Breakpoint multiplier — 10x, or his own number from experience?
4. Preferred shock product: cal-hypo or liquid?
5. Should the app require total chlorine when FC is low, or only prompt?
6. Should a shock recommendation record anything on the compliance log, given it
   deliberately puts the pool out of range for a period?

---

**A caveat I want on the record:** I am not a CPO and these numbers affect water people
swim in. Everything marked ◆ is a starting point drawn from widely published guidance, not
a figure I can vouch for. The owner's experience should override any of it, and where it
does, the reason belongs in the constant's doc comment so the next person does not
"correct" it back.
