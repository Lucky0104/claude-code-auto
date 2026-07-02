'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOrg } from '@/components/OrgContext';

interface Connection {
  id: string;
  platform: string;
  page_id: string;
  page_name: string | null;
  is_active: boolean;
  token_expires_at: string | null;
}

function SettingsContent() {
  const { currentOrg } = useOrg();
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [name, setName] = useState(currentOrg.name);
  const [phone, setPhone] = useState(currentOrg.phone_number);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const connected = searchParams.get('connected');
  const oauthError = searchParams.get('error');

  const fetchConnections = useCallback(async () => {
    const res = await fetch(`/api/meta/pages?org_id=${currentOrg.id}`);
    if (res.ok) {
      const json = await res.json();
      setConnections(json.connections);
    }
  }, [currentOrg.id]);

  useEffect(() => {
    fetchConnections();
    setName(currentOrg.name);
    setPhone(currentOrg.phone_number);
  }, [fetchConnections, currentOrg]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/orgs/${currentOrg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone_number: phone }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  const isAdmin = ['owner', 'admin'].includes(currentOrg.role);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {connected && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Connected {connected} Meta page(s) successfully.
        </div>
      )}
      {oauthError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          Meta connection failed: {oauthError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Organization</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Phone number (appended to every reply)
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!isAdmin}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>
        {isAdmin && (
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
        {saved && <p className="text-sm text-green-700">Saved.</p>}
      </form>

      <div className="rounded-lg border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Meta connections</h2>
            <p className="text-sm text-muted-foreground">
              Facebook Pages and Instagram Business accounts linked to this org.
            </p>
          </div>
          {isAdmin && (
            <a
              href={`/api/meta/auth?org_id=${currentOrg.id}`}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Connect Meta
            </a>
          )}
        </div>

        {connections.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No pages connected yet.
          </p>
        ) : (
          <ul className="divide-y">
            {connections.map((conn) => (
              <li key={conn.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{conn.page_name ?? conn.page_id}</p>
                  <p className="text-xs capitalize text-muted-foreground">{conn.platform}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    conn.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {conn.is_active ? 'Active' : 'Inactive'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
