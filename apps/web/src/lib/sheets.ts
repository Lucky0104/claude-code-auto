import { google } from 'googleapis';
import { mapOrmSheetCells, type SheetCellMap } from './claude';

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

// ─── Fetching ────────────────────────────────────────────────────────────────

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const credentials = JSON.parse(raw);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function fetchGridViaServiceAccount(sheetId: string): Promise<string[][] | null> {
  const sheets = getSheetsClient();
  if (!sheets) return null;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A1:J1000',
  });
  return (res.data.values ?? []) as string[][];
}

/**
 * Sheets shared as "Anyone with the link" can be read through the public CSV
 * export without any credentials — so tenants don't need a service account.
 */
async function fetchGridViaPublicCsv(sheetId: string): Promise<string[][]> {
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
    { redirect: 'follow' }
  );
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || contentType.includes('text/html')) {
    throw new Error(
      'Sheet is not accessible. Share it as "Anyone with the link" (viewer or commenter), ' +
        'or configure GOOGLE_SERVICE_ACCOUNT_JSON and share the sheet with the service account.'
    );
  }
  return parseCsv(await res.text());
}

async function fetchSheetGrid(sheetId: string): Promise<string[][]> {
  try {
    const viaSa = await fetchGridViaServiceAccount(sheetId);
    if (viaSa) return viaSa;
  } catch {
    // fall through to the public export
  }
  return fetchGridViaPublicCsv(sheetId);
}

/** Minimal RFC 4180 CSV parser (quoted fields may contain commas, quotes, newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Fetch ORM rules from a tenant's sheet.
 *
 * Two supported layouts:
 * 1. The documented template (row 1 header starting with "comment_type"):
 *    comment_type | keywords | reply_en | reply_hi | reply_hn | reply_bn | reply_mr
 * 2. Any other layout — Claude maps which cells hold which reply type and
 *    language; the text itself is extracted verbatim from the grid.
 */
export async function fetchOrmSheet(sheetId: string): Promise<ParsedOrmRow[]> {
  const grid = await fetchSheetGrid(sheetId);
  if (grid.length === 0) return [];

  const firstHeader = (grid[0]?.[0] ?? '').trim().toLowerCase();
  if (firstHeader === 'comment_type') {
    return grid
      .slice(1)
      .filter((row) => row[0]?.trim())
      .map((row) => parseOrmRow(row));
  }

  const mapping = await mapOrmSheetCells(buildGridPreview(grid));
  return assembleRulesFromMap(grid, mapping);
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

// ─── LLM-assisted mapping ────────────────────────────────────────────────────

/** Compact "[row,col] text" view of the grid for the mapping prompt. */
export function buildGridPreview(grid: string[][], maxRows = 250, maxCellLen = 90): string {
  const lines: string[] = [];
  for (let r = 0; r < grid.length && lines.length < maxRows; r++) {
    const row = grid[r];
    if (!row || !row.some((c) => c?.trim())) continue;
    const cells = row
      .map((cell, c) => {
        const t = (cell ?? '').replace(/\s+/g, ' ').trim();
        if (!t) return null;
        return `[${r},${c}] ${t.length > maxCellLen ? `${t.slice(0, maxCellLen)}…` : t}`;
      })
      .filter(Boolean);
    lines.push(cells.join(' | '));
  }
  return lines.join('\n');
}

const REPLY_KEYS = ['reply_en', 'reply_hi', 'reply_hn', 'reply_bn', 'reply_mr'] as const;
const LANG_BY_KEY: Record<(typeof REPLY_KEYS)[number], keyof SheetCellMap['cells']> = {
  reply_en: 'en',
  reply_hi: 'hi',
  reply_hn: 'hn',
  reply_bn: 'bn',
  reply_mr: 'mr',
};

/** Turn Claude's coordinate map into rules, pulling text verbatim from the grid. */
export function assembleRulesFromMap(grid: string[][], maps: SheetCellMap[]): ParsedOrmRow[] {
  const seen = new Set<string>();
  const out: ParsedOrmRow[] = [];

  for (const m of maps) {
    const type = String(m.comment_type ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!type || seen.has(type)) continue;

    const rule: ParsedOrmRow = {
      comment_type: type,
      keywords: (Array.isArray(m.keywords) ? m.keywords : [])
        .map((k) => String(k).trim().toLowerCase())
        .filter(Boolean),
      reply_en: null,
      reply_hi: null,
      reply_hn: null,
      reply_bn: null,
      reply_mr: null,
    };

    for (const key of REPLY_KEYS) {
      const coords = m.cells?.[LANG_BY_KEY[key]];
      if (!Array.isArray(coords)) continue;
      const text = coords
        .filter((pair) => Array.isArray(pair) && pair.length === 2)
        .map(([r, c]) => (grid[r]?.[c] ?? '').trim())
        .filter(Boolean)
        .join('\n\n');
      if (text) rule[key] = text;
    }

    if (REPLY_KEYS.every((key) => rule[key] === null)) continue;
    seen.add(type);
    out.push(rule);
  }
  return out;
}
