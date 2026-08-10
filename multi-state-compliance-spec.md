# Multi-State Compliance Support — Architecture Spec

Goal: generalize the app from being Nevada/SNHD-specific to supporting any
state's health department compliance rules — starting with signup capturing
state + whether they run commercial pools, with Nevada as the only fully
built ruleset today and others added incrementally.

---

## Why this matters now

The app currently hardcodes "SNHD" and Nevada-specific rules (FC whole-
number rounding, 30-day CYA cycle, etc.) throughout. That's fine for
running Lindley's, but breaks as soon as a company outside Nevada signs up
for the SaaS product. This is a foundational change worth doing before too
many more features get built on top of the Nevada-specific assumption.

---

## Signup changes

Add two fields to the signup flow:

1. **State** — dropdown, all 50 states (+ DC if relevant)
2. **Do you have commercial pools?** — yes/no

These two answers determine:
- Whether compliance features (QR inspector logs, closure-risk banners,
  the rule engine) are relevant at all for this account (if "no commercial
  pools," compliance features simply don't apply — everything is
  residential-style logging)
- Which state's ruleset to apply, if they do have commercial pools

---

## Terminology change (do this regardless of ruleset availability)

Replace all hardcoded "SNHD" references in the UI with a generic label:
**"State/Local Health Department"** or simply **"Health Department"**,
with the actual specific name (e.g. "Southern Nevada Health District")
pulled from a per-state config record rather than hardcoded in components.

This is a straightforward find-and-replace-with-config-lookup pass — low
risk, should happen early since it's foundational to everything else here.

---

## Compliance ruleset architecture (pluggable, per-state)

Introduce a **ComplianceRuleset** concept — a config-driven record per
state, rather than rules hardcoded into application logic. Something like:

```
ComplianceRuleset {
  state: string                    // e.g. "NV"
  healthDepartmentName: string      // e.g. "Southern Nevada Health District"
  isSupported: boolean              // false until you've built this state's rules
  chemistryRules: {
    freeChlorineRounding: "whole" | "decimal" | ...
    cyaTestFrequencyDays: number
    closureThresholds: { ... }      // whatever triggers a closure-risk banner
    // extend as needed per state
  }
  logSheetTemplate: reference        // once you have state-specific sheets,
                                       // this points to that state's format
}
```

**Nevada is the only fully populated record initially** (`isSupported:
true`, with the existing SNHD rules migrated into this structure instead
of being hardcoded). Every other state exists as a stub record
(`isSupported: false`) until you get that state's actual sheets and rules
from them.

**Critical architectural point:** the chemistry validation / closure-
banner logic that currently checks Nevada-specific rules directly should
be refactored to look up the *current account's* ruleset and apply
whatever rules exist there — not to have Nevada's logic special-cased in
application code. This is what makes adding new states later just a data
entry exercise instead of a code change.

---

## Behavior when a state isn't supported yet

Per your decision: **allow signup, basic logging works, compliance rules
apply once you build that state.**

Practically:
- Account signs up fine regardless of state
- If `isSupported: false` for their state: hide QR inspector logs,
  closure-risk banners, and the compliance rule engine entirely for that
  account — they get the same experience as a residential-only account
  even if they marked "yes, commercial pools"
- Show a clear, honest message somewhere visible (e.g. account settings
  or dashboard): *"Compliance tracking for [State] is coming soon — your
  service data is still being logged normally in the meantime."* This
  avoids the account looking broken or silently missing a feature they
  expected.
- Consider a simple internal flag/list of "accounts waiting on state X"
  so you know demand and can prioritize which state to build next

---

## Granularity note (county-level, deferred for now)

Per your decision, starting with state-level only. Worth documenting in
code comments that some health departments are county/local (SNHD being
the clearest example — it's a Clark County entity, not a Nevada state
agency), so if/when you need county-level granularity, the
`ComplianceRuleset` model should be extended with an optional `county`
field rather than reworked from scratch. Not building this now, just
leaving the door open.

---

## Marketing/landing page implications

The current landing page copy leans on "SNHD" by name in a few places.
Once this ships, that copy should generalize too — e.g. "Built-in state
health department compliance rules" instead of SNHD-specific language,
since the product now needs to read as multi-state to a company shopping
from outside Nevada. This is a copy update, not urgent to do before the
backend work, but worth circling back to once the terminology change
lands.

---

## Suggested build order for Claude Code

1. Terminology pass: replace hardcoded "SNHD" UI strings with generic
   labels pulled from config
2. Build the `ComplianceRuleset` model, migrate existing Nevada rules into
   it as the first populated record
3. Refactor chemistry validation / closure-banner logic to read from the
   account's ruleset rather than hardcoded Nevada logic
4. Add State + "commercial pools?" fields to signup
5. Add the `isSupported` gating logic — hide compliance features cleanly
   for unsupported states, show the "coming soon" messaging
6. Add stub `ComplianceRuleset` records for all 50 states with
   `isSupported: false` (just state name + health department name if
   known, rest blank) so the data model is ready to populate as you get
   more states' sheets
7. Revisit landing page copy to generalize away from SNHD-specific
   language
