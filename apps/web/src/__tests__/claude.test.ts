import { describe, expect, it, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

import { classifyComment, getPhoneFooter } from '@/lib/claude';

beforeEach(() => {
  createMock.mockReset();
});

describe('classifyComment', () => {
  it('parses a clean JSON classification', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: '{"language":"hn","comment_type":"price","confidence":0.95}' },
      ],
    });

    const result = await classifyComment('price kitna hai?', ['price', 'location']);
    expect(result).toEqual({ language: 'hn', comment_type: 'price', confidence: 0.95 });
  });

  it('extracts JSON even with surrounding text', async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'Here is the result: {"language":"hi","comment_type":"location","confidence":0.8} done',
        },
      ],
    });

    const result = await classifyComment('कहाँ है क्लिनिक?', ['price', 'location']);
    expect(result.language).toBe('hi');
    expect(result.comment_type).toBe('location');
  });

  it('defaults invalid language to en', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: '{"language":"xx","comment_type":"price","confidence":0.5}' },
      ],
    });

    const result = await classifyComment('how much?', ['price']);
    expect(result.language).toBe('en');
  });
});

describe('getPhoneFooter', () => {
  it('returns static footers without calling Claude', async () => {
    expect(await getPhoneFooter('en', '8938935656')).toBe(
      'For any further questions, call us @ 8938935656'
    );
    expect(await getPhoneFooter('hi', '8938935656')).toBe(
      'किसी भी अतिरिक्त जानकारी के लिए हमें कॉल करें @ 8938935656'
    );
    expect(await getPhoneFooter('hn', '8938935656')).toBe(
      'For kisi bhi further questions, call us @ 8938935656'
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('translates Bengali via Claude and caches the result', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'যেকোনো প্রশ্নের জন্য কল করুন @ 8938935656' }],
    });

    const first = await getPhoneFooter('bn', '8938935656');
    const second = await getPhoneFooter('bn', '8938935656');
    expect(first).toContain('8938935656');
    expect(second).toBe(first);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
