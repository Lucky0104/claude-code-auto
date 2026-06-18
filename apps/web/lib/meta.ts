/**
 * Meta Graph API client + webhook signature verification.
 *
 * Isomorphic: uses fetch + Web Crypto (globalThis.crypto.subtle), so the same
 * code runs in Next route handlers/server actions and in Cloudflare Workers.
 */

export function graphBase(version?: string): string {
  const v = version ?? process.env.FB_GRAPH_VERSION ?? "v21.0";
  return `https://graph.facebook.com/${v}`;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (X-Hub-Signature-256)
// ---------------------------------------------------------------------------
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/** Verify Meta's `sha256=...` signature over the raw request body. */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  if (!appSecret) return false;
  const expected = await hmacSha256Hex(appSecret, rawBody);
  return timingSafeEqual(signatureHeader.slice("sha256=".length), expected);
}

// ---------------------------------------------------------------------------
// Graph errors + fetch helpers
// ---------------------------------------------------------------------------
export class MetaError extends Error {
  status: number;
  rateLimited: boolean;
  constructor(message: string, status: number, rateLimited = false) {
    super(message);
    this.name = "MetaError";
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function graphGet<T>(path: string, params: Record<string, string>, version?: string): Promise<T> {
  const url = new URL(`${graphBase(version)}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method: "GET" });
  if (res.status === 429) throw new MetaError("Meta rate limit, try later", 429, true);
  if (!res.ok) throw new MetaError(`Meta API error: ${await readError(res)}`, res.status);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// OAuth + identity
// ---------------------------------------------------------------------------
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string,
): Promise<{ access_token: string; expires_in?: number }> {
  return graphGet("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
}

export async function getLongLivedUserToken(
  shortToken: string,
  appId: string,
  appSecret: string,
): Promise<{ access_token: string; expires_in?: number }> {
  return graphGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
}

export interface MetaMe {
  id: string;
  name?: string;
  email?: string;
  picture?: { data?: { url?: string } };
}

export async function getMe(token: string): Promise<MetaMe> {
  return graphGet("/me", { fields: "id,name,email,picture", access_token: token });
}

export interface MetaAdAccount {
  id: string;
  account_id: string;
  name?: string;
  account_status?: number;
}

export async function getUserAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const data = await graphGet<{ data: MetaAdAccount[] }>("/me/adaccounts", {
    fields: "id,account_id,name,account_status",
    access_token: token,
  });
  return data.data ?? [];
}

export interface MetaPage {
  id: string;
  name: string;
  category?: string;
  access_token: string;
  fan_count?: number;
  picture?: { data?: { url?: string } };
}

export async function getUserPages(token: string): Promise<MetaPage[]> {
  const data = await graphGet<{ data: MetaPage[] }>("/me/accounts", {
    fields: "id,name,category,access_token,fan_count,picture",
    access_token: token,
  });
  return data.data ?? [];
}

// ---------------------------------------------------------------------------
// Campaigns + ads
// ---------------------------------------------------------------------------
export interface MetaCampaign {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
}

export async function getCampaigns(adAccountId: string, token: string): Promise<MetaCampaign[]> {
  const data = await graphGet<{ data: MetaCampaign[] }>(`/act_${adAccountId}/campaigns`, {
    fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time",
    filtering: '[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]',
    limit: "100",
    access_token: token,
  });
  return data.data ?? [];
}

export interface MetaAd {
  id: string;
  name?: string;
  status?: string;
  creative?: {
    id?: string;
    instagram_permalink_url?: string;
    thumbnail_url?: string;
    effective_object_story_id?: string;
  };
}

export async function getCampaignAds(campaignId: string, token: string): Promise<MetaAd[]> {
  const data = await graphGet<{ data: MetaAd[] }>(`/${campaignId}/ads`, {
    fields: "id,name,status,creative{id,instagram_permalink_url,thumbnail_url,effective_object_story_id}",
    limit: "100",
    access_token: token,
  });
  return data.data ?? [];
}

/** Post a public reply to an Instagram comment. */
export async function replyToComment(
  commentId: string,
  message: string,
  pageToken: string,
  version?: string,
): Promise<{ id?: string }> {
  const res = await fetch(`${graphBase(version)}/${commentId}/replies`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message, access_token: pageToken }),
  });
  if (res.status === 429) throw new MetaError("Meta rate limit", 429, true);
  if (!res.ok) throw new MetaError(`Meta reply failed: ${await readError(res)}`, res.status);
  return (await res.json()) as { id?: string };
}

// ---------------------------------------------------------------------------
// Permalink helpers
// ---------------------------------------------------------------------------
export function mediaTypeFromPermalink(permalink: string | null | undefined): string {
  if (!permalink) return "IMAGE";
  const p = permalink.toLowerCase();
  if (p.includes("/reel/")) return "REEL";
  if (p.includes("/tv/")) return "VIDEO";
  return "IMAGE";
}

export function extractIgPostId(permalink: string | null | undefined): string | null {
  if (!permalink) return null;
  const m = permalink.match(/\/(?:p|reel|tv)\/([^/?#]+)/);
  return m ? m[1]! : null;
}
