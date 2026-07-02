'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CommentStats } from '@repo/types';
import { useOrg } from '@/components/OrgContext';
import { StatsCards } from '@/components/StatsCards';
import { TypeBreakdownChart } from '@/components/TypeBreakdownChart';
import { LanguageBreakdownChart } from '@/components/LanguageBreakdownChart';

const RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'All time', days: 0 },
];

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const [stats, setStats] = useState<CommentStats | null>(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ org_id: currentOrg.id });
    if (rangeDays > 0) {
      params.set('from', new Date(Date.now() - rangeDays * 86400000).toISOString());
    }
    const res = await fetch(`/api/comments/stats?${params}`);
    if (res.ok) {
      const json = await res.json();
      setStats(json.stats);
    }
    setLoading(false);
  }, [currentOrg.id, rangeDays]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <select
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value))}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {loading || !stats ? (
        <p className="text-sm text-muted-foreground">Loading stats…</p>
      ) : (
        <>
          <StatsCards stats={stats} />
          <div className="grid gap-6 lg:grid-cols-2">
            <TypeBreakdownChart byType={stats.by_type} />
            <LanguageBreakdownChart byLanguage={stats.by_language} />
          </div>
        </>
      )}
    </div>
  );
}
