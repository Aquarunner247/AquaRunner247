# AquaRunner 24/7 Pro — Chemical Dosing Calculator Spec

## Overview
Add an automated chemical dosing recommendation engine that runs whenever a
technician logs a chemistry reading. Given the current reading, the body of
water's gallons, the org's chemical product catalog, and the applicable
compliance target, the system calculates how much of which product to add
to bring each out-of-range chemical back to target.

Covers all standard chemicals: Free Chlorine, pH, Total Alkalinity,
Cyanuric Acid (CYA), Calcium Hardness, Salt. Separate formulas for pool vs
spa given differing volume/target profiles.

---

## 1. Data Model

### 1a. Volume Calculator (setup-time tool, not per-visit)

Add a one-time setup flow on the BodyOfWater record (or wherever
`gallons` currently lives) so gallons can be derived instead of guessed:

```
VolumeCalculation (embed on BodyOfWater, or separate 1:1 table)
- bodyOfWaterId
- shape: enum [RECTANGLE, CIRCLE, OVAL, KIDNEY_FREEFORM, MULTI_DEPTH]
- lengthFt, widthFt, radiusFt        (nullable, shape-dependent)
- shallowDepthFt, deepDepthFt
- freeformMeasurementA, freeformMeasurementB  (for kidney/freeform)
- calculatedGallons                  (write-through to gallons field)
- lastCalculatedAt
```

Formulas:
- Rectangle: `L × W × avgDepth × 7.5`
- Circle: `π × r² × avgDepth × 7.5`
- Oval: `L × W × avgDepth × 6.7`
- Kidney/freeform: `(A + B) × W × avgDepth × 6.7` (approximation)
- Multi-depth: split into shallow/deep sections, calculate each as its own
  rectangle/shape, sum the two
- avgDepth (sloped pools): `(shallowDepthFt + deepDepthFt) / 2`

UI: shape picker → relevant dimension fields appear → live-calculated
gallons shown → "Save to property" writes into the existing `gallons`
field. This tool is used once per property (or whenever geometry changes),
not on every visit.

### 1b. Chemical Product Catalog — pre-seeded, not org-entered

Orgs should NOT need to build this list from scratch. Ship a system-wide
seed catalog covering the standard products for all six chemical types
(pool + spa variants where the formula/target differs). An org's setup
work is limited to three things per product: enable/disable ("we use
this"), set their price, and confirm/adjust target level (already covered
by `OrgComplianceTarget`, section 1c). Exact seed values are in
Section 6 (Dosing Formula Reference).

```
ChemicalProductCatalog          -- global, system-maintained, NOT org-scoped
- id
- name                     e.g. "12.5% Liquid Chlorine", "Cal-Hypo 68%"
- chemicalType: enum [FREE_CHLORINE, PH_UP, PH_DOWN, ALKALINITY_UP,
                       CYA, CALCIUM_HARDNESS, SALT]
- poolOrSpa: enum [POOL, SPA, BOTH]   -- BOTH means same product works
                                          for either, dosingFactor scales
- form: enum [LIQUID, GRANULAR, TABLET, PUCK]
- activePercent            nullable — e.g. 12.5, 68.0 (null for
                            count-based products like tabs)
- dosingUnit: enum [OZ, LB, GAL, QUART, TABLET, SCOOP, TSP, TBSP]
- dosingFactor             decimal — per-10,000-gal (pool) or per-100-gal
                            (spa) constant, see Section 6
- defaultMaxDosePerVisit   nullable decimal, in dosingUnit — suggested
                            cap, org can override
- defaultRoundingIncrement decimal — e.g. 0.25 for gal, 1 for tablets
- isSystemDefault          true for all seed rows
- displayOrder             int, for consistent list ordering on the
                            Chemicals admin page

OrgChemicalProductSetting       -- org-scoped, one row per org per
                                    catalog product they've touched
- id
- orgId
- catalogProductId          FK to ChemicalProductCatalog
- isEnabled                 "we use this" checkbox — defaults false
                             until org confirms; drives whether this
                             product is eligible for dosing calc
- price                     org's cost, for the existing billing/
                             products catalog linkage
- isPrimary                 bool — when multiple enabled products share
                             the same chemicalType (+ poolOrSpa), exactly
                             one must be flagged primary; dosing calc
                             uses the primary product automatically,
                             no per-visit tech selection needed
- maxDosePerVisit           nullable override of catalog default
- roundingIncrement         nullable override of catalog default
- linkedBillingProductId    nullable FK to existing chemical products/
                             billing table, if org wants billing tied in
```

