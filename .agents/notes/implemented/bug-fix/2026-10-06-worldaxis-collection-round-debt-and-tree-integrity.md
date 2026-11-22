# Agent Note: Collection-round debt and a tree-integrity gap the gates could not see

Status: implemented

## Problem

Running the full regression for the first time after the standing "do not run
it until all planned content is in" rule was lifted produced **15433 pass /
10 fail**, and **not one of the ten failures came from this version's product
code**. They are three debt families accumulated during the discipline window,
plus one fixture defect:

1. **Stale exact readings (2).** `tests/run.js` asserted `checked === 136` in
   two places. The number has been a literal since v2.151.0 and the derivation
   arithmetic in the comment stopped being updated while `__BOUNDED_CAPS` kept
   growing. Measured on the spot: **156 keys − 19 wildcard = 137**.
2. **A threshold inside the jitter band (1).** `v2320` asserted
   `el2320 < 5000` while calling itself "an order-of-magnitude distinction, not
   jitter". The same code measures 2783–3105 ms standalone but **5385 ms inside
   the full-regression process** (two hundred prior sections have already
   raised memory and GC pressure). Uncached would be ≈ 85 s per call ⇒ 20 calls
   ≈ 1700 s, so 5000 ms was never the order-of-magnitude line it claimed to be.
3. **A criterion anchored on the wrong thing (2).** `v2155` A7b counted literal
   **occurrences** (`countOcc(..., "'worldSeed:initConfirm'") === 1`), but since
   v2.159.0 that same name also appears once as a `settleAsync` site name —
   legitimately reusing one name. "Exactly once" therefore became permanently
   false while the property it meant to protect was intact.
4. **A fixture that was not re-entrant (5).** `tests/s3-tp4-v2160.js` is invoked
   **three times** by `run.js` (`runAll`, an explicit `runAsync`, and
   `runNegative`), and its `boot()` callers passed a **fixed** chat id. From the
   second pass on, that chat already held the receipts written by the first
   pass, so `begin('op_n1')` returned `duplicate-op` immediately, the response
   carried no `chain`, and N1c fed `undefined` into `commit`, which answered
   `bad-chain`. Measured: 18/18 on the first pass, 13/18 from the second.

Two further findings came out of the same round and are not "stale numbers":

5. **The same criterion had two homes.** The v2155 transaction-name criteria
   existed **both** inline in `tests/run.js` and in the dedicated lock
   `tests/world-seed-v2155.js`. One source change (the v2.159.0 site name)
   turned both red simultaneously — the cost of a second source, paid in full.
6. **A dependency was excluded by a form rule.** `tools/test-audit.js` was
   ignored by `.gitignore` (an explicit `tools/test-audit.js` line in the
   v2.161.0 form-based block) while being a **hard dependency** of
   `tests/run.js` (read directly) and of `tests/test-audit-v2155.js`
   (`require`). `git ls-files tools/` does not contain it, so **a clean clone
   would fail the regression with ENOENT** — while the local tree, where the
   file sits on disk and always will, stays green no matter how many times the
   suite is run. The defect lives in the checkout face, which the run face
   cannot observe.

## Decision

**The duplicate is deleted, not synchronised.** For (5), updating both copies
would preserve exactly the second source that produced two simultaneous reds.
`tests/run.js` keeps its registration and consumption assertions and delegates
the structure criteria to the lock, which already runs inside the same section
via `runLock`, with both its positive and its real-source-mutation negative
control inside it. After the edit the assertion total moves 15443 → 15441, and
that difference is exactly the two deleted assertions — a check that can be
reconciled item by item.

**A7b anchors the transaction call, not the name's occurrence count.** The
criterion's subject is "each write site names its transaction and they do not
share one", so the anchor is the statement tail `}, 'worldSeed:xxx');` — the
site where the name appears as `store.transact`'s second argument. Two sites
sharing one name now hit twice (red); a site omitting the name hits zero times
(red). Reusing a name as a *site label* somewhere else is no longer able to
move this criterion.

**Exact readings are refilled from the spot measurement, and the arithmetic
stops being maintained.** The derivation in the comment is itself a second
source that has to be right on every line; its verifiability is already carried
by the adjacent `checkedKeys`-versus-registry double check, which is a set
equality rather than arithmetic. The assertion stays an exact equality, so a
container being wrongly deleted or left unregistered still turns it red.

**The performance threshold moves from the jitter band into the order-of-
magnitude band (60000 ms).** That is not a relaxation of the intent: 60 s sits
10× above the measured jitter upper bound and 28× below the uncached ≈ 1700 s.
The criterion's only remaining failure explanation is "the cache is not in
effect", which is what it always claimed.

**The chat-uniqueness contract belongs to the fixture that owns it.** For (4),
callers now pass a prefix and `boot()` appends its own sequence number.
"One independent chat per case" is `boot()`'s contract; requiring every caller
to remember to vary a constant is how the contract was lost in the first place.

