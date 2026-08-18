"use client";

import { useState } from "react";
import Link from "next/link";
import { CameraCapture } from "@/app/components/camera-capture";
import { uploadVisitPhoto } from "@/lib/client/upload-visit-photo";
import { PhotoThumbnail } from "@/app/components/photo-thumbnail";

export type StopBody = {
  visitId: string;
  bodyName: string;
  bodyType: string;
  status: string;
  photoCount: number;
  thumbnails: { id: string; url: string | null; pending?: boolean }[];
};

type Props = {
  propertyName: string;
  bodies: StopBody[];
};

export function StopCapture({ propertyName, bodies: initialBodies }: Props) {
  const [bodies, setBodies] = useState(initialBodies);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [errorByVisit, setErrorByVisit] = useState<Record<string, string>>({});

  async function handleCapture(visitId: string, file: File) {
    setUploadingId(visitId);
    setErrorByVisit((prev) => ({ ...prev, [visitId]: "" }));
    try {
      const result = await uploadVisitPhoto(visitId, file);
      if (!result.ok) {
        setErrorByVisit((prev) => ({ ...prev, [visitId]: result.error }));
        return;
      }
      // Show the freshly taken photo immediately as a local preview — it'll get a real
      // signed URL next time the page is loaded from the server. If offline, the upload
      // itself is queued (see uploadVisitPhoto), so there's no real photoId yet.
      const localUrl = URL.createObjectURL(file);
      const queued = "queued" in result;
      const id = queued ? `pending-${Date.now()}` : (result as { photoId: string }).photoId;
      setBodies((prev) =>
        prev.map((b) =>
          b.visitId === visitId
            ? { ...b, photoCount: b.photoCount + 1, thumbnails: [{ id, url: localUrl, pending: queued }, ...b.thumbnails] }
            : b,
        ),
      );
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {bodies.map((body) => {
        const isCompleted = body.status === "COMPLETED";
        return (
          <div key={body.visitId} className="rounded-lg border border-brand-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-display)] text-base font-bold text-brand-ink">{body.bodyName}</p>
                <p className="text-xs text-brand-muted">
                  {body.bodyType} · {body.photoCount} photo{body.photoCount === 1 ? "" : "s"} logged
                </p>
              </div>
              <Link href={`/dashboard/visits/${body.visitId}`} className="shrink-0 text-xs font-medium text-brand-primary underline">
                Open full visit
              </Link>
            </div>

            {body.thumbnails.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {body.thumbnails.slice(0, 6).map((t) =>
                  t.url ? (
                    <div key={t.id} className="relative">
                      <PhotoThumbnail src={t.url} alt="Visit photo" className="h-16 w-16 rounded border border-brand-border object-cover" />
                      {t.pending ? (
                        <span className="absolute -right-1 -top-1 rounded-full bg-brand-warn px-1.5 py-0.5 text-[9px] font-bold text-white">
                          sync
                        </span>
                      ) : null}
                    </div>
                  ) : null,
                )}
              </div>
            ) : null}

            {errorByVisit[body.visitId] ? (
              <p className="mt-2 text-sm text-brand-danger">{errorByVisit[body.visitId]}</p>
            ) : null}

            {!isCompleted ? (
              <CameraCapture
                onCapture={(file) => handleCapture(body.visitId, file)}
                disabled={uploadingId === body.visitId}
              />
            ) : (
              <p className="mt-3 text-xs text-brand-muted">This visit is already completed.</p>
            )}
          </div>
        );
      })}

      <p className="text-xs text-brand-muted">
        Photos here go straight into each body of water&rsquo;s own visit — {propertyName}&rsquo;s readings, chemical doses,
        and checklist still need to be filled in on each visit&rsquo;s own page before it can be marked complete.
      </p>
    </div>
  );
}
