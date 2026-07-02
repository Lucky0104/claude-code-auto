import { beforeAll, describe, expect, it } from 'vitest';
import { encrypt, decrypt } from '@/lib/crypto';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('crypto', () => {
  it('round-trips a token', () => {
    const token = 'EAABsbCS1234567890fake-meta-token';
    const encrypted = encrypt(token);
    expect(encrypted).not.toBe(token);
    expect(decrypt(encrypted)).toBe(token);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('handles unicode (Hindi text)', () => {
    const text = 'किसी भी अतिरिक्त जानकारी के लिए हमें कॉल करें @ 8938935656';
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encrypt('secret');
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });
});
