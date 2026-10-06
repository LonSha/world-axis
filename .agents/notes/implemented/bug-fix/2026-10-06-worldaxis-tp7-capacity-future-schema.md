# Agent Note: In-transit obligations and future-schema archives in long-run capacity

Status: implemented

## Problem

Two long-run defects, both reproduced rather than inferred:

1. **In-transit obligations are evicted silently.** `core/evict.js` implements
   bounded containers as rings: when `before > cap`, the oldest rows are
   `slice`d off and the caller gets success. That is correct for *recyclable
   history* (arrived / halted / delivered / flushed rows), but the same ring is
   also applied to **unfinished obligations**. Reproduction: sending 25 goods
   batches (`world.shipments` cap = 16) drops the first 8 **still-in-transit**
   batches, the caller receives `{ok:true}`, and `evictStat` keeps only a list
   of discarded `shp_*` names. A table whose job is to answer "where is the
   cargo" answers "no idea" once it is trimmed as a ring.

2. **A future-schema archive is silently downgraded.** Handing a
   `schemaVersion = 6` archive to code with `SCHEMA_VERSION = 1` takes the
   *false* branch of the "non-empty and **lower than** current version" test,
   so the archive never enters `migrate`; it falls through to `ensureShape` and
   is written back by `save()`. Measured: **3691 bytes → 3730 bytes** — the old
   code padded a future archive with *its own* skeleton and normalised the
   version number. The same repository already rejects this case in
   `tool-snapshot.validate` ("存档 schema 6 高于当前 1（请升级扩展）"), so one
   fact had two books.

## Decision

**In-transit obligations use three layers; none of them is sufficient alone.**
An `IN_TRANSIT` predicate table in `core/evict.js` marks six obligation
containers (`world.shipments` / `world.messages` / `world.journeys` by
`status === 'in-transit'`, `farfield.pending` by `deliveredAt == null`,
`collab.queue` by `flushedAt == null`, `liaison.deals` by `pending|due`).
In-transit rows are kept first, remaining budget goes to terminal rows, and
terminal rows still leave by ring, so `cap` is unchanged. When in-transit rows
alone exceed `cap`, **no truncation happens at all** — the container may exceed
`cap` rather than lose unfinished cargo, mail or journeys, and the call is
attributed `in-transit-full`. The write side in `engines/world.js`
(`depart` / `deliverGoods` / `sendMessage`, exactly one site each) calls
`WA.evict.array` right after pushing the row inside its `mutate` callback; on
`in-transit-full` it returns `false`, which rolls the whole transaction back and
hands `{ok:false, reason:'in-transit-full', channel, inTransit, cap}` back to
the caller. Rollback and rejection therefore happen in one transaction and no
half row is left behind.

Both layers are required, and that is the expensive judgement of this version:
a write-side gate alone cannot help an **archive that is already over the
limit** (the gate only governs new writes, not the twenty rows already in the
save file), and an eviction-side exemption alone makes the world grow quietly
with no rejection reason to show. Only together do they satisfy both "nothing
is lost" and "it can be explained".

**The reading is deliberately kept out of the failure face.** `liveStat =
{ held, full, lastSite, lastAt }` is exposed through `evictStat().live` and is
**not** routed into `noteFail` / `failedBy` / `evictFailed`. "The evictor is
broken" and "the world is genuinely full" must not look the same in diagnosis;
folding a capacity verdict into the failure-attribution table destroys that
distinction permanently.

**Future-schema archives are rejected, not downgraded.** Two guards in
`core/store.js` — the `init()` load path, placed *before the last branch of the
function that could write to disk*, and inside `migrate()` only when the caller
did not pass an explicit `targetVersion` (that parameter is the documented
"cross-version chain testing and debugging" door, and its semantics belong to
the caller) — both write `__migrateReport = { from, to: from, path: [],
steps: 0, failed: [], refused: 'future-schema', current, at }`, increment
`__loadStat.migrateRefused`, record `__loadStat.lastRefused = { from, current,
at }` and `return` immediately: no defaults filled in, no version normalised,
no residue deleted, **not one byte of the archive rewritten** (measured
3691 → 3691; the old form was 3691 → 3730). `loadStat()` already exports both
fields for direct diagnosis, and the `schemaMigrate` issue in
`engines/tool-diag.js` reuses the same issue key to raise a rejection to
**error** level (a legitimate migration stays info), so no new key surface is
added. The early return lives in `init()` rather than `load` because in `load`
"load failed" and "rejected" would read as the same thing.

One rejection code, `in-transit-full`, is witnessed through the real API and
stays out of the baseline. It must never be merged with SP4's `pending-full`:
the latter reports through `skipped.why` (not collected by the scanner) about
the **far-field batch queue capacity**, while this one reports through
`reason:` (inside the scanner) about **in-world transit capacity**. Collapsing
them makes it impossible to read which layer is full. Note also the honest
boundary that the future-schema case is recorded as the report field
`refused:'future-schema'` rather than a `reason:` literal, so it is **not** part
of the rejection-code enumeration — it is an enum value in a report, not an
inline code.

## Alternatives considered

