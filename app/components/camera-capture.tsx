"use client";

import { useRef, type ChangeEvent } from "react";

type Props = {
  onCapture: (file: File) => void | Promise<void>;
  disabled?: boolean;
};

/**
 * Uses the OS's native camera UI (via `capture="environment"`) instead of a custom
 * getUserMedia preview so techs get real pinch-zoom, tap-to-focus, and a full-screen
 * viewfinder. `capture` makes mobile browsers open the camera directly rather than the
 * photo gallery, so this still enforces live-only capture.
 */
export function CameraCapture({ onCapture, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await onCapture(file);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="app-btn-primary-sm mt-3"
      >
        Take photo
      </button>
    </>
  );
}
