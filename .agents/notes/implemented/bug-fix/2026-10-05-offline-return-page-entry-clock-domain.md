# Agent Note: Page-resume entry and clock-domain split in offline recovery

Status: implemented

## Problem

Two gaps in TP3, both confirmed by reading the source rather than inferred:

1. **No page-resume entry exists.** `visibilitychange` / `pageshow` have zero
   hits across the whole product face. The only live subscriptions are
   `storage` (core/store.js), `abort` (core/api-router.js), panel controls, and
   a `DOMContentLoaded` fallback (index.js). So "you closed the page and came
   back" is not listened to anywhere in the host event surface; recovery only
   happens when something else happens to run the `before` chain or a
   `chat:changed` arrives, and neither is guaranteed.

2. **The gap computation subtracts across clock domains.** In
   `offlineReturn.recover()` the value `now` comes from `clock.now()` — the
   *decision* clock — while `base.at` is `playtime.lastActive().at`, written by
   `playtime.touch()` with `clockWall()` — the *measurement* clock. `core/clock.js`
   states the rule explicitly: the two time kinds must not be mixed.

Gap 2 is invisible while the clock is unfrozen, because both sources then
return the raw wall clock, so no existing lock or daily run exposes it. It
appears exactly when the decision clock is frozen or replayed — the core
mechanism of the replay bench. Repro: with the baseline 30s old and the
decision clock frozen at wall +2h, the old form produced `gapMs = 7230000` and
settled normally, i.e. "the clock was frozen" was read as "you really were
gone two hours", with a reading (rounds / applied / batches) identical to a
genuine absence.

## Decision

**Clock domains.** Without an injected `o.now`, the *decision* input is the
measurement clock (`gapAt = clockWall()`), so the subtraction stays inside one
domain; the timestamp actually handed to `offlineTick.tick` and written into
the batch ledger stays the decision clock (`now`), because it is an in-world
instant. With an injected `o.now`, the value is honoured verbatim for both, so
`panel`, the lock fixtures and the rejection witnesses keep byte-identical
behaviour (verified by re-running all five pre-existing locks plus
`reject-lock-v2780`). Attribution for a backward jump now carries `gapAt`,
`decisionAt` and `crossSource` separately: a single delta makes "the clock is
frozen" indistinguishable from "the user changed the phone clock", and the two
have different owners.

**Page entry.** Two listeners are bound lazily — only after a real settlement
succeeds, next to `ensureSubscribed()`. Failures never propagate; the hook
itself cannot throw. Repeated notifications are coalesced on the measurement
clock through `PAGE_COALESCE_MS`, because a resumed background tab can fire
several times for one return. `visibilitychange` reacts only to the transition
back to visible (the same event also fires while hidden, when you have not
returned), and `pageshow` only to a bfcache restore (`persisted`) — the initial
load also fires `pageshow`, and honouring it would race the `before` chain's
`first-baseline` and record a first load as a return.

The coalescing window is evaluated **inside `recover()`**, only for triggers
starting with `page-`. This keeps the export face at exactly five members (a
contract already pinned by a lock) and makes coalescing and adjudication share
one entry; non-page triggers keep their own timing. The entry deliberately adds
no workflow node: it is an event-surface concern, not a chain concern, so the
node count and `critical:false` count are unchanged and the module gains no
load-time edge — only one call-time edge, `engines/offline-return.js ->
index.js (mainWin)`.

One new rejection code, `coalesced`, is witnessed through the real API and
stays out of the baseline. It must never be merged with `too-short`:
coalescing is a notification-surface fact, being too short is a time-surface
fact.

## Consequences

- Freezing the decision clock no longer manufactures a fake absence.
- The page entry exists, coalesces, and reports "how many beats were merged"
  and "what happened to that beat" separately (`pageCoalesced` /
  `lastPageReason`); both are declared in the stat literal, so they cannot
  silently become `NaN`.
- Dedicated lock `tests/s3-tp3-v2161.js`, **39 / 0** (12 structural, 13
  behavioural, 14 negative-control), with three real-source mutations each
  paired with "same criterion still true on the original".
- Behavioural fixtures pin the baseline with a stub on the measurement clock
  instead of real timing: `touch()` and `recover()` can land in the same
  millisecond, which made `gapMs` oscillate between 0 and 1 and turned the
  criterion into a coin flip. A +-3ms tolerance is likewise not laxity.
- Six stale assertion messages (comparison updated, message text left behind)
  and one weak version criterion in `tests/run.js` were corrected in the same
  batch.

## Not covered

- Real-host triggering is still unverified: headless only proves the listeners
  are bound and that the callback coalesces and rejects per policy. Actual
  `bfcache` behaviour and how many beats a resumed mobile tab fires belong to
  the fourth (player-path) column.
- The UI layer remains unverified on-device as in previous versions.
- The full regression has not been run in this round, per the standing rule to
  run it only after the plans are complete.

## Alternatives considered
> 本节为 O7（v2.187.0）格式补登：本篇原文未记录被否决方案，此处**如实留空**：O7 只做结构补齐，不为历史笔记事后追补当时未记录的取舍（原文「Not covered」一节记的是**未覆盖面**，不是备选方案，故不并入本节）。