**Ignore rules are reviewed by reference, not by form.** A form rule beats a
per-file registry, but it still needs one pass of "is this referenced by an
executable path?" — the same judgement v2.120.0 wrote down ("only tools
referenced by executable code belong in the repository"), which
`tools/test-audit.js` satisfied all along. The rule's own comment now says the
error was treating "is depended upon" as "is a one-off artifact". The rest of
the ignore face was checked in the same pass and **stays excluded for the right
reasons**: `tools/*.py` one-off scripts, and `tests/export_contract.txt` is a
*derived* artifact whose generator is really run inside the regression (so it
is rewritten mid-run, and the regression's snapshot includes untracked files —
tracking it would make `unchanged` permanently false). The whole face was then
scanned mechanically: enumerate every path that exists on disk and is read by
code, then subtract `git ls-files`. `tools/test-audit.js` was the only
qualifying hit.

## Alternatives considered

**Update both copies of the duplicate criteria.** Rejected: it keeps the second
source. The failure mode is not "someone forgot to update" but "there are two
places to update", so the fix is to remove one.

**Relax the exact readings (`>= 136` or a range).** Rejected: an exact reading
is what makes a wrongly deleted or unregistered container visible. The problem
was a stale *value*, not the strictness of the comparison.

**Keep the 5000 ms threshold and mark the criterion flaky.** Rejected: a
criterion whose red can also mean "the machine was busy" trains the reader to
ignore reds, and this repository treats a red as a claim about the product.
Widening to the order-of-magnitude band preserves the claim.

**Have the fixture clear its receipts between passes.** Rejected: it would make
the fixture's correctness depend on knowing that a previous pass ran in the same
process — the same coupling, only moved. A per-case chat id removes the coupling
instead of managing it.

**Delete `tools/test-audit.js` instead of un-ignoring it.** Rejected: it is the
only self-audit entry point for the suite (`anchor-scan` reuse, duplicate-anchor
rate, dead anchors), and its own lock asserts it performs zero writes. The
ignore rule was wrong about it, not the other way round.

**Track `tests/export_contract.txt` as well, since it is read by code.**
Rejected on evidence: a real run inside the regression rewrites it, and the
snapshot includes untracked files, so tracking it would break `unchanged` on
every run. It is a derived artifact, and the `.gitignore` comment says so.

## Consequences

- Full regression: **15441 pass / 0 fail**, `status: passed`,
  `unchanged: true`. First run after the discipline was lifted: 15433 / 10.
- The dedicated tp4 lock now reports 18/18 on each standalone invocation and
  inside the full run; the v2155 lock reports 50/0 standalone.
- A clean clone no longer fails with ENOENT in the v2.155.0 section;
  `git ls-files tools/` now contains `tools/test-audit.js`.
- `.gitignore` records why the form rule needed a reference check, so the next
  form-based exclusion is expected to be reviewed the same way.
- The reusable lesson for the discipline window: **an expectation that no
  reading supervises ages by itself**, and within a discipline window almost
  every aged expectation ages the same way — a historical snapshot written into
  an assertion. This is the same family as R140's round; the difference is that
  the collection round now also looks for *duplicate* sources of one criterion
  and for defects in the checkout face, neither of which any gate reads.

## Follow-up found by re-running on a fresh baseline (same round)

Tracking `tools/test-audit.js` was correct, but it changed a *reading* that a
gate compares: the tracked tool count went 15 -> 16 while the roster sentence in
`README.md` still said 15, so `tests/toolchain-gate-v2136.js` reports
**FAIL 8 / 43** on the new baseline. It was fixed in the same round (README
roster 15 -> 16 plus the `test-audit` entry, `ITERATION_LOG.md` tools row
aligned, gate back to 43/43).

Why the full run did not catch it: `tests/isolated-runner.js` builds its work
tree by `git archive HEAD`, then `git init` + `git add -A` + commit — that
creates a **baseline index** — and only then overlays candidate files. Gates that
read `git ls-files` therefore measure the *baseline*, not the candidate. The
run that reported 15441 / 0 had the old baseline (15 tools, roster 15), so it
was green. The inconsistency only became visible when a tree whose baseline
already contained the new index was exercised. Consequence to keep: **an index
reading is not covered by a full regression run; the roster must be updated in
the same edit that changes the index.** The `.gitignore` comment gained the
matching note, and the roster line now carries the version that changed it.

## Same-series notes

The audit performed while writing this note (searching proposed + implemented
by keyword) found three neighbours. `2026-10-06-worldaxis-tp7-capacity-future-
schema.md` is this version's delivery note; its "not covered" section has been
corrected in the same commit, because it still said the full regression had not
been run. `2026-10-05-offline-return-page-entry-clock-domain.md` and
`2026-10-04-offline-farfield-audit-integrity.md` describe unrelated features and
are untouched. The two `proposed` architecture notes remain proposed. The
discipline-window lesson overlaps deliberately with the R140 log entry (v2.155.0
collection round, 14687 / 36 → 14724 / 0) rather than superseding it: that round
established "re-derive the expectation instead of copying the snapshot", and
this round adds "and check that the criterion has only one home, and that the
checkout face actually contains what the suite reads".

## Not covered

- Real-host verification of the shipped features is unchanged by this round.
- The UI layer is still not loaded in the headless regression.
- One process defect was hit while producing this very round and is recorded
  rather than hidden: the first post-fix run was started **before** the last
  tree edits (`.gitignore`), so its assertions (15441 / 0) were valid but its
  `unchanged` flag went false and its `status` degraded to
  `assertion-failed`. The confirming run is the one whose result is reported
  here. The rule it re-establishes: with a snapshot-based runner, the tree must
  be frozen from the moment the run starts — the assertion count is not the only
  thing the runner reports.
