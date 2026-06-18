/**
 * Cloudflare Worker: Meta webhook ingress.
 *
 * Verifies the X-Hub-Signature-256, stores the raw event (deduplicated), and
 * enqueues each comment for asynchronous processing by the queue-worker. Always
 * returns 200 quickly so Meta does not retry.
 */
import { createClient } from "@supabase/supabase-js";

export interface CommentJob {
  commentId: string;
  mediaId: string;
  value: Record<string, any>;
}

export interface Env {
  FB_APP_SECRET: string;
  FB_WEBHOOK_VERIFY_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  QUEUE: Queue<CommentJob>;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

async function sha256Hex(message: string): Promise<string> {
  const enc = new TextEncoder();
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(message)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifySignature(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=") || !secret) return false;
  return timingSafeEqual(header.slice(7), await hmacSha256Hex(secret, raw));
}

function extractComments(payload: any): CommentJob[] {
  const jobs: CommentJob[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      if (value.verb && value.verb !== "add") continue;
      const commentId = value.comment_id ?? value.id;
      const mediaId = value.media_id ?? value.media?.id ?? value.post_id;
      if (commentId && mediaId) {
        jobs.push({ commentId: String(commentId), mediaId: String(mediaId), value });
      }
    }
  }
  return jobs;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET") {
      if (
        url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === env.FB_WEBHOOK_VERIFY_TOKEN
      ) {
        return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
      }
      return new Response("Verification failed", { status: 403 });
    }

    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const raw = await req.text();
    if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), env.FB_APP_SECRET))) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const dedupHash = await sha256Hex(raw);
    const { error: insErr } = await supabase
      .from("webhook_events")
      .insert({ source: "meta", dedup_hash: dedupHash, payload, signature_valid: true });
    if (insErr && insErr.code === "23505") {
      return Response.json({ ok: true, duplicate: true });
    }

    const jobs = extractComments(payload);
    await Promise.all(jobs.map((j) => env.QUEUE.send(j)));
    return Response.json({ ok: true, enqueued: jobs.length });
  },
};
