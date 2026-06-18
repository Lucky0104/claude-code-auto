"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      Sentry.captureException(error);
    } catch {
      /* sentry not configured */
    }
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ fontWeight: 800 }}>Something went wrong</h2>
          <p style={{ color: "#666" }}>An unexpected error occurred.</p>
          <button
            onClick={() => reset()}
            style={{ marginTop: 12, padding: "8px 16px", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
