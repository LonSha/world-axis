# Agent Note: V23 owner state and truthful cascade delivery

Status: proposed

## Problem

V23 business state lives in module closures, bypassing chat storage, permission gates and outer rollback. The batch API stops after refusal but retains earlier writes. Broadcast reports every layer reached without invoking listeners, and health is constant true.

## Proposal

Reuse store.transact for synchronous owner operations. A store-owned helper passes the current draft to owner callbacks and detached snapshots to readers; module wrappers scope STATE only during the call. Store defaults materialize all nine owner containers. Capacity registries cover nested growing maps and arrays; exceeding a write capacity rejects the candidate instead of evicting active obligations. ActionDesk admits only audited synchronous V23 routes to atomic batches and rejects unsupported routes before any action. It forwards persisted/deferred separately from applied.

Broadcast uses dispatchEvent with internal three-level reentry tracking, accurate delivery/error reports and finally cleanup. Health reports subscription coverage, not a fictional all-engine wiring guarantee. Product auto-causality remains a separate unfinished stage.

## Decision

Adopt the store-owned transaction helper (single authority for draft + detached reads) over outer-transact wrapping, per-module wrappers, or whole-module snapshot/restore. ActionDesk admits only audited synchronous V23 routes to atomic batches; unsupported routes are refused before any action, never silently broadened. Broadcast goes through dispatchEvent with internal reentry tracking; health reports subscription coverage only.

## Scope and gate

Local fixes to cascade-bus, store ownership, the nine V23 modules, ActionDesk, evict capacity registry and the existing V23 scenario lock. No dependency, unrelated engine or version changes. Budget: 900 changed lines for this cross-owner stage, split by state boundary. Baseline 46ce63d; broadcast witness fails at constant health, atomic witness fails at tension 5 rather than 0. Verify detached reads, failed batch byte equality, candidate read-your-writes, source mutation, capacity rejection, existing cascade locks and smoke. Roll back a stage if existing owner semantics regress; never silently broaden atomic support to unaudited routes.

## Alternatives considered

An outer transact around existing routes is smaller, but cannot roll back closure state or external writes. Snapshotting every module and restoring afterward preserves APIs, but creates another state authority, misses inaccessible internals and cannot undo effects. Per-module transaction wrappers follow existing human-realism practice but duplicate draft and result plumbing nine times; the shared store helper keeps transaction ownership with the existing store.

## Consequences

All migrated owner writes enter the store draft and roll back together on failure; denied operations leave no residue. Reads and returned results are detached snapshots, so callers cannot mutate live state through them. Capacity registries now cover nested growing maps and arrays: exceeding a write capacity rejects the candidate instead of evicting active obligations. Persistence can still fail after memory apply under the existing store contract — that gap is inherited, not widened. The stage does not complete all 18 V23 items; product auto-causality remains unfinished.

## Acceptance criteria

All migrated writes enter the store draft, denied/failed operations leave no state residue, reads and returned results are detached, reload uses saved owner state, capacities refuse growth and tested batches restore all previous steps on failure. Broadcast consumers execute, recursion is bounded, exceptions appear in reports and recovery works.

## Risks
Only synchronous, audited owners are batch eligible. Existing unrelated routes may still have nontransactional effects and must be refused. Persistence can fail after memory apply under the existing store contract. This stage does not complete all 18 V23 items.
## Pre-existing defect found by the new tier (not introduced here)
Running the new L2 tier end to end (isolated candidate tree, selection = the V23 section) surfaced a real product defect that no earlier gate batch had caught in the same run: all nine V23 engines read their settings through `WA.settingsBus.getModuleSettings(key, DEF)`, a member that does not exist on the settingsBus surface (the real read port is `read(reg)`). Because every call site guarded it with `typeof === 'function'`, the call silently fell through to the defaults: `enabled` could never be turned on or off, so "disable this engine" never had any effect in a host. It is pre-existing on HEAD (`tests/gates.js`, `tests/member-surface-gate.js`, `tests/settings-bus-api-gate.js` all name it), not introduced by this batch. Fixed in the nine engines using the in-repo idiom (`engines/affect.js`): `read` plus `normalize`, still guarded. Measured effect: `smoke` went from 12/14 to 14/14, `gates.js` from 2/4 red to 4/4 green, and the dead-export ledger's seven "evidence drift" entries (rising `tref` for V23 members) converged after `--update`. The V23 scenario lock itself was green before and after (249 assertions), because it drives these engines through their APIs rather than through the settings flag.
## Active-note audit

Search across active proposed/implemented/rejected notes found no cascade or V23 owner decision. The [human-realism transaction decision](../../implemented/bug-fix/2026-11-06-human-realism-owner-transactions.md) partially overlaps and remains valid; this reuses its transaction and detached-read model without changing its consent or telemetry guarantees.
