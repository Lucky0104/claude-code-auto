"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/fetcher";
import type { CampaignDTO, CampaignPostDTO } from "@/types";
import type { CenterConfigInput } from "@/features/campaigns/service";

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: () => apiGet<{ campaigns: CampaignDTO[] }>("/api/campaigns").then((d) => d.campaigns),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["campaign", id],
    queryFn: () => apiGet<{ campaign: CampaignDTO }>(`/api/campaigns/${id}`).then((d) => d.campaign),
    enabled: Boolean(id),
  });
}

export function useCampaignPosts(id: string) {
  return useQuery({
    queryKey: ["campaign-posts", id],
    queryFn: () =>
      apiGet<{ posts: CampaignPostDTO[] }>(`/api/campaigns/${id}/posts`).then((d) => d.posts),
    enabled: Boolean(id),
  });
}

export function useSyncCampaigns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<{ count: number }>("/api/campaigns/sync", "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useConfigureCenter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CenterConfigInput) =>
      apiSend<{ campaign: CampaignDTO }>(`/api/campaigns/${id}/center-config`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-posts", id] });
    },
  });
}

export function useToggleMonitor(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { postId: string; enable: boolean; permalink?: string | null }) =>
      apiSend(
        `/api/campaigns/${id}/posts/${vars.postId}/monitor`,
        vars.enable ? "POST" : "DELETE",
        vars.enable ? { permalink: vars.permalink } : undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-posts", id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
