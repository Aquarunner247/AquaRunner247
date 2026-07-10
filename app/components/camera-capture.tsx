"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onCapture: (file: File) => void | Promise<void>;
  disabled?: boolean;
};

export function CameraCapture({ onCapture, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function openCamera() {
    setError(null);
    setReady(false);
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
    } catch {
      setError("Couldn't access the camera. Check that camera permission is allowed for this site.");
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOpen(false);
    setReady(false);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], `visit-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        closeCamera();
        await onCapture(file);
      },
      "image/jpeg",
      0.9,
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openCamera}
        disabled={disabled}
        className="mt-3 rounded-md bg-[#0A5FA4] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Take photo
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[#C9E3EC] bg-black p-2">
      {error ? (
        <div className="p-4 text-center">
          <p className="text-sm text-white">{error}</p>
          <button
            type="button"
            onClick={closeCamera}
            className="mt-3 rounded border border-white/30 px-3 py-1.5 text-sm text-white"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <video ref={videoRef} playsInline muted className="w-full rounded" />
          <div className="mt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={capture}
              disabled={!ready}
              className="rounded-full bg-white p-4 shadow disabled:opacity-50"
              aria-label="Capture photo"
            >
              <span className="block h-6 w-6 rounded-full bg-[#0A5FA4]" />
            </button>
            <button
              type="button"
              onClick={closeCamera}
              className="rounded border border-white/30 px-3 py-2 text-sm text-white"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
