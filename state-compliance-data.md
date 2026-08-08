# State Compliance Data — Extracted from Source Documents

Running log of compliance data extracted from each state's regulations/log
sheets, structured to map directly into the `ComplianceRuleset` model from
multi-state-compliance-spec.md. Hand this whole file to Claude Code once
enough states are collected (or incrementally, your call).

**Legend for `logSheetSource`:**
- `state-provided` — an actual official fill-in form exists, we're replicating it
- `built-from-code` — no official form exists, log sheet fields derived from the regulation text itself

---

## ★ ARCHITECTURE NOTES FOR CLAUDE CODE — read this before building the rule engine

These are patterns that emerged across states so far, showing the
`ComplianceRuleset` model needs to support more than flat single-value
thresholds. Each is detailed in full within its state's section below —
this is just the consolidated index so nothing gets missed on a first
pass. **Read this section before finalizing the schema.**

1. **Cross-field/relational checks** (not just independent min/max per
   reading):
   - Alaska: Free Available Chlorine must be greater than half of Total
     Available Chlorine (a ratio between two readings)
   - Arkansas: Combined Chlorine = Total − Free; if ≥0.2 ppm, breakpoint
     chlorination required
   - Arkansas: Alkalinity target range depends on sanitizer type AND
     whether CYA is present (not one fixed range)

2. **Event-triggered closure protocols** (separate from simple
   reading-threshold closures) — likely needs its own `eventProtocols`
   section in the model, distinct from `chemistryRules`:
   - Arizona: fecal contamination (solid vs. liquid) — mandatory closure
     durations + remediation sequence, not just a retest
   - Arkansas: same category, but with exact numbers (ppm targets, exact
     hold durations, exact pH preconditions) — **use Arkansas as the
     template shape for this section**, it's the most complete example

3. **Facility-attribute-based frequency exceptions** (not just
   pool-type or chemical-type based):
   - California: pools in common-interest developments under 25 units
     get reduced testing frequency (2x/week instead of daily)

4. **Equipment-performance-triggered closures** (distinct from both
   chemistry-threshold and event-based closures):
   - California: spray grounds using UV disinfection must close if UV
     dosage drops below 40 mJ/cm² — a closure trigger based on equipment
     output, not a water chemistry reading or an incident

5. **Performance-based (adaptive) testing frequency**, not a fixed
   cadence:
   - California: combined chlorine must be tested "at a frequency
     required to maintain" the 0.4 ppm max — the required interval
     itself is conditional on staying in compliance, not a stated number
     of times per day/week

