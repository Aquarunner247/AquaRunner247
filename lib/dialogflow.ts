import { GoogleAuth } from "google-auth-library";
import type { PhoneAgentPhoneTreeSelection } from "@/generated/prisma/client";

/**
 * Dialogflow ES's `detectIntent` REST API, called once per turn from the phone-tree
 * <Gather> step -- not the full gRPC client library (@google-cloud/dialogflow), which
 * bundles native/gRPC dependencies that don't play well with Vercel's serverless runtime.
 * google-auth-library alone is enough to mint an access token from the service account
 * key and call the plain REST endpoint with fetch().
 */

const INTENT_TO_SELECTION: Record<string, PhoneAgentPhoneTreeSelection> = {
  "new-service-request": "NEW_REQUEST",
  "existing-customer-question": "EXISTING_CUSTOMER",
  emergency: "URGENT",
  "leave-message": "MESSAGE",
};

export type DetectIntentResult = {
  selection: PhoneAgentPhoneTreeSelection | null;
  fulfillmentText: string | null;
};

let cachedAuth: GoogleAuth | null = null;

function getAuth(): GoogleAuth | null {
  if (cachedAuth) return cachedAuth;
  const base64 = process.env.DIALOGFLOW_SERVICE_ACCOUNT_BASE64;
  if (!base64) return null;
  const credentials = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  cachedAuth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/dialogflow"] });
  return cachedAuth;
}

/**
 * Sends one turn of caller speech to the Dialogflow ES agent and maps the recognized
 * intent back to our existing phone-tree selection. Returns null (not a thrown error) on
 * any failure -- missing credentials, network error, no intent match, low confidence, or
 * the Default Fallback Intent -- so the caller in gather/route.ts can fall back to the
 * same "no digit pressed" MESSAGE default the DTMF path already uses, never a broken call.
 */
export async function detectIntent(sessionId: string, speechText: string): Promise<DetectIntentResult | null> {
  const projectId = process.env.DIALOGFLOW_PROJECT_ID;
  const auth = getAuth();
  if (!projectId || !auth || !speechText.trim()) return null;

  try {
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) return null;

    const url = `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/sessions/${encodeURIComponent(sessionId)}:detectIntent`;
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ queryInput: { text: { text: speechText, languageCode: "en-US" } } }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      queryResult?: { intent?: { displayName?: string; isFallback?: boolean }; fulfillmentText?: string };
    };
    const queryResult = data.queryResult;
    const intentName = queryResult?.intent?.displayName;
    const isFallback = Boolean(queryResult?.intent?.isFallback);
    const selection = !isFallback && intentName ? (INTENT_TO_SELECTION[intentName] ?? null) : null;

    return { selection, fulfillmentText: queryResult?.fulfillmentText?.trim() || null };
  } catch (err) {
    console.error("[phone agent] Dialogflow detectIntent failed:", err);
    return null;
  }
}
