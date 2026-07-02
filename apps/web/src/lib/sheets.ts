import { google } from 'googleapis';

export interface ParsedOrmRow {
  comment_type: string;
  keywords: string[];
  reply_en: string | null;
  reply_hi: string | null;
  reply_hn: string | null;
  reply_bn: string | null;
  reply_mr: string | null;
}

/** Extract the spreadsheet ID from a full Google Sheets URL (or pass through an ID). */
export function extractSheetId(urlOrId: string): string {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(urlOrId)) return urlOrId;
  throw new Error('Invalid Google Sheet URL or ID');
}

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const credentials = JSON.parse(raw);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Fetch ORM rules from a tenant's sheet.
 * Expected columns (row 1 = header):
 * comment_type | keywords (comma-separated) | reply_en | reply_hi | reply_hn | reply_bn | reply_mr
 */
export async function fetchOrmSheet(sheetId: string): Promise<ParsedOrmRow[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A2:G1000',
  });

  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0]?.trim())
    .map((row) => parseOrmRow(row as string[]));
}

export function parseOrmRow(row: string[]): ParsedOrmRow {
  const [comment_type, keywords, reply_en, reply_hi, reply_hn, reply_bn, reply_mr] = row;
  return {
    comment_type: comment_type.trim().toLowerCase(),
    keywords: (keywords ?? '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
    reply_en: reply_en?.trim() || null,
    reply_hi: reply_hi?.trim() || null,
    reply_hn: reply_hn?.trim() || null,
    reply_bn: reply_bn?.trim() || null,
    reply_mr: reply_mr?.trim() || null,
  };
}
