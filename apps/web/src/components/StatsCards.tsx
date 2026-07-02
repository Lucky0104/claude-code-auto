import type { CommentStats } from '@repo/types';

export function StatsCards({ stats }: { stats: CommentStats }) {
  const cards = [
    { label: 'Comments scanned', value: stats.total_scanned },
    { label: 'Comments answered', value: stats.total_replied },
    { label: 'Reply rate', value: `${stats.reply_rate}%` },
    { label: 'Failures', value: stats.total_failed },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">{card.label}</p>
          <p className="mt-1 text-3xl font-bold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
