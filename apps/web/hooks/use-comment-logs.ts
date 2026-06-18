"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { CommentLogPage } from "@/types";

export interface CommentLogQuery {
  campaignId?: string;
  centerName?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function useCommentLogs(query: CommentLogQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "" && v !== null) params.set(k, String(v));
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ["comment-logs", qs],
    queryFn: () => apiGet<CommentLogPage>(`/api/comment-logs${qs ? `?${qs}` : ""}`),
    placeholderData: keepPreviousData,
  });
}
