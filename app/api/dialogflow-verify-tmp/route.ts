import { NextResponse } from "next/server";
import { detectIntent } from "@/lib/dialogflow";

/** Temporary verification route -- confirms Dialogflow WIF still works in production
 * after tightening the GCP attribute condition to production-only and deleting the old
 * service account key. Delete once confirmed working. */
export async function GET() {
  const result = await detectIntent(`wif-verify-prod-${Date.now()}`, "I need service for my pool");
  return NextResponse.json({ result });
}
