import { describe, expect, it } from 'vitest';
import {
  assembleRulesFromMap,
  buildGridPreview,
  extractSheetId,
  parseCsv,
  parseOrmRow,
} from '@/lib/sheets';

describe('extractSheetId', () => {
  it('extracts ID from a full sheet URL', () => {
    expect(
      extractSheetId(
        'https://docs.google.com/spreadsheets/d/1AbC-dEf_123456789012345/edit#gid=0'
      )
    ).toBe('1AbC-dEf_123456789012345');
  });

  it('passes through a bare sheet ID', () => {
    expect(extractSheetId('1AbC-dEf_123456789012345')).toBe('1AbC-dEf_123456789012345');
  });

  it('rejects garbage', () => {
    expect(() => extractSheetId('not a sheet')).toThrow();
  });
});

describe('parseOrmRow', () => {
  it('parses a complete row', () => {
    const row = parseOrmRow([
      'Price',
      'price, cost, kitna, kharcha',
      'Our packages start at ₹90,000.',
      'हमारे पैकेज ₹90,000 से शुरू होते हैं।',
      'Hamare packages ₹90,000 se start hote hain.',
      'আমাদের প্যাকেজ ₹90,000 থেকে শুরু।',
      'आमचे पॅकेज ₹90,000 पासून सुरू होतात.',
    ]);

    expect(row.comment_type).toBe('price');
    expect(row.keywords).toEqual(['price', 'cost', 'kitna', 'kharcha']);
    expect(row.reply_en).toBe('Our packages start at ₹90,000.');
    expect(row.reply_hi).toContain('₹90,000');
    expect(row.reply_hn).toContain('start hote hain');
    expect(row.reply_bn).toBeTruthy();
    expect(row.reply_mr).toBeTruthy();
  });

  it('handles missing language columns', () => {
    const row = parseOrmRow(['Location', 'where, address, kahan', 'We are in Delhi.']);
    expect(row.comment_type).toBe('location');
    expect(row.reply_en).toBe('We are in Delhi.');
    expect(row.reply_hi).toBeNull();
    expect(row.reply_mr).toBeNull();
  });

  it('normalizes comment_type to lowercase and trims keywords', () => {
    const row = parseOrmRow(['  APPOINTMENT ', ' book ,  slot ', 'Book here.']);
    expect(row.comment_type).toBe('appointment');
    expect(row.keywords).toEqual(['book', 'slot']);
  });
});

describe('parseCsv', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b,c\nd,e,f')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('handles quoted fields with commas, escaped quotes and newlines', () => {
    const csv = '"price","cost, kitna","She said ""hi""","line1\nline2"';
    expect(parseCsv(csv)).toEqual([['price', 'cost, kitna', 'She said "hi"', 'line1\nline2']]);
  });

  it('handles CRLF line endings and trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('buildGridPreview', () => {
  it('emits [row,col] coordinates, skips empty rows, truncates long cells', () => {
    const grid = [
      ['Query', 'English'],
      ['', ''],
      ['Cost', `${'x'.repeat(100)}`],
    ];
    const preview = buildGridPreview(grid);
    const lines = preview.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('[0,0] Query | [0,1] English');
    expect(lines[1]).toContain('[2,0] Cost');
    expect(lines[1]).toContain('…');
    expect(lines[1]).not.toContain('x'.repeat(100));
  });
});

describe('assembleRulesFromMap', () => {
  const grid = [
    ['Query', 'English', 'Hindi'],
    ['Cost', 'IVF costs 1-2 lakh.', 'आईवीएफ की लागत 1-2 लाख।'],
    ['', 'Thanks, Crysta Team', ''],
    ['Hi', 'Welcome! How can we help?', ''],
  ];

  it('extracts text verbatim and joins multi-cell replies', () => {
    const rules = assembleRulesFromMap(grid, [
      {
        comment_type: 'price',
        keywords: ['cost', 'kitna'],
        cells: {
          en: [
            [1, 1],
            [2, 1],
          ],
          hi: [[1, 2]],
        },
      },
      { comment_type: 'general', keywords: [], cells: { en: [[3, 1]] } },
    ]);

    expect(rules).toHaveLength(2);
    expect(rules[0].comment_type).toBe('price');
    expect(rules[0].reply_en).toBe('IVF costs 1-2 lakh.\n\nThanks, Crysta Team');
    expect(rules[0].reply_hi).toBe('आईवीएफ की लागत 1-2 लाख।');
    expect(rules[0].reply_bn).toBeNull();
    expect(rules[1].reply_en).toBe('Welcome! How can we help?');
  });

  it('drops duplicate types, out-of-bounds coords and rules with no replies', () => {
    const rules = assembleRulesFromMap(grid, [
      { comment_type: 'price', keywords: [], cells: { en: [[1, 1]] } },
      { comment_type: 'Price', keywords: [], cells: { en: [[3, 1]] } },
      { comment_type: 'ghost', keywords: [], cells: { en: [[99, 9]] } },
    ]);

    expect(rules).toHaveLength(1);
    expect(rules[0].comment_type).toBe('price');
  });
});
