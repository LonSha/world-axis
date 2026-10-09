# Agent Note: Agency coordinator — seven boundaries, key-pipeline alignment, and reject-code DEAD table expansion
Status: implemented
## Problem

TX2 requires a coordinator that maps goals → plans → actions → receipts → step settlement, closing the loop between three existing engines (life/plan/act) that previously had no orchestrator. The coordinator must not become a second writer — it reads life for goals, reads plan for current steps, reads act for receipts, and drives settlement via plan.settle. The risk is that a coordinator with write access to all three engines would create dual-writer ambiguity (who owns the goal state — life or agency?).

## Decision

Agency is read-only on life/plan/act's domain state. It writes only its own settings and its internal `__agencyWarn` flag. The seven boundaries enforce this:

1. **One current plan per goal** — `plan.current(who)` returns the single active plan; agency never creates a second.
2. **Receipt-driven step settlement** — `processReceipts` calls `plan.settle` only when `acts.res` has unprocessed receipts (`!r._agencyProcessed`). No timer auto-advances steps.
3. **Failure preserves blocker** — `schedule` returns `{ok:false, reason:'need-steps', ...}` with the blocker intact; it does not silently swallow.
4. **Re-plan on condition change** — if the active goal's plan has no steps, `schedule` returns `need-steps` (asking for `plan.expand`), not auto-deleting the goal.
5. **Autonomy budget** — `maxSchedulePerTurn` / `maxReceiptsPerTurn` cap the number of schedules and receipt-processings per turn.
6. **No premature memory writes** — agency never calls `life.setMemory` or equivalent; memory is life's domain.
7. **No fabrication** — agency does not create people, goals, or actions. It reads `registry.people` / `life.goals` / `act.res`; it does not write to them.

## Key alignment issues discovered

### activeGoalOf key format mismatch

`life.js` stores people under `personId(name)` = `'p_' + name`. Agency's `activeGoalOf(who)` originally read `st.people[who]` (raw name), which always returned undefined. Fix: `st.people['p_' + who]`.

This is a general pattern: **a coordinator must match the key format of the engine it reads from**, not assume its own calling convention applies. The same bug appeared in `buildBlock`, where passing a `p_`-prefixed ID to `plan.current` caused double-prefixing (`p_p_test`).

### Alias form must match ALIAS_RE

The standard alias form `const A = window.WorldAxis = window.WorldAxis || {}` is enforced by `module-cycle-gate`'s `ALIAS_RE` regex. Using `typeof global !== 'undefined' ? global : ...` breaks the static scanner's ability to identify the namespace as "provided". This is a repo-wide discipline, not specific to agency.

### Reject-code DEAD table expansion

Agency introduces 7 new reject codes (disabled/missing-person/no-active-goal/need-steps + no-step/already-running/already-done/no-act-row/step-not-running/act-unavailable/plan-unavailable). The first 4 can be triggered in standard boot and get `want` + `trip` witnesses in `reject-v2780.js`. The latter 7 require complex preconditions (specific module states) and are classified as DEAD (known-unreachable-in-standard-boot, listed in the DEAD table). The `disabled` code was previously in the baseline (unclassified) list; now that it has a witness, it was removed from baseline (229→228) to avoid "ledger redundancy".

## Alternatives considered

- **Timer-based step advancement**: rejected — it would auto-complete steps without real receipt evidence, violating boundary #2.
- **Agency writing to life/plan/act**: rejected — it would create dual-writer ambiguity. Agency coordinates; it does not own domain state.
- **Auto-expanding plans when need-steps**: `autoPlanExpand` is a setting (default true), but the actual expansion is deferred to `plan.expand` — agency calls it but does not fabricate steps itself. If `plan.expand` is unavailable, agency returns the blocker rather than inventing steps.

## Consequences
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Consequences 节；其后果面已散见上方「Key alignment issues discovered」与「Reject-code DEAD table expansion」两节，正文未重排、未改写。
