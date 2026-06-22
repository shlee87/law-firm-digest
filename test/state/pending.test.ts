// Phase 13-01 unit tests for src/state/pending.ts.
//
// Eight behavior clusters map to the plan's <behavior> spec:
//   1. readPending — ENOENT default, version drift, items[0] shape error
//   2. appendPending — windowStart preservation (D-09)
//   3. truncatePending — windowStart reset (D-09)
//   4. DRY_RUN gate — skip disk write + stdout marker (OPS-06 site #5)
//   5. toPendingItem — COMP-05 field omission (description/isClusterMember/isNew)
//   6. writePending public-API invariant (D-09 — NOT exported)
//
// Each test isolates state in a per-test tmpdir under os.tmpdir() so
// concurrent test runs do not collide on state/pending.json on disk. The
// DRY_RUN env var is reset before/after every test.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  readPending,
  appendPending,
  truncatePending,
  updatePending,
  toPendingItem,
  type PendingItem,
} from '../../src/state/pending.js';
import * as pendingModule from '../../src/state/pending.js';
import type { SummarizedItem } from '../../src/types.js';

function makePendingItem(firmId: string, title: string): PendingItem {
  return {
    firmId,
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    language: 'en',
    summary_ko: '요약',
    summaryConfidence: 'high',
    summaryModel: 'gemini-2.5-flash',
    summarizedAt: new Date().toISOString(),
  };
}

