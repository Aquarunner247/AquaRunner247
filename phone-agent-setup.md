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

**Also built**: real-time conversational AI voice (per-org opt-in via
`OrgPhoneAgentSettings.conversationalAiEnabled`, off by default) — see
"Conversational AI mode" below for what it is, its real limitations, and setup.

**Explicitly deferred** (per the original spec, not started):
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
| `TWILIO_ACCOUNT_SID` | `lib/twilio-client.ts` — the outbound REST client | **Required.** Paired with the API Key below to construct the REST client used for adding OpenAI's Realtime SIP endpoint as a conference participant. |
| `TWILIO_AUTH_TOKEN` | `lib/twilio-verify.ts` — every `/api/twilio/*` webhook signature check | **Required.** Without it every webhook returns 403 unconditionally. Used *only* for inbound signature verification — outbound REST calls (`lib/twilio-client.ts`) use `TWILIO_API_KEY_SID`/`TWILIO_API_KEY_SECRET` instead, not this token. |
| `TWILIO_API_KEY_SID` | `lib/twilio-client.ts` — the outbound REST client (adding OpenAI's Realtime SIP endpoint as a conference participant) | **Required** for Conversation mode's conference-join step. Created in Twilio Console → Account → API keys & tokens (choose "Standard", not "Main"). Scoped credential, separate from `TWILIO_AUTH_TOKEN` on purpose — see the row above. |
| `TWILIO_API_KEY_SECRET` | `lib/twilio-client.ts` | **Required** alongside `TWILIO_API_KEY_SID`. Shown once at creation in the Twilio Console — save it somewhere durable, it can't be retrieved again. If either this or `TWILIO_API_KEY_SID` is missing, `getTwilioClient()` returns `null` silently and `conference-join/route.ts` just logs an error and no-ops — Conversation mode calls will fall through to no AI participant being added, not an obvious crash. |
| `AI_GATEWAY_API_KEY` | `lib/phone-agent-intake.ts` | Only needed for **local dev**. In production on Vercel, the AI Gateway resolves automatically via Vercel's own OIDC token — no key needed there |
| `DIALOGFLOW_PROJECT_ID` | `lib/dialogflow.ts` | Already set in production. Without it, spoken intent classification silently no-ops on every call (falls back to "leave a message" every time). |
| `DIALOGFLOW_WEBHOOK_SECRET` | `lib/dialogflow-verify.ts` — checked on every `/api/dialogflow/fulfillment` request | **Required** for live status answers (see "Caller recognition + live status answers" below). Generate any long random string yourself (e.g. `openssl rand -hex 32`); it isn't a value Twilio or Dialogflow issue you. The exact same value also goes into Dialogflow ES's Fulfillment settings as a custom header — the two must match exactly. |
| `OPENAI_API_KEY` | `lib/openai-client.ts` — accepting/monitoring conversational-AI calls | **Required** for any org with Conversation mode turned on. A standard OpenAI API key, used directly (not via Vercel's AI Gateway — the Realtime SIP accept/webhook-verify calls are OpenAI-specific control-plane APIs, not a text-generation call the Gateway's provider abstraction covers). |
| `OPENAI_PROJECT_ID` | `lib/conversational-ai.ts`'s `openaiSipUri` | The project ID used in the SIP URI Twilio dials (`sip:{OPENAI_PROJECT_ID}@sip.api.openai.com`). From the OpenAI dashboard's Realtime SIP setup. |
| `OPENAI_WEBHOOK_SECRET` | `app/api/openai/realtime-incoming/route.ts`, verified via the official `openai` SDK's `client.webhooks.unwrap()` | **Required** for Conversation mode. Generated in the OpenAI dashboard when you register the webhook endpoint (not something you invent yourself, unlike the Dialogflow one above). |

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

## Conversational AI mode

**Status as of this writing: built, but calls do not yet connect.** Every
test call reaches the point of dialing OpenAI's Realtime SIP endpoint, then
fails immediately (0-duration) with a SIP 400 from OpenAI's own gateway,
surfaced by Twilio as error 13224. Five independent causes were ruled out on
our side (caller's own number as `from`, `callToken`, trial-vs-upgraded
Twilio account, no Elastic SIP Trunk resource existing, the `?X-conferenceName=`
header suffix on the SIP URI) — the failure persists identically regardless.
An OpenAI community thread describes the same symptom (immediate SIP 400,
0-duration) traced to OpenAI's own gateway, not the caller's Twilio
configuration. **Next step is confirming with OpenAI directly** (support
ticket or their community forum, citing `OPENAI_PROJECT_ID` and a failed
call's timestamp) whether Realtime SIP is fully provisioned for this
project — do not assume this works end-to-end until a real call connects.

Replaces the scripted phone tree + recorded voicemail with a live, real-time
conversation (OpenAI's `gpt-realtime-mini`), for whichever org turns on
**Settings → AI Phone Agent → Conversation mode**. Off by default per org.

**Real limitations to accept before turning this on**:
- **Cost is meaningfully higher** — roughly $0.03–0.06/min all-in versus
  ~$0.01/min for the scripted phone tree. Review `maxMinutesPerDay` before
  enabling; that cap now has real cost weight behind it.
- **No post-call transcript endpoint exists on OpenAI's side** (confirmed
  during planning — it's an open community feature request, not shipped).
  This app captures a transcript by keeping a background connection open for
  the call's duration and accumulating events live
  (`lib/conversational-ai.ts`'s `monitorRealtimeCallTranscript`) — if a call
  runs past the hosting function's max duration (`maxDuration = 800` on
  `app/api/openai/realtime-incoming/route.ts`, ~13 minutes), the call itself
  keeps going (audio flows directly Twilio ↔ OpenAI, never through this app)
  but transcript capture stops at that point.
- **Caller-side audio transcription over SIP has documented reliability
  gaps** in OpenAI's own community reports (the model's own responses
  transcribe reliably; the caller's speech sometimes doesn't). Mitigated by
  recording the Twilio conference itself (`record: "record-from-start"` on
  the `<Conference>` TwiML) as a fallback — same "listen to the recording"
  safety net the scripted-voicemail path already relies on when
  transcription comes back empty.

**Setup**:
1. In the OpenAI dashboard, set up a Realtime SIP project and note its
   project ID (`OPENAI_PROJECT_ID`).
2. Register a webhook endpoint pointed at
   `https://aquarunner247.com/api/openai/realtime-incoming`, subscribed to
   `realtime.call.incoming` — this generates `OPENAI_WEBHOOK_SECRET` for you.
3. Add `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `OPENAI_WEBHOOK_SECRET` to
   Vercel.
4. Turn on Conversation mode for the org in Settings → AI Phone Agent.

No Twilio Elastic SIP Trunk needed — the integration adds OpenAI's Realtime
SIP endpoint as a Twilio Conference participant per-call, via the REST API
(`app/api/twilio/voice/conference-join/route.ts`), triggered only on the
same no-answer/busy/failed fallback that already exists — every other org's
calls, and every call for an org with Conversation mode off, are completely
unaffected.

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
12. With Conversation mode on: let the primary line go unanswered and confirm
    you land in a live back-and-forth conversation (not the phone tree), have
    a real exchange, then hang up — confirm within a minute or two a
    `PhoneAgentCall` row shows `callStatus: COMPLETED` with a transcript and
    `aiSummary`, and the escalation email arrived.
13. With Conversation mode on, deliberately keep a call going past ~13
    minutes — confirm the call itself continues uninterrupted, and document
    what actually happens to the transcript/ticket once the monitoring
    connection's function times out.
14. Confirm a call for an org with Conversation mode **off** is completely
    unaffected — falls through to the scripted phone tree exactly as before.

## Open items to flag before wider rollout

- **Twilio REST calls now use a scoped API Key, not the Auth Token** —
  `lib/twilio-client.ts` reads `TWILIO_API_KEY_SID`/`TWILIO_API_KEY_SECRET`
  (paired with `TWILIO_ACCOUNT_SID`) instead of `TWILIO_AUTH_TOKEN`, which is
  now reserved for webhook signature verification only (see the env var
  table above). If either API Key value is missing or revoked,
  `getTwilioClient()` returns `null` silently — `conference-join/route.ts`
  logs an error and no-ops, so a call falls through to no AI participant
  being added rather than an obvious crash. No alerting exists on this yet,
  same gap as the cost-alerting item below.
- **Conversation mode's session config is intentionally minimal** — the
  accept-webhook (`app/api/openai/realtime-incoming/route.ts`) only sets
  `model`, `instructions`, and `audio.output.voice`. Turn-detection/VAD
  tuning, tool/function calling for the agent (e.g. a live "check next visit"
  tool instead of ending the call to look it up), and any explicit audio
  format field were left at OpenAI's defaults rather than guessed — worth
  reviewing against OpenAI's current Realtime docs if the default VAD
  behavior feels off on a real call (e.g. cutting callers off mid-sentence).
- **No per-org cost alerting on the new, higher conversational-AI rate** —
  `maxMinutesPerDay` caps total minutes but nothing surfaces actual spend.
  Worth adding before recommending this mode to a real paying org.
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
