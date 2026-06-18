import type { Role } from "@/lib/rbac";

export type { Role };

export interface CampaignDTO {
  id: string;
  metaCampaignId: string;
  name: string;
  status: string | null;
  objective: string | null;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  isConfigured: boolean;
  centerName: string | null;
  doctorName: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  replyTemplate: string | null;
  monitoredPostsCount: number;
  metaSyncedAt: string | null;
}

export interface CampaignPostDTO {
  adId: string;
  adName: string;
  instagramPostId: string;
  instagramPermalink: string | null;
  thumbnailUrl: string | null;
  mediaType: string;
  isMonitoring: boolean;
  repliesSent: number;
}

export type CommentLogStatus = "PENDING" | "REPLIED" | "FAILED" | "SKIPPED";

export interface CommentLogDTO {
  id: string;
  commentId: string;
  commenterId: string | null;
  commenterName: string | null;
  commentText: string | null;
  replyText: string | null;
  status: CommentLogStatus;
  replySent: boolean;
  campaignName: string | null;
  centerName: string | null;
  instagramPostId: string | null;
  instagramPermalink: string | null;
  error: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface CommentLogPage {
  items: CommentLogDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardMetricsDTO {
  commentsReceived: number;
  repliesSent: number;
  repliesFailed: number;
  replyRate: number | null;
  monitoringActive: number;
  campaignsConfigured: number;
  campaignsTotal: number;
  topCampaigns: { name: string; replies: number }[];
  topCenters: { name: string; replies: number }[];
  recentActivity: CommentLogDTO[];
}
