# Claude Code Prompt — AI Phone Answering Agent (AquaRunner 24/7 Pro)

Copy everything below the line into Claude Code as your task prompt.

---

## Context

This is the AquaRunner 24/7 Pro repo (`Aquarunner247/AquaRunner247`, `master` branch): Next.js 15, Prisma 7, Supabase Auth, Stripe, deployed on Vercel. The schema is already multi-tenant — every core table carries `organizationId`, and there's an `Organization` model. Follow the conventions in `CLAUDE.md` (never print secrets to chat, dry-run defaults for destructive scripts, verify before reporting done).

We're adding a new opt-in, paid add-on feature: an **AI Interactive Answering Agent**. It answers inbound calls via Twilio for a pool-service organization any time a live person doesn't pick up — whether that's genuinely after-hours (closed for the day) or simply because the owner/office is busy and can't get to the phone during business hours (call overflow). Either way, the caller lands in the same interactive voicemail flow: it walks them through a phone tree, captures a voicemail/speech response, uses an LLM to turn that into a structured service ticket, stores it in Supabase/Postgres scoped to the organization, and notifies the on-call team.

This is **not** strictly an "after-hours" feature — it's a general no-answer/overflow answering service. It should trigger whenever a call isn't picked up live, regardless of the org's posted business hours. The org's configured business hours still matter for *what the caller hears and what the ticket assumes about urgency/callback timing* (e.g., "we're closed for the day, we'll call you back tomorrow morning" vs. "we're just away from the phone, we'll call you back shortly") — but they should not be used to decide *whether* the agent answers. The agent should always be the fallback for a missed live call.

**Critical constraint on how we build this:** we are developing and testing this entirely against a Twilio **trial account** using my own personally-verified phone numbers. Twilio trial accounts can only place/receive calls and texts involving verified numbers, they prepend a "trial account" message to SMS, and the starter credit is finite (not recurring). None of that is a blocker for building — it just means:

- The feature must be built fully **feature-flagged off** at the organization level (`aiPhoneAgentEnabled: false` by default) so it never gets exposed to a real customer org by accident.
- Nothing about the code should assume verified numbers or trial limits — the code itself should be production-shaped. The *trial account* is just how we're testing it for now. When we're ready to sell it, we (a human) upgrade the Twilio account or move to a subaccount and flip the flag per paying org — no code change needed for that transition.
- Do not build any outbound calling or outbound SMS in this phase. Inbound-only.

## Objective

Build the MVP intake pipeline end-to-end, in this order, and don't skip ahead to conversational/real-time AI until the deterministic pipeline below is fully working and tested:

