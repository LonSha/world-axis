# Agent Note: OPV8-4 驱动台账的两处假阴性，与「注入链不算驱动」这条界线

Status: implemented

## Problem

V8 的 OPV8-4 要求「34 台 L3 逐台下裁决」。按真机口径复现后，本版残留的 L3 是 10 台：
L3a〔dream、floorSnapshot、gauge、injectCollector〕、L3b〔antiOmniscience、moodGlide、
oneShotMod、outputGuard、personaAnchor、survival〕。

逐台 grep 后事实是：**这十台每一台都有产品内真实消费者**。所以问题不在「功能悬空」，
而在驱动台账自己算错了两处，把「有人在喂」写成了「没人喂」：

1. `core/interceptor.js` 用 `window.worldAxisGenerateInterceptor = async function` 把入口
   交给 SillyTavern。它没有 `buildBlock`（不进盘点表），`WA.interceptor` 也不是三条自证面
   之一。`reachSet()` 只从「定义了 `WA.x = {` 且属于自证面」的文件扩散，于是这个文件发出的
   全部调用边被丢弃 —— 轮边界（before/after 链、输出净化、MESSAGE_DELETED）每轮都在调
   antiOmniscience / moodGlide / oneShotMod / outputGuard / personaAnchor 五台，账本却写
   「谁都不碰」。
2. `WA.actionDesk` 是 L2r 路由表的**本体**。`routesFace()` 从 `WA.actionDesk.ROUTES` 的
   键名算出「哪些引擎被路由登记」，但本体自己没有 `buildBlock`、不进盘点表，于是
   `engines/action-desk.js:855` 对 `survival.statusOf(w)` 的真实调用也被丢掉 —— 而那是每次
   动作可行性判定都会走的路径（`vital-exhaustion-blocked` 拦截）。

同一时期还发现第三个假读数，不是分层错，是**措辞错**：`summaryText()` 与 `hintOf()` 说
「这 N 个机制开关开着也不会出内容」。实测不成立：`render/inject.js` 里有 103 个
`WA.<ns>.buildBlock(` 分支，覆盖盘点面 112 台里的 103 台（92%），L3a 那四台全在里面、
每轮都被调；`dream` 启用后立即产出 24 字节固定块。

## Decision

**修两处播种，不动目录过滤。**

- `buildGraph` 增认「宿主钩子入口」形状：`window.<name> = function`（含 `async function`）。
  这类文件的调用边是**外部真在调**，一级记为可达（`out[ns] = 'entry'`）。
- `reachSet` 另把 `actionDesk` 本体加入起点集合（它给出 L2r 的路由表，本体必须算面）。
- L2e 判据同时认 `'call'` 与 `'entry'`。入口边的驱动者名字取入口文件自己的命名空间
  （`interceptor.applyInjections`），满足「必须点出是谁在喂」的形态约束。
- 新增可观测读数 `scan.reachEntry` / `scan.reachEntryList`：不给这个数，修完只能看到 L2e
  涨了几台，说不出涨的是哪一类驱动。

修后实测：L2e 2→8、L3b 6→0、L3a 4→4，`reachSize` 181→229、`reachEntry`=22，112 台合计守恒。

**修措辞，不修判据。** `hintOf` 的 L3a 与 `summaryText` 改成如实说法：这四台「仍会被注入链
每轮消费（有分支、有产出），缺的是**驱动登记入口**」；L3b 才是「连注入链都不消费、诊断面也
不念它，开关开着确实不会出内容」。两种病因必须分开念 —— 压成一句就把相反的病因混成一个数。

## Alternatives rejected

- **让 `render/inject.js` 参与扩散**（最直觉的「放开一步」）。实测会新增一批可达、
  L3 整档归零。那正是 `tests/v7-driver-ledger-2275.js` 的 N3 负控专门挡的「洗白」形态：
  注入链覆盖率 92%，是没有区分度的面 —— 它只说得出「注入链会读它」，说不出「有没有人喂」。
  一旦记进来，这一栏再也不能回答它唯一要回答的问题。
- **给这四台补一个「注入链消费」的新档位（比如 L2i）**。同样的问题：92% 覆盖率的档位会把
  112 台里的 103 台卷进来，分层失去分辨力，而且新增档位要同步改面板、诊断、导出四处读数。
- **把 `survival` 直接接进 before/after 链**（EXV8-2 的接活思路）。那是「改产品去迁就台账」。
  它在动作判定里的调用本来就是正确用法，缺的是账本认不认这条路。
- **为十台写一份静态处置清单就收工**。计划 OPV8-4 明确要求「不再靠 `L3_EXCLUDES` 静态名单
  静默排除」；而且假阴性不修，下次再有引擎被轮边界调用还是会被写成孤儿。

## Consequences

- 好消息：`driverLedger` 现在认两类「本体不在盘点表里的驱动面」（宿主钩子入口、路由表本体）。
  这两类正是历史上所有假阴性的来源。
- 边界：注入链依然不算驱动面。L3a 的表达是「有消费、缺驱动入口」，不是「没有消费」。
  这条界线由 `tests/v8-driver-l3-2294.js` 的 P3（四台必须仍在 L3a 且 hint 说清）与
  P6/N3（放开扩散必须把 L3 洗成 0）双向钉住。
- 连带代价：`tests/v7-driver-ledger-2275.js` 的 `reachScope`、`l2eGate`、`blindCount`
  三个破坏锚点必须跟着源码走；其中 N6 的被截断样本从 L3b（已归零）换成 L3a，并把上限压到 2。
  **没有**为了让锁变绿往 L3b 塞假引擎 —— 那是拿锁给假读数背书。
- 已知未清：`tests/capability-tier-v2257.js`（76/13）与 `tests/v7-cap-tier-2283.js`（C5/C12）
  的红在本次改动**之前**就存在（`git stash` 掉本轮改动后同样红），属既有 MECH 计数漂移，
  不在本轮修复范围。
