# GSD Local Patch Review Report

- Root: `/Users/seonghoonyi/Documents/projects/legalnewsletter`
- Generated: 2026-04-19T02:41:05.598Z

Automatic reapply stopped because one or more local patch groups partially overlap with current upstream behavior.

## backlog-flow

- Status: **REVIEW**
- Description: backlog commands, routing, and skill surfaces
- Local checks: 2/5
- Equivalent checks: 2/3
- Recommended action: **reconcile manually using diff preview**
- Rationale: Both local and upstream behaviors are partial, but the script can preview a clean diff for manual comparison.
- Local missing: claude debug routing, claude add backlog extras, claude review backlog extras
- Equivalent missing: claude debug command points to backlog flow

Recommended steps:
- Compare the preview diff against the current upstream file.
- Keep only the parts that are still repo-specific.
- Update the local patch script to match the new final shape.

### .opencode/command/gsd-debug.md

- Preview action: update

```diff
diff --git a/.opencode/command/gsd-debug.md b/.opencode/command/gsd-debug.md
index 2001826..9d1bfc3 100644
--- a/.opencode/command/gsd-debug.md
+++ b/.opencode/command/gsd-debug.md
@@ -179,6 +179,13 @@ If active sessions exist AND no description in $ARGUMENTS:
 If $ARGUMENTS provided OR user describes new issue:
 - Continue to symptom gathering
 
+If the user explicitly says they do **not** want immediate investigation yet, and instead wants to queue or batch multiple bugs for later triage:
+- Explain that `/gsd-debug` is the immediate-investigation path
+- Recommend `/gsd-add-backlog "<bug summary>"` for each bug they want to park
+- Recommend `/gsd-review-backlog` when they want to merge, split, or promote parked bugs into active phases
+- Recommend `/gsd-manager` after promotion for batch planning/execution
+- Stop unless they switch back to immediate investigation
+
 ## 2. Gather Symptoms (if new issue, SUBCMD=debug)
 
 Use AskUserQuestion for each:
```

### .claude/commands/gsd/debug.md

- Preview action: update

```diff
diff --git a/.claude/commands/gsd/debug.md b/.claude/commands/gsd/debug.md
index 7170253..8df39c7 100644
--- a/.claude/commands/gsd/debug.md
+++ b/.claude/commands/gsd/debug.md
@@ -179,6 +179,13 @@ If active sessions exist AND no description in $ARGUMENTS:
 If $ARGUMENTS provided OR user describes new issue:
 - Continue to symptom gathering
 
+If the user explicitly says they do **not** want immediate investigation yet, and instead wants to queue or batch multiple bugs for later triage:
+- Explain that `/gsd-debug` is the immediate-investigation path
+- Recommend `/gsd-add-backlog "<bug summary>"` for each bug they want to park
+- Recommend `/gsd-review-backlog` when they want to merge, split, or promote parked bugs into active phases
+- Recommend `/gsd-manager` after promotion for batch planning/execution
+- Stop unless they switch back to immediate investigation
+
 ## 2. Gather Symptoms (if new issue, SUBCMD=debug)
 
 Use AskUserQuestion for each:
```

### .opencode/command/gsd-add-backlog.md

- Preview action: update

```diff
diff --git a/.opencode/command/gsd-add-backlog.md b/.opencode/command/gsd-add-backlog.md
index 180d35e..0c625e9 100644
--- a/.opencode/command/gsd-add-backlog.md
+++ b/.opencode/command/gsd-add-backlog.md
@@ -1,6 +1,6 @@
 ---
 type: prompt
-description: Add an idea to the backlog parking lot (999.x numbering)
+description: Add a bug or idea to the backlog parking lot (999.x numbering)
 argument-hint: <description>
 tools:
   read: true
@@ -10,8 +10,9 @@ tools:
 
 <objective>
 Add a backlog item to the roadmap using 999.x numbering. Backlog items are
-unsequenced ideas that aren't ready for active planning — they live outside
-the normal phase sequence and accumulate context over time.
+unsequenced bugs, ideas, or scope slices that are not ready for active planning
+yet — they live outside the normal phase sequence and accumulate context over
+time.
 </objective>
 
 <process>
@@ -38,6 +39,7 @@ the normal phase sequence and accumulate context over time.
    ### Phase {NEXT}: {description} (BACKLOG)
 
    **Goal:** [Captured for future planning]
+   **Size:** S/M/L (S = /gsd:fast candidate, M = 1-2 plans, L = research + multi-plan)
    **Requirements:** TBD
    **Plans:** 0 plans
 
@@ -45,6 +47,11 @@ the normal phase sequence and accumulate context over time.
    - [ ] TBD (promote with /gsd-review-backlog when ready)
    ```
 
