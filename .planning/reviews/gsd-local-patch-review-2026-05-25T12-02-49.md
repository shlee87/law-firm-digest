# GSD Local Patch Review Report

- Root: `/Users/seonghoonyi/Documents/projects/legalnewsletter`
- Generated: 2026-05-25T12:02:49.527Z

Automatic reapply stopped because one or more local patch groups partially overlap with current upstream behavior.

## sdk-checkbox-from-raw

- Status: **BLOCKED**
- Description: gsd-sdk init-complex.js scans full ROADMAP for [x] checkboxes so shipped milestones inside <details> still register as complete
- Local checks: 0/2
- Equivalent checks: 0/1
- Recommended action: **reconcile manually**
- Rationale: The group partially overlaps with upstream and at least one anchor changed, so a human should decide how to merge the behaviors.
- Local missing: gsd-sdk init-complex.js has local patch marker, gsd-sdk init-complex.js scans rawContent for checkboxes
- Equivalent missing: upstream already reads checkboxes from full ROADMAP
- Preview skipped: /opt/homebrew/lib/node_modules/get-shit-done-cc/sdk/dist/query/init-complex.js: sdk-checkbox-from-raw anchor not found (SDK structure may have changed)

Recommended steps:
- Review the generated diff preview and skipped anchors.
- Merge the missing behavior into the new upstream structure by hand.
- Update the local patch script so future audits stop flagging this overlap.

No local diff preview was produced for this group.
