# AI Phone Agent — Setup & Testing

Companion doc to `cc-prompt-ai-phone-agent.md` (the original build spec) and the
approved implementation plan. Covers what's needed to actually turn this on and
test it against a real Twilio trial call.

## What's built vs. deferred

**Built** (this pass): the deterministic MVP pipeline end-to-end — call routing
(ring the primary line, fall through on no-answer/busy/failed), the DTMF phone
tree, `<Record>` + Twilio's own async transcription, LLM parsing into
structured ticket fields, org-scoped storage, escalation-contact email, and an
admin settings + ticket-list UI. Server-side daily/duration caps. Every
Twilio-facing route verifies `X-Twilio-Signature` and rejects with 403 on
failure. Full test coverage for signature verification and transcript parsing
(`npm test`).

**Explicitly deferred** (per the original spec, not started):
- Real-time/conversational AI voice.
- Any outbound calling or outbound SMS.
- Billing/metering integration (`PhoneAgentCall.estimatedCost` exists as a
  schema field but nothing computes or charges against it yet).
- RLS *policies* — the three new tables have RLS **enabled** (same defense-
  in-depth posture as every table in this app), but no policies are written,
  matching the rest of the schema (the app only ever accesses data via Prisma
  over `DATABASE_URL`, never PostgREST/anon access — see `AGENTS.md`).
- A periodic sweep to mark stale `IN_PROGRESS` calls `ABANDONED`. Right now an
  abandoned mid-flow call just sits at `IN_PROGRESS` forever rather than
  flipping to `ABANDONED` — visible in the ticket list either way, just not
  auto-relabeled.

## Environment variables to add in Vercel

You add these yourself — nothing in this build adds them for you.

| Variable | Where it's used | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Not currently read directly by any route (see open question below) | Add anyway — needed the moment outbound/REST calls are added |
| `TWILIO_AUTH_TOKEN` | `lib/twilio-verify.ts` — every `/api/twilio/*` route | **Required.** Without it every webhook returns 403 unconditionally |
| `AI_GATEWAY_API_KEY` | `lib/phone-agent-intake.ts` | Only needed for **local dev**. In production on Vercel, the AI Gateway resolves automatically via Vercel's own OIDC token — no key needed there |
| `DIALOGFLOW_PROJECT_ID` | `lib/dialogflow.ts` | Already set in production. Without it, spoken intent classification silently no-ops on every call (falls back to "leave a message" every time). |
| `DIALOGFLOW_WEBHOOK_SECRET` | `lib/dialogflow-verify.ts` — checked on every `/api/dialogflow/fulfillment` request | **Required** for live status answers (see "Caller recognition + live status answers" below). Generate any long random string yourself (e.g. `openssl rand -hex 32`); it isn't a value Twilio or Dialogflow issue you. The exact same value also goes into Dialogflow ES's Fulfillment settings as a custom header — the two must match exactly. |

No `TWILIO_PHONE_NUMBER` env var — each org's number lives in
`OrgPhoneAgentSettings.twilioPhoneNumber` instead (set via the admin settings
page below), since routing an inbound call to the right org requires a
`To`-number lookup regardless, and one env var can't support more than one org.

## Turning it on for Lindley's Pool & Spa Service

1. `Organization.aiPhoneAgentEnabled` is already `true` for this org in
   production (flipped directly, confirmed test org).
2. Go to **Settings → AI Phone Agent** (`/dashboard/settings/phone-agent`) as
   an admin and fill in:
   - **Twilio number** — the number from your Twilio trial account.
   - **Primary business/owner line** — your own verified phone (trial
     accounts can only call/text verified numbers).
   - Business hours, escalation email(s)/phone(s), greetings — optional but
     recommended before testing so the framing is realistic.
3. In the **Twilio Console**: Phone Numbers → Manage → Active Numbers → click
   your number → under **Voice Configuration**, set "A call comes in" to
   **Webhook**, `https://aquarunner247.com/api/twilio/voice`, **HTTP POST**.
   Save.

That's the only Twilio-side configuration needed — every other step (dial
status, gather, record, transcription) is chained automatically via the
`action`/`transcribeCallback` URLs each response sets, not configured in the
Twilio Console.

## Caller recognition + live status answers

Two pieces, added after the MVP above. Caller-ID matching (against `Property`
phone fields) and the personalized greeting work automatically the moment
this code is deployed — nothing to configure. Live status answers (next
visit / last visit / assigned technician) additionally need one-time setup
in the Dialogflow ES console, since that's where the new intents and the
fulfillment webhook connection live, not in this repo.

1. Generate a secret: `openssl rand -hex 32` (or any long random string from
   a password manager). This is `DIALOGFLOW_WEBHOOK_SECRET` — add it in
   Vercel (Production, and Preview if you test there).
