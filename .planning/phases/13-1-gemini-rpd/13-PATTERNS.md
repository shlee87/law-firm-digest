# Phase 13: 매일 스크래핑 + 주 1회 이메일 발송 분리 - Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 12 (5 new + 7 modified)
**Analogs found:** 11 / 12 (geminiCallCount module-level counter는 net-new pattern)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/pipeline/runDaily.ts` | pipeline (entry) | orchestration | `src/pipeline/run.ts` (steps 1~9 + state) | exact (split source) |
| `src/pipeline/runWeekly.ts` | pipeline (entry) | orchestration | `src/pipeline/run.ts` (steps 8~13 + state) | exact (split source) |
| `src/state/pending.ts` | state (read+write 통합) | JSON read/append/truncate | `src/state/reader.ts` + `src/state/writer.ts` | role-match (D-08 단일 파일 합본) |
| `src/compose/heartbeat.ts` | compose | pure transform | `src/compose/digest.ts` | role-match (D-15 별도 함수) |
| `.github/workflows/weekly.yml` | workflow | cron trigger | `.github/workflows/daily.yml` | exact (cron+entry+file_pattern 변경) |
| `src/main.ts` (modified) | entry (cron) | argv parse → dispatch | `src/cli/checkFirm.ts` `parseArgs` | role-match (D-06 hand-rolled argv) |
| `src/cli/checkFirm.ts` (modified) | entry (CLI) | argv parse → runDaily | self (runPipeline import swap) | exact (D-03) |
| `src/pipeline/run.ts` (split/delete) | pipeline | — | self (소스) | — |
| `src/summarize/gemini.ts` (modified) | summarizer | LLM call + counter | self (module-level counter 추가) | **net-new** (D-18) |
| `src/observability/summary.ts` (modified) | observability | append [METRIC] line | self (writeStepSummary) | exact (D-21 prepend) |
| `.github/workflows/daily.yml` (modified) | workflow | cron+entry+file_pattern | self | exact (필드 변경) |
| `package.json` (modified) | config | scripts dict | self | — (D-05 scripts) |

## Pattern Assignments

### `src/pipeline/runDaily.ts` (NEW — pipeline entry, daily path)

**Analog:** `src/pipeline/run.ts` (전체 12-step `runPipeline()`)

**Header comment pattern** — canonical sequence comment (run.ts lines 1~66):
```typescript
// runDaily: daily-mode entry (화~일). Steps 1~9 of canonical sequence:
//   loadFirms → readState → fetchAll → enrich → filter → dedup → summarize
//   → appendPending → writeState (seen.json)
//
// DOES NOT import sendMail, writeArchive, composeDigest (D-01 cross-mode
// invariant). DOES NOT call detectHallucinationClusters / detectLowConfidence
// (D-12 — moved to weekly).
```
**Why this matters:** D-01 분리 근거는 "cross-mode invariant를 import 부재로 강제". Header comment에 명시적으로 적어둬야 grep audit에서 import drift 잡힘.

**Setup pattern** (run.ts lines 119~181) — `now`, `recorder`, `settings`, `loadFirms`, `recipient`, browser launch:
```typescript
const now = new Date();
const recorder = new Recorder();
const settings = await loadSettings();
const allFirms = await loadFirms();
// ... firmFilter 처리
const hasJsRender = firms.some(
  (f) => f.type === 'js-render' || f.detail_tier === 'js-render' || f.type === 'sitemap',
);
let browser: Browser | undefined;
if (hasJsRender) browser = await chromium.launch({ headless: true });
```
**D-02 inline-vs-helper:** 위 7~10줄이 두 함수 모두에 필요하면 `prepareRun()` helper 추출, 더 적으면 inline. 실제 작성 시 결정.

**Core pipeline pattern** (run.ts lines 187~312) — steps 3~9의 try block. **단, sendMail/composeDigest/writeArchive/markers 분기는 제거**. 끝에서:
```typescript
// Daily-specific: convert summarized FirmResult[] → PendingItem[] and append
const pendingItems: PendingItem[] = clusterAdjusted
  .filter((r) => !r.error)
  .flatMap((r) => r.summarized.map((s) => toPendingItem(s, now)));
await appendPending(pendingItems);

