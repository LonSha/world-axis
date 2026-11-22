# Agent Note: A zero-dependency CDP driver for the UI live channel

Status: implemented

## Problem

The UI live channel (`tests/ui-live.js`) has existed since v2.137.0 and is the
only surface in this repository that exercises the real product: a real browser,
real controls, real `localStorage`, real round trip. Its **driver face**,
however, had exactly one family of routes — `playwright-core`, plus two
fallback routes that are the same family of npm packages. On a machine without
those packages, `probe()` reported `tier: fallback` **forever**, and the B-face
runtime criteria and C-face negative controls slept as a block: the criteria
were written, the driver could not be obtained. The repository is
zero-dependency by contract (no `package.json`, no `node_modules`, Node built-ins
only), so "just install Playwright" is not an available answer.

The contradiction that made this worth fixing: the **same machine** already ran
the L4 layer (`tests/browser/browser-runner.mjs`) against a system Chromium with
no npm package at all. One fact had two books — the L4 layer proved the npm
dependency was unnecessary, while the live channel claimed it was mandatory.

Three defects had to be found and fixed before the new driver could work. All
three were measured, and all three wore the same disguise: **a driver fault
presenting itself as a product fault.**

1. **The route object had no `fulfill` method.** The interception callback's
   first line called `routeObj.fulfill()`, which threw `TypeError`; the `catch`
   around it swallowed the throw and answered `Fetch.failRequest` instead. The
   symptom was a main-document navigation failing with `net::ERR_FAILED`, which
   reads as "the product failed to load" rather than "the driver answered wrong".

2. **`goto` did not recognise `about:blank`.** The browser starts on
   `about:blank`, whose `readyState` is *already* `complete`, so the readiness
   poll matched on its first iteration and `goto` returned before navigation had
   happened. The whole run executed inside the blank page, and
   `location.origin` read as `""`.

3. **Modal dialogs were never answered.** A product panel control calls
   `window.prompt()` (measured prompt text: `设定世界时间（如「三日目·黄昏」）：`).
   Playwright dismisses dialogs automatically; bare CDP does not. The renderer's
   main thread froze permanently and every `Runtime.evaluate` with
   `awaitPromise` never settled.

## Decision

**Add a fourth route: `builtin-cdp@node-websocket`, driving CDP over the
WebSocket implementation Node already ships.** No new dependency is introduced,
and the route is enumerable alongside the three npm routes so the downgrade
reason stays a list of attempts rather than a boolean.

**Both drivers share one skeleton.** `runLive()` owns the load-and-observe
sequence and takes five callbacks in `ctx` (`route` / `onPageError` /
`onConsole` / `onDialog` / `afterGoto`). Only the transport lives in
`drivePlaywright` / `driveBuiltin`. The alternative — two independent
implementations — guarantees drift, and the consequence of that drift is the
worst possible one here: the same reading rendering as two different verdicts
depending on which driver produced it. `CdpPage` is therefore built to be
shape-compatible with Playwright's page object (`on` / `route` / `goto` /
`evaluate`) rather than merely "sufficient for today's spec".

**Driver faults must have an exit, and it must not be the product's name.** The
first defect above was invisible precisely because the driver swallowed its own
error and then reported a *product-level* symptom. `out.fulfillErrors` counts
requests that were paused but never answered, `out.routeErrors` counts throwing
route callbacks, and both are routed into `out.errors` (`内置驱动应答失败`), so
"the driver answered wrong" and "the product did not load" can no longer be
read as the same thing.

**The route object carries its own four methods and an intent marker.** `Cdp`
builds each route with `request` / `fulfill` / `continue` / `abort` plus a
`__waAction` field recording the intended answer, so the interception callback
never depends on a method existing implicitly.

**`goto` requires the document to have actually changed.** The readiness poll
now checks that `location.href` has moved off `about:blank` in addition to
`readyState`, and `Page.navigate`'s `errorText` is read and surfaced rather than
ignored. A blank page is not a loaded page.

**Dialogs are answered, not tolerated.** `Page.javascriptDialogOpening` is
subscribed and every dialog is answered
`Page.handleJavaScriptDialog({accept: false})`. Dismissing without accepting is
the safe default: the live channel is verifying that controls are present and
wired, not that a human's answer is applied.