**isPrimary enforcement:** on save, if an org enables a second product for
a `chemicalType` + `poolOrSpa` combo that already has a primary, either
prompt them to pick which is primary or auto-default primary to whichever
was enabled first — but the constraint (exactly one primary per org per
chemicalType+poolOrSpa when ≥1 is enabled) should be enforced at the
service layer, not left to the UI alone.

### 1c. Compliance Target Override

```
OrgComplianceTarget
- id
- orgId
- state                    (matches ComplianceRuleset state scope)
- chemicalType
- targetMode: enum [STATE_MIDPOINT, ORG_CUSTOM]
- orgTargetMin             nullable
- orgTargetMax             nullable
- orgTargetValue           nullable (single-point target, if not a range)
```

Resolution order at calc time:
1. Look up `ComplianceRuleset` for the property's state → get legal
   min/max for the chemical.
2. Check `OrgComplianceTarget` for this org/state/chemical.
   - If `targetMode = ORG_CUSTOM` and org values are present, use them
     **as long as they fall within the legal min/max** (never let an org
     override push a target outside the compliance range — clamp or warn
     if configured values are out of bounds).
   - Otherwise default to `(legalMin + legalMax) / 2`.

---

## 2. Calculation Service

New service, e.g. `DosingCalculationService`, called after a chemistry
reading is submitted.

### Input
- `bodyOfWaterId` (resolves gallons, isSpaFlag, state)
- `currentReading` (per chemical: FC, pH, TA, CYA, CalciumHardness, Salt)
- `orgId`

### Per-chemical logic
For each chemical present in the reading:
1. Resolve target (per section 1c).
2. If current reading is within target range → no action, return `null`
   for that chemical.
3. If out of range → determine direction (needs increase or decrease).
4. Select the org's active `ChemicalProduct` for that `chemicalType`
   (if org has multiple active products for the same type — e.g. two
   chlorine sources — either let the tech pick, or default to a
   `isPrimary` flag on `ChemicalProduct`; recommend adding `isPrimary`
   to the schema above).
5. Apply standard dosing formula using `dosingFactor`, `activePercent`,
   and pool `gallons` (industry-standard ppm-per-volume math — happy to
   supply exact reference formulas per chemical type when you're ready
   to implement, since they vary by product form).
6. Round result to nearest `roundingIncrement`.
7. Compare against `maxDosePerVisit`:
   - If calculated dose ≤ cap → return full recommended dose.
   - If calculated dose > cap → return `{ recommendedDose: maxDosePerVisit,
     capped: true, note: "Apply max safe dose now, recheck next visit" }`.

### Sequencing (flag-only, not blocking)
After all per-chemical results are calculated, run a rule pass that
inspects the *set* of recommended actions and attaches non-blocking
warnings, e.g.:
- If both Alkalinity and pH need correction → flag:
  "Adjust alkalinity before pH for best results."
- If Free Chlorine shock and CYA/stabilizer are both flagged → flag:
  "Avoid adding stabilizer same visit as shock treatment."

These are advisory `warnings[]` attached to the result set — the tech can
still apply/log all recommended doses regardless. No hard blocking, no
forced input order.

### Output shape (per body of water, per visit)
```json
{
  "bodyOfWaterId": "...",
  "recommendations": [
    {
      "chemicalType": "FREE_CHLORINE",
      "currentValue": 0.8,
      "targetValue": 3.0,
      "productId": "...",
      "productName": "12.5% Liquid Chlorine",
      "recommendedDose": 1.5,
      "dosingUnit": "GAL",
      "capped": false
    }
  ],
  "warnings": [
    "Adjust alkalinity before pH for best results."
  ]
}
```

---

## 3. UI touchpoints

- On the chemistry reading entry screen, once a reading is submitted,
  show a "Recommended Dosing" card below/beside the reading — one row per
  out-of-range chemical, product name, amount, unit.
- Warnings render as a small advisory banner above the recommendations,
  not blocking submission.
- Capped doses show a visible badge ("Max dose — recheck next visit").
- Volume calculator lives on the BodyOfWater edit screen as a "Calculate
  volume" option next to the existing gallons field.
