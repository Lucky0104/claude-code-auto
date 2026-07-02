import { PostHog } from 'posthog-node';

let _posthog: PostHog | null = null;

export function getPostHog(): PostHog | null {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;
  if (!_posthog) {
    _posthog = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _posthog;
}

/** Fire-and-forget server-side event. Never throws. */
export function track(
  event: string,
  properties: Record<string, unknown>,
  distinctId = 'server'
) {
  try {
    getPostHog()?.capture({ distinctId, event, properties });
  } catch {
    // analytics must never break the pipeline
  }
}

export async function flushPostHog() {
  try {
    await _posthog?.flush();
  } catch {
    // ignore
  }
}