1. **Call routing / no-answer detection.** The Twilio number for the org should first attempt to ring the org's real business line (the owner's phone, or whatever number they designate) using `<Dial>` with a `timeout` and `action` callback. Only if that leg comes back `no-answer`, `busy`, or `failed` does the call fall through into the interactive-voicemail agent below. This is what makes it work both genuinely after-hours (nobody picks up because nobody's there) and during business hours when the owner is just busy (rings, no answer, falls through). Make the ring timeout (e.g., 15–20 seconds) and the destination number configurable per org in `OrgPhoneAgentSettings`, not hardcoded.
2. Twilio incoming-call webhook at `/api/twilio/voice` (Next.js route handler) hosted on our existing Vercel deployment, implementing the routing logic above plus the fallback flow.
3. A deterministic DTMF phone tree for the fallback flow: "For a new service request, press 1. If you're an existing customer, press 2. If this is urgent, press 3. To leave a message, press 4." Have the greeting text be configurable per org (pulled from `OrgPhoneAgentSettings`) so it can say something like "We're unable to take your call right now" rather than assuming it's after-hours, since during business-hours overflow that framing would be wrong.
4. Voicemail/speech capture (Twilio `<Record>` or `<Gather input="speech">` — pick whichever gives cleaner transcripts for a pool-service context; explain your choice before implementing).
5. Send the transcript to an LLM and parse it into structured fields:
   - Caller name and phone number
   - Property/service address (if given)
   - Issue type (e.g., equipment failure, chemical/water quality, leak, no-show complaint, billing, other)
   - Urgency (routine / same-day / emergency)
   - Requested callback time
   - Whether the call came in during business hours (busy/overflow) or after-hours, based on the org's configured hours at call time — store this as a field on the ticket, it's useful signal even though it doesn't gate whether the agent answers
   - One-paragraph summary
6. Store the request in Supabase/Postgres via Prisma, scoped to `organizationId`.
7. Email the organization's on-call/escalation contact(s) with the ticket. Consider flagging business-hours overflow tickets as more time-sensitive in the notification than genuine after-hours ones, since the caller may expect a callback sooner.
8. Surface the ticket in the admin dashboard (new page or a section on an existing one — check existing dashboard structure and match its patterns rather than inventing a new UI style), including whether it was an overflow or after-hours call.
9. Stop there for this task. Do not build real-time/conversational AI voice — that's an explicit later phase, only after this pipeline is validated live with test calls.

## Data model changes

Propose and implement a Prisma migration adding (adjust naming to match existing schema conventions — check `prisma/schema.prisma` first):

- `Organization.aiPhoneAgentEnabled` (Boolean, default false)
- A new `OrgPhoneAgentSettings` table (1:1 with `Organization`), holding: business hours, the real business/owner phone number to dial first (and its ring timeout), escalation phone number(s)/email(s), service territory description, an after-hours greeting/script, a separate busy/overflow greeting/script (since "we're closed" and "we're just away from the phone" are different messages), callback-time promise text for each case, which issue types the agent is allowed to handle, and the assigned Twilio phone number for that org.
- A new `PhoneAgentCall` table scoped by `organizationId`: Twilio Call SID, caller number, timestamp, whether the call was routed to the agent as after-hours or as business-hours overflow (no-answer/busy on the primary line), raw recording URL (if any), raw transcript (store separately from the AI summary — never overwrite/merge them), AI-extracted structured fields (the ones listed above), resulting ticket status, and a per-call duration/cost field for future billing use.
- A `PhoneAgentDailyUsage` (or similar) aggregate table per org per day: call count and total minutes, so we can enforce daily/monthly caps cheaply without scanning `PhoneAgentCall` every request.

Write the migration, run `prisma generate`, and confirm the app still typechecks before moving on.

## Security requirements — non-negotiable, verify each one explicitly before calling this done

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and the LLM API key must only ever be read server-side from Vercel environment variables. Grep the diff yourself before finishing to confirm none of these ever reach client-bundled code, a `NEXT_PUBLIC_*` variable, or a log statement.
- **Validate the Twilio webhook signature** on every request to `/api/twilio/voice` (and any other Twilio-facing route you add) using Twilio's `X-Twilio-Signature` header and the official validation method (`twilio.validateRequest` or equivalent for the SDK version in use). Reject unsigned/invalid requests with a 403 before any other processing. This is the single most important control in this whole feature — a spoofed request here can create fake tickets or (worse) if we ever add outbound features, place calls. Do not skip it "for now."
- The admin dashboard pages/settings for the phone agent must sit behind existing organization authentication and role checks (whatever the app already uses for other org-scoped admin settings) — a user must be authenticated and belong to the org before they can view or edit that org's phone-agent settings.
- Every Prisma query touching `PhoneAgentCall`, `OrgPhoneAgentSettings`, or `PhoneAgentDailyUsage` must be scoped by `organizationId`, matching the pattern already used everywhere else in this codebase. No query should ever be able to return another org's calls. Double-check this explicitly since it's a fresh feature area.
- Enforce per-org limits server-side, not just in the UI: max calls/day, max total minutes/day, max single-call duration. Read the caps from `OrgPhoneAgentSettings`/`PhoneAgentDailyUsage`; if a call would exceed them, respond with a graceful TwiML message (e.g., "please call back during business hours" / voicemail-only fallback) instead of proceeding into the AI pipeline.
- Inbound-only. Do not implement or scaffold any endpoint capable of placing outbound calls or sending outbound SMS in this task.
- Log every step of the pipeline (call received, tree branch taken, recording/transcript captured, AI parse result, ticket created, notification sent) with enough detail to debug a bad ticket later, but never log the full auth token, API keys, or anything that should stay server-side-only.
- Keep the raw transcript and the AI-generated summary as separate stored fields, never collapsed into one — if the AI misreads something, we need to be able to check it against what the caller actually said.

## Feature flag & test-organization setup

- Default `aiPhoneAgentEnabled` to `false` for every existing organization in the migration.
- Only enable it for whatever your designated internal/test organization is — confirm which org that should be before flipping it, don't guess.
- The webhook route and TwiML responses should behave safely (return a generic "this service is not available" TwiML) if it somehow receives a call for an org with the flag off, as a defense-in-depth measure — don't rely solely on the flag gating the UI.

## Environment variables to add (list them for me, don't invent values)

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` (or read per-org number from `OrgPhoneAgentSettings` — tell me which approach you're using and why)
- LLM provider key for the intake-parsing step (prefer a free-tier-friendly provider for this dev phase — flag your recommendation and let me confirm before wiring it in, since this touches billing)
- Anything else your implementation needs — surface it explicitly rather than silently requiring me to guess later.

Do not add these to Vercel yourself — list exactly what I need to add and where (which endpoint/route needs which variable), and I'll add them.

## Testing plan — do this before declaring the feature "done"

1. Unit/integration tests for the Twilio signature validation (both a valid-signature and a tampered-signature case) — this should not require placing an actual call.
2. Unit tests for the transcript → structured-fields parsing logic, using a handful of realistic sample transcripts (routine chemical question, an equipment emergency, an ambiguous one) as fixtures, so we're not burning LLM calls or Twilio minutes on every test run.
3. A manual test checklist for me to run against the real Twilio trial number from my verified phone: confirm the call actually rings my configured business/owner number first and only falls through to the agent on no-answer/busy/decline; cover each phone-tree branch; a dropped/incomplete call; a call that exceeds max duration; and confirm the resulting ticket, transcript, and notification email all show up correctly, are scoped to the right org, and correctly reflect after-hours vs. business-hours-overflow.
4. Confirm typecheck/build passes and existing test suite is unaffected before wrapping up.

## Deliverables

- Prisma migration + schema changes
- `/api/twilio/voice` route handler (and any sibling routes needed for `<Gather>`/`<Record>` callbacks)
- Intake-parsing module (transcript → structured fields)
- Notification (email) integration using whatever we already use in this app for outbound email (check before adding a new provider)
- Admin settings UI for `OrgPhoneAgentSettings` (business hours, the primary business number + ring timeout, escalation contacts, separate after-hours and busy/overflow greetings, allowed issue types, etc.) and a dashboard view/list for `PhoneAgentCall` tickets — showing whether each was an after-hours or overflow call — matching existing UI patterns and the "Sunset Water" design system
- A short markdown doc (`phone-agent-setup.md` or similar, in the repo) explaining: how to point a Twilio number at the webhook, which env vars are needed, how the feature flag works, and the exact manual test checklist from above
- A summary at the end of what was built, what was explicitly deferred (real-time AI voice, outbound calling, billing/metering integration, RLS policies if applicable), and any open questions for me

Work through this in phases, confirm each phase compiles and (where applicable) passes tests before moving to the next, and don't silently make product decisions on the open items above (LLM provider choice, Record vs Gather, which org is the test org) — ask or flag them clearly.