- Admin settings: new **"Chemicals" page** — pre-populated with every
  seeded `ChemicalProductCatalog` row grouped by chemical type (Free
  Chlorine, pH Up, pH Down, Alkalinity, CYA, Calcium Hardness, Salt),
  pool and spa variants shown separately. Org does NOT add chemicals from
  scratch. Per row:
  - Checkbox — "We use this" (`isEnabled`)
  - Price field (`price`)
  - Target level field — pre-filled with state compliance midpoint,
    editable (writes to `OrgComplianceTarget`)
  - Primary indicator/radio — only shown when 2+ products are enabled
    for the same chemical type, lets org pick which one the dosing calc
    should default to
  - Everything else (dosing formula, active %, form, rounding) is
    system-managed and not editable by the org
  - Compliance Targets are set inline on this same page next to each
    chemical type, rather than a separate screen — one place for both.

---

## 4. Design System Compliance ("Sunset Water")

This feature lives entirely on the **product/cool side** of the design
system (`DESIGN-SYSTEM.md` in repo root) — technician and admin screens,
not marketing. No hex literals; use the existing tokens from
`tailwind.config.ts`. Do not introduce new colors for this feature.

- **Recommended Dosing card** — standard `.app-card` styling on
  `brand-surface`/`brand-foam`, per existing shared classes. Product
  name/amount text in `brand-ink`, secondary/meta text (unit, product
  type) in `brand-muted`.
- **Out-of-range chemical rows** — this is a reading result, so it uses
  the reserved status tokens, not brand colors:
  - Reading currently out of range → `brand-warn` / `brand-warnFill`
    (borderline) or `brand-danger` / `brand-dangerFill` (failing,
    e.g. FC at 0 or pH outside safe range) — match however the existing
    chemistry reading display already classifies WATCH vs FAIL
  - Once corrected/back in range → `brand-ok` / `brand-okFill`
  - Never use `brand-cta` or `brand-accent` to color a chemical status —
    those are marketing/action colors only, reserved rule #3 in the
    design doc
- **"Max dose — recheck next visit" capped badge** — this is a status
  signal, so `brand-warn`/`brand-warnFill`, not a custom badge color
