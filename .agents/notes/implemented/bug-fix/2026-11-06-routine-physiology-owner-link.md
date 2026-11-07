# Routine consumes physiology exemption owner

## Evidence and gate
routine-pacing read raw energy but ignored humanRealism exemption presets and per-character overrides, producing meal/recovery candidates even for exempt actors. Local Fix Only in two owners and existing focused regression. No duplicate preset table or new persistent state.

## Decision
Expose read-only humanRealism.isExempt(name, dimension), reusing its existing resolver and detached getActor. Routine uses energy and nourishment capability gates for generic meal/recovery windows; exempt windows become discretionary candidates. Explicit deviations retain priority. Per-character overrides remain authoritative over species presets.

## Rejected alternatives
Do not copy preset arrays into routine, infer needs solely from species strings, or write food/sleep completion from a time window. Do not initialize unknown people while checking capability.

## Verification
life-boundary-batch-regression passes divine energy exemption, nourishment false override restoring meal candidate, true override suppressing generic meal candidate, and unknown-person read purity.
routine-agency-regression, human-realism-transaction-regression, scenario-v20-routine-pacing and dead-export-gate all exit 0. git diff --check clean.

## Limits
Existing energy exemption currently gates generic sleep/recovery too; separate sleep biology is not modeled. Exempt actors may still choose meals/rest/social participation; only generic physiological prompts are suppressed. Does not prove all other physiological owner representations are reconciled. Integration remains partial.