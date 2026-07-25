# ComplianceRuleset Schema Notes

Data-modeling pass for the multi-state `ComplianceRuleset` rebuild, written before any
schema/migration work per `claude-code-handoff-compliance-ruleset.md`. Source: the 15
patterns indexed in `state-compliance-data.md`'s "★ ARCHITECTURE NOTES" section, checked
against real data from Nevada + 8 new states.

## Current coverage (as of this pass)

All 9 states from `state-compliance-data.md` are seeded via
`prisma/seed-compliance-data.ts` (run one at a time, one commit each, per the handoff's
build order): Nevada, Connecticut, Alabama, Alaska, Arizona, Arkansas, California,
Colorado, Florida. Every other state (all 50 + DC) has a bare stub row from
`prisma/seed-compliance-rulesets.ts`.

**`isSupported` is only ever `true` for Nevada.** The app's actual consumption code
(`lib/compliance.ts`) only knows how to derive its four gated parameters (chlorine, pH,
alkalinity, CYA) Nevada-shaped, with per-field fallbacks to *Nevada's own numbers* for a
row that's missing a value. Flipping any of the other 8 states to `isSupported: true`
today would make the app silently show Nevada's hazard thresholds for that state's
genuinely-unstated fields (Connecticut's missing closure threshold, Colorado's missing
non-oxidizer FC minimum, etc.) — exactly the anti-pattern the handoff's gap-handling
section warns against. Turning a new state on is a deliberate follow-up decision once:
1. a per-state consumption path is built (or the four-parameter special-casing is
   generalized) so a state's *own* gaps surface as "not available" rather than a
   Nevada-shaped fallback, and
2. the in-app state-code reference page is extended past Nevada (currently only Nevada
   has `referenceContent` written).

Every state's real data is fully seeded and queryable today regardless of `isSupported`
— this only gates what the *existing UI* does with it, not whether the data exists.

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
