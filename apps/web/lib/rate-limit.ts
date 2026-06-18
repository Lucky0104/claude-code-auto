/**
 * In-process fixed-interval cooldown limiter (per worker/instance). Used to
 * throttle expensive Meta syncs per tenant. For strict global limits across
 * serverless instances, back this with Upstash/Redis later.
 */
const lastCall = new Map<string, number>();

export interface CooldownResult {
  allowed: boolean;
  retryAfter: number; // seconds
}

export function checkCooldown(key: string, cooldownSeconds: number): CooldownResult {
  if (cooldownSeconds <= 0) return { allowed: true, retryAfter: 0 };
  const now = Date.now();
  const prev = lastCall.get(key);
  if (prev !== undefined) {
    const elapsed = (now - prev) / 1000;
    if (elapsed < cooldownSeconds) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil(cooldownSeconds - elapsed)) };
    }
  }
  lastCall.set(key, now);
  return { allowed: true, retryAfter: 0 };
}

export function syncCooldownSeconds(): number {
  const raw = process.env.SYNC_RATE_LIMIT_SECONDS;
  const v = raw === undefined ? 15 : Number(raw);
  return Number.isFinite(v) ? v : 15;
}

export function resetRateLimit(): void {
  lastCall.clear();
}