2. In the **Dialogflow ES console** for this agent, go to **Fulfillment**
   (left sidebar):
   - Enable **Webhook**.
   - URL: `https://aquarunner247.com/api/dialogflow/fulfillment`
   - Under **Headers**, add one: key `x-dialogflow-webhook-secret`, value
     the exact same string from step 1.
   - Save.
3. Create three new **Intents** (left sidebar → Intents → Create Intent),
   one at a time:
   - `existing-customer-next-visit` — training phrases like "when's my next
     visit", "when are you coming next", "when is my pool getting serviced".
   - `existing-customer-last-visit` — "has my pool been serviced", "when was
     my last visit", "was someone here yet".
   - `existing-customer-assigned-technician` — "who's my technician", "who
     services my pool", "who's coming out".
   - For each: scroll to **Fulfillment** at the bottom of the intent page and
     turn on **Enable webhook call for this intent**. Leave the intent's own
     "Responses" section empty — the webhook's answer is what gets spoken,
     not a static response.
4. Save each intent. No redeploy of this app is needed for intent changes —
   only for code changes (already deployed as of this write-up).

That's the entire setup. The matching logic (which `Property` a caller's
number resolves to) and the personalized greeting are already live in the
call flow itself, not gated behind any of the above.

## Manual test checklist (run from your verified phone)

1. Call the Twilio number. Confirm it rings your configured primary number
   first, and only falls through to the agent if you don't answer, or you
   decline/let it go to busy.
2. Let it fall through — confirm the greeting matches your configured
   after-hours or busy-overflow text (whichever applies to the current time
   vs. your configured business hours).
3. Press each phone-tree branch (1/2/3/4) on separate test calls — confirm
   each leads to the recording prompt.
4. Leave a message, hang up normally — confirm within a minute or two:
   - The call appears in `/dashboard/phone-agent` with `callStatus:
     COMPLETED`.
   - `aiSummary` and the parsed fields (issue type, urgency, etc.) look
     reasonable for what you said.
   - The escalation email arrived with the right ticket details.
5. Call again and hang up **mid-flow** (during the phone tree, before ever
   reaching the recording prompt) — confirm a `PhoneAgentCall` row still
   exists (`callStatus: IN_PROGRESS`), rather than nothing being recorded.
6. Call again and stay silent through the whole recording until it hits
   max length — confirm it cuts off gracefully and still produces a ticket
   (transcription may come back empty/unclear; confirm the email still
   arrives with "transcription unavailable, listen to the recording"
   framing rather than not sending at all).
7. Set `maxCallsPerDay` to `1` in settings, make two calls back-to-back —
   confirm the second gets the graceful cap-exceeded message instead of
   reaching the phone tree.
8. Confirm every ticket, transcript, and email is scoped to Lindley's Pool &
   Spa Service specifically (there's only one org in production right now,
   so this is mostly a sanity check that `organizationId` shows up
   correctly throughout, not a cross-tenant isolation test).
9. Call from a phone number that's on file for one of your existing
   `Property` records (any of the manager/maintenance/owner phone fields).
   Confirm the greeting says "we recognize the number you're calling from…"
   instead of the normal prompt, and that the resulting call in
   `/dashboard/phone-agent` shows "Recognized: [name] — matched on
   [field]", linking to the right property.
10. Call from that same recognized number and, once the three intents in
    "Caller recognition + live status answers" are set up, ask each of the
    three questions on separate test calls — confirm the spoken answer is
    correct (or a graceful "I don't see..." if there's genuinely nothing
    scheduled/completed/assigned yet) and that the call still falls through
    to the normal recording prompt afterward.
11. Call from an unrecognized number and ask one of the same status
    questions — confirm you get the generic "I'm not able to pull up an
    account for this number" response, never account data for someone else.

## Open items to flag before wider rollout

- **`TWILIO_ACCOUNT_SID` isn't actually read anywhere yet** — the current
  build only ever *receives* webhooks (signature verification only needs the
  auth token) and never makes an outbound Twilio REST API call (e.g. to fetch
  the raw recording audio directly, or to place a call). Add it now anyway so
  it's already there if that changes.
- **Daily-cap check happens once, at the very start of the call** (in
  `voice/route.ts`) — a call already past that point isn't re-checked, so a
  burst of near-simultaneous calls could slightly exceed `maxCallsPerDay`
  before the counter catches up. Not a concern at trial-account call volumes.
- **No stale-`IN_PROGRESS` sweep** (see Deferred above) — worth adding before
  this matters operationally for a real paying org with real call volume.
- **Caller-ID matching scans every `Property` row in the org per fallback
  call** (`lib/phone-agent-flow.ts`'s `findPropertyByCallerNumber`) — fine at
  current org sizes; if an org's property count ever makes this noticeable,
  the fix is a normalized/indexed phone column populated at write time
  (`app/components/phone-input.tsx`, `lib/customer-import.ts`), not a
  rewrite of the matching logic itself.
