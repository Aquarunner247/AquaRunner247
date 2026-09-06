import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getOpenAiClient } from "@/lib/openai-client";
import {
  callSidFromConferenceName,
  findSipHeader,
  buildRealtimeInstructions,
  monitorRealtimeCallTranscript,
  REALTIME_STATUS_TOOLS,
} from "@/lib/conversational-ai";

export const runtime = "nodejs";
// Pro-tier maximum -- keeps the background transcript-monitoring connection (started via
// waitUntil below) alive for as long as Vercel allows. Calls that run longer than this
// still complete normally (audio flows Twilio<->OpenAI directly, not through this
// function) -- only transcript capture stops at that point. See
// phone-agent-setup.md's Open Items.
export const maxDuration = 800;

/**
 * OpenAI's realtime.call.incoming webhook -- fires when the SIP invite from
 * conference-join/route.ts's participant-add reaches OpenAI's Realtime SIP endpoint.
 * Verified via the official SDK's client.webhooks.unwrap (same shared-secret-signature
 * shape as Stripe's webhooks.constructEvent, which this codebase already uses at
 * app/api/stripe/webhook/route.ts), not a bare custom header -- OpenAI ships this
 * verification helper itself, no need to hand-roll it the way lib/dialogflow-verify.ts
 * had to for Dialogflow, which has no equivalent.
 *
 * The conference name (and, from it, which PhoneAgentCall/org this call belongs to) is
 * recovered from the X-conferenceName SIP header Twilio attached from the SIP URI's
 * query param (see lib/conversational-ai.ts's openaiSipUri) -- this webhook has no other
 * way to know which call this is.
 */
export async function POST(req: Request) {
  const client = getOpenAiClient();
  const webhookSecret = process.env.OPENAI_WEBHOOK_SECRET;
  if (!client || !webhookSecret) {
    return new NextResponse(null, { status: 403 });
  }

  const payload = await req.text();

  let event;
  try {
    event = await client.webhooks.unwrap(payload, req.headers, webhookSecret);
  } catch (err) {
    console.error("[conversational AI] OpenAI webhook signature verification failed:", err);
    return new NextResponse(null, { status: 400 });
  }

  if (event.type !== "realtime.call.incoming") {
    // Not a call we handle here (batch/eval/fine-tuning webhooks share this same
    // endpoint contract in principle, but this app only registers this URL for
    // realtime.call.incoming) -- acknowledge and ignore.
    return NextResponse.json({ received: true });
  }

  try {
    const conferenceName = findSipHeader(event.data.sip_headers, "X-conferenceName");
    const callSid = conferenceName ? callSidFromConferenceName(conferenceName) : null;
    const call = callSid ? await prisma.phoneAgentCall.findUnique({ where: { twilioCallSid: callSid } }) : null;

    const [settings, organization] = call
      ? await Promise.all([
          prisma.orgPhoneAgentSettings.findUnique({
            where: { organizationId: call.organizationId },
            select: { serviceTerritoryDescription: true, businessHours: true, allowedIssueTypes: true },
          }),
          prisma.organization.findUnique({
            where: { id: call.organizationId },
            select: { name: true, businessName: true },
          }),
        ])
      : [null, null];
    const hasAccountTools = call?.matchedPropertyId != null;
    const organizationName = organization?.businessName ?? organization?.name ?? null;

    await client.realtime.calls.accept(event.data.call_id, {
      type: "realtime",
      model: "gpt-realtime-mini",
      instructions: buildRealtimeInstructions(
        settings ?? { serviceTerritoryDescription: null, businessHours: null, allowedIssueTypes: [] },
        hasAccountTools,
        organizationName,
      ),
      // near_field noise reduction + a slightly raised VAD threshold: both run before
      // anything decides whether to respond, so unlike create_response (see the revert
      // this replaces -- git blame this line) they can't cause the model to go silent for
      // the rest of a call if something about them doesn't behave as expected. Aimed at
      // the "she said something weird before mentioning the business" report -- a caller
      // picking up a landline/mobile handset is close-talking (near_field), not a
      // room/conference mic (far_field), and threshold 0.6 (default 0.5) asks for
      // somewhat louder audio before treating it as speech, both cutting down on
      // background noise/line static getting misread as a caller talking. Doesn't fully
      // eliminate the race if the caller says real words before the forced greeting
      // fires -- that's a genuine ordering problem noise filtering can't touch, still
      // open in phone-agent-setup.md.
      audio: {
        input: { noise_reduction: { type: "near_field" }, turn_detection: { type: "server_vad", threshold: 0.6 } },
        output: { voice: "marin" },
      },
      tools: hasAccountTools ? REALTIME_STATUS_TOOLS : undefined,
    });

    if (call) {
      waitUntil(monitorRealtimeCallTranscript(call, event.data.call_id, client));
    }
  } catch (err) {
    // If accept() fails, OpenAI's own SIP fallback (busy/decline) takes over on its
    // side -- nothing more this webhook can do once verification has already passed.
    console.error("[conversational AI] failed to accept realtime call:", err);
  }

  return NextResponse.json({ received: true });
}
