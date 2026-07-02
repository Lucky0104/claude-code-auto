// Authenticated calls to the Next.js backend. The extension never talks to
// Meta or Google directly — all secrets live server-side.

import type { CommentStats, Platform } from '@repo/types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

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
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.msg ?? 'Login failed');
  return json.access_token;
}

export async function sendMagicLink(email: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error_description ?? json.msg ?? 'Failed to send code');
  }
}

export async function verifyOtp(email: string, token: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
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
