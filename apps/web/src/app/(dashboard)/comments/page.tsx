'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOrg } from '@/components/OrgContext';
import { LANGUAGE_LABELS } from '@/lib/utils';

interface CommentRow {
  id: string;
  comment_text: string;
  commenter_name: string | null;
  platform: string;
  detected_language: string | null;
  comment_type: string | null;
  status: string;
  replied_at: string | null;
  created_at: string;
  error_message: string | null;
  replies: { reply_text: string; language: string; created_at: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  replied: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  skipped: 'bg-gray-100 text-gray-600',
};

export default function CommentsPage() {
  const { currentOrg } = useOrg();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [language, setLanguage] = useState('');

  const limit = 25;

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      org_id: currentOrg.id,
      page: String(page),
      limit: String(limit),
    });
    if (status) params.set('status', status);
    if (platform) params.set('platform', platform);
    if (language) params.set('language', language);

    const res = await fetch(`/api/comments?${params}`);
    if (res.ok) {
      const json = await res.json();
      setComments(json.comments);
      setTotal(json.total);
    }
    setLoading(false);
  }, [currentOrg.id, page, status, platform, language]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Comments</h1>

      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="replied">Replied</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        <select
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All platforms</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
        </select>
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All languages</option>
          {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Comment</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Language</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : comments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No comments found
                </td>
              </tr>
            ) : (
              comments.map((c) => (
                <>
                  <tr
                    key={c.id}
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="max-w-md px-4 py-3">
                      <p className="truncate">{c.comment_text}</p>
                      {c.commenter_name && (
                        <p className="text-xs text-muted-foreground">by {c.commenter_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">{c.platform}</td>
                    <td className="px-4 py-3">
                      {c.detected_language ? LANGUAGE_LABELS[c.detected_language] : '—'}
                    </td>
                    <td className="px-4 py-3">{c.comment_type ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? ''}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(c.created_at).toLocaleString()}
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-detail`} className="border-b bg-muted/20">
                      <td colSpan={6} className="px-4 py-3">
                        <p className="mb-2 whitespace-pre-wrap text-sm">{c.comment_text}</p>
                        {c.replies?.length > 0 && (
                          <div className="rounded-md border bg-card p-3">
                            <p className="mb-1 text-xs font-semibold text-muted-foreground">
                              Reply sent:
                            </p>
                            <p className="whitespace-pre-wrap text-sm">
                              {c.replies[0].reply_text}
                            </p>
                          </div>
                        )}
                        {c.error_message && (
                          <p className="mt-2 text-xs text-destructive">
                            Error: {c.error_message}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {total} comment{total === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-md border px-3 py-1.5 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-2 py-1.5">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-md border px-3 py-1.5 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
