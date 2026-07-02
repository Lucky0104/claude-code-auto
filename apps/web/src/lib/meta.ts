import type { MetaComment, Platform } from '@repo/types';

const GRAPH = 'https://graph.facebook.com/v19.0';

export class MetaApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public type: string
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

async function graphFetch(path: string, params: Record<string, string>, init?: RequestInit) {
  const url = new URL(`${GRAPH}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), init);
  const json = await res.json();

  if (json.error) {
    throw new MetaApiError(json.error.message, json.error.code, json.error.type);
  }
  return json;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

export const META_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_manage_comments',
  'business_management',
].join(',');

export function buildMetaOAuthUrl(state: string): string {
  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  url.searchParams.set('client_id', process.env.FACEBOOK_APP_ID!);
  url.searchParams.set('redirect_uri', process.env.META_OAUTH_REDIRECT_URI!);
  url.searchParams.set('scope', META_OAUTH_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const json = await graphFetch('/oauth/access_token', {
    client_id: process.env.FACEBOOK_APP_ID!,
    client_secret: process.env.FACEBOOK_APP_SECRET!,
    redirect_uri: process.env.META_OAUTH_REDIRECT_URI!,
    code,
  });
  return json.access_token;
}

export async function exchangeForLongLivedToken(shortToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const json = await graphFetch('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.FACEBOOK_APP_ID!,
    client_secret: process.env.FACEBOOK_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  return { access_token: json.access_token, expires_in: json.expires_in ?? 5184000 };
}

// ─── Pages & IG accounts ─────────────────────────────────────────────────────

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

export async function getUserPages(userToken: string): Promise<MetaPage[]> {
  const json = await graphFetch('/me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: userToken,
    limit: '100',
  });
  return json.data ?? [];
}

// ─── Comments (Facebook) ─────────────────────────────────────────────────────

export async function getFacebookComments(
  pageId: string,
  pageToken: string,
  sinceIso?: string
): Promise<MetaComment[]> {
  // Fetch recent posts, then their comments
  const posts = await graphFetch(`/${pageId}/posts`, {
    fields: 'id',
    limit: '25',
    access_token: pageToken,
  });

  const comments: MetaComment[] = [];
  for (const post of posts.data ?? []) {
    const params: Record<string, string> = {
      fields: 'id,message,from{name,id},created_time',
      limit: '100',
      order: 'reverse_chronological',
      access_token: pageToken,
    };
    if (sinceIso) params.since = sinceIso;

    const res = await graphFetch(`/${post.id}/comments`, params);
    for (const c of res.data ?? []) {
      if (!c.message) continue;
      comments.push({
        id: c.id,
        message: c.message,
        post_id: post.id,
        from: c.from,
        created_time: c.created_time,
      });
    }
  }
  return comments;
}

// ─── Comments (Instagram) ────────────────────────────────────────────────────

export async function getInstagramComments(
  igUserId: string,
  pageToken: string,
  sinceIso?: string
): Promise<MetaComment[]> {
  const media = await graphFetch(`/${igUserId}/media`, {
    fields: 'id',
    limit: '25',
    access_token: pageToken,
  });

  const comments: MetaComment[] = [];
  for (const item of media.data ?? []) {
    const res = await graphFetch(`/${item.id}/comments`, {
      fields: 'id,text,from{username,id},timestamp',
      limit: '100',
      access_token: pageToken,
    });
    for (const c of res.data ?? []) {
      if (!c.text) continue;
      if (sinceIso && c.timestamp && c.timestamp < sinceIso) continue;
      comments.push({
        id: c.id,
        message: c.text,
        post_id: item.id,
        from: c.from ? { name: c.from.username ?? '', id: c.from.id } : undefined,
        created_time: c.timestamp,
      });
    }
  }
  return comments;
}

// ─── Post a reply ────────────────────────────────────────────────────────────

export async function postReply(
  commentId: string,
  message: string,
  token: string,
  platform: Platform
): Promise<string> {
  // FB: POST /{comment-id}/comments — IG: POST /{ig-comment-id}/replies
  const path = platform === 'facebook' ? `/${commentId}/comments` : `/${commentId}/replies`;

  const json = await graphFetch(path, {}, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message, access_token: token }),
  });
  return json.id;
}
