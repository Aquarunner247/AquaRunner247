"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  onCapture: (file: File) => void | Promise<void>;
  disabled?: boolean;
};

/** Below this Laplacian-variance score (computed on a downscaled grayscale copy of the
 * capture) a photo is flagged as likely blurry. A heuristic, not a hard rule -- scene
 * content affects the score too (e.g. a plain pool deck has fewer edges than a busy
 * equipment pad), so this only ever warns, never blocks; "Use anyway" is always one tap
 * away. Worth revisiting after real-world use if it's flagging too many good photos. */
const BLUR_VARIANCE_THRESHOLD = 40;
const ANALYSIS_WIDTH = 200;

/** Laplacian-variance sharpness score of a captured frame: downscales to a small analysis
 * canvas (blur detection doesn't need full resolution, and this keeps the convolution
 * trivially fast), converts to grayscale, convolves with a 3x3 edge-detection kernel, and
 * returns the variance of the result -- a photo with few/soft edges (blurry) scores low,
 * one with lots of crisp edges (sharp) scores high. Returns null if analysis fails for any
 * reason (e.g. canvas API unavailable) so callers can just skip the blur check entirely
 * rather than block a real capture on a heuristic that couldn't run.
 */
function computeBlurScore(source: HTMLCanvasElement): number | null {
  try {
    const scale = ANALYSIS_WIDTH / source.width;
    const height = Math.max(1, Math.round(source.height * scale));
    const small = document.createElement("canvas");
    small.width = ANALYSIS_WIDTH;
    small.height = height;
    const ctx = small.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, ANALYSIS_WIDTH, height);
    const { data } = ctx.getImageData(0, 0, ANALYSIS_WIDTH, height);

    const width = ANALYSIS_WIDTH;
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - width] - gray[idx + width];
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }
    if (count === 0) return null;
    const mean = sum / count;
    return sumSq / count - mean * mean;
  } catch {
    return null;
  }
}

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
  const [preview, setPreview] = useState<{ dataUrl: string; isLikelyBlurry: boolean } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function openCamera() {
    setError(null);
    setPreview(null);
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
    setPreview(null);
  }

  /** Draws the current frame and shows a review step (with a blur warning if it looks
   * soft) instead of submitting immediately -- the stream stays alive so "Retake" is
   * instant, no re-requesting camera permission. */
  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current || video.videoWidth === 0) return;
    setCapturing(true);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blurScore = computeBlurScore(canvas);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturing(false);
    setPreview({ dataUrl, isLikelyBlurry: blurScore != null && blurScore < BLUR_VARIANCE_THRESHOLD });
  }

  function retake() {
    setPreview(null);
  }

  async function confirmPhoto() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    stopStream();
    setOpen(false);
    setPreview(null);
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
                <p className="text-sm font-semibold text-white">{preview ? "Review photo" : "Take photo"}</p>
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
                ) : preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.dataUrl} alt="Captured preview" className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video ref={videoRef} playsInline autoPlay muted className="h-full w-full object-cover" />
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {preview?.isLikelyBlurry ? (
                <div className="mx-4 mb-3 rounded-lg border border-brand-warn/40 bg-brand-warnFill px-3 py-2 text-center text-sm font-medium text-brand-warn">
                  This looks blurry — retake for a clearer shot?
                </div>
              ) : null}

              <div className="flex items-center justify-center gap-4 px-4 py-6">
                {preview ? (
                  <>
                    <button type="button" onClick={retake} className="app-btn-secondary-sm">
                      Retake
                    </button>
                    <button type="button" onClick={() => void confirmPhoto()} className="app-btn-primary-sm">
                      {preview.isLikelyBlurry ? "Use anyway" : "Use photo"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={capture}
                    disabled={!!error || capturing}
                    aria-label="Capture photo"
                    className="h-16 w-16 shrink-0 rounded-full border-4 border-white bg-white/20 transition active:bg-white/40 disabled:opacity-50"
                  />
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
