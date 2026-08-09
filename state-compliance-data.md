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

## Idaho

**★ Not a sourcing gap — a confirmed regulatory vacuum, effective
2025-07-01:** Idaho **repealed all state-level public pool/spa
regulation**. House Bill 202 (2025 session, **Session Law Chapter 47**)
deleted the health-district-oversight language from **Idaho Code
§56-1003(3c)**, effective **July 1, 2025**. This made **IDAPA 16.02.14
("Construction and Operation of Public Swimming Pools")** obsolete —
the rule that used to set Idaho's chemistry standards no longer has any
statutory authority behind it. Per Central District Health's own public
statement: *"The rules become obsolete on July 1 and there will no
longer be a public swimming pool inspection program in Idaho."* The
bill passed nearly unanimously (one dissenting vote, Sen. Melissa
Wintrow) as part of a broader 21-page Department of Health & Welfare
cleanup bill — reporting at the time suggests most legislators may not
have realized the pool-inspection provision was bundled into it.

- **Health Department name:** None at the state level, as of 2025-07-01.
  Idaho Department of Health and Welfare no longer has statutory
  authority over public pools.
- **Official citation:** N/A (repealed). For historical reference only:
  the repealed rule was IDAPA 16.02.14; the repealing act is 2025 Idaho
  Session Laws, Chapter 47 (House Bill 202), amending Idaho Code
  §56-1003.
- **Has dedicated log sheet:** NOT FOUND — no state-level regulation
  exists to prescribe one.

**All chemistry fields: NOT FOUND — no state-level regulation exists
(not a research gap; confirmed repealed effective 2025-07-01).** Do not
seed a `ChemistryThreshold` row using the old IDAPA 16.02.14 numbers
(pH 7.2–7.8 target / closure outside 6.8–8.2, CYA max 100 ppm,
alkalinity 80–200 ppm) as if they're current — they carry no regulatory
force today. If AquaRunner needs a value for Idaho customers, that has
to come from whichever **local health district or municipality** covers
that specific property (Idaho now has ~7 independent local health
districts, e.g. Southwest District Health, Central District Health,
each free to write or decline to write their own rules) — a
county/city-level lookup, not a single Idaho state row, and out of
scope for this pass.

**No fecal/vomit/blood contamination reporting rule at the state level**
for the same reason — NOT FOUND, confirmed repealed rather than
unresearched.

**Recommend:** seed Idaho's `ComplianceRuleset` with `isSupported: false`
and a `ComplianceNote` (`kind: "GAP"`) documenting the repeal, rather
than leaving a bare stub that looks like un-researched territory. Revisit
if any Idaho local health district publishes its own numeric standard
AquaRunner customers in that district would be bound by.

