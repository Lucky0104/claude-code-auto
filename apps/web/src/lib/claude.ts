import Anthropic from '@anthropic-ai/sdk';
import type { ClassifyResult, Language } from '@repo/types';

const MODEL = 'claude-haiku-4-5-20251001';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const VALID_LANGUAGES: Language[] = ['en', 'hi', 'hn', 'bn', 'mr'];

/**
 * Detect language + intent of a comment in one Claude Haiku call.
 * Languages: en (English), hi (Hindi/Devanagari), hn (Hinglish — Hindi in
 * Latin script), bn (Bengali), mr (Marathi).
 */
export async function classifyComment(
  text: string,
  commentTypes: string[]
): Promise<ClassifyResult> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 200,
    system:
      'You are a comment classifier for an Indian business responding to social media comments. ' +
      'Detect the language and the intent of the comment. ' +
      'Language codes: en=English, hi=Hindi (Devanagari script), hn=Hinglish (Hindi words written in Latin/English script), bn=Bengali, mr=Marathi. ' +
      'Reply ONLY with a single valid JSON object, no markdown, no explanation.',
    messages: [
      {
        role: 'user',
        content:
          `Comment: ${JSON.stringify(text)}\n` +
          `Possible intent types: ${commentTypes.length ? commentTypes.join(', ') : 'general'}\n\n` +
          `Reply with JSON: {"language":"en|hi|hn|bn|mr","comment_type":"<best matching type from the list, or 'general' if none match>","confidence":<0.0-1.0>}`,
      },
    ],
  });

  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Claude response type');

  const parsed = JSON.parse(extractJson(block.text));
  const language: Language = VALID_LANGUAGES.includes(parsed.language) ? parsed.language : 'en';
  return {
    language,
    comment_type: typeof parsed.comment_type === 'string' ? parsed.comment_type : 'general',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  };
}

/** Pull the first JSON object out of a response that may have stray text. */
function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON found in: ${text}`);
  return text.slice(start, end + 1);
}

// ─── Sheet structure mapping ─────────────────────────────────────────────────

export interface SheetCellMap {
  comment_type: string;
  keywords: string[];
  cells: Partial<Record<Language, [number, number][]>>;
}

/**
 * Map an arbitrary tenant sheet layout to ORM rules. The model returns only
 * cell coordinates — reply text is extracted from the grid verbatim by the
 * caller, so replies are never paraphrased.
 */
export async function mapOrmSheetCells(gridPreview: string): Promise<SheetCellMap[]> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      'You map a spreadsheet of social-media reply templates to structured auto-reply rules. ' +
      'You never rewrite or invent text — you only return coordinates of existing cells. ' +
      'Reply ONLY with a single valid JSON object, no markdown, no explanation.',
    messages: [
      {
        role: 'user',
        content:
          'Below is a spreadsheet. Every non-empty cell is shown as "[row,col] text" (text may be truncated).\n\n' +
          gridPreview +
          '\n\nIdentify the distinct reply intents (comment types) and where each reply lives.\n' +
          'Rules:\n' +
          '- comment_type: short lowercase snake_case id (e.g. "price", "location", "general").\n' +
          '- keywords: 3-8 lowercase keywords a commenter might use for that intent.\n' +
          '- Language codes: en=English, hi=Hindi in Devanagari script, hn=Hinglish (Hindi words in Latin script), bn=Bengali, mr=Marathi. Judge language by the CELL CONTENT, never by column headers.\n' +
          '- For each type+language pick exactly ONE reply. List multiple coordinates for a language only when one reply is split across consecutive cells (fragments will be joined in order).\n' +
          '- Skip section notes, headers, empty cells, URLs on their own, and replies containing unfilled placeholders like "<Patient Name>", "___", "(patient name)" or "cityname".\n' +
          '- Include a "general" type for the generic greeting/fallback reply if one exists.\n' +
          '- At most 30 rules.\n\n' +
          'Reply with JSON: {"rules":[{"comment_type":"price","keywords":["cost","price"],"cells":{"en":[[3,1]],"hi":[[3,2]],"hn":[[3,3]]}}]}',
      },
    ],
  });

  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Claude response type');
  const parsed = JSON.parse(extractJson(block.text));
  if (!Array.isArray(parsed.rules)) throw new Error('Claude sheet mapping returned no rules');
  return parsed.rules as SheetCellMap[];
}

// ─── Phone footer ────────────────────────────────────────────────────────────

const STATIC_FOOTERS: Partial<Record<Language, string>> = {
  en: 'For any further questions, call us @ {phone}',
  hi: 'किसी भी अतिरिक्त जानकारी के लिए हमें कॉल करें @ {phone}',
  hn: 'For kisi bhi further questions, call us @ {phone}',
};

const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi',
  hn: 'Hinglish',
  bn: 'Bengali',
  mr: 'Marathi',
};

// Cache Haiku translations per (language, phone) for the lifetime of the process
const footerCache = new Map<string, string>();

export async function getPhoneFooter(language: Language, phone: string): Promise<string> {
  const staticFooter = STATIC_FOOTERS[language];
  if (staticFooter) return staticFooter.replace('{phone}', phone);

  const cacheKey = `${language}:${phone}`;
  const cached = footerCache.get(cacheKey);
  if (cached) return cached;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content:
          `Translate this to ${LANGUAGE_NAMES[language]} keeping the phone number exactly as-is: ` +
          `"For any further questions, call us @ ${phone}". ` +
          'Reply with ONLY the translated text, nothing else.',
      },
    ],
  });

  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Claude response type');
  const translated = block.text.trim().replace(/^["']|["']$/g, '');
  footerCache.set(cacheKey, translated);
  return translated;
}
