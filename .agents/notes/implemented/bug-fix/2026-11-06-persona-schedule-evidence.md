# Persona evidence parity and story-hour schedule matching

## Why
Preflight required event evidence while generated-content audit accepted intensity alone. Hour schedules compared against epoch milliseconds never matched.

## Decision
Both persona gates require finite numeric intensity and nonblank textual evidence. Evidence remains caller-supplied, not independently verified. Legacy schedule ranges inside 0..24 are matched to local hours in draft.clock.iso; absent story time produces no match. Absolute ranges keep facts.now comparison. No device-timezone conversion or wall-clock fallback.

## Rejected alternatives
Do not remove personality protection to hide inconsistent gates. Do not convert story hours through device-local Date or assume wall time equals story time. Do not rewrite all historical schedule rows without a migration contract.

## Verification
node tests/persona-anchor-v2249.js: 11 passed.
node tests/persona-schedule-evidence-regression.js: PASS, exit 0.
node tests/life-v2520.js: exit 0 (no output).
git diff --check: clean.

## Remaining boundaries
No full ISO/date validation; no overnight hour intervals; schedule write validation and cross-domain conflict checks still need explicit contract. day-route remains conservatively unjudgeable for clock schedules and its historical documentation needs updating. Offstage random factual fabrication is not fixed by this patch. No live SillyTavern acceptance or release performed.
