import { Resend } from 'resend';

let _resend: Resend | null = null;
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

/** Alert org admins when the reply pipeline is failing repeatedly. Never throws. */
export async function sendReplyFailureAlert(
  orgName: string,
  adminEmails: string[],
  failureCount: number,
  lastError: string
) {
  const resend = client();
  if (!resend || adminEmails.length === 0) return;

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'alerts@resend.dev',
      to: adminEmails,
      subject: `[${orgName}] Auto-reply pipeline failing (${failureCount} failures)`,
      html:
        `<p>The auto-reply pipeline for <strong>${orgName}</strong> has failed ` +
        `<strong>${failureCount}</strong> times in the latest run.</p>` +
        `<p>Last error: <code>${escapeHtml(lastError)}</code></p>` +
        `<p>Check your dashboard for details and verify your Meta connection is still valid.</p>`,
    });
  } catch {
    // email alerts must never break the pipeline
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
