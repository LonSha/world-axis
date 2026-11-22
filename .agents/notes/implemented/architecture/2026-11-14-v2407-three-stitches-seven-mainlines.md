# Agent Note: v2.407.0 — three stitches plus seven external-source mainlines

Status: implemented

## Problem

Two things were open at once. The three stitches (incremental reading bookmark, summarizer adapter, director scheduling) had been written into a dirty worktree but were never closed: no dedicated lock, no version bump, no gate pass, no commit. In parallel, eleven external JSON attachments (worldbooks and assistant scripts) had been surveyed and reduced to seven mechanism mainlines, but none of those mechanisms existed in WorldAxis. The user asked for all of it in 2.407.0.

Two real defects surfaced during closure: `summarizer-adapter.exportDigest()` referenced `entries` and `cap` after an earlier edit removed their declarations (a syntax-clean but runtime-fatal bug), and `reading-bookmark.branchKey()` used an anchor-derived key as if it were a stable branch row, so `pending()` could never find a previous mark on a later floor.

## Decision

Close the three stitches and land all seven mainlines as **read-only, default-off, model-free engines**, wired to the existing backstage prompt as real consumers.

- **B (atomic commit / branch continuity)** → `engines/branch-continuity.js`: evidence priority (`explicit > canon > context > designed > entailed`), `evaluate()` as a whole-accept / whole-reject gate that never writes store itself, `restore()` / `replay()` as pure floor+swipe projections. The bookmark fix uses the same swipe-family semantics: host `currentBranchId()` and `anchorBranchId()` are both latest-anchor-derived, so the row key became the swipe family `s{n}` (cross-floor reuse), with the anchor key kept only as `lastAnchorKey` for audit. Old saved rows are still read by family extraction.
- **D (deterministic scheduling)** → `director.js` extended with buckets, cooldown, land-window, deferred items, forced overdue injection. Still local deterministic sorting; the cooldown history is caller-supplied (`opt.lastSeen`) so the engine keeps zero persistence.
- **A / C / E / F / G** → `engines/fact-continuity.js`: fact layering (stable identity / current config / transient state), information boundary (world fact / received fact / character belief, without widening `world-reader`'s `visibility` set), economy anchoring, prose discipline (state vs narrative, pre-read / post-check, no adjudication terms in prose), and a comparable state signature.
- All new and changed engines are registered in `index.js`, `engines/tool-diag.js` `MODULE_EXPORTS`, and consumed by `engines/backstage.js`. Default off means every injection returns an empty string until a player opts in.

**Topic layers were deliberately not ported.** The attachments contain adult content, foot/shoe physicality libraries, ACGN visual hard rules, and SillyTavern-specific UI/API code. Only architecture discipline was extracted. A dedicated lock asserts that none of that vocabulary leaks into injection blocks.

## Consequences

- Five engines now exist where there were three half-finished ones; `core/store.js` gains `reading.marks` and `core/evict.js` its cap-24 site (both from the earlier round, now covered).
- `tests/three-stitches-v2407.js` is 107 assertions, real-data driven, registered in `tests/run.js`. It caught the `none`-branch missing `readUpTo` and forced a correction to both product and test: an overdue item is designed to bypass cooldown, so cooldown must be tested on a `soon` item.
- Version surface moved 2.406.0 → 2.407.0: `index.js`, `manifest.json`, 31 follow-type whitelists in `tests/s3-*`, and three ledgers recomputed from the live tree (`dead-export-gate --update`, `module-registry-gate --update`, `tools/evidence-index.js --write`). Hand-editing those counts would have broken their recomputation contracts.
- Every suppressed or deferred item stays visible in both return values and injection blocks. Two rounds of this project already suffered from silent truncation; that is now an asserted invariant, not a comment.

## Alternatives considered

1. **Import the AVS CORE script / GM variable system / 346-entry visual worldbook directly.** Rejected: 600k+ characters of SillyTavern-specific runtime and topic rules would violate WorldAxis's generic world-engine scope and add a second state writer. The host already has `core/commit.js` and `store.floorSig()`; a second writer is exactly the failure mode these notes keep retracing.
2. **Let the director call a model to rank scenes.** Rejected: scheduling must be computed before injection; making it depend on a network channel puts narrative rhythm on the wire. The original director comment already said this, and the extension keeps it.
3. **Add a stable branch-tree id field.** Rejected: the host has no such field, and inventing one would create a second branch truth alongside `currentBranchId()`. Swipe-family semantics reuse the existing floor+swipe signature instead.
4. **Widen `world-reader` visibility to `believed` / `rumored`.** Rejected for this version: that is the player-facing single source of truth; changing its contract needs its own version. `fact-continuity` only diagnoses that a belief ledger is missing, it does not redefine the enum.
5. **Keep the external mechanisms as a v2.408 plan.** Rejected by explicit user instruction: "全做吧，把这些东西在407全部做完". The read-only, default-off shape is what made doing it all in one version safe.

## How this is proven

`node --check` on all ten touched product files (entities residue 0), `version-surface-gate` pass (14), `dup-decl-gate` / `engines-ns-gate` / `orphan-lock` / `test-surface-gate` / `q1` / `q9` all pass, three ledgers recomputed and gated, and the new lock 107/0. Regressions are recorded in the iteration log with whatever the full-suite run actually returns — no claim of "full green" is made before the batch finishes.