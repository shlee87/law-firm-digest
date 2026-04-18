import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeArchive } from '../../src/archive/writer.js';

describe('writeArchive — archive/YYYY/MM-DD.html writer (Phase 3 OPS-09)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'archive-writer-test-'));
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('path derivation (KST-based, D-13)', () => {
    it('writes to <base>/<YYYY>/<MM-DD>.html with KST-derived date', async () => {
      // 2026-04-18 00:00 UTC == 2026-04-18 09:00 KST → date is 2026-04-18
      const now = new Date('2026-04-18T00:00:00.000Z');
      const path = await writeArchive('<html>body</html>', now, tempDir);
      expect(path).toBe(join(tempDir, '2026', '04-18.html'));
      const contents = await readFile(path, 'utf8');
      expect(contents).toBe('<html>body</html>');
    });

    it('KST controls the date across the UTC midnight boundary', async () => {
      // 2026-04-18 18:00 UTC == 2026-04-19 03:00 KST → date is 2026-04-19
      const now = new Date('2026-04-18T18:00:00.000Z');
      const path = await writeArchive('<html>next day</html>', now, tempDir);
      expect(path).toBe(join(tempDir, '2026', '04-19.html'));
    });

    it('writes to a numeric year directory that did not exist before', async () => {
      const now = new Date('2027-01-01T00:00:00.000Z');
      const path = await writeArchive('<html>new year</html>', now, tempDir);
      expect(path).toBe(join(tempDir, '2027', '01-01.html'));
      // Year directory is now real — stat should succeed.
      const st = await stat(join(tempDir, '2027'));
      expect(st.isDirectory()).toBe(true);
    });
  });

  describe('content + overwrite behavior (D-15)', () => {
    it('writes HTML content verbatim', async () => {
      const html = '<!doctype html><html><body><h1>Test</h1></body></html>';
      const now = new Date('2026-04-18T00:00:00.000Z');
      const path = await writeArchive(html, now, tempDir);
      const contents = await readFile(path, 'utf8');
      expect(contents).toBe(html);
    });

    it('overwrites on repeat call with same now (D-15 same-day re-run)', async () => {
      const now = new Date('2026-04-18T00:00:00.000Z');
      await writeArchive('<html>first</html>', now, tempDir);
      const path = await writeArchive('<html>second (authoritative)</html>', now, tempDir);
      const contents = await readFile(path, 'utf8');
      expect(contents).toBe('<html>second (authoritative)</html>');
    });

    it('is idempotent on double write (no exception, second write wins)', async () => {
      const now = new Date('2026-04-18T00:00:00.000Z');
      await expect(writeArchive('a', now, tempDir)).resolves.toBeTruthy();
      await expect(writeArchive('b', now, tempDir)).resolves.toBeTruthy();
    });
  });

  describe('DRY_RUN mode (check site #3, Phase 3 R-02)', () => {
    it('does NOT write to disk when DRY_RUN=1', async () => {
      vi.stubEnv('DRY_RUN', '1');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const now = new Date('2026-04-18T00:00:00.000Z');
      const path = await writeArchive('<html>nope</html>', now, tempDir);
      // Path is still returned for caller observability.
      expect(path).toBe(join(tempDir, '2026', '04-18.html'));
      // The file is NOT on disk.
      await expect(stat(path)).rejects.toThrow(/ENOENT/);
      // The log line includes the DRY_RUN marker.
      expect(logSpy).toHaveBeenCalled();
      const logMsg = logSpy.mock.calls[0][0] as string;
      expect(logMsg).toMatch(/\[DRY_RUN\] would write archive/);
      expect(logMsg).toContain('2026/04-18.html');
    });

    it('writes to disk when DRY_RUN is unset / not equal to "1"', async () => {
      vi.stubEnv('DRY_RUN', '');
      const now = new Date('2026-04-18T00:00:00.000Z');
      const path = await writeArchive('<html>real</html>', now, tempDir);
      const contents = await readFile(path, 'utf8');
      expect(contents).toBe('<html>real</html>');
    });
  });

  describe('return value', () => {
    it('returns the full file path on successful write', async () => {
      const now = new Date('2026-04-18T00:00:00.000Z');
      const path = await writeArchive('<html>x</html>', now, tempDir);
      expect(path).toBe(join(tempDir, '2026', '04-18.html'));
    });

    it('returns the would-be path in DRY_RUN mode', async () => {
      vi.stubEnv('DRY_RUN', '1');
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const now = new Date('2026-04-18T00:00:00.000Z');
      const path = await writeArchive('<html>x</html>', now, tempDir);
      expect(path).toBe(join(tempDir, '2026', '04-18.html'));
    });
  });
});
