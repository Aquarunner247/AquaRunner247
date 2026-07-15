"use client";

import { useState } from "react";
import Link from "next/link";
import { CameraCapture } from "@/app/components/camera-capture";
import { uploadVisitPhoto } from "@/lib/client/upload-visit-photo";

export type StopBody = {
  visitId: string;
  bodyName: string;
  bodyType: string;
  status: string;
  photoCount: number;
  thumbnails: { id: string; url: string | null }[];
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
      // signed URL next time the page is loaded from the server.
      const localUrl = URL.createObjectURL(file);
      setBodies((prev) =>
        prev.map((b) =>
          b.visitId === visitId
            ? { ...b, photoCount: b.photoCount + 1, thumbnails: [{ id: result.photoId, url: localUrl }, ...b.thumbnails] }
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
          <div key={body.visitId} className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-display)] text-base font-bold text-[#12234A]">{body.bodyName}</p>
                <p className="text-xs text-[#4A6572]">
                  {body.bodyType} · {body.photoCount} photo{body.photoCount === 1 ? "" : "s"} logged
                </p>
              </div>
              <Link href={`/dashboard/visits/${body.visitId}`} className="shrink-0 text-xs font-medium text-[#0A5FA4] underline">
                Open full visit
              </Link>
            </div>

            {body.thumbnails.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {body.thumbnails.slice(0, 6).map((t) =>
                  t.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={t.id} src={t.url} alt="" className="h-16 w-16 rounded border border-[#C9E3EC] object-cover" />
                  ) : null,
                )}
              </div>
            ) : null}

            {errorByVisit[body.visitId] ? (
              <p className="mt-2 text-sm text-[#C1483B]">{errorByVisit[body.visitId]}</p>
            ) : null}

            {!isCompleted ? (
              <CameraCapture
                onCapture={(file) => handleCapture(body.visitId, file)}
                disabled={uploadingId === body.visitId}
              />
            ) : (
              <p className="mt-3 text-xs text-[#4A6572]">This visit is already completed.</p>
            )}
          </div>
        );
      })}

      <p className="text-xs text-[#4A6572]">
        Photos here go straight into each body of water&rsquo;s own visit — {propertyName}&rsquo;s readings, chemical doses,
        and checklist still need to be filled in on each visit&rsquo;s own page before it can be marked complete.
      </p>
    </div>
  );
}