- **Sequencing warnings banner** (e.g. "Adjust alkalinity before pH") —
  advisory, not a reading result — this is chrome/informational, so it
  should use `brand-anchor` or `brand-foam` treatment like other
  informational banners already in the app, NOT a status color (it's not
  reporting a pass/fail, it's a process tip)
- **Numeric values** (ppm readings, dosing amounts, gallons) — use
  `.app-metric` (IBM Plex Mono) per the type system, consistent with how
  other readings/timestamps/IDs are already rendered
- **"Calculate volume" tool button** on the BodyOfWater edit screen —
  standard `brand-primary` button styling (this is a product action, not
  a marketing CTA — `brand-cta` does not apply here)
- **Admin "Chemical Products" and "Compliance Targets" screens** — same
  product/cool palette as the rest of admin; forms use `.app-field`
  shared classes, outlines in `brand-control`
- **Touch targets** — technicians will be tapping "Apply dose" /
  acknowledging capped-dose notes in the field, often in direct sun per
  the outdoor legibility rule — 44px minimum targets, solid fills (no
  translucency) on anything tapped mid-service

If any of the `.app-*` shared classes (card, badge, pill, field) don't
already cover a pattern this feature needs, extend the shared class
rather than styling inline — per rule #5 in the design doc.

## 6. Dosing Formula Reference (Industry Standard)

All constants below are expressed **per 10,000 gallons per unit of ppm
change**. This is the standard industry reference basis (CPO/Taylor/
Orenda-aligned figures). Because dosing is a straight mass-per-volume
relationship, the SAME constants apply to any pool or spa — the app
should compute:

```
amountNeeded = baseConstant × (targetPpm - currentPpm) × (actualGallons / 10000)
```

then round to the product's `roundingIncrement` and clamp to
`maxDosePerVisit`. **This is why `ChemicalProductCatalog` doesn't need
separate pool/spa dosing formulas** — one constant per product works for
both; only the product *choice* (e.g. dichlor over liquid chlorine for a
400-gallon spa) and the display unit (tsp/tbsp for spa-scale amounts
instead of gal/lb) differ. Seed spa-oriented catalog rows with the same
`dosingFactor` as their pool counterpart, just a smaller `dosingUnit`
(TSP/TBSP/OZ) and tighter `roundingIncrement` so a 400-gallon spa doesn't
recommend "0.04 gallons."

### Free Chlorine (raise)
Base: **1 lb of 100%-available chlorine raises 10,000 gal by 12 ppm**
→ constant = 1.333 oz (100% available Cl) per 1 ppm per 10,000 gal

| Product | Active % | Constant (per 1 ppm / 10,000 gal) | Typical dosingUnit |
|---|---|---|---|
| Liquid chlorine (sodium hypochlorite) 10% | 10% | 13.3 fl oz | GAL (roundingIncrement 0.25) |
| Liquid chlorine 12.5% | 12.5% | 10.7 fl oz | GAL / OZ |
| Cal-hypo (calcium hypochlorite) 65% | 65% | 2.05 oz | OZ |
| Cal-hypo 73% | 73% | 1.83 oz | OZ |
| Dichlor (sodium dichlor) 56% | 56% | 2.38 oz | OZ (spa-common; also adds ~0.9 ppm CYA per ppm FC — flag this cross-effect, see warnings) |

*Liquid products: treat fl oz ≈ weight oz for field-practical purposes
(chlorine solution density is close enough to water for this use case).*

### pH — Down (Muriatic Acid, 31.45%)
Base: **~20 fl oz muriatic acid lowers pH by 0.2 per 10,000 gal at
moderate Total Alkalinity (80–120 ppm)**
→ constant = 100 fl oz per 1.0 pH unit per 10,000 gal (at moderate TA)

**Important caveat — flag in UI, don't hide it:** actual acid demand is
TA-dependent (higher TA = more buffering = more acid needed for the same
pH drop). This constant assumes TA in the 80–120 ppm range, which covers
most compliant pools. If TA is outside that range, show the calculated
dose with a note: "Estimate — TA is outside normal range, verify with
acid demand test." Don't silently present it as exact in that case.

### pH — Up (Soda Ash, sodium carbonate)
Base: **6 oz soda ash raises pH by 0.2 per 10,000 gal**
→ constant = 30 oz per 1.0 pH unit per 10,000 gal

Same TA caveat as above applies.

### Total Alkalinity — Up (Sodium Bicarbonate)
Base: **1.5 lb (24 oz) sodium bicarbonate raises TA by 10 ppm per
10,000 gal**
→ constant = 2.4 oz per 1 ppm per 10,000 gal

*(There's no standard "TA down" chemical add — TA is lowered via muriatic
acid + aeration, which is really the pH-down process working alongside
TA reduction. If you want a "lower TA" recommendation, it should defer
to the pH-down guidance rather than get its own product — flag this
relationship in the sequencing warnings rather than double-dosing acid.)*

### Cyanuric Acid / Stabilizer — Up
Base: **13 oz CYA raises level by 10 ppm per 10,000 gal**
→ constant = 1.3 oz per 1 ppm per 10,000 gal

*(No practical "CYA down" chemical — over-stabilized pools require
partial drain/refill, not a chemical dose. If CYA is above range, the
recommendation should be a flagged action item — "Drain X% and refill" —
not a product dose. Worth a distinct output type from the standard
product recommendations, e.g. `actionRequired: "DILUTION"` instead of a
product/amount pair.)*

### Calcium Hardness — Up (Calcium Chloride, 77% dihydrate)
Base: **1.5 lb (24 oz) calcium chloride dihydrate raises calcium hardness
by 10 ppm per 10,000 gal**
→ constant = 2.4 oz per 1 ppm per 10,000 gal

*(Similarly, no chemical lowers calcium hardness — only dilution does.
Same `actionRequired: "DILUTION"` pattern as CYA-high.)*

### Salt (Sodium Chloride, for saltwater chlorine generators)
Base: **8.35 lb salt raises level by 100 ppm per 10,000 gal** — this one
is exact (not empirical) since it's a direct mass/volume relationship
→ constant = 1.336 oz per 1 ppm per 10,000 gal

---

## 7. Open items before implementation

- Confirm whether capped-dose visits should auto-flag the property for a
  priority recheck on the next scheduled visit, or just log the note.
- Spa uses the same pool product seed list for v1 (no separate
  dichlor/sodium bisulfate spa-specific catalog rows yet) — spa bodies of
  water just get smaller doses via the gallons-based scaling described in
  Section 6, displayed in the same units as pool for now. Revisit a
  dedicated spa product list as a fast-follow if techs want spa-scale
  units (tsp/tbsp) or spa-preferred products later.
- CYA-high and Calcium-Hardness-high have no chemical correction (drain/
  refill only) — confirmed this should surface as an `actionRequired`
  flag rather than a false "add X oz" recommendation, per above.
