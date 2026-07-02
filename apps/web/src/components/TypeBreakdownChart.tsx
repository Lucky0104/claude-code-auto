'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const SERIES_COLOR = '#2a78d6';

export function TypeBreakdownChart({ byType }: { byType: Record<string, number> }) {
  const data = Object.entries(byType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold">Replies by comment type</h2>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No replies yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="type"
              width={96}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar
              dataKey="count"
              name="Replies"
              fill={SERIES_COLOR}
              barSize={18}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