**Sources used:**
- [House Bill 202 — Idaho State Legislature](https://legislature.idaho.gov/sessioninfo/2025/legislation/h0202/) — official bill page, confirms Chapter 47, effective 7/1/2025
- [Health inspections of Idaho public pools are about to end — Boise State Public Radio](https://www.boisestatepublicradio.org/news/2025-04-29/idaho-swimming-pool-inspection-health-stop-stopped-legislature) — confirms Idaho Code §56-1003(3c) repeal, IDAPA 16.02.14 obsolescence, no replacement state oversight
- [Idaho public pools ditch state health inspections by July — KTVB](https://www.ktvb.com/article/news/local/208/idaho-public-pool-inspections-end-new-law/277-8a30b987-4be3-47f2-bf75-e676ac7071d8) — corroborating local news coverage

---

## Delaware

- **Health Department name:** Delaware Department of Health and Social
  Services (DHSS), Division of Public Health
- **Official citation:** Title 16 Delaware Administrative Code, 4400
  Health Systems Protection, **4464 Public Swimming Pools** (adopted
  October 1, 2015; effective October 11, 2015)
- **Has dedicated log sheet:** No official fill-in form found in the
  regulation text itself → `logSheetSource: built-from-code`. The code
  requires results to be recorded with date/time/sample location and
  kept on-site for one year, but doesn't prescribe a specific form.

**Chemistry thresholds (from actual code text, §8.5–8.6):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.8 (§8.5.1.1) |
| Free Chlorine — pools not using Cyanuric Acid | Minimum 1.0 ppm (§8.6.8.1.1) |
| Free Chlorine — pools using Cyanuric Acid | Minimum 2.0 ppm (§8.6.8.1.2) |
| Free Chlorine — spas | Minimum 3.0 ppm (§8.6.8.1.3) |
| Free Chlorine — recommended maximum (all) | 10.0 ppm (§8.6.8.1.4) |
| Bromine — pools (alternative disinfectant) | Minimum 3.0 ppm (§8.6.8.2.1) |
| Bromine — spas (alternative disinfectant) | Minimum 4.0 ppm (§8.6.8.2.2) |
| Cyanuric Acid | Should not exceed 100 ppm (§8.6.8.2.3) |
| Pool water turbidity | ≤0.5 NTU (§8.3.2) |
| Filter effluent turbidity | ≤1 NTU (§7.1.2) |
| Heterotrophic plate count (if sampled) | <200 colonies/mL (§8.4.1) |
| Total coliform (if sampled) | <1 colony/100mL (MF method) or absent (§8.4.2–8.4.3) |
| Spa water temperature | Max 104°F (§9.22.1) |

**Use of gas chlorine is prohibited (§8.6.5). Use of stabilized chlorine
(cyanuric acid) in indoor pools is prohibited (§8.6.6)** — Delaware is
explicit about this, not just silent on indoor CYA the way Alabama's
earlier draft was assumed to be.

**Testing frequency (§8.6.11):**
- pH and disinfectant residual: tested **daily prior to opening**, and
  "as often as necessary while the pool is open" to ensure proper
  levels — recommended every 1–2 hours, but not a hard-coded count
  (§8.6.11.6.1) — same adequacy-based shape as Connecticut's standard
- Alkalinity, calcium hardness, and cyanuric acid (if applicable):
  tested **after each addition of makeup water and at least weekly**
  (§8.6.11.6.2)
- Test kit reagents replaced just prior to each outdoor season and at
  least yearly for indoor pools; phenol red specifically every 6 months
  (§8.6.11.6)
- Records (date, time, sample location) kept on-site for **at least 1
  year**, available to the Division on request (§8.6.13)

**★ Note — no numeric alkalinity/hardness target range in the operative
rule itself:** unlike most states collected, Delaware's code doesn't
state a target ppm range for total alkalinity or calcium hardness in
§8.0. Instead, Appendix A/B provide a **Langelier Saturation Index
balance method** (a formula/nomograph using pH, alkalinity, hardness,
and temperature factors to compute a single "balanced water" index
between -0.3 and +0.3) — the regulatory mechanism for these two
parameters is a computed index, not a flat min/max pair. Recommend
seeding alkalinity/hardness as `range: null` with a note pointing to the
Langelier Index requirement, same shape as Hawaii's confirmed-gap
pattern, rather than inventing a ppm range Delaware's own code doesn't
state.

**pH range that triggers mandatory closure (§14.2, Suspension of
Permit):** pH below 7.2 or above 7.8 is one of an enumerated list of
conditions that requires the Director to **suspend the operating permit
and order immediate closure without a hearing** (§14.2.4.3), alongside:
non-compliant clarity/turbidity, non-compliant bacteriological quality,
disinfection system not functioning or absent, free chlorine or bromine
residual below the §8.6 minimum, **cyanuric acid greater than 100 ppm**
(§14.2.4.7 — the CYA closure-risk threshold), recirculation pump or
filter not operating/absent, spa water >104°F, no qualified
lifeguard/attendant, bare electrical hazard, required lighting/main
drain visibility not met, Division representative denied immediate
access, **fecal material discharged into the pool** (§14.2.4.15), no
qualified operator, or any other condition endangering bather health,
safety, or welfare (§14.2.4.17-18). This is a flat enumerated-checklist
closure model, the same shape as Georgia's ten-item list, not a
two-tier authority structure like Connecticut's.

**Fecal/Vomit/Blood Contamination Response (§9.28) — kept distinct from
routine chemistry per this file's architecture:**

- Every public pool must maintain a written **Contamination Response
  Plan** covering formed-stool, diarrheal-stool, vomit, and blood
  contamination, with staff trained in both the response procedures and
  OSHA Bloodborne Pathogens Standard (29 CFR 1910.1030) PPE (§9.28.1–2)
- **Closure cascades to every pool sharing the same recirculation
  system** (§9.28.3.2) — same pattern as New York/California/Georgia's
  shared-filtration closure rule
- Pre-treatment conditions before the CT clock is meaningful: pH ≤7.5,
  water temperature ≥77°F, filtration running (§9.28.3.6)
- **Formed-stool:** raise/maintain free chlorine at 2.0 mg/L for at
  least 25 minutes (or equivalent CT); **double the inactivation time if
  cyanuric acid/stabilized chlorine is present** (§9.28.4.1)
- **Diarrheal-stool:** raise/maintain free chlorine at 20.0 mg/L for at
  least 12.75 hours (or equivalent CT), **or** circulate through a
  secondary disinfection system to reduce Cryptosporidium oocysts below
  1/100mL (§9.28.4.2)
- **Any aquatic venue containing cyanuric acid/stabilized chlorine**
  (broader than just the diarrheal case): lower pH to 6.5 and raise free
  chlorine to 40 mg/L for at least 30 hours (or equivalent CT), **or**
  secondary disinfection to the same oocyst target, **or** drain the
  venue completely (§9.28.4.3) — three alternative remediation paths,
  not just one fixed number
- **Vomit:** same as formed-stool — 2.0 mg/L for 25 minutes, doubled if
  CYA present (§9.28.5)
- **★ Blood is treated as low-risk, not an automatic closure trigger:**
  "Blood contamination of a properly maintained public pool's water does
  not pose a public health risk to swimmers" (§9.28.6.1) — operators
  *may choose* whether to close and treat it as a formed-stool event,
  purely to satisfy patron concerns, not because the code requires it.
  Same shape as New York's blood exemption (`NO_CLOSURE_REQUIRED`),
  independently confirmed in a second state.
- **Brominated pools:** treated by temporarily adding chlorine to reach
  the same free-chlorine CT targets above (not raising bromine itself),
  then readjusting the bromine residual before reopening (§9.28.7)
- **Surface/deck contamination:** clean visible contaminant first, then
  disinfect with either a 1:10 household bleach dilution or an
  equivalent EPA-registered body-fluid disinfectant, soak minimum 20
  minutes (§9.28.8)

**No remaining open items for Delaware** except the alkalinity/hardness
numeric-range gap noted above, which is a genuine absence in the code
(Langelier Index governs instead), not a sourcing gap.

**Sources used:**
- [4464 Public Swimming Pools — Delaware Regulations (regulations.delaware.gov)](https://regulations.delaware.gov/AdminCode/title16/4464) — official state regulation portal, landing page
- [Title 16 Health and Safety, Delaware Administrative Code, 4464 Public Swimming Pools — full PDF text](https://regulations.delaware.gov/api/AdminCode/title16/4464/8c329605-0c91-4d4d-8cc2-dd771ffa5382) — the actual regulation text used for every citation above

---

## Illinois

- **Health Department name:** Illinois Department of Public Health
  (IDPH)
- **Official citation:** 77 Ill. Admin. Code Part 820, "Swimming
  Facility Code" — specifically §820.320 (Water Quality), §820.330
  (Swimming Pool Closing), and §820.350 (Operation Reports and Routine
  Sampling)
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided`
  ("Swimming Facility Daily Operational Report," referenced in §820.350
  and published by IDPH) — the numeric ranges below come from the
  regulation text itself; the form's own printed copy couldn't be read
  as text (binary/scanned PDF), so don't assume the form prints anything
  beyond what's confirmed in §820.320/§820.330.

**Chemistry thresholds (§820.320, "Water Quality" — routine operating
range, applies uniformly to every "swimming facility" the Code covers):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.6 |
| Free Chlorine Residual | 1.0 – 4.0 ppm; **minimum rises to 2.0 ppm whenever water temperature exceeds 85°F** |
| Bromine Residual | 2.0 – 8.0 ppm |
| Cyanuric Acid | Shall not exceed 100 ppm |
| Total Alkalinity | 50 – 200 ppm as calcium carbonate |
| Indoor pool water temperature | 76°F – 92°F |
| Clarity | Entire pool basin clearly visible from the pool deck (qualitative, not an NTU number) |

**★ New pattern — no separate pool-vs-spa chemistry split at all:**
every other state collected so far (Delaware, Georgia, Alabama, etc.)
gives spas a distinct, usually higher, minimum. Illinois's §820.320
applies **one flat range to every "swimming facility"** (the Code's own
term, which by definition already includes pools, spas/whirlpools, and
wading pools) — the only spa-specific lever is the temperature-triggered
2.0 ppm floor, which functions as a de facto higher spa minimum since
spa water commonly exceeds 85°F, without the Code ever naming spas
separately.

**pH range that triggers mandatory closure (§820.330, distinct from and
wider than the §820.320 routine target range):** pool must **close
immediately** if pH is less than 6.8 or greater than 8.0. Also
mandatory-closure under §820.330:
- Free chlorine residual below 0.5 ppm, or bromine residual below 1.0
  ppm (note: looser than the §820.320 routine floor of 1.0/2.0 ppm —
  same two-tier "routine target vs. hard closure floor" shape seen in
  other states, just with Illinois's own numbers)
- Total chlorine concentration above 5.0 ppm, or total bromine above
  10.0 ppm
- Coliform concentration of 10/100mL in two consecutive samples, or any
  presence of fecal coliform, E. coli, or Pseudomonas
- Recirculation pumps/filters inoperable; a suction outlet cover loose,
  improperly installed, damaged, or missing
- Hazardous turbidity, any condition posing immediate health/safety
  danger, a Department closure notice, or (outdoor facilities) lightning
  /thunder within 15 minutes

**CYA threshold that triggers closure-risk violation:** the Code states
the 100 ppm ceiling in §820.320 but **§820.330's closure-trigger list
does not separately name cyanuric acid** — unlike Delaware/Georgia,
exceeding 100 ppm isn't on Illinois's own enumerated immediate-closure
list, and no remediation procedure (e.g., partial draining) is specified
anywhere in the sections reviewed. Treat CYA >100 ppm as a standing
violation of §820.320's routine standard, but **not confirmed as an
independent mandatory-closure trigger** the way pH/chlorine/bromine
explicitly are — flag this distinction rather than assuming CYA closes
the pool in Illinois just because it does in other states.

**Testing frequency (§820.350):**
- Disinfectant residual and pH: **at least twice daily**, from shallow
  and deep areas of each pool and all other aquatic features
- Combined chlorine (if chlorine is the disinfectant): **at least
  weekly**
- Cyanuric acid (if chlorinated cyanurates are used): **at least
  weekly**
- Ozone concentration (if used): **monthly**, tested immediately above
  the pool water surface
- **Total alkalinity test cadence: NOT FOUND** — §820.320 states the
  50–200 ppm range but §820.350 (the section that lists every other
  parameter's test frequency) never states one for alkalinity. This
  reads as a genuine gap in the code itself, not a missed excerpt — the
  same shape as Hawaii's confirmed alkalinity gap, just for cadence
  instead of range.
- Operation reports recorded daily and kept on-site **minimum 3 years**

**Fecal/Vomit/Blood Contamination Response — kept distinct from routine
chemistry per this file's architecture:**

§820.330 requires **immediate closure** the moment "a patron has
defecated or vomited in the pool," and the facility must remain closed
for a **minimum of 30 minutes following superchlorination, or longer if
necessary, for the disinfectant residual to return to prescribed
levels."**

**★ Genuine gap, not a missed excerpt — no numeric CT value for the
incident response itself:** unlike Delaware, Georgia, Arkansas,
California, and Florida (all of which give an exact target ppm and hold
time, or defer explicitly to CDC guidance by name), Illinois's own code
text gives **no specific free-chlorine target, no formed-vs-diarrheal
distinction, and no explicit CT value** for the post-contamination
superchlorination step — just "superchlorinate, then stay closed at
least 30 minutes until the residual returns to normal." §820.320
separately defines a *routine* (non-incident) superchlorination
trigger — breakpoint to 10× the combined chlorine reading whenever
combined chlorine exceeds 0.5 ppm — but nothing in the sections reviewed
ties that specific multiplier to the fecal/vomit incident procedure.
**No blood-specific provision and no CDC cross-reference found** in
§820.330 either. IDPH's own "Illinois Swimming Pool Operator" training
course materials may define a more precise protocol in an attachment
not accessible as readable text this pass — worth a follow-up fetch
before assuming the code's silence is the whole story, but as sourced
today this is the state's complete written incident rule.

**Open items for Illinois:** (1) total alkalinity test cadence — not
stated anywhere found; (2) CYA's status as a mandatory-closure trigger
vs. just a standing violation — ambiguous, per above; (3) the exact
fecal/vomit incident CT target — not specified in the regulation text
itself, possibly covered in inaccessible IDPH training material. None of
these are guessed numbers; all are flagged rather than filled in.

**Sources used:**
- [Illinois Swimming Facility Code — full text, ilga.gov (JCAR)](https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=07700820) — official Illinois General Assembly regulation portal
- [Ill. Admin. Code tit. 77, § 820.320 — Water Quality (Cornell LII)](https://www.law.cornell.edu/regulations/illinois/Ill-Admin-Code-tit-77-SS-820.320) — routine chemistry ranges
- [Ill. Admin. Code tit. 77, § 820.330 — Swimming Pool Closing (Cornell LII)](https://www.law.cornell.edu/regulations/illinois/Ill-Admin-Code-tit-77-SS-820.330) — closure triggers, fecal/vomit incident rule
- [Ill. Admin. Code tit. 77, § 820.350 — Operation Reports and Routine Sampling (Cornell LII)](https://www.law.cornell.edu/regulations/illinois/Ill-Admin-Code-tit-77-SS-820.350) — testing frequency, record retention
- [Swimming Facilities — Illinois Department of Public Health](https://dph.illinois.gov/topics-services/environmental-health-protection/swimming-facilities.html) — IDPH program page, confirms agency and log-form reference

---

## Indiana

- **Health Department name:** Indiana State Department of Health (ISDH)
- **Official citation:** 410 IAC 6-2.1, "Public and Semi-Public Swimming
  Pools" — specifically §30 (Pool water chemistry), §43 (Reasons for
  closure), §44 (Fecal accidents), §38 (records)
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  "Swimming Pool Record of Operation," **State Form 12279**, logged
  daily and retained for **1 year** per §38.

**Chemistry thresholds (§30, "Pool water chemistry"):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.8 |
| Free Chlorine — pools | 1.0 – 7.0 ppm |
| Free Chlorine — spas | 2.0 – 7.0 ppm |
| Bromine — pools | 2.0 – 10.0 ppm |
| Bromine — spas | 4.0 – 10.0 ppm |
| Cyanuric Acid | Max 60 ppm — **lower than every other state collected so far** (Delaware/Illinois both cap at 100 ppm); **prohibited in indoor pools and prohibited in spas entirely** (only usable in chlorine-disinfected outdoor pools) |
| Total Alkalinity | 80 – 120 ppm |
| Spa water temperature | Max 104°F |

**★ Direct closure language inside the chemistry section itself, not
just the general closure list:** §30 states the pool **must close**
during breakpoint chlorination until chlorine drops back to the 7.0 ppm
maximum, must stay closed a **minimum of 1 hour** after any direct
chemical addition, and — notably — **"the pool must be closed"** the
moment cyanuric acid exceeds 60 ppm. That CYA closure instruction lives
in §30, not in §43's enumerated closure list below, so don't assume
CYA is absent from Indiana's closure logic just because §43 doesn't
name it — it's a closure trigger, just structurally placed elsewhere in
the code (same ambiguity Illinois has, but Indiana's version is
explicit rather than silent).

**pH range that triggers mandatory closure (§43, "Reasons for
closure"):** pool must close for pH **less than 6.8 or equal to/greater
than 8.0** — a wider band than the 7.2–7.8 routine target in §30, the
same two-tier "routine range vs. hard closure floor" shape seen in
Illinois and other states. Also enumerated in §43:
- Failure to meet bacteriological requirements (§31(f), §42.1(b)(15)/(16))
- Water clarity requirements not met (§31(a) or §42.1(b)(13))
- Main drain grate missing/broken, or §32(e) not met
- Pump, filter, or disinfectant chemical feeder not operational
- Lifeguard requirements not met (§35, where applicable)
- **A fecal accident** (see incident protocol below)
- Spa water temperature exceeds 104°F
- Catch-all: any condition ISDH determines may cause/result in a health
  or safety hazard, or cause/transmit disease

**Testing frequency:**
- pH and disinfectant residual: **daily before the pool opens, and at
  least one additional time during hours of use** (§30(o))
- Combined chlorine (when chlorine is the disinfectant): **at least
  twice a week**
- Total alkalinity: **at least once a week**
- Cyanuric acid (when used): **at least once a week**

**Fecal/Vomit/Blood Contamination Response (§44) — kept distinct from
routine chemistry per this file's architecture:**

**★ Vomit is folded into the solid-stool procedure, not given its own
track:** unlike most states collected (which treat vomit as its own
category alongside formed- and diarrheal-stool), Indiana's §44 applies
the **same procedure to solid/formed stool and to "full-stomach"
vomit** — there's no lighter-touch vomit-specific rule. **No
blood-specific provision was found** in §44 at all — neither an
exemption (New York's, Delaware's "does not pose a public health risk")
nor a numeric protocol; blood contamination isn't addressed as its own
category in this section.

- **Immediate response (both procedures):** clear all patrons and close
  every affected pool or spa, **including any others sharing the same
  filtration system** (same cascading-closure pattern as Delaware, New
  York, California, Georgia). Remove material with a **net or scoop
  only — vacuums are prohibited**. Sanitize the removal equipment with a
  fresh 20 ppm chlorine solution, or leave it immersed in the pool
  during disinfection. Maintain **pH ≤7.5** and **water temperature
  ≥77°F** throughout.
- **Solid stool / vomit, no chlorine stabilizer present:** maintain
  **2 ppm free disinfectant for a minimum of 25 minutes** at poolside,
  or the equivalent time/concentration to reach a **CT value of 45**
- **Solid stool / vomit, stabilizer present:** maintain **4 ppm free
  disinfectant for a minimum of 25 minutes**, or equivalent to a **CT
  value of 100**
- **Diarrheal (nonsolid) stool, no stabilizer present:** raise and
  maintain free chlorine at **20 ppm for 765 minutes (12 hours 45
  minutes)**, or equivalent to a **CT value of 15,300** — **or**
  completely drain the pool
- **Diarrheal (nonsolid) stool, stabilizer present:** lower pH to
  **6.5**, raise and maintain free chlorine at **40 ppm for 30 hours**
- Filtration runs continuously throughout remediation; filters
  backwashed to waste as needed
- **Reopening (both):** reduce free chlorine back to the §30 maximum,
  rebalance pH, recharge the filter, and verify the circulation system
  is operating before reopening

**★ Cross-state validation — Indiana's diarrheal CT value matches New
York's exactly:** `COMPLIANCE_RULESET_NOTES.md` documents **New York's
CT = 15,300** as a real, substitutable CDC/MAHC-derived formula value
(`EventProtocol.ctValue`/`ctValueUnit`). Indiana's own §44 states the
**identical CT = 15,300** for the unstabilized diarrheal-stool case —
independent confirmation from a second state's own code that this
specific figure is a real recurring standard (likely traceable to the
CDC Model Aquatic Health Code), not a one-state idiosyncrasy.

**No remaining open items for Indiana** — chemistry, closure logic, and
the fecal/vomit incident protocol are all sourced directly from the
regulation text with section citations. The one structural note worth
keeping is that CYA's closure trigger lives in §30 rather than §43, and
that vomit/blood don't get their own dedicated sub-rules the way some
other states' codes provide.

**Sources used:**
- [Public and Semi-Public Swimming Pools Rule 410 IAC 6-2.1 — full text PDF (in.gov)](https://www.in.gov/health/eph/files/410_iac_6_2_1.pdf) — official ISDH regulation document
- [410 IAC 6-2.1-30 — Pool water chemistry (Cornell LII)](https://www.law.cornell.edu/regulations/indiana/410-IAC-6-2.1-30)
- [410 IAC 6-2.1-43 — Reasons for closure (Cornell LII)](https://www.law.cornell.edu/regulations/indiana/410-IAC-6-2.1-43)
- [410 IAC 6-2.1-44 — Fecal accidents (Cornell LII)](https://www.law.cornell.edu/regulations/indiana/410-IAC-6-2.1-44)
- [Swimming Pool Record of Operation, State Form 12279 (forms.in.gov)](https://forms.in.gov/Download.aspx?id=9703) — confirms the state-provided log sheet and its 1-year retention requirement
- [ISDH: Public Swimming Pool and Spa Program](https://www.in.gov/health/eph/public-swimming-pool-and-spa-program/) — agency program page

---

## Iowa

- **Health Department name:** the regulation's own header reads
  **"Public Health[641]"** throughout (Iowa Department of Public
  Health is the agency historically assigned chapter 641 in the Iowa
  Administrative Code). **Flag — possible current-agency ambiguity:** a
  2025 Iowa Department of Inspections, Appeals & Licensing (DIAL)
  webpage states DIAL currently administers pool/spa **registration**
  under this same chapter, following Iowa's 2023 HHS consolidation. The
  regulation text itself was not re-headered to DIAL as of the version
  used here (effective 9/24/25), so cite "Public Health[641]" per the
  code's own title but note DIAL may be the practical point of contact
  for registration specifically.
- **Official citation:** 641 Iowa Administrative Code, **Chapter 15,
  "Swimming Pools, Spas, and Spray Pads"** — specifically rule 15.4
  (Swimming pool operations, water quality at 15.4(2)) and rule 15.51
  (Spa operations, water quality at 15.51(2)). **Used the version
  effective 9/24/25 (IAB 8/20/25, ARC 9498C)** — Iowa's own currently
  in-force text, not an older cached copy; see the "★ superseded"
  callout below for what changed from the prior (2020) version.
- **Has dedicated log sheet:** No official fill-in form found;
  operational records must be kept day-by-day per 15.4(6) but the
  chapter doesn't reference a specific state-issued form the way
  Indiana/Georgia/Hawaii do → `logSheetSource: built-from-code`.

**Chemistry thresholds (15.4(2) for pools, 15.51(2) for spas):**

| Reading | Requirement |
|---|---|
| pH — pools and spas | 7.2 – 7.8 |
| Free Chlorine — pools | 1.0 – 8.0 ppm |
| Free Chlorine — spas | 2.0 – 8.0 ppm |
| Total Bromine — pools | 2.0 – 18.0 ppm |
| Total Bromine — spas | 4.0 – 18.0 ppm |
| ORP (if a controller is installed) — pools and spas | 700 – 880 mV |
| Cyanuric Acid — pools and spas | Closure trigger above 80 ppm (see below) |

**Cyanuric acid is fully banned in every indoor pool and every indoor
spa** — "No cyanuric acid in any form shall be added to an indoor
swimming pool" / "...to an indoor spa" (15.4(2)a(5), 15.51(2)a(6)) — no
exceptions in the current text (the prior 2020 version carried a
grandfather clause for pre-2008 feed systems; **that exception has been
removed** in the 9/24/25 rewrite).

**★ Superseded in the current rewrite — the prior tiered ORP-escalation
system is gone:** the version of this chapter in force through 2021
(and still findable online, dated 12/16/20) had an elaborate secondary
structure (its own "Table 1") pairing ORP bands with looser acceptable
chlorine/bromine ranges, **and** an escalating-oversight mechanism — 5
non-consecutive low-ORP days in 14 required a facility self-evaluation
report; 3 consecutive (or 4-of-7) days required draining, cleaning, and
notifying the local inspection agency, plus a professional service
investigation. **The 9/24/25 version has no equivalent tiered table at
all** — ORP is now a flat requirement (700–880 mV target, closed below
650 or above 880) with no secondary bands or escalating-report
mechanism. Seed Iowa from the **current, simpler** rule; don't carry
forward the old tiered structure from an outdated copy still circulating
online (e.g., an unofficial `04-20-2021` PDF that predates this rewrite).

**pH range that triggers mandatory closure:** 15.4(2)b — **"An
inspection agency may require that a swimming pool be closed if the pH
is less than 6.8 or greater than 8.2."** This is explicitly
**discretionary** ("may require"), not automatic — the same shape as
Connecticut's two-tier authority structure, not a flat "shall close"
rule. **The spa pH provision (15.51(2)b) has no equivalent closure
clause at all** — it states the 7.2–7.8 target with no stated
consequence for exceeding it, an asymmetry between the pool and spa
sections worth flagging rather than assuming the pool's closure
language silently carries over.

**CYA threshold that triggers closure-risk violation:** identical for
pools and spas — **closed if CYA exceeds 80 ppm; may reopen once CYA is
40 ppm or less** (15.4(2)a(4), 15.51(2)a(5)) — a close/reopen pair
using two different numbers, not a single ceiling.

**Free chlorine/bromine closure floors (mandatory, not discretionary,
unlike the pH clause):**
- Pools: closed if free chlorine <0.6 ppm or total bromine <1.0 ppm, or
  if free chlorine >8.0 ppm or total bromine >18.0 ppm (15.4(2)a(2))
- Spas: closed if free chlorine <1.0 ppm or total bromine <2.0 ppm, or
  if free chlorine >8.0 ppm or total bromine >18.0 ppm (15.51(2)a(2)-(3))

**Water clarity closure:** pool <8 ft deep closed if main-drain grate
openings aren't clearly visible from the deck; pool ≥8 ft deep closed if
the main drain itself isn't clearly visible (15.4(2)c). Spa closed if
drain-fitting grates aren't clearly visible with agitation off
(15.51(2)c).

**Testing frequency:**
- Disinfectant residual/ORP and pH — pools: daily within 30 minutes of
  opening, then at least every 4 hours until closing (twice daily
  minimum for condo/apartment/co-op/HOA facilities of ≤25 units)
- Disinfectant residual/ORP and pH — spas: daily before opening, then at
  least every **2 hours** until closing (tighter cadence than pools,
  same "spa gets shorter intervals" pattern seen in other states)
- Combined chlorine (if chlorine used): weekly — pools; **daily** — spas
  (15.51(2)e(4) — notably more frequent than the pool requirement)
- Cyanuric acid (if used): weekly — pools; **daily** — spas
  (15.51(2)e(5) — same tighter-cadence pattern)
- Total coliform lab sample: monthly, both pools and spas
- **★ Total alkalinity and calcium hardness test cadence: NOT FOUND in
  the current rewrite.** The prior (2020) version explicitly required
  alkalinity weekly and hardness monthly; **the 9/24/25 version's Test
  Frequency subsection (15.4(2)e / 15.51(2)e) no longer lists either
  parameter** — both are still required *equipment* (15.4(2)f) and still
  appear in the required *records* (15.4(6)), but the current text
  genuinely does not state how often to test them. This is a confirmed
  removal from the prior rule, not a missed excerpt — verified by
  full-text search of the current chapter.

**Fecal/Vomit/Blood Contamination Response — confirmed absent, not
unresearched:** a full-text search of the entire current chapter (both
the swimming pool and spa sections, all ~2,570 lines of the 9/24/25
version) for "fecal," "stool," "vomit," "diarrhea," and "blood" returns
**zero matches**. Iowa's 641 IAC Chapter 15 has **no fecal/vomit/blood
contamination protocol of any kind** — no closure trigger tied to a
contamination event, no CT value, no CDC cross-reference. This was
independently verified against both the 2020 and 2025 versions of the
chapter, so it isn't a rewrite-related loss — the gap appears to be
long-standing. Do not infer a protocol from Iowa's general
superchlorination/closure language (15.4(4)a, which only covers direct
chemical additions, unrelated to bodily-fluid incidents) — mark this
field `NOT FOUND — confirmed absent from the regulation text` rather
than borrowing another state's numbers.

**Open items for Iowa:** (1) alkalinity/hardness test cadence — removed
from the current rule text, not stated anywhere; (2) fecal/vomit/blood
protocol — confirmed genuinely absent from the code; (3) the
administering-agency name is ambiguous between the code's own
"Public Health[641]" header and DIAL's stated registration role.

**Sources used:**
- [Chapter 15, Swimming Pools, Spas, and Spray Pads — current version effective 9/24/25 (Iowa Legislature)](https://www.legis.iowa.gov/docs/iac/chapter/01-07-2026.641.15.pdf) — primary source for every citation above; verified via direct text extraction, not tool summarization
- [Chapter 15 — prior version, IAC 12/16/20 (Iowa Legislature)](https://www.legis.iowa.gov/docs/iac/chapter/04-20-2021.641.15.pdf) — used only for comparison, to confirm what changed in the rewrite (the tiered ORP table and the alkalinity/hardness cadence)
- [Swimming Pools & Spas — Iowa Department of Inspections, Appeals & Licensing](https://dial.iowa.gov/licenses/swimming-pools-spas) — confirms DIAL's current registration role
- [Iowa Admin. Code r. 641-15.4 — Swimming pool operations (Cornell LII)](https://www.law.cornell.edu/regulations/iowa/Iowa-Admin-Code-r-641-15-4)

---

## Kansas

**★ Sourcing confidence flag, unlike every other state in this file so
far:** every direct fetch of the primary regulation text this session
returned **HTTP 403** (regulations.justia.com, twice) or an
archive.org route Claude Code can't reach. What follows is built from
**two independent secondary extractions that agree with each other** on
every specific figure (a Cornell LII summary and an independent web
search that surfaced the same 20.0 ppm/8-hour diarrhea figure and the
same 2.0 ppm/pH 7.2–7.8 formed-stool figure from a different query), not
from reading the codified text directly the way Delaware/Illinois/
Indiana/Iowa were confirmed. **Recommend a follow-up direct read of
K.A.R. 4-27-16 before treating these numbers as fully confirmed** —
they're corroborated, not primary-verified, and that distinction should
carry into `sourceConfidence` (e.g. `"assumption"` rather than
`"confirmed"`) until someone reads the actual codified text.

- **Health Department name:** **Kansas Department of Agriculture**
  (Agency 4), not KDHE — confirmed via the Kansas Administrative
  Regulations' own agency directory metadata (Justia/Cornell both
  independently label K.A.R. Article 27 as "Agency 4 - DEPARTMENT OF
  AGRICULTURE"). This regulation lives inside Article 27, **"Lodging
  Establishments"** — Kansas apparently regulates general public/hotel
  pools as a hospitality-licensing function, not a health-department
  function, a genuinely different agency-type pattern than every other
  state collected so far.
  **A separate KDHE rule may also apply to a different facility
  type:** K.A.R. 28-4-129 ("Swimming and wading activities," Agency 28 =
  KDHE) turned up independently in the same searches — this appears to
  govern pools at youth camps/child care facilities specifically, a
  parallel track under a different agency for a different property
  type. Not researched this pass; flagging so AquaRunner doesn't assume
  Article 27 is the only Kansas pool rule that could apply to a given
  customer.
- **Official citation:** K.A.R. 4-27-16, "Swimming pools, recreational
  water facilities, and hot tubs," within Article 27 (Lodging
  Establishments) of the Kansas Administrative Regulations.
- **Has dedicated log sheet:** NOT FOUND — no state-provided form
  surfaced in any source reviewed.

**Chemistry thresholds (confidence: corroborated secondary sources, not
primary-verified — see flag above):**

| Reading | Requirement |
|---|---|
| Disinfectant residual (chlorine or bromine) — pools/recreational water facilities | 1.0 – 5.0 ppm |
| Disinfectant residual — hot tubs | 2.0 – 5.0 ppm |
| pH — all | 7.0 – 8.0 |
| Cyanuric Acid | **NOT FOUND — not mentioned anywhere in either source reviewed**, consistent absence rather than a missed excerpt |
| Total Alkalinity | **NOT FOUND** — same as CYA, absent from both sources reviewed |

**pH range that triggers mandatory closure/violation:** **NOT FOUND**
as a distinct closure threshold — both sources give only the routine
7.0–8.0 operating range, with no separate number stated for when a pH
violation forces closure (unlike Delaware/Illinois/Indiana/Iowa, which
all give a wider closure band distinct from the routine target). Don't
assume 7.0/8.0 doubles as the closure trigger — that wasn't
independently confirmed, just the operating range.

**CYA threshold that triggers closure-risk violation:** **NOT FOUND** —
consistent with cyanuric acid not appearing in the regulation at all
per both sources reviewed.

**Fecal/Vomit/Blood Contamination Response — kept distinct from routine
chemistry, corroborated across two independent extractions:**
- **Formed stool / vomit** (vomiting explicitly follows the same
  protocol as formed stool, no separate vomit-only track): remove
  material with a scoop (**vacuuming is prohibited**) and dispose of it
  sanitarily; close the pool for **30–60 minutes**; raise disinfectant
  to **2.0 ppm**; maintain **pH 7.2–7.8**; return to normal operating
  range before reopening
- **Diarrhea:** drain and close the pool; raise disinfectant to **20.0
  ppm** and maintain **pH 7.2–7.8** for a **minimum of 8 hours** (stated
  purpose: Cryptosporidium inactivation — a shorter hold time than
  Delaware/Indiana's ~12.75–30-hour diarrheal protocols, worth flagging
  as a real outlier once primary-verified, not assuming it's a
  transcription error); backwash the filter, replacing it if needed
- **Hot tub accidents (any type):** no partial-treatment option — **all
  guests must leave and the water must be completely drained**,
  followed by disinfection per manufacturer specification and filter
  replacement/disinfection. Kansas is the only state collected so far
  whose hot tub-specific incident rule skips the "raise disinfectant and
  hold" option entirely and goes straight to full drain-and-refill.
- **No blood-specific provision found** in either source.

**Open items for Kansas:** (1) the entire regulation needs a primary-
source read to move `sourceConfidence` from "corroborated secondary" to
"confirmed" — this is the one state this pass where that distinction
matters; (2) CYA and alkalinity — confirmed absent from what was
reviewed, but worth a primary-text check given how central those are in
every other state; (3) the parallel KDHE-administered pool rule
(K.A.R. 28-4-129) for youth camps/child care facilities — out of scope
this pass; (4) pH closure trigger — not found distinct from the routine
range.

**Sources used:**
- [Kan. Admin. Regs. § 4-27-16 — Swimming pools, recreational water facilities, and hot tubs (Cornell LII)](https://www.law.cornell.edu/regulations/kansas/K-A-R-4-27-16) — primary corroborating source (fetched as a summarized extraction, not verbatim; direct verbatim reads were blocked this session)
- Independent web search corroborating the same diarrhea-protocol figures (20.0 ppm, 8 hours, pH 7.2–7.8) from a separately phrased query, used to cross-check the Cornell extraction rather than take it on its own
- [Kansas Administrative Regulations, Agency 4, Article 27 — Justia index](https://regulations.justia.com/states/kansas/agency-4/article-27) — confirms agency/article structure (Department of Agriculture, Lodging Establishments) even though the specific section page 403'd on every direct fetch

---

## Kentucky

**★ Sourcing note — the primary regulation text couldn't be loaded
directly this session** (the Legislative Research Commission's own PDF
endpoint returned a server-side SQL connection error, confirmed via a
direct download attempt, not a fetch-tool limitation on this end).
Every figure below is corroborated across **two independent
extractions of 902 KAR 10:120** that agree with each other and cite the
same subsection numbers, plus the **official blank log-sheet form**
(read directly, not summarized) for agency/citation confirmation — a
meaningfully stronger footing than Kansas's entry above, but still one
notch below Delaware/Illinois/Indiana/Iowa, where the actual regulation
text was read directly. One real conflict came up during sourcing (a
single search result claimed a 10 ppm spa chlorine maximum); it's
**not** used below — two independent extractions of the regulation
itself agree on 5 ppm, so that's what's seeded.

- **Health Department name:** Kentucky Cabinet for Health and Family
  Services (CHFS) — independently confirmed via the official "Swimming
  Pool Log Sheet" form (DFS-352, 7/2022), which is issued under the
  CHFS letterhead and itself cites "Enforced by 902 KAR 10:120 Section
  11."
- **Official citation:** 902 KAR 10:120, "Kentucky public swimming and
  bathing facility operations" — water quality at Section 8, closure
  conditions at Section 17, testing/record-keeping cadence at Section 8
  and Section 11.
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  DFS-352, a blank weekly grid (Free/Combined chlorine, pH, turbidity,
  water temp, alkalinity, cyanuric acid, per day) with a chemical-added
  log on the reverse. The form itself prints **no target ranges** (a
  blank template, unlike Georgia's or Hawaii's forms) — the numbers
  below all come from the regulation text, not the form.

**Chemistry thresholds (902 KAR 10:120, Section 8):**

| Reading | Requirement |
|---|---|
| Free Chlorine — pools/diving pools | 1 – 5 ppm (§8(1)(a)) |
| Free Chlorine — spas/hot tubs | 2 – 5 ppm (§8(2)(a)) — **not** 10 ppm; that figure appeared in one search result but isn't corroborated by either direct extraction of the regulation |
| pH — all | 7.2 – 7.8 (§8(3)) |
| Cyanuric Acid (if used as stabilizer) | Max 50 ppm (§8(1)(c)(3)) — notably lower than Delaware/Illinois's 100 ppm and closer to Indiana's 60 ppm |
| Total Alkalinity | 50 – 180 ppm (§8(5)) |

**pH range that triggers mandatory closure:** §17(1)(f) — closure is
required whenever **"the pH is outside the range prescribed by this
administrative regulation,"** i.e. outside the 7.2–7.8 routine range
itself. Unlike Delaware/Illinois/Indiana/Iowa, Kentucky doesn't appear
to define a separate, wider closure band — the routine target and the
closure trigger are the same range. Flagging this as a genuine
state-specific pattern rather than a sourcing gap, since both
independent extractions agree on this reading, but recommend
confirming against the primary text before treating "no separate
closure band" as certain.

**CYA threshold that triggers closure-risk violation:** not
independently stated as its own closure trigger in either source
reviewed — §8(1)(c)(3) sets the 50 ppm ceiling, but neither extraction
surfaced a subsection tying CYA specifically to §17's closure list the
way pH and fecal accidents are. Treat as a standing violation of §8
rather than a confirmed independent §17 closure trigger until
primary-verified.

**Testing frequency:**
- Disinfectant residual and pH: **at least three times daily**, with
  greater frequency required if bather load or weather conditions
  warrant
- Total alkalinity and cyanuric acid: **checked weekly, or more often
  as needed** (§8(8)(c)(1)-(2))
- Records logged weekly on the DFS-352 form per §11

**Fecal/Vomit/Blood Contamination Response — kept distinct from routine
chemistry per this file's architecture:**

§17(1)(i) lists **"there has been a fecal accident in the pool"** as
one of the enumerated conditions requiring the Cabinet to **immediately
order closure** of the facility. **★ Genuine gap, not a missed
excerpt:** unlike Delaware/Indiana/Kansas (all of which give an exact
ppm target and hold time for the incident response itself), **neither
source found any specific chlorine ppm, CT value, or hold-time
requirement tied to the fecal-accident closure** — §17(1)(i) is purely
a closure trigger. Reopening follows the *general* closure-reopening
process in §17(7): the owner requests reinspection after correcting the
condition, and the Cabinet must reinspect within 10 days of written
notice — no fecal-specific chemistry threshold gates reopening the way
it does in most other states collected. **No separate vomit or blood
provision found** in either source — "fecal accident" appears to be
the only named contamination trigger in this regulation.

**Open items for Kentucky:** (1) primary regulation text couldn't be
loaded this session — recommend a follow-up direct read to move
`sourceConfidence` from corroborated-secondary to fully confirmed,
especially for the pH-closure-equals-routine-range reading and the
CYA-closure-trigger question; (2) the fecal accident protocol is
confirmed as a bare closure trigger with no numeric reopening standard
in the regulation itself — don't borrow another state's CT value for
Kentucky.

**Sources used:**
- [902 KAR 10:120 — Kentucky public swimming and bathing facility operations (Cornell LII)](https://www.law.cornell.edu/regulations/kentucky/902-KAR-10-120) — primary corroborating source, cited subsection-by-subsection, cross-checked against a second independent extraction
- [Title 902, Chapter 10, Regulation 120 (Kentucky Legislative Research Commission)](https://apps.legislature.ky.gov/law/kar/titles/902/010/120/) — official regulation index page; the LRC's own PDF-generation endpoint for this regulation returned a server error on direct download this session
- [CHFS Swimming Pool Log Sheet, DFS-352 7/2022 (chfs.ky.gov)](https://www.chfs.ky.gov/agencies/dph/dphps/emb/Documents/PoolLogSheet.pdf) — read directly via text extraction; confirms agency, citation, and record-keeping cadence

---

## Louisiana

**★ Genuine outlier — read directly from the primary text, not a
sourcing error:** Louisiana's free chlorine floor is **0.4 ppm**, far
below every other state collected in this file (all others sit at 1.0
ppm or higher). This was extracted via direct text extraction of the
actual regulation PDF (not a tool summary), and independently
cross-checked against two separate web searches that landed on the same
0.4 ppm figure from different queries — including one source noting the
Justia mirror of this Part "appear[s] to have been updated through
September 2024." **Still flag this for a manual currency check** before
relying on it: the specific document read here is stamped "Louisiana
Administrative Code, January 2010" with historical notes tracing to
2002 promulgation, and no evidence of a post-2010 amendment to Chapter 9
specifically was found. It's possible but not confirmed that Louisiana
has since updated this number toward the CDC/MAHC-typical 1.0 ppm floor
seen in every other state.

- **Health Department name:** Louisiana Department of Health (LDH) —
  the regulation text itself still refers throughout to the "state
  health officer" and was historically promulgated by the "Department
  of Health and Hospitals, Office of Public Health" (LDH's former name,
  pre-2016 rename).
- **Official citation:** Louisiana Administrative Code, Title 51,
  "Public Health — Sanitary Code," **Part XXIV, "Swimming Pools and
  Natural or Semi-Artificial Swimming or Bathing Places"** —
  specifically Chapter 9 ("Disinfection and Bacteriological Quality"),
  §901–§909.
- **Has dedicated log sheet:** NOT FOUND — no state-issued form
  surfaced in the regulation text or in sources reviewed.
- **★ Pools and spas share one undifferentiated standard:** Part XXIV's
  own definitions explicitly fold "hot tubs, medical treatment pools,
  spas, whirlpools, and water parks" into the single term the whole
  chapter regulates — there's no separate spa chemistry table anywhere
  in this Part, the same "no pool-vs-spa split" pattern seen in Illinois.

**Chemistry thresholds (§903, §905 — applies uniformly to pools and
spas):**

| Reading | Requirement |
|---|---|
| Free Chlorine — chlorine alone, no ammonia | 0.4 – 0.6 ppm (§905.A) |
| Free Chlorine — chlorine with ammonia | 0.7 – 1.0 ppm (§905.A) |
| pH — pools/spas | 7.2 – 7.8 "at any time the facility is in use" (§905.B(1)) |
| pH — natural bathing beaches (different facility type, not a pool/spa) | Should not be used if pH <6.5 or >8.5 — advisory, not a mandatory-closure "shall" (§905.B(2)) |
| Cyanuric Acid | **NOT FOUND — no numeric maximum stated anywhere in Chapter 9.** §901.C only requires the facility to *own a test kit* capable of measuring CYA "if used" — no ceiling, no required range |
| Total Alkalinity | **NOT FOUND** — same shape as CYA: test-kit capability required (§901.C), no numeric range given anywhere in the chapter |
| Max water temperature (heated pools) | 93°F (§905.D) |
| Clarity | Black 6-inch disk visible from the deck up to 10 yards away (§905.C) |

**pH range that triggers mandatory closure/violation:** **NOT FOUND as
a distinct closure trigger.** §905.B(1) states the 7.2–7.8 operating
requirement but attaches no enumerated closure consequence to it, and
—unlike every other state in this file— **Chapter 9 contains no
"shall close" or "shall be closed" language anywhere**, confirmed via a
full-text search of the entire Part XXIV document. The closest thing to
a closure mechanism in this Part is a **general, non-numeric
discretionary authority** in §101.C: *"No natural or semi-artificial
swimming pool or bathing place shall be operated when the water...is
determined by the state health officer to be so polluted as to
constitute a menace to health if used for swimming or bathing."* That's
a health-officer judgment call, not a bright-line pH/chlorine/CYA
number the way Delaware/Illinois/Indiana/Iowa/Kentucky all enumerate.

**CYA threshold that triggers closure-risk violation:** **NOT FOUND** —
consistent with there being no numeric CYA standard in the chapter at
all, and no enumerated closure list to attach a threshold to even if
one existed.

**Testing frequency:** **NOT FOUND anywhere in Chapter 9** — confirmed
via full-text search (no "daily," "weekly," or similar cadence language
appears anywhere in the swimming-pool-water-quality sections). §901.C
only requires *owning* a test kit; the chapter never states how often
it must be used. This is a more complete gap than any other state
collected so far — every other state at minimum specifies a routine
test cadence even when other fields (like CYA or alkalinity numbers)
were missing.

**Fecal/Vomit/Blood Contamination Response — confirmed absent, not
unresearched:** a full-text search of the entire Part XXIV document for
"fecal," "vomit," "stool," "diarrhea," and "blood" returns **one match
total**, and it's for routine *fecal coliform bacteriological sampling*
in §909.B (bathing beaches, not an incident-response protocol). **There
is no fecal/vomit/blood incident closure trigger, no CT value, and no
CDC cross-reference anywhere in this Part.** This is the most complete
absence of an incident protocol found in this batch of states — even
Iowa and Kentucky, which also lack a numeric CT protocol, at least have
*some* closure trigger tied to contamination (Kentucky's §17(1)(i));
Louisiana appears to have neither.

**Open items for Louisiana:** (1) the entire chapter reads as unusually
sparse compared to every other state collected — confirm whether a more
recent LDH rulemaking (post-2010) has updated Chapter 9 with numbers
this pass didn't find, especially the CYA/alkalinity gap and the
missing test cadence, before treating this as Louisiana's complete
current rule; (2) the 0.4 ppm chlorine floor is a genuine, corroborated
outlier — don't "correct" it toward another state's number, but do
prioritize this state for a manual recheck given how far it diverges;
(3) no fecal/vomit/blood protocol and no enumerated closure list exist
in the source reviewed — confirmed absent, not overlooked.

**Sources used:**
- [Title 51, Part XXIV — Swimming Pools and Natural or Semi-Artificial Swimming or Bathing Places (poolweb.com, mirrored copy of the LDH-promulgated text)](https://assets.poolweb.com/state_regs/louisiana.pdf) — read via direct text extraction (pdftotext), not tool summarization; every citation above comes from this document
- Independent web search cross-checking the 0.4 ppm free chlorine figure and confirming the Justia mirror of this Part appears current through September 2024
- [Louisiana Administrative Code, Title 51, Part XXIV — Justia index](https://regulations.justia.com/states/louisiana/title-51/part-xxiv/) — confirms Part structure and chapter organization (individual section pages 403'd on direct fetch)
- [Louisiana Administrative Code, full Title 51, November 2023 (LDH via finalsite.net)](https://resources.finalsite.net/images/v1723139002/apsborg/cz9ofttvm8d6dsumf3ia/_Title51HealthSanitaryCodeNOV2023.pdf) — located but not fully reviewed (543-page full sanitary code); flagged as a follow-up source to confirm Part XXIV Chapter 9 hasn't been amended since the January 2010 text used here

---

## Maine

- **Health Department name:** Maine Department of Health and Human
  Services (DHHS), specifically the Maine Center for Disease Control
  and Prevention (Maine CDC) — the source document is hosted under
  DHHS/Maine CDC's own site.
- **Official citation:** 10-144 CMR Chapter 202, "Rules Relating to
  Public Pools and Spas" — effective September 1, 2010, and confirmed
  via Cornell LII (no evidence of a later amendment found).
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  a "Pool Log" form is published alongside the rule on Maine CDC's own
  site (separate PDF, not embedded in the rule text itself).

**Chemistry thresholds (Section 4(C) "Chemical Operational
Parameters" and Appendix A):**

| Reading | Requirement |
|---|---|
| pH — pools and spas | 7.2 – 7.8 |
| Free Chlorine — pools | 1.0 – 3.0 ppm target; max 4.0 ppm |
| Free Chlorine — spas | 4.0 – 5.0 ppm target; max 8.0 ppm |
| Bromine — pools (alternative disinfectant) | 3.0 – 5.0 ppm target; max 7.0 ppm |
| Bromine — spas | 6.0 – 8.0 ppm target; max 10.0 ppm |
| Cyanuric Acid (Appendix A, NSPI standard table) | Min 10, ideal 30–50, max 150 ppm |
| Total Alkalinity (Appendix A) | Min 60, ideal 80–100 (calcium hypochlorite/lithium/sodium hypochlorite) or 100–120 (dichlor/trichlor/gas/bromine), max 180 ppm |
| Total Dissolved Solids | Max 1,500 ppm above pool start-up TDS |
| Calcium Hardness | Min 150, ideal 200–400, max 1,000 ppm |

**Stabilized chlorine (cyanuric acid) is prohibited in indoor pools**
(Section 4(C)(1)) — same prohibition pattern as Delaware, Indiana, and
Iowa. **PHMB and elemental chlorine gas are both flatly prohibited** in
every commercial public pool/spa (Section 4(D)-(E)) — Maine is the
first state collected in this file to ban PHMB outright rather than
seed it as an unmapped disinfectant type the way Maryland's ruleset
does per `COMPLIANCE_RULESET_NOTES.md`.

**pH range that triggers mandatory closure/violation:** Maine uses a
**discretionary, opinion-based closure authority**, the same shape as
Connecticut's and Louisiana's — not a separate numeric closure band.
Section 10(B)(1): *"If, in the opinion of the Department, a public pool
or spa is maintained or operated in a manner which creates an
unhealthful, unsafe, or unsanitary condition... the public pool or spa
may be closed."* Section 10(B)(2) clarifies unhealthful/unsafe/unsanitary
conditions "include, but are not limited to, the failure to meet
clarity, sanitization, **pH**, safety or bacteriological standards" —
so falling outside the routine 7.2–7.8 target is *a* trigger for
discretionary closure, but there's no separate wider "closure band"
number the way Delaware/Illinois/Indiana/Iowa/Kentucky all define.

**CYA threshold that triggers closure-risk violation:** not a distinct
numbered closure trigger — same discretionary-authority shape as pH
above. Falling outside the Appendix A range (10–150 ppm) would fall
under "failure to meet sanitization... standards" per Section
10(B)(2), but there's no separate bright-line closure number beyond the
Appendix A range itself.

**Testing frequency (Section 4(G)):**
- Sanitizer residual and pH: **at least 3 times per day**, at least one
  of which must be a manual reading (not just an automated controller
  readout)
- Combined chlorine (if chlorine used): **once per day**
- Total alkalinity, calcium hardness, and cyanuric acid (if used):
  **once per week**
- During public pool events, supervision/monitoring frequency must
  increase beyond typical daily operation (Section 4(G)(3))
- Records retained **at least 1 year**, available to the Department on
  request

**Fecal/Vomit/Blood Contamination Response (Section 7(B)) — kept
distinct from routine chemistry per this file's architecture, and one
of the more complete protocols collected:**

- Urinating, fecal discharge, vomiting, bleeding, spitting, or nose-
  blowing in the pool/spa is flatly prohibited (Section 7(B)(1))
- **Formed stool, vomiting, or bleeding accident** (all three share one
  track — no separate vomit-only or blood-only rule): close the
  pool/spa, remove fecal material if present, raise free chlorine to a
  **minimum of 2.0 ppm** if necessary, maintain **pH 7.2–7.5** for a
  **minimum of 30 minutes**, with continuous filtration throughout
  (Section 7(B)(2))
- **Diarrheal fecal accident:** close the pool/spa, remove fecal
  material, raise free chlorine to **20 ppm**, maintain **pH 7.2–7.5**
  for a **minimum of 8 hours**, filtration running continuously and
  **backwashed to waste at the end of the 8 hours**; reopen once the 8
  hours have elapsed and chlorine is back within the Appendix A range
  (Section 7(B)(3))
- **★ Blood is folded into the same track as formed stool/vomiting**,
  not exempted the way New York/Delaware treat it, and not given its
  own heavier protocol either — a third distinct approach to blood
  contamination collected in this file (exempt / optional-treat-as-
  formed-stool / mandatory-treat-as-formed-stool).
- **Mandatory event log** for every fecal/vomiting/bleeding accident:
  date/time, contamination type, free chlorine at time of event, free
  chlorine and pH at reopening, and a description of remediation steps
  taken (Section 7(B)(4))
- No person actively ill with vomiting or diarrhea may use any public
  pool or spa (Section 7(C)(1)) — a bather-exclusion rule, distinct from
  the incident-response rule above
- **No shared-filtration cascading-closure language found** — unlike
  Delaware/New York/California/Georgia/Indiana, Maine's text doesn't
  extend the closure to other pools sharing the same recirculation
  system; confirmed absent via full-text review, not assumed.

**No remaining open items for Maine** — chemistry, closure logic
(discretionary, not bright-line), and the fecal/vomit/blood protocol are
all sourced directly from the regulation text with section citations.

**Sources used:**
- [10-144 CMR Chapter 202, Rules Relating to Public Pools and Spas (Maine DHHS/Maine CDC)](https://www.maine.gov/dhhs/mecdc/sites/maine.gov.dhhs.mecdc/files/144c202_SwimmingPoolSpaRules-2010.pdf) — read via direct text extraction (pdftotext); every citation above comes from this document
- [C.M.R. 10, 144, ch. 202 (Cornell LII)](https://www.law.cornell.edu/regulations/maine/department-10/division-144/chapter-202) — used to confirm no amendment postdates the September 2010 effective date

---

## Massachusetts

**★ Currency note:** the source document's page footer reads "3/20/98
(Effective 2/20/98) - corrected" throughout, but an independent search
found a secondary reference describing the current version as running
"through Register 1531, September 27, 2024" — meaning the substantive
text may not have changed since 1998 even though the register entry is
current. The actual numbers read here (1.0–3.0 ppm chlorine, 7.2–7.8
pH) are mainstream, unremarkable figures matching most other states
collected — unlike Louisiana's outlier 0.4 ppm, there's no substantive
reason to suspect this text is stale, but it's worth a footnote given
the old footer date.

- **Health Department name:** Massachusetts Department of Public
  Health (DPH) — enforced locally by each municipality's Board of
  Health.
- **Official citation:** 105 CMR 435.000, "Minimum Sanitation for
  Swimming Pools (State Sanitary Code, Chapter V)" — chemistry at
  §435.29, closure at §435.34.
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  **Appendix A, "Swimming Pool Testing Records,"** printed directly
  inside the regulation itself (not a separate document) with the
  acceptable ranges pre-printed on the form: *"FREE CHLORINE RESIDUAL
  (1.0-3.0)," "pH (7.2 - 7.8)," "TOTAL ALKALINITY (80 - 150 PPM)"* —
  independently corroborating the §435.29 table below, the same
  "official form prints the actual standard" pattern seen in
  Georgia/Hawaii.

**Chemistry thresholds (§435.29(1)):**

| Reading | Requirement |
|---|---|
| pH — chlorine or bromine disinfection | 7.2 – 7.8 |
| Total Alkalinity — chlorine or bromine | 50 – 150 ppm |
| Free Chlorine | 1.0 – 3.0 ppm |
| Combined Chlorine | 0.0 – 0.2 ppm |
| Bromine (alternative disinfectant) | 2.0 – 6.0 ppm |
| Cyanuric Acid (if used as stabilizer, or if a chlorinated isocyanurate is the disinfecting chemical) | At least 30 mg/L, must not exceed 100 mg/L |
| Special-purpose pool (spa) max temperature | 104°F (§435.33) |

**★ No separate spa chemistry track — Massachusetts's chemistry table
(§435.29) applies identically to "swimming, wading and special purpose
pools"** (special purpose pool = the regulation's term covering spas),
the same "one flat range regardless of body type" pattern seen in
Illinois and Louisiana. The only place spas get a distinct number is
the 104°F temperature ceiling and a much faster turnover requirement
(30 minutes, §435.32(1)(c), vs. 8 hours for standard pools).

**pH range that triggers mandatory closure:** §435.34(2) — **"If at any
time the... pool water does not conform with the requirements set forth
in 105 CMR 435.28 through 435.31, the operator shall immediately close
the pool until the pool water conforms with those standards."** Since
§435.29 (the chemistry table, including the 7.2–7.8 pH range) falls
within that 435.28–435.31 span, **the routine operating range and the
closure trigger are the same range** — the same shape independently
found in Kentucky, not a separate wider closure band.

**CYA threshold that triggers closure-risk violation:** same mechanism
as pH — CYA sits inside §435.29, which is covered by §435.34(2)'s
immediate-closure requirement, so exceeding 100 mg/L (or falling below
30 mg/L when in use as a stabilizer) is itself a mandatory-closure
condition under Massachusetts's "any deviation from §435.28–435.31
closes the pool" model. No separate, looser number exists.

**Testing frequency (§435.29(2)-(6), §435.30):**
- Disinfectant residual: **at least 4 times daily**, one of which must
  occur during peak bather load
- pH: tested **simultaneously with** each disinfectant residual test
- Alkalinity and calcium hardness: **weekly**
- If electronic monitoring is used alongside chlorine/bromine, manual
  verification of disinfectant, pH, and alkalinity is still required
  **at least once every 24 hours** — automation doesn't waive manual
  testing, only reduces its frequency (§435.29(6))
- §435.30 explicitly states automatic equipment **does not supersede**
  the §435.29 testing requirements

**Fecal/Vomit/Blood Contamination Response — confirmed absent, not
unresearched:** a full-text search of the entire regulation (all 47
numbered sections plus Appendix A) for "fecal," "stool," "vomit,"
"diarrhea," and "blood" returns **zero substantive matches** — the only
"blood" hit is an unrelated blood-pressure health warning for special-
purpose (spa) pool users (§435-area bather-health notice). Massachusetts
has **no fecal/vomit/blood incident protocol, no CT value, and no CDC
cross-reference** anywhere in 105 CMR 435. This is the fourth state in
this file (after Iowa, Kentucky, Louisiana) confirmed via full-text
search to have no such protocol in its base pool code.

**Open items for Massachusetts:** (1) confirm the 1998 text hasn't been
substantively superseded by a later amendment referenced only in a
register index, not the document text itself; (2) fecal/vomit/blood —
confirmed absent from the code, not a research gap.

**Sources used:**
- [105 CMR 435.000, State Sanitary Code Chapter V (mass.gov)](https://www.mass.gov/doc/105-cmr-435-state-sanitary-code-chapter-v-sanitary-standards-for-swimming-pools/download) — read via direct text extraction (pdftotext); every citation above comes from this document
- Independent web search corroborating the current-through-September-2024 register status of this chapter

---

## Michigan

- **Health Department name:** **Michigan Department of Environment,
  Great Lakes, and Energy (EGLE)** — not the Michigan Department of
  Health and Human Services (MDHHS). Confirmed via EGLE's own
  December 2025 guidance document and the full compiled rules PDF, both
  hosted on michigan.gov/egle. This is a genuinely different agency
  type than most states collected, joining Kansas (Agriculture) as a
  non-health-department regulator — Michigan's is an environmental
  agency.
- **Official citation:** Michigan Public Act 368 (Public Health Code),
  Part 125, implemented via Mich. Admin. Code R 325.2101–R 325.2197
  ("Public Swimming Pools" rules) — chemistry at **R 325.2194 ("Rule
  94")**, contamination response at **R 325.2194a ("Rule 94a")**, test
  equipment at R 325.2159 ("Rule 59").
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  EGLE publishes both an "EQP1719 Public Swimming Pool Monthly
  Operation Report" and an "EQP1735 Public Swimming Pool Inspection
  Report," both current as of the December 2025/January-April 2026
  revision dates on the source PDFs.

**Chemistry thresholds (R 325.2194, Table 3 — applies uniformly to
pools and spas, confirmed via primary text; a secondary source claimed
a separate 2.0/4.0 ppm spa minimum, but that figure does not appear
anywhere in the actual rule text and was not used):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 8.0 (minimum 7.2, maximum 8.0 per Rule 94 table) |
| Free Chlorine — pH 7.2 to 7.5 | Minimum 1.0 ppm |
| Free Chlorine — pH >7.5 to 8.0 | Minimum 2.0 ppm |
| Bromine — either pH band | Minimum 2.0 ppm |
| Chlorinated cyanurate (stabilized chlorine), CYA 20–40 ppm — pH 7.2–7.5 / >7.5–8.0 | Minimum 2.0 / 4.0 ppm |
| Cyanuric Acid | Max 80 ppm (Rule 94(6)) |
| Max water temperature | 104°F (Rule 94(7)) |
| Total Alkalinity | **NOT FOUND** — no numeric range anywhere in the rules; R 325.2159 only lists it as a parameter a test kit "may" need to cover if EGLE determines it's important, with no stated target |

**★ New pattern — a CYA-graduated minimum-chlorine formula, not just a
flat cap:** unlike every other state collected (which treat CYA purely
as a ceiling), Michigan's Rule 94 footnote makes the **minimum**
chlorine residual itself a function of the CYA level: *"At 20 to 40 ppm
cya, [minimum is 2.0/4.0 ppm by pH band]. For higher levels of cya, add
0.5 mg/L for each additional 20 ppm cya, or fraction of 20 ppm, above
40 ppm."* EGLE's own December 2025 guidance spells this out as a table:
CYA 20–40 ppm → 2.0/4.0 ppm min; >40–60 ppm → 2.5/4.5 ppm min; >60–80
ppm → 3.0/5.0 ppm min; ≥80 ppm → **"lower CYA levels by draining and
adding fresh water"** rather than a chlorine number at all. This is a
genuine curve/formula pattern like Alaska's Table E, but expressed as a
computable linear formula rather than a graph — worth using as the
reference shape if `ChemistryThreshold.relationalRule` needs a second
worked example beyond Alaska's.

**pH range that triggers mandatory closure:** EGLE's own December 2025
guidance is explicit and numeric, tied directly to Rule 94: **"EGLE
advises to issue closure order when pH < 7.2"** and **"...when pH >
8.0"** — i.e., the routine Rule 94 range *is* the closure trigger, the
same shape independently found in Kentucky and Massachusetts. Also per
this guidance: **closure ordered when free chlorine > 10 ppm** (tied to
NSF product-label maximums, not a separate rule-text number) and
**closure ordered when free chlorine or bromine falls below the Rule 94
table minimum for the current pH band**.

**CYA threshold that triggers closure-risk violation:** **closure
ordered when CYA exceeds 80 ppm** — directly stated both in Rule 94(6)
itself and in EGLE's guidance document, making Michigan one of the few
states in this file with an *explicit, named* CYA closure trigger
(rather than an inferred one via a general "any standard violation
closes the pool" clause).

**Testing frequency (R 325.2194(2)):** *"A swimming pool owner shall
test the water before and during each period of swimming pool use, at
a frequency of at least once per day."* **★ Notably less frequent than
most other states collected** (Illinois/Indiana/Maine/Massachusetts all
require 2–4 tests per day) — Michigan's rule text sets a once-daily
floor, even though EGLE's separate operational guidance recommends
tighter *ranges* (not frequency) for best practice. Cyanuric acid, when
used, must be tested **at least once each week, more often if
necessary** (Rule 94(6)).

**Fecal/Vomit/Blood Contamination Response — a genuinely distinct
pattern, not absence and not a state-specified CT protocol:**

Rule 94(10): *"If a swimming pool becomes polluted with feces, vomit,
sewage, or other material, then the owner shall immediately close the
pool from use and take actions to mitigate the pollution and restore
water quality."* Reopening: *"according to the contingency plan adopted
by the owner under R 325.2194a"* — or, if no approved plan exists, only
with department/local health department approval to reopen.

**★ New pattern — the state delegates the numeric protocol to a
facility-specific plan, rather than specifying one itself:** Rule 94a
requires every pool owner to **write and maintain their own
Contingency and Emergency Response Plan**, covering "rapid mitigation
of contamination or water quality deterioration" per Rule 94, kept
on-site for review. This is a third distinct shape for this pattern in
the file, alongside "state specifies an exact CT value" (Delaware,
Indiana, Maine) and "no protocol exists at all" (Iowa, Kentucky,
Louisiana, Massachusetts) — Michigan requires *a* protocol to exist,
but the state doesn't dictate its numbers; each facility's own written
plan is the operative document. AquaRunner would need a customer's
actual contingency plan document, not a state-level number, to know
Michigan's true incident-response chemistry for a given property.

A separate, general safety-equipment rule (R 325.2165(3)) requires
every pool to keep **a blood-spill cleanup kit** (medical-grade latex
gloves + antimicrobial hand wipe) on hand — this is a first-aid/PPE
equipment requirement, not part of the water-treatment response above.

**Open items for Michigan:** (1) total alkalinity — confirmed absent,
no numeric standard anywhere in the rules; (2) the fecal/vomit incident
response has no state-mandated ppm/CT value — AquaRunner would need
each customer's own contingency plan to represent this state
faithfully, which is a genuinely different data-modeling need than
every CT-value state collected so far.

**Sources used:**
- [Maximum Disinfectant Residuals and Operational Ranges — EGLE guidance, December 2025](https://www.michigan.gov/egle/-/media/Project/Websites/egle/Documents/Programs/DWEHD/Public-Swimming-Pool/Pools-Disinfectant-Residuals-and-Operational-Ranges.pdf) — read via direct text extraction; the CYA-graduated formula table, closure-order advisories, and CDC MAHC cross-references all come from this document
- [Public Act and Rules Governing Public Swimming Pools (EGLE, full compiled rules)](https://www.michigan.gov/egle/-/media/Project/Websites/egle/Documents/Programs/DWEHD/Public-Swimming-Pool/Public-Swimming-Pool-Public-Act-and-Rules.pdf) — read via direct text extraction; Rule 94, 94a, 59, and 65 citations all come from this document
- [EQP1735 Public Swimming Pool Inspection Report, EGLE](https://www.michigan.gov/-/media/Project/Websites/egle/Documents/Forms/DWEHD/Public-Swimming-Pool/EQP1735-Public-Swimming-Pool-Inspection-Report.pdf) — confirms current state-provided inspection form exists
- [EQP1719 Public Swimming Pool Monthly Operation Report, EGLE](https://www.michigan.gov/egle/-/media/Project/Websites/egle/Documents/Forms/DWEHD/Public-Swimming-Pool/EQP1719-Public-Swimming-Pool-Monthly-Operation-Report.pdf) — confirms current state-provided log form exists

---

## Minnesota

- **Health Department name:** Minnesota Department of Health (MDH).
- **Official citation:** Minnesota Rules, Chapter 4717, "Public
  Swimming Pools" — chemistry at **4717.1750 ("Pool Water Condition")**,
  operator/record requirements at 4717.0650/4717.0750, closure list at
  **4717.3970 ("Pool Closure")**.
- **Has dedicated log sheet:** Not confirmed as a specific state-issued
  form — 4717.0750 mandates what a pool record must *contain* (flow
  rates, chemical amounts, disinfectant residuals, pH, temperature,
  equipment issues, accidents) but doesn't reference a named MDH form
  the way Georgia's or Michigan's rules do → treat as
  `logSheetSource: built-from-code` unless a specific MDH form is
  confirmed separately.
- **★ Sourcing note:** the disinfectant/pH/alkalinity/spa numbers below
  come from a 2016-dated primary-source PDF (pdftotext-verified). The
  cyanuric acid rule specifically was re-verified against the **current
  text as amended effective May 4, 2022** (also pdftotext-verified,
  directly from Minnesota's Office of the Revisor of Statutes) — the
  2016 copy predates the CYA amendment and was not used for that field.

**Chemistry thresholds (4717.1750):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.8 (Subp. 5) |
| Free Chlorine — pools | Minimum 1.0 ppm (Subp. 3.A) |
| Free Chlorine — spas | Minimum 2.0 ppm (Subp. 4) |
| Bromine — pools | Minimum 2.0 ppm (Subp. 3.B) |
| Bromine — spas | Minimum 4.0 ppm (Subp. 4) |
| Disinfectant maximum | 10 ppm chlorine / 20 ppm bromine, both pools and spas (Subp. 3.C) |
| Combined Chlorine | Must not exceed 0.5 ppm — superchlorinate/treat if exceeded (Subp. 3.E) |
| Cyanuric Acid | Max 100 ppm where used to stabilize chlorine (Subp. 11.D, as amended 2022) |
| Total Alkalinity | Minimum 50 ppm — **no stated maximum** (Subp. 6) |
| Max water temperature | 104°F (Subp. 1) |

**★ Cyanuric acid fully banned in indoor pools, phased in by pool age —
confirmed current as of this rewrite:** per the May 2022 amendment,
**use of cyanuric acid in any new indoor pool has been prohibited since
February 23, 2022**, and **use in any existing indoor pool has been
prohibited since February 23, 2024** (Subp. 11.A-B) — both dates are
now in the past as of this pass, so the ban is fully in effect
statewide for every indoor pool regardless of age. Where CYA is used
(necessarily outdoor pools only, post-2024), it must be **tested and
recorded at least once a week** (Subp. 11.C).

**pH range that triggers mandatory closure/violation:** **not
independently listed** in 4717.3970's enumerated closure conditions.
That list names only water clarity (item B) and disinfectant residual
(item C) as specific triggers — **pH isn't named at all**, even though
4717.1750 Subp. 5 sets the 7.2–7.8 target. A pH violation would only
force closure under the catch-all item E ("any condition that
endangers the health or safety of the public"), not as a named,
numbered trigger the way chlorine/bromine and clarity are. Flag this
distinction rather than assuming pH is enumerated the way it is in
Delaware/Illinois/Indiana/Kentucky/Michigan.

**CYA threshold that triggers closure-risk violation:** **NOT FOUND**
as an independently named closure trigger — 4717.3970's list doesn't
mention cyanuric acid at all (only clarity and disinfectant residual
are named). Exceeding 100 ppm would only trigger closure via the
general catch-all, same shape as the pH gap above.

**Testing frequency:** **NOT FOUND as an explicit intra-day count**
anywhere in Chapter 4717 — confirmed via full-text search (no "times
per day," "hourly," or "twice daily" language appears anywhere in the
pool-specific sections). 4717.0750 requires disinfectant residual and
pH readings to be recorded **"for each day the pool is open,"** which
implies at least once daily, but no explicit multiple-tests-per-day
requirement exists the way it does in Illinois/Indiana/Maine/
Massachusetts/Michigan. Notably, 4717.0750.F explicitly states
alkalinity and cyanuric acid measurements are **"not required to be
recorded daily"** — a looser cadence than every other state collected,
confirmed by the rule's own text rather than inferred from silence.
Cyanuric acid does get its own explicit weekly minimum from the 2022
amendment (Subp. 11.C above), which supersedes this looser
"not-daily" framing specifically for CYA.

**Fecal/Vomit/Blood Contamination Response — confirmed absent, not
unresearched:** a full-text search of the entire swimming-pool-specific
portion of Chapter 4717 for "fecal," "stool," "vomit," "diarrhea," and
"blood" returns **zero matches** (the only "blood" hits are an
unrelated spa health-warning sign about blood pressure). Minnesota has
**no fecal/vomit/blood incident protocol, no CT value, and no CDC
cross-reference** anywhere in its public pool rules — the fifth state
in this file (after Iowa, Kentucky, Louisiana, Massachusetts) confirmed
via full-text search to have no such protocol.

**Open items for Minnesota:** (1) total alkalinity has a floor but no
stated ceiling — confirmed absent, not a missed excerpt; (2) neither pH
nor CYA is independently named in the enumerated closure list, only
clarity and disinfectant residual are — don't assume parity with states
where every parameter is separately enumerated; (3) no intra-day testing
frequency requirement exists, confirmed via full-text search; (4)
fecal/vomit/blood — confirmed genuinely absent from the code.

**Sources used:**
- [Minnesota Rules Chapter 4717, Public Swimming Pools — full text, 2016 codification (Office of the Revisor of Statutes)](https://www.revisor.mn.gov/rules/pdf/4717/2016-06-27%2009:41:12+00:00) — read via direct text extraction (pdftotext); used for every citation except the cyanuric acid subpart
- [Minnesota Rules 4717.1750, current text as amended effective May 4, 2022 (Office of the Revisor of Statutes)](https://www.revisor.mn.gov/rules/pdf/4717.1750/2022-05-04%2012:17:39+00:00) — read via direct text extraction; used specifically to confirm the current cyanuric acid ban dates and 100 ppm ceiling, since the 2016 copy predates this amendment

---

## Mississippi

**★ Correction (same pass, caught before this file was shared for
review):** an earlier draft of this section cited "First District
Health Unit" (fdhu.org) as an example of a Mississippi public health
district's pool rule. That was wrong — **First District Health Unit is
a North Dakota entity** (headquartered in Minot; its own document text
repeatedly says "DISTRICT HEALTH UNIT, MINOT, NORTH DAKOTA" and cites
the North Dakota State Department of Health and North Dakota Century
Code throughout). It has been moved to the **North Dakota** entry
below, where it actually belongs, and removed entirely from here. No
Mississippi-district example is substituted in its place — inventing
one would repeat the same mistake in a new form.

**Not a single-state-code state — genuinely district-fragmented,
confirmed through primary sources:** Mississippi has **no statewide
numeric pool chemistry regulation**. The Mississippi State Department
of Health (MSDH)'s own "Regulations" index page lists five codified
regulations (music festivals, public toilets, hotels/motels, vermin
control, barber shops) — **swimming pools is not among them.** MSDH's
pool-related content is explicitly a **model/reference document**: its
"Swimming and Aquatic Health Model Code" page describes itself as "an
outline of basic swimming and pool safety rules and procedures that can
be used to create or improve pool codes" and links out to the **CDC's
own Model Aquatic Health Code**, not a Mississippi-specific numeric
standard. Binding regulation is instead promulgated **separately by
each of Mississippi's 9 public health districts** (confirmed count via
MSDH's own district-listing page) — the same county/district-fragmented
shape as Nevada/SNHD, just split nine ways instead of by county.

- **Health Department name:** Mississippi State Department of Health
  (MSDH) — state-level oversight and model-code role only; **actual
  enforcement and numeric standards belong to whichever of the 9 local
  Public Health Districts covers a given property.**
- **Official citation:** No statewide administrative code chapter
  exists for pools. **NOT FOUND — no specific Mississippi district's
  actual rule text was located and verified this session.** Do not
  substitute another state's district-level document for this field.
- **Has dedicated log sheet:** NOT FOUND — varies by district, none
  confirmed this session.

**All chemistry fields: NOT FOUND — genuinely no statewide numeric
standard exists, and no verified Mississippi-district-specific document
was located this session** (not for lack of trying: MSDH's own
guidance page links only to the CDC's generic model code, not a
Mississippi text). Do not seed any Mississippi `ChemistryThreshold`
row without first locating and verifying an actual document from the
specific district covering an AquaRunner customer's property —
Mississippi's 9 districts are not confirmed to use matching numbers,
and no cross-district assumption should be made.

**Fecal/Vomit/Blood Contamination Response:** **NOT FOUND** — same
reasoning as above; no verified Mississippi-specific source was located.

**Recommend:** seed Mississippi's `ComplianceRuleset` with
`isSupported: false` and a `ComplianceNote` (`kind: "GAP"`) documenting
the district-fragmented structure and the fact that MSDH itself only
points to the CDC MAHC, rather than leaving a bare stub that looks
unresearched — the *structure* (9 districts, no state code) is
confirmed even though no specific district's numbers are.

**Sources used:**
- [Swimming and Aquatic Health Model Code — MSDH](https://msdh.ms.gov/page/30,15637,95,669.html) — confirms this is a reference/model document pointing to the CDC MAHC, not a Mississippi-specific binding regulation
- [Regulations — MSDH](https://msdh.ms.gov/page/30,0,95,60.html) — confirms swimming pools is not among MSDH's five codified statewide regulations
- [Public Health Districts — MSDH](https://msdh.ms.gov/page/19,30210,166.html) — confirms the 9-district structure

---

## Missouri

**★ State-level standard exists but is narrow in scope, confirmed via
primary text — not a full statewide pool code:** Missouri's general
public-bathing-place rule, **19 CSR 20-3.020**, contains almost no
numeric chemistry — it just delegates: *"The water in the public
bathing place... shall at all times have a sanitary quality
satisfactory to the Department of Health. The Department of Health will
establish the standards of quality as are deemed necessary."* The
**actual numeric chemistry standard that exists in Missouri's Code of
State Regulations lives inside 19 CSR 20-3.050, "Sanitation and Safety
Standards for Lodging Establishments"** — meaning the one real
state-level numeric standard found applies specifically to **pools and
spas at licensed lodging establishments** (hotels, motels, bed-and-
breakfasts), not to municipal pools, apartment/HOA pools, water parks,
or other public pool types generically. Confirmed via full-text review
of the entire chapter — no separate general-public-pool numeric
chemistry section exists elsewhere in 19 CSR 20-3.

- **Health Department name:** Missouri Department of Health and Senior
  Services (DHSS).
- **Official citation:** 19 CSR 20-3.020 ("Sanitation of Public Bathing
  Places," general/no numeric standard) and **19 CSR 20-3.050
  ("Sanitation and Safety Standards for Lodging Establishments"),
  swimming pool/spa subsections** — the source of every numeric figure
  below.
- **Has dedicated log sheet:** NOT FOUND — 19 CSR 20-3.050 requires
  daily operating records (disinfectant, pH, water temp, timestamp) but
  doesn't reference a specific state-issued form.

**Chemistry thresholds (19 CSR 20-3.050, lodging-establishment pools
and spas only):**

| Reading | Requirement |
|---|---|
| pH — pools and spas | 7.2 – 7.8 |
| Free Chlorine — pools | Minimum 1.0 ppm, maintained throughout the pool |
| Bromine | "a minimum residual between three and five (3–5) ppm shall be maintained throughout **the spa**" — the rule text names only "spa" here, not "pool"; quoted verbatim rather than assumed to also cover pools |
| Cyanuric Acid | **NOT FOUND** — confirmed absent via full-text search of the entire chapter |
| Total Alkalinity | **NOT FOUND** — same, confirmed absent |
| Max spa/pool temperature | 104°F |

**pH range that triggers mandatory closure/violation:** **NOT FOUND**
as a distinct enumerated trigger within 19 CSR 20-3.050 itself. The
only closure mechanism found anywhere in this chapter is the general,
discretionary §20-3.020(9): *"If... the Department of Health finds that
any public bathing place is in any way a menace to health on
account of... inefficient operation, or if the water quality is
unsatisfactory for bathing purposes... Failure to properly maintain a
public bathing place in a sanitary condition shall be sufficient reason
to close it."* Same discretionary-authority shape as Connecticut,
Louisiana, and Maine — not a bright-line number.

**CYA threshold that triggers closure-risk violation:** **NOT FOUND** —
consistent with cyanuric acid not appearing anywhere in the chapter.

**Testing frequency:** **NOT FOUND as an explicit cadence.** 19 CSR
20-3.050 requires "daily operating records" documenting disinfectant
residual, pH, water temperature, and timestamp — implying at least
once-daily testing — but no explicit multiple-times-per-day requirement
was found, confirmed via full-text review of the chapter.

**Fecal/Vomit/Blood Contamination Response — confirmed absent, not
unresearched:** a full-text search of the entire regulations document
(3,150+ lines spanning multiple DHSS chapters, not just pools) for
"fecal," "stool," "vomit," "diarrhea," and "blood" in the pool/spa
context returns **zero matches**. Missouri's state-level pool/spa rule
has **no fecal/vomit/blood incident protocol, no CT value, and no CDC
cross-reference** anywhere in the sections reviewed.

**Open items for Missouri:** (1) the state-level numeric standard found
applies only to lodging-establishment pools/spas — for a municipal pool,
apartment complex pool, water park, or other non-lodging public pool
type, no state-level numeric standard was found at all, and county-
level rules (like Missouri's various county health departments) would
likely govern instead, out of scope this pass; (2) the bromine minimum
is textually spa-only — don't assume it also applies to pools without
re-verifying; (3) CYA and alkalinity — confirmed absent, not a
sourcing gap; (4) fecal/vomit/blood — confirmed absent from the state
rule.

**Sources used:**
- [19 CSR 20-3, Rules of the Department of Health and Senior Services, Division 20, Chapter 3 — General Sanitation (Missouri Secretary of State, official CSR PDF)](https://www.sos.mo.gov/cmsimages/adrules/csr/current/19csr/19c20-3.pdf) — read via direct text extraction (pdftotext); every citation above comes from this document. Note: this URL blocks direct `curl`/typical fetch access (Cloudflare bot protection) but was retrievable through the WebFetch tool's own infrastructure.

---

## Montana

- **Health Department name:** Montana Department of Public Health and
  Human Services (DPHHS), Food and Consumer Safety Section.
- **Official citation:** Administrative Rules of Montana (ARM), Title
  37, Chapter 115 — implemented in detail through **Circular FCS 3-2022,
  "Montana Standards for Public Swimming Pools"** (revised February 24,
  2023), DPHHS's operative enforcement document. Every closure
  condition, chemistry parameter, and test-frequency requirement below
  is drawn from this circular, which reads as directly enforceable (it
  is the document actually cited for "critical health and safety
  violations that require... immediate closure"), not informal
  guidance layered on top of a separate binding text.
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  DPHHS publishes a "Public Swimming Pool Inspection Report" and
  requires a "department approved fecal incident log" (§2.4.1(d)).

**Chemistry thresholds (§7.7.1, Table 2 — the most granular pool/spa
split collected in this file, with an explicit stabilized-vs-
unstabilized chlorine branch on top of the pool/spa split):**

| Reading | Pool | Spa |
|---|---|---|
| pH | 7.2 – 7.8 | 7.2 – 7.8 |
| Free Chlorine — stabilized (CYA in use) | 2 – 10 ppm | — |
| Free Chlorine — unstabilized | 1 – 10 ppm | — |
| Free Chlorine — spa | — | 3 – 10 ppm |
| Combined Chlorine | ≤0.4 ppm | ≤0.4 ppm |
| Total Bromine | 3 – 8 ppm | 4 – 8 ppm |
| Total Alkalinity | 60 – 180 ppm | 60 – 180 ppm |
| Calcium Hardness | ≤1,000 ppm (ideal 200–400) | ≤1,000 ppm (ideal 100–200) |
| ORP (routine target) | ≥650 mV | ≥650 mV |
| Cyanuric Acid | ≤50 ppm (ideal ≤15 ppm) | **N/A — CYA/stabilized chlorine may never be used in a spa or hot water spa at all** |
| Saturation Index | -0.3 to +0.3 | -0.3 to +0.3 |
| Copper/Silver (ion systems) | ≤1.3/0.10 ppm | ≤1.3/0.10 ppm |
| Residual Ozone | <0.1 ppm | <0.1 ppm |
| Max temperature | 104°F (106°F for flow-through hot springs) | 104°F |

**★ CYA is completely banned in spas, not just capped** — Montana is
explicit that cyanuric acid/stabilized chlorine (Trichlor/Dichlor) "may
not be used in an indoor pool or spa, or an outdoor hot water spa"
(§7.5.6), and Table 2 marks CYA "N/A" for spas rather than giving it a
number. A separate DPHHS fact sheet reinforces this with the underlying
rationale: CYA can multiply the time needed for chlorine to kill
*Pseudomonas aeruginosa* ("hot tub itch") by up to 100x at even
moderate concentrations.

**pH range that triggers mandatory closure:** §2.1.1(o) — **pH <6.5 or
>8.0** is a named **critical, immediate-closure violation** (flow-
through hot springs get a looser ceiling, up to 9.4). This is a
genuinely separate, wider closure band than the 7.2–7.8 routine target
— the same two-tier shape as Delaware/Illinois/Indiana/Iowa, not the
"routine range = closure range" pattern seen in several other states in
this file.

**CYA threshold that triggers closure-risk violation:** exceeding the
Table 2 parameters (50 ppm pool ceiling, or any detectable use in a
spa) falls under §2.1.1(c) — **"sanitizer concentration falls outside
the parameters set forth in 7.7.1, Table 2"** — a **critical, immediate-
closure** violation, one of the more explicit CYA-closure links
collected (alongside Michigan and Nebraska below). **★ Alkalinity is
treated more leniently than CYA:** falling outside 60–180 ppm is only a
closure trigger after **three consecutive inspections** show the
violation (§2.2.1(a)) — a repeated-violation tier distinct from CYA's
immediate-closure tier, worth representing as a genuinely softer
enforcement track rather than flattening both into the same severity.

**★ New pattern — ORP itself is a named, independent critical closure
trigger, not just an optional secondary reading:** §2.1.1(b) — **ORP
<650 mV** triggers immediate closure on its own, regardless of what the
chlorine reading shows. Every other state collected treats ORP (where
mentioned at all) as an optional controller-based alternative to manual
testing; Montana makes it a mandatory, independently-enforced
parameter.

**Testing frequency (§7.2):**
- Disinfectant residual and pH — manual-feed pools (no automated
  controller): tested **before opening and every 2 hours** while open
- Disinfectant residual and pH — automated-controller pools: tested
  **before opening (manual) and every 4 hours** while open (electronic
  readings permitted for the remaining daily checks)
- Combined chlorine: **before opening**, daily
- Total alkalinity: **weekly**
- Calcium hardness and saturation index: **at least monthly**
- Cyanuric acid: **at least monthly** per the Circular's own §7.2.8 —
  **★ but a separate DPHHS cyanuric-acid fact sheet states weekly**
  ("Cyanuric acid level is required to tested and recorded at least
  once a week"). These two official DPHHS documents disagree with each
  other; both are quoted rather than picking one silently. Recommend
  treating the Circular (§7.2.8, the primary enforcement document) as
  authoritative unless DPHHS clarifies, but flag the fact sheet's
  conflicting weekly figure for anyone verifying this field.

**Fecal/Vomit Contamination Response (§2.4) — externally deferred to
CDC, not a Montana-specific CT value:**

§2.4.1: *"In the event of fecal or vomit contamination of any public
swimming pool, the person in charge must: (a) immediately close the
public swimming pool; (b) follow the applicable procedures given in the
CDC Fecal Incident Response, 2018 edition; (c) notify the CPO and
request assistance; and (d) document the incident using department
approved fecal incident log."** Same externally-deferred-to-CDC shape
as Florida/Georgia/Hawaii — Montana doesn't restate the CDC's numeric
CT values in its own text, just names the source and mandates a
department-approved log. **No separate blood-specific provision was
found** — fecal and vomit are named together as one category; blood
isn't mentioned in §2.4 at all (only as a first-aid-kit line item
elsewhere in the Circular).

Montana separately has a **named Legionella contamination response**
(§2.5), deferring to the 2018 Model Aquatic Health Code §6.5.3.6 — a
distinct contamination category not seen named elsewhere in this file.

**No remaining open items for Montana** beyond the CYA test-cadence
conflict between DPHHS's own two documents, noted above.

**Sources used:**
- [Circular FCS 3-2022, Montana Standards for Public Swimming Pools (DPHHS, revised Feb. 24, 2023)](https://dphhs.mt.gov/assets/publichealth/FCS/PublicSwimmingPools/CircularFCS_3_2022.pdf) — read via direct text extraction (pdftotext); source of every chemistry, closure, and testing-frequency citation above
- [Fact Sheet on Cyanuric Acid and Stabilized Chlorine Products (DPHHS)](https://www.dphhs.mt.gov/assets/publichealth/FCS/PublicSwimmingPools/CyanuricAcid.pdf) — read via direct text extraction; used to confirm the spa CYA ban and surface the weekly-vs-monthly test-cadence conflict noted above
- [Swimming Pools, Spas and other Water Features — DPHHS program page](https://dphhs.mt.gov/publichealth/EHFS/swimmingpools/) — confirms agency and program structure

---

## Nebraska

- **Health Department name:** Nebraska Department of Health and Human
  Services (DHHS).
- **Official citation:** Title 178 Nebraska Administrative Code (NAC),
  **Chapter 2, "Operation and Management of Public Swimming Pools"** —
  water quality at 178 NAC 2-005.02, testing/records at 2-005.03,
  effective September 14, 2010 (no evidence of a later amendment found).
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  **Attachment 3 (Pool Water Quality Log Sheet)** and **Attachment 4
  (Spa Water Quality Log Sheet)**, both incorporated by reference
  directly into the rule text (§2-005.03), kept for at least 1 year.

**Chemistry thresholds (178 NAC 2-005.02):**

| Reading | Pool | Spa |
|---|---|---|
| pH | 7.2 – 7.8 | 7.2 – 7.8 |
| Free Chlorine | Minimum 2.0 ppm | Minimum 3.0 ppm |
| Free Chlorine — closure ceiling (both) | >10.0 ppm forces closure | >10.0 ppm forces closure |
| Total Bromine | Minimum 2.0 ppm | Minimum 4.0 ppm |
| Total Bromine — closure ceiling (both) | >18 ppm forces closure | >18 ppm forces closure |
| Combined Chlorine | Must not exceed 0.5 ppm | Must not exceed 0.5 ppm |
| Cyanuric Acid (if cyanurates used) | Must stay below 50 ppm | Must stay below 50 ppm |
| Total Alkalinity | Minimum 80 ppm — **no stated maximum** | Minimum 80 ppm |
| Max temperature | 104°F | 104°F |

**★ Every routine chemistry parameter is independently named as a
mandatory-closure trigger — the most explicit version of this pattern
collected:** §2-005.02's own header states plainly: **"Failure to meet
any standard in 178 NAC 2-005.02A-F is grounds for immediate closing of
the swimming pool."** That span (A through G, actually — clarity,
surface cleanliness, combined chlorine, disinfectant residual, cyanuric
acid, pH, and alkalinity) means **pH, CYA, alkalinity, and disinfectant
residual are all individually, explicitly named closure triggers** —
resolving the ambiguity found in Illinois/Minnesota (where CYA/pH
closure status had to be inferred from a general catch-all) in the
opposite, more explicit direction.

**pH range that triggers mandatory closure/violation:** same range as
the routine target, 7.2–7.8 (§2-005.02F) — the "routine range = closure
range" shape, same as Kentucky/Massachusetts/Michigan/Mississippi
(First District), confirmed here by the umbrella closure clause above
rather than a separately-stated wider band.

**CYA threshold that triggers closure-risk violation:** **below 50 ppm
required; at/above 50 ppm is itself the mandatory-closure condition**
(§2-005.02E) — one flat ceiling, not a close/reopen pair with two
different numbers the way Iowa or Mississippi's First District use.

**Testing frequency (§2-005.03):**
- Disinfectant residual and pH: tested **before opening, then at
  intervals not longer than 4 hours** until closing; at least one
  manual (FAS-DPD for chlorine, phenol red for pH) test required daily
  even if an automatic controller is present
- Spa temperature: **before opening, then every 4 hours**
- Total alkalinity, combined chlorine (if chlorine used), and cyanuric
  acid (if used): **weekly**

**Fecal/Vomit/Blood Contamination Response — confirmed absent, not
unresearched:** a full-text search of the entire Chapter 2 text (178
NAC 2, ~870 lines covering operating standards, staffing, and
construction) for "fecal," "stool," "vomit," "diarrhea," and "blood"
returns **no water-treatment protocol** — the only "blood" hit is a
first-aid-kit line item ("emergency response pack for cleaning up
blood") and an unrelated spa health-warning sign about blood pressure.
Nebraska has **no fecal/vomit/blood incident closure trigger, no CT
value, and no CDC cross-reference** anywhere in Chapter 2 — joining
Iowa, Kentucky, Louisiana, Massachusetts, Minnesota, and Missouri as
states confirmed via full-text search to lack this protocol entirely.

**No remaining open items for Nebraska** — chemistry, the umbrella
closure mechanism, and the confirmed absence of a fecal/vomit/blood
protocol are all sourced directly from the regulation text with section
citations.

**Sources used:**
- [Title 178, Nebraska Department of Health — complete title, Chapter 2 (Operation and Management of Public Swimming Pools) at p.6+ (Nebraska DHHS)](https://dhhs.ne.gov/Documents/Title-178-Complete.pdf) — read via direct text extraction (pdftotext); every citation above comes from this document

---

## New Hampshire

- **Health Department name:** New Hampshire Department of
  Environmental Services (DES) — note this is an *environmental*
  agency, not a health department, the same pattern already seen in
  Michigan (EGLE).
- **Official citation:** Env-Wq 1100, "Public Bathing Facility (PBF)
  Rules" — chemistry at **Env-Wq 1105.13**, testing/records at
  **Env-Wq 1104.01**.
- **Has dedicated log sheet:** Not a single named state form — Env-Wq
  1104.01(f)-(g) mandates what a daily log must contain (test results,
  filter events, fecal/vomit accident times) and requires records be
  kept for a **rolling 12-month period**, but doesn't reference a
  specific numbered DES form → `logSheetSource: built-from-code`.

**Chemistry thresholds (Env-Wq 1105.13, "PBF Chemical and Physical
Water Quality Standards" — framed as "the owner... shall not allow
bathers to use the pool or spa... unless the water meets" every item
below, meaning the routine range doubles as the closure trigger, the
same shape as Kentucky/Massachusetts/Michigan/Nebraska):**

| Reading | Requirement |
|---|---|
| pH | 7.0 – 7.8 |
| Free Chlorine — swimming/wading/special recreation pools | 1 – 5 mg/L |
| Free Bromine — swimming/wading/special recreation pools | 2 – 10 mg/L |
| Free Chlorine or Bromine — therapy pools and spas | 2 – 10 mg/L |
| Combined Chlorine | Must not exceed 0.5 mg/L |
| ORP set point (if a controller is used) | Minimum 650 mV |
| Cyanuric Acid | Must not exceed 50 mg/L |
| Total Alkalinity | 60 – 180 mg/L |
| Turbidity | Must not exceed 2 NTU |
| Heated swimming/wading/special-recreation pool max temp | 89°F |
| Heated therapy pool/spa max temp | 104°F |

**★ New Hampshire explicitly distrusts ORP as a standalone sanitizer
measurement, unlike Montana:** Env-Wq 1104.01(b) — **"If an
oxidation-reduction potential (ORP) controller is used, it shall not be
relied upon as a method for measuring the concentration of sanitizer in
the water."** A direct contrast with Montana, which makes ORP <650 mV
an independent, mandatory critical-closure trigger in its own right —
two states using the identical 650 mV threshold number but with
opposite views on whether ORP alone can substitute for a chemical
residual reading. Worth flagging since AquaRunner shouldn't assume ORP
readings carry equal regulatory weight across every state that mentions
them.

**pH range that triggers mandatory closure/violation:** same as the
routine target, 7.0–7.8 — Env-Wq 1105.13's "shall not allow use unless"
framing makes every listed parameter, including pH, an immediate
closure condition, with no separate wider band.

**CYA threshold that triggers closure-risk violation:** same mechanism
— exceeding 50 mg/L is itself one of Env-Wq 1105.13's "shall not allow
use unless" conditions, so it's an immediate-closure trigger, not a
softer standing violation.

**Testing frequency (Env-Wq 1104.01, 1104.03):**
- Disinfectant residual and pH: **prior to opening and every 4 hours**
  during operation
- Heated pool/spa temperature: **prior to use and every 4 hours**
- Common-interest bathing facilities using an approved automated
  chemical controller for both pH and disinfectant: **once per day**
  (a looser cadence carve-out, distinct from the general 4-hour rule)
- Test location: both ends of the pool/spa for facilities ≥10,000
  gallons; one location for facilities under that size

**Fecal/Vomit/Blood Contamination Response — ★ sourcing confidence flag:
the rule text itself only requires logging the incident, not a specific
chemistry protocol; the actual numeric protocol lives in a separate DES
guidance bulletin this session could not read directly:**

Env-Wq 1104.01(g)(6) requires the daily log to record **"the time of
each fecal or vomit accident, together with a description of all
actions taken to address the accident"** — but the rule text itself
does not state the target ppm or hold time anywhere. NH DES publishes a
dedicated bulletin, **"WD-BB-47 (2019), Fecal Accidents: A Protocol for
Public Bathing Facilities,"** that appears to contain the actual
numbers, but it returned HTTP 403 on every direct-fetch attempt this
session. Based on a single web-search extraction (**not independently
verified against the primary document**):
- **Formed stool:** raise free chlorine to 3.0 mg/L (if below that) at
  pH 7.2–7.5, hold for **at least 1 hour**
- **Diarrheal accidents:** CT value for Cryptosporidium = **15,300** —
  achievable either as 20 mg/L at pH 7.2–7.5 for **13 hours**, or 10
  mg/L at pH 7.2–7.5 for **26 hours**
- **★ Cross-validation, not proof:** the CT=15,300 figure independently
  matches the value already sourced for **both New York and Indiana**
  in this file — three states landing on the identical CDC/MAHC-derived
  number is meaningful corroboration, but this NH figure specifically
  should still be treated as `sourceConfidence: "assumption"` rather
  than `"confirmed"` until WD-BB-47 is read directly. **No blood-
  specific provision was found** in either source.

**Open items for New Hampshire:** (1) the fecal/vomit CT protocol needs
primary-source verification — WD-BB-47 was located but not read
directly this session; (2) everything else (chemistry, closure logic,
testing frequency, the ORP-distrust stance) is fully sourced from the
primary rule text.

**Sources used:**
- [Env-Wq 1100, New Hampshire Code of Administrative Rules, Public Bathing Facility Rules (full text)](https://bedfordnh.org/DocumentCenter/View/388/Public-Bathing-Rules-PDF) — read via direct text extraction (pdftotext); source of every citation above except the fecal/vomit protocol
- WD-BB-47 (2019), Fecal Accidents: A Protocol for Public Bathing Facilities (NH DES) — located but blocked on every direct-fetch attempt this session (HTTP 403); the fecal/vomit figures above come from a single web-search extraction of this document, not a direct read — flagged accordingly

---

## New Jersey

- **Health Department name:** New Jersey Department of Health,
  administered as the **Public Recreational Bathing (PRB) Project**
  within the Consumer, Environmental, and Occupational Health Services
  division.
- **Official citation:** New Jersey State Sanitary Code, **Chapter IX,
  Public Recreational Bathing (N.J.A.C. 8:26)** — chemistry at §8:26-7.7
  through 7.14 and Appendices C/D, closure at §8:26-8.5 through 8.7.
- **Has dedicated log sheet:** Records must be kept in a **"bound
  log"** (§8:26-7.12(b), cross-referencing §8:26-7.7(e)) documenting
  every chemical test, bather load, water clarity, temperature, and
  weather — the rule mandates the log's *contents* and binding format
  but doesn't name a single numbered state form the way some other
  states do → `logSheetSource: built-from-code`. A separate
  self-inspection checklist (Appendix, PRB_Checklist.pdf) exists as a
  distinct department-published document.

**Chemistry thresholds (§8:26-7.8/7.9 for pools, §8:26-7.12/7.14 for
spas; Appendix C and Appendix D respectively):**

| Reading | Pool (Appendix C) | Spa (Appendix D) |
|---|---|---|
| Free Chlorine | Min 1.0, ideal 2.0–4.0, max 10.0 ppm | Min 2.0, ideal 3.0–5.0, max 10.0 ppm |
| Bromine | Min 2.0, ideal 4.0–6.0, max 10.0 ppm | Min 2.0, ideal 4.0–6.0, max 10.0 ppm |
| Combined Chlorine | None stated min, max 0.2 ppm | None stated min, max 0.2 ppm |
| pH | Min 7.2, ideal 7.4–7.6, max 7.8 | Min 7.2, ideal 7.4–7.6, max 7.8 |
| Cyanuric Acid (stabilized chlorine, **outdoor only**) | Min 10, ideal 30–50, max 100 ppm | Min 10, ideal 30–50, max 100 ppm |

**Stabilized chlorines are flatly prohibited in every indoor pool and
every indoor spa** (§8:26-7.8(e), §8:26-7.12(g)) — same prohibition
pattern as Delaware/Indiana/Iowa/Minnesota/Montana.

**★ Total alkalinity appears only on the department's own
self-inspection checklist, not in the codified rule text itself:** a
full-text search of the entire 2,824-line chapter for "alkalinity"
returns exactly **one hit** — "Total Alkalinity (60 – 180 ppm)" printed
on the Appendix self-inspection checklist form (the same PDF that also
contains a drowning/accident report template). **§8:26-7.7 through
7.14 — the actual operative water-quality rule sections — never state
an alkalinity standard.** This sits in an unusual middle ground between
"codified standard" and "not found at all": it's a real number the
Department itself publishes and presumably expects facilities to meet,
but it carries a different legal weight than the chlorine/pH/CYA
figures that are explicitly written into the binding rule sections.
Recommend seeding it with `sourceConfidence: "assumption"` and a note
explaining the checklist-only sourcing, rather than treating it as
equally confirmed as the Appendix C/D figures.

**pH range that triggers mandatory closure/violation:** same as the
routine target — §8:26-8.6(d): **"The swimming pool or wading pool
shall close immediately if the disinfectant residual is not within the
range set forth at N.J.A.C. 8:26-7.8 or if the chemical or physical
water quality is not in conformance with N.J.A.C. 8:26-7.8 and 7.9."**
§8:26-8.7(e) states the identical rule for hot tubs/spas against §7.12.
The routine Appendix C/D range **is** the closure trigger — the same
shape as Kentucky/Massachusetts/Michigan/Mississippi/Nebraska/New
Hampshire.

**CYA threshold that triggers closure-risk violation:** same mechanism
— CYA sits inside §8:26-7.8/7.12, so falling outside the Appendix C/D
range (including exceeding 100 ppm) is itself an immediate-closure
condition under §8:26-8.6(d)/8.7(e).

**Testing frequency (§8:26-7.7, 7.12):**
- Disinfectant level and pH — pools and spas alike: **every 2 hours**
  during operating hours, performed alongside each microbial sample.
  Automatic chemical controller systems meeting §8:26-6.13(m) may
  substitute for manual 2-hour testing.
- Cyanuric acid (outdoor pools/spas only, where used): **at least once
  per week**, with a test kit covering 0–100 ppm
- Water clarity: monitored **daily**

**Fecal/Vomit/Blood Contamination Response — confirmed absent, not
unresearched:** a full-text search of the entire chapter for "fecal,"
"stool," "vomit," "diarrhea," and "blood" turns up **no water-treatment
protocol** — the only substantive hits are a bather-exclusion notice
("recovering from diarrhea... shall not use the pool") and an unrelated
drowning/accident report form field asking for a victim's blood-alcohol
level. New Jersey has **no fecal/vomit/blood incident closure trigger,
no CT value, and no CDC cross-reference** anywhere in Chapter IX —
joining Iowa, Kentucky, Louisiana, Massachusetts, Minnesota, Missouri,
and Nebraska as states confirmed via full-text search to lack this
protocol.

**Open items for New Jersey:** (1) total alkalinity — real number, but
sourced only from a checklist appendix, not the codified rule text
itself; flag the confidence distinction rather than treating it as
equally authoritative; (2) fecal/vomit/blood — confirmed absent from
the code.

**Sources used:**
- [New Jersey State Sanitary Code, Chapter IX, Public Recreational Bathing — full text (nj.gov)](https://nj.gov/health/ceohs/documents/phss/recbathing.pdf) — read via direct text extraction (pdftotext); every citation above comes from this document, including the checklist appendix that contains the alkalinity figure
- [Department of Health, Public Recreational Bathing Project (nj.gov)](https://www.nj.gov/health/ceohs/phfpp/prb/) — confirms administering agency/program

---

## North Carolina

- **Health Department name:** North Carolina Department of Health and
  Human Services (DHHS), Division of Public Health, Environmental
  Health Services Section — enforced through local county environmental
  health departments.
- **Official citation:** 15A NCAC 18A .2500, "Rules Governing Public
  Swimming Pools" — chemistry at **.2535 ("Water Quality Standards")**,
  the violation/demerit classification system at **.2511
  ("Inspections")**. Text used is the version amended effective **July
  1, 2022**.
- **Has dedicated log sheet:** Inspections use a named state form,
  **"Inspection of Swimming Pool Form DENR 3960"** (.2511(b)), though
  this is the department's own inspection form rather than a facility
  daily-log template; daily operator record-keeping requirements are
  specified directly in .2535(11) without naming a separate form.

**Chemistry thresholds (.2535):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.8 |
| Free Chlorine | Minimum 1.0 ppm |
| Free Bromine | Minimum 2.0 ppm |
| Biguanide (if used) | 30 – 50 ppm |
| Copper (silver/copper ion systems) | Max 1.0 ppm, plus a chlorine residual per the standard chlorine rule |
| Cyanuric Acid | Max 100 ppm |
| Total Alkalinity | **NOT FOUND** — a test kit capable of measuring it is required (.2535(10)) and weekly recording is required (.2535(11)(d)), but no numeric target range is stated anywhere in .2535 |
| Heated swimming pool max temp | 90°F |
| Heated spa max temp | 104°F |

**★ Stabilized chlorine (CYA) is the default, not an opt-in — the
inverse of most states collected:** .2535(4) — *"Pools that use
chlorine as the disinfectant **must be stabilized with cyanuric acid**
except at indoor pools or where it can be shown that cyanuric acid is
not necessary to maintain a stable free chlorine residual."* Every
other state in this file treats CYA as something a facility opts into;
North Carolina makes it the presumptive requirement for outdoor
chlorinated pools unless the operator affirmatively demonstrates it's
unneeded. **Elemental (gaseous) chlorine is flatly prohibited**
(.2535(9)).

**★ New pattern — a three-tier demerit classification system, not a
flat "violation closes the pool" or a purely discretionary model:**
.2511(b) sorts every rule violation into **two, four, or six-demerit
items**. Six-demerit items are explicitly defined as *"failures to
maintain minimum water quality or safety standards"* and **"warrant
immediate suspension of an operation permit."** Four-demerit items
"warrant denial... or notification of intent to suspend." Two-demerit
items don't trigger permit action "unless such violation causes an
imminent hazard, a failure to meet water quality or safety standard, or
a suction hazard." This is a genuinely different enforcement shape than
anything else collected in this file — not a flat rule, not pure
discretion, but a point-classification system with an explicit
immediate-suspension tier.

**pH range that triggers mandatory closure/violation:** pH is
explicitly named a **six-demerit item** (.2511(b)(3)) — "warrant[ing]
immediate suspension of an operation permit" — so the routine 7.2–7.8
range doubles as the closure trigger, same shape as several other
states, but implemented through the demerit-tier mechanism specifically
rather than bare "shall close" language.

**CYA threshold that triggers closure-risk violation:** CYA sits within
.2535(4), and disinfectant-residual-related violations under .2535(3),
(4), (5), (7), (8), or (9) are all classified as **six-demerit items**
(.2511(b)(2)) — so exceeding 100 ppm is an immediate-suspension-tier
violation, the same severity as a chlorine or pH failure.

**Testing frequency:** .2535(11) requires **daily** recording of
disinfectant residual and pH, and **weekly** recording of total
alkalinity and cyanuric acid — a once-daily (not multiple-times-daily)
cadence, the lighter end of the range collected across states (similar
to Michigan's once-daily floor), not a 3–4×/day requirement.

**Fecal/Vomit Contamination Response (.2535(13)) — kept distinct from
routine chemistry, with a real dual-path option for the formed-stool
case:**

- Direct all bathers out of every affected pool; do not allow reentry
  until decontamination is complete
- Remove material with a net or scoop, dispose in a sewage treatment
  and disposal system
- Raise free available chlorine to **2 ppm at pH 7.2–7.5**, confirm
  it's mixed throughout the pool
- **Formed stool or vomit:** maintain **2 ppm for at least 25 minutes**
  **or** **3 ppm for at least 19 minutes** before reopening — two
  equivalent CT-based options, not a single fixed number
- **Liquid stool (diarrheal):** raise free chlorine and extend closure
  time to reach a **CT inactivation value of 15,300**, then backwash
  the filter before reopening
- **★ Fourth independent confirmation of CT=15,300:** this figure now
  matches New York, Indiana, and (secondary-sourced) New Hampshire in
  this file — North Carolina's is a **primary-source** confirmation,
  the strongest evidence yet that 15,300 is a real, recurring CDC/MAHC-
  derived standard rather than a one-state figure.
- **No blood-specific provision found** — only "feces or vomit" are
  named in .2535(13).

**No remaining open items for North Carolina** except the missing
alkalinity numeric range, confirmed absent from .2535 itself.

**Sources used:**
- [Rules Governing Public Swimming Pools, 15A NCAC 18A .2500, amended effective July 1, 2022 (NC DHHS)](https://www.dph.ncdhhs.gov/media/1809/open) — read via direct text extraction (pdftotext); every citation above comes from this document

---

## North Dakota

**★ The state administrative code is almost entirely gutted — most of
its own enforcement machinery was repealed over 30 years ago, confirmed
via primary text, not inferred:** North Dakota's only state-level pool
chapter, **NDAC 33-29-01**, still lists 15 sections in its table of
contents, but **six of them — including "Right of Closure," "Right of
Onsite Inspection," "Enforcement," "Reporting Requirements,"
"Administrative Procedure and Judicial Review," and "Injunction
Proceedings" — are each individually marked "[Repealed effective April
1, 1993]"** in the current text. What survives is genuinely minimal:
definitions, a bacteria count ceiling, a clarity standard, a bare 1
mg/L chlorine floor with no stated ceiling, a record-keeping
requirement, and a clause deferring to stricter local ordinances. **No
pH standard, no cyanuric acid standard, no alkalinity standard, and no
closure authority exist anywhere in the current state code.**

- **Health Department name:** North Dakota Department of Health (per
  the rule's own "Law Implemented: NDCC 23-01-03" citation). Note: a
  2022 legislative reorganization split many North Dakota environmental
  functions into a new Department of Environmental Quality under a
  renumbered Title 33.1 — **pools were not moved**; NDAC 33-29-01
  remains under the original Title 33 numbering, confirmed via search
  of the Title 33.1 article index.
- **Official citation:** NDAC 33-29-01, "Pool Facilities in North
  Dakota" (state floor, minimal); **§33-29-01-12 explicitly makes local
  ordinances controlling wherever they impose a higher/more stringent
  standard** — meaning the real operative standard for most North
  Dakota properties comes from local health units, not the state
  chapter. **First District Health Unit** (Minot, ND) — "Swimming Pool
  and Spa Rules and Regulations," Rule and Regulation 12 — is used
  below as a concrete, directly-read example of what a North Dakota
  local health unit's binding rule looks like. **★ Correction note:**
  this same document was mistakenly cited under Mississippi earlier in
  this file; it has been removed from there and correctly placed here,
  where its own text ("DISTRICT HEALTH UNIT, MINOT, NORTH DAKOTA," North
  Dakota State Department of Health, North Dakota Century Code) confirms
  it belongs.
- **Has dedicated log sheet:** State code requires daily pH/disinfectant/
  temperature records (33-29-01-08) kept 3 years, but names no specific
  form. First District's rule requires a daily log per body of water
  but likewise names no separate state-issued form.

**Chemistry thresholds — state floor (NDAC 33-29-01) vs. First District
example (Rule 4-9), clearly separated:**

| Reading | State floor (33-29-01) | First District example |
|---|---|---|
| pH | **NOT FOUND — no state standard exists** | 7.2 – 7.8 |
| Free Chlorine — pools | Minimum 1 mg/L, **no stated maximum** | 2 – 4 mg/L |
| Free Chlorine — spas | Same as pools (no separate state provision) | 3 – 5 mg/L |
| Cyanuric Acid | **NOT FOUND** | Should stay below 50 mg/L; closure at >100 mg/L, reopen below 50 mg/L |
| Total Alkalinity | **NOT FOUND** | Acceptable 60–150 ppm, ideal 80–120 ppm (80–100 with hypochlorites, 100–120 with gas chlorine/dichlor/trichlor) |
| Bacteria | Max 200 colonies/mL; no coliform presence | (defers to state standard) |
| Clarity | Main drain clearly visible from deck | (defers to state standard) |

**Stabilized chlorine is prohibited indoors** and **unstabilized
cyanuric acid is banned outright for any purpose** at First District
facilities (Rule 4-8.D) — this is a *district* rule, not a state one;
the state code has no CYA provision to prohibit anything from at all.
**Ozone, chlorine dioxide, and PHMB are all flatly prohibited** at First
District facilities (Rule 4-8.E-G).

**pH range that triggers mandatory closure/violation:** the *state*
code has nothing to trigger — no pH standard exists at the state level,
and **"Right of Closure" was itself repealed in 1993**, so the state
chapter no longer even grants closure authority in the first place. At
First District: **"A pH value between 7.2 and 7.8 shall be maintained
at all times... If the pH value falls outside this range, the pool or
spa shall immediately be closed"** (Rule 4-9.B) — the routine range is
the closure trigger, same shape as several other states/districts in
this file.

**CYA threshold that triggers closure-risk violation:** no state
provision exists. At First District: closure at CYA >100 mg/L, reopen
once back below 50 mg/L specifically — a close/reopen pair using two
different numbers, the same shape as Iowa's 80/40 pair.

**Testing frequency:** state code requires daily pH/disinfectant/
temperature recording (33-29-01-08(2)) with no explicit intra-day count
stated. First District requires daily CYA testing when stabilized
chlorine is used (more frequent than most other states' weekly CYA
cadence) and reagent replacement every 6 months or season-start,
whichever is sooner.

**Fecal/Vomit/Blood Contamination Response:** **the state code has none
at all** — NDAC 33-29-01 never had a fecal/vomit section to begin with,
confirmed by the chapter's own complete table of contents (15 sections,
none addressing contamination incidents). **First District's rule
(Appendix F/G) does have a full protocol**, split into genuinely
different tracks:
- **Formed stool, vomit, and blood — one shared track**: evacuate
  bathers, remove material with a net/scoop (no vacuuming), raise free
  chlorine to **10 mg/L for at least 30 minutes**, document, reopen
  once back down to **2–3 mg/L** (sodium thiosulfate permitted to speed
  the reduction)
- **Diarrhea (liquid stool)** — its own track: same evacuation/removal,
  raise free chlorine to **20.0 mg/L for 13 hours**, backwash the
  filter to waste, reopen once back down to 2–3 mg/L
- A **second, CDC-sourced procedure** exists specifically for
  surface/deck body-fluid spills (Appendix G, labeled "FROM THE CDC"),
  distinct from the water-treatment procedure: block off the area, PPE,
  absorb the spill, disinfect with a **1:9 bleach-to-water solution
  held 20 minutes**
- Blood is folded into the *same* track as formed stool (10 mg/L/30
  min), not exempted — the same approach Maine and Mississippi's
  (now-corrected, formerly-mislabeled) entry both take.

**Open items for North Dakota:** (1) the state code is a genuinely bare
floor with no pH/CYA/alkalinity standard and no closure authority —
this isn't a sourcing gap, it's confirmed via full reading of a very
short (180-line) chapter; (2) First District is one specific local
health unit's rule, presented as a directly-verified example per
§33-29-01-12's own local-rules-control framing, not assumed to be
identical to every other North Dakota health unit; (3) no evidence was
found of how many North Dakota local health units exist or whether
their rules converge — unlike Mississippi's confirmed 9-district
count, this wasn't independently verified this session.

**Sources used:**
- [NDAC Chapter 33-29-01, Pool Facilities in North Dakota (North Dakota Legislative Branch, official)](https://ndlegis.gov/prod/acdata/pdf/33-29-01.pdf) — read via direct text extraction (pdftotext); source of every state-floor citation above
- [First District Health Unit — Swimming Pool and Spa Rules and Regulations, Minot, ND, effective Jan. 1, 2009](https://fdhu.org/wp-content/uploads/2021/06/Swimming-Pool-and-Spa-Rules-and-Regulations.pdf) — read via direct text extraction (pdftotext); source of every First District citation above. Confirmed as a North Dakota document via its own repeated references to "DISTRICT HEALTH UNIT, MINOT, NORTH DAKOTA," the North Dakota State Department of Health, and the North Dakota Century Code

---

## Ohio

**★ Sourcing note — outdated copy cross-checked against the current
text before use:** the fully-readable PDF found for this state (a
poolweb.com mirror) is stamped "Effective April 1, 2011." Ohio's rule
was in fact re-adopted as recently as **July 25, 2024** (five-year
review). Rather than assume the 2011 copy is still accurate, its
substantive numbers were independently checked against the current
codes.ohio.gov text — every figure below (pH, chlorine/bromine minima,
CYA, alkalinity, ORP, the imminent-hazard list, and pH's absence from
it) matches exactly between the 2011 PDF and the 2024-current version,
so the 2024 amendment appears to have been non-substantive for these
provisions.

- **Health Department name:** Ohio Department of Health, enforced
  through local licensors (city/county health departments).
- **Official citation:** Ohio Administrative Code (OAC) **3701-31-04,
  "Responsibilities of the Licensee"** — water quality at paragraph
  (C), disinfection at paragraph (D), imminent-hazard closures at
  paragraph (B)(1), fecal-accident response at **Appendix A**.
- **Has dedicated log sheet:** Not confirmed as a single named form —
  the rule specifies exactly what a written water-quality record must
  contain and how often (paragraph (B)(4)(a)) but the document reviewed
  doesn't reference a specific numbered ODH form.

**Chemistry thresholds (OAC 3701-31-04(C) and (D)):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.8 |
| Free Chlorine — pools | Minimum 1.0 ppm |
| Free Chlorine — spas and spray grounds/special features | Minimum 2.0 ppm |
| Free Bromine — pools | Minimum 2.0 ppm |
| Free Bromine — spas and spray grounds/special features | Minimum 4.0 ppm |
| Combined Chlorine | Max 1.0 ppm |
| Cyanuric Acid | Max 70 ppm |
| Total Alkalinity | Minimum 60 ppm — **no numeric ceiling**; instead a functional cap ("not... so high that it impairs the ability to meet other required... parameters") |
| ORP (automatic controllers) | Minimum 650 mV |
| Pool max temperature | 90°F (director may approve higher) |
| Spa max temperature | 104°F |
| Spa water replacement | Drained completely to waste at least every 30 days |

**Gas chlorine is prohibited; hand-dosing of disinfectant is prohibited
entirely** — Ohio requires continuous mechanical feed for every public
pool, not just spas (D)(2).

**pH range that triggers mandatory closure/violation:** **★ pH is
explicitly NOT one of the twelve named "critical operational items"
(imminent health hazards) in paragraph (B)(1)** that require immediate
closure — confirmed independently in both the 2011 text and the
current codes.ohio.gov text. The named imminent-hazard list covers:
improper/non-functioning drain covers and SVRS, disinfectant residual
below the required minimum, circulation/disinfection system failure,
malfunctioning automatic chemical controller, missing required
lifeguard, insufficient clarity, insufficient lighting, an untreated
fecal accident or linked recreational waterborne illness, improper
chemical storage/use, and electrical hazards. **Disinfectant residual
is a named closure trigger; pH is not**, a genuinely different
enforcement shape than most other states in this file, where pH is
either separately named or covered by a catch-all "any standard
violation closes" clause. Don't assume Ohio closes for pH violations
the way it does for chlorine.

**CYA threshold that triggers closure-risk violation:** **NOT FOUND**
as a named imminent-hazard trigger — CYA sits in paragraph (D)(5), which
paragraph (B)(1) doesn't reference. Same non-enumerated status as pH.

**Testing frequency (OAC 3701-31-04(B)(4)(a)):**
- Disinfectant residual and pH: **daily prior to bathers entering, and
  every 4 hours** while open — **but every 12 hours instead of every 4
  if an automatic chemical controller is installed** (looser, not
  tighter, cadence with automation — the opposite of the "automation
  lets you skip some manual checks but keep the same base frequency"
  pattern seen in most other states)
- Spray-nozzle manual spot-check (special features): every 6 hours
- Combined chlorine: daily prior to opening, then every 4 hours
- Water temperature: at least once daily
- Total alkalinity and cyanuric acid: **weekly**
- Total dissolved solids: per manufacturer spec for salt generators, or
  whenever a clarity problem occurs
- Records retained **at least 2 years**

**Fecal Accident / Recreational Waterborne Illness Response — deferred
entirely to the CDC, and physically embedded rather than just cited:**

Paragraph (B)(1)(i)-(j) makes "when a fecal accident occurs until it
has been properly treated in accordance with the procedures in Appendix
A" and "when a[n RWI] is linked to a public swimming pool... until it
has been properly treated in accordance with... Appendix A" both named
imminent-hazard closure triggers. **★ Distinctive implementation of the
externally-deferred pattern:** unlike Florida/Georgia/Montana (which
cite the CDC document by name and URL but write their own summarizing
text), Ohio's **Appendix A is literally the CDC's own "Fecal Incident
Response Recommendations" and "Hyperchlorination to Kill
Cryptosporidium" documents, reproduced as embedded image pages inside
the state rule itself** (URLs given: cdc.gov/healthywater/pdf/swimming/
pools/fecal-incident-response-recommendations.pdf and
.../hyperchlorination-to-kill-cryptosporidium.pdf). **The specific
CT/ppm/hold-time numbers were not independently re-extracted this
session** — they exist only as image content in both the source PDF and
the live CDC document, not as text in Ohio's own rule. Given other
states in this file citing the same CDC source land on 2 ppm/25 min
(formed stool) and CT=15,300 (diarrheal), those figures are *likely*
what Ohio's Appendix A also shows, but this should be verified directly
against the CDC PDF before treating it as Ohio-confirmed — **flag as
`sourceConfidence: "assumption"` for the specific numbers, `"confirmed"`
for the fact that Ohio incorporates the CDC document as its binding
protocol.**

**Open items for Ohio:** (1) pH and CYA are confirmed *not* named
imminent-hazard closure triggers — a real state-specific pattern, not a
gap; (2) the fecal/RWI protocol's exact numbers live in embedded CDC
image content, not independently re-extracted; (3) total alkalinity has
a functional rather than numeric ceiling — confirmed, not missing.

**Sources used:**
- [Ohio Public Swimming Pool Rules, effective April 1, 2011 (poolweb.com mirror of ODH text)](https://assets.poolweb.com/state_regs/ohio.pdf) — read via direct text extraction (pdftotext); source of every citation above
- [Rule 3701-31-04, Ohio Administrative Code — current version, effective July 25, 2024 (codes.ohio.gov)](https://codes.ohio.gov/ohio-administrative-code/rule-3701-31-04) — used to independently confirm every figure above still matches the current text

---

## Oklahoma

**★ Sourcing confidence flag — the actual regulatory table exists only
as a scanned image, not as extractable text, in every version of this
document found this session:** OAC 310:320-3-8 (the water-quality
parameter table) is referenced by name throughout the rule text, but
Cornell LII's own page for that section states outright that its
content is "Click here to view image" — the table is genuinely
image-only, not a text-extraction failure on this end. The Oklahoma
Department of Health's own hosted copy of the full chapter
(oklahoma.gov/.../Public%20Bathing%20Places320.pdf) also now returns a
live **404** — that specific document appears to have moved or been
retired. What follows is built from (a) a 2022 proposed-amendments
redline document that **was** read directly and confirms the testing-
frequency table and the general closure mechanism, and (b) a Tulsa
Health Department program page corroborating the chemistry figures.
Recommend `sourceConfidence: "assumption"` for the chemistry ranges
specifically, `"confirmed"` for testing frequency and the closure
mechanism.

- **Health Department name:** Oklahoma State Department of Health
  (OSDH).
- **Official citation:** OAC 310:320, "Public Bathing Place
  Operations" — closure trigger at **310:320-3-7**, the (image-only)
  chemistry table at **310:320-3-8**, testing frequency at
  **310:320-3-9**.
- **Has dedicated log sheet:** Yes → `logSheetSource: state-provided` —
  310:320-5-4, "Operation record form and instructions," is a named
  section of the chapter's own Subchapter 5 ("Forms and Tables").

**Chemistry thresholds (confidence: corroborated, not primary-table-
verified — see flag above):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 7.8 |
| Free Chlorine | 1.0 ppm minimum (Tulsa's page cites an operational range up to 5 ppm) |
| Cyanuric Acid | 30 – 100 ppm (single secondary source; not independently corroborated) |
| Total Alkalinity | Two conflicting figures found: the 2022 amendment redline's own appendix gives **80–120 ppm (pools) / 100–150 ppm (spas)**; Tulsa's page separately states **80–200 ppm** with no pool/spa split. Both are quoted rather than silently reconciled. |

**pH range/CYA threshold that triggers mandatory closure/violation:**
**310:320-3-7/3-8, read together, make free active chlorine, pH, and
turbidity a flat, mandatory closure trigger with no separate wider
band:** *"No pool is allowed to remain open for use if the free active
chlorine, pH, or turbidity are not within the limits required by these
regulations... It is the responsibility of the pool personnel to close
the pool if any one of these three are not within the required
limits."* This is primary-source confirmed (read directly in the 2022
redline). **Cyanuric acid and alkalinity are not named in this specific
three-item closure clause** — only chlorine, pH, and turbidity are;
treat CYA/alkalinity violations as standing violations rather than a
confirmed independent closure trigger unless a later pass finds
otherwise.

**Testing frequency (310:320-3-9, primary-source confirmed):**
- Free chlorine, bromine (if used), pH, turbidity: **4 times per day**
- Combined chlorine, turnover rate: **daily**
- Total alkalinity, calcium hardness, cyanuric acid: **weekly**
- Hot water facilities (>90°F) additionally: temperature 4×/day; copper,
  iron, and TDS weekly
- Up to 3 of the 4 daily chlorine/pH readings may be substituted with
  electrode-type automatic controller readings, with Department approval

**Fecal/Vomit Contamination Response — corroborated via a county health
department's own program page, not read directly in the state's own
image-only appendix:**
- **Formed stool with adequate chlorine present:** remove material,
  locally treat the affected area, allow re-entry after roughly 30
  minutes once levels are confirmed acceptable
- **Watery/diarrheal stool or vomit:** clear the pool, remove material,
  raise free chlorine to **20 ppm**, maintain **pH 7.2–7.8 for 8
  hours**, backwash the filter, then reopen
- **No blood-specific provision found.**

**Open items for Oklahoma:** (1) the actual OAC 310:320-3-8 table
should be read directly (as an image, e.g. via OCR or manual lookup)
before treating any chemistry figure above as fully confirmed; (2) the
alkalinity conflict between two sources should be resolved by reading
the primary table; (3) the state's own hosted PDF returned a 404 this
session — worth re-checking, as the department may have relocated it.

**Sources used:**
- [OSDH CH 320, Proposed Rule Amendments, Flight 2 2022 (oklahoma.gov)](https://oklahoma.gov/content/dam/ok/en/health/health2/aem-documents/organization/proposed-amendments-to-osdh-rules/flight-2--2022/OSDH%20CH%20320_flight%202.pdf) — read via direct text extraction (pdftotext); source of the testing-frequency table, the chlorine/pH/turbidity closure clause, and the alkalinity figures in its own appendix
- [Public Swimming Pools — Tulsa Health Department](https://tulsa-health.org/permits-inspections/housing/public-swimming-pools/) — corroborating source for chemistry ranges and the fecal/vomit response, cited as county-level guidance interpreting OAC 310:320, not the primary regulation text itself
- [Okla. Admin. Code § 310:320-3-8 — Table (Cornell LII)](https://www.law.cornell.edu/regulations/oklahoma/OAC-310-320-3-8) — confirms the operative table exists only as an embedded image, not extractable text, on every platform checked

---

## Oregon

**★ Very recently rewritten — confirmed as the current rule, not a
draft:** Oregon adopted an entirely new pool/spa code, **OAR 333-062,
"Aquatic Facility Operations and Maintenance,"** effective **April 1,
2025** — a few months old as of this pass. The source document is the
Oregon Health Authority's own current published rule text, not a
superseded or proposed version. It reads as a close, largely verbatim
adoption of the **2024 CDC Model Aquatic Health Code (MAHC)**
terminology and structure (ALL-CAPS defined terms like AQUATIC VENUE,
QUALIFIED OPERATOR, DPD-FC) — the same underlying template Delaware's
§9.28 independently adopted, which is why several passages below read
almost identically to Delaware's.

- **Health Department name:** Oregon Health Authority (OHA), Public
  Health Division, Food, Pool & Lodging Health and Safety Program.
- **Official citation:** OAR 333-062 (Operation and Maintenance,
  effective 4/1/2025) — chemistry at §5.7.3–5.7.4, testing frequency at
  §5.7.5, imminent-hazard closures at §6.6.3, fecal/vomit/blood response
  at §6.5A/6.5.2/6.5.3. (A companion rule, OAR 333-060, covers design
  and construction standards — not reviewed this pass.)
- **Has dedicated log sheet:** Not confirmed as a single named form
  this pass; the rule specifies record content and retention
  requirements directly rather than naming a numbered OHA form in the
  sections reviewed.

**Chemistry thresholds (§5.7.3–5.7.4):**

| Reading | Requirement |
|---|---|
| pH | 7.0 – 7.8 |
| Free Chlorine — not using CYA | Minimum 1.0 ppm |
| Free Chlorine — using CYA | Minimum 2.0 ppm |
| Free Chlorine — spas | Minimum 3.0 ppm |
| Free Chlorine — maximum (all) | 10.0 ppm |
| Bromine — all aquatic venues | Minimum 3.0 ppm |
| Bromine — spas | Minimum 4.0 ppm |
| Bromine — maximum | 8.0 ppm |
| Combined Chlorine | Remedial action required above a set threshold (exact ppm not captured this pass — see §5.7.4.4.2) |
| Cyanuric Acid | Must remain at or below **90 ppm** |
| Calcium Hardness | Must not exceed 2,500 ppm |
| Total Alkalinity | 60 – 180 ppm |
| Max temperature | 104°F |

**★ CYA is being phased out of new/altered indoor construction, on a
fixed clock, not banned outright immediately:** §5.7.3.1.3.1A — CYA/
stabilized chlorine may not be used in **new construction, substantial
alterations, or disinfection-equipment replacements** at indoor pools
and spas, and any facility in that category **must stop using CYA no
later than 4 years after this code's adoption** (i.e., by ~April 2029).
Existing, unaltered indoor facilities aren't immediately forced off CYA
the way Delaware/Indiana/Iowa/Minnesota/Montana ban it outright — this
is a transition-period model, a genuinely different mechanism than a
flat prohibition.

**★ Cyanuric acid's own 90 ppm figure matches Georgia's exactly** — per
`COMPLIANCE_RULESET_NOTES.md`, Georgia was previously the only state
whose own cap matched the CDC MAHC's recommended maximum precisely;
Oregon's 2025 MAHC-based rewrite is a second, independent confirmation
of that same number.

**pH range that triggers mandatory closure/violation:** §6.6.3.1 names
**pH below 7.0** and **pH above 7.8** as two of twenty individually
enumerated **Imminent Health Hazard** violations requiring immediate
closure — the routine range doubles as the closure trigger, but unlike
most other states with this shape, Oregon's list is unusually long and
specific (20 named items, from lightning within 10 miles to broken
glass on deck).

**★ New pattern — a ratio-based CYA closure trigger, not just an
absolute ceiling:** §6.6.3.1(3) — closure is required when *"AQUATIC
VENUES using CHLORINE STABILIZERS where the **CYA:DPD-FC ratio exceeds
45:1** or when CYA levels exceed 150 ppm."* This is the first state in
this file to define a CYA closure trigger as a **ratio between two
readings** (CYA relative to free chlorine) rather than (or in addition
to) a flat number — worth using as the reference shape if
`relationalRule` needs a second CYA-based example beyond Alabama's
simple branch.

**Testing frequency (§5.7.5):**
- Disinfectant residual and pH: every 4 hours while open, **or every
  hour if the venue is outdoor and not using CYA** — a tighter, not
  looser, cadence for the no-stabilizer case, the opposite direction
  from how most states treat CYA presence
- Total alkalinity: weekly
- Cyanuric acid (where used): monthly
- Daily bulk water samples collected at midday, compared against
  routine in-line sample data
- Sample rotation around the shallow end, with a required deep-end
  sample included

**Fecal/Vomit/Blood Contamination Response (§6.5A) — MAHC-derived, one
of the most complete protocols in this file:**

- **Immediate closure**, extending to **every aquatic venue sharing the
  same recirculation system** (§6.5.2.1.1) — same cascading-closure
  pattern as Delaware/New York/California/Georgia/Indiana
- Removal via net/scoop/bucket only; **vacuum cleaners prohibited**
  unless waste discharges to sanitary sewer and equipment can be fully
  disinfected
- Pre-treatment: **pH ≤7.5**, water temperature **≥77°F** (waived for
  unheated venues), continuous filtration, multi-point sampling, and
  **only non-stabilized chlorine products** used to raise the residual
  during remediation — this exact combination of steps is close to
  word-for-word identical to Delaware's §9.28.3.6, confirming both are
  independent adoptions of the same underlying MAHC template
- **Formed-stool and vomit** (separate sections, identical numbers):
  raise DPD-FC to **2.0 ppm for at least 25 minutes**; **double the
  time if CYA/stabilized chlorine is present**
- **Diarrheal-stool:** raise DPD-FC to **20.0 ppm for at least 12.75
  hours**, or secondary treatment to reduce Cryptosporidium below 1
  oocyst/100 mL
- **Any venue containing CYA, for the diarrheal case specifically:**
  lower CYA to ≤15 ppm by draining if needed, then hyperchlorinate to
  **20 ppm/28 hrs, 30 ppm/18 hrs, or 40 ppm/8.5 hrs** (three equivalent
  CT-based options — a more granular version of Delaware's single
  40 ppm/30 hr figure), **or** secondary treatment, **or** drain
  completely
- **Blood is explicitly exempted:** *"Blood contamination of a properly
  maintained AQUATIC VENUE's water does not pose a public health risk to
  swimmers"* — operators *may* choose to treat it as formed-stool
  purely to satisfy patron concerns, not because the code requires it.
  Same shape as New York's and Delaware's blood exemption, a third/
  fourth independent confirmation of that pattern.
- **Brominated pools:** temporarily add chlorine to reach the same
  DPD-FC targets, then readjust bromine residual before reopening
- A separate, named **Legionella contamination response** exists
  (§6.5.3.6) — close the spa immediately without draining, contact the
  AHJ for lab testing — the same distinct-category pattern seen in
  Montana.

**Open items for Oregon:** (1) the exact combined-chlorine remediation
threshold (§5.7.4.4.2) wasn't fully captured this pass; (2) OAR 333-060
(design/construction) wasn't reviewed — only 333-062 (operation).
Otherwise fully sourced from the current, very recently adopted rule
text.

**Sources used:**
- [Oregon Public Aquatic Facility Rules, OAR 333-062, effective April 1, 2025 (Oregon Health Authority)](https://www.oregon.gov/oha/PH/HEALTHYENVIRONMENTS/RECREATION/POOLSLODGING/Documents/OAR%20333-062-1000.pdf) — read via direct text extraction (pdftotext); every citation above comes from this document

---

## Pennsylvania

**★ A real, corroborated outlier — read directly, not a transcription
error:** Pennsylvania's free chlorine floor is **0.4 mg/L**, matching
Louisiana as the second-lowest chlorine minimum found in this entire
file (every other state sits at 1.0 ppm or higher). This section (28
Pa. Code §18.29) was adopted September 18, 1971 and, per the Pennsylvania
Code's own currency statement, reflects the code "through June 2, 2026"
— i.e., confirmed still in force as of this pass, not a stale citation.

- **Health Department name:** Pennsylvania Department of Health.
- **Official citation:** 28 Pa. Code, **Chapter 18, "Public Swimming
  and Bathing Places"** — water supply/chemistry standards at §§18.21–
  18.32, specifically **§18.29** for chlorine/pH, **§18.27** for the
  bacteriological contamination/closure definition.
- **Has dedicated log sheet:** Operational records required (§18.32,
  filed monthly or more often as required) — no specific numbered state
  form confirmed this pass. A separate county-level "Public Bathing
  Place Inspection Report Annex" (Chester County) exists but is a local
  document, not necessarily statewide.

**Chemistry thresholds (§18.29):**

| Reading | Requirement |
|---|---|
| pH | 7.2 – 8.2 |
| Free Chlorine | Minimum 0.4 mg/L, "in all parts of the pool when in use" |
| Cyanuric Acid | **NOT FOUND** — confirmed absent from §18.29 and from the chapter's table of contents; a separate, non-binding "Standard Operating Recommendations" guidance document reportedly advises *against* using cyanuric acid/stabilizer/trichlor/dichlor at all in Pennsylvania facilities, but this is guidance, not a codified numeric standard |
| Total Alkalinity | **NOT FOUND** — same as CYA, confirmed absent from the codified chapter |

Alternative (non-chlorine) disinfection methods are permitted with
Department approval if they provide a measurable residual, match
chlorine's effectiveness, and pose no health risk — a performance-based
substitution clause, the same shape seen in several other states.

**pH range that triggers mandatory closure/violation:** **NOT FOUND**
as a distinct trigger. §18.27, the chapter's only closure/contamination
provision found, defines contamination **exclusively in bacteriological
terms** (coliform sample results) — confirmed directly: *"§18.27
addresses only bacteriological contamination... does not address
chemistry violations like chlorine or pH levels... no mention of...
closure procedures."* Don't assume a pH or chlorine violation triggers
automatic closure in Pennsylvania the way it does in most other states
in this file — the codified mechanism found this pass is purely
microbiological.

**CYA threshold that triggers closure-risk violation:** **NOT FOUND** —
consistent with no CYA standard existing in the chapter at all.

**Testing frequency (§18.29):** disinfectant residual and pH tested
**"at least twice daily, or more often if required by the Department."**
Test kits must be accurate to within 0.1 mg/L (chlorine) and 0.2 pH
units.

**Fecal/Vomit/Blood Contamination Response — confirmed absent, not
unresearched:** the sections reviewed (§§18.21–18.32) contain **no
fecal/vomit/blood incident protocol, no CT value, and no CDC
cross-reference** — the chapter's only contamination-related provision
(§18.27) is the bacteriological/coliform closure rule described above,
unrelated to bodily-fluid incidents.

**Open items for Pennsylvania:** (1) the 0.4 mg/L chlorine floor is a
genuine, primary-source-confirmed outlier — don't "correct" it toward
another state's number; (2) CYA and alkalinity are confirmed absent
from the codified chapter (a separate non-binding guidance document
recommends against CYA use entirely, but sets no enforceable number);
(3) no chemistry-based closure trigger or fecal/vomit/blood protocol
exists in the sections reviewed — both confirmed absent, not gaps in
research.

**Sources used:**
- [28 Pa. Code Chapter 18, Public Swimming and Bathing Places — table of contents (Pennsylvania Code and Bulletin, official)](https://www.pacodeandbulletin.gov/Display/pacode?file=%2Fsecure%2Fpacode%2Fdata%2F028%2Fchapter18%2Fchap18toc.html)
- [28 Pa. Code §18.29 (Pennsylvania Code and Bulletin, official)](https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/028/chapter18/s18.29.html) — source of the chlorine/pH/testing-frequency figures
- [28 Pa. Code §18.27 (Pennsylvania Code and Bulletin, official)](https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/028/chapter18/s18.27.html) — confirms the bacteriological-only scope of the chapter's closure provision

---
