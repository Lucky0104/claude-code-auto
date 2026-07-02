'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOrg } from '@/components/OrgContext';

interface Member {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

const ROLES = ['admin', 'agent', 'viewer'];

export default function TeamPage() {
  const { currentOrg } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = ['owner', 'admin'].includes(currentOrg.role);

  const fetchMembers = useCallback(async () => {
    const res = await fetch(`/api/orgs/${currentOrg.id}/members`);
    if (res.ok) {
      const json = await res.json();
      setMembers(json.members);
    }
  }, [currentOrg.id]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);

    const res = await fetch(`/api/orgs/${currentOrg.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });

    setInviting(false);
    if (res.ok) {
      setInviteEmail('');
      fetchMembers();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'Invite failed');
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    await fetch(`/api/orgs/${currentOrg.id}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role }),
    });
    fetchMembers();
  }

  async function handleRemove(userId: string) {
    if (!confirm('Remove this member from the organization?')) return;
    const res = await fetch(
      `/api/orgs/${currentOrg.id}/members?user_id=${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'Remove failed');
    }
    fetchMembers();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Team</h1>

      {isAdmin && (
        <form onSubmit={handleInvite} className="rounded-lg border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Invite a member</h2>
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </form>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-4 py-3">{m.email}</td>
                <td className="px-4 py-3">
                  {isAdmin && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="capitalize">{m.role}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    {m.role !== 'owner' && (
                      <button
                        onClick={() => handleRemove(m.user_id)}
                        className="text-sm text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