// writeState (OPS-03 LAST step) — same as run.ts:418
await writeState(seen, clusterAdjusted);
```

**resetGeminiCallCount + getGeminiCallCount** (D-19) — `runDaily` 시작 직후 + 끝나기 직전:
```typescript
resetGeminiCallCount();  // top of try block
// ... pipeline ...
const callCount = getGeminiCallCount();
await writeStepSummary(recorder, allFirms, [], callCount);  // D-21 추가 인자
```

**finally pattern** (run.ts lines 420~436) — `writeStepSummary` + `browser.close()`:
```typescript
} finally {
  await writeStepSummary(recorder, allFirms, [], getGeminiCallCount());
}
} finally {
  if (browser) await browser.close();
}
```
**Pitfall 5 preserved** (markers는 daily에서 항상 `[]`이므로 D-12에 따라 빈 배열 전달).

---

### `src/pipeline/runWeekly.ts` (NEW — pipeline entry, weekly path)

**Analog:** `src/pipeline/run.ts` (steps 8~13 + state) + `src/state/pending.ts` reader

**Setup pattern** — daily보다 더 가벼움. browser launch 불필요 (fetch 안 함):
```typescript
const now = new Date();
const recorder = new Recorder();
const settings = await loadSettings();
const allFirms = await loadFirms();
const recipient = await loadRecipient();
const fromAddr = process.env.GMAIL_FROM_ADDRESS ??
  (Array.isArray(recipient) ? recipient[0] : recipient);
```

**Core pattern** — pending read → restore → detect → compose → send → archive → truncate:
```typescript
resetGeminiCallCount();  // weekly always ends at 0 (D-22)
const pending = await readPending();

if (pending.items.length === 0) {
  // D-15 / D-16 / D-17 heartbeat path
  const payload = composeHeartbeat(recipient, fromAddr, now);
  await sendMail(payload);
  await writeArchive(payload.html, now);
} else {
  // D-14 restore + D-12 detection only here
  const firms = restoreFirmsFromPending(pending, allFirms);
  const clusterResult = detectHallucinationClusters(firms);
  const markers = [
    ...clusterResult.markers,
    ...detectLowConfidence(clusterResult.firms),
  ];
  const payload = composeDigest(
    clusterResult.firms, recipient, fromAddr, undefined, now, markers,
  );
  await sendMail(payload);
  await writeArchive(payload.html, now);
}

await truncatePending();  // D-09 only weekly truncates
```

**Notable absences (D-01 invariant):** `fetchAll`, `enrichWithBody`, `applyKeywordFilter`, `dedupAll`, `summarize` — import 자체가 없어야 함.

**finally pattern** — daily와 동일하지만 markers 채워질 수 있음:
```typescript
} finally {
  await writeStepSummary(recorder, allFirms, markers, getGeminiCallCount());
}
```

---

### `src/state/pending.ts` (NEW — combined reader+writer for pending.json)

**Analog (read pattern):** `src/state/reader.ts` (entire file, 38 lines)

**ENOENT default pattern** (reader.ts lines 23~38):
```typescript
const DEFAULT: SeenState = { version: 1, lastUpdated: null, firms: {} };

export async function readState(path = 'state/seen.json'): Promise<SeenState> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as SeenState;
    if (parsed.version !== 1) {
      throw new Error(`Unsupported seen.json version: ${parsed.version}`);
    }
    return parsed;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return DEFAULT;
    throw err;
  }
}
```

**Adapted for pending (D-11):**
```typescript
const DEFAULT = (): PendingState => ({
  version: 1,
  windowStart: new Date().toISOString(),
  items: [],
});

