# Phase 14: Scheduling Coverage — Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 7 (0 new + 5 modified + 2 deleted/edited)
**Analogs found:** 7 / 7 (all self-analogs — phase is pure modification/deletion, no net-new files)

## File Classification

| Modified/Deleted File | Role | Data Flow | Closest Analog | Match Quality |
|-----------------------|------|-----------|----------------|---------------|
| `.github/workflows/daily.yml` | workflow (GHA) | cron trigger → pipeline | self (lines 22-28) + Phase 13 commit `ace93f4` (cron fix) | exact (self-edit) |
| `.github/workflows/weekly.yml` | workflow (GHA) | cron trigger → pipeline | self (lines 26-31) + sibling `daily.yml` (cron block layout) | exact (self-edit) |
| `scripts/sync-schedule.ts` | script (one-shot) | YAML read → yml regex rewrite | self — **deletion target** | N/A (delete entirely) |
| `package.json` | config (npm scripts dict) | pnpm CLI dispatch | self (line 14) | exact (key removal) |
| `src/config/loader.ts` | config loader (TS) | export function | self (lines 85-101) | exact (function removal) |
| `config/settings.yaml` | config (user-edited YAML) | zod schema parse | self (lines 21-38) — header comment block | exact (comment rewrite) |
| `CLAUDE.md` | docs (Conventions section) | Claude-session auto-load | self (lines 190-194 `## Conventions` marker block) | role-match (subsection ADD) |

---

## Pattern Assignments

### `.github/workflows/daily.yml` (modify cron + header comment only)

**Analog:** self — Phase 13 commit `ace93f4` already taught the file the `0,2-6` collision-free pattern. Phase 14 extends to all 7 days.

**Current state (lines 22-28):**
```yaml
on:
  # 발송 일정 — config/settings.yaml의 schedule.cron과 동일하게 유지하세요.
  # 변경 방법: 아래 cron 값을 수정한 뒤 config/settings.yaml도 동일하게 맞춰주세요.
  # 형식: '분 시(UTC) 일 월 요일' (KST = UTC+9)
  schedule:
    - cron: '0 12 * * 0,2-6'  # Phase 13: 화~일 매일 21:00 KST (월요일은 weekly.yml 이 담당)
  workflow_dispatch: {} # manual trigger for smoke tests / gap closure
```

**Target shape (Discretion on exact wording — SPEC §1 + CONTEXT D-01):**
```yaml
on:
  # 발송 일정 — cron은 이 파일과 weekly.yml에서 직접 관리합니다.
  # 변경 절차: 아래 cron 줄을 수정 → commit → push → `gh workflow run daily.yml`로 검증.
  # Phase 13 lesson: day-of-week 필드에서 0(Sun)과 7(Sun alias) 동시 사용 금지 (GH Actions reject).
  # 형식: '분 시(UTC) 일 월 요일' (KST = UTC+9)
  schedule:
    - cron: '0 12 * * 0-6'  # Phase 14: 매일(월~일) 21:00 KST
  workflow_dispatch: {} # manual trigger for smoke tests / gap closure
```

