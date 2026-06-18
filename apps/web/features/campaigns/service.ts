import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getCampaigns,
  getCampaignAds,
  extractIgPostId,
  mediaTypeFromPermalink,
  MetaError,
} from "@/lib/meta";
import { sanitizeField, sanitizeTemplate } from "@/lib/templates";
import { logEvent } from "@/lib/observability";
import type { CampaignDTO, CampaignPostDTO } from "@/types";

export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** First active page access token for a tenant (server-only). */
export async function getFirstActivePageToken(tenantId: string): Promise<string | null> {
  const page =
    (await prisma.facebookPage.findFirst({
      where: { tenantId, isActive: true, accessToken: { not: null } },
      orderBy: { connectedAt: "asc" },
    })) ??
    (await prisma.facebookPage.findFirst({
      where: { tenantId, accessToken: { not: null } },
      orderBy: { connectedAt: "asc" },
    }));
  return page?.accessToken ?? null;
}

async function getActiveAdAccountId(tenantId: string): Promise<string | null> {
  const acct =
    (await prisma.adAccount.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.adAccount.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" } }));
  return acct?.adAccountId ?? null;
}

export async function listCampaigns(tenantId: string): Promise<CampaignDTO[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { tenantId },
    orderBy: [{ metaSyncedAt: "desc" }, { createdAt: "desc" }],
  });
  const counts = await prisma.monitoredPost.groupBy({
    by: ["campaignId"],
    where: { tenantId, isActive: true },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.campaignId, c._count._all]));
  return campaigns.map((c) => toCampaignDTO(c, countMap.get(c.id) ?? 0));
}

export async function getCampaign(tenantId: string, id: string): Promise<CampaignDTO | null> {
  const c = await prisma.campaign.findFirst({ where: { id, tenantId } });
  if (!c) return null;
  const count = await prisma.monitoredPost.count({
    where: { tenantId, campaignId: c.id, isActive: true },
  });
  return toCampaignDTO(c, count);
}

export interface SyncResult {
  count: number;
}

/** Pull campaigns from Meta and upsert them for the tenant. */
export async function syncCampaigns(tenantId: string): Promise<SyncResult> {
  const adAccountId = await getActiveAdAccountId(tenantId);
  if (!adAccountId) throw new ServiceError("No ad account found. Reconnect Facebook.", 400);
  const token = await getFirstActivePageToken(tenantId);
  if (!token) throw new ServiceError("Connect a Facebook page first to sync campaigns.", 400);

  let metaCampaigns;
  try {
    metaCampaigns = await getCampaigns(adAccountId, token);
  } catch (e) {
    if (e instanceof MetaError && e.rateLimited) throw new ServiceError(e.message, 503);
    if (e instanceof MetaError) throw new ServiceError(e.message, 502);
    throw new ServiceError("Meta API error", 502);
  }

  const now = new Date();
  for (const mc of metaCampaigns) {
    await prisma.campaign.upsert({
      where: { tenantId_metaCampaignId: { tenantId, metaCampaignId: mc.id } },
      update: {
        name: mc.name ?? "",
        status: mc.status ?? null,
        objective: mc.objective ?? null,
        dailyBudget: mc.daily_budget ?? null,
        lifetimeBudget: mc.lifetime_budget ?? null,
        startTime: mc.start_time ?? null,
        stopTime: mc.stop_time ?? null,
        metaCreatedTime: mc.created_time ?? null,
        adAccountId,
        metaSyncedAt: now,
      },
      create: {
        tenantId,
        metaCampaignId: mc.id,
        name: mc.name ?? "",
        status: mc.status ?? null,
        objective: mc.objective ?? null,
        dailyBudget: mc.daily_budget ?? null,
        lifetimeBudget: mc.lifetime_budget ?? null,
        startTime: mc.start_time ?? null,
        stopTime: mc.stop_time ?? null,
        metaCreatedTime: mc.created_time ?? null,
        adAccountId,
        metaSyncedAt: now,
        isConfigured: false,
      },
    });
  }
  logEvent("campaigns.synced", { tenantId, adAccountId, count: metaCampaigns.length });
  return { count: metaCampaigns.length };
}

export interface CenterConfigInput {
  centerName?: string | null;
  doctorName: string;
  address: string;
  phone: string;
  whatsapp?: string | null;
  replyTemplate?: string | null;
}

