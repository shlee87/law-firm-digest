# GSD Local Patch Review Report

- Root: `/Users/seonghoonyi/Documents/projects/legalnewsletter`
- Generated: 2026-04-17T05:15:52.309Z

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