**Pattern rules to honor (Constraints §Phase 13 cron syntax lesson + SPEC R-03):**
- Use `0-6` OR `0,1,2-6` OR `*` — never `0,7` or `2-7,0` (Phase 13 rejected `2-7,0`, see commit `ace93f4`).
- Drop the "config/settings.yaml과 동일하게 유지" line — settings.yaml is no longer the source of truth.
- Concurrency block (lines 30-32), permissions (34-36), all steps below line 38 — **byte-identical** (SPEC AC#3).

**What NOT to touch:**
- `concurrency:` block — SPEC R-03 invariant.
- `git-auto-commit-action` step + `commit_message` + `file_pattern` — D-23 atomic invariant (Constraint).
- shin-kim Thawte cert block — unrelated.

---

### `.github/workflows/weekly.yml` (modify cron + header comment only)

**Analog:** self + sibling `daily.yml` (same `on.schedule.cron` + comment-above-cron layout).

**Current state (lines 26-31):**
```yaml
on:
  # Phase 13 cadence — config/settings.yaml decoupling tracked separately
  # (SPEC §Out-of-scope §1 / §2).
  schedule:
    - cron: '0 12 * * 1'  # 월요일 21:00 KST = 12:00 UTC
  workflow_dispatch: {} # manual trigger for smoke tests / gap closure
```

**Target shape (Discretion on exact wording — SPEC §2 + CONTEXT D-01):**
```yaml
on:
  # 발송 일정 — Mon 06:00 KST. daily.yml의 Mon 21:00 KST run과 시간 분리.
  # 변경 절차: 아래 cron 줄을 수정 → commit → push → `gh workflow run weekly.yml`로 검증.
  schedule:
    - cron: '0 21 * * 0'  # Phase 14: 월요일 06:00 KST = 일요일 21:00 UTC
  workflow_dispatch: {} # manual trigger for smoke tests / gap closure
```

**Cron arithmetic check** (SPEC R-02):
- Mon 06:00 KST = Mon 06:00 - 9h UTC = Sun 21:00 UTC.
- Day-of-week: `0` (Sunday) — and Sun-only `0` is fine alone (collision rule only fires when `0` and `7` coexist).
- Verify: `gh workflow view weekly.yml --yaml` after push.

**What NOT to touch:**
- `concurrency:` block (lines 33-35) — same digest-pipeline lock, SPEC R-03 invariant.
- `git-auto-commit-action` step (lines 116-121) — D-23 atomic.
- Issue-on-failure step (lines 123-156) — unrelated.

---

### `scripts/sync-schedule.ts` (DELETE entire file)

**Analog:** self — full 37-line script is the deletion target.

**Current state (full file):**
```typescript
// scripts/sync-schedule.ts
// config/settings.yaml의 schedule 설정을 읽어 .github/workflows/daily.yml의
// cron 줄을 자동으로 업데이트합니다.
//
// 사용법: pnpm sync-schedule

import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { SettingsSchema } from '../src/config/schema.js';
import { toCron } from '../src/config/loader.js';

const text = await readFile('config/settings.yaml', 'utf8');
const yaml = parse(text);
const result = SettingsSchema.safeParse(yaml);
// ... (regex-replace daily.yml cron line)
```

**Action:** `git rm scripts/sync-schedule.ts` (or `rm` + `git add -u`). No partial edit.

**Reason for full delete:** Phase 14 D-01 commit 2 (mechanical cleanup) bundles this with `package.json` script removal + `toCron()` removal. SPEC R-04 acceptance requires `ls scripts/sync-schedule.ts` → "No such file or directory".

---

### `package.json` (remove single `scripts."sync-schedule"` key)

**Analog:** self — current `scripts` block.

**Current state (lines 6-16):**
```json
  "scripts": {
    "dev": "tsx src/main.ts --mode=daily",
    "dev:weekly": "tsx src/main.ts --mode=weekly",
    "dry-run": "DRY_RUN=1 tsx src/main.ts --mode=daily",
    "dry-run:weekly": "DRY_RUN=1 tsx src/main.ts --mode=weekly",
    "check:firm": "tsx src/cli/checkFirm.ts",
    "audit:firms": "tsx src/cli/auditFirms.ts",
    "test": "vitest run",
    "sync-schedule": "tsx scripts/sync-schedule.ts",
    "typecheck": "tsc --noEmit"
  },
```

**Target shape:** Remove line 14 (`"sync-schedule": ...`) and the trailing comma adjustment on line 13 (`"test": "vitest run"` keeps its comma since `"typecheck"` follows).

**Result:**
```json
  "scripts": {
    "dev": "tsx src/main.ts --mode=daily",
    "dev:weekly": "tsx src/main.ts --mode=weekly",
    "dry-run": "DRY_RUN=1 tsx src/main.ts --mode=daily",
    "dry-run:weekly": "DRY_RUN=1 tsx src/main.ts --mode=weekly",
    "check:firm": "tsx src/cli/checkFirm.ts",
    "audit:firms": "tsx src/cli/auditFirms.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
```

**Verify:** `jq '.scripts."sync-schedule"' package.json` → `null` (SPEC AC#5).

**What NOT to touch:** All other `scripts` entries, all of `dependencies` / `devDependencies` / `packageManager` / `name` / `type` / `private`.

---

### `src/config/loader.ts` (remove `toCron()` function + its comment, lines 85-101)

**Analog:** self — confirmed by `grep -rn "toCron"` that only `scripts/sync-schedule.ts:10` imports it. After deleting sync-schedule.ts, `toCron()` is orphan code → SPEC In-scope §`src/config/loader.ts` (YAGNI cleanup).

**Current state (lines 85-101):**
```typescript
// toCron: converts human-readable schedule fields to a GitHub Actions cron string.
// Called by scripts/sync-schedule.ts to update .github/workflows/daily.yml.
export function toCron(schedule: { time_utc: string; days: string }): string {
  const [hoursStr, minutesStr] = schedule.time_utc.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  if (schedule.days === 'biweekly') {
    // 매달 1일·15일 실행 (격주 근사 — cron에 정확한 격주 지원 없음)
    return `${minutes} ${hours} 1,15 * *`;
  }
  const daysPart =
    schedule.days === 'weekdays' ? '1-5' :
    schedule.days === 'weekends' ? '0,6' :
    schedule.days === 'weekly' ? '1' : // 매주 월요일
    '*';
  return `${minutes} ${hours} * * ${daysPart}`;
}
```

**Target shape:** Delete lines 85-101 inclusive (the 2-line comment block at 85-86 + the function body at 87-101). Also delete the blank line that separates this block from `loadSettings()` above and `loadTopics()` below — collapse to single blank line for visual hygiene.

**Adjacent context to preserve (lines 102-117):** `loadTopics()` function untouched.

**Verify:**
- `grep -n "toCron" src/config/loader.ts` → 0 matches.
- `pnpm typecheck` → 0 exit (SPEC AC#9). No dangling import in src/ tree since only sync-schedule.ts imported it, and that file is deleted in the same commit.

---

### `config/settings.yaml` (rewrite header comment block above `schedule:` key)

**Analog:** self — lines 21-38 (the schedule header comment + the `schedule:` block itself).

**Current state (lines 21-38):**
```yaml
# --------------------------------------------------------------
# 발송 일정
# --------------------------------------------------------------
# 변경 후 터미널에서 `pnpm sync-schedule` 실행 → daily.yml 자동 업데이트
#
# time_utc 예시 (UTC 기준, KST = UTC+9):
#   '00:00'  = 09:00 KST   '01:00'  = 10:00 KST
#   '02:00'  = 11:00 KST   '22:00'  = 07:00 KST (다음날)
#
# days 선택지:
#   daily     = 매일 (기본값)
#   weekdays  = 평일만 (월~금)
#   weekends  = 주말만 (토~일)
#   weekly    = 주 1회 (매주 월요일)
#   biweekly  = 격주 1회 (매달 1일·15일 기준)
schedule:
  time_utc: '12:00'   # UTC 기준 발송 시각 (12:00 UTC = 08:00 Chicago CDT / 07:00 CST)
  days: weekly         # daily / weekdays / weekends / weekly / biweekly
```

**Target shape (CONTEXT D-03 recommended text — exact wording is Claude's Discretion):**
```yaml
# --------------------------------------------------------------
# 발송 일정 (현재 미사용)
# --------------------------------------------------------------
# ⚠ 이 schedule 블록은 현재 사용되지 않습니다.
#   실제 cron 일정은 .github/workflows/daily.yml + weekly.yml에서 직접 관리합니다.
#   변경 절차는 CLAUDE.md의 "Workflow scheduling" 섹션을 참조하세요.
#   (zod 호환을 위해 블록 자체는 남겨두지만 값은 무시됩니다.)
schedule:
  time_utc: '12:00'
  days: weekly
```

**Critical preservation rules (Constraints §Backwards compatibility):**
- `schedule:` key + `time_utc` + `days` fields **MUST remain** — zod `SettingsSchema.schedule` parse depends on them (SPEC out-of-scope §1).
- Trailing comments on `time_utc` and `days` lines (the `# UTC 기준 …` and `# daily / weekdays / …` inline comments) can be dropped since they describe a field that no longer drives behavior — keeping them implies the values matter.
- No mention of `sync-schedule` anywhere in the resulting file (SPEC AC#7 — `grep -nE "sync-schedule" config/settings.yaml` → 0 matches).

**What NOT to touch:** `recipient:` (lines 18-19), `gemini:` (56-60), `digest:` (65-68), `prompt:` (85-99), header banner (lines 1-5). SPEC out-of-scope explicit.

---

### `CLAUDE.md` (ADD new subsection under `## Conventions`)

**Analog:** self — `## Conventions` section currently at lines 190-194, marked by `<!-- GSD:conventions-start -->` / `<!-- GSD:conventions-end -->` HTML comment fences.

**Current state (lines 190-194):**
```markdown
<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->
```

**Target shape (CONTEXT D-02 — subsection title + 3 content elements; exact wording is Claude's Discretion):**
```markdown
<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Workflow scheduling (cron edit policy)

Cron 일정의 단일 진실 원천은 `.github/workflows/daily.yml` + `.github/workflows/weekly.yml`의 `schedule.cron` 두 줄이다. `config/settings.yaml`의 `schedule:` 블록은 zod 호환을 위한 placeholder이며 runtime에 사용되지 않는다.

**변경 절차:**
1. `daily.yml` / `weekly.yml`의 `schedule.cron` 줄을 직접 편집한다.
2. Commit + push.
3. `gh workflow run daily.yml` + `gh workflow run weekly.yml`로 즉시 dispatch — 양쪽 yml syntax가 GH Actions parser를 통과하는지 검증.

**Phase 13 lesson (cron syntax 충돌):**
GH Actions는 같은 day-of-week 필드에서 `0`(Sun)과 `7`(Sun alias)이 동시에 등장하면 cron을 reject한다. Monday를 추가할 때 `2-7,0` 같은 형태를 쓰지 말고 `0-6`, `*`, 또는 `0,1,2-6`처럼 collision-free 표현을 사용한다.

**시간 분리 원칙:**
daily와 weekly cron의 발사 시각은 분리해 유지한다. `concurrency: digest-pipeline` lock이 동시 실행을 직렬화하긴 하지만, 동일 시각 트리거는 한쪽이 다른 쪽이 끝나길 기다리는 슬롯 슬립을 만든다.

<!-- GSD:conventions-end -->
```

**Critical rules:**
- Subsection MUST be inside the `<!-- GSD:conventions-start -->` / `<!-- GSD:conventions-end -->` fence — outside the fence and the next CLAUDE.md regeneration will wipe it (these are GSD-managed blocks).
- Replace the "Conventions not yet established …" placeholder line — it becomes redundant once a real subsection exists.
- **Do NOT** quote literal cron values (e.g., `'0 12 * * 0-6'`) — CONTEXT §specifics line 146 explicitly prohibits this footgun (every cron change would require CLAUDE.md sync). Describe procedure, not values.
- Acceptance: `grep -niE "cron|daily\.yml|weekly\.yml" CLAUDE.md` returns a single paragraph block containing both (a) "두 yml의 schedule.cron 두 줄을 직접 편집" + (b) "day-7 / day-0 동시 사용 금지" lesson (SPEC AC#8).

**Title flexibility (Claude's Discretion per CONTEXT line 75):** `### Workflow scheduling (cron edit policy)` vs `### Cron edit policy` vs `### Scheduling`. CONTEXT D-02 recommends "Workflow scheduling" subsection title; Phase 16 may add `### Firm audit freshness policy` as a sibling subsection.

---

## Shared Patterns

### Commit message style (Phase 13 precedent)

**Source:** `git log --oneline` commits `ace93f4`, `75de39f`, `54a17e1`.

**Phase 13 commits (cron-touching):**
```
ace93f4 fix(13-06): daily.yml cron syntax — '0,2-6' instead of '2-7,0'
75de39f feat(13-06): weekly.yml — Mon cron + --mode=weekly + atomic pending+seen+archive
54a17e1 chore(13-06): daily.yml — cron Tue-Sun + --mode=daily + atomic pending+seen commit
00f00e8 docs(13): IN-01,IN-02 fix cron comment + sync CLAUDE.md action versions
```

**Apply to Phase 14's 2 commits (CONTEXT D-01):**
- Type prefix: `fix` (functional change), `chore` (mechanical cleanup), or `docs` (documentation-only).
- Scope: `(14)` or `(14-XX)` per plan numbering.
- Subject: action verb + file(s) + concise reason.
- Footer: standard `Co-Authored-By: Claude` is **not** present in repo history — do not add unless user requests.

**Suggested wording (Claude's Discretion per CONTEXT line 79):**
- Commit 1 (SCHED-01 functional): `fix(14): daily/weekly cron split — add Mon to daily, shift weekly to Mon 06:00 KST`
- Commit 2 (SCHED-02 cleanup): `chore(14): remove sync-schedule footgun — delete script, package.json entry, toCron(), settings.yaml ref; add CLAUDE.md edit policy`

### Cron syntax invariant (Phase 13 lesson)

**Source:** Phase 13 commit `ace93f4` + STATE.md Accumulated Context.

**Apply to:** Any cron edit in either workflow file.
- Forbidden: `2-7,0`, `0,7`, `7`, any pattern that names both `0` and `7`.
- Allowed: `0-6` (all days), `0,1,2-6` (collision-free explicit Mon), `*` (every day), `1` (Mon alone), `0` (Sun alone).
- Test: `gh workflow view <name>.yml --yaml` after push — GH Actions parser is the ground truth.

### Concurrency invariant (D-23 / SPEC R-03)

**Source:** Both workflow files, `concurrency:` block.

**Apply to:** Both workflow files in commit 1 — these blocks MUST be byte-identical before/after.
```yaml
concurrency: # OPS-02 — serialize overlapping runs
  group: digest-pipeline
  cancel-in-progress: false
```

**Verification:** `git diff` on commit 1 shows NO line inside the `concurrency:` block (SPEC AC#3).

### STATE.md acceptance note (Phase 11 D-03 pattern)

**Source:** CONTEXT D-04 references Phase 11 D-03.

**Apply to:** Post-implementation STATE.md update (single line, Phase 14 verification record).

**Format (CONTEXT D-04 exact specification):**
```
YYYY-MM-DD Phase 14 cron split: daily/weekly workflow_dispatch 검증 완료 — daily run ID {N1}, weekly run ID {N2}. 다음 자연 schedule trigger 확인은 1주 내 production history에서.
```

---

## No Analog Found

(None — phase is pure modification/deletion. Every touched file has a self-analog.)

---

## Metadata

**Analog search scope:**
- `.github/workflows/` (2 yml files)
- `scripts/` (1 ts file)
- `src/config/` (loader.ts + schema.ts — schema.ts read only for context, untouched)
- Root: `package.json`, `CLAUDE.md`
- `config/settings.yaml`
- `.planning/phases/11-cron-resumption-gate/` + `.planning/phases/13-1-gemini-rpd/` (prior decision artifacts)

**Files scanned:** 7 implementation surface files + 2 prior phase CONTEXT.md/PATTERNS.md for style reference + git log (last 20 commits) for commit message style.

**Cross-imports verified (via `grep -rn "toCron"`):**
- Only `scripts/sync-schedule.ts:10` imports `toCron` → safe to delete `toCron()` in same commit as the script.
- No test files reference `sync-schedule` or `toCron` (verified via `grep --include="*.test.ts" --include="*.spec.ts"`).

**Pattern extraction date:** 2026-05-26
