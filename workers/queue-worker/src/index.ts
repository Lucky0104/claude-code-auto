/**
 * Cloudflare Worker: comment queue consumer.
 *
 * Loads the monitored post + configured campaign, renders the reply, posts it
 * publicly to Instagram, and writes a comment_log. Throws to trigger Cloudflare
 * Queue retries (with backoff); after max_retries the message goes to the DLQ.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderTemplate } from "./lib";

export interface CommentJob {
  commentId: string;
  mediaId: string;
  value: Record<string, any>;
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  FB_GRAPH_VERSION: string;
}

export default {
  async queue(batch: MessageBatch<CommentJob>, env: Env): Promise<void> {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    for (const msg of batch.messages) {
      try {
        await processOne(msg.body, supabase, env);
        msg.ack();
      } catch {
        // Retry (Cloudflare applies backoff; DLQ after max_retries).
        msg.retry();
      }
    }
  },
};

async function processOne(job: CommentJob, supabase: SupabaseClient, env: Env): Promise<void> {
  // 1) Dedup.
  const { data: existing } = await supabase
    .from("comment_logs")
    .select("id")
    .eq("comment_id", job.commentId)
    .maybeSingle();
  if (existing) return;

  // 2) Monitored?
  const { data: monitored } = await supabase
    .from("monitored_posts")
    .select("*")
    .eq("instagram_post_id", job.mediaId)
    .eq("is_active", true)
    .maybeSingle();
  if (!monitored) return;

  // 3) Configured campaign?
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", monitored.campaign_id)
    .maybeSingle();
  if (!campaign || !campaign.is_configured) return;

  // 4) Page token.
  const { data: page } = await supabase
    .from("facebook_pages")
    .select("access_token")
    .eq("tenant_id", campaign.tenant_id)
    .eq("is_active", true)
    .order("connected_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const token = page?.access_token as string | undefined;
  if (!token) return;

  // 5) Render + post reply.
  const replyText = renderTemplate(campaign.reply_template, {
    doctor_name: campaign.doctor_name,
    center_name: campaign.center_name,
    phone: campaign.phone,
    address: campaign.address,
    whatsapp: campaign.whatsapp,
  });

  const graph = `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v21.0"}`;
  let status: "REPLIED" | "FAILED" = "REPLIED";
  let error: string | null = null;
  const res = await fetch(`${graph}/${job.commentId}/replies`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: replyText, access_token: token }),
  });
  if (res.status === 429) throw new Error("Meta rate limit"); // retry later
  if (!res.ok) {
    status = "FAILED";
    error = (await res.text()).slice(0, 300);
  }

  // 6) Log.
  const { error: insErr } = await supabase.from("comment_logs").insert({
    tenant_id: campaign.tenant_id,
    campaign_id: campaign.id,
    comment_id: job.commentId,
    instagram_post_id: job.mediaId,
    commenter_id: job.value?.from?.id ?? null,
    commenter_name: job.value?.from?.name ?? null,
    comment_text: job.value?.text ?? job.value?.message ?? null,
    reply_text: status === "REPLIED" ? replyText : null,
    status,
    reply_sent: status === "REPLIED",
    error,
    replied_at: new Date().toISOString(),
  });
  // Ignore unique-violation (concurrent duplicate); retry other transient errors.
  if (insErr && insErr.code !== "23505") throw new Error(insErr.message);
}
