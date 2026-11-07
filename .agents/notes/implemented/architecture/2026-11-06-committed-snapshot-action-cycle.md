# Action workflow consumes committed snapshot before new inference

## Evidence / supersedes
Supersedes workflow ordering in 2026-11-06-agency-workflow-wiring and the starvation limitation in 2026-11-06-action-background-barrier. backstage.simulate order 20 starts inference asynchronously. Merely adding busy guards to later action nodes would defer on every automatic inference turn.

## Gate and contract
Local Fix Only in agency.js, act.js and focused workflow test; no network wait, owner state schema change or new action clock. Admission order 18, advancement 19, feedback 19.5, then inference launch 20. Read the prior committed world; this turn's inference results participate next turn. If previous inference still runs, all action nodes return backstage-running/deferred. Existing manual APIs unchanged.

## Rejected alternatives
Do not await model inference on the host workflow, manufacture a snapshot copy, duplicate receipt processing on settled events, or blindly continue during active inference. A same-turn post-inference cycle needs separate dedupe and chat ownership design.

## Verification
agency-workflow-integration passes relative ordering including backstage.simulate, gates, fairness, per-actor exception isolation and busy zero-write checks.
s3-u2-v2194 passes 67/67. dead-export gate passes. git diff --check clean.

## Limits
Prior committed-state semantics add intentional one-turn latency for newly inferred plans. Persistent long-running inference still defers actions; no automatic timeout or cancellation is introduced. Tests stub dispatch calls and are not proof of complete live multi-turn plan execution. Other after-node order collisions need whole-workflow audit. Full regression in background predates this patch.