**Evict by predicate inside each engine instead of in `core/evict.js`.** The
containers are heterogeneous (some keyed on `status`, some on a timestamp
being null), so per-engine logic would put six copies of "what counts as
unfinished" next to six different call sites, and any seventh container would
be added without one. The predicate table keeps one declarative list where the
`SITES` capacity table already lives, which is also what lets the lock assert
that the two tables agree key by key.

**Exempt in-transit rows on the eviction side only.** Smallest change, and it
does stop the loss, but it hides the loss instead: the world quietly exceeds
its declared capacity and the user has no rejection reason. Measured capacity
is a promise in this repository, so a silent overrun was rejected.

**Gate only on the write side.** Cheaper and it gives a proper rejection, but
it does nothing about an archive that is already over the limit — the exact
reproduction above would still lose 8 batches after any load.

**Have both guards delegate to a new shared helper.** Two guards in two
different functions disagreeing would be worse than duplication, but a helper
call still needs the same three fields written in the same report shape; the
shared thing here is the *shape*, which the lock pins, not the code path.

**Honour a future archive by clamping its version and reading what it can**
(the pre-existing behaviour). This is precisely the failure being fixed: the
future fields' semantics are unknown to the old code, and the save path then
writes the low version number back, corrupting the archive for the code that
does understand it.

## Consequences

- Over-limit archives no longer lose in-transit cargo; new writes at capacity
  are rejected truthfully, with channel, count and cap in the return value.
- Future-schema archives are rejected with a readable reason and are byte-for-
  byte untouched; the rejection is visible both as a reading
  (`migrateRefused` / `lastRefused`) and as an error-level diagnostic issue.
- Dedicated lock `tests/s3-tp7-v2162.js`, **53 / 0** (15 structural, 23
  behavioural, 15 negative-control) with three real-source mutations (the
  exemption predicate, the rejection reading, the write-side gate), each paired
  with "the same criterion still holds on the original".
- Two lock criteria had to be rewritten after measurement, and both lessons are
  reusable. ① The first N1 anchor broke the `liveN > cap` early return; after
  the break the in-transit rows were **still fully preserved** (the exemption
  body was intact), so the criterion passed on the broken copy while losing
  **0** rows — a false green. Breaking `const isLive = IN_TRANSIT[site];`
  instead restores the old ring semantics exactly, and the measurement becomes
  "20 batches reported accepted, 16 rows left, 4 in-transit batches lost while
  every write reported ok". A mutation anchor must sit on the line the
  criterion actually depends on; breaking a neighbouring branch is not the
  same as breaking its load-bearing surface. ② The first B6 fixture built
  "in-transit full" by calling `depart` 26 times, but every call was consumed
  by `unknown-place` (one in-transit journey per person, and the road network
  was not registered), so **the rejection never fired** and the criterion
  passed on something that never happened. It now injects `jcap - 1`
  in-transit rows on the spot and then goes through the real API, checking both
  "accepted while there is budget" and "rejected truthfully when full, with the
  rejected journey absent from the table". When a fixture builds a state
  through the real API, it must first **prove the state was reached** (here, by
  asserting the reason is exactly `in-transit-full` and not some other code),
  otherwise "the fixture did not take effect" and "the feature is correct" read
  the same.
- Three stale documentation readings were corrected in the same batch:
  `docs/ERROR_CODES.md` regenerated (707 → 708 codes, ledger version 2.162.0),
  and `docs/README.md`'s hard-coded "678 inline codes" replaced with "refreshed
  by the generator each version" — the fix adopted in v2.155.0, now with the
  number removed rather than updated.

## Same-series notes

The audit performed while writing this note (searching proposed + implemented
by module and keyword) found two neighbouring records, neither absorbed by this
one: `2026-10-05-offline-return-page-entry-clock-domain.md` (TP3: page-resume
entry and clock-domain split — different files, and the capacity verdicts here
do not touch the time sources) and `2026-10-04-offline-farfield-audit-integrity.md`
(offline settlement and audit evidence integrity — it covers `farfield.pending`
duplication, which this note only uses as a *model* for the three-layer pattern;
the in-transit exemption here adds the `deliveredAt == null` predicate to the
eviction side without changing that engine). The two `proposed` architecture
notes describe the TP/TX plans and the player-workflow contracts; both remain
proposed and are not superseded by this change.

## Not covered

- Real-host verification is still pending: headless only proves that the write
  side rejects by capacity verdict, the eviction side keeps in-transit rows,
  and a future archive is not rewritten. On-device storage-quota pressure and
  recovery after the host clears `localStorage` belong to the fourth
  (player-path) column.
- The UI layer is unverified on-device as in previous versions
  (`ui/panel.js` is not loaded in the headless regression).
- The full regression was not run while this version's content was being
  landed, per the standing rule to run it only after the plans are complete;
  only the dedicated lock, the negative controls and the targeted gates were
  run, and a local pass was not treated as a full pass. It *was* run afterwards,
  in the collection round recorded in
  `2026-10-06-worldaxis-collection-round-debt-and-tree-integrity.md`: the first
  run produced 15433 pass / 10 fail, none of the ten from this version's product
  code, and the confirming run produced **15441 pass / 0 fail**
  (`status: passed`, `unchanged: true`).
