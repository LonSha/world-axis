# TX3: Freight Coordinator Boundaries

## Problem

economy.ship() moves goods instantly — destination stock increases with no source
deduction, no transit state, no transit time, no arrival confirmation, no cancellation,
no rerouting. Region has geography/roads/closures but no transport layer. The gap:
there is no concept of "goods in transit" between dispatch and arrival.

## Decision

freight.js is a **coordinator**, not a substitute. It reads/writes economy.goods
(the single source of truth for inventory) but creates its own transit records
(shipment ledger). Eight negative boundaries:

1. Default off (enabled:false) — must be explicitly enabled.
2. Conservation: source deduction + in-transit = original amount; on arrival,
   in-transit → destination.
3. Not-yet-arrived inventory is not buyable (in-transit ≠ arrived).
4. Missing route / missing transit time → refuse (no fabricating distance).
5. Road closure preserves cargo (can resume when unblocked).
6. Cancellation settles by executed stage (return freight + damage fee).
7. Duplicate arrival is intercepted by status marking (idempotent).
8. No fabricating inventory / routes / resources (economy is the inventory
   truth source; this module only coordinates).

## Key alignment issues

- **DEAD table vs. witness**: All 7 reject codes (already-arrived / bad-state /
  missing-dest / missing-transit-time / shipments-full / unknown-shipment /
  unknown-source) are structurally reachable in source but require complex
  preconditions (economy data setup) to trigger in standard boot. Registered
  in DEAD table with anchors + why, not in base.
- **Injection chain seven points**: SOURCES, __REG.def, SRC_NAME, SRC_MOD_SETTING,
  injection branch, VIS_NAMES, PRIORITY+ACCOUNTS — all same-batch, display name
  「货运在途」 identical across all seven.
- **panel.js template string nesting**: First attempt used nested backtick
  template strings inside `${(() => { ... })()}` — caused SyntaxError.
  Fixed by using single-quote string concatenation.
- **vm sandbox vs. sync.fresh**: `const WA = window.WorldAxis = window.WorldAxis || {}`
  in a vm sandbox creates a new {} instead of reusing the sandbox object.
  economy and freight end up undefined. Fix: use `sync.fresh({}).WA` (same
  approach as TX1/TX2).
- **TX2 version pin drift**: s3-tx2-v2166.js hardcoded VERSION='2.166.0'. After
  upgrade to 2.167.0, it reported 2 failures. Fixed by accepting 2.166.0 or 2.167.0.

## Rejected options

- **Direct stock manipulation without transit records**: Rejected because it
  loses the concept of "in transit" — you can't distinguish "not yet arrived"
  from "never shipped".
- **Timer-based arrival**: Rejected because WorldAxis has no timers; arrival
  should be driven by the AI's narrative time progression (clock ticks),
  not wall-clock timers.
- **Route fabrication when missing**: Rejected — if a route has no destination
  or no transit time, refuse the dispatch rather than guessing distance.
  This aligns with the negative-boundary discipline.
- **Merging already-arrived and bad-state into one "state error" code**: Rejected
  because the former is a normal idempotency intercept (ok:false but expected)
  while the latter is an anomalous state transition (requires investigation).