export async function readPending(path = 'state/pending.json'): Promise<PendingState> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    return PendingStateSchema.parse(parsed);  // zod throw on version drift / shape error
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return DEFAULT();
    throw err;
  }
}
```
**Departure from reader.ts:** version guard를 manual `if`가 아니라 zod로 일원화 — D-10에서 schema가 같은 파일에 있으므로 자연스러움.

---

**Analog (write pattern):** `src/state/writer.ts` (lines 50~152, 특히 lines 136~152 atomic + DRY_RUN)

**Atomic tmp+rename pattern** (writer.ts lines 149~152):
```typescript
// OPS-06 DRY_RUN check site #2. Merge already computed above so
// DRY_RUN exercises the same arithmetic; we only skip the disk write.
if (isDryRun()) {
  console.log(`[DRY_RUN] would write ${path} with ${total} URLs across ...`);
  return;
}
const tmp = `${path}.tmp`;
await writeFile(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8');
await rename(tmp, path);
```

**Adapted for pending (D-08, D-09):**
```typescript
async function writePendingInternal(state: PendingState, path: string): Promise<void> {
  if (isDryRun()) {
    console.log(`[DRY_RUN] would write ${path} with ${state.items.length} items`);
    return;
  }
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
}

export async function appendPending(items: PendingItem[], path = 'state/pending.json'): Promise<void> {
  const current = await readPending(path);
  const next: PendingState = { ...current, items: [...current.items, ...items] };
  await writePendingInternal(next, path);
}

export async function truncatePending(path = 'state/pending.json'): Promise<void> {
  const next: PendingState = {
    version: 1,
    windowStart: new Date().toISOString(),
    items: [],
  };
  await writePendingInternal(next, path);
}
```
**D-09 key invariant:** `writePending(state)` 공개 안 함 — 호출자가 windowStart 직접 수정 불가.
**Pattern 2 DRY_RUN containment:** `isDryRun()` import 추가 시 main.ts header comment의 "4-site containment" 업데이트 필요 (run.ts lines 56~63 + main.ts lines 57~63).

---

**zod schema pattern (D-10)** — `src/config/schema.ts` lines 30~50과 동일한 idiom:
```typescript
import { z } from 'zod';

const PendingItemSchema = z.object({
  firmId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.string().optional(),
  language: z.enum(['ko', 'en']),
  summary_ko: z.string().nullable(),
  summaryConfidence: z.enum(['high', 'medium', 'low']),
  summaryModel: z.string().min(1),
  summaryError: z.string().optional(),
  summarizedAt: z.string(),  // ISO8601
}).strict();  // schema.ts pattern — unknown keys fail validation

const PendingStateSchema = z.object({
  version: z.literal(1),  // fails on version drift with clear zod path
  windowStart: z.string(),
  items: z.array(PendingItemSchema),
}).strict();

export type PendingItem = z.infer<typeof PendingItemSchema>;
export type PendingState = z.infer<typeof PendingStateSchema>;
```

**toPendingItem 변환 함수 (D-07 COMP-05 enforcement)** — description / isClusterMember / isNew 의도적 부재:
```typescript
export function toPendingItem(s: SummarizedItem, now: Date): PendingItem {
  return {
    firmId: s.firmId,
    title: s.title,
    url: s.url,
    publishedAt: s.publishedAt,
    language: s.language,
    summary_ko: s.summary_ko,
    summaryConfidence: s.summaryConfidence,
    summaryModel: s.summaryModel,
    summaryError: s.summaryError,
    summarizedAt: now.toISOString(),
    // description, isClusterMember, isNew 의도적 부재 (COMP-05 + runtime-only 인보크)
  };
}
```

---

### `src/compose/heartbeat.ts` (NEW — empty week heartbeat composer)

**Analog:** `src/compose/digest.ts` (전체 46 lines)

**Pure function + KST date pattern** (digest.ts lines 29~45):
```typescript
import { formatInTimeZone } from 'date-fns-tz';
// ...
export function composeDigest(
  results: FirmResult[],
  recipient: string | string[],
  fromAddr: string,
  warnings?: StalenessWarnings,
  now: Date = new Date(),
  markers: DataQualityMarker[] = [],
): EmailPayload {
  // ...
  const dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
  const subject = `[법률 다이제스트] ${dateKst} (${firmsWithNew.length} firms, ${itemCount} items)`;
  const html = renderHtml(...);
  return { subject, html, to: recipient, from: fromAddr };
}
```

**Adapted for heartbeat (D-15, D-16, D-17):**
```typescript
import { formatInTimeZone } from 'date-fns-tz';
import type { EmailPayload } from '../types.js';

export function composeHeartbeat(
  recipient: string | string[],
  fromAddr: string,
  now: Date = new Date(),
): EmailPayload {
  const dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
  const subject = `[법률 다이제스트] ${dateKst} (이번 주 신규 없음)`;
  const html = `<!DOCTYPE html>
<html><body>
<h1>법률 다이제스트 — ${dateKst}</h1>
<p>이번 주 새 뉴스레터가 없습니다.</p>
<p>시스템은 정상 작동 중입니다.</p>
</body></html>`;
  return { subject, html, to: recipient, from: fromAddr };
}
```
**D-15 key invariant:** `composeDigest` 손대지 않음 — heartbeat은 별도 함수. failed-firm footer / DQOBS markers 의도적 부재 (D-17).
**EMAIL-04 prefix preserved:** `[법률 다이제스트]` (스팸 필터 안정).

---

### `.github/workflows/weekly.yml` (NEW — weekly cron workflow)

**Analog:** `.github/workflows/daily.yml` (전체 171 lines — entire file is the template)

**Header + triggers** (daily.yml lines 26~38) — cron + workflow_dispatch + concurrency:
```yaml
name: Daily Digest
on:
  schedule:
    - cron: '0 12 * * 1'  # 매일 09:00 KST
  workflow_dispatch: {}

concurrency:
  group: digest-pipeline
  cancel-in-progress: false

permissions:
  contents: write
  issues: write
```

**Adapted for weekly.yml** — name + cron 변경, concurrency group 공유 (SPEC constraint):
```yaml
name: Weekly Digest
on:
  schedule:
    - cron: '0 12 * * 1'  # 월요일 09:00 KST (UTC 12:00 = KST 21:00 — actually KST 21:00 Mon)
  workflow_dispatch: {}

concurrency:
  group: digest-pipeline  # ← SHARED with daily.yml (seen+pending race 차단)
  cancel-in-progress: false
```

**Run step pattern** (daily.yml lines 118~126):
```yaml
- name: Run daily digest pipeline
  id: run_pipeline
  run: pnpm tsx src/main.ts
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
    RECIPIENT_EMAIL: ${{ secrets.RECIPIENT_EMAIL }}
```

**Adapted for weekly.yml**:
```yaml
- name: Run weekly digest pipeline
  id: run_pipeline
  run: pnpm tsx src/main.ts --mode=weekly
  env:
    # GEMINI_API_KEY: 의도적 생략 가능 (weekly는 Gemini 안 부름)
    GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
    RECIPIENT_EMAIL: ${{ secrets.RECIPIENT_EMAIL }}
```

**Commit step pattern (D-23)** (daily.yml lines 127~132):
```yaml
- uses: stefanzweifel/git-auto-commit-action@v7
  with:
    commit_message: 'chore(state): update seen items and archive [skip ci]'
    file_pattern: 'state/seen.json'
```

**D-23 adaptation:**
- daily.yml file_pattern: `'state/pending.json state/seen.json'` (공백 구분)
- weekly.yml file_pattern: `'state/pending.json state/seen.json archive/**/*.html'`
- 양쪽 commit_message에 `[skip ci]` 유지 (DEDUP-06).

**daily.yml cron 변경 (D-23, SPEC AC-5):**
- 기존: `'0 12 * * 1'`
- 신규: `'0 12 * * 2-7,0'` (화~일 매일)
- 기존: `run: pnpm tsx src/main.ts`
- 신규: `run: pnpm tsx src/main.ts --mode=daily`

---

### `src/main.ts` (MODIFIED — mode flag dispatch)

**Analog:** `src/cli/checkFirm.ts` lines 21~54 (`parseArgs` hand-rolled pattern)

**parseArgs pattern** (checkFirm.ts lines 26~54):
```typescript
interface ParsedArgs {
  firmId: string;
  saveHtmlPath?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm check:firm <id> [--save-html <path>]');
    process.exit(2);
  }
  // ... loop over args ...
  return { firmId, saveHtmlPath };
}
```

**Adapted for main.ts (D-04, D-06)** — `--mode=daily` 와 `--mode daily` 양쪽 허용:
```typescript
type Mode = 'daily' | 'weekly';

