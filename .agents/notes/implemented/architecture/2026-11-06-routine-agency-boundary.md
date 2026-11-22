# Agent Note: Routine candidates preserve personal agency

Status: implemented

## Problem

Identity templates in routine-pacing equated rebellion with truancy, poverty with shame, and leisure with modern shopping regardless of world. Reading the prompt randomly changed supposedly current actions. The initial transaction calls also used the wrong argument order. Existing passing assertions rewarded these stereotypes rather than checking agency.

## Decision

Routine evaluation returns explicit candidate status, not completed actions. Meals and sleep have independent windows; low willingness supplies conflicting choices and consequences rather than compulsory escape. Personal context carries goals, obligations, leisure preferences and consequence concerns. Experiences remain evidence rather than keyword-triggered diagnoses. Profiles may select their own preset and partial updates preserve prior willingness and disposition.

Story clock ISO local time determines the window when available; explicit frames are fallback configuration, never a new ticking world clock. Unknown weekend duties remain unknown. Empty enrollment emits no default school setting. Prompt reads are deterministic and do not mutate world state.

## Alternatives considered

Random pools provide vivid low-cost narration, but invent concrete actions and shift location on reread. They are removed from decision evaluation. A single compliance number is cheap but cannot explain goals and consequences; it is retained only as one signal. Automatically inferring schedules from free-form biographies might reduce configuration but can silently manufacture facts; this pass requires explicit configuration instead.

## Consequences

The module is safer but is a candidate projection, not a complete autonomous action scheduler. It does not yet infer profiles from existing people, reconcile detailed reservations, verify opening hours or commit travel/actions from narrative receipts. Current templates are reference material, not evidence of attendance. The unused history container and legacy exposed constants still need compatibility review before removal.

Verification: tests/routine-agency-regression.js covers contradictory motives, preservation on partial updates, meal/sleep priority, unknown weekends, genre isolation, pure repeated reads, story ISO and collector projection. tests/scenario-v20-routine-pacing.js replaces truancy/poverty assertions with anti-stereotype contracts. No live SillyTavern execution is claimed.

Historical note search for routine-pacing and character rhythm found no owning active note; no existing decision is replaced.
