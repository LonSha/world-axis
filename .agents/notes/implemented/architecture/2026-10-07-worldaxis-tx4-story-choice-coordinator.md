# TX4: Story Choice Coordinator Boundaries

## Problem
branchTree, rehearsal, and commit each handle their own concerns, but there is no
single chain: fork registers branch points, choose records selection, rehearsal
previews, commit applies. None of them connect into "present a choice → preview
consequences → confirm → apply world effects."

## Decision
story-choice.js is a **coordinator**. It calls branchTree.fork/choose for
accounting, rehearsal.preview/checkPreview for whitelist validation, and
commit.begin/commit/flush for world application. Eight negative boundaries.

## Key alignment issues
- Dead table registration: 6 codes (already-confirmed, branchtree-absent,
  choose-failed, fork-failed, preview-rejected, no-result) are structurally
  reachable but require complex preconditions in standard boot.
- Injection chain seven points: display name 「故事分支」 identical across all.
- Three-stage separation in confirm(): { chosen: true, applied: bool, receipt }
  ensures accounting and world application are independently observable.
- Rehearsal whitelist: ops that fail rehearsal.preview are not allowed into
  the commit path.

## Rejected options
- Direct world write without commit: violates TP4's atomic transaction boundary.
- Auto-forking branch points: requires narrative judgment, not for this module.
- Merging stale/unknown/not-comparable into one state: three different conditions
  with different user-facing semantics.