function parseMode(argv: string[]): Mode {
  const args = argv.slice(2);
  let mode: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1];
      i++;
    } else if (args[i].startsWith('--mode=')) {
      mode = args[i].slice('--mode='.length);
    }
  }
  if (mode !== 'daily' && mode !== 'weekly') {
    console.error('Usage: pnpm tsx src/main.ts --mode=daily|weekly');
    process.exit(2);  // D-04 exit code 2 = usage error (mirror checkFirm.ts:30)
  }
  return mode;
}
```

**Dispatch pattern** — main()의 try block 안:
```typescript
async function main(): Promise<number> {
  try {
    const mode = parseMode(process.argv);
    if (mode === 'daily') {
      const report = await runDaily();
      emitDryRunStepSummary(report);
      if (report.jsRenderFailures > 0) {
        console.error(`FATAL: ${report.jsRenderFailures} js-render firm(s) failed`);
        return 1;
      }
    } else {
      // mode === 'weekly'
      const report = await runWeekly();
      emitDryRunStepSummary(report);
    }
    return 0;
  } catch (err) {
    console.error('FATAL:', scrubSecrets((err as Error).message));
    return 1;
  }
}
```
**Preserved invariants:**
- `import 'dotenv/config'` 첫 import 유지 (main.ts line 72 header rationale)
- NODE_ENV=test guard 유지 (line 139)
- Pattern 2 DRY_RUN containment 4-site 주석 (lines 57~63) 업데이트 — pending.ts 추가

---

### `src/cli/checkFirm.ts` (MODIFIED — runPipeline → runDaily swap)

**D-03 swap pattern:**
```typescript
// 기존 (line 17)
import { runPipeline } from '../pipeline/run.js';
// 변경 후
import { runDaily } from '../pipeline/runDaily.js';

