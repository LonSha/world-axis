# Detached motive preview before automatic integration

## Evidence and gate
motive.decide mutates caller-owned person.life, commitment statuses and physiological scars without owning a store transaction. evaluate also dereferenced person.bonds for null person on forUser candidates. Local Fix Only: motive module, ActionDesk endpoint, focused test; ledger evidence count adjusted only for the added internal evaluate call, not new dead-export allowances.

## Decision
Add motive.preview with detached JSON-compatible inputs/outputs, status candidate and applied false. Expose via motive.preview ActionDesk endpoint. Preserve legacy decide for compatibility; do not auto-dispatch it. Catch invalid JSON-compatible input as invalid-arbitration-input. Fix null-person guard in shared evaluator.

## Rejected alternatives
Do not silently change existing arbitrate mutation contract; existing tests and callers may rely on it. Do not convert scoring or hard-lockout recommendations into actual collapse, broken promises or scars. Do not auto-generate scored alternatives from identity labels.

## Verification
motive-preview-regression passes ActionDesk reachability, no world/person mutation, result isolation, null person, lockout candidate labeling.
exp14-motive-arbitration-v2232 passes 22/22.
agency-workflow-integration passes.
Dead-export ledger own-count updated from 4 to 5 for evaluate after adding preview call; frozen entry sets unchanged.

## Limits
Preview preserves evaluator scoring semantics and external read dependencies; it does not independently verify facts or normalize all malformed candidates. Legacy decide remains a mutation risk until its callers migrate. This is a safe integration endpoint, not complete automatic motive-to-action integration.