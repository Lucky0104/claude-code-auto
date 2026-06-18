import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CommentLogDTO, CommentLogPage, CommentLogStatus } from "@/types";

export interface CommentLogFilters {
  campaignId?: string;
  centerName?: string;
  status?: CommentLogStatus;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listCommentLogs(
  tenantId: string,
  f: CommentLogFilters,
): Promise<CommentLogPage> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 20));

  const where: Prisma.CommentLogWhereInput = { tenantId };
  if (f.campaignId) where.campaignId = f.campaignId;
  if (f.status) where.status = f.status;
  if (f.centerName) where.campaign = { centerName: f.centerName };
  if (f.dateFrom || f.dateTo) {
    where.createdAt = {};
    if (f.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(f.dateFrom);
    if (f.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(f.dateTo);
  }
  if (f.q) {
    where.OR = [
      { commentText: { contains: f.q, mode: "insensitive" } },
      { replyText: { contains: f.q, mode: "insensitive" } },
      { commenterId: { contains: f.q, mode: "insensitive" } },
      { commenterName: { contains: f.q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.commentLog.count({ where }),
    prisma.commentLog.findMany({
      where,
      include: { campaign: { select: { name: true, centerName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items: rows.map(toDTO), total, page, pageSize };
}

type Row = Prisma.CommentLogGetPayload<{
  include: { campaign: { select: { name: true; centerName: true } } };
}>;

export function toDTO(row: Row): CommentLogDTO {
  return {
    id: row.id,
    commentId: row.commentId,
    commenterId: row.commenterId,
    commenterName: row.commenterName,
    commentText: row.commentText,
    replyText: row.replyText,
    status: row.status as CommentLogStatus,
    replySent: row.replySent,
    campaignName: row.campaign?.name ?? null,
    centerName: row.campaign?.centerName ?? null,
    instagramPostId: row.instagramPostId,
    instagramPermalink: row.instagramPostId
      ? `https://www.instagram.com/p/${row.instagramPostId}/`
      : null,
    error: row.error,
    repliedAt: row.repliedAt ? row.repliedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