// 기존 (lines 83~90)
const report = await runPipeline({
  firmFilter: firmId,
  skipEmail: true,
  skipStateWrite: true,
  skipGemini: true,
  saveHtmlPath,
  reporter: new CliReporter(),
});

// 변경 후 — runDaily는 sendMail/writeArchive를 import 자체 안 함이므로
// skipEmail / skipState 옵션 필요성 재검토. RunOptions 단순화 가능.
const report = await runDaily({
  firmFilter: firmId,
  skipStateWrite: true,
  skipGemini: true,
  saveHtmlPath,
  reporter: new CliReporter(),
});
```
**Note:** `skipEmail`은 daily에서 의미 없어짐 (daily가 메일 안 부름) — option 자체 제거 또는 noop.

---

### `src/pipeline/run.ts` (DELETED or vestigial)

**D-01 결정:** 두 함수 분리 (옵션 B). `runPipeline()` 함수 + 12-step canonical comment header는 두 새 파일에 분할 이전. `run.ts` 자체는 삭제 권장. 만약 `RunReport` / `RunOptions` 등 타입을 다른 곳에서 import한다면 `src/pipeline/types.ts`로 추출하거나 두 새 파일에 각자 정의.

**Pitfall warning:** `runPipeline` import 호출자 전수 검색 필요:
- `src/main.ts` — runDaily/runWeekly로 dispatch
- `src/cli/checkFirm.ts` — runDaily로 swap
- `test/pipeline/run.test.ts` — 두 함수 각각으로 분리 또는 새 테스트 파일 분리

---

### `src/summarize/gemini.ts` (MODIFIED — module-level geminiCallCount)

**Analog:** **net-new pattern** (codebase에 module-level counter 사례 없음 — `grep -rn "let.*Count" src/` returns only `recorder.ts` Map). D-20 인정.

**Pattern to introduce (D-18):**
```typescript
// 파일 상단 (lines 36~42 imports 직후)
let geminiCallCount = 0;
export function getGeminiCallCount(): number {
  return geminiCallCount;
}
export function resetGeminiCallCount(): void {
  geminiCallCount = 0;
}
```

**Increment site** — `ai.models.generateContent` 호출 직전 (gemini.ts line 97):
```typescript
const ai = new GoogleGenAI({ apiKey });
geminiCallCount++;  // D-18 — count BEFORE call, so 429/timeout still counted
const res = await ai.models.generateContent({ ... });
```
**Rationale (D-18):**
- fallback (`gemini-2.5-flash` → `gemini-2.5-flash-lite`)도 RPD 소비 → 둘 다 count.
- p-retry 내부 재시도 자동 포함 (counter는 각 attempt마다 +1).
- post-summarize tally(`summaryModel` 추정)는 fallback 1개를 1로 셈 → 부정확.

**Test isolation** — `beforeEach(resetGeminiCallCount)` pattern (specifics section):
```typescript
import { resetGeminiCallCount } from '../../src/summarize/gemini.js';

