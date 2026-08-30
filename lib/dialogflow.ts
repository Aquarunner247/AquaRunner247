import { ExternalAccountClient, GoogleAuth } from "google-auth-library";
import type { PhoneAgentPhoneTreeSelection } from "@/generated/prisma/client";

/**
 * Dialogflow ES's `detectIntent` REST API, called once per turn from the phone-tree
 * <Gather> step -- not the full gRPC client library (@google-cloud/dialogflow), which
 * bundles native/gRPC dependencies that don't play well with Vercel's serverless runtime.
 * google-auth-library alone is enough to mint an access token and call the plain REST
 * endpoint with fetch().
 *
 * Authenticates via Workload Identity Federation (Vercel's own OIDC token, injected as
 * VERCEL_OIDC_TOKEN on every deployment) rather than a long-lived service account key --
 * no DIALOGFLOW_SERVICE_ACCOUNT_BASE64 secret to rotate/leak. The Google Cloud side: a
 * Workload Identity Pool ("vercel-pool") with an OIDC provider ("vercel-provider")
 * trusting https://oidc.vercel.com/aquarunner247s-projects, scoped via an attribute
 * condition to this specific Vercel project + production environment only, granted
 * Workload Identity User on the aquarunner-phone-agent service account (which still
 * separately holds its own Dialogflow API Client role, unchanged).
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

const GCP_PROJECT_NUMBER = "1078040821930";
const WORKLOAD_IDENTITY_POOL_ID = "vercel-pool";
const WORKLOAD_IDENTITY_PROVIDER_ID = "vercel-provider";
const DIALOGFLOW_SERVICE_ACCOUNT_EMAIL = "aquarunner-phone-agent@aquarunner-bxtf.iam.gserviceaccount.com";

let cachedAuth: GoogleAuth | null = null;

function getAuth(): GoogleAuth | null {
  if (cachedAuth) return cachedAuth;

  const externalClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WORKLOAD_IDENTITY_POOL_ID}/providers/${WORKLOAD_IDENTITY_PROVIDER_ID}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${DIALOGFLOW_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: {
      // Vercel injects this per deployment -- not read from a file or fetched over the
      // network, just handed straight to the token exchange (see google-auth-library's
      // SubjectTokenSupplier interface, added in v9 for exactly this "already have the
      // token in-process" case).
      getSubjectToken: async () => {
        const token = process.env.VERCEL_OIDC_TOKEN;
        if (!token) throw new Error("VERCEL_OIDC_TOKEN is not set");
        return token;
      },
    },
  });
  if (!externalClient) return null;

  cachedAuth = new GoogleAuth({ authClient: externalClient, scopes: ["https://www.googleapis.com/auth/dialogflow"] });
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
