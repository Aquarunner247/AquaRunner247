import { redirect } from "next/navigation";

// Service reports moved to the portal Dashboard itself (/portal) -- this route stays only
// so any old bookmarks/links still land somewhere real, forwarding the ?date= param along.
export default async function PortalReportsRedirect({ searchParams }: { searchParams?: Promise<{ date?: string }> }) {
  const sp = (await searchParams) ?? {};
  redirect(sp.date ? `/portal?date=${encodeURIComponent(sp.date)}` : "/portal");
}
