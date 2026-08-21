"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-brand-surface px-6">
        <div className="app-card max-w-sm text-center">
          <p className="app-h1 text-xl">Something went wrong</p>
          <p className="mt-2 text-sm text-brand-muted">
            We&rsquo;ve been notified and are looking into it. Try again, or reload the page.
          </p>
          <button type="button" onClick={reset} className="app-btn-primary-sm mt-4">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
