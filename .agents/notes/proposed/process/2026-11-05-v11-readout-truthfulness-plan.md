# Agent Note: V11 纲领立项 —— 从「机制通不通」转向「读数说不说实话」

Status: proposed（2026-11-05 立项；只读侦察轮，未改产品实现）

## Problem

V10（OPV10-1～9 + EXV10-1～9）在 `v2.296.0` 交付了 18/18 机制闭环：六路引擎（diplomacy / karma / events / elsewhere / economy / offlineTick）接进 `render/inject.js` 的 `SOURCES`，`core/unified-pending.js` 聚合 12+ 模块未决事项，`inject-budget.compactSummary` 提供单行降档，`faction-graph.simulateDynamics` 推演多势力博弈，端到端矩阵 18/18 PASS。

但 V11 立项轮的现场实测证明：**"接上了"与"读数可信"是两件事**，而后者从未被验收过。六条硬读数摆在同一张表上：

1. **空世界 `buildWorldSnapshot()` 返回长度 0**。`applyInjections` 里 `if (snap) items.push(...)`，于是世界状态块在空世界一条都不产生。这与 OPV7-7 当年判定的 `no-data` / `fault` 同形问题是同一族，只是发生在快照层——**读面无法分辨"世界还没开局"和"快照构建挂了"**。
2. **主路径 items=0，宿主槽位实收 573 字符 / 4 源**。用宿主桩跑 `applyInjections({ injections: [] })`，回调入参仍是空数组，而 `setExtensionPrompt` 真收到 573 字。**注入的真实产出面与 `lastInjection.sources` 记录面不是同一个东西**——所有读 `items.length` 的下游判断（预算裁决、覆盖率、诊断）都在读空集。
3. **35 台 L3 只驱动 7 台**。`capabilityTier.L3_EXCLUDES` 35 台，`roundDrivers.DRIVERS` 7 台，差集 28 台既不入名单、也无逐台"为什么不入"的书面理由。V7 OPV7-8 只做到"从 full 档移除 + 标注需手动录数"，没做到逐台定性。
4. **49 个推进类 API 产品侧零调用**。`events.due` / `events.fulfillDue` / `world.advance` / `farfield.tick` / `vitals.tick` / `hazard.tick` / `gauge.step` / `checkpoints.tick` 等，按 tick/advance/sweep/due/settle 前缀枚举后在 `tests/` `tools/` 之外零命中。它们保留着"看起来能推进"的 API 面。
5. **`unifiedPending.collect()` 空世界 total=0 / highCount=0 / items=0**。三件事同形：世界真没事可做 / 聚合器没接上模块 / 接了模块但全报错。
6. **5 个 store 字段各有 ≥3 个引擎写**（`worldFacts` 5、`people` 5、`evolution` 5、`customLax` 3、`economy` 3），但没有任何地方声明"谁负责、其他人是追加还是覆盖"。V10 EXV10-8 的 `simulateDynamics` 读写 `evolution.factions` 正属于此类。

附带两条口径不洁：`SOURCES` 115 / `buildBlock` 114 / 差集 8，三个数字互相咬不上，靠人肉维持四件齐做；`ui/panel.js` 的 `CATS` 注释写"4 大核心分类 + all"而实为 5，且 `PAGE_CAT` 的 `world` 键与 CATS 的 `world` 同名。

## Decision

把 V11 命题定义为**「通了以后读数说不说实话」**，18 项（OPV11-1～9 + EXV11-1～9）全部以「同一件事在不同读面给出同一个答案」为验收口径，而不是以"又接了一个引擎"为成果。

四条排序与判据纪律：

1. **先锁后改**：OPV11-8 的注入源契约锁（五表交叉断言：`SOURCES` / `vis.X` 分支 / 默认值 / `VIS_NAMES` / `buildBlock` 实存集合）**必须先于** OPV11-1 / OPV11-2 / OPV11-5 落盘。否则"注册表 / 分段 / 默认值 / 显示名 / 白名单"五表漂移会在改动过程中重新长出来，收口时又是一片红。
2. **三态如实优先于功能新增**：OPV11-1（快照三态）、OPV11-7（待办三态）排在功能项之前。理由：任何建立在"同形空读数"之上的新功能，验收时都无法自证——这正是 V7 复盘过的坑。
3. **单一真源 + 派生**：OPV11-3 的 L3 分级表、OPV11-4 的 49 API 裁决表、OPV11-6 的写权声明表都是唯一真源，`DRIVERS`、面板、诊断面一律从表派生，**禁止两处各写一份名单**。
4. **不新造死面**：OPV11-3 的④类（真死面）必须是 dead-export-ledger 里的既有项；OPV11-4 中"真没人要"的 API 不得保留"看起来能推进"的假面。

