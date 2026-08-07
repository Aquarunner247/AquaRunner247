# ComplianceRuleset Schema Notes

Data-modeling pass for the multi-state `ComplianceRuleset` rebuild, written before any
schema/migration work per `claude-code-handoff-compliance-ruleset.md`. Source: the 15
patterns indexed in `state-compliance-data.md`'s "★ ARCHITECTURE NOTES" section, checked
against real data from Nevada + 8 new states.

## Current coverage (as of this pass)

All 14 states with real data from `state-compliance-data.md` are seeded via
`prisma/seed-compliance-data.ts` (run one at a time, one commit each, per the handoff's
build order): Nevada, Connecticut, Alabama, Alaska, Arizona, Arkansas, California,
Colorado, Florida, Maryland, New Mexico, New York, Georgia, Hawaii. Every other state
(all 50 + DC) has a bare stub row from `prisma/seed-compliance-rulesets.ts`.

**Live (`isSupported: true`): Nevada, Arkansas, Arizona.** Everyone else stays off,
including the 5 states added in this pass (Maryland, New Mexico, New York, Georgia,
Hawaii) -- flipping a state live is a deliberate rollout decision made separately from
seeding its data (see the "Flip Arkansas and Arizona live" commit), not something this
pass changes on its own.

### This pass: re-checking already-seeded states against updated source data

`state-compliance-data.md` was substantially revised after the first 9 states were
seeded -- not just extended with 5 new states. Two categories of fix, both applied here:

1. **Maryland was rebuilt from scratch, not patched.** It was never actually seeded to
   the database before this pass (a bare stub only), so despite the original handoff
   listing it as one of the first 9 states in spirit, no prior data existed to diff
   against. The correct citation is COMAR 10.17.01, not the earlier secondary source's
   wrong 10.17.04 -- several numbers (combined chlorine, alkalinity, calcium hardness)
   and an entire fabricated "Class A-D" facility taxonomy were wrong in that earlier,
   never-seeded draft.
2. **Alabama's CYA indoor-ban conflict is resolved** -- checking the actual county rules
   (Mobile, Jefferson, Baldwin) found no written indoor prohibition, only the flat
   Appendix A/B numeric range. Flipped both CYA rows from `sourceConfidence: "conflict"`
   to `"confirmed"`.
3. **Connecticut, California, Colorado, and Florida's previously-open `GAP` notes are
   now resolved** with real sourced data and updated in place (not just Maryland/Alabama):
   Connecticut's two-tier discretionary/mandatory closure authority and real
   local-district alkalinity/CYA numbers; California's full §65546 fecal/incident
   protocol; Colorado's practically-enforced non-oxidizer chlorine floor and an
   explicit note that Graph #1's curve is a permanent, accepted limitation rather than
   an open item; Florida's real CDC-sourced fecal protocol numbers and a resolved
   record-retention figure.

