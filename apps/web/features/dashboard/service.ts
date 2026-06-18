import "server-only";
import { prisma } from "@/lib/prisma";
import { toDTO } from "@/features/comments/service";
import type { DashboardMetricsDTO } from "@/types";

export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetricsDTO> {
  const [
    campaignsTotal,
    campaignsConfigured,
    monitoringActive,
    repliesSent,
    repliesFailed,
    commentsReceived,
    allCampaigns,
    replyGroups,
    recentRows,
  ] = await Promise.all([
    prisma.campaign.count({ where: { tenantId } }),
    prisma.campaign.count({ where: { tenantId, isConfigured: true } }),
    prisma.monitoredPost.count({ where: { tenantId, isActive: true } }),
    prisma.commentLog.count({ where: { tenantId, status: "REPLIED" } }),
    prisma.commentLog.count({ where: { tenantId, status: "FAILED" } }),
    prisma.commentLog.count({ where: { tenantId } }),
    prisma.campaign.findMany({
      where: { tenantId },
      select: { id: true, name: true, centerName: true },
    }),
    prisma.commentLog.groupBy({
      by: ["campaignId"],
      where: { tenantId, status: "REPLIED" },
      _count: { _all: true },
    }),
    prisma.commentLog.findMany({
      where: { tenantId },
      include: { campaign: { select: { name: true, centerName: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const campaignMap = new Map(allCampaigns.map((c) => [c.id, c]));

  const topCampaigns = [...replyGroups]
    .map((g) => ({
      name: (g.campaignId && campaignMap.get(g.campaignId)?.name) || "Unknown",
      replies: g._count._all,
    }))
    .sort((a, b) => b.replies - a.replies)
    .slice(0, 5);

  const centerTotals = new Map<string, number>();
  for (const g of replyGroups) {
    const center = (g.campaignId && campaignMap.get(g.campaignId)?.centerName) || "Unassigned";
    centerTotals.set(center, (centerTotals.get(center) ?? 0) + g._count._all);
  }
  const topCenters = [...centerTotals.entries()]
    .map(([name, replies]) => ({ name, replies }))
    .sort((a, b) => b.replies - a.replies)
    .slice(0, 5);

  return {
    commentsReceived,
    repliesSent,
    repliesFailed,
    replyRate: commentsReceived ? repliesSent / commentsReceived : null,
    monitoringActive,
    campaignsConfigured,
    campaignsTotal,
    topCampaigns,
    topCenters,
    recentActivity: recentRows.map(toDTO),
  };
}
