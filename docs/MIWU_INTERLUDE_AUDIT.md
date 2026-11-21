# 「迷雾之外」勘察结论：缝了什么、为什么不缝

> 起因：用户交来两份同类型项目文件 ——
> ① `迷雾之外 · Interlude v4.7.2`（酒馆助手脚本，落盘 13474 行 / 383 个 `mj*` 顶层函数）；
> ② `迷雾之外 × 恋爱博弈论 概念读本 v2.2`（`tavo_spec: lorebook`，10 条常驻条目）。
> 问题原话是「这两个和我们是同类型的，或许有可以缝的」。
> 本文是回答：**按「判据是否已被覆盖 / 是否有更优实现 / 是否缺能力」三条裁决**，逐条给结论，
> 并写明已经落地的那一条。所有结论都有现场命令可复算。

## 一、结论先行

**结构上九成重叠，而且本仓在数值纪律上更严。** 值得缝的不是它的数值体系，是**两条措词口径**
（冷落分级、追人上限）—— 而这两条正好补上本仓一处「判据在、落点不在」的洞，已在 v2.548.0 落地：

```
followupGate.due 增 level（light / medium / heavy，mediumAt / heavyAt 可配）
followupGate.due 增 chaseCap 判据（追满即拒，默认 4 —— 对应原文「冷战最多四五轮」）
spotlight.buildBlock 真调 resolveIntervention，把 level 译成三种措词写进注入块
spotlight.buildBlock 在真要提的那一刻 fire（幂等）—— fire 的第一个产品消费者
```

## 二、逐条裁决

| # | 它的实现 | 本仓现状 | 裁决 |
|---|---|---|---|
| 1 | `mjSimilarText` / `mjPlanDup`（二字片段 Dice ≥0.52/0.6 + LCS ≥0.65 判重） | `refine.merge` 只在**规范化后完全相同**时合并 | **缝了「只报不并」那一半**（v2.549.0，落 prefilter-gate 的丢弃分支） |
| 2 | `mjClip`（写世界书专用截断：绝不出现省略号，退到最近句末，否则硬切补句号） | 无世界书写入面；注入侧有更优折叠 | **缝了「句末回退」那一半**（v2.549.0，落 inject-budget 字符级折叠） |
| 3 | `mjCaptureSnapshot` / `mjMaybeRollbackSnapshots`（删楼/回退自动退快照） | `floorChanges` + `floorSettle` 已在删楼/编辑事件上退回结算 | **不缝（已覆盖）** |
| 4 | 四轴（吸/信/舒/张）× 五阶 + 边际递减 + 单轮上限 + 升阶冷却 | `fondness`（步进白名单 / 上限 / 段顶授权）+ `marginal`（衰减 + 冷却） | **不缝（已覆盖且更严）** |
| 5 | `mjParsePlanTime`（明天上午 / 下周三 → 绝对日 + 时段） | 计划是**时长制**（`remainingMinutes`），不是日历制 | **不缝（模型不同构）** |
| 6 | 冷落分轻/中/重 + 「有正当理由的忽视不算冷落」 | `followupGate` 只有**一条**静默阈值；久断联与刚见过得到同一句 | **缝①②（已落地）** |
| 7 | 「冷战最多四五轮」 | `count` 一直在记，**没有任何一处拿它当判据** | **缝（已落地）** |

## 三、为什么相似度并条不能缝

`engines/refine.js` 的边界 3 写得很硬：

> 合并只在**规范化后完全相同**时发生（不相似度匹配）：相似匹配会把两条不同的设定判成一条，
> 代价是永久丢一条。

而「迷雾之外」的 `mjSimilarText` 是 Dice + LCS 阈值并条。这不是「它差一点」，是**代价方向相反**：
它把「两条像」当作「一条」的证据；本仓把「两条像」当作「必须留两条」的理由（丢一条不可撤销）。
真要借鉴，只能另开一路**只报不并**的 `near-dup` 读数 —— 但那需要一个新的消费点，属于广度，不是本轮该做的。

## 四、为什么世界书截断不缝

两条硬理由：

1. **没有写入面**：`grep -rnE 'setWorldInfo|updateWorldInfo|createWorldInfoEntry' engines core render ui index.js` ⇒ 0。
   本仓注入走 `setExtensionPrompt` 槽位、**不写 chat、不写世界书**。`mjClip` 服务的那条路径在本仓不存在。