6. **Curve/table-based threshold lookups** (one reading redefines another
   reading's acceptable range, via a graph rather than a simple branch):
   - Alaska: minimum Free Available Chlorine isn't a flat number — it's
     read off a pH-dependent curve (18 AAC 30.550 Table E). Contrast with
     Alabama's CYA-conditional FC, which is a simple two-way branch
     (CYA used vs. not); Alaska's is a continuous curve across the whole
     pH range. **Resolved** — the actual graph image confirmed this
     follows the standard HOCl dissociation equilibrium (pKa ≈ 7.5), and
     Alaska's section now has both an approximate lookup table and a
     computable formula: `minimumFAC(pH) = 0.3 × (1 + 10^(pH − 7.5))`.
     Colorado's ORP/pH/chlorine graph (Graph #1) image has since
     surfaced too — qualitative curve direction (higher pH → lower ORP
     for the same chlorine level) is confirmed exactly as expected, and
     the axis units likely tie back to Table 1's 250–900 mV range at
     ×100 scale, but full curve digitization was intentionally not
     attempted given transcription risk from a low-resolution scan; the
     flat 250–900 mV range remains the operative rule since ORP
     monitoring is optional in Colorado to begin with.

7. **Lab-result-triggered closures with indeterminate duration** (distinct
   from chemistry-threshold, event, and equipment-performance closures):
   - Alaska: a positive pathogen test (pseudomonas, etc.) closes the pool
     until a retest confirms it's clear — no fixed reopening window like
     Arizona's 24-hour liquid-feces rule, since lab turnaround time isn't
     specified. The `ComplianceRuleset`/closure model may need to support
     an open-ended "closed pending lab retest" state, not just
     duration-based reopening.

8. **Pool-vs-spa threshold AND frequency both differing**, not just
   threshold values:
   - Alabama: pool chemistry is tested twice daily; spa chemistry
     (higher chlorine/bromine ranges, hotter temp max, different
     hardness range) is tested hourly. Most other states so far apply
     one frequency across all body types and only vary the numeric
     range for spas. Confirm the `ComplianceRuleset` model keys
     frequency by body-of-water type, not just by state.

9. **Multiple parallel disinfection-method tracks**, each with a full
   threshold set, not just one chemistry table per state:
   - Colorado: chlorine, bromine, hydrogen peroxide, and copper/silver
     ion generation each have independent min/max/ideal ranges. The
     model needs a `disinfectionMethod` axis, not a single fixed table.

10. **Cross-method dependency** (a reading from one disinfection method
    is required for another method to be considered compliant):
    - Colorado: ion generators (copper/silver) are only valid "in
      conjunction with a 0.4 ppm chlorine residual" — evaluating
      ion-generator compliance requires checking a second, different
      disinfectant's reading too.

11. **Per-parameter frequency matrix by body-of-water type** (more
    granular than a single frequency per body type):
    - Colorado: pools test disinfectant/pH 3x/day and temperature daily;
      spas bundle disinfectant/pH/temperature together into a 2-hour
      interval. The frequency model may need a full
      parameter × body-type matrix rather than one cadence per type.

12. **Repeated-failure closure trigger** (requires N consecutive
    failures, not a single out-of-range reading):
    - Colorado: bacterial closure only triggers after **two consecutive**
      failed samples, unlike every other chemistry-threshold closure
      collected so far (which act on a single failed reading). The
      closure model may need a "requires N consecutive failures"
      condition type.

13. **Descending-below-a-ceiling reopening trigger** (the mirror case of
    every other state's "restore the minimum" reopening logic):
    - Florida: after breakpoint chlorination/algae treatment, the pool
      may reopen once free chlorine drops **to or below 10.0 mg/L** —
      recovery means a reading coming back *down*, not up. Every other
      state's reopening condition collected so far is "reach or exceed
      a minimum"; this is the opposite direction.

14. **Chemical-triggered equipment/testing obligations** (choosing to use
    a chemical creates its own testing requirement, separate from that
    chemical's numeric threshold):
    - Florida: using cyanuric acid, quaternary ammonium, ozone, or copper
      requires a dedicated test kit for that specific chemical; using
      silver requires a full lab water analysis every six months. The
      `ComplianceRuleset` may need a "chemicals in use" list that drives
      which additional test-kit/lab requirements apply.

15. **Facility subtypes beyond pool/spa with their own full rule sets**
    (not just a chemistry variant of pool vs. spa):
    - Florida: swim-up bars have their own depth limit, turnover time
      (2 hrs vs. the standard 6), mandatory automated dosing controller,
      and food-service rules. Worth confirming whether the
      `ComplianceRuleset`/property-type model needs to support named
      facility subtypes beyond the basic pool/spa/wading distinction.

16. **Unified GREEN/RED status model spanning chemistry AND physical/
    equipment conditions under one close/reopen rule**, rather than
    separate protocols per category:
    - New Mexico: chemistry thresholds, clarity, main-drain condition,
      and filtration/controller status are all represented as the same
      binary status (compliant/non-compliant), with one rule —
      "reopen when GREEN again" — applying uniformly across all of
      them. Contrast with Arizona/Arkansas/Colorado, which each write
      separate protocols for chemistry vs. equipment vs. incidents.

17. **Testing frequency conditional on a chemical's delivery method**,
    not just whether it's used at all:
    - New Mexico: cyanuric acid is tested every 2 weeks if fed
      continuously via stabilized chlorine, but monthly if manually
      dosed outdoors — the same chemical, two different cadences based
      on *how* it enters the water, a more granular condition than any
      other state's flat per-chemical frequency collected so far.

18. **Concentration × time (CT) value as an explicit, substitutable
    formula**, not a single fixed pair:
    - New York: multiple valid (concentration, time) combinations all
      satisfy the same underlying inactivation target (e.g. CT = 15,300
      for Crypto) — richer than Arkansas's single fixed pair for the
      same underlying standard. The `eventProtocols` model could
      represent this as "any pair satisfying concentration × time ≥ X"
      rather than one hardcoded number.

19. **A chemical's presence exactly doubles (or otherwise precisely
    multiplies) a required treatment time**, not just a rough caveat:
    - New York: if cyanuric acid is present during a fecal incident,
      the required disinfection time is stated as an exact double of
      the standard time for the chosen concentration, with worked
      examples — compare to Arkansas's softer "CYA roughly doubles
      treatment time" note for the same underlying effect.

20. **Closure cascades across shared/linked filtration systems**:
    - New York: all venues sharing one filtration system must close
      together during a contamination event, not just the specifically
      affected body of water — relevant if a property has multiple
      bodies of water on shared equipment.

21. **Contamination type changes whether closure is required at all**,
    not just which remediation steps apply:
    - New York: blood is explicitly exempted from the closure
      requirement that applies to fecal/vomit incidents, since chlorine
      readily kills bloodborne pathogens — the first state collected to
      make this distinction explicit rather than treating all bodily-
      fluid contamination the same way.

22. **★ Retracted — was based on the wrong source.** The earlier note
    here ("Maryland breakpoint target = 10× combined chlorine level")
    came from the same secondary source whose COMAR citation turned out
    to be wrong (10.17.04 vs. the actual 10.17.01). The real regulation
    text doesn't mention this formula at all, so it's been dropped
    rather than carried forward unverified — don't seed this rule for
    Maryland unless it resurfaces from a confirmed primary source.

23. **Hold-time clock gated on verified even distribution**, not just on
    reaching the target concentration:
    - Maryland: a formed-fecal/vomit incident's 30-minute disinfection
      hold doesn't start when chlorine is raised — it starts only after
      multi-point sampling (every 15 ft around the perimeter) confirms
      the chemical is evenly distributed throughout the pool. Every
      other state's event-timer collected so far starts from the
      moment the target concentration is reached at one point.

24. **Secondary disinfection method reduces the primary threshold**,
    rather than adding a companion requirement:
    - Maryland: using a copper/silver ion system **lowers** the
      required free chlorine floor (to 0.5–10 ppm or 3.0–8.0 ppm,
      depending on facility type) while it's active. Contrast with
      Colorado's ion generators, which instead **require** a 0.4 ppm
      chlorine residual as a companion reading — the opposite direction
      of cross-method dependency for a conceptually similar setup.

25. **Cross-state CT-value discrepancy in cited event protocols** — a
    reminder not to assume convergence across states without checking:
    - Maryland's diarrheal-incident policy cites 10 ppm free chlorine
      for 16 hours as its reference CT, which computes to a
      meaningfully *lower* CT value (~9,600 ppm·min) than the
      15,300 ppm·min standard that Arkansas, New York, and California
      all converge on independently. Don't assume every state's cited
      number is drawing from the same underlying CDC/MAHC standard —
      seed each state's actual cited figure and flag discrepancies
      rather than "correcting" one toward another.

26. **Two-tier discretionary/mandatory closure authority**, rather than a
    flat "if threshold X, then close" rule:
    - Connecticut: the actual code frames closure as the health
      director's *authority* — discretionary for any violation, but
      *mandatory* specifically for communicable disease evidence,
      significant nuisance, or imminent hazard. Every other state's
      closure logic collected reads as a flat threshold trigger; this
      one is authority-based with two tiers, even though the numeric
      minima still function as bright-line triggers in practice.

27. **State code sets a floor; local health districts commonly layer on
    stricter specifics**, producing two authoritative layers for the
    same state:
    - Connecticut: the state code itself specifies no CYA testing
      cadence and no alkalinity range at all — but local districts that
      adopt the state code (Newtown, Franklin, Meriden, etc.) commonly
      add their own explicit weekly-testing and 80–150 ppm range
      requirements. This differs from Nevada/Alabama/Arizona's simpler
      pattern (the county-level document just *is* the applicable
      rule) — Connecticut needs a state-floor value plus a
      "commonly-adopted local addition" note, since which district
      applies determines the actual enforced number for a given
      customer.

28. **Three documented snapshots per incident**, not one:
    - California: contamination-event chemistry readings must be
      captured at three separate points — discovery, post-disinfection,
      and reopening — rather than a single incident record. Worth
      modeling as three linked timestamped entries per incident.

29. **A chemical's presence creates an entirely separate disinfection
    tier or handling approach**, not just a time multiplier on the base
    protocol — and different states solve this three different ways:
    - California: a diarrheal incident with CYA present gets its own
      distinct target (pH 6.5, 40 ppm chlorine, 30-hour hold) rather
      than a modified version of the no-CYA protocol (20 ppm/12.75
      hrs).
    - New York: handles the same underlying complication (CYA present
      during a fecal incident) by simply doubling the standard
      treatment time instead of defining a wholly separate target.
    - Florida (via its CDC-sourced guidance): offers **removing the CYA
      itself** as the first option (lower to ≤15 ppm via partial
      drain/refill), with a higher-chlorine/longer-time adjustment only
      as a fallback if CYA can't be reduced.
    Three states, three different mechanisms for the same complication —
    don't assume any one of these generalizes to another state without
    checking its actual source.

30. **Situational (non-numeric) testing-frequency triggers**, layered on
    top of a flat baseline interval rather than replacing it with a
    different fixed number:
    - Florida: the regulatory floor is a flat "once every 24 hours," but
      practical enforcement adds a list of situational conditions
      (weather, bather load, recent out-of-range readings, post-
      chemical-adjustment) that call for more frequent testing, rather
      than a different fixed interval for each condition. Every other
      state's frequency rule collected specifies a fixed cadence per
      condition (e.g. Colorado's spa vs. pool intervals); Florida's is
      the first to use open-ended situational judgment instead of a
      hard number.

31. **A required-reading's threshold is a floor only, not a two-sided
    range** — worth not assuming every "min/max" style reading collected
    actually has both bounds:
    - New Mexico: ORP is required at a minimum 650 mV with no
      commonly-listed numeric ceiling, unlike Colorado's full 250–900 mV
      range for the same reading type. Two states, same reading, two
      different threshold shapes.

32. **A chemical's permitted-use scope splits three ways by facility
    subtype**, not just a simple indoor/outdoor binary:
    - New Mexico: cyanuric acid is banned indoors *and* in outdoor
      spas/therapy pools, permitted only in outdoor pools/spray pads —
      more granular than Alaska's simple indoor ban, and structurally
      different from Florida's approach (which still permits CYA in
      spas, just at a lower cap rather than banning it outright).

33. **A formal two-tier operator/responsible-person staffing structure**,
    with its own minimum visit cadence and training-delegation chain —
    deeper than a simple certification requirement:
    - Georgia: a trained operator (DPH-certified) must personally visit
      at least twice weekly with a written assessment each time; a
      "responsible person" can stand in when the operator isn't
      available, but must themselves be trained by the operator or a
      local health department course. Contrast with Colorado's simpler
      CPO/AFO/NSPI certification requirement, which doesn't specify a
      visit cadence or delegation structure.

34. **Water sample collection location rotates on a schedule**, not a
    fixed single point:
    - Georgia: sampling locations rotate around the shallower end of
      the pool for each individual test, with the deepest area swept
      into the rotation once per week. Every other state's sampling-
      location note collected specifies one fixed point (e.g. New
      York's "between inlet/outlet, ~12 inches").

35. **Closure logic unified into one flat enumerated checklist spanning
    chemistry, equipment, safety infrastructure, and events** — a second
    implementation of the same underlying idea as New Mexico's unified
    GREEN/RED status model, done differently:
    - Georgia: ten named conditions (chemistry out of range, equipment
      failure, missing safety gear, a fecal incident, etc.) sit on one
      flat "the pool will be closed if any of the following exist"
      list, rather than color-coding every individual reading the way
      New Mexico does. Both states reject splitting closure logic by
      category — worth treating "unified closure list" as a genuine
      cross-state pattern with (at least) two different
      implementations, not a one-off.

36. **A defined multi-point monitoring grid as the official incident
    record structure, with an explicit definition of when the CT clock
    starts and stops:**
    - Georgia: six evenly-spaced checkpoints (start, four numbered
      intervals, and end) across the full closure window, each
      capturing time/chlorine/pH — more granular than California's
      three snapshots (discovery, post-disinfection, reopening) — and
      Georgia's form explicitly defines Total Contact Time as starting
      when disinfectant reaches target concentration and ending when
      it begins being reduced for reopening, resolving a boundary most
      other states leave implicit.

37. **A proactive periodic submission duty, not just retain-and-produce-
    on-request:**
    - Hawaii: water quality monitoring data must be submitted to the
      department quarterly, on top of the standard 12-month on-site
      retention requirement. Every other state's records rule collected
      so far is passive (keep on file, hand over if asked) — Hawaii
      adds an active push obligation for at least this one data category.

38. **Reopening logic bifurcated by pool system architecture (closed
    vs. open system), not by contamination type or facility type:**
    - Hawaii: a closed-system (recirculating/chlorinated) pool must be
      actively disinfected before reopening after a fecal/vomit
      incident; an open-system (flow-through) pool instead just stays
      closed until water quality testing confirms compliance, with no
      separate disinfection step specified. Every other state's
      fecal-incident branching collected splits on contamination type
      or facility type — this is a structurally different axis.

**★ Source-confidence tracking:** Maryland is the first state where the
chemistry-threshold source itself is a secondary/unverified explainer
rather than a primary government document or official form (see the
confidence note at the top of Maryland's section). If more states end
up sourced this way, the `ComplianceRuleset` model may want an explicit
`sourceConfidence` or `sourceType` field (e.g. `primary-regulation`,
`official-form`, `secondary-summary`) so the app can visually
distinguish verified thresholds from ones still needing confirmation,
rather than presenting all states with equal certainty.

**Bottom line:** the schema sketched in multi-state-compliance-spec.md
(flat `chemistryRules` object) is a reasonable starting point but will
need to accommodate all five patterns above. Recommend designing the
`ComplianceRuleset` model with these in mind from the start rather than
retrofitting after more states reveal the same patterns.

---

## Nevada (existing — for reference)
- Health Department: Southern Nevada Health District (SNHD)
- Status: Fully built, existing production ruleset
- Log sheet: state-provided (SNHD's own form)

---

## Connecticut

- **Health Department name:** Connecticut Department of Public Health
  (DPH)
- **Official citation:** CT Public Health Code § 19-13-B33b — **actual
  code text now confirmed**, not just the earlier DPH guideline summary
  - Official text: portal.ct.gov/-/media/sde/pool-safety/
    dph_pool_safety_codes_19_13_b33b.pdf
  - Connecticut Public Swimming Pool Manual/Design Guide (April 2021),
    which reprints the code, via DPH Environmental Health/Recreation
    Program
- **Has dedicated log sheet:** No → `logSheetSource: built-from-code`

**Chemistry thresholds (from actual code text):**

| Reading | Requirement |
|---|---|
| Free Chlorine — swimming pools (standard) | Minimum 0.8 mg/L (ppm) at all times the pool is open/in use |
| Free Chlorine — if cyanuric acid/chlorinated isocyanurates used | Minimum 1.5 mg/L, **and** CYA capped at ≤100 mg/L |
| Free Chlorine — spas/whirlpools | Minimum 1.0 mg/L |
| pH | 7.2 – 7.8; caustic alkalinity shall not be present |
| Spa/whirlpool water temperature | Max 104°F |
| Clarity | Water clear enough that a Secchi disc or 6" black disc on a white field is clearly visible from the deck at the pool's deepest point |
| Other disinfectants (non-chlorine) | Must be of "equivalent disinfecting strength" — no separate numeric table given, a performance-based equivalence standard rather than a fixed threshold |

**★ Resolved gap — closure trigger, now sourced with real code text:**
Connecticut doesn't use a single fixed "automatic closure number" per
parameter. Instead, § 19-13-B33b(g) gives the Director of Health a
**two-tier closure authority**:
- **Discretionary** ("may order... closed"): any failure to meet the
  regulations, or any condition constituting a public health/safety
  hazard or nuisance
- **Mandatory** ("shall order... closure"): specifically when there's
  significant evidence of communicable disease transmission through the
  pool, the pool is operated so as to constitute a significant health
  nuisance, or imminent safety hazards exist

The numeric minima above (0.8 ppm FC, pH 7.2–7.8, clarity, etc.) are
treated as the triggers for the *mandatory* tier — falling below them is
functionally "significant health nuisance" territory, even though the
regulation states it as an authority/duty structure rather than a flat
"if X then close" rule.

**★ New pattern — two-tier discretionary/mandatory closure authority,
distinct from every fixed-threshold closure model collected so far:**
Every other state's closure logic collected (Nevada, Arizona, Arkansas,
Colorado, New York, etc.) reads as "if reading crosses threshold X, pool
closes." Connecticut's actual code frames this as a **health director's
authority**, with a discretionary tier (may close for any violation) and
a narrower mandatory tier (must close for communicable disease evidence,
significant nuisance, or imminent hazard). Functionally the numeric
minima still act as bright-line triggers in practice, but the
`ComplianceRuleset`/closure model may want to represent an
authority-based tier distinction if this pattern recurs in other states,
rather than assuming every state's closure logic is a flat threshold
rule the way most collected so far have been.

**Testing frequency (from actual code text, § 19-13-B33b(b)(6)–(7)):**
- pH-measuring equipment must be available on-site
- Disinfectant residual and pH: tested **immediately prior to daily
  opening**, and repeated **at sufficient frequency during bather use**
  to keep levels adequate — not a fixed count like "3x/day," but an
  adequacy-based standard (immediate corrective action required if
  levels are found inadequate)
- Daily records of all test results required
- **★ Resolved gap:** the state code itself does **not** prescribe an
  explicit numeric frequency (e.g. "weekly") for total alkalinity
  testing — this was correctly flagged as unstated in the earlier entry,
  and is now confirmed as a genuine gap in the state code itself, not
  just a missing excerpt.

**★ New pattern — state code sets a floor; local health districts
commonly add stricter specifics on top:** Connecticut's state code
doesn't specify a CYA testing cadence or a total alkalinity range at
all. However, **local health districts that adopt and enforce the state
code** (Newtown, Franklin, Meriden, and others cited) commonly layer on
their own explicit requirements: total alkalinity (and CYA, if used)
tested **weekly and within 3 hours of adding make-up water**, with a
maintenance range of **80–150 ppm** (looser upper bound than the
250-earlier-guessed range). This is a two-layer regulatory structure —
state minimum + local district additions — distinct from Nevada/
Alabama/Arizona's simpler "the county-level document just *is* the only
applicable rule" pattern. Worth flagging to Claude Code: Connecticut's
`ComplianceRuleset` record may need to represent a state-floor value
plus a "commonly-adopted local addition" note, rather than a single
authoritative number, since which local district applies determines
the actual enforced rule for a given AquaRunner customer.

**Revised alkalinity range:** 80–150 ppm (local-district-common range,
not a state-code number — see pattern above). This replaces the earlier
80–120 ppm placeholder, which wasn't sourced from anywhere and should be
discarded now that real data exists.

**Cyanuric Acid (CYA) testing frequency — still not a state-code
number, but now backed by a real local-district pattern instead of a
Nevada-matching guess:** weekly, and within 3 hours of make-up water
addition, per the commonly-adopted local district language cited above.
This replaces the earlier "matched to Nevada's cadence, pure business
decision" placeholder — it's still not a *state* requirement, but it's
now a real, sourced local-district convention rather than an arbitrary
assumption. Keep flagged as district-level, not state-level, in the
seeded record.

**Also required in the daily log (non-chemistry):**
- Bather load
- Chemicals used/added (amount)
- Flow meter and pressure gauge reading
- Weather conditions (outdoor pools only)

**Also required periodically (frequency unspecified):**
- Filter backwash dates
- Equipment repair dates
- Hardness test results

**Remaining open items for Connecticut:** none of the substance —
both previously flagged gaps are now resolved with sourced text. The
only residual note is that CYA/alkalinity frequency and range are
*local-district conventions* commonly layered onto the state code, not
state-mandated numbers themselves — worth keeping that distinction
visible in the seeded record rather than presenting them as flatly
equivalent to, say, Alabama's or Arkansas's state-level numbers.

**Non-chemistry facility/safety requirements noted (likely out of scope
for the reading/log-sheet feature, but worth having on file for the
in-app state code summary page):**
- Showering required before entry (soap, 90–105°F water)
- Barrier/fencing minimum 4 ft for outdoor pools
- Lifesaving equipment ratio: 1 unit per 100 ft of pool perimeter
- Required posted signage (no lifeguard warning, pool rules, emergency
  contact info, spa caution signage)

---

## Alabama

- **Health Department name:** Alabama Department of Public Health (source
  documents specifically from Baldwin County Health Dept, Environmental
  Health Section — flag as county-level, same pattern as Nevada/SNHD;
  worth confirming whether this form is used statewide or is
  county-specific)
- **Official citation:** Alabama pool rules — General Provisions document
  covers Section 5 (Circulation Systems/Equipment) and Section 6
  (Electrical/Heaters); **Appendix A (Public Swimming Pool)** and
  **Appendix B (Public Spa)** now provided in full, with the actual
  water-quality parameter tables.
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`
  (Baldwin County Health Dept "Operational Report" form, monthly, one row
  per day)

**Log sheet fields (from actual official form):**
Date, Filter Rate (GPM), Free Chlorine, pH, Alkalinity, Water Temp, Filter
Backwash, Pump Strainer Cleaned, Super Chlorination, Cyanuric Acid,
Calcium Hardness, Initials, Notes.

Form also captures pool type via checkboxes: Outdoor Pool, Indoor Pool,
Wading Pool, Water Attraction Pool, Spa, Therapy Pool, Exercise Pool,
Other. Reports required to be kept on file at the establishment for one
year.

**Chemistry thresholds — Public Pool (Appendix A):**

| Reading | Min | Ideal | Max | Frequency |
|---|---|---|---|---|
| Chlorine | 1.0 ppm | 1.0–3.0 ppm | 3.0 ppm | Twice daily |
| Bromine (if used) | 2.0 ppm | 2.0–4.0 ppm | 4.0 ppm | Twice daily |
| pH | 7.2 | 7.4–7.6 | 7.8 | Twice daily |
| Total Alkalinity (as CaCO₃) | 60 ppm | 80–120 ppm | 180 ppm | — |
| Cyanuric Acid (if used) | 10 ppm | 30–50 ppm | 150 ppm | — |
| Calcium Hardness (recommended) | 100 ppm | — | 200 ppm | — |
| Water Temperature | — | 78–82°F | — | — |
| Total Dissolved Solids | — | — | 1,550 ppm | — |
| Turbidity | Main drain/6" black-and-white disk clearly visible | — | — | Hourly |
| Bacteria | Not required routinely — monitored at Health Dept's discretion | — | — | — |

**Chemistry thresholds — Public Spa (Appendix B) — notably stricter and
more frequent than the pool table:**

| Reading | Min | Ideal | Max | Frequency |
|---|---|---|---|---|
| Chlorine | 2.0 ppm | 3.0–5.0 ppm | 10.0 ppm | Hourly |
| Bromine (if used) | 2.0 ppm | 4.0–6.0 ppm | 10.0 ppm | Hourly |
| pH | 7.2 | 7.4–7.6 | 7.8 | Hourly |
| Total Alkalinity (as CaCO₃) | 60 ppm | 80–120 ppm | 180 ppm | — |
| Cyanuric Acid (if used) | 10 ppm | 30–50 ppm | 150 ppm | — |
| Calcium Hardness (recommended) | 100 ppm | 150–250 ppm | 800 ppm | — |
| Water Temperature | — | — | 104°F | — |
| Total Dissolved Solids | — | — | 1,550 ppm | — |
| Turbidity | 6" black-and-white disk visible at deepest point, or main drain cover visible | — | — | Hourly |
| Bacteria | Not required routinely — monitored at Health Dept's discretion | — | — | — |

**Resolved from earlier open items:**
- Exact CYA range is now confirmed for both pool and spa (10 ppm min,
  30–50 ideal, 150 ppm max) — earlier flagged as an unresolved gap.
- Testing frequency is now explicit, not inferred: **twice daily** for
  pool chlorine/pH, **hourly** for spa chlorine/pH — a notably different
  cadence than the earlier "daily, inferred" placeholder, and a genuinely
  different pool-vs-spa split than most other states collected so far
  (most just apply a single frequency across pool and spa alike).

**★ Resolved — the earlier "indoor CYA ban" flag does not hold up
against the actual county rules:** Checking the core General Provisions
and Appendix A/B text across the major Alabama county health
departments (Mobile, Jefferson, Baldwin), none of them contain an
explicit "CYA prohibited indoors" prohibition as written code. The
appendix's flat 10–150 ppm CYA range (with no indoor/outdoor
distinction) **is the actual rule** — testing equipment for CYA is only
required when stabilized chlorine is in use, and weekly testing is
common practice when it's present, but there's no hard indoor ban in
the county rules themselves.

**What likely produced the earlier "banned indoors" claim:** local
inspector guidance or training materials sometimes discourage or
effectively steer operators away from indoor CYA use on practical
grounds — no UV protection needed indoors, reduced chlorine efficacy,
higher combined-chlorine risk — but that's *operational guidance*, not
a written statewide or county-wide prohibition that overrides the
appendix range. The earlier excerpt likely came from one of these
secondary/training sources rather than the enforceable county code
itself.

**Practical takeaway for the ruleset:** seed Alabama's CYA rule as the
Appendix A/B numeric range (10–150 ppm, no indoor/outdoor branch) as the
enforceable rule. If AquaRunner wants to surface the "CYA indoors is
discouraged in practice" guidance as an in-app tip or warning for
technicians, that's a separate, softer advisory layer — not a
compliance threshold, and shouldn't block or fail a reading the way the
numeric appendix range does.

**Other testing notes:**
- Test method specified: DPD method for disinfectant residual (free/total
  chlorine), phenol red for pH
- Reagents must be dated and replaced on schedule
- Results logged and retained minimum 1 year (matches the log sheet note)

**Additional facility/system requirements (from this excerpt):**
- Turnover rate: pools max 6 hours; wading/spray/therapy pools max 1 hour
  (and these require secondary disinfection); spas max 15 minutes
- Secondary disinfection (UV/ozone) required for "increased-risk venues" —
  must achieve 3-log Crypto reduction per pass, ANSI/NSF 50 listed
- Gas chlorine prohibited
- Turbidity after filtration: max 1.0 NTU
- Filter flow limits: rapid sand ≤3 gpm/ft², high-rate sand ≤20 gpm/ft²,
  DE ≈2–2.5 gpm/ft², cartridge ≤0.375 gpm/ft²

**Non-chemistry facility requirements noted (from Sections 5-6):**
- Circulation/filtration equipment standards (NSF Standard 50 compliance,
  piping specs, flow rates)
- Suction outlet/drain safety per Virginia Graeme Baker Pool and Spa
  Safety Act (federal law, applies regardless of state)
- Heater water temp shall not exceed 104°F (consistent with Appendix B's
  104°F spa max)
- Electrical requirements per National Electrical Code

**No remaining open items for Alabama** — the CYA indoor-ban question
raised earlier is now resolved as a non-issue: the county rules never
contained a hard ban, only the numeric appendix range, plus optional
practical guidance that's advisory rather than a compliance threshold.

---

## Alaska

- **Health Department name:** Alaska Department of Environmental
  Conservation (ADEC) — Division of Environmental Health, Food Safety and
  Sanitation Program
- **Official citation:** 18 AAC 30 (Pool Testing Guidelines doc, plus the
  actual **18 AAC 30.550** regulatory text itself, now provided — covers
  water source/sampling, disinfection, pH, alkalinity, and hardness)
- **Source documents:** "Pool Testing Guidelines" (ADEC guidance doc,
  rev. 6/12/2012) + 18 AAC 30.550 regulatory text — genuinely state-level,
  not county-level, a useful contrast to Nevada/Alabama's county-level
  source docs
- **Has dedicated log sheet:** No separate fill-in form provided →
  `logSheetSource: built-from-code`

**Chemistry thresholds:**

| Reading | Requirement | Frequency |
|---|---|---|
| pH | 7.0 – 8.0 (measured to nearest 0.2; must be maintained in this range while bathers are in the water) | Daily |
| Total Available Chlorine (TAC) | 2.0 – 10.0 mg/l (nearest 0.2mg) | Daily |
| Free Available Chlorine (FAC) | Molecular hypochlorous yield ≥ 0.3 mg/l — **pH-dependent, now resolved with an actual formula/table (see below)**, not a flat ppm number; measured to nearest 0.2 mg/l | Daily, 2x per day |
| Free Available Bromine (FAB) | 2.0 – 4.0 mg/l (nearest 0.2 mg/l) | Daily |
| Alkalinity | **50 – 200 mg/l** (resolved — previously an open gap) | Weekly |
| Total Hardness | **100 – 1,000 mg/l** | Weekly* |
| Calcium Hardness | **Must be at least 70% of Total Hardness** — a proportional/derived requirement, not a flat range | Weekly* |
| Langelier/Saturation Index | **Must stay within ±0.5** (resolved — previously an open gap) | Weekly* |

*Weekly items are conditional per the source doc: required "depending on
whether or not chemicals are routinely added to maintain water quality."

**★ New rule pattern — pH-dependent disinfectant curve, not a flat
threshold:** Alaska's free-chlorine requirement is not "X ppm minimum."
Instead, 18 AAC 30.550 Table E defines a curve: the *minimum* free
chlorine dosage needed to hit the 0.3 mg/l hypochlorous-acid yield
changes depending on the measured pH (lower pH needs less chlorine to
hit the same kill power; higher pH needs more). Practically: read pH →
find the corresponding minimum FAC from the curve → compare against the
tested FAC. This is a genuinely different category from every other
state's chlorine rule collected so far — it's not a fixed number, a
ratio between two chlorine readings (that's the FAC/TAC rule below), or
a performance-based frequency (California) — it's a **second reading
(pH) that redefines the acceptable range of the first (FAC)** via a
lookup curve rather than a simple branch. Worth flagging to Claude Code:
the `ComplianceRuleset` model may need to support curve/table-based
threshold lookups, not just flat values or simple conditional branches.

**Cross-field rule (confirmed, same category as before):** "Chloramines
may not exceed one-half of the total chlorine level" — this is the same
underlying rule as "FAC must be greater than half of TAC," just stated
from the other side (chloramines ≈ combined chlorine = TAC − FAC). Same
category of complexity as Alabama's CYA-conditional Free Chlorine rule
and Arkansas's Combined Chlorine rule.

**New cross-field rule:** Calcium Hardness must be at least 70% of Total
Hardness — another proportional/derived check between two readings,
same pattern family as the FAC/TAC ratio above.

**Additional disinfection system requirements (non-chemistry, but
relevant to equipment/compliance features):**
- Cyanuric acid and chlorinated isocyanurates are **prohibited entirely**
  in Alaska (not just indoors, unlike Alabama) — resolves the earlier
  open question about CYA use
- Only solution feed systems permitted; erosion feed and manual feed
  systems are banned
- Gas chlorinators capped at 3 lbs chlorine per 10,000 gallons per
  24-hour period
- Chemical dispensing must be mechanical; hand application only allowed
  during emergencies, and only while the pool is closed to bathers

**★ New closure-trigger category — pathogen lab result, not a field
reading or an incident:** If a water sample tests positive for
pseudomonas or other pathogens, the pool must close and stay closed
until a retest confirms the water is free of the pathogen. This is
distinct from Arkansas's chemistry-threshold closures, Arizona/Arkansas's
event-based (fecal incident) closures, and California's
equipment-performance closures — it's triggered by a **lab test result**
with an unspecified turnaround time, meaning the closure state may need
to persist across an indeterminate waiting period rather than resolving
on the next same-day reading.

**Water sampling / bacterial standards (lab-based):**
- Collected at least monthly while the pool is in use (matches earlier
  "submit water sample monthly" note)
- Max 200 bacteria/mL (standard agar plate count) or zero confirmed
  coliform per sample
- Must be examined by a department-certified lab per Standard Methods,
  16th Edition

**Also required daily (non-chemistry):**
Flow rate, pressure/vacuum readings, hours pumps/filters in operation,
number of users, hours of operation, amount of water/chemicals added,
equipment failures/repairs, date filter backwashed/cleaned.

**Monthly requirements:**
- Submit water sample for bacterial analysis to a lab
- Send pool log to ADEC

**★ Resolved — Table E curve now available, plus a working formula:**
The actual graph image confirms the curve is exactly what the rule
description implied: **minimum required free chlorine increases as pH
increases**, tracking the standard hypochlorous acid (HOCl) dissociation
equilibrium. The graph's own axis range (Cl from 0.4 to 1.5 mg/l across
pH 7.0–8.0) matches the classic HOCl/OCl⁻ dissociation curve almost
exactly, with an effective pKa around 7.5 — consistent with the graph's
curve inflecting near the middle of its pH range and with other states'
documents noting "ideal pH approximately 7.5" as the point of maximum
disinfection efficiency per unit of chlorine.

Approximate minimum FAC required at each pH, read from the curve and
cross-checked against the HOCl dissociation formula (see below — these
two methods agree closely, which is a good confidence signal):

| pH | Approx. Minimum FAC (mg/l) |
|---|---|
| 7.0 | ~0.4 |
| 7.1 | ~0.42 |
| 7.2 | ~0.45 |
| 7.3 | ~0.49 |
| 7.4 | ~0.54 |
| 7.5 | ~0.60 |
| 7.6 | ~0.68 |
| 7.7 | ~0.78 |
| 7.8 | ~0.90 |
| 7.9 | ~1.05 |
| 8.0 | ~1.25–1.5 |

**Underlying formula, if Claude Code wants computed logic instead of a
lookup table:** the curve follows the HOCl dissociation equilibrium,
where the fraction of total free chlorine present as active HOCl at a
given pH is `1 / (1 + 10^(pH − pKa))`, with pKa ≈ 7.5 for chlorine in
water. Since the rule requires HOCl yield ≥ 0.3 mg/l at all times, the
**minimum total free chlorine needed at a given pH** is:

```
minimumFAC(pH) = 0.3 × (1 + 10^(pH − 7.5))
```

This produces the same shape as the table above and would let the rule
engine compute a minimum threshold for any measured pH rather than
needing a hardcoded lookup table with fixed steps — worth using the
formula directly if the schema can support a computed/derived threshold
type, falling back to the table above (rounded to the nearest 0.1 pH)
if a simple lookup is easier to implement quickly.

**Caveat on precision:** these values are reconstructed from the
graph's visible axis range and the known chemistry of chlorine
dissociation, not measured pixel-by-pixel off the curve — treat as a
close, usable approximation rather than a certified-exact transcription
of the original 1970s-era regulatory graph. Good enough to build real
logic against; if exact legal precision ever matters (e.g. a disputed
inspection), the original graph should be consulted directly rather than
relying solely on this reconstruction.

---

## Arizona (Maricopa County)

- **Health Department name:** Maricopa County Environmental Health Code
  (county-level — same pattern as Nevada/SNHD and Alabama/Baldwin County;
  worth confirming whether this applies statewide in Arizona or is
  Maricopa-specific)
- **Official citation:** Maricopa County Environmental Health Code,
  Chapter VI, Section 2 (Water Quality Standards), R 2-18-04
- **Has dedicated log sheet:** No → `logSheetSource: built-from-code`

**Chemistry thresholds:**

| Reading | Requirement |
|---|---|
| Free Chlorine — pools | 1.0 – 5.0 ppm |
| Free Chlorine — hydrotherapy pool/spa | 3.0 – 5.0 ppm |
| pH | 7.2 – 7.8 |
| Bromine — pools | 2.0 – 4.0 ppm |
| Bromine — spas | 3.0 – 5.0 ppm |
| Total Alkalinity | 60 – 180 ppm |
| Cyanuric Acid / chlorinated isocyanurates (if used for stabilization) | Max 100 ppm |
| Temperature (heated water) | Max 104°F |

Test method specified: DPD method (or equivalent per "Standard Methods
for Examination of Water or Wastewater") for free chlorine residual.

**Testing frequency:** pH, disinfectant residual, total alkalinity, and
temperature tested **at least once daily**. Operating log must be
maintained for **12 months** and made available to the Department, other
regulatory authorities, or the public upon request.

**Bacterial standards (lab-based, not a field reading):** no more than
15% of water samples may exceed 200 bacteria/mL (agar plate count) or
show confirmed coliform presence. Frequency not explicitly stated in this
excerpt — described as collected "on a routine basis" at the Department's
discretion, unlike Alaska's explicit "monthly" requirement.

**Physical standards:**
- Water must be clear enough that the main drain outlet is visible from
  the deck (or a 200mm Secchi disk at the deepest point is visible)
- Surface free of scum/floating debris; bottom/sides free of sediment,
  dirt, slime, algae

**★ Closure protocol — first state with explicit trigger logic
(Regulation 7, Fecal Contamination):**

This is the clearest closure-trigger example we've collected so far —
worth using as a model for how the closure-risk banner logic should be
structured in the rule engine.

- **Solid feces found:** Pool closes immediately (all bathers exit) →
  feces removed/disposed → water retested for compliance with Reg 4 →
  pool may reopen only once retest confirms compliance
- **Liquid feces found:** Pool closes immediately → **must stay closed
  minimum 24 hours** → liquid feces removed as much as possible → shock
  treatment applied → retest 24 hours after shock treatment → pool may
  reopen only once that retest confirms compliance

This is a genuinely different *kind* of rule than anything captured so
far — it's event-triggered (a contamination incident) rather than
reading-triggered (a chemistry value out of range), and it mandates a
minimum closure duration plus a specific remediation sequence, not just a
single retest. Worth flagging to Claude Code that the `ComplianceRuleset`
model may need an `eventProtocols` section (separate from
`chemistryRules`) to represent incident-based procedures like this one,
distinct from simple reading-threshold rules.

---

## Arkansas

- **Health Department name:** Arkansas Department of Health (ADH),
  Environmental Health Protection (genuinely state-level source)
- **Official citation:** Arkansas Act 623 of 1987 (as amended); ADH Rules
  & Regulations effective August 1, 2012 ("Arkansas Rules and Regulations
  Pertaining to Swimming Pools and Other Related Facilities"); numeric
  parameters per **AR Appendix B**; also references Model Aquatic Health
  Code (MAHC) 5th Edition
- **Source document:** "Guidelines for Arkansas Pools, Spas, and Other
  Aquatic Facility Operators" — Updated Edition, 2026 (comprehensive ADH
  operator manual, technical review by Forrest Montgomery)
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`.
  **This document confirms the exact same form fields as the earlier
  EHP-3 spreadsheet** — the "Swimming Pool Daily Operation Record" shown
  here (p.40) matches what was already captured, and this document
  explicitly labels it **Required**.

**Log sheet fields (confirmed, Required):**
Date, Free Chlorine, pH, Alkalinity, Hardness, Chemicals Added (Cl Added,
Soda Ash, Acid, Other), Water Temp, Make-up Water, Backwash, Bather Load,
Accident, Remarks, Signature. Keep original in files; submit to county EHS
on request.

**Two additional required forms surfaced by this document** (not just
suggested — explicitly marked "Required"):
- **Record of Pool Contamination Incident** — captures date/time, person
  responsible, illness symptoms, contamination type (formed stool /
  diarrheal / vomit / blood / other), decontamination steps performed
  (checkboxes matching the exact protocol below), closure/reopen times,
  whether reported to local health dept
- **Report of Accident or Drowning** — victim info, activity at time of
  incident, lifeguard status, emergency response taken, degree of
  treatment required

This directly resolves the "Accident column" question flagged earlier —
Arkansas has a fully specified separate incident form this ties into.

**Chemistry thresholds — full table (previously an open gap, now
resolved):**

| Reading | Min | Ideal | Max | Test Interval |
|---|---|---|---|---|
| Free Chlorine — pool | 1.0 | 1.0–3.0 | 5.0 | Daily |
| Free Chlorine — spa | 2.0 | 3.0–5.0 | 5.0 | Daily |
| Free Chlorine — spa, if stabilizer used | 1.5 | — | 5.0 | Daily |
| Combined Chlorine — pool/spa | none | none | 0.2 | Weekly |
| Bromine — pool | 2.25 | 2.25–4.0 | 4.0 | Daily |
| Bromine — spa | 2.25 | 3.0–5.0 | 5.0 | Daily |
| pH | 7.0 | 7.4–7.6 | 7.8 | Daily |
| Total Alkalinity (unstabilized sanitizer) | 60 | 80–100 | 180 | Daily |
| Total Alkalinity (stabilized/CYA present) | 60 | 100–120 | 180 | Daily |
| Cyanuric Acid | none | 25–40 | 90 | Weekly |
| Total Dissolved Solids | 300 | 1,000–2,000 | 3,000 | Monthly |
| Calcium Hardness | 150 | 200–400 | 500–1,000 | Monthly |
| Heavy Metals | none | none | — | Suspect-only (not routine) |
| Temperature — spa | — | — | 104°F | Daily |
| ORP (supplemental, does not replace DPD) | 650 mV | — | — | Daily |

**Important cross-field/derived rules (same category as Alabama's
CYA-conditional FC rule and Alaska's FAC/TAC ratio):**
- **Combined Chlorine = Total Chlorine − Free Chlorine.** If result ≥ 0.2
  ppm → breakpoint chlorination required.
- **Alkalinity target depends on sanitizer type AND whether CYA is
  present** — not a single fixed range (see table above).
- CYA above 50 ppm is called out as "high" and is known to interfere with
  alkalinity readings, chlorine kill time, and ORP sensor accuracy — a
  useful "soft warning" threshold distinct from the hard 90 ppm max.

**★ Closure protocol — most detailed and explicit found so far
("When to Close a Pool," an actual named section):**

Numeric/chemistry-based immediate closure triggers:
- Free chlorine below 1.0 ppm (pools) or below 2.0 ppm (spas); bromine
  below 2.25 ppm
- Free chlorine above 5.0 ppm; bromine above 4 ppm (pools) / 5 ppm (spas)
- pH below 7.0 or above 7.8
- Main drain not visible from deck (clarity failure)

Non-chemistry immediate closure triggers (extensive list): missing/broken
main drain cover, electrical hazard, power outage, drowning, lack of
required lifeguard supervision, no emergency phone access, fecal
accident (until decon complete), structural hazard, missing safety
equipment, no barrier/gate, lightning within 10 miles or tornado warning
("30/30 rule" — wait 30 min after last thunder/lightning before
reopening), flooding, salt cell malfunction with no backup tablet feeder,
flow meter out of range, unblocked vacuum port, no lifeline where
required (>5.5 ft depth).

**★ Fecal/vomit contamination protocol — the most detailed version of
this event-type rule collected so far, with exact numbers (compare to
Arizona's less-detailed version):**

- **Formed stool:** clear pool → remove stool with net/scoop (never pool
  vacuum) → raise free chlorine to **≥2.0 ppm** → pH ≤7.5 → **maintain 30
  minutes** with filtration running → confirm FC before reopening
- **Diarrheal stool:** clear pool → remove matter → raise free chlorine
  to **20 ppm** → pH ≤7.5 (critical) → **maintain for 12.75 hours**,
  filtration running continuously → backwash filter after treatment →
  confirm FC has returned to normal range before reopening
- Note: this protocol assumes CYA <50 ppm; higher CYA roughly doubles
  required treatment time (chlorine's effective killing power is reduced)

This is a strong reference model for how `eventProtocols` should be
structured in the `ComplianceRuleset` — it has exact target ppm, exact
hold duration, and exact pH precondition, which is more actionable than
either Connecticut's absence of any closure rule or Arizona's
procedural-but-non-numeric version.

**Additional operational notes worth keeping on file (not reading/log
fields, but relevant to the product):**
- Naegleria fowleri risk section — a 2023 fatal Arkansas case (splash pad)
  is specifically cited; reinforces minimum FC compliance as the primary
  defense, and flags splash pads/warm water features as elevated risk
- Salt chlorine generators: acceptable as primary disinfection in
  Arkansas, provided a backup tablet feeder is plumbed in and ready
- Turnover time maximums: pools 6 hrs; wading/therapy/slides 2 hrs (4 hrs
  if built pre-2003 and unremodeled); spas 30 min; splash pads
  case-by-case
- Max Bather Load has an actual Arkansas-specific formula (SPMBL) —
  different for indoor vs outdoor pools, worth noting if bather load
  calculations are ever built into the product

**No remaining open items for Arkansas** — this document resolved every
gap from the earlier partial entry.

---

## California

- **Health Department name:** California Department of Public Health
  (state-level regulation); the log sheet itself is branded **Sacramento
  County** Environmental Health, but its numbers directly mirror the
  state code — functionally a state-standard form even though
  county-distributed. Worth confirming with Claude Code whether to treat
  this as `state-provided` at the state level or note it's
  county-distributed but state-derived.
- **Official citation:** California Code of Regulations (CCR), Title 22,
  Division 4, Chapter 20 — specifically **§65523** (Operation Records),
  **§65529** (Public Pool Disinfection), **§65530** (Public Pool Water
  Characteristics); also California Health and Safety Code §116048
  (small common-interest development exception, see below)
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`
  ("Pool/Spa Daily Maintenance Log")

**Log sheet fields:**
Date, Chlorine residual (free chlorine), pH, Chemicals Added (type and
amount), Temp (°F), Other Maintenance (backwash etc.) — one row per day.
Plus a separate monthly line: cyanuric acid test result + date.

**Chemistry thresholds (from actual CCR Title 22 legal text — high
confidence):**

| Reading | Requirement |
|---|---|
| Free Chlorine — public pools (no CYA) | 1.0 – 10.0 ppm |
| Free Chlorine — public pools (with CYA) | 2.0 – 10.0 ppm |
| Free Chlorine — spas/wading pools/spray grounds | 3.0 – 10.0 ppm (same range regardless of CYA use) |
| Bromine — public pools | Minimum 2.0 ppm, no stated max |
| Bromine — spas/wading pools/spray grounds | Minimum 4.0 ppm, no stated max |
| pH | 7.2 – 7.8 (log sheet separately notes 7.4–7.6 as a non-binding "ideal") |
| Cyanuric Acid | 0.0 – 100.0 ppm (log sheet separately notes 20–50 ppm as a non-binding "ideal") |
| Combined Chlorine | Max 0.4 ppm |
| Water Temperature | Max 104°F |

**Testing frequency (codified directly in §65523 — genuinely a
recordkeeping *law*, not just a guideline):**
- Disinfectant residual + pH: minimum once per day
- Heated pools — water temperature: minimum once per day
- Automatic monitoring/control systems permitted if agent-approved and
  per manufacturer spec
- Cyanuric acid (if used): minimum once per month
- **Combined chlorine: tested "at a frequency required to maintain"
  the 0.4 ppm max** — this is a *performance-based* frequency
  requirement, not a fixed cadence (contrast with Arkansas's flat
  "weekly"). This is a new rule *type*: the required test frequency
  itself is conditional on maintaining compliance, not a stated interval.
- Routine maintenance/repairs: written record required, no fixed
  frequency
- **Records retained minimum 2 years** — longer than any other state
  collected so far (Arizona/Alabama were 12 months, Arkansas doesn't
  state a duration for the daily log specifically)

**★ New rule category — facility-size exception to testing frequency:**
Per California Health & Safety Code §116048, public pools in **common
interest developments with fewer than 25 separate units** (e.g. small
HOA/condo pools) get a *reduced* testing requirement: instead of daily,
only **twice per week, no more than 4 days apart**. This is the first
state where the *testing frequency itself* varies based on a facility
attribute (unit count) rather than pool type or chemical type. Worth
flagging to Claude Code — the `ComplianceRuleset` model may need to
support facility-size/type-based frequency overrides, not just fixed
per-state cadences, if this pattern shows up elsewhere too.

**★ New rule category — UV-dosage-based closure trigger:**
Spray grounds/water features using UV light disinfection must maintain
continuous UV dosage of **at least 40 mJ/cm²** while in use. If dosage
drops below that threshold, **the operator must close the spray
ground/water feature** — an equipment-performance-triggered closure, a
category distinct from both chemistry-threshold closures (Arkansas) and
event-based closures (Arizona/Arkansas fecal protocols).

**★ Resolved — full §65546 recordkeeping and disinfection protocol now
available.**

**Recordkeeping requirements (§65546(b) + §65523(d)–(e)):**
The operator must **immediately document** each fecal, vomit, blood
contamination, drowning, or near-drowning incident, kept on-site (and
identifying the specific affected pool if there's more than one).
Required fields:
1. Date/time, affected pool, free chlorine/temperature/pH **at the time
   of the incident** — and this same set of readings must be documented
   **again after disinfection completes, and again at reopening** (three
   separate documented snapshots per incident, not just one)
2. Whether the fecal stool was formed or diarrheal
3. The procedures actually followed in response
4. Number of pool users present, and the time elapsed between
   occurrence, detection, and resolution

Retention: minimum **2 years**, alongside daily chemical/temperature
logs, CYA records, and maintenance/repair records — matches the 2-year
retention already noted for California's routine logs. Records must be
produced to the local environmental health agent on request. **No
state-prescribed form** — only the required content/fields are
codified; local health departments often provide their own sample
incident-log forms.

**★ New pattern — three documented snapshots per incident, not one:**
Every other state's event-protocol documentation collected so far
implies a single incident record. California explicitly requires
capturing chemistry readings **three separate times** for the same
incident: at the moment of discovery, immediately after disinfection
completes, and again at reopening — worth modeling as three linked
timestamped entries per incident, not one row.

**Disinfection protocol (§65546(a)):**
1. Immediately close the affected pool **and all interconnected pools
   sharing the same filtration system** (matches New York's
   shared-filtration cascade pattern)
2. Remove contaminating material, dispose to sanitary sewer/approved
   wastewater process; clean and disinfect removal tools
3. Ensure pH ≤ 7.5
4. Maintain water temperature ≥ 77°F (25°C)
5. Keep filtration running throughout disinfection
6. **Disinfection targets, branching three ways** (a third tier beyond
   the two-tier formed/diarrheal split every other state uses):
   - **Formed fecal stool or vomit:** free chlorine ≥2 ppm for **at
     least 25 minutes**
   - **Diarrheal stool (no CYA in the water):** raise free chlorine to
     **20 ppm, hold ≥12.75 hours** — matches Arkansas's and New York's
     numbers almost exactly, further confirming this is the shared CDC/
     MAHC standard, not a one-off
   - **Diarrheal stool (CYA present) — a third tier not seen in any
     other state's protocol collected so far:** lower pH to **6.5**,
     raise free chlorine to **40 ppm**, hold for **at least 30 hours** —
     a stricter, CYA-specific treatment tier, distinct from New York's
     approach of simply *doubling the standard treatment time* when CYA
     is present. California instead defines an entirely separate target
     (different pH, higher chlorine ceiling, longer hold) rather than a
     multiplier on the base protocol.
   - **Blood:** check free chlorine at the time of the incident; if
     below the required minimum, close until the minimum is restored —
     notably **less lenient than New York's blood exemption** (which
     explicitly waives closure for blood spills in water). California
     still requires closure if chlorine is already out of range, but
     doesn't treat blood as inherently lower-risk the way New York does.
7. Test free chlorine at **multiple points** throughout the pool to
   confirm the target concentration is achieved pool-wide, not just at
   one sampling location, for the full disinfection duration
8. After disinfection: replace affected cartridge filters; backwash
   non-cartridge filters (discharge to sanitary sewer/approved disposal
   — never back into the pool); replace filter media if needed
9. Reopen only once disinfection is complete and free chlorine/pH are
   back within §65529/§65530's normal operating ranges

**Near-drowning/drowning:** triggers the same documentation and full
response protocol as a contamination incident. Many local health
departments apply the **diarrheal-level (stricter) disinfection tier**
to an unconfirmed near-drowning/drowning if fecal/vomit/blood
contamination can't be ruled out — a "treat the unknown as the worst
case" default, worth flagging as a local-district judgment call layered
on top of the state's baseline rule (same state-floor/local-addition
shape as Connecticut's pattern, though here it's a stricter default
rather than a numeric addition).

**★ New pattern — a chemical's presence creates an entirely separate
disinfection tier, not just a time multiplier:** Compare California's
CYA-present diarrheal tier (different pH target, different chlorine
ceiling, different hold time — 6.5/40ppm/30hrs vs. the no-CYA case of
20ppm/12.75hrs) against New York's approach to the same CYA-during-
incident scenario (same target concentration, but the required time is
simply doubled). Two states, two different mechanisms for handling the
same underlying complication — worth representing as genuinely
different protocol variants rather than assuming one state's approach
generalizes to the other.

**No remaining open items for California** — this resolves the
previously flagged §65546 gap completely.

---

## Colorado

- **Health Department name:** Colorado Department of Public Health and
  Environment (CDPHE), Water Quality Control Division — genuinely
  state-level (like Arkansas and Alaska), not county-distributed
- **Official citation:** 5 CCR 1003-5 ("Swimming Pools and Mineral
  Baths"), Section 4.7 Table 1 for chemistry, Section 4.9 for the
  record-keeping frequency schedule
- **Has dedicated log sheet:** No official fill-in form provided — the
  regulation specifies *what* must be recorded and *how often*, but not
  a state-issued form → `logSheetSource: built-from-code`

**Chemistry thresholds (Table 1, § 4.7 — visually confirmed against the
actual regulation table image, every value and footnote matches exactly)
— the most detailed disinfection
table collected so far, covering multiple disinfection methods, not just
chlorine/bromine:**

| Parameter | Min | Max | Ideal Min | Ideal Max |
|---|---|---|---|---|
| Free Chlorine — pool (DPD) | 0.25 ppm* | 5.0 | 1.0 | 3.0 |
| Free Chlorine — spa/therapy pool (DPD) | 0.25 ppm* | 5.0 | 3.0 | 5.0 |
| Combined Chlorine | 0.00 | 1.0 | 0.0 | 0.0 (ideal is none at all) |
| Bromine — pool (DPD) | 1.5 | 5.0 | 2.0 | 3.0 |
| Bromine — spa/therapy pool (DPD) | 2.0 | 10.0 | 3.0 | 5.0 |
| Total Alkalinity (CaCO₃) | 70 | 180 | Varies by pool finish/disinfectant — consult manufacturer | — |
| pH | 7.2 | 8.0 | 7.4 | 7.6 |
| Calcium Hardness | 150 | 600 | 200 | 400 |
| Temperature (incl. spas/therapy) | 77°F | 104°F | 82°F | 84°F (recommended general-use range) |
| ORP (mV, if applicable) | 250 | 900 | 650 | 850 |
| Hydrogen Peroxide (if applicable) | 20 | 100 | 30 | 40 |
| Ion Generator — Copper (if applicable) | 0.25 | 0.95 | 0.3 | 0.5 |
| Ion Generator — Silver (if applicable) | 15 | 50 | 25 | 40 |
| Ozone (supplemental oxidizer only) | — | 0.1 | N/A | N/A |
| Saturation Index (Langelier) | -0.5 | +0.5 | -0.2 | +0.2 |
| Cyanuric Acid | 20 | 100 | 20 | 40 |

*Footnoted in the source: the 0.25 ppm minimum free chlorine only
applies when used **with an approved supplemental oxidizer**. **Resolved
— this genuinely has no separate numeric floor in the regulation
itself:** without a supplemental oxidizer, Table 1 doesn't list a
different minimum at all — the same 0.25 ppm figure appears with the
footnote restricting it to oxidizer-equipped facilities, and the
regulation simply doesn't state an alternative number for the
non-oxidizer case. **In practice, facilities without a supplemental
oxidizer are expected to operate at the ideal-range lower bound** — 1.0
ppm for pools, 3.0 ppm for spas/therapy pools — and local Colorado
health departments (Arapahoe, Mesa, and others cited) commonly enforce
or recommend ~1.0 ppm as the practical floor (some local logs show
figures as low as 0.4 ppm). **Recommend seeding Colorado's non-oxidizer
minimum as the ideal-range lower bound (1.0 ppm pool / 3.0 ppm spa)
rather than leaving it null**, since that's the genuinely-enforced
practical standard even though it's not a separate line item in the
state table — but keep a note on the record that this is a
practically-enforced floor inferred from the ideal range, not a
directly-stated regulatory minimum, matching the same state-floor/
local-enforcement layering pattern already seen in Connecticut.

**★ New pattern — multiple parallel disinfection-method tracks, each
with its own full threshold set:** Colorado is the first state collected
where the ruleset needs to represent chlorine, bromine, hydrogen
peroxide, and copper/silver ion generation as separate, mutually
relevant disinfection methods each with their own min/max/ideal — not
just "chlorine or bromine," and not just a CYA-conditional branch like
Alabama. The `ComplianceRuleset` may need a `disinfectionMethod` axis
that determines which threshold set applies, rather than one fixed
chemistry table per state.

**★ New cross-field rule — disinfection method requires a companion
reading:** Ion generators (copper/silver) are only valid **in
conjunction with a 0.4 ppm chlorine residual** — meaning ion-generator
compliance can't be evaluated on its own; it depends on a second,
different disinfectant's reading being present and in range. Same
complexity family as Alabama's CYA-conditional FC and Alaska's FAC/TAC
ratio, but here it's a cross-*method* dependency rather than
cross-reading within one method.

**★ Graph #1 image now available — qualitative behavior confirmed, but
precise curve digitization still has real limits (being honest about
this rather than overclaiming precision):**

The graph plots pH (vertical axis, 7.0–8.0) against an "ORP METER"
horizontal axis (0–10) with a family of curves, each labeled by a free
chlorine ppm value: **0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
1.5, 2.0, 3.0 ppm**. Each curve traces where a given pH/ORP-meter
combination corresponds to that chlorine level.

**Confirms the qualitative relationship exactly as expected:** for a
fixed free chlorine ppm, the curve slopes so that **higher pH
corresponds to a lower ORP-meter reading** — matching the earlier
qualitative note (higher pH → less active HOCl fraction → lower ORP for
the same chlorine level), and the same underlying chemistry family as
Alaska's resolved Table E.

**★ Likely unit-scaling insight worth flagging, not confirmed with
certainty:** the graph's own axis is labeled "ORP METER" running 0–10,
but Table 1's actual required ORP range is **250–900 mV**. A 0–10 scale
labeled without units strongly suggests the axis is in **hundreds of
mV** (i.e., actual mV = axis value × 100) — under that reading, the
required range 250–900 mV maps to axis positions 2.5–9.0, which fits
comfortably within the graph's plotted range and would make the axis
scale internally consistent with Table 1. This is a reasonable
interpretation, not a certainty (the "×100" unit note may simply be cut
off in this scan) — worth flagging as an assumption if the curve is
ever used for real threshold logic rather than the flat range.

**Practical recommendation, given precision limits:** digitizing this
scanned graph's exact curve paths (e.g., "at pH 7.4, curve 0.8 crosses
ORP-meter ≈ 4.2") is possible in principle but carries real
transcription risk from a low-resolution scan of a decades-old
regulatory document — more risk than Alaska's Table E, which had a
clean chemistry formula to cross-validate against. **Recommend
continuing to use the flat 250–900 mV range (650–850 ideal) as the
operative compliance rule**, since ORP monitoring is optional in
Colorado to begin with (facilities can rely on DPD chlorine testing
alone) and this graph functions as a supplementary cross-check tool
rather than the primary threshold. If a future need arises for the
full curve (e.g. an automated ORP-controller integration that needs
pH-specific ORP targets rather than one flat range), this image is now
on file and available to digitize properly at that point, rather than
starting from nothing.

**Testing frequency (§ 4.9) — resolved with real per-parameter, per-body-
type schedule, more granular than any other state collected so far:**

*Swimming pools (includes therapeutic and wading pools):*
| Frequency | Parameters |
|---|---|
| 3x/day | Disinfectant level, pH |
| Daily | Date, flowmeter reading, temperature, saturation index, ORP, calcium hardness, total alkalinity, maintenance procedures |
| Weekly | Cyanuric acid |
| Monthly | SCBA/canister-type respirator check, respirator canister expiration |

*Spa/Hot Tub:*
| Frequency | Parameters |
|---|---|
| Every 2 hours | Disinfectant level, pH, temperature |
| Daily | Flowmeter reading, saturation index, calcium hardness, total alkalinity, maintenance procedures |
| Weekly | Cyanuric acid |
| Monthly | SCBA/canister-type respirator check, respirator canister expiration |

**★ New pattern — per-parameter frequency that varies by body-of-water
type, more granular than Alabama's pool-vs-spa split:** Colorado doesn't
just change the overall cadence for spas (like Alabama's twice-daily vs.
hourly) — it changes *which specific parameters* move to a tighter
interval. Temperature, for instance, is "daily" for pools but bundled
into the "every 2 hours" tier for spas alongside disinfectant/pH. The
`ComplianceRuleset` frequency model likely needs a
parameter-by-body-type matrix, not a single frequency value per body
type.

**Other operational notes:**
- At least one of the daily pool chemistry readings must be taken
  **manually** (not from an electronic readout) — a verification
  requirement relevant to how the app should represent "electronic
  auto-logged" vs. "manual" readings, since a fully automated reading
  wouldn't satisfy this on its own
- "To check the balance of the pool," pH, temperature, calcium hardness,
  and total alkalinity must be checked **simultaneously** — a bundled-
  read requirement, not just independent per-field cadences
- Staff certification required: Certified Pool Operator (CPO), Aquatic
  Facility Operator (AFO), or NSPI Tech I — the first state collected
  with an explicit staff-certification requirement noted in the
  chemistry/operations section; worth tracking as a new data category if
  this recurs in other states
- Records must be kept on-site and available for inspection "by anyone
  upon request" — more open than most states' inspector-only access

**Bacterial quality (§ 4.5):**
- Fecal coliform: max 1 per 100 mL at any time
- Standard plate count: max 200 bacteria/mL
- **Closure trigger requires two consecutive out-of-range samples**, not
  a single failed sample — a new closure-trigger shape distinct from
  every other state collected so far, where a single non-compliant
  chemistry reading is normally enough

**★ New closure-trigger category — repeated-sample-based closure:**
Colorado's bacterial standard only forces closure if **two consecutive**
samples both exceed the threshold, rather than acting on the first
failure. Distinct from Alaska's single-positive-pathogen-test closure
and every chemistry-threshold closure collected so far, which trigger
on one out-of-range reading. Worth flagging to Claude Code: the
`ComplianceRuleset`/closure model may need to support a "requires N
consecutive failures" condition, not just "any single failure triggers
closure."

**Fecal/vomit contamination protocol (§ 4.14) — a third distinct shape,
compare against Arizona's and Arkansas's versions:**
- **Solid feces:** close pool, remove all bathers, remove solid matter,
  check water chemistry →
  - If disinfection levels already within required parameters: pool
    stays closed a **minimum 60 minutes**, then reopens
  - If disinfection levels are *not* within parameters: restore
    disinfection level first, then pool may reopen **60 minutes after**
    acceptable levels are attained
- **Diarrheal ("diarrhea") contamination:** close pool, superchlorinate
  (or equivalent), remain closed **24 hours**, reopen only if
  disinfection levels are within required parameters at that point

Colorado's version is notably shorter than Arkansas's (60 min vs. 30
min for solid/formed stool — actually shorter than Arkansas's exact
30-minute hold; and 24 hours vs. Arkansas's 12.75 hours for diarrheal,
so Colorado's diarrheal hold is *longer*) and has an explicit
branch based on whether disinfection was already compliant at time of
discovery — a decision-tree shape not seen in Arizona's or Arkansas's
otherwise-similar protocols.

**Turbidity (§ 4.8):** grate openings on the main drain must be clearly
visible from the deck at all times; failure is immediate grounds for
closure (same closure-trigger family as several other states' clarity
rules). No algae or foreign matter permitted.

**Non-chemistry facility/safety requirements noted (likely out of scope
for the reading/log-sheet feature, but worth having on file for an
in-app state code summary page):**
- Fencing minimum 60" high with self-closing, self-latching gates
- Showers required before entry: minimum 90°F water, soap provided
- Chlorine gas rooms (if used) require dedicated ventilated housing,
  SCBA equipment, hazard signage, and monthly safety-equipment checks —
  extensive equipment/facility rules likely out of scope for the
  reading-log feature but relevant to a future "facility compliance"
  module
- Natural swimming areas (lakes/reservoirs used as public swim areas)
  have their own separate E. coli-based standard (Appendix B/C) with
  bacterial sampling and closure flowcharts — likely out of scope for
  Lindley's/AquaRunner's pool-and-spa focus, noted for completeness only

**Both previously flagged open items are now resolved:** the
non-supplemental-oxidizer free chlorine minimum has a working answer
(ideal-range lower bound, 1.0 ppm pool/3.0 ppm spa, per common local
enforcement — see the footnote above). The Graph #1 image has surfaced
and its qualitative behavior is confirmed exactly as expected, though
full curve digitization was deliberately not attempted given
transcription risk from a low-resolution scan — the flat 250–900 mV
range (650–850 ideal) remains the operative rule, since ORP monitoring
is optional for Colorado facilities in the first place. **No remaining
open items for Colorado.**

---

## Florida

- **Health Department name:** Florida Department of Health, Bureau of
  Environmental Health — genuinely state-level
- **Official citation:** Fla. Admin. Code Ann. R. 64E-9.004 (Operational
  Requirements); log form itself incorporated by reference at 64E-9.003
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`
  ("DH 921, Monthly Swimming Pool Report," 3/98 edition)

**Log sheet fields (from actual official form):**
Chlorine residual and pH each recorded **three times daily — 9 AM, 1 PM,
4 PM** (dedicated columns for each), Filter Gauge Reading (Vacuum in/Hg,
Pressure Influent PSI, Pressure Effluent PSI), Flow GPM, Pool Vacuumed
(Y/N), Number of Patrons, and a Remarks column explicitly meant for
Total Alkalinity, Hardness, Cyanuric Acid, equipment breakdown,
excessive water loss, filter backwash, and water clarity — i.e. several
readings are captured in freeform remarks rather than dedicated columns,
unlike most other states' forms.

**★ Note — form cadence vs. regulatory minimum mismatch:** The form
itself has three timestamped columns per day (9/1/4), but the
regulatory text in (11) only *requires* "manually conducted pool water
tests for pH and disinfectant levels at least once every 24 hours."
The 3x/day structure appears to be the state's standard practice/form
design, not a hard regulatory minimum — worth deciding whether the
in-app default should follow the form's implied cadence or the
regulation's stated floor.

**Chemistry thresholds:**

| Reading | Requirement |
|---|---|
| pH | 7.0 – 7.8 |
| Free Chlorine — conventional pools | 1.0 – 10.0 mg/L |
| Free Chlorine — other pool types (swim-up bars, wading pools, special purpose, water attraction, interactive fountains) | 2.0 – 10.0 mg/L |
| Free Chlorine — spa-type pools | 2.0 – 5.0 mg/L |
| Free Chlorine — **indoor conventional pools (exception)** | Max 5.0 mg/L (lower than the standard 10.0 max) |
| Bromine — conventional pools | 1.5 – 6.0 mg/L |
| Bromine — other pool types | 3.0 – 6.0 mg/L |
| Bromine — **indoor conventional pools (exception)** | Max 6.0 mg/L |
| ORP (when required) | 700 – 850 mV |
| Cyanuric Acid — pools | Max 100 mg/L (40 mg/L recommended max) |
| Cyanuric Acid — spas | Max 40 mg/L |
| Quaternary Ammonium | Max 5 mg/L |
| Copper | Max 1 mg/L |
| Silver | Max 0.1 mg/L |
| Clarity (Turbidity) | Max 0.5 NTU, and main drain grate must be visible from deck (both conditions apply) |

**★ New pattern — indoor/outdoor exception applies to the *maximum*, not
a minimum or a banned substance:** Unlike Alabama (CYA banned indoors)
or Alaska (a ratio), Florida's indoor/outdoor distinction lowers the
allowable *ceiling* for conventional pools specifically (5.0 mg/L
chlorine / 6.0 mg/L bromine indoors vs. 10.0 mg/L outdoors) — a
different shape of indoor/outdoor conditional than seen so far.

**Bacteriological quality:** pool water must be free of coliform
bacteria contamination — stated as an absolute standard (zero
tolerance), not a numeric bacteria-per-mL ceiling like most other
states collected (Arizona/Colorado both use a specific bacteria/mL or
% threshold; Florida's text doesn't give one).

**ORP note:** when ORP controllers are used, the regulation explicitly
states this **"does not negate the manual daily testing requirement"** —
an explicit, stated version of the same principle behind Colorado's "at
least one manual reading per day" rule, but framed as automated
monitoring never being a substitute for manual testing at all (not just
one manual read minimum).

**Manual chemical addition / breakpoint chlorination protocol:**
Pool must be closed before adding chemicals manually, and remains closed
for **at least 1 hour** after (longer if needed for safe distribution).
After breakpoint chlorination or algae treatment, the pool **may reopen
once free chlorine drops to 10.0 mg/L or less** — a reopening trigger
based on descending *below* a ceiling, distinct from every other state's
closure protocols collected so far, which all reopen once a *minimum*
is restored (Arkansas, Arizona, Colorado). Florida's is the mirror case:
recovery means the level coming back down, not up.

**Testing frequency and equipment:**
- Manual pH/disinfectant testing: minimum once per 24 hours (see form-
  cadence note above)
- Cyanuric acid: weekly, but **only when chlorinated isocyanurates are
  used**, at both spas and pools
- Test kits required on-site: DPD method for free/total chlorine or
  bromine, plus total alkalinity, calcium hardness, and pH
- **Additional dedicated test kits required if these specific chemicals
  are fed/added:** cyanuric acid, sodium chloride, quaternary ammonium,
  ozone, copper — i.e. the *presence* of a chemical creates an
  additional testing-equipment obligation, not just a threshold to meet
- **Silver, if used as a supplemental disinfectant, requires a full lab
  water analysis every six months**, submitted to the department on
  request — a periodic *lab-based* requirement layered on top of daily
  field testing, a new category distinct from routine field-kit testing

**★ New pattern — chemical-triggered equipment/testing obligations:**
Florida is the first state collected where simply choosing to use a
given chemical (CYA, quaternary ammonium, ozone, copper, silver)
creates its own additional testing-kit or lab-analysis requirement,
separate from and in addition to the numeric threshold for that
chemical. Worth flagging to Claude Code: the `ComplianceRuleset` model
may need an explicit "chemicals in use" list that drives which
additional test-kit/lab requirements apply, not just which thresholds
apply.

**Recirculation/turnover:**
- Recirculation system must run at all times pool is open; may shut off
  3 hours after closing, must resume 3 hours before opening, controlled
  by a time clock
- **Variable-speed pump exception:** during the closed period, the
  system must achieve the equivalent of 6 hours of treatment at 100%
  design flow rate, *or* at least one full turnover — **whichever is
  greater** — rather than a flat hour-based turnover requirement
  (vacuum DE systems excluded from this allowance)

**★ New facility subtype — swim-up bars have their own dedicated rule
set, not just a chemistry variant:** Florida is the first state
collected with an entire named sub-category (beyond pool/spa/wading)
carrying its own requirements:
- Only permitted at licensed transient lodging, theme parks, or
  entertainment complexes
- Max depth 54 inches
- Recirculation turnover max **2 hours** (tighter than the standard 6hr
  pool turnover)
- **Must use an automated controller with chemical sensing probes** for
  disinfection and pH — mandatory automation, not just permitted
- Food/beverage service rules: no glass, spill-resistant containers,
  metal tabs/lids removed before serving, signage requirements

This suggests the `ComplianceRuleset` model may eventually need to
support facility subtypes beyond "pool" and "spa" (e.g. swim-up bar,
interactive water feature) each with their own turnover/automation
rules — worth flagging even if AquaRunner doesn't service swim-up bars
today, since the pattern may recur.

**★ Resolved — the CDC document Florida defers to is now sourced, with
real numbers, and it reveals a third distinct approach to the
CYA-during-incident problem:** Florida's rule (§64E-9.004(12)) still
defers by reference to the CDC's "Fecal Incident Response
Recommendations for Aquatic Staff" (June 22, 2018) rather than writing
its own numbers into the code — that citation-not-content structure
still holds. But the actual CDC content is now available:

**Formed stool (or vomit treated as formed):**
- Close the pool, clear all bathers
- Remove solid material with net/scoop (never vacuum into the filter);
  dispose properly, disinfect tools
- Raise free chlorine to 2 ppm (or maintain if already higher), pH ≤7.5
- Hold **≥25–30 minutes** (CT value ≈50–60) — matches Arkansas's and New
  York's numbers for the same incident type almost exactly
- Confirm filtration operating
- Document time, type, chlorine/pH readings before/during/after, and
  actions taken; reopen once levels are back in normal range

**Diarrheal stool:**
- Close immediately, remove material
- Raise free chlorine to **20 ppm, maintain pH ≤7.5 for 12.75 hours**
  (CT ≈15,300) — matches the same CDC/MAHC standard already confirmed
  across Arkansas, New York, and California
- **★ A third distinct mechanism for handling CYA during an incident:**
  if cyanuric acid is present, Florida's CDC-sourced guidance says to
  **lower CYA to ≤15 ppm first** (via partial drain/refill if needed),
  *or* use higher chlorine/longer contact time as the CDC guidance
  specifies. This is different from both approaches seen so far — New
  York doubles the standard treatment time when CYA is present;
  California defines an entirely separate target (pH 6.5/40 ppm/30
  hrs); **Florida's CDC guidance offers removing the CYA itself as the
  first option**, with the time/concentration adjustment as a fallback.
  Three states, three different mechanisms for the same underlying
  complication — reinforces that these shouldn't be assumed
  interchangeable.
- Backwash/clean filters after the disinfection period, dispose of
  wastewater properly
- Document thoroughly; reopen only once residual and pH are back in
  normal operating range

**Blood:** treated less stringently *if* free chlorine is already at or
above the required minimum — matches California's and Maryland's
"check the current level, don't assume elevated risk" approach, not New
York's blanket blood-closure exemption.

Alternative disinfection methods may be used only if CDC-approved,
effective, safe, and appropriate for public pools.

**Testing frequency note — clarified but still ultimately a product
decision, not something further resolvable via research:** the source
confirms manual testing/recording of disinfectant residual and pH is
required **at least once every 24 hours**. The rule itself lists **no
specific mandatory triggers** for testing more often than that — but in
practice, county health departments expect or require more frequent
testing in situations like: high bather loads/busy periods, hot weather
or high water temperatures, after heavy rainfall or storms, after
chemical adjustments or superchlorination, when a reading is borderline
or was recently out of range, spas/high-use features (many operators
test multiple times daily as best practice regardless), and after a
fecal/contamination incident (additional readings required as part of
the CDC response protocol already covered above). Automatic
ORP/pH controllers **do not replace** the required manual daily test —
consistent with the same "automation never substitutes for manual
verification" principle already confirmed in Colorado, New York, and
Maryland. The DH 921 form's 3x/day columns remain the practical
standard to build the app default around, with "once per 24 hours" as
the regulatory floor and the situational list above as the trigger set
for prompting more frequent checks — this is a genuine product decision
for AquaRunner (which cadence to default the app to, and whether to
surface these situational triggers as in-app prompts), not a data gap
that more sourcing would resolve.

**★ New pattern — situational (non-numeric) testing-frequency triggers,
distinct from every fixed-cadence rule collected so far:** every other
state's frequency rule collected specifies a fixed interval (daily,
3x/day, every 4 hours, etc.). Florida's practical enforcement instead
layers a list of *situational conditions* (weather, bather load, recent
out-of-range readings, post-chemical-adjustment) on top of the flat
24-hour floor — worth considering whether AquaRunner's scheduling
logic could eventually prompt more frequent readings based on
conditions like these, rather than only a fixed interval.

**Record retention — no fixed period stated in the rule itself, but a
clear practical range exists:** §64E-9.004(11) only requires that
completed reports "shall be retained at the pool and made available to
the department upon request" — no specific number of years. In
practice: most county health departments expect/commonly require **at
least 1–2 years** on-site; secondary guidance and industry practice
frequently cite **2 years** as the working minimum; incident-related
records (especially fecal/vomit events) are often kept longer —
**commonly 3–5+ years or until the applicable statute of limitations
expires**, given their liability relevance. Recommend seeding Florida's
retention rule as "2 years minimum for routine logs, longer (flagged as
a business/legal decision, not a stated regulatory number) for incident
records" rather than a single fixed period across all record types.

**Other operational notes:**
- Footbaths are prohibited entirely
- Most recent pool inspection report must be posted in plain view if
  the pool charges admission/membership fees
- Landscape/reclaimed water restrictions near the pool (no reclaimed
  water in the pool itself or wet deck; drip/soaker irrigation only
  within 100 ft if used nearby, with signage)

**No remaining open items for Florida** — the fecal protocol is now
fully sourced with real numbers, and the testing-frequency question is
a product decision rather than a data gap.

---

## New Mexico

- **Health Department name:** New Mexico Environment Department (NMED) —
  referenced directly on the log sheet ("Pools... will be closed and/or
  reinspected by NMED")
- **Official citation:** 7.18.1 NMAC (New Mexico Administrative Code,
  aquatic venue rules), especially **7.18.1.26** for water-quality
  provisions — resolved; the earlier entry correctly noted this wasn't
  in the log-sheet excerpt alone
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`
  ("Aquatic Venue Log Sheet")

**Log sheet fields (from actual official form):**
Day, Time, Initials, pH, ORP (mV/pH), FAC/Bromine, Total Chlorine, CAC
(Combined Chlorine — calculated, not directly tested), Temp, Flow Rate,
Alkalinity, Cyanuric Acid, Disinfectant/Chemicals and Amount Added, and
a Comments field explicitly meant for closures, injuries, and clarity
issues.

**★ New pattern — the form itself is colour-coded GREEN/RED per
reading, not a min/ideal/max table:** New Mexico's source document
presents every parameter (chemistry *and* physical/equipment
conditions) as a binary GREEN (compliant) / RED (non-compliant) band,
with an explicit, uniform instruction: *"RED readings mean your pool
DOES NOT MEET REQUIREMENTS. Take immediate action, retest, then reopen
your pool when readings are GREEN."* This is the first state collected
where chemistry thresholds, clarity, main-drain condition, and
filtration/controller status all share **one unified close/reopen
rule**, rather than chemistry getting one protocol, equipment another,
and events a third (contrast with Arizona/Arkansas/Colorado, which each
have separate written protocols per category). Worth flagging to Claude
Code: this may be the cleanest state to model a generic "status =
GREEN | RED, reopen when GREEN again" rule type against, and could
inform a unified status-band representation for other states' data too
where useful, rather than a NM-specific one-off.

**Water quality / equipment status bands (ORP and Combined Chlorine now
resolved with real NMED checklist numbers — see below):**

| Parameter | GREEN (compliant) | RED (non-compliant) |
|---|---|---|
| pH | 7.2 – 7.8 | Below 7.2 or above 7.8 |
| Chlorine — pools/spray pads, no CYA | 1.0 – 10.0 ppm | Below 1.0 or above 10.0 ppm |
| Chlorine — spas, no CYA | 3.0 – 10.0 ppm | Below 3.0 or above 10.0 ppm |
| Chlorine — pools/spray pads, CYA in use | 2.0 – 10.0 ppm | Below 2.0 or above 10.0 ppm |
| Bromine (total available) | — | Max 8.0 ppm |
| ORP | **Minimum 650 mV** — no strict numeric upper limit commonly listed, though properly functioning systems typically read higher | Below 650 mV |
| Combined Chlorine (CAC) | **Max 0.4 ppm** | Above 0.4 ppm — requires corrective action (breakpoint chlorination or equivalent) |
| Temperature | Max 104°F | Above 104°F |
| Cyanuric Acid — outdoor pools/spray pads only | Max 100 ppm (ideal ≈30 ppm) | Above 100 ppm, or any use indoors/in spas |
| Clarity | Clear | Hazy, cloudy, or main drain/bottom not visible |
| Main drains | Covers secured, good condition | Covers cracked, missing, or loose |
| Filtration System/Automatic Controllers | Operating properly | Not operating or operating poorly |

**★ Resolved — ORP:** automated disinfectant/pH controllers (ORP) are
required on essentially all New Mexico aquatic venues, and must be
maintained at a **minimum 650 mV**. No strict numeric ceiling is
commonly listed the way Colorado's 900 mV upper bound is — properly
functioning systems simply read higher than the floor. This resolves
the earlier flagged gap; New Mexico's ORP requirement turns out to be a
**floor-only** rule, not a full range like Colorado's 250–900 mV — a
genuinely different shape, worth not assuming every state's ORP
requirement is a two-sided range.

**★ Resolved — Combined Chlorine (CAC):** max **0.4 ppm**, appearing
consistently across current NMED operating checklists for pools, spas,
and spray pads. This is double Arkansas's 0.2 ppm CAC threshold — the
earlier flagged caution not to assume Arkansas's number applied here
turns out to have been the right call, since the actual number is
different.

**★ Resolved — Cyanuric Acid, and the "outdoor use only" label turns out
to have real teeth:** confirmed **prohibited indoors** — not just
unused, an actual stated ban, matching Alaska's shape rather than the
ambiguous case the earlier entry flagged. Outdoors: max 100 ppm (ideal
~30 ppm). **Genuinely new wrinkle:** as of **August 1, 2020**, CYA was
*also* prohibited in **outdoor spas and therapy pools specifically** —
so the real rule is a three-way split (indoor: banned everywhere;
outdoor pools/spray pads: allowed up to 100 ppm; outdoor spas/therapy
pools: banned too), not a simple indoor/outdoor binary. This is a more
granular version of Alabama's/Alaska's indoor-only distinction — New
Mexico bans CYA in both indoor facilities *and* outdoor spas/therapy
pools, permitting it only in outdoor pools and spray pads specifically.

**★ New pattern — an ORP requirement that's a floor only, not a
two-sided range:** every other ORP rule collected so far (Colorado) is
a full min/max band. New Mexico's is a **minimum only**, with no stated
ceiling — worth not assuming ORP requirements are always two-sided
ranges when modeling the schema.

**★ New pattern — a chemical's permitted-use scope splits three ways by
facility subtype, not just indoor/outdoor:** New Mexico bans CYA in
indoor facilities *and* in outdoor spas/therapy pools, permitting it
only in outdoor pools/spray pads — a facility-subtype-aware ban more
granular than a simple indoor/outdoor binary, and distinct from
Florida's separate pool-vs-spa CYA *caps* (100 ppm vs. 40 ppm, both
still permitted) since New Mexico prohibits outdoor spa use entirely
rather than just capping it lower.

**Testing frequency — a genuinely new cadence, "every 4 hours," plus a
frequency that depends on how a chemical is applied, not just whether
it's used:**
- **pH, ORP, FAC/Bromine: prior to opening, then every 4 hours** — the
  first state collected with this specific sub-daily interval (contrast
  with Colorado's spa "every 2 hours" and Florida's 9/1/4 three-times-
  daily form cadence — this is neither)
- **Total Chlorine, CAC, Temp, Flow Rate, Alkalinity: daily, prior to
  opening**
- **Cyanuric Acid: weekly by default, but conditional on *how* it's
  introduced** — every 2 weeks for venues using stabilized chlorine
  (i.e. CYA fed continuously as part of the chlorine product), monthly
  for venues that manually dose cyanuric acid directly (outdoor use
  only)

**★ New pattern — frequency conditional on delivery method, not just on
whether a chemical is present:** Every other state's CYA-frequency rule
collected so far (Alabama, Arkansas, California) is "weekly" or
"monthly" based on simple use/non-use. New Mexico's is the first where
the cadence itself branches on **how** the chemical enters the water
(stabilized/continuous-feed vs. manual dosing) — a more granular
condition than a flat per-chemical frequency.

**Combined Chlorine formula:** CAC = Total Chlorine − Free Chlorine,
calculated rather than directly tested — matches Arkansas's identical
formula structure. **Threshold now resolved at 0.4 ppm max** (see
above) — double Arkansas's 0.2 ppm, confirming these shouldn't be
assumed to share a number just because the calculation method matches.

**Gaps/open questions for this state:** none remaining — all three
previously flagged items (ORP range, CAC threshold, CYA indoor/outdoor
ambiguity) are now resolved with real NMED checklist data.

---

## New York

- **Health Department name:** New York State Department of Health,
  Bureau of Community Environmental Health and Food Protection —
  genuinely state-level
- **Official citation:** NYS Sanitary Code, 10 NYCRR Subpart 6-1,
  Section 6-1.11(c) (pool chemistry — **actual code text now confirmed**,
  not just a DOH summary), Section 6-1.25(c) (spa chemistry), Section
  6-1.11(c)(4) (chlorine stabilizer ban)
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`
  ("Report on Operation of Swimming Pool," form DOH-1323)
- **Two source documents for this state** — the monthly report form +
  its printed regulatory summary, and a separate, much more detailed
  **"Contamination Response Recommendations for Pool and Spray Ground
  Staff" (June 2023)**, explicitly aligned with CDC's Healthy Swimming
  guidance. This is the most detailed event-protocol document collected
  across all states so far — see below.

**Log sheet fields (from actual official form, DOH-1323):**
Date, Filter Washed (check), Pool Cleaned (check), Total Number of
Bathers, Chlorine Used (lbs/day or gal/day of crock/liquid), Alkalinity
(mg/l CaCO₃), pH, Pool Drain Visible (check), Acid Added (quarts or
pounds), Soda Ash Added (pounds), Other chemicals, three timestamped
Free/Total residual test columns per day (1st/2nd/3rd Test), Remarks,
Operator Signature/Date, Source of Water, and pints of % chlorine per
gallons of water used.

**Chemistry thresholds (§6-1.11(c) — actual code text now confirmed):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.8 (ideal ≈ 7.5) — **8.2 is a hard ceiling, never to be exceeded during use, regardless of band** |
| Free Chlorine — pools, pH ≤7.8 | Min 0.6 mg/l |
| Free Chlorine — spas, pH ≤7.8 | Min 1.5 mg/l |
| Free Chlorine — **pH 7.8–8.2 (higher band)** | Min 1.5 mg/l |
| Free Chlorine — **absolute maximum, resolved** | **5.0 mg/l — applies at any pH, including the 7.8–8.2 band.** Not a separate higher-band ceiling; one flat 5.0 mg/l max governs the whole 7.2–8.2 pH range regardless of which minimum band applies |
| Bromine — pools | Min 1.5 mg/l, max 6 mg/l |
| Bromine — spas | Min 3.0 mg/l, max 6 mg/l |
| Cyanuric Acid / chlorine stabilizers | **Not acceptable — full ban**, naming specific banned product classes: cyanuric acid, dichlor, and trichlor |

**★ Resolved — the actual §6-1.11(c) code text:**

> *"When chlorine gas, calcium hypochlorite or sodium hypochlorite is
> used to disinfect a swimming pool and the pool water pH is less than
> or equal to 7.8, the dose of chlorine or chlorine compound shall be
> sufficient to maintain a concentration of at least 0.6 mg/l free
> chlorine throughout the swimming pool. When the pH is between 7.8 and
> 8.2, a concentration of at least 1.5 mg/l free chlorine residual shall
> be maintained. A free chlorine residual of 5.0 mg/l or a pH of 8.2
> shall not be exceeded in any swimming pool during use."*

This confirms two things the earlier entry had flagged as open: **the
maximum free chlorine for the higher pH band is the same 5.0 mg/l
ceiling that applies at the lower band** — not a separate, unstated
number — and **pH 8.2 itself is an absolute hard ceiling**, phrased in
the same sentence as the chlorine maximum, suggesting both are treated
as equally strict "never exceed" limits rather than one being a soft
target and the other a hard rule.

Test method: DPD method required (explicit). Sample location: between
pool inlet and outlet, at approximately 12" depth.

**★ New pattern — stepped (two-tier) pH-conditional minimum, simpler
than a continuous curve:** New York's minimum free chlorine requirement
changes at a pH threshold — 0.6 mg/l minimum for pH 7.2–7.8, but 1.5
mg/l minimum once pH rises into the 7.8–8.2 band. This is the same
underlying concept as Alaska's Table E or Colorado's ORP/pH graph (a
second reading redefining the first's threshold), but expressed as
discrete bands rather than a continuous curve — worth modeling as a
simpler variant of pattern #6, not a wholly new mechanism.

**★ New pattern — stabilizer ban names specific product classes, not
just the compound:** Unlike Alaska's or Alabama's CYA-specific
restrictions, New York's ban explicitly covers cyanuric acid *and* the
stabilized-chlorine products dichlor and trichlor by name — banning a
category of chlorine products, not just a single additive.

**Testing frequency:**
- Disinfectant residual: **at least 3x/day**, explicitly "especially
  before and after periods of heavy bathing" — matches the form's
  1st/2nd/3rd Test columns exactly
- Remarks column must note unusual circumstances: pump failure, GFI
  testing, water cloudiness, etc.
- **Mandatory immediate notification duty:** the county/district health
  department must be notified **immediately** of any equipment change,
  treatment interruption, loss of water clarity, or serious injury — a
  broader and more proactive obligation than a simple closure trigger;
  it's a reporting duty independent of whether the facility is
  currently in compliance.

**★ New pattern — proactive notification duty, distinct from a closure
trigger:** Most states' rules define when a facility *must close*; New
York separately requires *notifying the health department* for a wider
set of events (equipment changes, clarity loss, injury) regardless of
whether closure itself is also required. Worth a distinct
`notificationRequirements` concept if the product ever surfaces
compliance obligations beyond simple close/reopen logic.

---

### New York Contamination Response Recommendations (June 2023) —
the most detailed event-protocol document collected so far

This is a full CDC-aligned response guide, not just a regulation
excerpt, and it resolves what most other states' fecal/vomit protocols
leave as a single fixed number. Structured as four numbered procedures.

**Procedure 1 — Formed fecal matter or vomit in pool water/spray pad:**
- Close immediately; **if multiple venues share one filtration system,
  all connected venues must close together**, not just the affected one
- Remove matter with net/bucket (never vacuum — contaminates equipment
  that can't be cleaned); disinfect removal tools by leaving them
  immersed during disinfection
- Using **unstabilized** chlorine, raise free chlorine to 2 ppm (if
  below), maintain FC ≥2 ppm and pH ≤7.5 for **25–30 minutes**; ideal
  water temp ≥77°F
- **Table 1 gives substitutable concentration/time pairs, not one fixed
  number** — 1.0 ppm for 45 min, 2.0 ppm for 25–30 min, or 3.0 ppm for
  19 min, all achieving equivalent Giardia inactivation
- **If cyanuric acid is present:** stop using CYA products, contact the
  local health department, and **exactly double** the disinfection time
  for the chosen concentration (e.g. 1 ppm → 90 min instead of 45; 2 ppm
  → 50–60 min instead of 25–30; 3 ppm → 38 min instead of 19)
- **Brominated facilities:** must switch to a chlorine-based disinfectant
  to treat the contamination — bromine can't be distinguished from
  chlorine by most test kits, so the minimum disinfection level needed
  is **the current bromine level plus the minimum free chlorine level**
  for the selected closure time — a cross-method additive requirement,
  not a substitution
- **Reopen once free chlorine/bromine and pH return to normal operating
  ranges — which differ by facility type, a third facility category
  (spray grounds) alongside pool/spa:**
  - Pools: 0.6–5 ppm FC or 1.5–6 ppm bromine; pH 7.2–7.8
  - Spas: 1.5–5 ppm FC or 3–6 ppm bromine; pH 7.2–7.8
  - Spray Grounds: 2–10 ppm FC or ≥4.4 ppm bromine; pH 7.2–7.8

**Procedure 2 — Diarrheal incident:**
- Same initial closure/removal steps as Procedure 1 (including the
  shared-filtration cascade closure)
- Raise free chlorine to **20 ppm**, pH ≤7.5, maintain for **at least
  12.75 hours** to reach a CT (concentration × time) inactivation value
  of **15,300** — this matches Arkansas's numbers almost exactly,
  cross-validating that both states are drawing on the same underlying
  CDC/MAHC standard
- **Table 2 gives an alternative substitutable pair:** 10 ppm for 25
  hours 30 minutes achieves the same CT value as 20 ppm for 12h45m —
  confirming the CT-value concept is a genuine formula (concentration ×
  time = target), not just a fixed lookup
- Backwash filter (or replace cartridge/DE media) after reaching the CT
  value; for sand filters, direct filtered water to waste for 5 minutes
  after restart before resuming normal operation
- Same three-tier reopening ranges as Procedure 1 (pools/spas/spray
  grounds)

**Procedure 3 — Alternative remediation for a diarrheal incident (two
options, only for venues not combined with another venue's water):**
- **Draining & Cleaning** (small-volume venues, e.g. spas, some spray
  grounds): drain completely, scrub all contacted surfaces, replace
  cartridge or backwash sand filter/replace DE media, refill from an
  approved water source
- **UV Light Disinfection** (spray grounds only): confirm disinfectant
  residual ≥2.0 ppm chlorine (or ≥4.4 ppm bromine) and pH 7.2–7.8;
  confirm UV reactor achieving **at least 40 mJ/cm²** dose — this is the
  same UV dosage number as California's spray-ground closure trigger,
  cross-validating that pattern as a real industry standard, not a
  one-off; recirculate the full system (including spray features) for
  at least 30 minutes with the venue closed

**Procedure 4 — Vomit or blood on surfaces excluding the spray pad:**
- Clean with a 9-parts-water-to-1-part-household-bleach solution, 20
  minute contact time, then wipe up and dispose properly
- **★ Blood is explicitly exempted from the closure requirement** that
  applies to fecal/vomit-in-water incidents — the guidance states there
  is "no public health reason to recommend closing the pool" after a
  blood spill (chlorine readily kills bloodborne pathogens like
  Hepatitis B and HIV in properly maintained water), though staff may
  still choose to close temporarily
- Exception: if the body-fluid spill happens **on the spray pad itself**
  (not just an adjacent deck), it's treated as water contamination and
  routed through Procedures 1–3 instead, since spray pad drainage feeds
  back into the treatment tank

**★ New pattern — CT (concentration × time) value as an explicit,
substitutable formula, not a single fixed pair:** New York's tables
give multiple valid (concentration, time) combinations that all satisfy
the same underlying inactivation target (CT = 15,300 for Crypto, or the
Table 1 values for Giardia) — richer than Arkansas's single fixed
pair, and suggests the `eventProtocols` model could represent this as
"any pair satisfying concentration × time ≥ X" rather than one hardcoded
number, if the product ever needs to support alternate treatment
choices.

**★ New pattern — CYA presence doubles required treatment time, stated
exactly (not approximately):** Arkansas's document noted CYA "roughly
doubles" treatment time as a general caveat; New York states this as an
exact doubling rule with worked examples for each concentration tier —
worth treating as a precise multiplier rather than a rough estimate if
both states end up in the same rule engine.

**★ New pattern — closure cascades across shared/linked filtration
systems:** both NY procedures require that *all* venues sharing one
filtration system close together during a contamination event, not just
the specifically affected body of water — relevant if AquaRunner ever
represents multiple bodies of water sharing equipment at one property.

**★ New pattern — body-fluid type changes whether closure is required at
all, not just the remediation steps:** blood is explicitly lower-risk
than fecal/vomit contamination and doesn't require closure per this
guidance, the first state collected to make that distinction explicit
rather than treating all bodily-fluid contamination uniformly.

**Gaps/open questions for this state:** none remaining — both
previously flagged items (the pH 7.8–8.2 band's maximum free chlorine,
and the underlying §6-1.11(c) code text itself) are now resolved with
the actual regulation text, quoted above.

---

## Maryland

**★ Resolved — the correct citation is COMAR 10.17.01, not .04, and this
replaces the earlier secondary-sourced chemistry data with real code
text.** The earlier entry flagged its chemistry table as unverified,
citing "COMAR 10.17.04" from a third-party explainer site. That citation
was simply wrong — Maryland's actual public pool/spa regulation is
**COMAR 10.17.01 (Public Swimming Pools and Spas)**. The real numbers
differ from the earlier secondary source in several places (noted
below where they diverge) — **this section replaces that entry
entirely rather than layering on top of it.**

- **Health Department name:** Maryland Department of Health (MDH)
- **Official citation:** COMAR 10.17.01 — §.44 (Disinfection), §.45
  (Water Chemistry), §.46 (Operating Records)
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`
  (a Secretary-provided standard form; Queen Anne's County's version,
  used in the earlier entry, is one local county's rendering of it —
  now confirmed accurate against the real regulation, see below)

**Chemistry thresholds (from actual COMAR 10.17.01.44–.45 text — real
regulation, high confidence):**

| Reading | Pools (swim/diving, water rec) | Pools (wading/therapy) | Spas |
|---|---|---|---|
| Free Chlorine | 1.5 – 10.0 ppm | 3.0 – 10.0 ppm | 4.0 – 10.0 ppm |
| Total Bromine | 3.0 – 8.0 ppm | 4.0 – 8.0 ppm | 4.0 – 8.0 ppm |
| Combined Chlorine (max) | 0.2 ppm | 0.2 ppm | 0.2 ppm |

| Other water chemistry (all facility types) | Requirement |
|---|---|
| pH | 7.2 – 7.8 |
| Total Alkalinity | 60 – 180 ppm |
| Calcium Hardness | 150 – 400 ppm |
| Langelier Saturation Index | -0.5 to +0.5 |
| Total Dissolved Solids | Max 1,500 ppm (max 3,000 ppm for salt-water pools) |
| Dissolved Metals | Iron max 0.3 ppm, Manganese max 0.3 ppm, Copper max 1.3 ppm |
| Clarity | Main drain or a 6" Secchi disc clearly visible from the side |

**★ Discrepancies with the earlier (incorrect-citation) entry, worth
knowing about rather than silently overwriting:**
- Combined chlorine max is **0.2 ppm**, not the earlier 0.5 ppm — a
  meaningfully stricter number
- Total alkalinity is **60–180 ppm**, not 80–120 ppm
- Calcium hardness floor is **150 ppm**, not 200 ppm (max 400 matches)
- The earlier entry's cyanuric acid *numeric range* (100 ppm max,
  30–50 ideal) **doesn't appear in the real regulation at all** — see
  the CYA note below, the actual rule is a use-restriction, not a range
- The earlier "Class A–D" taxonomy **does not exist in COMAR** — see
  facility categories below, the real categories are different

**Secondary/alternative disinfection methods (§.44, genuinely new
detail not in the earlier entry):**
- **Copper/silver ions:** Copper 0.2–1.0 ppm, Silver max 0.05 ppm — and
  using this system **reduces** the required free chlorine floor to
  0.5–10 ppm (swim/diving pools) or 3.0–8.0 ppm (spas/wading/therapy)
- **Ozone:** max 0.1 ppm, measured specifically **2 inches above the
  water surface** — a specific measurement location, not just a
  threshold
- **PHMB (polyhexamethylene biguanide):** minimum 30 ppm — the first
  disinfectant type of this kind collected across any state so far;
  **incompatible with jets/sprays, halogens, or ozone** — an
  equipment/chemical incompatibility rule, not just a threshold
- **Cyanuric acid:** **not allowed indoors, and not allowed with
  bromine** — two independent restriction conditions, not a numeric cap.
  This resolves the earlier entry's fabricated CYA range and is a
  genuinely different rule shape than every other state's CYA handling
  collected so far (Alabama: no ban at all, just a range; Alaska: full
  ban; New York: full ban naming specific products) — Maryland's is
  conditional on **either** indoor use **or** bromine use, whichever
  applies.

**★ New pattern — secondary disinfection method reduces the primary
threshold, rather than adding a companion requirement:** Contrast this
against Colorado's ion generators, which **require** a 0.4 ppm chlorine
residual as a companion reading (an additive requirement). Maryland's
copper/silver system instead **lowers** the required free chlorine
floor when in use — the opposite direction of cross-method dependency.

**Facility categories (§.46 — the real classification system, replacing
the earlier fabricated Class A–D taxonomy):**
- **Recreational pool:** open to the general public, swim clubs,
  municipalities, larger apartment complexes
- **Semipublic pool:** hotels, motels, smaller apartment complexes (≤10
  units), health clubs, condominiums
- **Limited public-use pool**

**One form, but recording frequency differs by category:**
- Recreational pool & public spa: disinfectant residual, combined
  chlorine, and pH **every 2 hours**
- Semipublic & limited public-use pools: same three readings **three
  times per day**
- **All** public pools/spas: remaining items (clarity, temperature if
  heated, flow rate, filter pressures, pump vacuum, bather load) at
  least three times per day
- With an approved automatic controller: minimum three times per day on
  a **fixed schedule — ½ hour before opening, between 12–2 PM, and 2
  hours before closing** — this exactly matches the Queen Anne's County
  form's three named windows from the earlier entry, which is a good
  cross-validation that the county form is accurate to the real
  regulation even though the citation attached to it was wrong
- Total alkalinity, calcium hardness, cyanuric acid: **weekly for
  pools, but daily for spas** — the same three parameters at two
  different cadences depending on facility type

**★ New pattern — the same chemical parameters tested weekly for one
facility type but daily for another**, distinct from Colorado's
per-parameter-by-body-type matrix (which varies *which* parameters
group together) — Maryland keeps the same three parameters but simply
changes the interval (weekly → daily) based on pool vs. spa.

**Records:** kept on a Secretary-provided form (or local equivalent),
dated/signed, retained on-site for **3 years** (not 2, as the earlier
entry guessed), submitted to the department on request. Local health
departments commonly distribute standardized versions covering both
recreational and semipublic pools, with only the frequency columns
differing.

**Log sheet fields (confirmed accurate — Queen Anne's County's official
form, now validated against the real regulation):**
Testing structured around the same three named operational windows
noted above. Each window captures: Free available chlorine or total
bromine, Combined chlorine, pH, Clarity, Water temperature (if heated),
Rate of flow, Filter Influent/Effluent Pressure, Pump Vacuum, Total
Number of Bathers. Once each day: filter backwash time, chemicals
added, equipment issues, injuries/accidents. Once each week: total
alkalinity, calcium hardness, cyanuric acid (if used) — this weekly
cadence is accurate for pools per the real regulation, though spas
require daily per the rule above; worth checking whether Queen Anne's
County's form (labeled "Semi-Public Pool") reflects the pool-only
weekly cadence correctly, or whether a spa-specific version exists with
daily columns instead. Disinfectant-used checkboxes: Gas Chlorine,
Sodium Hypochlorite, Calcium Hypochlorite, Lithium Hypochlorite, Ozone,
Bromine, Other.

**★ Resolved — Fecal/Vomit/Blood Incident Protocol (previously entirely
missing for this state):** Maryland's protocol comes from a **statewide
MDH policy package** ("Fecal, Vomit and Blood Contamination Policy"),
not a detailed provision inside COMAR itself — worth flagging as its
own source type, similar in shape to Florida's CDC-deferred protocol,
except this is the *state's own* policy document rather than an
external federal one.

**All incident types:**
- Immediately close the pool/spa, clear all bathers, post "temporarily
  closed" signs
- Remove solid material with a scoop/net (never vacuum into the
  filter), dispose in sanitary sewer/toilet, clean and disinfect the
  scoop
- Keep filtration running throughout
- Document the incident, closure times, and all chlorine/pH readings in
  the daily operating records

**Solid (formed) stool or vomit:**
- Raise free chlorine to **at least 10 ppm throughout the entire pool**
  — notably higher than every other state's formed-fecal target
  collected so far (Arkansas, New York, and California all use ~2 ppm
  for a similar hold duration)
- Maintain pH 7.2–7.5
- Hold for **30 minutes after even distribution is verified** — with
  verification meaning readings taken **every 15 feet around the
  perimeter**. This is a genuinely new mechanic: the 30-minute clock
  doesn't start at the moment chlorine is raised, it starts once
  multi-point sampling confirms the chemical is evenly distributed
  throughout the pool
- Backwash filters afterward and disinfect filter media with a **1:20
  bleach solution** — a specific ratio, not given by any other state
  collected so far
- Reduce free chlorine back to normal operating range before reopening

**★ New pattern — hold-time clock starts at verified even distribution,
not at the moment of treatment:** every other state's disinfection
timer collected so far starts counting from when the target
concentration is reached at one measurement point. Maryland requires
**multi-point verification (every 15 ft around the perimeter)** before
the hold timer begins — a distribution-confirmation step layered in
front of the timing requirement itself.

**Loose/diarrheal stool:**
- Policy cites **10 ppm free chlorine for 16 hours** as the reference CT
  value
- **★ Flag — this doesn't match the cross-validated CDC/MAHC standard
  seen in other states.** Arkansas, New York, and California all
  converge on a CT value of 15,300 (ppm × minutes) — e.g. 20 ppm for
  12.75 hours (20 × 765 min = 15,300). Maryland's cited reference (10
  ppm × 16 hours × 60 = 9,600 ppm·min) works out to a **meaningfully
  lower CT value** than the standard cited elsewhere. This could mean
  Maryland's policy uses a different/older reference standard, that
  this is a simplified summary rather than the precise MDH fact sheet
  language, or a genuine state-to-state difference in required rigor.
  **Don't assume this is an error to "correct" toward the other
  states' number** — seed it as Maryland's actual cited figure, flagged
  as a cross-state discrepancy worth verifying against the full MDH
  fact sheet if exact precision matters.

**Blood:**
- **No requirement to remove blood from the water** — matches
  California's approach (check current chlorine level; if below the
  facility's required minimum, close until restored) rather than New
  York's blanket blood-closure exemption
- Clean/disinfect deck or surface contamination with a bloodborne
  pathogen kit

Local county health departments distribute the exact MDH fact sheets
and often require incidents to be logged on the same operating-record
form or an attached incident sheet — worth checking with the local
environmental health office for county-specific forms, matching the
same county-variance pattern seen in Nevada, Alabama, and Arizona.

**No remaining open items for Maryland** — all three previously flagged
gaps (unverified chemistry source, unclear log-form applicability
across facility categories, missing fecal/vomit protocol) are now
resolved with real COMAR text and the official MDH policy.

---

---

## Georgia

- **Health Department name:** Georgia Department of Public Health (DPH),
  Environmental Health Section — co-regulated with local county boards
  of health
- **Official citation:** Rules and Regulations for Public Swimming
  Pools, Chapter 511-3-5 — specifically §511-3-5-.17 (water chemistry
  compliance) and §511-3-5-.22 (Operation and Management)
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  and genuinely the most complete official form *package* collected
  across any state so far: "Public Swimming Pool Operator Record" +
  Addendum, "Public Pool Operator Assessment Record," "Public Pool
  Operation Daily Self-Checks," and a dedicated "Fecal Contamination
  Response Record"

**★ New pattern — a formal two-tier operator/responsible-person staffing
structure, not just a certification requirement:** every Georgia public
pool/spa must have a **trained operator** with a current DPH-approved
training certificate, who must personally perform **a minimum of two
visits weekly** and provide a **written assessment of pool conditions**
each time. When that operator isn't available, a **responsible person**
can be appointed to perform daily monitoring — but that person must
themselves be trained on basic pool operations and emergency procedures,
either by the trained operator directly or via a local health department
course. This is deeper than Colorado's CPO/AFO/NSPI certification
requirement — Georgia formalizes an actual delegation chain with its own
minimum visit cadence, not just a credential to hold.

**Chemistry thresholds (from the official "Daily Self-Checks" checklist
— high confidence, matches the operator log form's printed ranges):**

| Reading | Requirement |
|---|---|
| Free Chlorine — pools with CYA | Min 2.0 ppm, max 10 ppm |
| Free Chlorine — pools without CYA | Min 1.0 ppm, max 10 ppm |
| Free Chlorine — spas | Min 3.0 ppm, max 10 ppm |
| Combined Chlorine | Max 0.4 ppm |
| pH | 7.2 – 7.8 |
| Cyanuric Acid | Max 90 ppm |
| Total Alkalinity | 60 – 180 ppm (printed directly on the log form) |
| Spa water temperature | Max 104°F |

**★ Cross-validation — two numbers now confirmed across independent
states:** Georgia's Combined Chlorine max (0.4 ppm) matches New Mexico's
exactly, and Georgia's CYA max (90 ppm) is the first state whose *own*
regulatory cap matches the **CDC Model Aquatic Health Code's
recommended maximum exactly** — every other state collected either sets
a higher state cap than MAHC's 90 ppm recommendation (Maryland: 100 ppm
state vs. 90 ppm MAHC, explicitly flagged as a discrepancy) or doesn't
reference MAHC at all. Georgia is the first to align its own number
with the model code rather than diverge from it.

**Testing frequency (from the Guidance document, §511-3-5-.22):**
- Pools: FAC/bromine and pH tested **minimum 2x/day during hours of
  operation**
- Total alkalinity: **weekly**
- Calcium hardness: **monthly**
- Cyanuric acid: **every 2 weeks if stabilized chlorine is the primary
  disinfectant; otherwise monthly** — and specifically **tested 24
  hours after addition to the water**, a precise post-addition timing
  requirement not seen elsewhere
- Spas/hot water venues: FAC, bromine, pH, and water temperature tested
  **prior to opening, then recorded every 4 hours** — this exactly
  matches New Mexico's "every 4 hours" spa/venue cadence, good
  cross-state confirmation that this specific interval is a real,
  recurring standard rather than one state's one-off choice
- In-line ORP readings (if applicable): recorded **at the same time**
  as the FAC/bromine and pH tests, not on a separate schedule
- In-line electrolytic chlorinators: salt levels tested **at least
  weekly, or per manufacturer's instructions** — whichever governs

**★ New pattern — water sample collection location is itself a rotating
protocol, not a fixed single point:** Georgia's procedure is the most
detailed sample-location protocol collected across any state:
- Sample obtained from **at least 18 inches below the surface**, from a
  location **between the inlets**
- From a section of the pool with **water depth between 3–4 feet** when
  available
- **Sampling locations rotate around the shallower end of the pool for
  each test** — with the **deepest area included in the rotation once
  per week**

Every other state's sampling-location note collected so far (New York's
"between inlet/outlet, ~12 inches") specifies a single fixed point.
Georgia requires an actual rotation schedule across multiple locations
over time, with the deep end swept in periodically — worth representing
as a genuine rotation rule if AquaRunner ever tracks *where* a reading
was taken, not just the reading itself.

**Closure triggers — an explicit, unified checklist spanning chemistry,
equipment, safety infrastructure, and events all in one list** (from the
Daily Self-Checks form, "THE POOL WILL BE CLOSED IF ANY OF THE FOLLOWING
CONDITIONS EXIST"):
1. Free chlorine residual below minimum
2. pH below 7.2 or above 7.8
3. Recirculation system not in continuous operation
4. Water clarity: main drain not clearly visible from the deck
5. Broken glass on the deck or in the water
6. Broken, unsecured, or missing main drain cover(s)
7. Fence/barrier broken; gate not self-closing or self-latching
8. Absence of lifesaving equipment
9. Fecal incident reported in the pool water
10. Any other condition that can't be immediately corrected and could
    threaten public health/safety (examples given: unapproved water
    source, power outage, inclement weather)

**★ New pattern — closure logic unified into one explicit enumerated
checklist across every category**, similar in spirit to New Mexico's
unified GREEN/RED status model but implemented differently: rather than
color-coding every individual reading, Georgia lists ten discrete,
named conditions — spanning chemistry, physical equipment, safety
infrastructure, *and* events — as a single flat closure checklist. Two
different implementations of the same underlying idea (don't split
closure logic by category) collected from two different states now.

**★ Resolved-in-structure (not in exact numbers) — Fecal/Vomit/Blood
Incident Protocol, the most operationally detailed record-keeping
structure collected across any state:** Georgia's own regulation still
defers the actual CT (concentration × time) target to **"the most
recent recommendations published by the CDC"** — same externally-
deferred structure as Florida — so the exact ppm/hold-time numbers
aren't independently specified in Georgia's own code. But Georgia's
official "Fecal Contamination Response Record" form operationalizes
whatever CT value applies into an unusually rigorous tracking structure:

- Facility must maintain a **written contamination response plan**
  covering formed-stool, diarrheal-stool, and vomitus contamination
- The incident log covers water **or adjacent deck** contamination, and
  explicitly includes **formed fecal, diarrheal fecal, whole-stomach
  vomitus discharge, and blood** — one unified incident-type list
- Required fields: date/time reported, person responding, **number of
  people in the pool water at the time**, contamination type, pool
  type/volume (gallons), **whether CYA is present and its ppm if so**
  (directly informing which CT approach applies), time pool was closed
- **A six-point monitoring grid**, more granular than California's
  three snapshots: **Start (at closure) → 1st → 2nd → 3rd → 4th → End
  (prior to reopening)** — each checkpoint capturing monitoring time,
  free residual chlorine, and pH, at "evenly spaced intervals throughout
  the required closure time period"
- Time/date pool reopened
- **Total Contact Time, explicitly defined**: starts when the
  disinfectant reaches the desired concentration, and ends when the
  disinfectant concentration **begins being reduced for reopening** — a
  precise start/end definition that resolves ambiguity other states left
  implicit about exactly when the CT clock starts and stops
- Free-text remediation procedure reference and comments

**★ New pattern — a defined six-point monitoring grid as the official
incident record structure, plus an explicit definition of when the CT
clock starts and stops:** California requires three documented
snapshots (discovery, post-disinfection, reopening); Georgia requires
**six evenly-spaced checkpoints** across the entire closure window, and
uniquely **defines the exact start/end conditions for "Total Contact
Time"** rather than leaving the CT clock's boundaries implicit. Worth
using Georgia's definition as the reference shape if `eventProtocols`
ever needs a formal contact-time data structure, even for other states
whose own documents don't define the boundaries as precisely.

**Log sheet fields (Operator Record + Addendum):**
FC/Br and pH for both pool and spa (separate columns), Daily Water
Temperature (spa, <104°F), Daily Self-Checks (check), Weekly Total
Alkalinity (60–180 ppm printed range), Flowmeter Reading (gpm), Current
Occupancy Load (inside barrier), Pressure Gauge Reading (psi), a
reference to the Addendum for corrections/chemicals/backwashing detail,
and Trained Operator or Responsible Person signature. Separate
end-of-form fields for Cyanuric Acid (ppm) and Calcium Hardness (ppm).
The form explicitly notes: **"The pH, disinfectant and temperature
monitoring frequencies are different for heated spas and pools"** —
confirmed by the checklist frequencies above (pools 2x/day; spas every
4 hours).

**Non-chemistry facility/safety requirements (unusually specific sign
text and equipment sizing — likely out of scope for the reading/log-
sheet feature, but worth having on file for an in-app state code
summary page):**
- Required signage with **specific letter heights**: Peak Occupancy (4"),
  "NO DIVING" near ≤5 ft depth markers (4"), "NO LIFEGUARD ON DUTY" (4"),
  "RISK OF DROWNING – SUPERVISE CHILDREN CLOSELY" (4"), emergency
  contact/911 sign, "Pool Risks" (1")
- Life ring: minimum 15" outer diameter, ¼" rope, rope length = 1.5×
  pool width or 50 ft, whichever is **less**
- Reaching pole with body hook: minimum 12 ft
- Depth markers at max/min depths, at the slope change, both sides, both
  ends
- Rope/float line between shallow and deep ends (>5 ft = "deep")
- Fencing: minimum 4 ft high, openings 1.25"–4" depending on design,
  self-closing/self-latching gates, latch 54" above ground or 3" down
  inside the gate from the top, no openings >0.5" within 18" of the latch
- VGB-compliant covers required for main drains and equalizer lines;
  vacuum line cover approved
- Current Environmental Health inspection must be posted
- Minimum 4 ft unobstructed decking width around the entire pool

**No remaining open items for Georgia** — chemistry, frequency, closure
logic, and incident record-keeping are all resolved with real official
forms and code citations. The one genuine external dependency (the CDC's
exact CT numbers) is a citation-elsewhere gap of the same shape as
Florida's, not a missing-information gap.

---

---

## Hawaii

- **Health Department name:** Hawaii Department of Health — genuinely
  state-level (matches Arkansas/Alaska/Colorado's pattern, not a
  county-distributed code)
- **Official citation:** Hawaii Administrative Rules (HAR) Title 11,
  Chapter 10 — §11-10-15 (water quality), §11-10-21 (records), §11-10-22
  (rules/incident response)
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`
  ("Public Freshwater Swimming Pool Daily Operation Report")

**Chemistry thresholds:**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.8 |
| Chlorine residual | Minimum **0.6 ppm** — notably low compared to most states collected, though it matches New York's baseline pool minimum exactly |
| Other disinfectants | EPA-registered alternatives permitted if they provide an easily measured residual that's equally effective — director-approved, performance-based standard rather than a per-chemical table (same shape as Colorado's "other disinfecting equipment" clause) |
| Total Alkalinity | Tested **monthly — no numeric range stated** in the core water-quality section |
| Water Clarity | **Either** a 6" high-contrast disc clearly visible from outside the pool at the deepest point, **or** the main drain grate clearly visible from the deck — two alternative verification methods, either one satisfies the requirement |

**★ Confirmed genuine regulatory gap — not an oversight in this
excerpt, but a real absence in Hawaii's actual rule text:** total
alkalinity has a stated testing frequency (monthly) but **no numeric
target range anywhere in HAR Chapter 11-10** — this has been explicitly
confirmed, not just unresolved in the source document. Unlike
Connecticut's alkalinity gap (which the state code also leaves open, but
which local health districts commonly fill with an explicit 80–150 ppm
convention), **no equivalent Hawaii-specific local/practice range has a
regulatory or quasi-regulatory status** — what exists instead is generic
industry practice (commonly 80–120 ppm, or the broader 60–180 ppm norm
used elsewhere) followed voluntarily to help keep pH stable, with **no
enforceable standing under HAR**. **Recommend seeding Hawaii's alkalinity
rule as `range: null` with a note citing the generic industry range as
non-binding context only** — don't treat the 80–120/60–180 figures as
Hawaii's actual rule the way Connecticut's local-district numbers
legitimately are, since Hawaii's version has no regulatory backing at
all, even at the local level. If DOH ever amends Chapter 11-10 to add a
numeric standard, this would need revisiting, but as of the current
text, this is a genuine permanent gap rather than something more
sourcing would close.

**★ Legal minimum vs. common practice gap, explicitly called out by the
source itself:** the enforceable HAR minimum is 0.6 ppm free chlorine,
but secondary guidance and industry practice in Hawaii commonly target
**1.0 ppm or higher** for operational safety, specifically because of
high UV exposure. Worth seeding 0.6 ppm as the compliance floor while
flagging 1.0 ppm as a commonly-recommended operational target — the
same shape as Colorado's non-oxidizer chlorine floor (regulatory number
vs. practically-enforced number), but here the gap is between the *law*
and *common practice*, not between the *state code* and *local
enforcement*.

**Recording requirements (§11-10-21) — daily unless noted:**
- Water clarity
- Recirculation pump/filter operating periods, with corresponding
  rate-of-flow meter readings
- Amounts of chemicals added to the pool
- Disinfectant residual test results
- pH test results
- Water quality monitoring data (when required)
- Equipment maintenance and malfunctions
- Dates of fecal/vomitus accidents and the specific actions taken

**Total alkalinity:** monthly (see gap note above). **Retention: 12
months** — shorter than most states collected (matches Alabama's 1 year
exactly; shorter than New York's 2-year minimum, Maryland's 3 years).

**★ New pattern — a proactive periodic submission duty, not just
retain-and-produce-on-request:** "any required water quality monitoring
data must be submitted to the department **quarterly**" — every other
state's records requirement collected so far is retain-on-site and
produce-on-request; Hawaii adds an actual **routine push obligation** on
top of that, at least for water quality monitoring data specifically.
Worth a distinct `submissionRequirements` concept, separate from
`retentionPeriod`, if this pattern recurs elsewhere.

**Fecal/Vomit incident protocol (§11-10-22):**

> *"The public swimming pool shall be immediately closed for cleaning in
> the event of an accidental fecal or vomitus discharge. All bathers
> shall be ordered to leave the public swimming pool until such
> substances are removed. A closed system public swimming pool shall be
> disinfected before the pool is reopened for use. An open system public
> swimming pool shall be kept closed until it is determined that the
> water quality meets the standards set by this chapter."*

**★ New pattern — reopening logic bifurcated by pool *system type*
(closed vs. open), not by contamination type or facility type:** every
other state's fecal-incident branching collected so far splits on
**contamination type** (formed vs. diarrheal — Arkansas, Florida,
California, Georgia) or **facility type** (pool vs. spa — Alabama,
Maryland). Hawaii instead branches on the **plumbing/system
architecture** itself: a closed-system pool (standard recirculating,
chlorinated) must be actively **disinfected** before reopening; an
open-system pool (flow-through/once-through water) instead just stays
closed **until water quality testing confirms** it meets standards,
with no separate disinfection step specified. This is a genuinely
different axis of variation than anything collected so far — worth
confirming whether AquaRunner's customer base includes any open-system
facilities at all, since it may be low-relevance in practice but is
architecturally distinct if it ever comes up.

Hawaii DOH also references the **CDC Fecal Incident Response
Recommendations** for detailed disinfection guidance — the same
externally-deferred-to-CDC structure already seen in Florida and
Georgia, now confirmed as a recurring pattern across at least three
states rather than a one-off.

**Log sheet fields (from the actual official form):**
Date, pH, Disinfectant Type and Residual (ppm), Rate of Flow Meter
(gal/min), Pool Operating Hours, Recirculation Pump/Filter Operating
Hours, Chemicals Added to Pool (name and amount) with Operator's
Initials, Accidents (fecal or vomitus) and Actions Taken with Operator's
Initials, Malfunctioning of Equipment, and a monthly Total Alkalinity
field. Form explicitly states **"Keep on file for twelve months."**

**Hawaii is fully resolved.** The one item that isn't a numeric value —
total alkalinity's target range — isn't an open gap waiting on more
sourcing; it's a confirmed, genuine absence in the actual HAR text
itself. Seed it as `range: null` with the non-binding industry-practice
note attached, per above, rather than treating it as unfinished
research.

---

<!-- Next state entries get appended below this line -->
