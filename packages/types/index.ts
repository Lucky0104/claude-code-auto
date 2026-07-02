// ─── Enums ──────────────────────────────────────────────────────────────────

export type Platform = 'facebook' | 'instagram';
export type Language = 'en' | 'hi' | 'hn' | 'bn' | 'mr';
export type CommentStatus = 'pending' | 'replied' | 'skipped' | 'failed';
export type UserRole = 'owner' | 'admin' | 'agent' | 'viewer';

// ─── Database Row Types ──────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  phone_number: string;
  created_at: string;
}

export interface UserOrganization {
  id: string;
  user_id: string;
  org_id: string;
  role: UserRole;
  created_at: string;
}

export interface MetaConnection {
  id: string;
  org_id: string;
  platform: Platform;
  page_id: string;
  page_name: string | null;
  access_token: string; // encrypted at rest
  token_expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GoogleSheetsConfig {
  id: string;
  org_id: string;
  sheet_id: string;
  last_synced_at: string | null;
  created_at: string;
}

export interface OrmRule {
  id: string;
  org_id: string;
  comment_type: string;
  keywords: string[];
  reply_en: string | null;
  reply_hi: string | null;
  reply_hn: string | null;
  reply_bn: string | null;
  reply_mr: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface Comment {
  id: string;
  org_id: string;
  meta_connection_id: string;
  comment_id: string;
  post_id: string;
  platform: Platform;
  comment_text: string;
  commenter_name: string | null;
  commenter_id: string | null;
  detected_language: Language | null;
  comment_type: string | null;
  status: CommentStatus;
  replied_at: string | null;
  created_at: string;
}

export interface Reply {
  id: string;
  org_id: string;
  comment_id: string;
  reply_text: string;
  meta_reply_id: string | null;
  language: Language;
  orm_rule_id: string | null;
  created_at: string;
}

// ─── API Request / Response Types ───────────────────────────────────────────

export interface ClassifyResult {
  language: Language;
  comment_type: string;
  confidence: number;
}

export interface CommentStats {
  total_scanned: number;
  total_replied: number;
  total_failed: number;
  reply_rate: number;
  by_type: Record<string, number>;
  by_language: Record<Language, number>;
  by_platform: Record<Platform, number>;
}

export interface MetaComment {
  id: string;
  message: string;
  post_id: string;
  from?: { name: string; id: string };
  created_time: string;
}

export interface OrmSheetRow {
  comment_type: string;
  keywords: string;
  reply_en: string;
  reply_hi: string;
  reply_hn: string;
  reply_bn: string;
  reply_mr: string;
}

// ─── Extension Message Types ─────────────────────────────────────────────────

export interface ExtensionMessage {
  type: 'SET_AUTH' | 'CLEAR_AUTH' | 'GET_STATUS';
  token?: string;
  org_id?: string;
}

export interface ExtensionStatus {
  on_mbs: boolean;
  current_platform: Platform | null;
  auth_token: string | null;
  org_id: string | null;
  is_syncing: boolean;
}
