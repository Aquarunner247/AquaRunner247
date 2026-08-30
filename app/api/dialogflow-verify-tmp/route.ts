import { NextResponse } from "next/server";
import { detectIntent } from "@/lib/dialogflow";

/** Temporary verification route for the Workload Identity Federation cutover in
 * lib/dialogflow.ts -- confirms the ExternalAccountClient can actually mint a token and
 * reach Dialogflow before this ships to production. Delete once confirmed working, same
 * as the earlier Sentry verification route this pattern is copied from. */
export async function GET() {
  const result = await detectIntent(`wif-verify-${Date.now()}`, "I need service for my pool");
  return NextResponse.json({ result });
}
