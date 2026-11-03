# Agent Note: EXV7-6 地点沉积跨地点台账

Status: implemented
## Problem
`engines/sediment.js` 自 v2.149.0 起提供 `settle(placeId, fact)`（按地点入账一条沉积，痕迹档由调用方显式给出 `minor` / `marked` / `scar`）与 `feel(placeId)`（答**单个地点**此刻留下什么，含按 `traceWindowMs` 现算的衰减）。但没有任何跨地点的读口：`stat()` 只给「几处地点 / 几条痕迹 / 几条已淡成传说」三个标量，答不出「**哪几处**地方还留着事、各自当前最强是什么档、有几条已经淡成传说」。任何想问这个问题的消费方（面板、诊断、导出）都只能自己遍历 `store` 的 `sediment.rows` 再逐个调 `feel` —— 那是每个消费方各自重算一遍聚合，正是本仓反复治理的「两处各说一遍」。若为此另建一张聚合表，就会给 `rows` 造一个会漂移的副本。
## Decision
在 `sediment` 上新增 `placesView(opts)`，作为跨地点沉积的**唯一聚合读口**，并把两条消费方接到它上面：
- **数据源单一**：只读 `state().sediment.rows`，投影出每处地点的 `count / alive / legends / peak / peakLabel / freshest / lastAt / traces`，以及全局 `total / aliveCount / legendCount / peakCount`。不新建容器、不复制 rows、不引入第二张表。
- **衰减现算**：每行的 `now` 与 `peak` 都走既有的 `decayedTrace(e.trace, e.at, now, cfg.traceWindowMs)`，与 `feel` 同一条函数。**不写回任何字段** —— 把衰减写成落盘字段就等于让「现在什么档」出现两份真源（读到的与算出来的会漂移），这是 v2.149.0 已立的边界。
- **不自造地点**：台账的行只来自 `rows` 里**真沉积过**的地名。`world.places` 里登记了但从未 `settle` 过的地点不进表 ——「这里什么都没发生」是 sediment 能答的事实，「这里是一处空地点」要读 `world` 的登记面，本模块不跨界读。
- **有界**：`maxPlaces` 默认 12、硬上限 48（与 `capPlaces` 同量级），`maxRows` 作为别名；回带 `total / cap / truncated / dropped`，截断如实报，不静默 slice。
- **稳定排序**：先按「最近一条痕迹的时刻」降序，同刻按地名 `localeCompare` 升序 —— 同输入同输出，面板与诊断看到的顺序不随调用顺序变化。
- **关闭态如实拒收**：`getSettings().enabled === false` 时返回 `{ ok:false, reason:'disabled' }`，不是空表。空表与「模块关着」在消费方必须能分开（沿用本模块既有口径）。
- **计数留痕**：`stat.placesReads` 递增。零计数 = 调用没发生，这条让「面板按钮点了没反应」与「点了但结果为空」在台账上可分。
产品消费沿用既有链路：诊断 `secSediment()` 新增 `accountsView` 段（含 `placesNote` 人话摘要，并对 `placesView 缺席 / 拒收 / 抛错` 三种局面各有显式分支，不回落成空台账）；面板沉积页新增「地点沉积台账」按钮 `wa-sed-places`，渲染 + 绑定 + `UI_BINDINGS` 登记三件齐做。与既有「台账读数」（`wa-sed-stat`）**分成两枚**不合并：那个答「一共多少」，这个答「分布在哪些地方、各自什么档」—— 合成一枚之后，「总数正常但某地痕迹全淡」在界面上看不出来。
## Alternatives considered
- **新建 `WA.sediment.placeLedger()` 并自持一张聚合表** — 数据源仍是 `rows`，自持一张表等于给它一个会漂移的副本，且要多一条缓存失效契约。`placesView` 每次现算，代价是 O(rows×events)，而三者都被 cap 限死（24 地点 × 48 事件），实测面板点击在毫秒级，因此不采用。
- **让面板自己遍历 `rows` 调 `feel`** — 那正是本读口要治的病：每个消费方各写一遍聚合，改了衰减口径忘掉一处就漂移，诊断与面板必然分叉，因此不采用。
- **把衰减结果写回 `events[*].trace`** — 写回即第二真源，且会让「历史原档」被一次次读操作改写；读操作改存档是本仓明令禁止的一类副作用，因此不采用。
- **给 `world.places` 里每个地点都产一行（含零痕迹的）** — 那会把「这里什么都没发生」与「这里是一处空白地点」压成同一行；前者是 sediment 能答的事实，后者要 world 的登记面，本口不跨模块读，因此不采用。
## Consequences
- **收益**：「世界哪些地方留着事」从「逐地点循环 feel」变成一次调用，面板 / 诊断 / 导出同源；痕迹档位分布（`peakCount`）与传说档总量（`legendCount`）第一次可直接读，不需要消费方自己数；衰减口径只有一处（`decayedTrace`），台账与单地点读数不可能漂移。
- **代价与已知上限**：本口只报**当前**档位与条数，不透出 `events[*].persons / factions`（要「这条痕迹谁参与」时须从 `feel` 或直接读 rows）；台账按时间排序而非「按严重程度」，因为一处 `scar` 与三处 `marked` 谁更该被先看取决于用途，本口不做价值判断；三级痕迹档位语义是封闭集合，不随参数变化（v2.149.0 已立）。

## Verification
专锁 `tests/v7-place-sediment-2290.js`，**pass (30)**：
- A0～A6：导出、实现锚点、`decayedTrace` 现算锚点、两条消费方锚点、`UI_BINDINGS` 登记。
- B1～B8：聚合正确性（条数 / 可辨数 / peak / 稳定排序 / 档位分布）、**不自造地点**。
- B9～B11：**冻结时钟**下现算衰减（`scar→marked`、`minor→legend`）、存档原档不被改写。
- C1～C5：零写盘、`placesReads` 计数留痕、`maxPlaces` / `maxRows` 截断与 `dropped`、关闭态如实拒收。
- N0～N6：真源码破坏两向自证 —— 聚合体置零则台账读数当场现形（N0/N1）、负控制不改动真源码（N2）、原版在同一判据上仍真（N3）、摘掉导出则 API 真消失且诊断面有显式缺席分支（N4～N6）。

**未执行完整 `node tests/run.js`**：V7 纪律 12 在效期（EXV7-1～9 全部交付前禁止全量回归）。本轮验证为定向门禁集合，清单见 `ITERATION_LOG.md` 的 R232「验收与边界」。
