# Agent Note: 写权面的扫描面被它自己锁死了（R285 WRA-1）
Status: implemented

## 立项时的读数与它的问题

`engines/field-writers.js` 从 v2.300.0 起声明 5 个多写者字段（worldFacts / people /
evolution / customLax / economy），锁是 `tests/v11-field-writers.js` 的 W2「声明 vs 现场静态扫描
双向对账」。看起来已经齐了。

真实现场：骨架顶层键 **239** 个，其中写者 >= 2 个的 **27** 个，含「吃掉现值」整块赋值站点的
**9** 个 —— 表里只有 5 个，缺口 4 个（chronicle / currents / echoes / worldPulse /
nextTurnInjection 里有 5 个，其中几个当时根本没被读到；见下节第二层，第一版算成 11 个是错的）。

为什么一直看不出来：W2 的扫描面**就是 `FIELDS` 数组本身**。表里没有的字段永远不会被扫，
于是「27 个只声明了 5 个」这件事在读数上完全不可见。

## 第二层（比第一层更硬）：那把锁从未跑过

`tests/run.js` 里它是 `await runScript('./v11-field-writers.js')` —— spawn 子进程、rc 即结论。
而这个文件只有 `module.exports = { runAll, runNegative }`，**没有顶层执行**。子进程什么都不跑
就 rc=0。实测：把它改成 `runLock` 后当场报了两条真红（W8a `fields == 5` 实 10；W8b 写者
60 vs 36 —— 后者是把 stat 的全体写者数与五个字段的和比）。

同批同型的另四把：`v11-pending-state`（33 项）/ `v11-inject-dualface`（20）/ `v11-l3-registry`
（22）真跑全绿，已改成 runLock；`v11-push-api-registry` 真跑报 A1 红（现场 42 vs 表 40：
`arcGuideBridge.advance` 与 `panelFacesPage.refresh` 两条零调用未登记）—— 本轮不修，
记入 `docs/PROJECT_ASSESSMENT.md` R7。

## 判据的最终口径（可复算）

「吃掉型」= 整块赋值站点，且：

1. 右值**不引用本字段当前值**（`d.X = (d.X && ...) ? d.X : ...` 不算）
2. 且不是建行守卫（同行或紧邻上一行有 `if (!d.X)` / `if (d.X === undefined)`）

理由：前两种写法只建行 / 只归一化；`d.X = {}`、`d.X = { a: [], b: [] }` 才把别人的账整块抄掉。
第一版把三类混在一起数，得出「整块替换 11 个」，与「已声明 5 个」相减得出「缺口 6」——
那个 6 是假的：`world` / `region` / `rumors` / `meta` / `causal` / `production` 的所谓替换站点
其实都带着 `if (!d.X)` 或引用现值。**先用一个错判据算出缺口，再拿缺口当立项依据，是本轮最值得
记下的错误。**

另一处跟位：COVERAGE 原写 `topKeys: 209`（取自 `tests/field-liveness-ledger.json` 的
`schemaTopKeys`），而 `Object.keys(store.get())` 现场是 239 —— 账本落后 30 个键，全是 EXV29
批新建的状态键。锁改用现场真源（记入 R8）。

## 交付面

- `engines/field-writers.js`：5 个新字段（chronicle 11 / currents 5 / echoes 4 / worldPulse 2 /
  nextTurnInjection 2）+ 1 个（schemaVersion 2），共 **11**；新增 `COVERAGE` 冻结读数
  （239 / 27 / 9 / 11 / 16 / 48）并从 `view()` 透出。四条 declared 冲突的治法都只登记不施工
  （开局构建串行化 / 手动值 TTL / 传送带并发），与 v2.300.0 时 people/evolution 的处理一致。
- `tests/write-authority-v2610.js`（新）：B1–B6 + N0–N3 共 18 项。扫描面是骨架全部
  顶层键，B5 对 11 个字段逐个双向对账；B4c 冻「未声明字段的写者总数 48」，新增写者即红。
- `tests/v11-field-writers.js`：W8a/W8b 去写死 5、N0b 锚点改 whisper-backchannel（intel.js
  在 chronicle/currents 也出现了，锚点不再唯一）、declared 计数 2→7。
- `tests/run.js`：新锁 `runLock` ×2；v11-field-writers 改 `runLock` ×2；三把同型锁一并改。

## Problem
The write-authority table declared 5 fields while the scan surface that checked it was the same
5-element list, so undeclared fields could never be seen; and the lock itself was mounted as a
spawned script while the file only exported runAll, so its assertions had never executed at all.
## Decision
Scan every top-level store key and classify by one reproducible rule: a whole-block assignment
eats other writers' contributions unless its right-hand side reads the field's current value or it
is a build-guard. Nine of 27 multi-writer fields qualify, all eleven declared fields now cover
them, and the 16 deferred fields are frozen by their total writer count (48) so any new writer
turns the lock red. Mount all four exports-only v11 locks with runLock.
## Consequences
The first frozen numbers (27/10/17) were retracted because they counted build-guards as replaces;
the gap they implied was fiction. The real gap was one field (schemaVersion). Three previously
dead-green locks now actually assert, and one of them (v11-push-api-registry) surfaced a genuine
unregistered pair of push APIs that is recorded rather than quietly fixed.
## Alternatives considered
Keep the 5-field table and add coverage numbers to the header only. Rejected: a reading that lists
what it covers and stays silent about the rest is the exact defect this round is about. Also
rejected: making W8a adaptive without a new lock — that would have loosened a gate with nothing
stricter replacing it.