`lib/compliance.ts`'s `activeChemistryThresholds()` was rewritten to be genuinely
per-state safe before any state besides Nevada could go live: every field now returns
`null` when a state's own data doesn't define it (no more falling back to *Nevada's own
numbers* for a missing row, which was the original design's anti-pattern). Callers
(`dashboard/page.tsx`'s hazard/issue loop, the public QR log's chart props) check each
bound independently and skip it when null, rather than assuming a number always exists.
Verified end-to-end: a pH reading of 6.8 (above Nevada's 6.5 hazard floor, but below
Arkansas's tighter 7.0) correctly triggered Arkansas's own hazard banner with Arkansas's
own numbers in the message; a pH of 6.0 under an Arizona-linked account correctly showed
only as a routine out-of-range issue, never a hazard banner, since Arizona's regulation
excerpt has no hazard tier at all.

**One documented simplification, not a data gap:** Arkansas's alkalinity target always
depends on whether CYA/a stabilized sanitizer is in use (two conditional variants, no
unconditional default) — the app doesn't track that per account/property yet, so
`findThreshold()` in `lib/compliance.ts` has an explicit, deterministic tie-break
(defaults to the "unstabilized sanitizer (no CYA present)" variant). Both numbers are
still fully seeded and visible in the platform-admin compliance preview; only the
*live* dashboard's alkalinity target picks one until the app tracks sanitizer/CYA use.

Connecticut, Alabama, Alaska, California, Colorado, and Florida remain
`isSupported: false` — each has at least one genuine gap in the four parameters the
dashboard actually gates on (no closure threshold at all, an unresolved conflict, a
curve with no extractable data points, etc.), documented as `ComplianceNote` rows and
summarized in each state's section of `state-compliance-data.md`. Every state's real
data is fully seeded and queryable today regardless of `isSupported` — that only gates
what the *live* customer-facing UI does with it. The read-only preview at
`/platform-admin/compliance` shows any state's data regardless of this flag, for review.

## Scope of this pass

This pass builds a schema that can **faithfully store** every pattern below without
per-state special-casing, migrates Nevada's existing hardcoded values into it, and seeds
all 9 states' real data. It does **not** build a full automated rule-evaluation engine for
the newer patterns (event protocols, curves, cross-method dependencies, adaptive frequency)
— those are stored as structured-but-descriptive data, ready for a future engine pass, not
silently dropped or force-fit into a flat threshold. The existing app's actual behavior
(dashboard closure banners, QR log target/hazard lines, CYA cadence) only ever needed four
parameters (chlorine, pH, alkalinity, CYA) for Nevada specifically, so that's the one path
this pass rewires end-to-end as the regression check; the rest of the data is seeded and
available but not yet wired into UI/validation logic.

## Why one flat `ComplianceRuleset` row per state doesn't work anymore

The previous schema had `ComplianceRuleset` hold flat fields like `freeChlorineMinPoolPpm`.
That breaks down as soon as a single state needs:
- more than one value per parameter (pool vs. spa, indoor vs. outdoor, with/without CYA)
- more than one disinfection method, each with a full threshold set (Colorado)
- a frequency that varies by parameter *and* body-of-water type, not just by state
  (Colorado's 2-hour spa bundle)
- closures triggered by something other than a threshold breach (an incident, a lab
  result, equipment performance, N repeated failures)

So the rebuild splits per-state config into one parent (`ComplianceRuleset`, state
identity + citations + documentation) and four children that can each have many rows per
state.

## Shape

```
ComplianceRuleset (one row per state)
├── state, stateName, healthDepartmentName, isSupported
├── jurisdictionLevel: "STATE" | "COUNTY" | "COUNTY_DISTRIBUTED_STATE_DERIVED"
│     (STATE: Alaska, Arkansas, Colorado, Florida. COUNTY: Nevada/SNHD=Clark County,
│      Alabama=Baldwin County, Arizona=Maricopa County. COUNTY_DISTRIBUTED_STATE_DERIVED:
│      California — CDPH is the state regulator but the log sheet itself is
│      Sacramento-County-branded; flagged via a ComplianceNote rather than silently
│      picking STATE or COUNTY, since the source data explicitly calls this ambiguous.)
├── countyName (nullable — "Clark County", "Baldwin County", "Maricopa County")
├── officialCitation, sourceDocument (free text, e.g. "5 CCR 1003-5")
├── recordRetentionMonths (12 for AL/AZ, 24 for CA, null where unstated)
├── logSheetSource: "STATE_PROVIDED" | "BUILT_FROM_CODE" (the file's own legend, made an enum)
├── logSheetSourceLabel, logSheetSourceNotes
├── codeReferenceLabel, codeReferenceUrl, referenceContent (kept from the prior pass —
│     state-level documentation fields, not per-parameter data)
├── chemistryThresholds  → ChemistryThreshold[]
├── frequencyRules       → FrequencyRule[]
├── eventProtocols       → EventProtocol[]
└── complianceNotes      → ComplianceNote[]

ChemistryThreshold (many rows per state — one per parameter × context combination)
├── parameter: free-text string ("FREE_CHLORINE", "PH", "TOTAL_ALKALINITY",
│     "CYANURIC_ACID", "CALCIUM_HARDNESS", "TEMPERATURE", "ORP", "TDS",
│     "COMBINED_CHLORINE", "SATURATION_INDEX", "TURBIDITY", "HYDROGEN_PEROXIDE", ...)
│     — not an enum. New parameters keep appearing per state (ORP, ion generators,
│     saturation index weren't in Nevada at all) and the whole point of this rebuild is
│     "new state = data entry, not a schema change."
├── disinfectionMethod: CHLORINE | BROMINE | HYDROGEN_PEROXIDE | COPPER_ION | SILVER_ION
│     | OZONE | NOT_APPLICABLE  (pattern 9 — Colorado's parallel disinfection tracks;
│     NOT_APPLICABLE for method-agnostic parameters like pH/alkalinity/hardness/temp)
├── bodyOfWaterCategory: nullable free-text ("POOL", "SPA", "WADING_POOL",
│     "SPRAY_GROUND", "SWIM_UP_BAR", null = applies to all types) — pattern 8, 15.
│     Deliberately a plain string, not the app's existing BodyOfWaterType enum: that
│     enum is what a technician picks for a real property and shouldn't have to grow
│     every time a regulation mentions a subtype (Florida swim-up bars, spray grounds)
│     the product doesn't service yet.
├── indoorOutdoor: nullable "INDOOR" | "OUTDOOR" (Florida's lower indoor ceiling,
│     Alabama's indoor CYA question)
├── appliesWhen: nullable free text — the condition this row is scoped to, e.g.
│     "if CYA used", "if chlorinated cyanurates used", "with supplemental oxidizer".
│     Descriptive, not an evaluated expression — see "What's deliberately NOT built" below.
├── minValue, idealMin, idealMax, maxValue — the routine operating range
├── hazardMin, hazardMax — a *separate*, optional tighter/looser pair that triggers
│     closure risk specifically (Nevada's pH 6.5–8.0 hazard band, distinct from its
│     7.2–7.8 target band). Most states collected so far only have one tier (min/max IS
│     the enforced range, no separate hazard escalation) — hazardMin/Max stay null there.
├── unit: "ppm" | "mg/L" | "mV" | "°F" | "" (pH/index)
├── relationalRule: nullable text — cross-field/cross-method checks that aren't a flat
│     range against this parameter alone (pattern 1, 10): Alabama's CYA-conditional FC,
│     Alaska's FAC > 0.5×TAC, Arkansas's Combined = Total − Free, Colorado's ion
│     generators requiring a 0.4 ppm chlorine residual. Stored faithfully as the
│     regulation states it; not auto-evaluated this pass.
├── isCurveBased, curveDescription, curveDataPoints (Json, nullable) — pattern 6.
│     Alaska's Table E and Colorado's Graph #1 both have this shape (a second reading
│     redefines this one's acceptable range via a lookup, not a branch) but neither
│     state's actual data points were extractable from the source excerpt. Per the
│     handoff's explicit instruction, curveDataPoints stays `null` — isCurveBased=true
│     and curveDescription record that the pattern exists and is unresolved, without
│     fabricating a curve.
├── sourceConfidence: "confirmed" | "assumption" | "conflict" | "gap"
└── notes: nullable text (short inline context, e.g. "resolved from earlier open item")

FrequencyRule (many rows per state — testing cadence)
├── parameter (same free-text convention as above, or "ALL" for a bundled reading —
│     Colorado's spa 2-hour disinfectant+pH+temperature bundle)
├── bodyOfWaterCategory (nullable — pattern 8, 11: Alabama's pool-vs-spa cadence,
│     Colorado's per-parameter-by-body-type matrix)
├── facilityAttribute: nullable free text — a property attribute (not a pool type)
│     that changes frequency, e.g. "common_interest_development_under_25_units"
│     (pattern 3, California's small-HOA exception)
├── cadence: human-readable ("3x/day", "daily", "weekly", "hourly", "2x/week no more
│     than 4 days apart")
├── intervalMinutes: nullable int — the same cadence expressed as a single canonical
│     number so both sub-day (Colorado spa: 120) and supra-day (Nevada CYA: 43200 = 30
│     days) frequencies live in one comparable field, instead of separate
│     hours/days/weeks columns
├── isPerformanceBased: bool — pattern 5, California's combined-chlorine cadence is
│     "whatever frequency maintains compliance," not a stated number. cadence/
│     intervalMinutes hold the closest stated approximation (if any); this flag says
│     "don't treat that as a hard fixed interval"
└── notes: nullable text

EventProtocol (many rows per state — closures/reopening NOT driven by a flat threshold)
├── triggerType: free-text ("FECAL_SOLID", "FECAL_LIQUID", "FECAL_FORMED",
│     "FECAL_DIARRHEAL", "PATHOGEN_LAB_RESULT", "UV_DOSAGE_BELOW_MINIMUM",
│     "BACTERIAL_REPEATED_FAILURE", "CHEMICAL_MANUAL_ADDITION", "CLARITY_FAILURE",
│     "CYA_IN_USE", "SILVER_IN_USE", ...) — same data-entry-extensible reasoning as
│     ChemistryThreshold.parameter
├── triggerLabel: human label
├── closureKind: a small fixed vocabulary so the *shape* of the closure logic is
│     queryable without parsing prose —
│       "FIXED_DURATION" (Arizona liquid feces: 24hr)
│       "UNTIL_RETEST_PASSES" (Arizona solid feces)
│       "INDETERMINATE_LAB_RETEST" (Alaska pathogen — pattern 7, no stated turnaround)
│       "N_CONSECUTIVE_FAILURES" (Colorado bacterial — pattern 12)
│       "DESCEND_BELOW_CEILING" (Florida breakpoint reopening — pattern 13, the mirror
│         case of every other state's "restore the minimum")
│       "EQUIPMENT_PERFORMANCE" (California UV dosage — pattern 4)
│       "CHEMICAL_TESTING_OBLIGATION" (Florida's chemical-in-use → dedicated test kit /
│         lab analysis requirement — pattern 14, reuses this table rather than a fifth
│         one since it's the same underlying shape: choosing X creates obligation Y)
├── minimumDurationMinutes: nullable int (1440 for a 24-hour hold)
├── consecutiveFailuresRequired: nullable int (2 for Colorado)
├── reopeningCondition: text — described precisely enough to eventually encode (target
│     chemical, direction, value, hold time) but kept as text this pass, e.g. "Free
│     chlorine >= 2.0 ppm AND pH <= 7.5, maintained 30 minutes" or, for pattern 13,
│     "Free chlorine <= 10.0 mg/L" (recovery is descending, not rising)
├── remediationSteps: nullable text (ordered prose)
├── requiresSeparateTestKit, labAnalysisFrequency — pattern 14's chemical-triggered
│     obligations (Florida: CYA/quat-ammonium/ozone/copper need a dedicated kit; silver
│     needs a full lab analysis every six months)
├── externalReferenceLabel, externalReferenceUrl — pattern re: Florida's fecal protocol,
│     which defers entirely to an external CDC document rather than stating numbers
│     itself. Different from a `gap` ComplianceNote: this is a real citation pointing
│     elsewhere, not missing information.
├── sourceConfidence, notes

ComplianceNote (many rows per state — flagged gaps/conflicts/assumptions)
├── kind: "GAP" | "CONFLICT" | "ASSUMPTION"
├── summary: text
└── detail: nullable text
```

## Patterns 16-38 (this pass) and the fields they needed

The architecture-notes index in `state-compliance-data.md` grew from 15 patterns (the
original handoff) to 38 by the time this pass started. Most of the new ones needed no
schema change at all -- `ChemistryThreshold`/`EventProtocol`'s free-text
`parameter`/`triggerType`/`closureKind`/`appliesWhen`/`notes` fields already cover them,
which is the whole point of keeping those fields data-entry-extensible rather than enums.
Four patterns genuinely needed new columns, added this pass:

- **Pattern 17** (New Mexico: CYA cadence depends on delivery method, not just whether
  it's used) → `FrequencyRule.appliesWhen`, mirroring the field `ChemistryThreshold`
  already had.
- **Pattern 19/29** (New York doubles treatment time when CYA is present; California
  defines an entirely separate CYA-present target) → `EventProtocol.appliesWhen`, so a
  state can have multiple protocol rows for the same `triggerType`, scoped by condition.
  Previously `EventProtocol` had no equivalent of `ChemistryThreshold.appliesWhen` at all.
- **Pattern 18/25** (New York's CT=15,300 as a real substitutable formula; Maryland's
  cited CT diverges from that standard) → `EventProtocol.ctValue`/`ctValueUnit`, a real
  comparable number instead of only prose in `reopeningCondition`. Used to flag Maryland's
  discrepancy explicitly rather than "correcting" it toward the more common figure.
- **Pattern 20** (New York/California: closure cascades to every body of water sharing
  one filtration system) → `EventProtocol.cascadesToSharedFiltration`.

Everything else maps onto existing fields or plain data:

- **Pattern 16/35** (New Mexico's GREEN/RED unified status; Georgia's 10-item unified
  closure checklist) -- non-numeric physical/equipment conditions (clarity, main drain,
  filtration status) are seeded as `ChemistryThreshold` rows with no min/max, just a
  `notes` description of the compliant/non-compliant condition; the shared reopen rule is
  one `EventProtocol` row with a new descriptive `closureKind`
  (`"UNTIL_GREEN_STATUS_RESTORED"`, `"ENUMERATED_CHECKLIST"`) rather than a new column --
  `closureKind` was always a plain string, not an enum, specifically so new shapes like
  this don't need a migration.
- **Pattern 21** (New York: blood is exempt from closure entirely) -- a new `closureKind`
  value, `"NO_CLOSURE_REQUIRED"`.
- **Pattern 23** (Maryland: hold clock starts at verified even distribution, not at
  target concentration) -- a new `closureKind` value,
  `"HOLD_AFTER_VERIFIED_DISTRIBUTION"`, with the mechanic described in
  `reopeningCondition`.
- **Pattern 24** (Maryland: secondary disinfection *reduces* the primary threshold) --
  fits the existing shape exactly: two `ChemistryThreshold` rows for the same parameter,
  one unconditional and one `appliesWhen`-scoped with a lower range and a `relationalRule`
  note.
- **Pattern 26/27** (Connecticut: two-tier discretionary/mandatory closure authority;
  state floor + local district additions) -- two new `closureKind` values
  (`"AUTHORITY_DISCRETIONARY"`/`"AUTHORITY_MANDATORY"`); the state-floor/local-addition
  shape uses `sourceConfidence: "assumption"` plus a `notes` explanation, the same
  convention already used for Colorado's practically-enforced values.
- **Pattern 30** (Florida: situational, non-numeric frequency triggers) -- captured as
  prose in a `ComplianceNote`, not modeled as data (there's no fixed number to store).
- **Pattern 33/34** (Georgia: two-tier operator staffing; rotating sample locations) --
  neither is a reading, threshold, or closure trigger, so both stay as `ComplianceNote`
  rows rather than forcing them into `ChemistryThreshold`/`FrequencyRule`. Revisit if a
  future pass wants to track operator-visit compliance or reading-location metadata.
- **Pattern 36/37/38** (Georgia's 6-point monitoring grid with an explicit contact-time
  boundary; Hawaii's proactive quarterly submission duty; Hawaii's open/closed-system
  reopening split) -- the monitoring grid is exactly what
  `IncidentMonitoringReading`/`ContaminationIncident.targetConcentrationReachedAt`/
  `contactTimeEndedAt` (new tables, this pass -- see below) are shaped around; the
  submission duty is a `ComplianceNote` (no `FrequencyRule` change needed, it's already
  representable as a frequency-rule row with a descriptive `parameter`); the open/closed
  split is two `EventProtocol` rows scoped by `appliesWhen`.

**One known, accepted limitation:** `DisinfectionMethod` (`CHLORINE` | `BROMINE` |
`HYDROGEN_PEROXIDE` | `COPPER_ION` | `SILVER_ION` | `OZONE` | `NOT_APPLICABLE`) is a real
Prisma enum, not free text like `parameter`. Maryland's PHMB (polyhexamethylene
biguanide) reading is the first disinfectant type collected that doesn't fit it --
seeded with `disinfectionMethod: NOT_APPLICABLE` and a `ComplianceNote` flagging the gap,
rather than a migration for one state's one reading. If another state's data introduces
a second non-enum disinfectant, that's the trigger to either add enum values as they
appear or convert the field to free text like `parameter` already is.

## ContaminationIncident / IncidentMonitoringReading (new tables, this pass)

Contamination/fecal-vomit incidents are modeled as their own tables, not extra columns on
`VisitWaterReading` -- schema only this pass, no UI/forms, per the same non-goals
precedent as the rest of this build. Reasons, concretely:

- **Different shape than a routine reading.** A `VisitWaterReading` is one timestamp and a
  handful of values. An incident has a real lifecycle
  (`ContaminationIncidentStatus`: `OPEN` → `UNDER_REMEDIATION` → `VERIFIED_CLEAN` →
  `REOPENED`) with a closure time, a multi-point monitoring grid during remediation
  (Georgia's is six checkpoints; California's is three), a defined contact-time window,
  and free-text remediation notes -- bolting that onto the reading table would mean a
  wide, mostly-null table 364 days a year.
- **A different rule category.** Routine readings validate against `ChemistryThreshold`
  (min/max/ideal). Incidents validate against `EventProtocol` (CT values, hold times,
  contamination-type branches, CYA-presence modifiers) -- genuinely different validation
  paths, not the same one with more columns.
- **Two distinct clock-start moments, not one.** `targetConcentrationReachedAt` (when
  disinfectant first hits target concentration) and `verifiedEvenDistributionAt`
  (Maryland's every-15-ft perimeter check) are different moments in most states' protocols
  -- some states' hold timer starts at the first, Maryland's starts at the second. Georgia
  additionally defines `contactTimeEndedAt` precisely (when concentration begins being
  reduced for reopening, not `reopenedAt` itself). Three separate timestamps because three
  separate things actually happen at different times.
- **Closure cascades belong to the incident, not one reading.** New York's and
  California's "close every pool sharing the same filtration system" rule
  (`EventProtocol.cascadesToSharedFiltration`) is a property of the incident event, so
  `ContaminationIncident.affectedBodiesOfWater` is a many-to-many relation to
  `BodyOfWater`, not a single foreign key -- a per-reading model can't represent "which
  bodies were closed" once cascade rules apply.

`IncidentMonitoringReading` is the child table for the checkpoint grid
(`checkpointLabel` stays free text for the same reason `ChemistryThreshold.parameter`
does -- California's 3-point grid and Georgia's 6-point grid have genuinely different
shapes, and more states will likely add more shapes).

Both new tables get `ENABLE ROW LEVEL SECURITY` explicitly in their migration, matching
the `20260803194700_lock_down_public_schema_from_client_roles` precedent, even though that
migration's default-privilege revocation already keeps `anon`/`authenticated` off any
table created after it.

This is deliberately a **structured record of every flagged item** from
`state-compliance-data.md`, not prose buried in a comment — so "do not silently resolve or
guess at any flagged item" is something the schema itself enforces (a `ComplianceNote` row
has to exist, it can't just be forgotten in a paragraph).

## What's deliberately NOT built this pass

- **No automated rule evaluation for `relationalRule` / `EventProtocol` / curves.** These
  are stored as faithful, structured data (not flattened away, not force-fit into a
  min/max pair that would misrepresent them) but nothing in the app *executes* "is FAC >
  0.5× TAC" or "has this pool failed two consecutive bacterial samples." That's a real
  rule-engine build, out of scope for a schema/data pass per the handoff's own "what done
  looks like" — it lists representing the patterns, not evaluating all of them.
- **No admin UI to edit these records** — seed script only, per the handoff's explicit
  non-goals list.
- **No in-app state-code reference page changes** for the 8 new states — the existing
  `/dashboard/compliance` page still only renders Nevada's `referenceContent`; extending it
  to the other 8 states is a separate pass (also listed as a non-goal here).
- **No fabricated data.** Alaska's Table E and Colorado's Graph #1 curve points, Colorado's
  no-supplemental-oxidizer FC minimum, and Florida/California's externally-deferred
  protocols are all seeded as `null` + a `ComplianceNote`/`isCurveBased` flag, never a
  guessed number.

## Migrating Nevada off the flat fields

Nevada's existing hardcoded values (`freeChlorineMinPoolPpm`, `phTargetMin/Max`,
`phHazardMin/Max`, `alkalinityTargetMinPpm/MaxPpm`, `cyaTargetMinPpm/MaxPpm`,
`cyaHazardMaxPpm`, `cyaTestFrequencyDays`, `closureFeeAmount`, `closureFeeNote`) become:

- 4 `ChemistryThreshold` rows (chlorine — split pool/spa via `bodyOfWaterCategory`, pH,
  alkalinity, CYA), each carrying both its routine range and (for pH/CYA) its hazard pair
- 1 `FrequencyRule` row (CYA, 43200 minutes = 30 days)
- 1 `EventProtocol` row (`closureKind: "CHEMISTRY_HAZARD_THRESHOLD"` — Nevada's closure
  trigger is "a chemistry hazard threshold was breached," not an incident/equipment/lab
  event like the other 8 states' protocols, so it needs its own closureKind value distinct
  from theirs; `reopeningCondition` describes returning within the hazard band,
  `feeAmount`/`feeNote` hold the $909 reopening fee)

`lib/compliance.ts`'s `activeChemistryThresholds()` changes from reading flat fields to
querying these four `ChemistryThreshold` rows (chlorine pool/spa, pH, alkalinity, CYA) and
reassembling the same flat shape the dashboard/QR-log/alerts-bell code already consumes —
so call sites don't change, only where the numbers come from.

## How to add a new state (for future data drops)

1. Add the `ComplianceRuleset` parent row (state identity, citation, jurisdiction level).
2. Add one `ChemistryThreshold` row per parameter × body-type × method combination that
   has a stated number. Leave `hazardMin`/`hazardMax` null unless the source explicitly
   describes a separate closure-risk tier distinct from the routine range.
3. Add one `FrequencyRule` row per distinct cadence. If the source states one frequency
   for "chlorine + pH" together, that's one row with `parameter: "ALL"` rather than two
   duplicate rows.
4. Add `EventProtocol` rows only for closures that aren't already captured by a
   `ChemistryThreshold.hazardMin/Max` breach — i.e., incidents, equipment performance, lab
   results, repeated-failure rules, or chemical-triggered testing obligations.
5. Add a `ComplianceNote` for every gap, conflict, or assumption the source data flags.
   Never resolve one by picking a number — seed `null` and a note instead, and leave
   `isSupported: false` if the gaps are significant enough that showing this state's rules
   live would be misleading.
6. Leave `referenceContent` for a follow-up pass (out of scope here) unless it's trivial to
   write from the seeded data.
