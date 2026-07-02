import type { SupabaseClient } from '@supabase/supabase-js';
import type { Language, MetaComment, MetaConnection, OrmRule, Platform } from '@repo/types';
import { classifyComment, getPhoneFooter } from './claude';
import { decrypt } from './crypto';
import { getFacebookComments, getInstagramComments, postReply, MetaApiError } from './meta';
import { track } from './posthog';
import { sendReplyFailureAlert } from './resend';

const FAILURE_ALERT_THRESHOLD = 3;

export interface PipelineResult {
  org_id: string;
  scanned: number;
  new_comments: number;
  replied: number;
  failed: number;
  skipped: number;
}

/**
 * Process all new comments for one organization: fetch from Meta, dedup
 * against the comments ledger, classify with Claude, reply with the exact
 * ORM template + translated phone footer, and record everything.
 *
 * `platformFilter` restricts processing to one platform (used by the
 * extension's manual sync so Facebook mode only touches Facebook comments).
 */
export async function processOrgComments(
  orgId: string,
  supabase: SupabaseClient,
  platformFilter?: Platform
): Promise<PipelineResult> {
  const result: PipelineResult = {
    org_id: orgId,
    scanned: 0,
    new_comments: 0,
    replied: 0,
    failed: 0,
    skipped: 0,
  };

  let connQuery = supabase
    .from('meta_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true);
  if (platformFilter) connQuery = connQuery.eq('platform', platformFilter);

  const { data: connections, error: connError } = await connQuery;
  if (connError) throw connError;
  if (!connections?.length) return result;

  const [{ data: rules }, { data: org }] = await Promise.all([
    supabase
      .from('orm_rules')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('priority', { ascending: false }),
    supabase.from('organizations').select('name, phone_number').eq('id', orgId).single(),
  ]);

  const phone = org?.phone_number ?? '8938935656';
  const lastErrors: string[] = [];

  for (const conn of connections as MetaConnection[]) {
    let token: string;
    try {
      token = decrypt(conn.access_token);
    } catch (err) {
      lastErrors.push(`Token decryption failed for connection ${conn.id}`);
      continue;
    }

    let metaComments: MetaComment[];
    try {
      metaComments =
        conn.platform === 'facebook'
          ? await getFacebookComments(conn.page_id, token)
          : await getInstagramComments(conn.page_id, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastErrors.push(`Fetch failed (${conn.platform}/${conn.page_id}): ${message}`);
      track('comment_fetch_failed', {
        org_id: orgId,
        platform: conn.platform,
        error: message,
      });
      if (err instanceof MetaApiError && (err.code === 190 || err.code === 102)) {
        // Invalid/expired token — deactivate so we stop retrying every run
        await supabase
          .from('meta_connections')
          .update({ is_active: false })
          .eq('id', conn.id);
      }
      continue;
    }

    result.scanned += metaComments.length;
    track('comment_detected', {
      org_id: orgId,
      platform: conn.platform,
      count: metaComments.length,
    });

    if (!metaComments.length) continue;

    // Dedup: never reply twice to the same comment ID
    const { data: existing } = await supabase
      .from('comments')
      .select('comment_id')
      .eq('org_id', orgId)
      .in('comment_id', metaComments.map((c) => c.id));

    const existingIds = new Set((existing ?? []).map((e) => e.comment_id));
    const newComments = metaComments.filter((c) => !existingIds.has(c.id));
    result.new_comments += newComments.length;

    for (const comment of newComments) {
      const outcome = await processSingleComment({
        supabase,
        orgId,
        conn,
        token,
        comment,
        rules: (rules ?? []) as OrmRule[],
        phone,
      });
      result[outcome.status]++;
      if (outcome.error) lastErrors.push(outcome.error);
    }
  }

  if (result.failed >= FAILURE_ALERT_THRESHOLD && org) {
    const adminEmails = await getOrgAdminEmails(orgId, supabase);
    await sendReplyFailureAlert(
      org.name,
      adminEmails,
      result.failed,
      lastErrors[lastErrors.length - 1] ?? 'Unknown error'
    );
  }

  return result;
}

async function processSingleComment(args: {
  supabase: SupabaseClient;
  orgId: string;
  conn: MetaConnection;
  token: string;
  comment: MetaComment;
  rules: OrmRule[];
  phone: string;
}): Promise<{ status: 'replied' | 'failed' | 'skipped'; error?: string }> {
  const { supabase, orgId, conn, token, comment, rules, phone } = args;
  const startedAt = Date.now();

  // Claim the comment ID first — the UNIQUE(org_id, comment_id) constraint
  // makes this the concurrency-safe dedup gate.
  const { data: inserted, error: insertError } = await supabase
    .from('comments')
    .insert({
      org_id: orgId,
      meta_connection_id: conn.id,
      comment_id: comment.id,
      post_id: comment.post_id,
      platform: conn.platform,
      comment_text: comment.message,
      commenter_name: comment.from?.name ?? null,
      commenter_id: comment.from?.id ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    // 23505 = unique violation → another run already claimed it
    return { status: 'skipped' };
  }

  try {
    const { language, comment_type } = await classifyComment(
      comment.message,
      rules.map((r) => r.comment_type)
    );
    track('comment_classified', { org_id: orgId, language, comment_type });

    const rule =
      rules.find((r) => r.comment_type === comment_type) ??
      rules.find((r) => r.comment_type === 'general');

    if (!rule) {
      await supabase
        .from('comments')
        .update({
          detected_language: language,
          comment_type,
          status: 'skipped',
          error_message: 'No matching ORM rule and no general fallback',
        })
        .eq('id', inserted.id);
      return { status: 'skipped' };
    }

    const ormText = pickReplyText(rule, language);
    if (!ormText) {
      await supabase
        .from('comments')
        .update({
          detected_language: language,
          comment_type,
          status: 'skipped',
          error_message: `ORM rule '${rule.comment_type}' has no reply text for any language`,
        })
        .eq('id', inserted.id);
      return { status: 'skipped' };
    }

    const footer = await getPhoneFooter(language, phone);
    const fullReply = `${ormText}\n\n${footer}`;

    const metaReplyId = await postReply(comment.id, fullReply, token, conn.platform);

    await Promise.all([
      supabase
        .from('comments')
        .update({
          detected_language: language,
          comment_type,
          status: 'replied',
          replied_at: new Date().toISOString(),
        })
        .eq('id', inserted.id),
      supabase.from('replies').insert({
        org_id: orgId,
        comment_id: inserted.id,
        reply_text: fullReply,
        meta_reply_id: metaReplyId,
        language,
        orm_rule_id: rule.id,
      }),
    ]);

    track('reply_posted', {
      org_id: orgId,
      platform: conn.platform,
      language,
      comment_type,
      latency_ms: Date.now() - startedAt,
    });
    return { status: 'replied' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('comments')
      .update({ status: 'failed', error_message: message })
      .eq('id', inserted.id);
    track('reply_failed', { org_id: orgId, platform: conn.platform, error: message });
    return { status: 'failed', error: message };
  }
}

/** Exact ORM answer in the detected language, falling back to English. */
export function pickReplyText(rule: OrmRule, language: Language): string | null {
  const byLanguage: Record<Language, string | null> = {
    en: rule.reply_en,
    hi: rule.reply_hi,
    hn: rule.reply_hn,
    bn: rule.reply_bn,
    mr: rule.reply_mr,
  };
  return byLanguage[language] ?? rule.reply_en ?? null;
}

async function getOrgAdminEmails(orgId: string, supabase: SupabaseClient): Promise<string[]> {
  const { data: memberships } = await supabase
    .from('user_organizations')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin']);

  if (!memberships?.length) return [];

  // Requires service-role client (auth.admin). For RLS clients this fails
  // silently and no email is sent.
  const emails: string[] = [];
  for (const m of memberships) {
    try {
      const { data } = await supabase.auth.admin.getUserById(m.user_id);
      if (data.user?.email) emails.push(data.user.email);
    } catch {
      // not a service client — skip
    }
  }
  return emails;
}
