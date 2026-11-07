# Defer automatic action cycle during asynchronous inference

## Evidence and gate
backstage.simulate workflow calls requestSimulate without awaiting its returned task. Existing order 20/21 does not establish simulation completion. Local Fix Only on automatic workflow paths in agency.js and act.js, plus agency workflow test; manual owner APIs unchanged.

## Decision
Check backstage.isRunning in automatic admission, act advancement, and receipt feedback. Return backstage-running/deferred and perform no action writes while inference is active. Do not block the entire workflow waiting on a network model call. Missing backstage keeps existing behavior.

## Rejected alternatives
Do not await unbounded inference on after workflow. Do not duplicate action advancement inside backstage settlement or add event listeners without idempotency/round ownership. Do not claim numeric ordering is a completion barrier.

## Verification
agency-workflow-integration passes busy response and zero-world-write assertions for all three nodes, in addition to prior ordering/fairness tests.
s3-u2-v2194 passes 67/67. Dead-export gate passes unchanged frozen sets. git diff --check clean.

## Residual risk / next gate
This is a conservative deferral guard, not a completion-driven scheduler. Repeated auto inference on every reply can keep all after nodes busy, starving action advancement. Need a separate bounded completed-snapshot scheduling contract (before next simulation or post-settlement with round dedupe), tested across chat changes and stale rejection. Do not describe the async loop as closed until this is implemented. Busy checks do not lock unrelated manual writes. Current background full regression predates patch.