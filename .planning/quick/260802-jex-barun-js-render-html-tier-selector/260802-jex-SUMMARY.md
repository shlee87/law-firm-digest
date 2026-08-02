---
phase: quick-260802-jex
plan: 01
subsystem: scrapers
tags: [cheerio, firms-yaml, barun, js-render, html-tier, selectors, gh-issues]

# Dependency graph
requires:
  - phase: 04-scraper-tiers
    provides: extractLinkUrl 3-mode unified extractor + parseListItemsFromHtml
  - phase: 06-firm-audit-probe
    provides: audit:firms CLI + 06-AUDIT.md freshness convention
provides:
  - extractLinkUrl Mode 2 self-match fallback ($(itemEl).is(selector) → attr('href'))
  - barun firm collected via static fetch (html tier) — Playwright dependency removed for barun
  - 06-AUDIT.md refreshed (barun row: html tier, 6 items)
affects: [scrapers, firm-config, daily-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extractLinkUrl Mode 2: descendant .find() 우선, 0건일 때만 self-match fallback — 기존 string-link firm 동작 불변 보장"

key-files:
  created: []
  modified:
    - src/scrapers/util.ts
    - test/scrapers/util.test.ts
    - config/firms.yaml
    - .planning/phases/06-firm-audit-probe/06-AUDIT.md

key-decisions:
  - "barun detail_tier 삭제 (static 복귀): /letter/N 상세도 서버 렌더링 확인 (curl 32KB, cheerio 검증)"
  - "body: '#Table_01' 유지: 상세는 여전히 이미지 전용 이메일 템플릿 (text 0자, img 160개) — B3 guard가 Gemini 스킵으로 흡수"
  - "Mode 1(object)에는 self-match 미적용 — 현재 필요 firm 없음 (surgical change)"

patterns-established:
  - "list_item-is-anchor DOM 대응: string link selector가 find 0건이면 $(itemEl).is(selector)로 자기 자신 href 읽기"

requirements-completed: [barun-site-redesign-html-tier-migration]

# Metrics
duration: 8min
completed: 2026-08-02
---

# Quick Task 260802-jex: barun js-render → html tier Summary

**barunlaw.com 리뉴얼 대응 — barun을 Playwright js-render에서 static html tier로 전환 (extractLinkUrl self-match fallback + 새 DOM selector), 6일 연속 daily 실패 근본 원인 제거, 이슈 #11~#16 close**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-02T19:04:48Z
- **Completed:** 2026-08-02T19:12:30Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `extractLinkUrl` Mode 2에 self-match fallback 추가: list_item 요소 자체가 `<a href>` 앵커인 DOM에서도 href 추출 가능 (cheerio `.find()`는 자손만 탐색하는 갭 해소). descendant 매치 우선 유지로 기존 5개 string-link firm 동작 불변 — 전체 스위트 510개 무수정 통과.
- barun firms.yaml 항목 재작성: `type: html`, `wait_for` 삭제 (zod superRefine 호환), 새 selector `#barunnew-sec .board-item` / `.item-tit` / `a.board-item` / `.item-meta .date`. `pnpm check:firm barun` exit 0 + 6 items — 전부 `https://barunlaw.com/letter/<숫자>` url, 비어있지 않은 한국어 title, `2026-07-15` 형식 date에서 KST publishedAt 파싱 확인.
- 상세 페이지 probe: `/letter/56909`도 서버 렌더링 전환 확인 → `detail_tier` 삭제 (static 복귀). 단 본문은 여전히 이미지 전용 (`#Table_01` + img 타일 160개, text 0자) → `body: "#Table_01"` 유지 + 주석 갱신.
- CLAUDE.md audit-freshness 컨벤션 이행: `pnpm audit:firms` 재실행, 06-AUDIT.md를 firms.yaml과 같은 커밋으로 갱신 (barun 행: html tier, 6 items).
- 자동 생성 실패 이슈 #11~#16 전부 close (한국어 설명 코멘트 + 커밋 해시 인용). push 없음 — 커밋 3건 로컬 유지.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing self-match test** - `061c0a7` (test)
2. **Task 1 (GREEN): extractLinkUrl self-match fallback** - `b496cc7` (feat)
3. **Task 2: barun html tier + audit refresh** - `06457da` (fix)
4. **Task 3: gh issue close #11~#16** - (파일 변경 없음 — gh CLI만)

_Note: TDD task 1 produced 2 commits (test → feat); refactor 불필요로 생략._

## Files Created/Modified

- `src/scrapers/util.ts` - extractLinkUrl Mode 2: descendant find 우선 + self-match fallback 분기 (NEVER-throws 계약 유지)
- `test/scrapers/util.test.ts` - self-match 케이스 단위 테스트 (hidden input의 title 무영향도 동일 테스트에서 assert)
- `config/firms.yaml` - barun 항목: js-render → html, 구 `.articlebox` selector·`wait_for`·stale Phase 7-04 주석 제거, 리뉴얼 DOM selector + 2026-08-02 근거 주석
- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` - audit:firms 재생성 (barun: html / detail-empty / 6 items)

## Decisions Made

- **detail_tier 삭제 (static 복귀):** 상세 페이지 curl probe 결과 서버 렌더링 (32KB 수신, cheerio로 `#Table_01` 존재 확인) — Playwright 상세 fetch 불필요.
- **`body: "#Table_01"` 유지:** 상세가 여전히 이미지 전용 이메일 템플릿 (text 0자) — selector가 새 DOM에도 그대로 존재하므로 스코프 문서화 목적으로 유지, B3 guard가 빈 본문을 Gemini 스킵으로 흡수. audit의 barun `detail-empty` 판정은 설계상 기존과 동일한 known state.
- **dedup "0 new"는 정상:** 목록의 6개 `/letter/N` url은 리뉴얼 이전 daily 런들이 이미 수집한 항목 (seen.json에 존재). 07-28 이후 신규 발행분 없음.

## Deviations from Plan

None - plan executed exactly as written.

(참고: `pnpm audit:firms`가 exit 1로 종료 — 3개 enabled firm non-OK 드리프트 신호 (barun detail-empty by design + yulchon/latham monitor 상태). 06-AUDIT.md는 정상 재생성되어 커밋됨. 타 firm 드리프트는 스코프 밖으로 가시화만 수행 — plan 지시 그대로.)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- barun daily 수집이 static fetch로 복구됨 — 다음 daily 스케줄 런(12:00 UTC)에서 `[js-render-fail] firm=barun` 이슈가 더 이상 생성되지 않아야 함 (수동 확인 권장).
- 커밋 3건(`061c0a7`, `b496cc7`, `06457da`)은 로컬 전용 — 사용자가 직접 push 필요.
- js-render tier는 lee-ko, yoon-yang, latham에 여전히 사용 중 — Playwright 의존성/워크플로우 변경 없음.

## Self-Check: PASSED

- Commits 061c0a7 / b496cc7 / 06457da: FOUND (local, origin/main..HEAD = 3)
- All 4 modified files + SUMMARY.md: FOUND
- Issues #11~#16: closed (ALL_CLOSED)
- No push/pull/fetch performed this session

---
*Phase: quick-260802-jex*
*Completed: 2026-08-02*
