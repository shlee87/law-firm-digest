import { describe, it, expect } from 'vitest';
import { composeHeartbeat } from '../../src/compose/heartbeat.js';

describe('composeHeartbeat (Phase 13 D-15/D-16/D-17)', () => {
  it('subject uses EMAIL-04 prefix + Korean empty-week marker', () => {
    const now = new Date('2026-05-22T03:00:00.000Z'); // 12:00 KST same day
    const out = composeHeartbeat('user@example.com', 'sender@example.com', now);
    expect(out.subject).toBe('[법률 다이제스트] 2026-05-22 (이번 주 신규 없음)');
  });

  it('KST midnight rollover: 23:00 UTC May 21 → 08:00 KST May 22', () => {
    const now = new Date('2026-05-21T23:00:00.000Z');
    const out = composeHeartbeat('a@b.com', 'c@d.com', now);
    expect(out.subject).toContain('2026-05-22');
  });

  it('html body contains heading + 2 Korean paragraphs (D-17 minimal)', () => {
    const now = new Date('2026-05-22T00:00:00.000Z');
    const out = composeHeartbeat('user@example.com', 'sender@example.com', now);
    expect(out.html).toContain('<h1>법률 다이제스트');
    expect(out.html).toContain('이번 주 새 뉴스레터가 없습니다');
    expect(out.html).toContain('시스템은 정상 작동 중입니다');
  });

  it('to/from set from args; array recipient passed through', () => {
    const now = new Date('2026-05-22T00:00:00.000Z');
    const out = composeHeartbeat(['a@b.com', 'c@d.com'], 'sender@example.com', now);
    expect(out.to).toEqual(['a@b.com', 'c@d.com']);
    expect(out.from).toBe('sender@example.com');
  });

  it('does NOT contain failed-firm or marker block keywords (D-17)', () => {
    const now = new Date('2026-05-22T00:00:00.000Z');
    const out = composeHeartbeat('user@example.com', 'sender@example.com', now);
    expect(out.html).not.toContain('실패');
    expect(out.html).not.toContain('Data Quality');
    expect(out.html).not.toContain('HALLUCINATION');
  });
});
