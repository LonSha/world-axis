# Agent Note: Human realism uses owner transactions and explicit forgiveness

Status: implemented

## Problem

human-realism directly mutated store.get() references. Permission denial and outer transaction rollback could not protect these writes. settleGrudge treated any nonempty resolution as forgiveness and automatically increased joy. The narrowness audit identifies both defects; the earlier scene test only observed memory and did not exercise refusal.

## Decision

The six existing public write APIs execute their existing operations against the store transaction draft. Failed operations abort; denied transactions report failure. Read APIs return detached snapshots. Results expose persisted and deferred separately, preserving store semantics rather than claiming durable success from ok alone.

Grudge resolution requires caller-supplied evidence and an explicit personal response: reject, acknowledge, accept-repair, or forgive. Accepting repair does not settle the grudge. Only explicit forgiveness marks it settled and reduces resentment; neither repair nor forgiveness automatically increases joy or restores trust. Evidence is a caller assertion, not independently authenticated proof. Attempts are bounded to eight per grudge.

## Alternatives considered

Calling save after direct mutation is smaller but cannot restore permission checks or outer rollback. Automatically interpreting apology text is convenient but silently invents personal consent. Existing method names remain to avoid needless dispatch changes, while the settlement input contract is intentionally stricter.

## Consequences

Old callers supplying only resolution must now supply evidence and response. Existing already-settled records are preserved; the system does not fabricate missing historic consent. Nested transactions can defer commitment, so callers must not report persistence before the outer transaction completes. In-memory counters can still reflect successful inner calls later rolled back by an outer owner; this patch proves world-state rollback, not transactional telemetry.

Verification: tests/human-realism-transaction-regression.js tests write routing, rejection, detached reads, outer rollback, repair without forgiveness and no forced joy. Updated tests/scenario-v16-human-realism.js supplies explicit consent. Routine regression and dead-export gate also pass. No restart or live SillyTavern persistence acceptance is claimed.

Active-note search found no owning human-realism decision; this complements [routine candidate boundaries](../architecture/2026-11-06-routine-agency-boundary.md) without replacing that decision.