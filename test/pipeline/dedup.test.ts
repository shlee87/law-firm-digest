// dedup contract — locked via TDD RED→GREEN.
//
// dedupAll(results, seen) is a pure function. Its six behaviors, each
// pinned by one `it(...)` block below:
//   1. Bootstrap (D-09) — seen.firms[id] missing → new: []; r.raw is preserved
//      so plan 10's state writer can use it to seed state (B1 cross-plan
//      contract).
//   2. Normal — raw items whose canonical URL is NOT in seen become new.
//   3. All-seen — every raw URL already in seen → new: [].
//   4. Empty-raw — r.raw: [] → new: [].
//   5. Error pass-through — FirmResult with error is returned unchanged
//      (same reference).
//   6. No mutation — input results array and its contents unchanged.

import { describe, it, expect } from 'vitest';
import { dedupAll } from '../../src/pipeline/dedup.js';
import type { FirmConfig, FirmResult, SeenState } from '../../src/types.js';

const cooley: FirmConfig = {
  id: 'cooley',
  name: 'Cooley',
  language: 'en',
  type: 'rss',
  url: 'https://cooley.com/feed',
  timezone: 'America/Los_Angeles',
  enabled: true,
  timeout_ms: 20000,
};

function makeResult(raw: Array<{ url: string; title: string }>): FirmResult {
  return {
    firm: cooley,
    raw: raw.map((r) => ({
      firmId: 'cooley',
      title: r.title,
      url: r.url,
      language: 'en',
    })),
    new: [],
    summarized: [],
    durationMs: 0,
  };
}

describe('dedupAll', () => {
  it('bootstrap — seen.firms[id] missing → new is empty (D-09); raw preserved for writer seeding (B1)', () => {
    const results = [
      makeResult([
        { url: 'https://cooley.com/a', title: 'A' },
        { url: 'https://cooley.com/b', title: 'B' },
      ]),
    ];
    const seen: SeenState = { version: 1, lastUpdated: null, firms: {} };
    const out = dedupAll(results, seen);
    expect(out).toHaveLength(1);
    expect(out[0].new).toEqual([]);
    // B1 cross-plan invariant: raw is not dropped — writer needs it to seed state.
    expect(out[0].raw).toHaveLength(2);
    expect(out[0].raw.map((r) => r.url)).toEqual([
      'https://cooley.com/a',
      'https://cooley.com/b',
    ]);
  });

  it('normal — only URLs absent from seen become new', () => {
    const results = [
      makeResult([
        { url: 'https://cooley.com/a', title: 'A' },
        { url: 'https://cooley.com/b', title: 'B' },
        { url: 'https://cooley.com/c', title: 'C' },
      ]),
    ];
    const seen: SeenState = {
      version: 1,
      lastUpdated: '2026-04-16T00:00:00.000Z',
      firms: { cooley: { urls: ['https://cooley.com/a'], lastNewAt: null } },
    };
    const out = dedupAll(results, seen);
    expect(out[0].new).toHaveLength(2);
    expect(out[0].new.map((n) => n.url)).toEqual([
      'https://cooley.com/b',
      'https://cooley.com/c',
    ]);
    expect(out[0].new.every((n) => n.isNew === true)).toBe(true);
  });

  it('all-seen — raw is fully contained in seen → new empty', () => {
    const results = [
      makeResult([
        { url: 'https://cooley.com/a', title: 'A' },
        { url: 'https://cooley.com/b', title: 'B' },
      ]),
    ];
    const seen: SeenState = {
      version: 1,
      lastUpdated: null,
      firms: {
        cooley: {
          urls: ['https://cooley.com/a', 'https://cooley.com/b'],
          lastNewAt: null,
        },
      },
    };
    const out = dedupAll(results, seen);
    expect(out[0].new).toEqual([]);
  });

  it('empty raw — new empty even if seen is populated', () => {
    const results = [makeResult([])];
    const seen: SeenState = {
      version: 1,
      lastUpdated: null,
      firms: { cooley: { urls: ['https://cooley.com/x'], lastNewAt: null } },
    };
    const out = dedupAll(results, seen);
    expect(out[0].new).toEqual([]);
  });

  it('error pass-through — FirmResult with error is unchanged', () => {
    const errorResult: FirmResult = {
      firm: cooley,
      raw: [],
      new: [],
      summarized: [],
      error: { stage: 'fetch', message: 'network down' },
      durationMs: 0,
    };
    const seen: SeenState = { version: 1, lastUpdated: null, firms: {} };
    const out = dedupAll([errorResult], seen);
    expect(out[0]).toBe(errorResult); // same reference — pass-through
    expect(out[0].error?.message).toBe('network down');
  });

  it('does not mutate input results', () => {
    const results = [
      makeResult([{ url: 'https://cooley.com/a', title: 'A' }]),
    ];
    const seen: SeenState = { version: 1, lastUpdated: null, firms: {} };
    const before = JSON.stringify(results);
    dedupAll(results, seen);
    const after = JSON.stringify(results);
    expect(after).toBe(before);
  });
});
