"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { DashboardMetricsDTO } from "@/types";

export function useMetrics() {
  return useQuery({
    queryKey: ["metrics"],
    queryFn: () => apiGet<DashboardMetricsDTO>("/api/metrics"),
  });
}