## Consequences

**正面**：
- 空世界、未开局、模块缺席、报错四种空白各有可分辨的读数，玩家与作者都能一眼看出"为什么这轮世界没内容"（EXV11-2 世界真空诊断看板）。
- 注入面从"两套账"收敛为一套，`lastInjection.sources` 与宿主槽位实收内容可逐字对齐（EXV11-5 注入双面视图）。
- 28 台未驱动 L3 + 49 个零调用 API 全部有书面裁决，从此"悬空"不再是沉默状态，而是登记表里的一行分类。
- 5 个多写者字段有写权声明与冲突检测，`simulateDynamics` 这类新写者不再是无主写入。

**代价与风险**：
- OPV11-2 可能触及 `applyInjections` 的入参契约。若确认"入参仅为调用方预置槽位、产出面以 `lastInjection` 为准"是既有设计意图，则应改**契约文档与诊断面**而非改行为——这会降低该项的"代码工作量"，但不降低其价值（把隐性约定写成显式契约本身就是治理成果）。
- OPV11-3 的四类裁决需要逐台读 28 个引擎的写口签名，是 V11 最重的人工面。若某台无法判定，**如实标 `unclassified` 并登记为待治理**，不得硬塞进某一类。
- OPV11-4 的"接进调度"可能引入新的每轮开销。每台接入前必须核实写口是否零参安全、是否自带 `store.transact`（`backstage` 的 tx.ok 分支后调用纪律）。
- 全部 18 项收口前不跑全量回归，读数漂移仍需靠每版顺手跑 `node tests/export-contract.js` 逐字比对来控制（V7 复盘的欠账教训）。

## Alternatives considered

**A. 继续沿 V10 路线做"再接更多注入源"**：被否。8 台未接 `SOURCES` 的 `buildBlock` 中，2 台（`pmem` / `summarizer`）根本无人消费；且空世界 114 台里只有 4 台有产出——继续加源只会放大"接上了但没内容"的错配，而不会改善读数可信度。V11 把"加源"降级为 OPV11-5 的**裁决**项（该进的进、不该进的白名单 + 理由），而不是默认动作。

**B. 先做玩家可见的拓展九项（面板看板），优化线后置**：被否。EXV11 八项里有五项直接消费 OPV11 的读数（EXV11-2 消费 OPV11-1/7 三态、EXV11-3 消费 OPV11-3 分级表、EXV11-5 消费 OPV11-2 一致性、EXV11-7 消费 OPV11-4 裁决表）。先做面板等于把不可信的读数画成漂亮的图，验收时无法自证。

**C. 一次性重写 `render/inject.js` 把五表合成单一声明式注册表**：被否。`render/inject.js` 已有 1700+ 行与大量逐源注释（每条注释都是过去某次真缺陷的事后记录），重写等于丢掉这些"为什么这样写"的现场证据，且违背"不重构、只治理"的克制原则。V11 选择**加锁不改结构**：五表仍是五处，但由一条门禁强制它们同步增长。

**D. 把 49 个零调用 API 全部接进 `roundDrivers`**：被否。其中大量需要剧情入参（`contest.advanceRound` / `ruling.submit`）或是玩家决策面（`userlock.lock` / `tempo.setGear`），硬塞进轮次循环等于替玩家做剧情判断——这正是 V8 OPV8-4 在 `round-drivers.js` 文件头写死的四条拒绝理由。V11 保留这套拒绝口径，只把"零参安全"的子集接进去，其余进登记表写明入参契约。

## 附：立项硬读数（可复跑）

`node tools/v7probes/p_four_layer.js`（四层可达性：L1 11 / L2p 53 / L2 16 / L3 34～35）、`node tools/v7probes/p_yield_baseline.js`（空世界 4 / 开局 15 / 五轮 15，5 pass 0 fail）、以及逐台 `buildBlock()` 空世界扫描（4/114）、`buildWorldSnapshot()` 长度（0）、`applyInjections` 主路径 items（0）vs 宿主槽位（573 字 / 4 源）、`L3_EXCLUDES`（35）vs `DRIVERS`（7）、推进类 API 零调用者（49）、`unifiedPending.collect()`（0/0/0）、多写者字段（5 个）、`PAGES` 37 / `CATS` 5。全部读数与探针路径已写进 `plans/V11_MASTER_PLAN.md` 第零节表格。