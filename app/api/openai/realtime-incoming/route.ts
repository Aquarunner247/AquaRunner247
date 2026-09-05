import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getOpenAiClient } from "@/lib/openai-client";
import { callSidFromConferenceName, findSipHeader, buildRealtimeInstructions, monitorRealtimeCallTranscript } from "@/lib/conversational-ai";

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

  // TEMPORARY diagnostics -- OpenAI support asked whether any follow-up webhook events
  // (e.g. a call-ended event) arrive after realtime.call.incoming, or whether delivery
  // stops after accept(). This endpoint previously discarded every non-incoming event
  // type silently, so there was no way to answer that from existing logs.
  console.error("[conversational AI DEBUG] webhook event received:", event.type, event.id);

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

    const settings = call
      ? await prisma.orgPhoneAgentSettings.findUnique({
          where: { organizationId: call.organizationId },
          select: { serviceTerritoryDescription: true },
        })
      : null;

    await client.realtime.calls.accept(event.data.call_id, {
      type: "realtime",
      model: "gpt-realtime-mini",
      instructions: buildRealtimeInstructions(settings ?? { serviceTerritoryDescription: null }),
      audio: { output: { voice: "marin" } },
    });

    if (call) {
      waitUntil(monitorRealtimeCallTranscript(call.id, event.data.call_id, client));
    }
  } catch (err) {
    // If accept() fails, OpenAI's own SIP fallback (busy/decline) takes over on its
    // side -- nothing more this webhook can do once verification has already passed.
    console.error("[conversational AI] failed to accept realtime call:", err);
  }

  return NextResponse.json({ received: true });
}
