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
