"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  onCapture: (file: File) => void | Promise<void>;
  disabled?: boolean;
};

/**
 * A real getUserMedia video stream, deliberately NOT an
 * `<input type="file" accept="image/*" capture="environment">` picker. `capture` is only
 * an advisory hint per the HTML Media Capture spec -- plenty of browsers/OS combinations
 * still show a "choose from library"/"Files" option alongside "Camera" in the picker it
 * opens, and some (most desktop browsers) ignore it entirely and show a plain file
 * picker. That's a real gap for a compliance photo log that must only ever contain a
 * live-taken photo. A getUserMedia stream has no file picker in the loop at all, so
 * there's structurally no way to select an existing image -- the only output is a frame
 * captured from the live video feed.
 *
 * Requires a secure context (HTTPS, or localhost in dev) -- same requirement production
 * already meets on Vercel.
 */
export function CameraCapture({ onCapture, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function openCamera() {
    setError(null);
    setOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access isn't available in this browser.");
      return;
    }
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
    } catch {
      setError("Camera access was denied or is unavailable. Enable camera permission for this site and try again.");
    }
  }

  function closeCamera() {
    stopStream();
    setOpen(false);
    setError(null);
  }

  async function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current || video.videoWidth === 0) return;
    setCapturing(true);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    setCapturing(false);
    if (!blob) return;
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    stopStream();
    setOpen(false);
    await onCapture(file);
  }

  // Release the camera if the component unmounts mid-capture (e.g. navigating away).
  useEffect(() => stopStream, []);

  return (
    <>
      <button type="button" onClick={() => void openCamera()} disabled={disabled} className="app-btn-primary-sm mt-3">
        Take photo
      </button>

      {open
        ? createPortal(
            // Portaled to document.body rather than rendered in place -- several ancestor
            // cards in this app use .app-card's backdrop-blur-sm, and CSS backdrop-filter
            // establishes a new containing block for `position: fixed` descendants per
            // spec. A fixed dialog left in-tree under one of those cards ends up pinned to
            // that CARD's box instead of the viewport (confirmed while building this --
            // the overlay rendered as a small inline block instead of covering the
            // screen). Portaling to <body> sidesteps the issue regardless of where this
            // component is ever mounted, rather than relying on no ancestor ever using a
            // blur/filter/transform.
            <div className="fixed inset-0 z-50 flex flex-col bg-brand-ink" role="dialog" aria-modal="true" aria-label="Camera">
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-semibold text-white">Take photo</p>
                <button
                  type="button"
                  onClick={closeCamera}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
                >
                  Cancel
                </button>
              </div>

              <div className="relative min-h-0 flex-1 overflow-hidden">
                {error ? (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white">{error}</div>
                ) : (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video ref={videoRef} playsInline autoPlay muted className="h-full w-full object-cover" />
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <div className="flex items-center justify-center px-4 py-6">
                <button
                  type="button"
                  onClick={() => void capture()}
                  disabled={!!error || capturing}
                  aria-label="Capture photo"
                  className="h-16 w-16 shrink-0 rounded-full border-4 border-white bg-white/20 transition active:bg-white/40 disabled:opacity-50"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
