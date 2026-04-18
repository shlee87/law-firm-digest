// TDD coverage for src/mailer/gmail.ts Phase 2 EMAIL-07 retry policy.
//
// Mocks nodemailer.createTransport so we never make real SMTP connections.
// Nine behaviors locked:
//   1. DRY_RUN short-circuit (no transporter created).
//   2. Happy path (single attempt, resolves).
//   3. 5xx retry → eventual success (3 attempts, resolves).
//   4. 5xx retry → exhausted (4 attempts, throws with "SMTP transient:" prefix).
//   5. 535 immediate fail (1 attempt, GMAIL_AUTH_FAILURE in console.error).
//   6. 535 via response string (A4 defensive check — 1 attempt, same markers).
//   7. Non-5xx immediate fail (1 attempt, "SMTP 421:" prefix).
//   8. scrubSecrets applied to thrown message (GMAIL_APP_PASSWORD redacted).
//   9. onFailedAttempt uses destructured { attemptNumber, retriesLeft, error }.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted is required because vi.mock is hoisted above module-level `const`
// declarations. Use hoisted refs so the factory can reference them safely.
const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

import { sendMail } from '../../src/mailer/gmail.js';

const payload = {
  subject: 'Test',
  html: '<p>test</p>',
  to: 'user@example.com',
  from: 'user@example.com',
} as const;

function smtpErr(
  fields: Partial<{ responseCode: number; response: string; message: string }>,
): Error {
  const e = new Error(fields.message ?? 'smtp error') as Error & typeof fields;
  Object.assign(e, fields);
  return e;
}

describe('sendMail (EMAIL-07 retry policy)', () => {
  const origDryRun = process.env.DRY_RUN;
  const origAppPass = process.env.GMAIL_APP_PASSWORD;

  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    delete process.env.DRY_RUN;
    process.env.GMAIL_APP_PASSWORD = 'SHORT'; // len <=8 skips scrub
  });

  afterEach(() => {
    vi.useRealTimers();
    if (origDryRun === undefined) delete process.env.DRY_RUN;
    else process.env.DRY_RUN = origDryRun;
    if (origAppPass === undefined) delete process.env.GMAIL_APP_PASSWORD;
    else process.env.GMAIL_APP_PASSWORD = origAppPass;
  });

  it('DRY_RUN short-circuit — no transporter created', async () => {
    process.env.DRY_RUN = '1';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendMail(payload);
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('[DRY_RUN] Subject:', payload.subject);
    logSpy.mockRestore();
  });

  it('happy path — single attempt, resolves', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'abc' });
    await expect(sendMail(payload)).resolves.toBeUndefined();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('5xx retry → eventual success (3 attempts total)', async () => {
    sendMailMock
      .mockRejectedValueOnce(
        smtpErr({ responseCode: 503, message: 'Service Unavailable' }),
      )
      .mockRejectedValueOnce(
        smtpErr({ responseCode: 503, message: 'Service Unavailable' }),
      )
      .mockResolvedValueOnce({ messageId: 'abc' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(sendMail(payload)).resolves.toBeUndefined();
    expect(sendMailMock).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2); // two retries logged
    warnSpy.mockRestore();
  }, 30_000);

  it('5xx retry → exhausted after 4 attempts, throws with "SMTP transient:" and "SMTP send failed:" wrapper', async () => {
    sendMailMock.mockRejectedValue(
      smtpErr({ responseCode: 503, message: 'Service Unavailable' }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(sendMail(payload)).rejects.toThrow(
      /SMTP send failed:.*SMTP transient:/,
    );
    expect(sendMailMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    warnSpy.mockRestore();
  }, 30_000);

  it('535 AbortError — immediate fail, GMAIL_AUTH_FAILURE in console.error', async () => {
    sendMailMock.mockRejectedValue(
      smtpErr({
        responseCode: 535,
        message: 'Username and Password not accepted',
      }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendMail(payload)).rejects.toThrow(/SMTP 535 auth:/);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      'GMAIL_AUTH_FAILURE: App Password invalid or revoked.',
    );
    expect(errSpy).toHaveBeenCalledWith(
      'Regenerate at https://myaccount.google.com/apppasswords and update GMAIL_APP_PASSWORD secret.',
    );
    errSpy.mockRestore();
  });

  it('535 via response string (A4 defensive — no responseCode field)', async () => {
    sendMailMock.mockRejectedValue(
      smtpErr({
        response: '535 5.7.8 authentication failed',
        message: '535 auth failed',
      }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendMail(payload)).rejects.toThrow(/SMTP 535 auth:/);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      'GMAIL_AUTH_FAILURE: App Password invalid or revoked.',
    );
    errSpy.mockRestore();
  });

  it('non-5xx code (421) — immediate fail, no retry', async () => {
    sendMailMock.mockRejectedValue(
      smtpErr({ responseCode: 421, message: 'Try again later' }),
    );
    await expect(sendMail(payload)).rejects.toThrow(/SMTP 421:/);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('scrubSecrets redacts GMAIL_APP_PASSWORD in thrown error message', async () => {
    process.env.GMAIL_APP_PASSWORD = 'FAKE_PASSWORD_123456'; // len > 8
    sendMailMock.mockRejectedValue(
      smtpErr({
        responseCode: 503,
        message: 'failed at FAKE_PASSWORD_123456 step',
      }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(sendMail(payload)).rejects.toThrow(/\*\*\*REDACTED\*\*\*/);
    warnSpy.mockRestore();
  }, 60_000);

  it('onFailedAttempt uses v8 destructured signature — retry counter logs are well-formed', async () => {
    sendMailMock
      .mockRejectedValueOnce(
        smtpErr({ responseCode: 503, message: 'Service Unavailable' }),
      )
      .mockRejectedValueOnce(
        smtpErr({ responseCode: 503, message: 'Service Unavailable' }),
      )
      .mockResolvedValueOnce({ messageId: 'abc' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await sendMail(payload);
    const logs = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(logs.length).toBe(2);
    for (const log of logs) {
      expect(log).toMatch(/^\[SMTP retry \d+\/\d+\]/);
      expect(log).not.toContain('undefined');
    }
    warnSpy.mockRestore();
  }, 30_000);
});
