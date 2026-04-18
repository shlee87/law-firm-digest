// W2 test suite pinning src/state/writer.ts behavior.
//
// Five assertions map 1:1 to plan 01-10's acceptance criteria:
//   (a) 500-cap newest-first (DEDUP-04)
//   (b) DRY_RUN short-circuit — no file written (OPS-06)
//   (c) r.error pass-through — prior urls untouched on fetch fail
//   (d) B1 bootstrap — urls seeded from r.raw (NOT r.summarized) so
//       main.ts's skip-summarization-on-bootstrap path doesn't leave
//       seen empty and flood the user on run 2 (D-09)
//   (e) firms absent from current results pass through from prior
//
// Each test writes to a tmp file in `test/tmp-state.json` and cleans up
// both the file and its `.tmp` sibling in before/after hooks. No shared
// state between tests; DRY_RUN env var is explicitly reset.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { writeState } from '../../src/state/writer.js';
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

const TMP = 'test/tmp-state.json';

async function readJson(p: string) {
  return JSON.parse(await readFile(p, 'utf8'));
}

describe('writeState', () => {
  beforeEach(async () => {
    if (existsSync(TMP)) await rm(TMP);
    if (existsSync(`${TMP}.tmp`)) await rm(`${TMP}.tmp`);
    delete process.env.DRY_RUN;
  });
  afterEach(async () => {
    if (existsSync(TMP)) await rm(TMP);
    if (existsSync(`${TMP}.tmp`)) await rm(`${TMP}.tmp`);
    delete process.env.DRY_RUN;
  });

  it('(a) enforces 500-cap newest-first', async () => {
    // 501 prior URLs + 1 new → keep 500, newest first.
    const priorUrls = Array.from(
      { length: 501 },
      (_, i) => `https://cooley.com/p${i}`,
    );
    const prior: SeenState = {
      version: 1,
      lastUpdated: null,
      firms: { cooley: { urls: priorUrls, lastNewAt: null } },
    };
    const r: FirmResult = {
      firm: cooley,
      raw: [],
      new: [],
      summarized: [
        {
          firmId: 'cooley',
          title: 'new item',
          url: 'https://cooley.com/newest',
          language: 'en',
          isNew: true,
          summary_ko: 'x',
          summaryConfidence: 'high',
          summaryModel: 'gemini-2.5-flash',
        },
      ],
      durationMs: 0,
    };
    await writeState(prior, [r], TMP);
    const written = await readJson(TMP);
    expect(written.firms.cooley.urls).toHaveLength(500);
    expect(written.firms.cooley.urls[0]).toBe('https://cooley.com/newest'); // newest-first
    expect(written.firms.cooley.urls).not.toContain(
      'https://cooley.com/p500',
    ); // oldest dropped
  });

  it('(b) DRY_RUN=1 short-circuits — no file written', async () => {
    process.env.DRY_RUN = '1';
    const prior: SeenState = { version: 1, lastUpdated: null, firms: {} };
    const r: FirmResult = {
      firm: cooley,
      raw: [
        {
          firmId: 'cooley',
          title: 'x',
          url: 'https://cooley.com/x',
          language: 'en',
        },
      ],
      new: [],
      summarized: [],
      durationMs: 0,
    };
    await expect(writeState(prior, [r], TMP)).resolves.toBeUndefined();
    expect(existsSync(TMP)).toBe(false);
    expect(existsSync(`${TMP}.tmp`)).toBe(false);
  });

  it('(c) r.error pass-through — errored firm keeps prior urls untouched', async () => {
    const prior: SeenState = {
      version: 1,
      lastUpdated: null,
      firms: {
        cooley: {
          urls: ['https://cooley.com/p1'],
          lastNewAt: '2026-04-10T00:00:00.000Z',
        },
      },
    };
    const r: FirmResult = {
      firm: cooley,
      raw: [],
      new: [],
      summarized: [],
      error: { stage: 'fetch', message: 'network down' },
      durationMs: 0,
    };
    await writeState(prior, [r], TMP);
    const written = await readJson(TMP);
    expect(written.firms.cooley.urls).toEqual(['https://cooley.com/p1']);
    expect(written.firms.cooley.lastNewAt).toBe('2026-04-10T00:00:00.000Z');
  });

  it('(d) bootstrap — prior.firms empty, r.raw has items → urls seeded from raw (B1)', async () => {
    const prior: SeenState = { version: 1, lastUpdated: null, firms: {} };
    const r: FirmResult = {
      firm: cooley,
      raw: [
        {
          firmId: 'cooley',
          title: 'A',
          url: 'https://cooley.com/a',
          publishedAt: '2026-04-15T12:00:00.000Z',
          language: 'en',
        },
        {
          firmId: 'cooley',
          title: 'B',
          url: 'https://cooley.com/b',
          publishedAt: '2026-04-14T12:00:00.000Z',
          language: 'en',
        },
        {
          firmId: 'cooley',
          title: 'C',
          url: 'https://cooley.com/c',
          publishedAt: '2026-04-13T12:00:00.000Z',
          language: 'en',
        },
      ],
      new: [], // dedupAll emits [] on bootstrap
      summarized: [], // main.ts skips summarization when new.length === 0
      durationMs: 0,
    };
    await writeState(prior, [r], TMP);
    const written = await readJson(TMP);
    expect(written.firms.cooley.urls).toHaveLength(3);
    expect(written.firms.cooley.urls).toEqual([
      'https://cooley.com/a',
      'https://cooley.com/b',
      'https://cooley.com/c',
    ]);
    expect(written.firms.cooley.lastNewAt).toBe('2026-04-15T12:00:00.000Z');
  });

  it('(e) firms absent from current results pass through from prior unchanged', async () => {
    const prior: SeenState = {
      version: 1,
      lastUpdated: '2026-04-10T00:00:00.000Z',
      firms: {
        cooley: {
          urls: ['https://cooley.com/keep'],
          lastNewAt: '2026-04-01T00:00:00.000Z',
        },
        latham: {
          urls: ['https://latham.com/article'],
          lastNewAt: '2026-04-05T00:00:00.000Z',
        },
      },
    };
    // This run only processes cooley (e.g., latham disabled in YAML).
    const r: FirmResult = {
      firm: cooley,
      raw: [],
      new: [],
      summarized: [], // zero new items this run
      durationMs: 0,
    };
    await writeState(prior, [r], TMP);
    const written = await readJson(TMP);
    expect(written.firms.latham).toEqual({
      urls: ['https://latham.com/article'],
      lastNewAt: '2026-04-05T00:00:00.000Z',
    });
    // cooley keeps its prior urls (zero new summarized)
    expect(written.firms.cooley.urls).toEqual(['https://cooley.com/keep']);
    expect(written.firms.cooley.lastNewAt).toBe('2026-04-01T00:00:00.000Z');
  });

  // --- Phase 2 D-P2-08 empty-state bootstrap mirror ---

  it('(D-P2-08) empty-state firm ({urls:[], lastNewAt:null}) seeds urls from r.raw', async () => {
    const prior: SeenState = {
      version: 1,
      lastUpdated: '2026-04-10T00:00:00.000Z',
      firms: { cooley: { urls: [], lastNewAt: null } },
    };
    const r: FirmResult = {
      firm: cooley,
      raw: [
        {
          firmId: 'cooley',
          title: 'A',
          url: 'https://cooley.com/a',
          publishedAt: '2026-04-15T12:00:00.000Z',
          language: 'en',
        },
        {
          firmId: 'cooley',
          title: 'B',
          url: 'https://cooley.com/b',
          publishedAt: '2026-04-14T12:00:00.000Z',
          language: 'en',
        },
      ],
      new: [],
      summarized: [],
      durationMs: 0,
    };
    await writeState(prior, [r], TMP);
    const written = await readJson(TMP);
    expect(written.firms.cooley.urls).toEqual([
      'https://cooley.com/a',
      'https://cooley.com/b',
    ]);
    expect(written.firms.cooley.lastNewAt).toBe('2026-04-15T12:00:00.000Z');
  });

  it('(D-P2-08) non-empty prior urls — writer does NOT reseed, preserves prior', async () => {
    const prior: SeenState = {
      version: 1,
      lastUpdated: '2026-04-10T00:00:00.000Z',
      firms: { cooley: { urls: ['https://cooley.com/old'], lastNewAt: null } },
    };
    const r: FirmResult = {
      firm: cooley,
      raw: [],
      new: [],
      summarized: [], // no new items this run
      durationMs: 0,
    };
    await writeState(prior, [r], TMP);
    const written = await readJson(TMP);
    expect(written.firms.cooley.urls).toEqual(['https://cooley.com/old']);
  });
});

