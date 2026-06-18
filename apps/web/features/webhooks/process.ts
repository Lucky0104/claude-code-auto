import "server-only";
import { prisma } from "@/lib/prisma";
import { replyToComment, MetaError } from "@/lib/meta";
import { renderTemplate } from "@/lib/templates";
import { getFirstActivePageToken } from "@/features/campaigns/service";
import { logEvent, captureError } from "@/lib/observability";

type ChangeValue = Record<string, any>;

/**
 * Process a Meta webhook payload. Used by the Next.js fallback route; the
 * Cloudflare queue-worker has an equivalent self-contained implementation.
 */
export async function processWebhookPayload(payload: any): Promise<void> {
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value: ChangeValue = change?.value ?? {};
      if (value.verb && value.verb !== "add") continue;
      const commentId = value.comment_id ?? value.id;
      const mediaId = value.media_id ?? value.media?.id ?? value.post_id;
      if (!commentId || !mediaId) continue;
      try {
        await processOneComment(String(commentId), String(mediaId), value);
      } catch (e) {
        captureError(e, { scope: "processOneComment", commentId });
      }
    }
  }
}

export async function processOneComment(
  commentId: string,
  mediaId: string,
  value: ChangeValue,
): Promise<void> {
  // 1) Dedup
  const existing = await prisma.commentLog.findUnique({ where: { commentId } });
  if (existing) return;

  // 2) Monitored?
  const monitored = await prisma.monitoredPost.findFirst({
    where: { instagramPostId: mediaId, isActive: true },
  });
  if (!monitored) return;

  // 3) Configured campaign?
  const campaign = await prisma.campaign.findUnique({ where: { id: monitored.campaignId } });
  if (!campaign || !campaign.isConfigured) return;

  const token = await getFirstActivePageToken(campaign.tenantId);
  if (!token) {
    logEvent("webhook.no_token", { tenantId: campaign.tenantId });
    return;
  }

  const replyText = renderTemplate(campaign.replyTemplate, {
    doctor_name: campaign.doctorName,
    center_name: campaign.centerName,
    phone: campaign.phone,
    address: campaign.address,
    whatsapp: campaign.whatsapp,
  });

  let status: "REPLIED" | "FAILED" = "REPLIED";
  let error: string | null = null;
  try {
    await replyToComment(commentId, replyText, token);
  } catch (e) {
    status = "FAILED";
    error = e instanceof MetaError ? e.message.slice(0, 300) : String(e).slice(0, 300);
  }

  try {
    await prisma.commentLog.create({
      data: {
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        commentId,
        instagramPostId: mediaId,
        commenterId: value.from?.id ?? value.from_id ?? null,
        commenterName: value.from?.name ?? null,
        commentText: value.text ?? value.message ?? null,
        replyText: status === "REPLIED" ? replyText : null,
        status,
        replySent: status === "REPLIED",
        error,
        repliedAt: new Date(),
      },
    });
  } catch {
    // Unique violation on comment_id => concurrent duplicate delivery; ignore.
    logEvent("webhook.duplicate", { commentId });
    return;
  }

  logEvent("webhook.reply", {
    tenantId: campaign.tenantId,
    campaignId: campaign.id,
    commentId,
    status,
  });
}
