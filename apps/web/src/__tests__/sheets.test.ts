import { describe, expect, it } from 'vitest';
import { extractSheetId, parseOrmRow } from '@/lib/sheets';

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
