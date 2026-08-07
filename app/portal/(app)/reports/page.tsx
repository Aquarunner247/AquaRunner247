import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VISIT_PHOTOS_BUCKET } from "@/lib/visit-photos";

export default async function PortalReportsPage() {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const completedVisits = await prisma.serviceVisit.findMany({
    where: {
      property: { customerId: customerUser.customerId },
      status: "COMPLETED",
      serviceComplete: true,
    },
    orderBy: { completedAt: "desc" },
    take: 50,
    select: {
      id: true,
      completedAt: true,
      techNotes: true,
      property: { select: { name: true } },
      bodyOfWater: { select: { name: true, disinfectionMethod: true } },
      technician: { select: { name: true } },
      reading: { select: { ph: true, freeChlorinePpm: true, brominePpm: true, alkalinityPpm: true, backwashAt: true } },
      doses: { select: { productName: true, quantity: true, unit: true } },
      photos: { select: { id: true, storagePath: true, takenAt: true } },
      checklistCompletions: {
        where: { completed: true },
        select: { label: true },
      },
    },
  });

  const supabaseAdmin = createSupabaseAdminClient();
  const visitsWithPhotoUrls = await Promise.all(
    completedVisits.map(async (v) => {
      const photos = await Promise.all(
        v.photos.map(async (p) => {
          const { data } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).createSignedUrl(p.storagePath, 3600);
          return { id: p.id, url: data?.signedUrl ?? null };
        }),
      );
      return { ...v, photos };
    }),
  );

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-sm font-medium text-brand-ink">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Service reports</h1>
      </header>

      <section className="mt-6 space-y-3">
        {visitsWithPhotoUrls.length === 0 ? (
          <p className="text-sm text-brand-muted">No completed service visits yet.</p>
        ) : (
          visitsWithPhotoUrls.map((v) => (
            <div key={v.id} className="rounded-lg border border-brand-border bg-white p-4 text-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-brand-ink">
                  {v.property.name} — {v.bodyOfWater.name}
                </p>
                <p className="text-xs text-brand-muted">{v.completedAt ? v.completedAt.toLocaleString() : "—"}</p>
              </div>
              <p className="mt-0.5 text-xs text-brand-muted">Technician: {v.technician?.name ?? "—"}</p>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-brand-ink">
                <span>pH: {v.reading?.ph?.toString() ?? "—"}</span>
                <span>
                  {v.bodyOfWater.disinfectionMethod === "BROMINE" ? "Bromine" : "Free chlorine"}:{" "}
                  {(v.bodyOfWater.disinfectionMethod === "BROMINE" ? v.reading?.brominePpm : v.reading?.freeChlorinePpm)?.toString() ?? "—"} ppm
                </span>
                <span>Alkalinity: {v.reading?.alkalinityPpm?.toString() ?? "—"} ppm</span>
                <span>
                  Backwashed:{" "}
                  {v.reading?.backwashAt
                    ? `Yes (${new Date(v.reading.backwashAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})`
                    : "No"}
                </span>
              </div>

              <div className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Chemicals dosed</p>
                {v.doses.length ? (
                  <ul className="mt-0.5 text-brand-ink">
                    {v.doses.map((d, i) => (
                      <li key={i}>
                        {d.productName}: {d.quantity.toString()} {d.unit}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-brand-muted">None logged</p>
                )}
              </div>

              {v.checklistCompletions.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Checklist completed</p>
                  <p className="text-brand-ink">{v.checklistCompletions.map((c) => c.label).join(", ")}</p>
                </div>
              ) : null}

              {v.techNotes ? (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Notes</p>
                  <p className="whitespace-pre-wrap text-brand-ink">{v.techNotes}</p>
                </div>
              ) : null}

              {v.photos.length ? (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Photos</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {v.photos.map((p) =>
                      p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={p.id}
                          src={p.url}
                          alt="Service visit photo"
                          className="h-24 w-24 rounded border border-brand-border object-cover"
                        />
                      ) : null,
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>

      <p className="mt-6 text-xs text-brand-muted">
        <Link href="/portal" className="text-brand-primary underline">
          Back to upcoming service days
        </Link>
      </p>
    </main>
  );
}