+   **Size inference:** If the user doesn't specify size, infer from description:
+   - **S**: single-file fix, debug button, config change, UI tweak
+   - **M**: feature addition touching 2-5 files, new endpoint + iOS view
+   - **L**: algorithm redesign, multi-component integration, dependency upgrade
+
 4. **Create the phase directory:**
    ```bash
    SLUG=$(gsd-sdk query generate-slug "$ARGUMENTS" --raw)
@@ -67,6 +74,7 @@ the normal phase sequence and accumulate context over time.
    This item lives in the backlog parking lot.
    Use /gsd-discuss-phase {NEXT} to explore it further.
    Use /gsd-review-backlog to promote items to active milestone.
+   Use /gsd-manager after promotion to plan/execute them with the rest of the milestone.
    ```
 
 </process>
```

### .claude/commands/gsd/add-backlog.md

- Preview action: update

```diff
diff --git a/.claude/commands/gsd/add-backlog.md b/.claude/commands/gsd/add-backlog.md
index ee6c4ea..d2474e4 100644
--- a/.claude/commands/gsd/add-backlog.md
+++ b/.claude/commands/gsd/add-backlog.md
@@ -1,6 +1,6 @@
 ---
 name: gsd:add-backlog
-description: Add an idea to the backlog parking lot (999.x numbering)
+description: Add a bug or idea to the backlog parking lot (999.x numbering)
 argument-hint: <description>
 allowed-tools:
   - Read
@@ -10,8 +10,9 @@ allowed-tools:
 
 <objective>
 Add a backlog item to the roadmap using 999.x numbering. Backlog items are
-unsequenced ideas that aren't ready for active planning — they live outside
-the normal phase sequence and accumulate context over time.
+unsequenced bugs, ideas, or scope slices that are not ready for active planning
+yet — they live outside the normal phase sequence and accumulate context over
+time.
 </objective>
 
 <process>
@@ -38,6 +39,7 @@ the normal phase sequence and accumulate context over time.
    ### Phase {NEXT}: {description} (BACKLOG)
 
    **Goal:** [Captured for future planning]
+   **Size:** S/M/L (S = /gsd:fast candidate, M = 1-2 plans, L = research + multi-plan)
    **Requirements:** TBD
    **Plans:** 0 plans
 
@@ -45,6 +47,11 @@ the normal phase sequence and accumulate context over time.
    - [ ] TBD (promote with /gsd-review-backlog when ready)
    ```
 
+   **Size inference:** If the user doesn't specify size, infer from description:
+   - **S**: single-file fix, debug button, config change, UI tweak
+   - **M**: feature addition touching 2-5 files, new endpoint + iOS view
+   - **L**: algorithm redesign, multi-component integration, dependency upgrade
+
 4. **Create the phase directory:**
    ```bash
    SLUG=$(gsd-sdk query generate-slug "$ARGUMENTS" --raw)
@@ -67,6 +74,7 @@ the normal phase sequence and accumulate context over time.
    This item lives in the backlog parking lot.
    Use /gsd-discuss-phase {NEXT} to explore it further.
    Use /gsd-review-backlog to promote items to active milestone.
+   Use /gsd-manager after promotion to plan/execute them with the rest of the milestone.
    ```
 
 </process>
```

