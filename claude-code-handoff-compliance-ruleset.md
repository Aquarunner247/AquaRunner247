# Claude Code Handoff — Multi-State ComplianceRuleset Build

## Context

AquaRunner 24/7 Pro currently hardcodes Nevada/SNHD compliance rules
directly into the app. We're generalizing this into a pluggable
per-state `ComplianceRuleset` model so any state can be onboarded
without new code, per `multi-state-compliance-spec.md` (already in the
repo). This prompt is the next step: build the actual schema and rule
engine against **real regulatory data from 9 states**, not a
hypothetical shape.

**Read these two files in full before writing any schema or migration:**
1. `multi-state-compliance-spec.md` — the original architecture proposal
2. `state-compliance-data.md` — real extracted compliance data for
   Nevada (baseline), Connecticut, Alabama, Alaska, Arizona, Arkansas,
   California, Colorado, and Florida. **Start with the "★ ARCHITECTURE
   NOTES FOR CLAUDE CODE" section at the top of that file** — it's a
   consolidated index of 15 rule-complexity patterns discovered across
   these 9 states, each with a source example. Every pattern in that
   index needs to be representable by the schema you design; don't
   design against Nevada/SNHD alone and retrofit later.

## What "done" looks like

1. A `ComplianceRuleset` Prisma schema (plus any child tables it needs)
   that can represent all 15 patterns below without per-state special
   casing in application code.
2. A migration that creates the schema.
3. A seed script that populates `ComplianceRuleset` records for all 9
   states from `state-compliance-data.md`, faithfully, including the
   explicitly-flagged gaps and conflicts (see "Handling gaps" below —
   **do not silently resolve or guess at any flagged item**).
4. Nevada's existing hardcoded rules migrated into this same schema, so
   Nevada is no longer a special case in application code either.
5. A short `COMPLIANCE_RULESET_NOTES.md` in the repo documenting any
   schema decisions you made where the source data was ambiguous, so
   the next state added can follow the same conventions.

## The 15 patterns your schema must support

(Full detail and source state for each is in `state-compliance-data.md`'s
architecture notes section — this is a summary, not a replacement for
reading it.)

1. Cross-field/relational checks between two readings (Alabama CYA/FC,
   Alaska FAC/TAC ratio, Arkansas Combined Chlorine, Arkansas alkalinity)
2. Event-triggered closure protocols, separate from reading thresholds
   (Arizona, Arkansas fecal incidents)
3. Facility-attribute-based frequency exceptions (California small-HOA
   pools)
4. Equipment-performance-triggered closures (California UV dosage)
5. Performance-based/adaptive testing frequency, not a fixed cadence
   (California combined chlorine)
6. Curve/table-based threshold lookups — one reading redefines another's
   acceptable range via a graph, not a simple branch (Alaska Table E,
   Colorado's ORP/pH/chlorine graph)
7. Lab-result-triggered closures with indeterminate duration (Alaska
   pathogen test)
8. Pool-vs-spa threshold **and** frequency both differing, not just the
   threshold (Alabama)
9. Multiple parallel disinfection-method tracks, each with a full
   threshold set (Colorado: chlorine/bromine/peroxide/ion generators)
10. Cross-method dependency — one disinfection method's compliance
    depends on a second, different method's reading (Colorado ion
    generators requiring a 0.4 ppm chlorine residual)
11. Per-parameter frequency matrix by body-of-water type, more granular
    than one cadence per type (Colorado)
12. Repeated-failure closure trigger — requires N consecutive failures,
    not one (Colorado bacterial closure)
13. Descending-below-a-ceiling reopening trigger — the mirror case of
    "restore the minimum" (Florida breakpoint chlorination reopening)
14. Chemical-triggered equipment/testing obligations — using a chemical
    creates its own test-kit/lab requirement, separate from its
    threshold (Florida)
15. Facility subtypes beyond pool/spa with their own full rule sets, not
    just a chemistry variant (Florida swim-up bars)

## Build locally only — do not touch production

This build must stay entirely local/preview until manually tested and
approved. Specifically:

