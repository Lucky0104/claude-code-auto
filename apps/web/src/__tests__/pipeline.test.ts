import { describe, expect, it } from 'vitest';
import { pickReplyText } from '@/lib/pipeline';
import type { OrmRule } from '@repo/types';

function makeRule(overrides: Partial<OrmRule> = {}): OrmRule {
  return {
    id: 'rule-1',
    org_id: 'org-1',
    comment_type: 'price',
    keywords: ['price'],
    reply_en: 'English reply',
    reply_hi: 'हिंदी उत्तर',
    reply_hn: 'Hinglish reply',
    reply_bn: 'বাংলা উত্তর',
    reply_mr: 'मराठी उत्तर',
    priority: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('pickReplyText', () => {
  it('returns the exact reply for the detected language', () => {
    const rule = makeRule();
    expect(pickReplyText(rule, 'hi')).toBe('हिंदी उत्तर');
    expect(pickReplyText(rule, 'hn')).toBe('Hinglish reply');
    expect(pickReplyText(rule, 'bn')).toBe('বাংলা উত্তর');
    expect(pickReplyText(rule, 'mr')).toBe('मराठी उत्तर');
    expect(pickReplyText(rule, 'en')).toBe('English reply');
  });

  it('falls back to English when the language column is empty', () => {
    const rule = makeRule({ reply_bn: null, reply_mr: null });
    expect(pickReplyText(rule, 'bn')).toBe('English reply');
    expect(pickReplyText(rule, 'mr')).toBe('English reply');
  });

  it('returns null when no reply exists at all', () => {
    const rule = makeRule({
      reply_en: null,
      reply_hi: null,
      reply_hn: null,
      reply_bn: null,
      reply_mr: null,
    });
    expect(pickReplyText(rule, 'hi')).toBeNull();
  });
});
