// Authenticated calls to the Next.js backend. The extension never talks to
// Meta or Google directly — all secrets live server-side.

import type { CommentStats, Platform } from '@repo/types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Supabase URL + anon key (both public values) come from the backend's
// /api/config at runtime, so the extension never needs a rebuild when the
// Supabase project changes. VITE_ vars act as a local-dev fallback.
interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const CONFIG_CACHE_KEY = 'supabase_config';
const CONFIG_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getSupabaseConfig(): Promise<SupabaseConfig> {
  const cached = await chrome.storage.local.get(CONFIG_CACHE_KEY);
  const entry = cached[CONFIG_CACHE_KEY] as
    | (SupabaseConfig & { fetched_at: number })
    | undefined;
  if (entry && Date.now() - entry.fetched_at < CONFIG_TTL_MS) {
    return { url: entry.url, anonKey: entry.anonKey };
  }

  try {
    const res = await fetch(`${BASE}/api/config`);
    const json = await res.json();
    if (res.ok && json.configured && json.supabase_url && json.supabase_anon_key) {
      const config: SupabaseConfig = { url: json.supabase_url, anonKey: json.supabase_anon_key };
      await chrome.storage.local.set({
        [CONFIG_CACHE_KEY]: { ...config, fetched_at: Date.now() },
      });
      return config;
    }
  } catch {
    // fall through to build-time values
  }

  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) {
    throw new Error('Backend is not configured yet — Supabase is not connected.');
  }
  return { url, anonKey };
}

async function getAuth(): Promise<{ token: string | null; orgId: string | null }> {
  const data = await chrome.storage.session.get(['auth_token', 'org_id']);
  return { token: data.auth_token ?? null, orgId: data.org_id ?? null };
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { token } = await getAuth();
  if (!token) throw new Error('Not logged in');
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function loginWithPassword(email: string, password: string): Promise<string> {
  const { url, anonKey } = await getSupabaseConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.msg ?? 'Login failed');
  return json.access_token;
}

export async function sendMagicLink(email: string): Promise<void> {
  const { url, anonKey } = await getSupabaseConfig();
  const res = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error_description ?? json.msg ?? 'Failed to send code');
  }
}

export async function verifyOtp(email: string, token: string): Promise<string> {
  const { url, anonKey } = await getSupabaseConfig();
  const res = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, token, type: 'email' }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.msg ?? 'Invalid code');
  return json.access_token;
}

// ─── Orgs ────────────────────────────────────────────────────────────────────

export interface OrgSummary {
  id: string;
  name: string;
  role: string;
}

export async function listOrgs(): Promise<OrgSummary[]> {
  const res = await authedFetch('/api/orgs');
  if (!res.ok) throw new Error('Failed to load organizations');
  const json = await res.json();
  return json.organizations;
}

// ─── Sync & stats ────────────────────────────────────────────────────────────

export interface SyncResult {
  scanned: number;
  new_comments: number;
  replied: number;
  failed: number;
  skipped: number;
}

export async function triggerSync(orgId: string, platform: Platform): Promise<SyncResult> {
  const res = await authedFetch('/api/meta/sync', {
    method: 'POST',
    body: JSON.stringify({ org_id: orgId, platform }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Sync failed');
  return json.result;
}

export async function getStats(orgId: string): Promise<CommentStats> {
  const from = new Date(Date.now() - 86400000).toISOString(); // last 24h
  const res = await authedFetch(
    `/api/comments/stats?org_id=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}`
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Failed to load stats');
  return json.stats;
}
