import { generateObject } from "ai";
import { z } from "zod";
import type { PhoneAgentIssueType } from "@/generated/prisma/client";

const ALL_ISSUE_TYPES = ["EQUIPMENT_FAILURE", "CHEMICAL_WATER_QUALITY", "LEAK", "NO_SHOW_COMPLAINT", "BILLING", "OTHER"] as const;
const URGENCY_LEVELS = ["ROUTINE", "SAME_DAY", "EMERGENCY"] as const;

/** Cheap, fast, good at structured extraction -- via Vercel AI Gateway (plain
 * "provider/model" string; resolves automatically via Vercel's OIDC token in
 * production, needs AI_GATEWAY_API_KEY for local dev). Trivially swappable. */
const MODEL = "openai/gpt-4o-mini";

function schemaFor(allowedIssueTypes: PhoneAgentIssueType[]) {
  // Structurally constrains the model to the org's own configured issue types (falling
  // back to the full set if the org hasn't configured any yet) rather than only
  // mentioning the constraint in the prompt -- OTHER is always a valid fallback bucket
  // even if an org didn't explicitly allow it.
  const allowed = new Set<string>(allowedIssueTypes.length > 0 ? allowedIssueTypes : ALL_ISSUE_TYPES);
  allowed.add("OTHER");
  const issueTypeValues = Array.from(allowed) as [string, ...string[]];

  return z.object({
    callerName: z.string().nullable().describe("The caller's name, if they gave one."),
    /** Only set when the caller explicitly states a different callback number than the
     * one they're calling from -- the call's actual Caller ID is already known
     * separately (PhoneAgentCall.callerNumber, captured by Twilio), so this stays null
     * in the common case where no other number was mentioned. */
    callerCallbackNumber: z.string().nullable().describe("A callback number ONLY if explicitly different from the number they're calling from."),
    propertyAddress: z.string().nullable().describe("The property/service address, if mentioned."),
    issueType: z.enum(issueTypeValues).describe("Best-fit category for the issue described."),
    urgency: z
      .enum(URGENCY_LEVELS)
      .describe(
        "EMERGENCY only for an immediate safety/property risk (active flooding leak, exposed electrical hazard, etc). SAME_DAY for urgent but not an emergency. ROUTINE otherwise.",
      ),
    requestedCallbackTime: z.string().nullable().describe("When the caller asked to be called back, in their own words, if stated."),
    summary: z.string().describe("One-paragraph summary of the call for a technician to read before calling back."),
  });
}

export type ParsedIntake = z.infer<ReturnType<typeof schemaFor>>;

/**
 * Turns a raw voicemail transcript into the structured ticket fields
 * PhoneAgentCall stores. Never called with an empty/near-empty transcript by
 * its caller (recording/route.ts) -- an unusably short recording should be
 * handled there rather than spending a model call on it.
 *
 * `model` defaults to the real AI Gateway model and is only ever overridden in tests
 * (a MockLanguageModel from ai/test), so production call sites never need to pass it.
 */
export async function parseCallTranscript(
  transcript: string,
  allowedIssueTypes: PhoneAgentIssueType[],
  model: Parameters<typeof generateObject>[0]["model"] = MODEL,
): Promise<ParsedIntake> {
  const { object } = await generateObject({
    model,
    schema: schemaFor(allowedIssueTypes),
    prompt: [
      "You are triaging a voicemail left with a pool-service company's after-hours/overflow phone line.",
      "Extract the fields below from the caller's transcript. If a field genuinely wasn't mentioned, use null rather than guessing or inventing a plausible-sounding value.",
      "",
      "Transcript:",
      '"""',
      transcript,
      '"""',
    ].join("\n"),
  });
  return object;
}
