import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyDialogflowWebhookSecret } from "@/lib/dialogflow-verify";
import { buildStatusAnswer, isStatusIntent, FALLBACK_STATUS_TEXT } from "@/lib/phone-agent-status";

export const runtime = "nodejs";

/**
 * Dialogflow ES webhook fulfillment. Deliberately separate from everything under
 * /api/twilio/* -- this is a distinct trust boundary (Google's Dialogflow servers
 * calling into us, not Twilio) verified by a distinct mechanism (a shared-secret header,
 * see lib/dialogflow-verify.ts, since Dialogflow has no signature scheme like Twilio's).
 *
 * Only ever called for intents with "Enable webhook call for this intent" turned on in
 * the Dialogflow console (existing-customer-next-visit / -last-visit /
 * -assigned-technician). The `session` field's trailing path segment is the Twilio
 * CallSid this app itself passed as the session id in lib/dialogflow.ts's detectIntent
 * call -- that's how a live status answer gets scoped back to the right in-progress call
 * (and, through it, the right organization and Caller-ID-matched property).
 */
export async function POST(req: Request) {
  if (!verifyDialogflowWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const displayName: string | undefined = body?.queryResult?.intent?.displayName;
    const session: string | undefined = body?.session;
    const callSid = session?.split("/sessions/").at(-1);

    if (!displayName || !callSid || !isStatusIntent(displayName)) {
      return NextResponse.json({ fulfillmentText: FALLBACK_STATUS_TEXT });
    }

    const call = await prisma.phoneAgentCall.findUnique({
      where: { twilioCallSid: callSid },
      select: { organizationId: true, matchedPropertyId: true },
    });
    if (!call) {
      return NextResponse.json({ fulfillmentText: FALLBACK_STATUS_TEXT });
    }

    const fulfillmentText = await buildStatusAnswer(displayName, call);
    return NextResponse.json({ fulfillmentText });
  } catch (err) {
    // Never let a malformed request or an app-side error break the call -- Dialogflow
    // (and the caller listening on the other end) always gets a spoken response.
    console.error("[dialogflow fulfillment] error handling request:", err);
    return NextResponse.json({ fulfillmentText: FALLBACK_STATUS_TEXT });
  }
}
