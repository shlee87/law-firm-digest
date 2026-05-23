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

describe('composeHeartbeat curated topics footer (quick 260523-oi6)', () => {
  const TOPICS_FIXTURE = {
    vc_securities: ['VC'],
    fair_trade: ['공정거래'],
    privacy: ['개인정보'],
    labor: ['노동'],
    ip: ['특허'],
  };

  it('Test D: renders curated-topics prose BEFORE the "시스템은 정상 작동 중입니다." closing line', () => {
    const now = new Date('2026-05-22T00:00:00.000Z');
    const out = composeHeartbeat(
      'user@example.com',
      'sender@example.com',
      now,
      TOPICS_FIXTURE,
    );
    expect(out.html).toContain(
      '현재 이 다이제스트는 다음 분야를 큐레이션합니다: VC·증권, 공정거래, 개인정보, 노동법, 지식재산권.',
    );
    const topicsIdx = out.html.indexOf(
      '현재 이 다이제스트는 다음 분야를 큐레이션합니다:',
    );
    const closingIdx = out.html.indexOf('시스템은 정상 작동 중입니다');
    expect(topicsIdx).toBeGreaterThan(0);
    expect(topicsIdx).toBeLessThan(closingIdx);
  });

  it('Test E: topics arg omitted → curated-topics prose absent (backwards-compat)', () => {
    const now = new Date('2026-05-22T00:00:00.000Z');
    const out = composeHeartbeat('user@example.com', 'sender@example.com', now);
    expect(out.html).not.toContain(
      '현재 이 다이제스트는 다음 분야를 큐레이션합니다:',
    );
    expect(out.html).not.toContain('큐레이션 분야');
  });
});