**The browser search face must not depend on `HOME`.** The cache-scan route
derives its root from `os.homedir()`, but the isolated regression
(`isolated-runner`'s clean environment) redirects `HOME` to a task directory, so
a machine with a perfectly good browser was still judged "browser not present".
`SYSTEM_BROWSER_PATHS` adds the system-level standard locations
(`/usr/bin/google-chrome-stable`, `/snap/bin/chromium`, …) and is reported with
`how: 'system:'`. Only this addition makes the isolated environment able to
reach the `full` tier at all.

## Alternatives considered

**Bundle a Chromium download or vendor a CDP client.** Rejected without
measurement: the repository's zero-dependency contract is the whole reason the
L4 layer exists in its present form, and vendoring a client would add a third
copy of the same transport while leaving the npm routes in place.

**Make the npm routes work by installing packages only for the test run.** That
turns a repository contract into a per-machine ritual, and the failure mode is
exactly the one being fixed: the criteria silently sleep on any machine where
the ritual was not performed.

**Fix the three driver defects without adding the fourth route.** Then the
defects remain latent on every machine except the ones that happen to have
Playwright, and the channel stays asleep where it matters most — in the
isolated regression, which is also the environment whose readings are trusted
for the version gate.

**Report the downgrade as "browser not found" without listing attempts.**
Indistinguishable from "looked in the wrong place". The reason now carries the
number of paths tried and the last few of them, so a downgrade is self-
certifying rather than a claim.

**Pin the expected reading to the measured 187 loaded files.** Deliberately not
done: this repository has already been bitten by the "stale exact reading"
family, where a product change turns a correct product into a failing test. The
criterion asserts `loaded > 100`, non-empty readings, and a successful round
trip — the *shape* of success, not last week's number.

## Consequences

- `probe()` reaches `tier=full` on this machine with
  `driver=builtin-cdp@node-websocket` and `why=实机通道可用（cache-scan:chromium_headless_shell-1148）`.
- The live channel's measured reading is
  `files=187 loaded=187 pages=17 controls=915 readings=89 thrown=0 rej=0 pageErr=0 fillErr=0 dlg=1 roundtrip=ok origin="http://walive.test" failedLoad=0 errors=[] dialogTypes=["prompt"]`.
  The `dlg=1` is not noise: it is the `window.prompt()` that used to freeze the
  run, now answered.
- The isolated environment still downgrades honestly, and now says why in full:
  `tier=fallback why=驱动在位（builtin-cdp）但找不到浏览器可执行文件（试过 7 条路径，末 4 条：/usr/bin/google-chrome-stable / /usr/lib/chromium/chromium / /opt/google/chrome/chrome / /snap/bin/chromium）⇒ 落到测试面静态判据`.
- The dedicated lock `tests/ui-live-v2137.js` reports **54 / 0** on this machine
  in the `full` tier, where it previously never left the fallback branch.
- Version `v2.163.0` lands a twelve-criterion section in `tests/run.js`
  covering the enumeration, the shared skeleton, all three measured lessons,
  the driver-fault exit, the `HOME`-independent search face, the self-certifying
  downgrade reason, and one real spawn probe that asserts the driver-fault
  counters are zero and that the `full` tier's readings are non-empty.
- One self-inflicted purity violation was caught and fixed during this version:
  a *comment* containing the literal `fetch("/x.js")` was matched by the A3
  purity criterion. The criterion cannot tell code from prose, so the comment
  was reworded; `badAbs=0`. This is the second time in this repository that a
  criterion has fired on its own documentation, and the fix belongs to the
  author, not the criterion.

## Same-series notes

The audit performed while writing this note (searching proposed + implemented
by module and keyword) found four neighbouring records, none absorbed by this
one: `2026-10-06-worldaxis-tp7-capacity-future-schema.md` (TP7 capacity and
migration — a product-side change, no overlap with a test-driver change),
`2026-10-06-worldaxis-collection-round-debt-and-tree-integrity.md` (the
collection round that removed the three historical-debt families and produced
the 15441 / 0 baseline this version is compared against),
`2026-10-05-offline-return-page-entry-clock-domain.md` (TP3 page-entry and clock
domain), and `2026-10-04-offline-farfield-audit-integrity.md` (offline
settlement integrity). The two `proposed` architecture notes remain proposed and
are not superseded.

## Not covered

- The npm routes were not re-verified on a machine that has those packages;
  this version only proves the built-in route works, and the enumeration tier
  ordering still prefers the npm routes when they are present.
- `drivePlaywright` and `driveBuiltin` share the skeleton but only the built-in
  route is exercised end to end here, so "the two readings are byte-comparable"
  is a structural claim (one skeleton, one `afterGoto`) and not a measurement of
  two live runs side by side.
- The L4 layer (`tests/browser/`) was still untracked in `git status` when this
  note was first written; the repository owner has since ruled it in and the six
  files are now committed, unmodified. Before committing, the v2.120.0 criterion
  ("only tools referenced by executable code are committed") was re-checked
  against liveness rather than against the file list: both scenarios were run on
  a real Chromium 131 from the local Playwright cache and passed 19 / 0 each
  (38 readings total, `served=188 / 187` real file requests). It mattered
  because the collection round had just had to fix a case where a file needed by
  the regression was excluded from the tree by a `.gitignore` pattern, which
  makes "the file exists on my disk" a weaker statement than it looks.
- Real-device behaviour is untouched by this version: the live channel runs a
  headless browser against a local test origin, not on a phone.
