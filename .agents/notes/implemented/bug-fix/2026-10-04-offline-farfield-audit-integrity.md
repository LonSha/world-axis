# Agent Note: Offline settlement and audit evidence integrity

Status: implemented

## Problem

The demand probe reproduces three misleading success states on v2.155.0:
offlineTick reports a protected path after overwriting its value; farfield
creates duplicate future pulses without elapsed time and delivers blocked
messages; ecoAudit reuses a clean result after world mutation or chat change.
The previous special locks accept those states because they test the reported
protection rather than the value, the first-call baseline rather than repeated
time, and the existence rather than the scope of a cached audit.

## Decision

offlineTick runs synchronous apply callbacks on a private candidate for the
whole batch. It restores protected subtrees before the next round and commits
only after all rounds succeed. Protection reads anchors from the transaction
draft and detects real changes even when touched is absent. A thrown or rejected
round discards the entire candidate; asynchronous results are rejected. The
committed copy is detached from references retained by apply. No-apply batches
report zero actual rounds and retain their settlement baseline for retry.

farfield processes only completed world-clock daily windows. Zero or backward
time and a zero budget do not advance the cursor. A reduced budget retains
unprocessed windows. Message delivery reads blocked places from region, keeps
blocked messages in transit, and includes the block count in its result.

ecoAudit binds cached evidence to chatId, stateRev, settings and an exact
serialized snapshot of its read surfaces. The snapshot detects direct live
mutations and unflushed batches that stateRev alone misses. Stale evidence does
not count toward current health; maintain and panel explicitly request a new
scan. Scanning remains a read-only, explicit operation.

## Alternatives considered

Let apply enforce a supplied guard list: this avoids candidate copying and gives
engines more control, but makes protection depend on every callback honoring a
new contract. It cannot repair legacy callbacks or stop partial writes on throw.

Undo the whole live draft after a protected mutation: this is simpler but also
discards valid unrelated changes. Selective restoration in a private candidate
keeps those changes without exposing unprotected intermediate state.

Invalidate audit results using only chatId and stateRev: cheap and sufficient
for ordinary saves, but misses live mutations and deferred batch saves.
Automatic sweep in maintain avoids stale reads, but changes the existing cost
boundary and turns every patrol into a new full ecology scan.

## Testing

tests/demand-integrity-v2155.js runs real modules through ui-gate-sync. Positive
cases inspect committed values, cursor preservation, blocked queues and patrol
issues. Five mutations change real source copies and rerun the same criteria;
disk source stays untouched. Missing and duplicate mutation anchors throw, and
an insensitive negative criterion fails explicitly. The lock is called from
tests/run.js. Existing offline/farfield/eco locks remain in the regression.

## Consequences

The exported member surface and version remain unchanged. Offline callbacks
must mutate only their supplied candidate; external effects, nested store writes
or retained live-store references are not sandboxed by this mechanism. Candidate
copies cost O(world size) per bounded round; audit cache validation costs
O(audit read-surface size) and retains one serialized snapshot in memory.
The snapshot includes evolution.events and currents because causal.knownCause
reads those indirectly. Each new read dependency must enter this scope before
its cached result can count as current health.
These costs buy actual isolation and exact evidence scope without dependencies.

This repair does not claim automatic offline restoration, automatic farfield
workflow integration, or cross-chat seed initialization. Those are separate
missing workflows, not defects in player approval or branch-selection controls.

Historical decision search finds no .agents/notes tree and no overlapping note
in docs or tools/w1_design_notes.md. [NEXT_PLAN.md](../../../../NEXT_PLAN.md) is partially overlapping: its
completed checkmarks describe delivered modules, not end-to-end acceptance.
Its new scope correction retains historical delivery facts and records the
unclosed workflows instead of deleting the plan or changing player decisions.
The [proposed player-workflow plan](../../proposed/architecture/2026-10-04-worldaxis-player-workflows.md)
partially overlaps this repair. It owns future orchestration and acceptance;
this implemented note continues to own the current data-integrity boundaries.

The [TP/TX planning proposal](../../proposed/architecture/2026-10-05-worldaxis-tp-tx-plans.md) partially overlaps these integrity constraints. It owns the later chat-scope repair, lifecycle closure and playable consumers. This implemented note retains its candidate, timing and evidence decisions; it does not claim those later workflows are delivered.