beforeEach(() => {
  resetGeminiCallCount();
});
```

---

### `src/observability/summary.ts` (MODIFIED — [METRIC] geminiCallCount line)

**Analog:** self (writeStepSummary, lines 60~90)

**Existing payload composition** (lines 73~79):
```typescript
const table = recorder.toMarkdownTable(firms);
let payload = table + '\n';
payload += renderMarkersMarkdown(markers);
```

**D-21 modification — [METRIC] line goes ABOVE table (top first line):**
```typescript
export async function writeStepSummary(
  recorder: Recorder,
  firms: FirmConfig[],
  markers: DataQualityMarker[] = [],
  geminiCallCount: number = 0,  // ← new param, default 0 for backwards compat
): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;

  const metricLine = `[METRIC] geminiCallCount=${geminiCallCount}\n\n`;
  const table = recorder.toMarkdownTable(firms);
  let payload = metricLine + table + '\n';
  payload += renderMarkersMarkdown(markers);

  try {
    await appendFile(path, payload, 'utf8');
  } catch (err) {
    console.warn(`[step-summary] write failed: ${scrubSecrets((err as Error).message)}`);
  }
}
```
**D-21 grep marker:** `[METRIC] geminiCallCount=N` — SPEC AC-7과 정확히 일치.
**D-22:** weekly에서도 항상 호출되며 값은 `0` (runWeekly가 `getGeminiCallCount() === 0`을 항상 전달).

**DRY_RUN parity (main.ts emitDryRunStepSummary)** — main.ts line 87도 같은 형식 출력 필요:
```typescript
// main.ts lines 85~96 updated:
export function emitDryRunStepSummary(report: RunReport, geminiCallCount: number = 0): void {
  if (!isDryRun()) return;
  console.log(`[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):`);
  console.log(`[METRIC] geminiCallCount=${geminiCallCount}\n`);
  const table = report.recorder.toMarkdownTable(report.firms);
  console.log(table);
  // ... markers ...
}
```

---

### `package.json` (MODIFIED — scripts dict, D-05)

**Current** (line 7~13):
```json
"scripts": {
  "dev": "tsx src/main.ts",
  "dry-run": "DRY_RUN=1 tsx src/main.ts",
  "check:firm": "tsx src/cli/checkFirm.ts",
  ...
}
```

**D-05 target:**
```json
"scripts": {
  "dev": "tsx src/main.ts --mode=daily",
  "dev:weekly": "tsx src/main.ts --mode=weekly",
  "dry-run": "DRY_RUN=1 tsx src/main.ts --mode=daily",
  "check:firm": "tsx src/cli/checkFirm.ts",
  ...
}
```

---

## Shared Patterns

### Header Canonical-Sequence Comment

**Source:** `src/pipeline/run.ts` lines 1~66

```typescript
// Composition root for the LegalNewsletter pipeline. Phase 3 extraction...
//
// Canonical run-transaction sequence (DO NOT REORDER — mirrors the Phase 1
// 01-12 locked order, extended with Phase 3 observability boundaries):
//
//   1. loadFirms / loadRecipient   — fail-fast on bad YAML.
//   2. Apply firmFilter if set     — D-05 Firm-not-found error on miss.
//   ...
```

**Apply to:** `runDaily.ts` (steps 1~9 commented), `runWeekly.ts` (steps 8~13 + truncate commented). 각 파일이 자신의 sequence comment를 가짐 (D-01).

---

### ENOENT default + version guard (state read)

**Source:** `src/state/reader.ts` lines 23~38

```typescript
const DEFAULT: SeenState = { version: 1, lastUpdated: null, firms: {} };