- Work on a new feature branch (e.g. `feature/compliance-ruleset`) —
  never commit directly to `main`.
- Run and apply the Prisma migration against your **local** dev database
  only. Do not run `prisma migrate deploy` or anything that touches the
  production `DATABASE_URL` or the production Supabase project.
- Do not push the branch, open a PR that auto-deploys, or trigger a
  Vercel deployment of any kind (production or Preview) as part of this
  work — this includes not pushing to GitHub at all until told to.
- The seed script should run against the same local database, not
  production or the shared Supabase test/preview project.
- When the build is complete, stop and leave the branch local/uncommitted-
  to-remote so it can be reviewed and tested by hand before anything is
  pushed or deployed. Don't merge, don't deploy, don't open a PR.

If anything about the current setup would require touching production to
complete a step (e.g. an env var only present in production), stop and
flag it rather than working around it.

## Suggested build order

1. **Data modeling pass first, no code.** Sketch the `ComplianceRuleset`
   shape (and child tables — you'll likely need at least a separate
   `chemistryRules`/threshold table, an `eventProtocols` table, and a
   `frequencyRules` table given patterns 2, 3, 5, 8, 11, 13) against all
   15 patterns above before writing any Prisma schema. Share this shape
   in `COMPLIANCE_RULESET_NOTES.md` before migrating, since it's the
   part most likely to need a second pass.
2. Write the Prisma schema + migration, applied locally only (see above).
3. Seed Nevada first and confirm existing app behavior (SNHD rules)
   still works unchanged against the new schema — this is a regression
   check, not new functionality.
4. Seed the remaining 8 states from `state-compliance-data.md`, one at a
   time, committing locally after each so a bad seed for one state
   doesn't block the rest.
5. Write `COMPLIANCE_RULESET_NOTES.md` documenting: the final schema
   shape, any convention decisions, and a short "how to add a new state"
   guide for future data drops.

## Handling gaps and conflicts — do not resolve these yourself

`state-compliance-data.md` explicitly flags several items as open
questions or conflicts rather than resolved facts. Seed these
**as-flagged**, with a `notes`/`sourceConfidence` field on the affected
record rather than picking a value:

- **Alabama**: conflict between the General Provisions excerpt (CYA
  banned indoors) and Appendix A/B (flat 10–150 ppm range, no
  indoor/outdoor distinction). Seed the Appendix A/B numeric range as
  the primary rule, but add a flagged note referencing the indoor-ban
  conflict — don't drop either source silently.
- **Alaska**: the actual Table E curve data points (pH → minimum FAC)
  aren't available, only the rule description. Seed a placeholder/
  approximation clearly marked as such, not a fabricated curve.
- **Colorado**: the free-chlorine minimum when *not* using a
  supplemental oxidizer isn't stated (only the "0.25 ppm with
  supplemental oxidizer" case is). Don't infer a number — flag it.
  Also: the ORP/pH/chlorine graph (Graph #1) has the same
  no-extractable-data-points issue as Alaska's Table E.
- **Connecticut**: the CYA 30-day testing cadence is a business decision
  matching Nevada's cadence, not a sourced CT requirement — keep this
  flagged as an assumption in the seeded record, not presented as fact.
- **Florida**: the fecal incident protocol defers entirely to an
  external CDC document (not reproduced in the regulation text) — seed
  a reference/link rather than fabricating hold-times or ppm targets.
- **California**: the incident-recording requirement (§65546) is
  confirmed to exist but its specific decontamination protocol text
  wasn't in the source excerpt — same treatment as Florida's Florida
  fecal gap: reference the citation, don't invent numbers.

If any of these gaps block a schema field from having a value, use
`null` plus a note, not a guessed default.

## Non-goals for this pass

- Building the in-app state-code reference/summary pages (separate spec)
- Building UI for admins to edit `ComplianceRuleset` records by hand —
  seed script only, for now
- Anything involving Colorado's or Florida's non-chemistry facility
  design/construction requirements (fencing, dressing rooms, etc.) —
  those are noted in `state-compliance-data.md` for completeness but are
  out of scope for the reading/log-sheet feature
