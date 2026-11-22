# Agent Note: Fair bounded agency workflow dispatch

Status: implemented

## Problem

### Evidence
The new bounded workflow selected names.slice(0, limit), starving later actors whenever the active set exceeded the turn budget. Existing per-person schedule can also throw; one actor must not suppress the rest.

## Decision

### Decision
Local Fix Only within agency.js and its workflow test. Sort and deduplicate active names, rotate to next name after each bounded selection, reset a single in-memory cursor on chat change. Isolate individual synchronous exceptions and return schedule-threw diagnostics. No world-state or storage format change. Cursor is a best-effort process hint, not persisted fairness across reloads.

## Alternatives considered

### Rejected alternatives
Do not dispatch every actor regardless of budget, create an unbounded chat cursor map, or silently swallow errors. Do not attach motive.decide yet: source inspection proves it mutates the supplied person, marks commitments broken/deferred, and creates scars from physiological thresholds; auto-wiring it would promote evaluation to consequences.

## Consequences

### Verification
agency-workflow-integration.js passes rotation across two actors, bounded dispatch, disabled gate, exception diagnostics and receipt ordering.
s3-u2-v2194.js passes 67/67.
git diff --check passes.
328-row reference inventory generated in docs/engine-integration-inventory.md; it is explicitly not runtime acceptance.

### Limits
Roster churn/removal of next actor may restart from first; reload resets cursor. Asynchronous background simulation is not awaited by its existing workflow node, so order alone does not prove completion. Broader integration remains in progress; full regression snapshot predates these changes.