describe('Phase 3 D-02 enabledAt handling', () => {
  it('populates enabledAt on first-run bootstrap (priorFirm absent)', async () => {
    const path = `/tmp/seen-test-${Date.now()}-a.json`;
    const prior: SeenState = { version: 1, lastUpdated: null, firms: {} };
    const firmCfg: FirmConfig = {
      id: 'new-firm',
      name: 'New Firm',
      language: 'ko',
      type: 'rss',
      url: 'https://example.com/feed',
      timezone: 'Asia/Seoul',
      enabled: true,
    };
    const result: FirmResult = {
      firm: firmCfg,
      raw: [
        { firmId: 'new-firm', title: 't', url: 'https://example.com/1', language: 'ko' },
      ],
      new: [],
      summarized: [],
      durationMs: 10,
    };
    const before = Date.now();
    await writeState(prior, [result], path);
    const after = Date.now();
    const written = JSON.parse(await readFile(path, 'utf8')) as SeenState;
    expect(written.firms['new-firm'].enabledAt).toBeDefined();
    const t = Date.parse(written.firms['new-firm'].enabledAt!);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
    await unlink(path).catch(() => {});
  });

  it('populates enabledAt on empty-state bootstrap (D-P2-08 path)', async () => {
    const path = `/tmp/seen-test-${Date.now()}-b.json`;
    const prior: SeenState = {
      version: 1,
      lastUpdated: '2026-04-01T00:00:00.000Z',
      firms: { 'ghost-firm': { urls: [], lastNewAt: null } },
    };
    const firmCfg: FirmConfig = {
      id: 'ghost-firm',
      name: 'Ghost',
      language: 'en',
      type: 'html',
      url: 'https://example.com',
      timezone: 'America/New_York',
      enabled: true,
    };
    const result: FirmResult = {
      firm: firmCfg,
      raw: [
        { firmId: 'ghost-firm', title: 't', url: 'https://example.com/1', language: 'en' },
      ],
      new: [],
      summarized: [],
      durationMs: 10,
    };
    await writeState(prior, [result], path);
    const written = JSON.parse(await readFile(path, 'utf8')) as SeenState;
    expect(written.firms['ghost-firm'].enabledAt).toBeDefined();
    await unlink(path).catch(() => {});
  });

  it('preserves priorFirm.enabledAt on subsequent-run merge', async () => {
    const path = `/tmp/seen-test-${Date.now()}-c.json`;
    const ORIGINAL_ENABLED_AT = '2026-04-01T00:00:00.000Z';
    const prior: SeenState = {
      version: 1,
      lastUpdated: '2026-04-15T00:00:00.000Z',
      firms: {
        cooley: {
          urls: ['https://cooleygo.com/existing'],
          lastNewAt: '2026-04-10T00:00:00.000Z',
          enabledAt: ORIGINAL_ENABLED_AT,
        },
      },
    };
    const firmCfg: FirmConfig = {
      id: 'cooley',
      name: 'Cooley',
      language: 'en',
      type: 'rss',
      url: 'https://cooleygo.com/feed/',
      timezone: 'America/Los_Angeles',
      enabled: true,
    };
    const result: FirmResult = {
      firm: firmCfg,
      raw: [
        { firmId: 'cooley', title: 't', url: 'https://cooleygo.com/new', language: 'en' },
      ],
      new: [
        {
          firmId: 'cooley',
          title: 't',
          url: 'https://cooleygo.com/new',
          language: 'en',
          isNew: true,
        },
      ],
      summarized: [
        {
          firmId: 'cooley',
          title: 't',
          url: 'https://cooleygo.com/new',
          language: 'en',
          isNew: true,
          summary_ko: 's',
          summaryConfidence: 'high',
          summaryModel: 'gemini-2.5-flash',
        },
      ],
      durationMs: 10,
    };
    await writeState(prior, [result], path);
    const written = JSON.parse(await readFile(path, 'utf8')) as SeenState;
    expect(written.firms.cooley.enabledAt).toBe(ORIGINAL_ENABLED_AT);
    await unlink(path).catch(() => {});
  });

  it('does NOT retrofit enabledAt on legacy priorFirm without the field (Pitfall 9)', async () => {
    const path = `/tmp/seen-test-${Date.now()}-d.json`;
    const prior: SeenState = {
      version: 1,
      lastUpdated: '2026-04-15T00:00:00.000Z',
      firms: {
        'legacy-firm': {
          urls: ['https://example.com/existing'],
          lastNewAt: '2026-04-10T00:00:00.000Z',
        },
      },
    };
    const firmCfg: FirmConfig = {
      id: 'legacy-firm',
      name: 'Legacy',
      language: 'en',
      type: 'rss',
      url: 'https://example.com/feed',
      timezone: 'UTC',
      enabled: true,
    };
    const result: FirmResult = {
      firm: firmCfg,
      raw: [
        { firmId: 'legacy-firm', title: 't', url: 'https://example.com/new', language: 'en' },
      ],
      new: [
        {
          firmId: 'legacy-firm',
          title: 't',
          url: 'https://example.com/new',
          language: 'en',
          isNew: true,
        },
      ],
      summarized: [
        {
          firmId: 'legacy-firm',
          title: 't',
          url: 'https://example.com/new',
          language: 'en',
          isNew: true,
          summary_ko: 's',
          summaryConfidence: 'high',
          summaryModel: 'gemini-2.5-flash',
        },
      ],
      durationMs: 10,
    };
    await writeState(prior, [result], path);
    const written = JSON.parse(await readFile(path, 'utf8')) as SeenState;
    expect(written.firms['legacy-firm'].enabledAt).toBeUndefined();
    await unlink(path).catch(() => {});
  });

  it('preserves priorFirm.enabledAt when firm fetch-errored (error pass-through)', async () => {
    const path = `/tmp/seen-test-${Date.now()}-e.json`;
    const ORIGINAL_ENABLED_AT = '2026-03-01T00:00:00.000Z';
    const prior: SeenState = {
      version: 1,
      lastUpdated: '2026-04-15T00:00:00.000Z',
      firms: {
        'kim-chang': {
          urls: ['https://www.kimchang.com/old'],
          lastNewAt: '2026-03-15T00:00:00.000Z',
          enabledAt: ORIGINAL_ENABLED_AT,
        },
      },
    };
    const firmCfg: FirmConfig = {
      id: 'kim-chang',
      name: '김앤장',
      language: 'ko',
      type: 'html',
      url: 'https://www.kimchang.com/ko/newsletter.kc',
      timezone: 'Asia/Seoul',
      enabled: true,
    };
    const result: FirmResult = {
      firm: firmCfg,
      raw: [],
      new: [],
      summarized: [],
      error: { stage: 'fetch', message: 'fetch timeout' },
      durationMs: 10,
    };
    await writeState(prior, [result], path);
    const written = JSON.parse(await readFile(path, 'utf8')) as SeenState;
    // Error pass-through: urls preserved, enabledAt preserved.
    expect(written.firms['kim-chang'].enabledAt).toBe(ORIGINAL_ENABLED_AT);
    expect(written.firms['kim-chang'].urls).toEqual(['https://www.kimchang.com/old']);
    await unlink(path).catch(() => {});
  });
});
