# GSD Local Patch Review Report

- Root: `/Users/seonghoonyi/Documents/projects/legalnewsletter`
- Generated: 2026-04-17T23:26:48.525Z

Automatic reapply stopped because one or more local patch groups partially overlap with current upstream behavior.

## sync-custom-commands

- Status: **BLOCKED**
- Description: symlink custom commands to .opencode/command/
- Local checks: 0/3
- Equivalent checks: 0/1
- Recommended action: **keep local until upstream coverage is proven**
- Rationale: Equivalent coverage is still incomplete and there is not enough evidence to safely remove the repo-local behavior.
- Local missing: pipeline-review.md symlink, tech-audit.md symlink, multi-review.md symlink
- Equivalent missing: all custom commands symlinked

Recommended steps:
- Keep the local patch for now.
- Add or run behavioral verification before considering removal.
- Only drop the local patch after a later audit shows full equivalent coverage.

No local diff preview was produced for this group.

## spec-gate

- Status: **BLOCKED**
- Description: manager offers /gsd:spec-phase before discuss for phases with ambiguous scope
- Local checks: 1/2
- Equivalent checks: 1/2
- Recommended action: **reconcile manually**
- Rationale: The group partially overlaps with upstream and at least one anchor changed, so a human should decide how to merge the behaviors.
- Local missing: init.cjs has spec_recommended logic
- Equivalent missing: init.cjs computes spec_recommended
- Preview skipped: .claude/get-shit-done/bin/lib/init.cjs: .claude/get-shit-done/bin/lib/init.cjs: insert anchor not found

Recommended steps:
- Review the generated diff preview and skipped anchors.
- Merge the missing behavior into the new upstream structure by hand.
- Update the local patch script so future audits stop flagging this overlap.

No local diff preview was produced for this group.