describe('src/state/pending.ts', () => {
  let dir: string;
  let pendingPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pending-'));
    pendingPath = path.join(dir, 'pending.json');
    delete process.env.DRY_RUN;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DRY_RUN;
  });

  describe('readPending — ENOENT + version + shape', () => {
    it('returns DEFAULT scaffold on ENOENT (first-run / fresh clone)', async () => {
      const state = await readPending(pendingPath);
      expect(state.version).toBe(1);
      expect(state.items).toEqual([]);
      expect(typeof state.windowStart).toBe('string');
      // ISO8601 round-trip sanity
      expect(new Date(state.windowStart).toISOString()).toBe(state.windowStart);
    });

    it('throws ZodError with path "version" on version-drift', async () => {
      writeFileSync(
        pendingPath,
        JSON.stringify({
          version: 2,
          windowStart: new Date().toISOString(),
          items: [],
        }),
      );
      await expect(readPending(pendingPath)).rejects.toMatchObject({
        name: 'ZodError',
      });
      try {
        await readPending(pendingPath);
      } catch (err) {
        const anyErr = err as { issues?: Array<{ path?: unknown[] }>; errors?: Array<{ path?: unknown[] }> };
        const issues = anyErr.issues ?? anyErr.errors ?? [];
        const hasVersionPath = issues.some((iss) =>
          (iss.path ?? []).includes('version'),
        );
        expect(hasVersionPath).toBe(true);
      }
    });

    it('throws ZodError including "items" and "summaryModel" in path when items[0].summaryModel missing', async () => {
      const malformed = {
        firmId: 'cooley',
        title: 'X',
        url: 'https://example.com/x',
        language: 'en',
        summary_ko: '요약',
        summaryConfidence: 'high',
        // summaryModel intentionally omitted
        summarizedAt: new Date().toISOString(),
      };
      writeFileSync(
        pendingPath,
        JSON.stringify({
          version: 1,
          windowStart: new Date().toISOString(),
          items: [malformed],
        }),
      );
      try {
        await readPending(pendingPath);
        throw new Error('expected throw');
      } catch (err) {
        const anyErr = err as { issues?: Array<{ path?: unknown[] }>; errors?: Array<{ path?: unknown[] }> };
        const issues = anyErr.issues ?? anyErr.errors ?? [];
        const flat = issues.flatMap((i) => i.path ?? []).join('.');
        expect(flat).toContain('items');
        expect(flat).toContain('summaryModel');
      }
    });
  });

  describe('appendPending — windowStart preservation (D-09)', () => {
    it('preserves windowStart across two appends and concatenates items', async () => {
      const fixedStart = '2026-05-01T00:00:00.000Z';
      writeFileSync(
        pendingPath,
        JSON.stringify({
          version: 1,
          windowStart: fixedStart,
          items: [],
        }),
      );
      const item1 = makePendingItem('cooley', 'A');
      const item2 = makePendingItem('cooley', 'B');
      await appendPending([item1], pendingPath);
      await appendPending([item2], pendingPath);
      const final = JSON.parse(readFileSync(pendingPath, 'utf8'));
      expect(final.windowStart).toBe(fixedStart);
      expect(final.items.map((i: PendingItem) => i.title)).toEqual(['A', 'B']);
    });
  });

  describe('truncatePending — windowStart reset (D-09)', () => {
    it('clears items and resets windowStart to a fresh ISO', async () => {
      const oldStart = '2026-05-01T00:00:00.000Z';
      writeFileSync(
        pendingPath,
        JSON.stringify({
          version: 1,
          windowStart: oldStart,
          items: [makePendingItem('cooley', 'A')],
        }),
      );
      const before = Date.now();
      await truncatePending(pendingPath);
      const after = Date.now();
      const final = JSON.parse(readFileSync(pendingPath, 'utf8'));
      expect(final.items).toEqual([]);
      const ts = new Date(final.windowStart).getTime();
      expect(ts).toBeGreaterThanOrEqual(before - 1);
      expect(ts).toBeLessThanOrEqual(after + 1);
      expect(final.windowStart).not.toBe(oldStart);
    });
  });

  describe('DRY_RUN gate (OPS-06 site #5)', () => {
    it('skips disk write and logs `[DRY_RUN] would write ...` for appendPending', async () => {
      process.env.DRY_RUN = '1';
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await appendPending([makePendingItem('cooley', 'A')], pendingPath);
      expect(existsSync(pendingPath)).toBe(false);
      const matched = spy.mock.calls.some(
        (args) =>
          String(args[0] ?? '').includes('[DRY_RUN] would write') &&
          String(args[0] ?? '').includes('pending.json') &&
          String(args[0] ?? '').includes('1 items'),
      );
      expect(matched).toBe(true);
      spy.mockRestore();
    });
  });

  describe('toPendingItem — COMP-05 enforcement (D-07)', () => {
    it('omits description, isClusterMember, isNew fields', () => {
      const sample: SummarizedItem = {
        firmId: 'cooley',
        title: 'Title',
        url: 'https://example.com/x',
        language: 'en',
        publishedAt: '2026-05-01T00:00:00.000Z',
        description: 'FULL ARTICLE BODY — MUST NOT BE PERSISTED',
        isNew: true,
        summary_ko: '요약',
        summaryConfidence: 'high',
        summaryModel: 'gemini-2.5-flash',
        isClusterMember: true,
      };
      const now = new Date('2026-05-22T12:00:00.000Z');
      const out = toPendingItem(sample, now);
      expect(out).not.toHaveProperty('description');
      expect(out).not.toHaveProperty('isClusterMember');
      expect(out).not.toHaveProperty('isNew');
      expect(out.summarizedAt).toBe('2026-05-22T12:00:00.000Z');
      expect(out.title).toBe('Title');
    });
  });

  describe('writePending — public API surface invariant (D-09)', () => {
    it('does not export writePending', () => {
      expect(
        (pendingModule as unknown as { writePending?: unknown }).writePending,
      ).toBeUndefined();
    });
  });

  describe('backward-compat — new optional fields', () => {
    it('parses pending.json without summaryBody/summaryAttempts without error, fields are undefined', async () => {
      const fixedStart = '2026-06-01T00:00:00.000Z';
      const item = makePendingItem('cooley', 'Legacy item');
      // Write a pending.json that has NO summaryBody or summaryAttempts fields
      writeFileSync(
        pendingPath,
        JSON.stringify({
          version: 1,
          windowStart: fixedStart,
          items: [item],
        }),
      );
      const state = await readPending(pendingPath);
      expect(state.items).toHaveLength(1);
      expect(state.items[0].summaryBody).toBeUndefined();
      expect(state.items[0].summaryAttempts).toBeUndefined();
    });
  });

  describe('updatePending — in-place replacement (D-09)', () => {
    it('replaces items array and preserves windowStart unchanged', async () => {
      const fixedStart = '2026-06-01T00:00:00.000Z';
      const item1 = makePendingItem('cooley', 'Item A');
      const item2 = makePendingItem('bkl', 'Item B');
      writeFileSync(
        pendingPath,
        JSON.stringify({
          version: 1,
          windowStart: fixedStart,
          items: [item1, item2],
        }),
      );
      // Replace with a single mutated item
      const mutated: PendingItem = { ...item1, summaryModel: 'gemini-2.5-flash-lite' };
      await updatePending([mutated], pendingPath);
      const final = JSON.parse(readFileSync(pendingPath, 'utf8'));
      // D-09: windowStart is preserved
      expect(final.windowStart).toBe(fixedStart);
      // Items are replaced, not concatenated
      expect(final.items).toHaveLength(1);
      expect(final.items[0].title).toBe('Item A');
      expect(final.items[0].summaryModel).toBe('gemini-2.5-flash-lite');
    });
  });
});
