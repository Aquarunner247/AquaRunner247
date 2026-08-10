# Status Update — state-compliance-data.md has changed significantly

If you're partway through (or have finished) the build from
`claude-code-handoff-compliance-ruleset.md`, read this before doing
anything else — the source data file has been substantially revised
since that handoff, not just extended with new states.

## What actually changed, not just grew

- **Maryland was completely rebuilt.** The original entry cited the
  wrong COMAR section (10.17.04) and got several numbers wrong as a
  result — combined chlorine, alkalinity, calcium hardness, and an
  entire fabricated "Class A–D" facility taxonomy that doesn't exist in
  the real code. The correct citation is COMAR 10.17.01. **If you've
  already seeded Maryland, delete and re-seed it from scratch** rather
  than trying to patch the old values — too much changed to safely diff.
- **Alabama's CYA indoor-ban conflict is resolved.** There is no indoor
  ban in the actual county rules — only the flat Appendix A/B numeric
  range applies. If you seeded a CYA branch conditioned on indoor/
  outdoor for Alabama, remove it.
- **Alaska's Table E and Colorado's Graph #1 curves are now resolved**
  with real formulas/ranges instead of placeholders — if you built
  interim approximations for either, replace them with the versions now
  in the file.
- **Four states were added:** New Mexico, New York, Maryland (rebuilt),
  Georgia, and Hawaii are all new or substantially revised since the
  original handoff.
- **The architecture-notes index grew from 15 patterns to 38.** Several
  of the later patterns affect schema shape in ways the first 15 didn't
  anticipate — notably:
  - Multiple parallel disinfection-method tracks per state (Colorado)
  - Cross-method dependencies (Colorado's ion generators needing a
    companion chlorine reading)
  - Closure logic that's a unified status model across chemistry +
    equipment + safety (New Mexico, Georgia — two different
    implementations of the same idea)
  - A proactive periodic submission duty, distinct from retention
    (Hawaii)
  - Multi-point incident monitoring grids with defined CT start/end
    boundaries (Georgia's six-checkpoint structure)
  - A formal two-tier operator/responsible-person staffing structure
    (Georgia)

  **If your schema design happened before reading the full updated
  notes section, it's worth a second pass against the current index
  before continuing the seed script** — patterns 16–38 weren't visible
  at the time of the original handoff.

## Gap status

**Zero open gaps remain in the file.** Every item that was flagged as
missing/ambiguous in the original handoff has since been resolved with
real sourced data, a working formula, or an explicit confirmed-permanent
gap (Hawaii's alkalinity range has no regulatory number anywhere, not
even at the local level — seed as `null` with the non-binding industry
figures noted as context only, don't treat it as unfinished research).

## What to do next

1. If you haven't started seeding yet: proceed as planned, just make
   sure you're reading the current file, not a cached/earlier version.
2. If you've seeded some states already: **re-check Maryland and Alabama
   specifically** against the current file — those are the two where
   previously-seeded data would now be wrong, not just incomplete.
3. If your schema design predates the fuller pattern list: worth a
   quick pass to confirm patterns 16–38 don't require a schema change
   you haven't made yet, before seeding the remaining states.
4. Everything else from the original handoff still applies unchanged —
   local-only build, feature branch, no production/Vercel/Supabase
   writes, stop and flag rather than work around any production
   dependency.

## Schema note — contamination incidents should NOT live in the same
table as routine chemistry readings

This is worth being explicit about rather than leaving implicit in the
pattern list: **model contamination/fecal-vomit incidents as their own
table** (e.g. `ContaminationIncident`, linked to the property/body of
water), **not as extra columns on the daily reading table.** Reasons,
concretely:

- **Different shape entirely.** A routine reading is one timestamp and
  a handful of values. An incident needs a full lifecycle: closure
  time, a multi-point monitoring grid during remediation (Georgia's is
  six checkpoints — start, four intervals, end), a defined contact-time
  window (start/stop conditions, per Georgia's explicit definition),
  reopening timestamp, and free-text remediation notes. Bolting that
  onto the reading table means a wide, mostly-null table 364 days a
  year.
- **Incidents have a real state machine; readings don't.** Open →
  under remediation → verified clean → reopened is a lifecycle with
  rules attached to specific transitions (e.g. Georgia's contact-time
  clock starts/stops at specific state changes, not at a fixed
  interval). A routine reading is just a data point with no state.
- **Different rule category entirely.** Routine readings validate
  against `chemistryRules` (min/max/ideal). Incidents validate against
  `eventProtocols` (CT values, hold times, contamination-type branches,
  CYA-presence modifiers — see patterns on California/New York/Florida/
  Georgia's differing CYA-during-incident mechanisms). These shouldn't
  be the same validation path.
- **Closure cascades belong to the incident, not a single reading.**
  New York's and California's "close every pool sharing the same
  filtration system" rule is a property of the incident event, not of
  one chemistry reading — it needs to reference multiple bodies of
  water at once, which a per-reading model can't represent cleanly.

Suggested shape: an `IncidentMonitoringReading` child table (or similar)
linked to the parent incident record, holding the multi-point checkpoint
data, separate from both the incident record itself and the routine
`ChemistryReading` table. Worth confirming this is reflected in the data
model sketch before or during the seed script, not retrofitted after.

