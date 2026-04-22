# GSD Local Patch Review Report

- Root: `/Users/seonghoonyi/Documents/projects/legalnewsletter`
- Generated: 2026-04-17T23:28:02.451Z

Automatic reapply stopped because one or more local patch groups partially overlap with current upstream behavior.

## spec-gate

- Status: **REVIEW**
- Description: manager offers /gsd:spec-phase before discuss for phases with ambiguous scope
- Local checks: 1/2
- Equivalent checks: 1/2
- Recommended action: **reconcile manually using diff preview**
- Rationale: Both local and upstream behaviors are partial, but the script can preview a clean diff for manual comparison.
- Local missing: init.cjs has spec_recommended logic
- Equivalent missing: init.cjs computes spec_recommended

Recommended steps:
- Compare the preview diff against the current upstream file.
- Keep only the parts that are still repo-specific.
- Update the local patch script to match the new final shape.

### .claude/get-shit-done/bin/lib/init.cjs

- Preview action: update

```diff
diff --git a/.claude/get-shit-done/bin/lib/init.cjs b/.claude/get-shit-done/bin/lib/init.cjs
index 1736d77..07b8f72 100644
--- a/.claude/get-shit-done/bin/lib/init.cjs
+++ b/.claude/get-shit-done/bin/lib/init.cjs
@@ -1086,6 +1086,56 @@ function cmdInitManager(cwd, raw) {
       phase.deps_satisfied;
   }
 
+  // Spec recommendation: analyze undiscussed phases to suggest spec-first vs discuss-first.
+  // Heuristic: phases with vague goals, missing success criteria, or new domains benefit from
+  // /gsd:spec-phase before /gsd:discuss-phase.
+  for (const phase of phases) {
+    if (!phase.is_next_to_discuss) {
+      phase.spec_recommended = false;
+      phase.spec_reason = null;
+      continue;
+    }
+    const reasons = [];
+    const goal = phase.goal || '';
+    const name = phase.name || '';
+
+    // Check for vagueness signals
+    if (goal.length < 60) reasons.push('Goal is brief — spec can sharpen requirements');
+    if (/\bTBD\b/i.test(goal)) reasons.push('Goal contains TBD');
+    if (/feasibility|investigate|explore|evaluate|decide/i.test(goal)) reasons.push('Exploratory phase — spec defines success criteria');
+
+    // Check ROADMAP section for missing structure
+    try {
+      const roadmapContent = extractCurrentMilestone(rawContent, cwd);
+      const escapedPhase = phase.number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
+      const phasePattern = new RegExp(`#{2,4}\\s*Phase\\s+${escapedPhase}[:\\s][\\s\\S]*?(?=#{2,4}\\s*Phase\\s+|$)`);
+      const section = (roadmapContent.match(phasePattern) || [''])[0];
+      if (!section.includes('Success Criteria') && !section.includes('Acceptance')) {
+        reasons.push('No success criteria in roadmap — spec defines acceptance');
+      }
+      if (!section.includes('Depends on') || /Depends on.*None/i.test(section)) {
+        // Independent phase with no prior context — more likely to need spec
+      }
+    } catch { /* intentionally empty */ }
+
+    // Check if SPEC.md already exists
+    if (phase.disk_status !== 'no_directory') {
+      try {
+        const phaseFiles = _phaseDirEntries
+          .filter(d => d.startsWith(phase.number + '-') || d === phase.number)
+          .flatMap(d => {
+            try { return fs.readdirSync(path.join(phasesDir, d)); } catch { return []; }
+          });
+        if (phaseFiles.some(f => f.endsWith('-SPEC.md') || f === 'SPEC.md')) {
+          reasons.length = 0; // SPEC already exists, no need
+        }
+      } catch { /* intentionally empty */ }
+    }
+
+    phase.spec_recommended = reasons.length > 0;
+    phase.spec_reason = reasons.length > 0 ? reasons[0] : 'Goal and criteria are clear — discuss is sufficient';
+  }
+
   // Check for WAITING.json signal
   let waitingSignal = null;
   try {
```