2. **注入侧的截断已经更强**：`engines/inject-budget.js` 的折叠是「整行级 + 保留尾部约束句 + 二分找切点 +
   显式折叠标记」，比 `mjClip` 的「退到句末」严格得多。搬它进来是把强判据换成弱判据。

## 五、为什么快照回退不缝

`core/interceptor.js` 在 `MESSAGE_DELETED` / `MESSAGE_EDITED` 上已经挂着 `floorChanges` 与
`floorSettle.onFloorEvent`（全仓 `floorSettle` 命中 26 处）：删**最后一楼** ⇒ 自闭环退回该楼结算；
删中间楼 ⇒ 只出范围。原文的 `mjMaybeRollbackSnapshots` 是「快照栈 + 回退到最近一份」，
本仓是「**按楼层记账后退回结算**」—— 后者不需要整份快照，也不会因为快照过期而回退到错的现场。

## 六、缝进来的那一条，边界写清楚

- `level` 是**读数**，不是按钮：它不推进关系、不改 `bonds`、不扣好感，只回答「这一句该多热」。
- `heavy` 不是「关系断了」：它只让本轮的提示从「顺口提一句」变成「这一轮别让他主动开口，等玩家去找」。
- `chase-cap` 拒的是**引擎主动追**，不是玩家来找；玩家开口时轻提链路不经过这道闸。
- `fire` 落在**注入构建侧**且幂等（同日同人只记一次），所以「一次生成里构建两次」不会多吃日额度。
- 本版**不注销任何命名空间**，但更正一笔账：v2.545.0 以「followupGate 已真接产品读点」为由注销该条时，
  那个读点（`spotlight.resolveIntervention`）全仓只有测试在调；本版把 `buildBlock` 接上它，
  注销理由到今天才成立（详见 `tests/ns-consumer-ledger.json` 的 `_note`）。

## 七、复算命令

```bash
# 它的函数面（先落盘 content 再数）
grep -cE '^function mj|^async function mj' /tmp/mj.js          # ⇒ 383

# 本仓有没有世界书写入面
grep -rnE 'setWorldInfo|updateWorldInfo|createWorldInfoEntry' --include=*.js engines core render ui index.js | wc -l   # ⇒ 0

# refine 是否有产品消费者
grep -rn 'WA\.refine' --include=*.js engines core render ui index.js actors direction | grep -v 'engines/refine.js' | wc -l  # ⇒ 0

# 删楼回退是否已接
grep -rn 'floorSettle' --include=*.js core engines render | wc -l    # ⇒ 26

# 本版专锁
node tests/narrative-depth-wire-v2548.js    # ⇒ pass (14)
node tests/narrative-depth-wire-v2549.js    # ⇒ pass (10)
```

## 八、v2.549.0：两条候选的「改造后缝法」

第三、四节的「不缝」针对的是**原样搬**。改造后各缝一半，且都落在现有函数上（零新增导出）：

| 候选 | 缝法 | 落点 | 边界 |
|---|---|---|---|
| `mjSimilarText` | 只报不并：丢弃项带 `near`（二字片段 Dice 分） | `prefilter-gate.resolveName` 的丢弃分支 | 不进 `characters`、不改 `ROSTER`、低于阈值不报 |
| `mjClip` | 句末回退 + 没有句末就补句号 | `inject-budget.trim` 的字符级折叠（`foldHead`） | 不动结构化块（整行整舍）；补句号不破预算 |

为什么只缝这一半：

- 并条仍然不能缝（丢一条不可撤销）；但「丢弃时告诉我疑似拼错」不付任何不可逆代价，反而把一条**静默失败**
  变成可查的读数（名字差一字 ⇒ 整轮被念略是最难查的一类故障）。
- 世界书写入面仍然不存在；但「不留半句」这条口径对**任何截断**都成立，而本仓的注入折叠正好是截断。

负控三条全部见红后还原：折叠退回旧四者取靠后 ⇒ A1 报「甲去城东，乙去城西，」；
删 `d.near` ⇒ B1 报丢弃项只剩 name/why；`nearNames` 去掉阈值 ⇒ B2 报「隔壁老张」也被报成 near（score 0）。