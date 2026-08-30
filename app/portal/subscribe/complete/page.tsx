import { redirect } from "next/navigation";
import { completeCompliancePlan } from "../actions";

type PageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

/** No form here -- unlike /signup/complete, this flow needs no password step (it reuses
 * the customer's existing Supabase Auth session), so the completion runs directly on
 * render and redirects on to /cpo. */
export default async function PortalSubscribeCompletePage({ searchParams }: PageProps) {
  const { session_id: sessionId } = await searchParams;
  if (!sessionId) redirect("/portal/subscribe?error=server-error");

  await completeCompliancePlan(sessionId);
}