export async function readState(path = 'state/seen.json'): Promise<SeenState> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as SeenState;
    if (parsed.version !== 1) {
      throw new Error(`Unsupported seen.json version: ${parsed.version}`);
    }
    return parsed;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return DEFAULT;
    throw err;
  }
}
```

**Apply to:** `src/state/pending.ts` `readPending()` — 단, version guard는 zod로 일원화 (D-10).

---

### Atomic tmp+rename + DRY_RUN gate (state write)

**Source:** `src/state/writer.ts` lines 136~152

```typescript
if (isDryRun()) {
  const total = Object.values(next.firms).reduce((n, f) => n + f.urls.length, 0);
  console.log(`[DRY_RUN] would write ${path} with ${total} URLs across ${Object.keys(next.firms).length} firms`);
  return;
}
const tmp = `${path}.tmp`;
await writeFile(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8');
await rename(tmp, path);
```

**Apply to:** `src/state/pending.ts` `writePendingInternal()` (private helper used by `appendPending` + `truncatePending`).
**Pattern 2 update:** main.ts header comment의 "DRY_RUN check sites = 4" → 5로 갱신.

---

### Hand-rolled parseArgs + exit 2 on usage error

**Source:** `src/cli/checkFirm.ts` lines 26~54

```typescript
function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm check:firm <id> [--save-html <path>]');
    process.exit(2);
  }
  // ...
}
```

**Apply to:** `src/main.ts` `parseMode()` — exit code 2 = usage error (D-04 aggressive failure detection).

---

### GHA workflow shared structure

**Source:** `.github/workflows/daily.yml` (entire file)

**Apply to:** `.github/workflows/weekly.yml`. 동일하게 유지할 것:
- `concurrency: { group: digest-pipeline, cancel-in-progress: false }` (race 차단 — SPEC constraint)
- `workflow_dispatch: {}` (manual trigger 가능)
- `permissions: { contents: write, issues: write }`
- pnpm/setup-node/Playwright cache 블록 전체
- shin-kim Thawte cert 블록 (lines 79~117) — weekly도 fetch 안 하지만 향후 안전망
- "Open issue on failure" 블록 (lines 133~170) — weekly 실패도 issue 자동 생성

**Differ ONLY in:** name, cron, run command, file_pattern.

---

### `[skip ci]` in commit message

**Source:** `.github/workflows/daily.yml` line 129

```yaml
commit_message: 'chore(state): update seen items and archive [skip ci]'
```

**Apply to:** weekly.yml commit step. DEDUP-06 — `[skip ci]` 없으면 무한 워크플로우 루프.

---

### KST formatting via formatInTimeZone

**Source:** `src/compose/digest.ts` line 40 + `src/archive/writer.ts` line 54

```typescript
import { formatInTimeZone } from 'date-fns-tz';
const dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
```

**Apply to:** `src/compose/heartbeat.ts` — same idiom for date string (D-16).

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `src/summarize/gemini.ts` module-level `geminiCallCount` counter | observability state | Codebase에 module-level counter precedent 없음. Recorder는 class instance(per-run state), 전역 mutable let은 anti-pattern으로 회피되어 옴. D-20에서 단일 process / 단일 run lifecycle 안에서만 mutable + test가 `resetGeminiCallCount()`로 격리 보장 — 의도적 net-new. Planner는 D-20 rationale 그대로 plan action에 포함 권장. |

---

## Metadata

**Analog search scope:**
- `src/pipeline/` (run.ts, fetch.ts, dedup.ts, detectClusters.ts, detectLowConfidence.ts, enrichBody.ts, filter.ts)
- `src/state/` (reader.ts, writer.ts)
- `src/compose/` (digest.ts, templates.ts)
- `src/cli/` (checkFirm.ts, auditFirms.ts)
- `src/observability/` (recorder.ts, summary.ts, staleness.ts)
- `src/summarize/` (gemini.ts, prompt.ts)
- `src/archive/` (writer.ts)
- `src/config/` (schema.ts, loader.ts)
- `src/main.ts`, `src/env.ts`, `src/types.ts`
- `.github/workflows/` (daily.yml — only existing workflow)
- `test/state/`, `test/pipeline/` (test patterns)
- `package.json`

**Files scanned:** ~25 source files + 1 workflow + 2 test files

**Pattern extraction date:** 2026-05-22

---

*Phase: 13-1-gemini-rpd*
*Pattern mapping complete — ready for planning*
