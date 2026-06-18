import * as Sentry from "@sentry/nextjs";
import { PostHog } from "posthog-node";

/** Structured JSON log line (machine-parseable for log drains). Never throws. */
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
  } catch {
    // eslint-disable-next-line no-console
    console.log(event);
  }
}

/** Report an error to Sentry (no-op if unconfigured) + structured log. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* sentry not configured */
  }
  logEvent("error", {
    message: error instanceof Error ? error.message : String(error),
    ...context,
  });
}

let _posthog: PostHog | null = null;
function posthog(): PostHog | null {
  if (_posthog) return _posthog;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  _posthog = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
  return _posthog;
}

/** Capture a product/analytics event server-side (no-op if PostHog unconfigured). */
export function trackServer(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  const p = posthog();
  if (!p) return;
  try {
    p.capture({ distinctId, event, properties });
  } catch {
    /* swallow */
  }
}