export async function configureCenter(
  tenantId: string,
  id: string,
  input: CenterConfigInput,
  configuredBy: string,
): Promise<CampaignDTO> {
  const existing = await prisma.campaign.findFirst({ where: { id, tenantId } });
  if (!existing) throw new ServiceError("Campaign not found", 404);

  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      centerName: sanitizeField(input.centerName),
      doctorName: sanitizeField(input.doctorName),
      address: sanitizeField(input.address),
      phone: sanitizeField(input.phone),
      whatsapp: sanitizeField(input.whatsapp),
      replyTemplate: sanitizeTemplate(input.replyTemplate),
      isConfigured: true,
      configuredAt: new Date(),
      configuredBy,
    },
  });
  const count = await prisma.monitoredPost.count({
    where: { tenantId, campaignId: id, isActive: true },
  });
  logEvent("campaign.configured", { tenantId, campaignId: id });
  return toCampaignDTO(updated, count);
}

export async function listCampaignPosts(
  tenantId: string,
  id: string,
): Promise<CampaignPostDTO[]> {
  const campaign = await prisma.campaign.findFirst({ where: { id, tenantId } });
  if (!campaign) throw new ServiceError("Campaign not found", 404);
  const token = await getFirstActivePageToken(tenantId);
  if (!token) throw new ServiceError("Connect a Facebook page first.", 400);

  let ads;
  try {
    ads = await getCampaignAds(campaign.metaCampaignId, token);
  } catch (e) {
    if (e instanceof MetaError && e.rateLimited) throw new ServiceError(e.message, 503);
    throw new ServiceError("Meta API error", 502);
  }

  const out: CampaignPostDTO[] = [];
  for (const ad of ads) {
    const permalink = ad.creative?.instagram_permalink_url ?? null;
    if (!permalink) continue;
    const postId =
      extractIgPostId(permalink) ?? ad.creative?.effective_object_story_id ?? ad.id;
    const mon = await prisma.monitoredPost.findFirst({
      where: { tenantId, instagramPostId: postId },
    });
    const repliesSent = await prisma.commentLog.count({
      where: { tenantId, instagramPostId: postId, status: "REPLIED" },
    });
    out.push({
      adId: ad.id,
      adName: ad.name ?? "",
      instagramPostId: postId,
      instagramPermalink: permalink,
      thumbnailUrl: ad.creative?.thumbnail_url ?? null,
      mediaType: mediaTypeFromPermalink(permalink),
      isMonitoring: Boolean(mon?.isActive),
      repliesSent,
    });
  }
  return out;
}

export async function setMonitoring(
  tenantId: string,
  campaignId: string,
  postId: string,
  enable: boolean,
  actorId: string,
  permalink?: string | null,
): Promise<{ isMonitoring: boolean }> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!campaign) throw new ServiceError("Campaign not found", 404);
  if (enable && !campaign.isConfigured) {
    throw new ServiceError("Configure centre first", 400);
  }

  await prisma.monitoredPost.upsert({
    where: { tenantId_instagramPostId: { tenantId, instagramPostId: postId } },
    update: enable
      ? { isActive: true, activatedAt: new Date(), activatedBy: actorId, campaignId }
      : { isActive: false, deactivatedAt: new Date(), deactivatedBy: actorId },
    create: {
      tenantId,
      campaignId,
      instagramPostId: postId,
      instagramPermalink: permalink ?? null,
      mediaType: mediaTypeFromPermalink(permalink),
      isActive: enable,
      activatedAt: enable ? new Date() : null,
      activatedBy: enable ? actorId : null,
    },
  });
  logEvent("monitoring.toggled", { tenantId, campaignId, postId, enable });
  return { isMonitoring: enable };
}

type CampaignRow = Awaited<ReturnType<typeof prisma.campaign.findFirst>>;

function toCampaignDTO(c: NonNullable<CampaignRow>, monitoredPostsCount: number): CampaignDTO {
  return {
    id: c.id,
    metaCampaignId: c.metaCampaignId,
    name: c.name,
    status: c.status,
    objective: c.objective,
    dailyBudget: c.dailyBudget,
    lifetimeBudget: c.lifetimeBudget,
    isConfigured: c.isConfigured,
    centerName: c.centerName,
    doctorName: c.doctorName,
    address: c.address,
    phone: c.phone,
    whatsapp: c.whatsapp,
    replyTemplate: c.replyTemplate,
    monitoredPostsCount,
    metaSyncedAt: c.metaSyncedAt ? c.metaSyncedAt.toISOString() : null,
  };
}
