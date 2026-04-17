import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { loadRecipient } from '../../src/config/loader.js';

const ORIGINAL_ENV = process.env.RECIPIENT_EMAIL;

describe('loadRecipient', () => {
  beforeEach(() => {
    delete process.env.RECIPIENT_EMAIL;
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.RECIPIENT_EMAIL;
    else process.env.RECIPIENT_EMAIL = ORIGINAL_ENV;
  });

  it('returns the YAML placeholder string when no env var is set', async () => {
    const result = await loadRecipient();
    expect(result).toBe('your.email@example.com');
  });

  it('returns a single env-override string when RECIPIENT_EMAIL has no comma', async () => {
    process.env.RECIPIENT_EMAIL = 'solo@example.com';
    const result = await loadRecipient();
    expect(result).toBe('solo@example.com');
  });

  it('splits comma-separated RECIPIENT_EMAIL into an array and trims whitespace', async () => {
    process.env.RECIPIENT_EMAIL = 'first@example.com, second@example.com ,third@example.com';
    const result = await loadRecipient();
    expect(result).toEqual([
      'first@example.com',
      'second@example.com',
      'third@example.com',
    ]);
  });

  it('rejects malformed env input (fails fast via zod)', async () => {
    process.env.RECIPIENT_EMAIL = 'valid@example.com,not-an-email';
    await expect(loadRecipient()).rejects.toThrow();
  });
});
