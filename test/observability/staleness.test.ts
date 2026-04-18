import { describe, it, expect } from 'vitest';
import { detectStaleness } from '../../src/observability/staleness.js';
import type { FirmConfig, SeenState } from '../../src/types.js';

const NOW = new Date('2026-04-18T00:00:00.000Z');
const NOW_MS = NOW.getTime();

function daysAgo(d: number): string {
  return new Date(NOW_MS - d * 24 * 60 * 60 * 1000).toISOString();
}
function hoursAgo(h: number): string {
  return new Date(NOW_MS - h * 60 * 60 * 1000).toISOString();
}
function makeFirm(id: string, name: string, enabled = true): FirmConfig {
  return {
    id,
    name,
    language: 'ko',
    type: 'html',
    url: `https://example.com/${id}`,
    timezone: 'Asia/Seoul',
    enabled,
  };
}

describe('detectStaleness — pure function', () => {
  describe('cold start / empty inputs', () => {
    it('returns empty warnings when seen has no firms and no lastUpdated', () => {
      const seen: SeenState = { version: 1, lastUpdated: null, firms: {} };
      const warnings = detectStaleness(seen, [], NOW);
      expect(warnings.staleFirms).toEqual([]);
      expect(warnings.lastRunStale).toBeNull();
    });

    it('lastRunStale is null when seen.lastUpdated is null regardless of firms', () => {
      const seen: SeenState = { version: 1, lastUpdated: null, firms: {} };
      const warnings = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(warnings.lastRunStale).toBeNull();
    });
  });

  describe('last-run staleness (OPS-05, 30h threshold)', () => {
    it('null when lastUpdated is 29 hours ago', () => {
      const seen: SeenState = { version: 1, lastUpdated: hoursAgo(29), firms: {} };
      expect(detectStaleness(seen, [], NOW).lastRunStale).toBeNull();
    });

    it('fires when lastUpdated is 31 hours ago with hoursAgo=31', () => {
      const seen: SeenState = { version: 1, lastUpdated: hoursAgo(31), firms: {} };
      const w = detectStaleness(seen, [], NOW);
      expect(w.lastRunStale).toEqual({ hoursAgo: 31 });
    });

    it('floors hoursAgo rather than rounding', () => {
      const seen: SeenState = { version: 1, lastUpdated: hoursAgo(72.9), firms: {} };
      const w = detectStaleness(seen, [], NOW);
      expect(w.lastRunStale?.hoursAgo).toBe(72);
    });

    it('threshold boundary (exactly 30 hours) fires', () => {
      const seen: SeenState = { version: 1, lastUpdated: hoursAgo(30), firms: {} };
      const w = detectStaleness(seen, [], NOW);
      expect(w.lastRunStale).toEqual({ hoursAgo: 30 });
    });
  });

  describe('firm staleness (OPS-04, 30d threshold)', () => {
    it('does NOT flag a firm with lastNewAt 29 days ago', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: daysAgo(29), enabledAt: daysAgo(200) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual([]);
    });

    it('flags a firm with lastNewAt 31 days ago by display name', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: daysAgo(31), enabledAt: daysAgo(200) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', '김앤장')], NOW);
      expect(w.staleFirms).toEqual(['김앤장']);
    });

    it('threshold boundary (exactly 30 days) fires', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: daysAgo(30), enabledAt: daysAgo(200) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual(['A']);
    });
  });

  describe('D-02 bootstrap grace period', () => {
    it('firm within 30-day grace is NOT flagged even when lastNewAt is 31 days ago', () => {
      // Artificial scenario — manual state edit, grace wins
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: daysAgo(31), enabledAt: daysAgo(10) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual([]);
    });

    it('firm past 30-day grace IS flagged normally (grace expired, normal rules apply)', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: daysAgo(31), enabledAt: daysAgo(60) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual(['A']);
    });

    it('firm within grace AND lastNewAt=null is NOT flagged (grace wins)', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: null, enabledAt: daysAgo(10) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual([]);
    });

    it('firm past grace AND lastNewAt=null IS flagged (conservative policy)', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: null, enabledAt: daysAgo(60) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual(['A']);
    });
  });

  describe('legacy entries (Pitfall 9 — no retrofit)', () => {
    it('legacy entry with lastNewAt=null AND no enabledAt IS flagged', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: null } }, // no enabledAt
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual(['A']);
    });

    it('legacy entry with lastNewAt 31 days ago AND no enabledAt IS flagged', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: daysAgo(31) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual(['A']);
    });

    it('legacy entry with lastNewAt 29 days ago AND no enabledAt is NOT flagged', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: daysAgo(29) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual([]);
    });
  });

  describe('disabled-firm filter (Pitfall 1)', () => {
    it('firm with enabled:false is never flagged even with 31-day-old lastNewAt', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: { a: { urls: [], lastNewAt: daysAgo(31) } },
      };
      const w = detectStaleness(seen, [makeFirm('a', 'A', false)], NOW);
      expect(w.staleFirms).toEqual([]);
    });

    it('pre-bootstrap firm (in config, not in seen.firms) is never flagged', () => {
      const seen: SeenState = { version: 1, lastUpdated: hoursAgo(1), firms: {} };
      const w = detectStaleness(seen, [makeFirm('a', 'A')], NOW);
      expect(w.staleFirms).toEqual([]);
    });
  });

  describe('output ordering + determinism', () => {
    it('staleFirms order mirrors firms[] input order', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(1),
        firms: {
          a: { urls: [], lastNewAt: daysAgo(31) },
          b: { urls: [], lastNewAt: daysAgo(31) },
          c: { urls: [], lastNewAt: daysAgo(31) },
        },
      };
      const firms = [makeFirm('c', 'C'), makeFirm('a', 'A'), makeFirm('b', 'B')];
      const w = detectStaleness(seen, firms, NOW);
      expect(w.staleFirms).toEqual(['C', 'A', 'B']);
    });

    it('same inputs produce identical outputs (pure function determinism)', () => {
      const seen: SeenState = {
        version: 1,
        lastUpdated: hoursAgo(31),
        firms: { a: { urls: [], lastNewAt: daysAgo(31) } },
      };
      const firms = [makeFirm('a', 'A')];
      const w1 = detectStaleness(seen, firms, NOW);
      const w2 = detectStaleness(seen, firms, NOW);
      expect(w1).toEqual(w2);
    });
  });
});