### .opencode/command/gsd-review-backlog.md

- Preview action: update

```diff
diff --git a/.opencode/command/gsd-review-backlog.md b/.opencode/command/gsd-review-backlog.md
index 203e237..b4290d4 100644
--- a/.opencode/command/gsd-review-backlog.md
+++ b/.opencode/command/gsd-review-backlog.md
@@ -9,8 +9,8 @@ tools:
 ---
 
 <objective>
-Review all 999.x backlog items and optionally promote them into the active
-milestone sequence or remove stale entries.
+Review all 999.x backlog items and decide which ones should stay parked,
+be promoted into the active milestone, or be removed as stale.
 </objective>
 
 <process>
@@ -27,8 +27,13 @@ milestone sequence or remove stale entries.
    Show each backlog item with its description, any accumulated context (CONTEXT.md, RESEARCH.md), and creation date.
 
 3. **Present the list to the user** via AskUserQuestion:
-   - For each backlog item, show: phase number, description, accumulated artifacts
-   - Options per item: **Promote** (move to active), **Keep** (leave in backlog), **Remove** (delete)
+   - For each backlog item, show: phase number, description, **size (S/M/L)**, accumulated artifacts
+   - Ask one item at a time so the user can merge/split mentally before promoting
+   - Options per item: **Promote** (move to active), **Keep** (leave in backlog), **Remove** (delete), **Stop review**
+
+4a. **For size S items being promoted:**
+   - Suggest `/gsd-fast` instead of the normal discuss→plan→execute flow
+   - Size S items are trivial enough to skip research/planning overhead
 
 4. **For items to PROMOTE:**
    - Find the next sequential phase number in the active milestone
@@ -57,6 +62,8 @@ milestone sequence or remove stale entries.
    Promoted: {list of promoted items with new phase numbers}
    Kept: {list of items remaining in backlog}
    Removed: {list of deleted items}
+
+   Promoted items are now normal phases and can be picked up from /gsd-manager.
    ```
 
 </process>
```

### .claude/commands/gsd/review-backlog.md

- Preview action: update

```diff
diff --git a/.claude/commands/gsd/review-backlog.md b/.claude/commands/gsd/review-backlog.md
index 0eb27b6..95eaaf4 100644
--- a/.claude/commands/gsd/review-backlog.md
+++ b/.claude/commands/gsd/review-backlog.md
@@ -9,8 +9,8 @@ allowed-tools:
 ---
 
 <objective>
-Review all 999.x backlog items and optionally promote them into the active
-milestone sequence or remove stale entries.
+Review all 999.x backlog items and decide which ones should stay parked,
+be promoted into the active milestone, or be removed as stale.
 </objective>
 
 <process>
@@ -27,8 +27,13 @@ milestone sequence or remove stale entries.
    Show each backlog item with its description, any accumulated context (CONTEXT.md, RESEARCH.md), and creation date.
 
 3. **Present the list to the user** via AskUserQuestion:
-   - For each backlog item, show: phase number, description, accumulated artifacts
-   - Options per item: **Promote** (move to active), **Keep** (leave in backlog), **Remove** (delete)
+   - For each backlog item, show: phase number, description, **size (S/M/L)**, accumulated artifacts
+   - Ask one item at a time so the user can merge/split mentally before promoting
+   - Options per item: **Promote** (move to active), **Keep** (leave in backlog), **Remove** (delete), **Stop review**
+
+4a. **For size S items being promoted:**
+   - Suggest `/gsd:fast` instead of the normal discuss→plan→execute flow
+   - Size S items are trivial enough to skip research/planning overhead
 
 4. **For items to PROMOTE:**
    - Find the next sequential phase number in the active milestone
@@ -57,6 +62,8 @@ milestone sequence or remove stale entries.
    Promoted: {list of promoted items with new phase numbers}
    Kept: {list of items remaining in backlog}
    Removed: {list of deleted items}
+
+   Promoted items are now normal phases and can be picked up from /gsd-manager.
    ```
 
 </process>
```
