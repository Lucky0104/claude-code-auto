'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OrmRule } from '@repo/types';
import { useOrg } from '@/components/OrgContext';

export default function OrmPage() {
  const { currentOrg } = useOrg();
  const [rules, setRules] = useState<OrmRule[]>([]);
  const [sheet, setSheet] = useState<{ sheet_id: string; last_synced_at: string | null } | null>(
    null
  );
  const [sheetUrl, setSheetUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const fetchRules = useCallback(async () => {
    const res = await fetch(`/api/sheets/rules?org_id=${currentOrg.id}`);
    if (res.ok) {
      const json = await res.json();
      setRules(json.rules);
      setSheet(json.sheet);
    }
  }, [currentOrg.id]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function handleSync(withUrl: boolean) {
    setSyncing(true);
    setMessage(null);

    const res = await fetch('/api/sheets/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: currentOrg.id,
        ...(withUrl && sheetUrl ? { sheet_url: sheetUrl } : {}),
      }),
    });

    const json = await res.json().catch(() => ({}));
    setSyncing(false);

    if (res.ok) {
      setMessage({ type: 'ok', text: `Synced ${json.synced} rules from sheet.` });
      setSheetUrl('');
      fetchRules();
    } else {
      setMessage({ type: 'error', text: json.error ?? 'Sync failed' });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ORM Rules</h1>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Google Sheet</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Columns required: comment_type, keywords, reply_en, reply_hi, reply_hn, reply_bn,
          reply_mr. Share the sheet with your service account email.
        </p>
        {sheet && (
          <p className="mb-3 text-sm">
            Connected sheet: <code className="rounded bg-muted px-1">{sheet.sheet_id}</code>
            {sheet.last_synced_at && (
              <span className="ml-2 text-muted-foreground">
                Last synced {new Date(sheet.last_synced_at).toLocaleString()}
              </span>
            )}
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => handleSync(true)}
            disabled={syncing || (!sheetUrl && !sheet)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : sheetUrl ? 'Save & Sync' : 'Sync now'}
          </button>
        </div>
        {message && (
          <p
            className={`mt-3 text-sm ${message.type === 'ok' ? 'text-green-700' : 'text-destructive'}`}
          >
            {message.text}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Keywords</th>
              <th className="px-4 py-3 font-medium">English reply</th>
              <th className="px-4 py-3 font-medium">Hindi reply</th>
              <th className="px-4 py-3 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No rules yet — connect a Google Sheet above.
                </td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{rule.comment_type}</td>
                  <td className="max-w-40 truncate px-4 py-3 text-muted-foreground">
                    {rule.keywords.join(', ')}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3">{rule.reply_en ?? '—'}</td>
                  <td className="max-w-xs truncate px-4 py-3">{rule.reply_hi ?? '—'}</td>
                  <td className="px-4 py-3">{rule.is_active ? '✓' : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
