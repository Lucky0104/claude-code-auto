import { useCallback, useEffect, useState } from 'react';
import type { CommentStats, Platform } from '@repo/types';
import {
  getStats,
  listOrgs,
  loginWithPassword,
  sendMagicLink,
  triggerSync,
  verifyOtp,
  type OrgSummary,
  type SyncResult,
} from '../lib/api';

type View = 'loading' | 'login' | 'not_mbs' | 'panel';

export function Popup() {
  const [view, setView] = useState<View>('loading');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { auth_token, org_id } = await chrome.storage.session.get(['auth_token', 'org_id']);

    if (!auth_token) {
      setView('login');
      return;
    }

    const status = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_STATUS' });
    if (!status?.on_mbs) {
      setView('not_mbs');
      return;
    }

    setPlatform(status.platform ?? 'facebook');
    setOrgId(org_id ?? null);
    setView('panel');

    try {
      const loadedOrgs = await listOrgs();
      setOrgs(loadedOrgs);
      if (!org_id && loadedOrgs.length > 0) {
        setOrgId(loadedOrgs[0].id);
        await chrome.runtime.sendMessage({
          type: 'SET_AUTH',
          token: auth_token,
          org_id: loadedOrgs[0].id,
        });
      }
    } catch {
      // token expired
      await chrome.runtime.sendMessage({ type: 'CLEAR_AUTH' });
      setView('login');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (view === 'loading') {
    return <div className="p-6 text-center text-sm text-gray-500">Loading…</div>;
  }
  if (view === 'login') {
    return <LoginView onLoggedIn={refresh} />;
  }
  if (view === 'not_mbs') {
    return <NotMbsView />;
  }
  return (
    <ControlPanel
      platform={platform ?? 'facebook'}
      orgs={orgs}
      orgId={orgId}
      onOrgChange={async (id) => {
        setOrgId(id);
        const { auth_token } = await chrome.storage.session.get('auth_token');
        await chrome.runtime.sendMessage({ type: 'SET_AUTH', token: auth_token, org_id: id });
      }}
      onLogout={async () => {
        await chrome.runtime.sendMessage({ type: 'CLEAR_AUTH' });
        setView('login');
      }}
    />
  );
}

// ─── Not on Meta Business Suite ──────────────────────────────────────────────

function NotMbsView() {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <span className="text-4xl">🤦</span>
      <p className="text-base font-bold text-red-600">
        Open the Meta Business Suite - You Dumbo :) - By Lucky
      </p>
      <a
        href="https://business.facebook.com/"
        target="_blank"
        rel="noreferrer"
        className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Open Meta Business Suite
      </a>
    </div>
  );
}

// ─── Login ───────────────────────────────────────────────────────────────────

function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function finishLogin(token: string) {
    await chrome.runtime.sendMessage({ type: 'SET_AUTH', token });
    onLoggedIn();
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = await loginWithPassword(email, password);
      await finishLogin(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await sendMagicLink(email);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = await verifyOtp(email, otp);
      await finishLogin(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-5">
      <h1 className="mb-1 text-lg font-bold">MBS Auto-Reply</h1>
      <p className="mb-4 text-xs text-gray-500">Sign in with your dashboard account.</p>

      {mode === 'password' ? (
        <form onSubmit={handlePassword} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => setMode('otp')}
            className="w-full text-xs text-blue-600 hover:underline"
          >
            Use email code instead
          </button>
        </form>
      ) : !otpSent ? (
        <form onSubmit={handleSendOtp} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send code'}
          </button>
          <button
            type="button"
            onClick={() => setMode('password')}
            className="w-full text-xs text-blue-600 hover:underline"
          >
            Use password instead
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-3">
          <p className="text-xs text-gray-600">
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>
          <input
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-widest"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Verify & sign in'}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Control panel ───────────────────────────────────────────────────────────

function ControlPanel({
  platform,
  orgs,
  orgId,
  onOrgChange,
  onLogout,
}: {
  platform: Platform;
  orgs: OrgSummary[];
  orgId: string | null;
  onOrgChange: (id: string) => void;
  onLogout: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'syncing'>('idle');
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [stats, setStats] = useState<CommentStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!orgId) return;
    try {
      setStats(await getStats(orgId));
    } catch {
      // non-fatal
    }
  }, [orgId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleStart() {
    if (!orgId) return;
    setStatus('syncing');
    setError(null);
    setLastResult(null);
    try {
      const result = await triggerSync(orgId, platform);
      setLastResult(result);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setStatus('idle');
    }
  }

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">MBS Auto-Reply</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            platform === 'facebook' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
          }`}
        >
          {platform} mode
        </span>
      </div>

      {orgs.length > 1 && (
        <select
          value={orgId ?? ''}
          onChange={(e) => onOrgChange(e.target.value)}
          className="mb-3 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      )}

      <button
        onClick={handleStart}
        disabled={status === 'syncing' || !orgId}
        className={`mb-3 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
          status === 'syncing' ? 'bg-amber-500' : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {status === 'syncing' ? 'Scanning & replying…' : `Start auto-reply (${platform})`}
      </button>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {lastResult && (
        <div className="mb-3 rounded-md bg-green-50 p-3 text-xs text-green-900">
          <p className="font-semibold">Run complete</p>
          <p>
            Scanned {lastResult.scanned} · New {lastResult.new_comments} · Replied{' '}
            {lastResult.replied} · Failed {lastResult.failed}
          </p>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-xl font-bold">{stats.total_scanned}</p>
            <p className="text-xs text-gray-500">Scanned (24h)</p>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-xl font-bold">{stats.total_replied}</p>
            <p className="text-xs text-gray-500">Answered (24h)</p>
          </div>
        </div>
      )}

      <button
        onClick={onLogout}
        className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600"
      >
        Sign out
      </button>
    </div>
  );
}
