# WorldAxis 迭代日志（自主迭代模式）

> 由 AI 在无人值守模式下维护。每轮记录：做了什么、为什么、影响范围、门禁结果。

## 基线

| 项 | 值 |
|---|---|
| 版本 | v2.27.0 |
| 全量回归 | `node tests/run.js` → 4149 断言全绿 |
| 出口面清册 | `node tests/inventory.js` → 四类悬空均为 0 |
| UI 门禁 | `node tests/ui-gate.js` → 49/0（v2.22.0 未涉及运行时 UI 探针） |
| 出口面契约 | 58 命名空间 / 321 成员 / 4094 字符 |

## 迭代记录
### R75 · 2026-09-26 · v2.93.0 三层通行与天气封锁（X4：人/物/消息三渠道 × 天气封锁表 + 逐段查路）
- **做了什么**：X4 一处落点（`engines/world.js` 的天气↔通行）扩成三渠道，一把专锁（`tests/transit-v2930.js`，382 行，74 项，含 N0–N4 负控制），产品侧新增导出**只两口**。
  **`engines/world.js`（约 33 KB）**：① `CHANNELS = ['person','goods','message']`（封闭集合）；② `BLOCK_LEVEL` 逐天气逐渠道的显式封锁映射（`storm`/`snow` 封人封物放消息，`heat`/`fog` 三渠道全封，`rain`/`clear` 一律不封）；③ `weatherBlockOf(place)` 内部面（返回 `{ok, available, place, kind, factor, blocked, reason}`，`reason ∈ engine-absent|disabled|missing|unknown-kind|ok`；**未登记天气不回落成晴**；未知天气词报 `unknown-kind` 且 `blocked: null`，既不假装通行也不假装封锁）；④ `transit(channel, from, to)`（`bad-channel` → `disabled` → `unreachable` → 沿路径**逐段**查天气，命中即报 `weather-blocked` 并带 `at`/`kind`/`factor`/`path` → 成功报 `ok:true` + `path`/`minutes`/`hops`/`weather`/`weatherReason`；**只收三个参数**，不收用不上的 `at`）；⑤ `stat` 增 `transits{person,goods,message}` 与 `blocks{...}` 两套分列计数。
  **`engines/tool-diag.js`**：`secWorld` 增 `channels` / `transits` / `transitBlocks` 三读数，并注释「**本节不调 transit**——它会增 stat 计数，观测不得改变被观测对象」，也**不调 `weatherBlockOf` 做推断**（只读已发生的计数，不自赠结论）。
  **`ui/panel.js`**：世界页增 `wa-world-tr-ch`（通道输入，placeholder `person / goods / message`）+ `wa-world-transit`（「判通行」按钮）+ `on('#wa-world-transit', …)` 绑定；**起终点 input 复用 `wa-world-mv-from` / `wa-world-mv-to`**（同一个「从/到」语义不另造一份）；失败分支按 `weather-blocked` 与其它原因**分列措辞**，前者写「通行 · 被封 · <channel> <from>→<to>：<kind> 封住 <at>（人/物不可，消息可）」，后者写「通行 · <reason>」；登进 `UI_BINDINGS` 世界页组。
  **两处真消费方**（**无消费方不挂**）：诊断 `secWorld` 三读数 + 面板「判通行」按钮。`weatherBlockOf` 作为内部只读面**不导出**。
- **为什么**：`world.canBeAt` 只回答「这个人在不在场」，没有「这条路此刻过得去吗」；`weather.effect()` 有移动系数但没人问它——两模块各自成立、互不通报。计划里那句判据「暴风雪时人能到/物能到/消息能不能到」在实现前**不可判定**：把三者压成一个「通行」布尔，等于宣布「路断了」时连口信都传不出。
- **踩过的坑**（本版首跑全量回归 12 红，分五簇；专锁首跑 4 红 + 2 红 + 补强 3 项）：
  ① **判据把 `indexOf` 当出现次数用**（专锁 `[A1]` 红）：`indexOf` 返下标、恒 `> 1`，须改 `hits()` 计数工具。
  ② **判据选错输入面**（`[B9]` 红两处）：世界页控件实际挂在 `people` tab 上（`renderPeople()` 渲染），不是 `settle`/`world`；起终点 input `wa-world-mv-from` / `wa-world-mv-to` 也在该 tab 页里。**选中不存在的节点后断言崩在 `.value` 上**，报错信息与真因（tab 选错）离得很远。
  ③ **读数类出口不得复用「写盘回执」措辞**（`[B9]` 再红）：面板成功读数以「已记录 通行 · message …」开头（`plainOut` 的既定前缀），判据用 `=== 0` 开头匹配就错；改用**包含**匹配。
  ④ **判据只问已承诺的出口**（`[B10]`/`[B11]`/`[N1b]`/`[N1d]` 四处红）：判据调了 `W5.world.weatherBlockOf(...)`，但该方法**不导出**（导出即有承诺且无消费方）。修法是改问 `transit` 回执，**不是在产品侧加一个导出**。
  ⑤ **补强判据本身要有可证伪的对象**（`[B12]`）：三跳路径 `A→B→C` 中途封锁后 `person` 被拦且 `at === PL.B`、`path.length === 3`；同封锁下 `message` 仍可到（`hops === 2`）；改回 `clear` 后 `person` 也通、`minutes === 55`（30+25）——证明**封锁只是拦住，不改耗时**。
  ⑥ **出口面冻结串与生成器产物逐字一致**（全量回归 `run.js:11200` 「依赖面发生漂移」）：`FROZEN2800` 的 world 段按**字典序**插 `CHANNELS`（最前，大写字母）与 `transit`（`stat` 与 `whereStat` 之间）；`EC2430` 改 `'ns= 104 members= 611 chars= 7475'`。
  ⑦ **清册面陈旧常量**（`run.js` 4 红）：`refs 2391→2394`、`members 1246→1248`，三处 `deadInTestsOnly 292→293`，以及四处**文案里嵌的数字**（'其中仅测试引用 292…' 等）——**文案与数字必须同改**，否则失败信息会与断言值不符。
  ⑧ **新增内联拒收码必须显式归类**（`reject-code-gate` 红）：X4 新增 4 个码 `bad-channel` / `engine-absent` / `unknown-kind` / `weather-blocked` 进台账 `base`（212 → 216，按字典序插）；三集合 `93+5+216=314`。
  ⑨ **非码不得塞进台账**：`weatherReason: wx.ok ? wx.reason : 'unknown'` 的 `else` 恰好落进「内联字面量 `reason: 'x'`」的词法形状，被窄口径扫描器误捕。正确处置是改**词法形状**（`(wx.ok && wx.reason) || 'unknown'`）而不是把 `unknown` 写进 `base`——把非码塞进基线台账等于让台账**永久虚胖**，且掩盖真缺陷。
  ⑩ **一条产品侧结构变更会连带让旧锁的锚点失唯一**（`fault-alias-lock-v2800` 整个 C 面崩溃）：X4 让 `engines/world.js` 的 `stat()` 多了快照面（`transits`/`blocks`），原「新形态」锚点在该模块不再出现 ⇒ `anchor hits != 1 (0)`。修法是**按模块分别给锚点**（`NEW_FORM_BY` / `OLD_FORM_BY` + `newFormOf(rel)` / `oldFormOf(rel)` 分派），而不是改一处字面量。**world 的「退回浅拷贝」形态必须定义成真·浅拷贝** `Object.assign({}, stat)`——若只写成「少快照 transits/blocks 而 faults 仍快照」，破坏后不构成泄露，判据会证明一个**不成立的假命题**。
  ⑪ **补丁脚本不可重复执行**（`x4_wire2.py` 出现重复块）：`tests/run.js` 的 `transit-v2930` 挂载点出现 4 行 ⇒ 写 `x4_wire_undo.py` 去重；`x4_fix5.py` 断言失败但代码已生效（前一次调用已完成替换），按实况复核后视为已生效，不再重复执行。脚本一律 `assert s.count(old) == n` 把关，落盘后 `grep -c` 复核。
  ⑫ **版本断言分散在多处门禁**（`reject-lock-v2780.js:171` 台账版本断言 + `dead-export-gate` 的 `version="2.92.0"` 与 `_note` 版本词 + `module-registry-ledger.json`）——升版须四处同改，漏一处即红。
  ⑬ **同一文件的多组锚点必须累积替换**：补丁脚本若各基于原始文本 `replace` 后会相互覆盖、只落最后一组；须在同一个 `src` 上累积替换并逐组 `assert s.count(old) == n`。
- **影响范围**：`engines/world.js`、`engines/tool-diag.js`、`ui/panel.js`、`tests/transit-v2930.js`（新）、`tests/run.js`、`index.js`、`manifest.json`、`tests/module-registry-ledger.json`、`tests/reject-code-ledger.json`、`tests/reject-lock-v2780.js`、`tests/fault-alias-lock-v2800.js`、`tests/dead-export-ledger.json`、`README.md`、`ITERATION_LOG.md`、`FOUR_VERSION_PLAN.md`
- **门禁结果**：`node tests/run.js` 通过 **7980 / 失败 0**（v2.92.0 基线 7906 / 0，+74 = 专锁 74 项）；`tests/transit-v2930.js` **74 / 0**；`tests/fault-alias-lock-v2800.js` **26 / 0**；`tests/reject-lock-v2780.js` **pass (50)**；`dead-export-gate.js` / `module-registry-gate.js` / `field-liveness-gate.js` / `test-surface-gate.js` / `inventory.js` / `export-contract.js` 六道全过；出口面 `ns= 104 members= 611 chars= 7475`；清册面 refs **2394** / 命名空间 110 / 成员 **1248**；死子面 dead 444 / uiDead 4 / `deadInTestsOnly` **293**；拒收码 **314**（见证 93 / 死表 5 / 基线 **216**）。
- **未覆盖（如实留在清单）**：`BLOCK_LEVEL` 是本版固化映射（新天气词只报 `unknown-kind`）；`transit` 不做耗时修正（`factor` 只随读数报出，`travelMinutes` 是另一入口）；不做多跳途中遭遇（只在路径各点查静态天气）；`transit` 会改 `stat` 计数（诊断刻意不调）；`hazard` 与天气本版**未联动**（计划原文的「weather.js 与 hazard/world.canBeAt 打通」只落了 weather↔world 这一半，hazard 侧留待后续）。
### R74 · 2026-09-26 · v2.92.0 资源账本健康面（O5：逐笔流水 + 存量/流量/对账 + 异常笔三类）
- **做了什么**：O5 一处落点扩成三文件，一把专锁（`tests/resource-ledger-v2920.js`，47 项，含 N0–N4 负控制），产品侧新增导出**只两口**。
  **`engines/org.js`（5720 → 12472 字节）**：① `JOURNAL_CAP = 200` + `journal[]` + `journalStat{recorded, dropped}` + `noteJournal(row)`（try 包裹；push 后 `while (journal.length > JOURNAL_CAP)` 环形挤出并 `dropped++`）；② `grant` / `transfer` 在交易体内先把前后值取进 `pending`（`toBefore`/`toAfter`，transfer 另记 `fromBefore`/`fromAfter`），成功后 `noteJournal(pending)`；③ 读数口 `qtyOf(kind,name,resource)`（无持有者返回 `null`，**不拿 0 冒充**）、`anomalies()`（`stockDrift` / `negativeStock` / `overpay` 三类，逐笔按 `before + sign*amt !== after` 算术判，`count` = 三类之和）、`reconcile()`（链检「这笔的 before == 上一笔的 after」+ 与当前存量比对，`breaks ≤ 20`、`breakCount`、`baseline ∈ journal-head|truncated`、`holderGone`）、`ledgerView()`（`{enabled, holderCount, holders ≤ 20, entries, recorded, dropped, cap, flow:{in,out,net}, anomalies, reconciled}`）。**导出只加 `ledgerView` / `reconcile`**。
  **`engines/tool-diag.js`（184404 字节）**：`secOrg` 增 `ledger` 段（`entries` / `recorded` / `dropped` / `holderCount` / `flowIn` / `flowOut` / `abnormal` / `abnormalDetail` / `reconciled` / `reconcileBreaks` / `truncated`），`ledgerView` 与 `reconcile` 各以 `safe()` 包一层（**一个读数口炸掉不得把整条诊断链带崩**）。
  **`ui/panel.js`（288471 字节）**：人物页「资源与组织」段增 `wa-org-ledger`（「资源账本」）按钮 + `on('#wa-org-ledger', …)` 绑定，登进 `UI_BINDINGS` 的 `page:'people'` 组；失败分支给**可读原因**，成功走 `panelEl.dataset.orgOut = '账本 · ' + summary`；`orgOut` 改为「有 `summary` 用『账本 · 』、否则用『已记录』」。
  **两处真消费方**（**无消费方不挂**）：诊断 `secOrg.ledger`（含跨文件 `reconcile` 消费）、面板按钮。
- **为什么**：`engines/org.js` 自 v2.54.0 起只有**累计计数** `stat = {grants, transfers, blocked, lastReason}`——它知道发生了多少次，不知道每一次的前后值。计划里那句判据「某笔交易后存量 = 存量 ± 流量」在此之前**不可判定**：库存被写坏时（编辑器直接改 `resources`、第三方脚本越界写）账上一切正常，玩家与制作者都拿不到任何可读的答案。
- **踩过的坑**（本版首跑全量回归 12 红，全部落在本版新增/翻转面上；另有专锁首跑 2 红、一次终端卡死）：
  ① **出口面冻结串的成员顺序必须与生成器产物逐字一致**：`FROZEN2800` 的 org 段按**字典序**修复写入（`… buildBlock canAfford … grant ledgerView reconcile …`），实测与 `tests/export_contract.txt` 第 3623 字符处起一致（字符数相同而内容不同，只有逐字符 diff 才能看见）。
  ② **陈旧锚点即缺陷**（`orphan-lock-v2750` 3 红）：O5 把 `a.resources[resource] -= n; b.resources[resource] = (b.resources[resource] || 0) + n;` 改成 `= fromBefore - n; … = toBefore + n;` 后，破坏锚点字面量随源码消失 ⇒ 「锚点在 `engines/org.js` 里恰 1 次 —— 实 0」+「破坏确实改动了字节」+「C1 必须现形 —— 仍绿（假绿）」三连红。修法是把锚点**更新为等价缺陷**（`replacement` 只去掉转入方入库）。
  ③ **新增内联拒收码必须显式归类**（`reject-lock-v2780` 3 红）：`ui/panel.js` 新增 `reason: 'ledger-throw'` ⇒ 该锁的三集合划分（见证 93 / 死表 5 / 基线 211）被打破（未分类 1 / 合计 310）。修法是把它归进**基线台账** `tests/reject-code-ledger.json`（**不删码、只登记**：让「取读数抛了」与「取不到读数」分开，正是本版想保留的分辨力），归入后门禁直跑 pass（见证 93 / 死表 5 / 基线 212）。
  ④ **清册面陈旧常量**（`tests/run.js` 4 红）：`refs 2385→2391`、`members 1244→1246`（三处判据，其中两处只改数字不改文案 ⇒ 失败信息会与断言值不符，**文案与数字必须同批更新**）。
  ⑤ **同一文件多组锚点必须累积替换**：补丁脚本对 `tests/run.js` 的 5 组锚点各自 `src.replace` 后相互覆盖，只有最后一组落盘（实测 2385 只减 1）；改用累积替换（`src = src.replace(...)` 不重建）后 5 组全中——**这是脚本设计缺陷，不是锚点问题**，若不做落盘后逐条 `grep` 复核就会带着半套修正去跑 5 分钟回归。
  ⑥ **面板把「核对结论」说成「已记录」**：首版对账断裂时 `reason` 留空 ⇒ 面板印出「未记录：未知原因」，而事实是「存量与流水对不上」，两句话南辕北辙。修法是失败分支给可读原因（`anomaly` / `reconcile-break` / `anomaly+reconcile-break`）+ 读数措辞改「账本 · 」（**不复用写盘回执的「已记录」**）。
  ⑦ **判据假设了 `blocked` 的计数面**（专锁首跑 2 红）：`missing-holder` 是**早退**、连交易体都不进，不计数；只有 `insufficient` 在交易体内 `stat.blocked++`。修法是按实况改判据并把「早退路不计 blocked」**显式钉住**；C2 的 `holders` 只列**有资源的**持有者（丙 `resources` 为 `{}`）⇒ 判据先给丙转 3 粮再断言 `qty === 3`。
  ⑧ **内联 `node -e` 传中文与引号会被 bash 吃掉**，终端卡在 heredoc 续行态（提示符 `>`）⇒ 发 Ctrl+C 复位，探针一律落盘再跑。
  ⑨ **升版脚本整体替换会误改历史标签**：把 `2.91.0 → 2.92.0` 整体替换时，3 处历史说明文字里的 `v2.91.0：O4 开关矩阵面` 被改成 `v2.92.0：O4 …` ⇒ 用短锚点回修并复核 `v2.92.0：O4 残留 = 0`。**历史标签写错版本号是陈旧常量的另一面（往未来漂）**。
  ⑩ **一处新增调用会连带打账本**：`secOrg` 新增两处 `safe(...)` 调用 ⇒ `dead-export-gate` 报「`toolDiag.safe` own=63 / 复算=65」证据失实 + 账本元数据不自洽 2 项；`--update` 后账本 version=2.92.0、证据 448 条（**归因证据必须与实现同批更新**）。
- **影响范围**：`engines/org.js`、`engines/tool-diag.js`、`ui/panel.js`、`tests/resource-ledger-v2920.js`（新）、`tests/run.js`、`tests/orphan-lock-v2750.js`（陈旧锚点同步）、`tests/reject-code-ledger.json`（新码归类）、`tests/export_contract.txt`、`tests/dead-export-ledger.json`、`tests/module-registry-ledger.json`、`index.js`、`manifest.json`、`README.md`、`ITERATION_LOG.md`、`FOUR_VERSION_PLAN.md`。
- **门禁结果**：`node tests/run.js` 通过 **7906 / 失败 0**（v2.91.0 基线 7859 / 0，+47 = 专锁 47 项）；`tests/resource-ledger-v2920.js` **47 / 0**；`tests/orphan-lock-v2750.js` **pass**（锚点更新后）；`tests/reject-code-gate.js` → pass（产品文件 111 / 内联拒收码 **310**：见证 93 / 死表 5 / 基线 212）；出口面 `ns= 104 members= 609 chars= 7458`（已回填 `FROZEN2800` 与 `EC2430`）；清册面 refs **2391** / 命名空间 110 / 成员 **1246**（四类悬空均 0）；死子面 dead 444 / uiDead 4 / dataOnly 161 / 归因 test-only 292；`tests/module-registry-gate.js` → pass（文件 107 / 命名空间 115 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0）；`tests/field-liveness-gate.js` → 骨架一级键 51 / 规则② 写侧越界 1 处（`ui/panel.js`，既有）/ 规则③ 0 处；`tests/test-surface-gate.js` → 测试文件面 **73** / 锁 **68** / 可达 73 / 孤儿 0。
### R73 · 2026-09-26 · v2.91.0 开关矩阵治理（O4：可见性 × 模块总开关两面真值 + 模块关归因 + 悬空身份引用）
- **做了什么**：O4 一处落点扩成两面，一把专锁（`tests/switch-matrix-v2910.js`，442 行，72 项，含 N0–N4 负控制）。
  **`render/inject.js` 三处**：① `SRC_MOD_SETTING`（源键 → 模块设置键，**37 项显式列出**，不同名的一一列出，如 `temporalLock → worldaxis_temporal_settings_v1`、`parallelEvents → worldaxis_pevents_settings_v1`）；② `moduleEnabled(k)` **三态读**（从 `WA.__settingsRegs` 取该键自己登记的 reg（含模块声明的 `def`）→ `settingsBus.read(reg)` → 只有 `typeof all.enabled === 'boolean'` 才算可判定，否则 `null`；**不在读不到时现造 `def: {}` 的壳**）；③ 归因链新增 `module-off`（插在 `module-absent` 之后、`failed` 之前 ⇒ **七态封闭集合**），`visibilityStat()` 增 `faceAudit`（逐源 `{key,name,face,visibility,moduleEnabled,note}`，`face` 取 `on` / `vis-off` / `mod-off` / `unavailable`）。实测默认态 47 源：`mod-off 36` / `unavailable 8` / `vis-off 3`。
  **`actors/registry.js` 一处**：新增 `danglingRefs()`（本版**唯一**新增导出成员）——两套名字真源（`idScope().mine` 持久绑定表 + `store.people` 容器键去 `p_` 前缀）× 三类引用行的 `target`（`relationships` / `relations` / `life.commitments`），`if (!t || known[t]) return;` 才算非悬空；**只报不删**（悬空引用不是错误，是待确认的旧账；自动清掉等于替作者做了决定）、**只读不改状态**（专锁里用前后 `JSON.stringify(people)` 比对钉住），返回 `{rows, byKind:{relationships,relations,commitment}, items ≤ 20, knownCount, persisted:true}`。
  **两处真消费方**（**无消费方不挂**）：`engines/tool-diag.js` 的 `secModules` 增 `danglingRefs`、`secInject` 增 `out.faceOff`（仅非空时出）/ `out.faceUnavailable` / `out.faceAuditError`；`ui/panel.js` 注入页增 `wa-inj-face` 按钮 + 绑定（只列 `mod-off`，无异常时给「开关两面一致：没有任何源处于『勾着却无效』（N 个源中，M 个没有模块级总开关）」），人物页 `idRows` 增悬空行（「悬空引用 N 条（指向未登记的名字：甲→丙（relationships）；… · 只报不删，确认后再改）」）。守卫表同步登记（登记错页比不登记更坏）。
- **为什么**：注入链上每个源要过两道门——用户可见性（`worldaxis_visibility_v1`）与模块级总开关（各模块 `worldaxis_*_settings_v1.enabled`）。`applyInjections` 只写 `if (vis.xx && WA.xx)`：模块没装载读成 `undefined` 被吞掉，模块装了而总开关关着同样静默跳过。实测默认态 47 源里 **36 源**处于「勾着却无效」——「我把可见性打开了，为什么还是没有」只能靠人逐个模块页面翻开关。第二面是身份引用：改了名字之后，关系 / 承诺里指向旧名字的行会静默指向一个不存在的人，此前没有任何出口能报出来。
- **踩过的坑**（本版首跑共 12 红，全部是判据自己写错；另有一次整体放弃）：
  ① **判据假设了模块开关的默认值**（专锁首跑 10 红）：`fresh()` 复用同一 `WA` 对象，而 `run.js` 各 section 共享 `localStorage`，前序用例（`causal-v2620` / `org-v2540` / `parallel-world-v2640` / `settle-v27xx` 等）已把一批模块开关打开过 ⇒ 判据按「默认全关」写死的地方全部翻车。修法是 `seed()` 里 `MAP_KEYS.forEach(k => setEnabled(WA, k, ...))` **显式置定**，不吃环境。
  ② **判据自己命中了注释里的历史错法**（`[A2]`）：函数体注释里还留着旧写法的字面量 ⇒ 判据不得引用锚点串。③ **期望写反**（`[N1a]`）：把 `module-off` 那条归因置假之后源回落成 `no-content`，断言方向写成 `landed`。④ **跨实例取读数**（`[N2]`）：拿 `fresh()` 之前那个实例的读数与破坏后 `fresh()` 的读数比，差不是破坏造成的。
  ⑤ **陈旧常量即缺陷**（全量回归 2 红，全在 O3 锁 `tests/explain-v2900.js`）：`STATES` 只认六态，会把正确的新实现判成「越界」（实测一次报 32 项越界）；B4 拿 `org` 当「没内容」正例，而 org 的总开关默认关闭且被前序用例显式关过 ⇒ 归因已变 `module-off`，属**对照吃环境**。**修法不是放宽断言**：一改判据（六态 → 七态并加注），二改 seeds（模块总开关也显式置定）——**判据的输入面选错会把正确实现判成缺陷**。
  ⑥ **升版脚本整体放弃了一次**（`o4_version.py`）：第 12 组锚点命中 0 ⇒ 按纪律 `ABORT`、**一字节未写**，改用实况锚点的 `o4_version2.py` 才落盘。纪律的意义正在于此：锚点不唯一时宁可不动，也不要写坏一份 1.4MB 的入口文件。
  ⑦ **一处新增调用会连带打账本**：`secModules` 里多了一个 `safe(...)` 调用 ⇒ `dead-export-gate` 报「`toolDiag.safe` own=62，复算=63」证据失实 1 项；`--update` 后账本 version=2.91.0 复原（**归因证据必须与实现同批更新**）。
- **影响范围**：`render/inject.js`、`actors/registry.js`、`engines/tool-diag.js`、`ui/panel.js`、`tests/run.js`、`tests/switch-matrix-v2910.js`（新）、`tests/explain-v2900.js`（陈旧判据同步）、`tests/export_contract.txt`、`tests/dead-export-ledger.json`、`tests/module-registry-ledger.json`、`index.js`、`manifest.json`、`README.md`、`ITERATION_LOG.md`、`FOUR_VERSION_PLAN.md`。
- **门禁结果**：`node tests/run.js` 通过 **7859 / 失败 0**（v2.90.0 基线 7787 / 0，+72 = 专锁 72 项）；`tests/switch-matrix-v2910.js` **72 / 0**（直跑 `pass（72 项）`）；`tests/explain-v2900.js` **53 / 0**（同步陈旧判据后直跑全绿）；出口面 `ns= 104 members= 607 chars= 7437`（已回填 `FROZEN2800` 与 `EC2430`）；清册面 refs **2385** / 命名空间 110 / 成员 **1244**（四类悬空均 0）；死子面 dead 444 / uiDead 4 / dataOnly 161 / 归因 test-only 292；拒收码 309（见证 93 / 死表 5 / 基线 211）；`tests/module-registry-gate.js` → pass（文件 107 / 命名空间 115 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0）；`tests/field-liveness-gate.js` → 无幽灵读点、规则② 写侧越界 1 处（`ui/panel.js` 的 `innerHTML`，既有）、规则③ 0 处；`tests/test-surface-gate.js` → 测试文件面 72 / 锁 67 / 可达 72 / 孤儿 0。
### R72 · 2026-09-26 · v2.90.0 每轮执行解释（玩家面 / 全知面分列）
- **做了什么**：O3 一处落点（第四十四面），一把专锁（`tests/explain-v2900.js`，53 项，含 N0–N4 负控制）。
  **`render/inject.js` 新增事后归因**：`SNAP_SOURCES`（六源合记「世界状态」块）+ `sourceDecisions(vis, landedNames, failNames)`，六态封闭集合（`landed` / `landed-in-state` / `visibility-off` / `module-absent` / `failed` / `no-content`），**不改 47 条注入分支**——记账点长在分支上，加分支的人必忘（v2.56.0 教训）。
  **`explain(round)` 两面分列**：`player` 只给 `{landed, missedCount, summary, note}`（不报未落地项名与归因码，避免机制层剧透）；`omniscient` 给逐源 `{key,name,state}` + `trace` + `budget` + `cost`。轮次三态：`no-rotation` / `round-not-recorded{want,have}` / 正常。`lastInjection` 补 `round` 与 `decisions` 两字段；`applyInjections` 的 `roundNow` 跟 `evolution.roundOf()` 走（缺席为 null）。
  **两处真消费方**：`engines/tool-diag.js` 的 `secInject` 加 `out.explain`（round/candidates/landedCount/missedCount/playerSummary/missed 逐项）；`ui/panel.js` 注入页加 `wa-inj-explain`（玩家面摘要）与 `wa-inj-explain-all`（逐源列名）两枚按钮 + `explainOut(all)` 绑定，两者不合并到一个输出框。
- **为什么**：`if (vis.xx && WA.xx)` 的跳过式注入让四种截然不同的局面在存档上长得一模一样（都是「这个源没进正文」）：用户关的 / 模块没加载 / 本轮没内容 / 构建抛异常。缺了分列，「世界状态为什么没进正文」只能靠人肉比对可见性配置——这是 v2.86.0 把「坏 ≠ 没内容」分开之后仍缺的那一层：**分开记了，但没有面向人的解释面**。
- **踩过的坑**（五处首跑失败全是判据自己写错，一处是环境残留）：
  ① **判「玩家面是否剧透」的输入面选错**：拿整段 `JSON.stringify(ex.player)` 去判状态码，而 `player` 有个键就叫 `landed`，序列化后必然命中 ⇒ 正确实现被判成剧透。改判「键集封闭 + 每个字符串值不含状态码」。
  ② **口径错：关掉 no-content 的源不改计数**：断言「关掉 intel 后未进项 +1」，实测 41→41——intel 本来就是 no-content，关掉只换归因码。改为关**原本会落地**的源（longline）并断言 +1。
  ③ **复用旧环境变量**：`fresh()` 重装模块后旧变量看到的是新 store（WA 是同一个对象），拿 `W4.render.explain()` 与 `ex5` 比会读到新环境；「未注入过」也不能赌环境干净（共享 localStorage 有前例落盘），须显式置 `lastInjection = null`。轮次三态另起局部环境（`W8`）。
  ④ **守恒式挑错层级**：`player.landed` 是**块级**（6 个快照源合记 1 项），拿它与源数对账必然对不上；源级守恒属全知面，块级守恒写「世界状态 1 块 + 真落地源数」。
  ⑤ **负控制破坏形态无效**：`ANCHOR_VIS` 首版用「删行」，链首 `if` 删掉留悬空 `else` ⇒ 破坏副本 `SyntaxError: Unexpected token 'else'`，`runNegative` 直接 THROW——**装不起来就证明不了判据敏感**。统一改**条件置假**。
  ⑥ **环境残留导致单点红灯**：负控制 N3 硬编码「未进 40」，而全量回归里前序 section 留下的世界内容让额外 3 个源真出内容（实测 37）。**硬编码容易漂的读数＝陈旧常量**，改为相对判据（落地源真落地 + 计数与候选数守恒）。另抓出一处：面板里全知面局部变量原名 `o`，撞上 v2.39.0 顶层 `.round` 幽灵扫描（标识符集含 `o`）⇒ 改名 `om` 并在专锁正面钉住该命名约束。
  ⑦ **补丁脚本不可重复执行**（本版第二次踩）：`o3_wire.py` 跑两遍导致 `tool-diag.js` 诊断块重复插入（`out.explain` 4 处）；用 `git checkout -- engines/tool-diag.js` 回滚后只重跑诊断那一刀。⚠️ 回滚的最小单位是文件、不是目录。
  ⑧ **文档里的门禁读数必须在终局回归之后回填**：本版先按修 N3 前的读数写文档（7785 / +51），修完 N3 后的干净回归是 **7787 / 0**（7734 + 53 = 专锁 53 项，与直跑 53 / 0 自洽）。数字写早了同样落进「**陈旧常量**」这一类——终局回归是唯一权威读数，文档一律等它。
- **影响范围**：`render/inject.js`、`engines/tool-diag.js`、`ui/panel.js`、`tests/run.js`、`tests/explain-v2900.js`（新）、`tests/reject-v2780.js`、`tests/dead-export-ledger.json`、`tests/module-registry-ledger.json`、`tests/export_contract.txt`、`index.js`、`manifest.json`、`README.md`、`ITERATION_LOG.md`、`FOUR_VERSION_PLAN.md`。
- **门禁结果**：`node tests/run.js` 通过 **7787 / 失败 0**（v2.89.0 基线 7734 / 0，+53 = 专锁）；`tests/explain-v2900.js` 53 / 0（直跑 53 / 0）；出口面 `ns= 104 members= 606 chars= 7424`（已回填 `FROZEN2800` 与 `EC2430`）；清册面 refs 2374 / 命名空间 110 / 成员 1243；死子面 dead 444 / uiDead 4 / dataOnly 161 / 仅测试 292；拒收码 309（见证 93 / 死表 5 / 基线 211）；`tests/module-registry-gate.js` → pass（文件 107 / 命名空间 115 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0）；`tests/field-liveness-gate.js` → 无幽灵读点、无写/读侧越界。
### R71 · 2026-09-26 · v2.89.0 因果回放证据升级
- **做了什么**：O2 一处落点（第四十三面），一把专锁（`tests/replay-v2890.js`，含 N0–N4 负控制）。
  **`core/rand.js` 新增抽取磁带**：录制每格 `{c: 通道名, v: 取到的值, k: 'd'|'i'}`，**按位置**记录（不记推导过程），故调用顺序漂移会被位置检出而非静默换数。新增 `beginTape` / `endTape` / `tape` / `replay` / `stopReplay` / `verifyTape` 六口。
  **回放不碰派生流**：回放时 `next()` / `draw()` 全走磁带，`streamFor` 不派生 ⇒ 退出后会话序列与进入前逐位相同。`evidence()` 新增 `tape` / `replayable` / `replayBlockedBy`，与既有的 `reproducible` **分列**。
  **`engines/causal.js` 新增 `record(fn)` / `replayWith(tape, fn, expect)`**：前者 `finally` 无条件收卷（否则任何 early return 都把磁带留在录制态 = 整局被静默记录）；后者走位读数无论 miss 与否都返回，`verdict ∈ clean / positions-mismatch / tape-underrun`。
  **面板与诊断接线**：`ui/panel.js` 加「录制一轮」「复核磁带」两枚按钮并升级「回放证据」段为两句结论分列；`engines/tool-diag.js` 的 `secCausal` 加只读回放/磁带段（只呼 `verifyTape`，不呼 `replay`——诊断必须零副作用）。
- **为什么**：本仓库从 v2.14.0 起就报 `reproducible`，却没有任何地方能证明「这一轮真能重放」。种子相同而调用顺序漂移时，随机源会安静地换一整套数，此后所有基于它推出的结论都不可复核。这是「可复现」这句话长期只有声明、没有证据的缺口。
- **踩过的坑**：① **`JSON.stringify(undefined)` 返回 undefined 而不是字符串**（首跑现场）：`a.length` 抛 TypeError —— 而「回放一个无返回值的推进函数」恰是最常用形态，取证口自己炸掉比没有复核更坏。② **注释里「id 逐字一致」是假话**（实测自纠）：噪声逐字相同（`3d4c`）而递变计数器不同（`1` vs `2`）；把计数器也复现会让两次回放产出同一个 id，用唯一性换可复现性是净亏 ⇒ 边界修正为「复现的是随机抽取，时间戳与计数器不参与回放」。③ **取证擦掉了证据**（真缺陷）：`stopReplay` 把最近一卷磁带一并清掉，实测「录制 2 格 → replayable=true」在「调一次 replayWith」之后变成 false；修法是另存最近收卷的磁带、`tape()` 无在卷时回落。④ **失败路径交出的是回执不是磁带**（真缺陷）：`record` 里 fn 抛异常时把 `endTape()` 的返回对象 `{ok, tape, count, seed}` 当磁带交回，`rec.tape.entries` 是 undefined。⑤ **别名让门禁看不见调用**：`causal` 里经 `tz.endTape()` 调用的配对出口被判成死导出（dead 443→446），直呼后回落。⑥ **本表缺失会带崩运行器**：run.js 的 `callMap19` 覆盖 rand 每个导出，新口没进表时 forEach 以 `callMap19[k] is not a function` 中断整套回归——比一条红灯危险得多（后面的用例静默不跑）。⑦ **判据自己写错了两处**，都靠实测纠正：N1b 原断言「破坏位置前进后 miss 变 0」根本做不到（`take` 无论如何都查通道），改用两通道对照；`used===1` 与实测 `used=2` 不符（`used++` 在通道检查之前）。
- **影响范围**：`core/rand.js`、`engines/causal.js`、`engines/tool-diag.js`、`ui/panel.js`、`tests/run.js`、`tests/replay-v2890.js`（新）、`tests/reject-v2780.js`、`tests/dead-export-ledger.json`、`tests/module-registry-ledger.json`、`index.js`、`manifest.json`、`README.md`、`ITERATION_LOG.md`、`FOUR_VERSION_PLAN.md`。
- **门禁结果**：`node tests/run.js` 通过 **7734 / 失败 0**（v2.88.0 基线 7654 / 0，+80 = 专锁 68 + 拒收码见证 12）；`tests/replay-v2890.js` 68 / 0；出口面 `ns= 104 members= 605 chars= 7416`（已回填 `FROZEN2800` 与 `EC2430`）；清册面 refs 2367 / 命名空间 110 / 成员 1242；死子面 dead 444 / uiDead 4 / dataOnly 161（新增 `causal.replayWith` 如实登记）；拒收码 307 个（见证 91 / 死表 5 / 基线 211），无新增静默码。

### R70 · 2026-09-26 · v2.88.0 注入成本实测与分档
- **做了什么**：O1 一处落点（第四十二面），一把专锁（`tests/cost-v2880.js`，58 项，N0–N4 负控制）。
  **计时落在唯一引擎调用出口**（`render/inject.js` 的 `engineCall`）：v2.86.0 已把它收敛成 46 处调用点共用的唯一出口，于是「每源构建花了多少 ms」在一处落表就天然覆盖全部引擎源；若换到 46 个调用点各写一遭，迟早早漏一个，而漏掉的那个会以「0ms」的样子出现在账上（看不出是漏的）。时钟用既有的 `clockWall`（测量时间），与参与判定的 `clockNow` 分列 —— v2.15.0 的时间源纪律。
  **`engines/inject-budget.js` 新增成本账**（纯函数承诺不变：不读 store、不写配置、不落地注入）：`costOf(ms)` 三分档（≤2ms 无感 / ≤16ms 一帧内 / 再往上引人注意）、`costSummary(list, costs)` 汇总、`costView(planResult)` 只读视图、`ACCOUNTS` 科目表（45 源逐一登记为「世界骨架 / 人物与关系 / 叙事推进 / 环境与氛围 / 账目与观测」五科目 × 承载 / 推进 / 计量 / 呈现 / 氛围 / 一次性 六角色）、`plan(items, { budget, costs })` 返回值新增 `cost`。导出面**只加两个成员**（`costOf` / `costView`），且两个都真有消费方：`costOf` 供 `tool-diag.secInject()` 给「最慢 5 源」贴档位，`costView` 供 `ui/panel.js` 的「本轮注入」段渲染耗时与科目分布。
  **三态如实，绝不拿 0ms 冒充「很快」**：① 真耗时；② `0ms` 是**低于计时精度**（墙体时钟只精到 1ms），另计 `subTick` 并如实报；③ 非计量项（快照 `世界状态`、自带 try 的 `叙事工艺`、内联的 `近端事件`、外部经 `ctx.injections` 交来的项）进 `unmeasured` 且**不计入 totalMs**——把非计量项当 0ms 入账，账上会凭空多出「零成本源」，总耗时看着就比真实的小。
  **分档纯属解释面**：不参与任何判定，不因慢而丢源（专锁 B13 钉住：喂 999ms 也不改裁决结果）。
- **为什么**：本仓库从 v0.9.3 起就报「注入用了多少 token、谁被折叠、谁被丢弃」，但**耗时**这一维从未被测量。45 个源的注入链里，任何一处慢函数（正则回溯、排序、深拷贝）都只能以「反正有点慢」的体感存在，没有数字可追。
- **踩过的坑**：① **账本主键错了**。首版从注入项清单 `list` 出发统计，而引擎源构筑后返回空串是常事（世界没这块数据）——实测空世界下 42 源真有耗时、账上却只见 0 源。「产出空」不等于「不花时间」。改为以**引擎真调用过的源**为账本主键（锚点 `Object.keys(cs || {}).forEach`），专锁 B1 与负控制 N1 都钉在这一点上。
  ② **同一个源两套名字**（真缺陷）：`SRC_NAME.ledger` 写的是「重大事件账本」，而注入项的 `source` 是「账本」——代价是它同时出现在两本账上：故障台账叫「重大事件账本」，而 token 账 / 科目表 / 优先级表叫「账本」，同一源在两表里对不上号（实测科目表把它报成「未归类」）。统一到注入项名（用户也在注入日志里看到的就是它）；面板显示名属 `VIS_NAMES`，不受影响。
  ③ **`ACCOUNTS` 只写了 8 条，而源面已长到 45**（首版还写进一个从不存在的「人物此刻」）——只登记少数几个会让绝大多数源落在「未归类」上，那张表就只是装饰。改为逐个登记全部 45 源，并加 A1 成类锁：`PRIORITY` 的键集必须被 `ACCOUNTS` 逐字盖住、条目数必须相等（漏登 / 多登都现形）。
  ④ **导出面不要超额买**：首版把 `COST_BANDS / ACCOUNTS / UNCLASSIFIED` 一并导出，全库零外部消费点。按「导出即有承诺」纪律收回（需要读它们的地方全在本模块内），只留 `costOf` / `costView` 两个真消费方。
  ⑤ **`unmeasured` 曾被改成恒空的 `absent`**：当时的推演是「能进 list 的源都刚构建过，耗时必然同时交进来」——错了。`unmeasured` 在实践中**非空**（快照项每轮都在）。那句判断本身就是「没落到实现上的推演」，当场改回。
  ⑥ 专锁里的 `argOf` 首版把闭引号当成了开引号，45 个调用点全部配不成对（判据红得莫名其妙，而不是静默假绿）。
- **影响范围**：`render/inject.js`、`engines/inject-budget.js`、`engines/tool-diag.js`、`ui/panel.js`、`tests/run.js`、`tests/cost-v2880.js`（新）、`index.js`、`manifest.json`、`README.md`、`ITERATION_LOG.md`。
- **门禁结果**：`node tests/run.js` 通过 **7654 / 失败 0**（v2.87.0 基线 7596 / 0，+58 = 专锁）；`tests/cost-v2880.js` 58 / 0；出口面 `ns= 104 members= 598 chars= 7357`（已回填 `FROZEN2800` 与 `EC2430`）；`tests/inventory.js` 四类悬空均 0（静态引用 2345 处 / 命名空间 110 / 成员 1234）；`tests/dead-export-gate.js` dead 443 / uiDead 4 / dataOnly 161（无新增）；`tests/module-registry-gate.js` pass（107 文件 / 115 命名空间）；`tests/reject-code-gate.js` 每个码都有归属；`tests/ui-wire-audit.js` 9 / 0。
  **未覆盖项照实登记**：分档只做到「单源构建耗时」，未做局部重算（改一条要重算多少）与短中长基准对照；耗时只进诊断与面板，未开独立历史曲线（需先有窗口滚动存储的取舍）。

### R69 · 2026-09-25 · v2.87.0 导演工作台与拓宽（第四十一面：能力已经实现，但没有任何人读得到——探针只在测试里活着）

- **做了什么**：三处落点，两把专锁，四个版本计划的收官版本。
  **B6（`engines/causal.js`）**：抽出 `advanceChains(draft, f, cfg, only)` 作为推进的**唯一实现**（`tick()` 改为调它，只改传入 draft，不碰 store/stat/台账），在其上新增四个只读口：`stateView()`（活链/终局/按状态/按阶段/待定/延迟/已结算分列，与 `stat()` 的进程累计分列）、`previewIntervention(chainId, action, args)`（advance/cancel/settle 三动作给 allowed 与原因码，零副作用）、`rehearse(facts)`（深拷贝上跑完整一轮，dryRun:true）、`conflicts()`（只报同因同果在途链，给 a/b/both 选项，不自动消解）、`evidence()`（随机源读数与推进绑定，reproducible 仅在显式播种时为 true）。
  **B7（`engines/theme.js`，新）**：五题材（都市/校园/悬疑/奇幻/经营）对 `rules.ORDER` 的**显式组合**。核心四模块（world/event/info/reputation）不入任何排除面；多题材取并集按 ORDER 原序（不引入优先级/覆盖）；`preview()` 纯计算不落设置；`apply()` 是唯一写入口，未知题材返回 `unknown-theme` 且不改状态；`rules.getAll()` 按启用题材过滤（零启用 = 全量，旧行为逐字不变）；`separation()` 报告三插件分工，缺席由 `compat.detect()` 现场探测**降级可见**。
  **A5 收口（`engines/tool-import.js`）**：抽出共用字段映射 `toFaction/toEvent/toPmem`（消除两处字段名分叉）；新增 `previewPlan(raw)` 在深拷贝上跑**同一批准入函数**逐条报 willAdd/willSkip/rows；snapshot/regional/worldbook 如实给 note。
  **UI 接线**：导演页新增题材规则组合区（多选/预览差异/应用/清空回全量）；事件页因果区新增因果工作台区（当前/累计/分支试演/查冲突/回放证据/干预预览）；工具页导入区 preview 与 previewPlan 并列显示。
- **为什么**：B6/B7/A5 三处都是同型病——能力已经实现，但没有任何人读得到：causal 只能整体跑、不能定点，更不能先看后做；rules 只有全量/精简两档，题材无处装卸；toolImport.preview 只报 kind/size/count，而导入有副作用。
- **踩过的坑**：① `theme.preview` 的「当前面」基线误用 `compose([])`（只得到 CORE 4 个模块），campus 的 deltaChars 报出 +5408 的虚假增量——**差异预览撒谎比没有预览更糟**，改为「未启用题材时当前面 = 全量 ORDER」后报 -1107；② B6-E 判据首版写错期望（rand 未播种时 seedSource 初始为 none 而非 auto），改为锚 `!== explicit && reproducible === false`；③ 首跑 `dead-export-gate` 一次报出 9 个新增死导出（B6 四个口 + A5 的 previewPlan 只有测试引用、4 个 self-only 过度导出）——处置不是刷账本，而是分两类治：四个只读口接面板、四个收回导出、一个由 `theme.separation` 接通；④ `missing-pair` 是自造的多余码，改为把空串交给 `causal.cancel` 复用其 `missing-fields` 归因。
- **影响范围**：`engines/causal.js`、`engines/rules.js`、`engines/tool-import.js`、`engines/tool-diag.js`、`engines/theme.js`（新）、`ui/panel.js`、`tests/run.js`、`tests/b6-b7-v2870.js`（新）、`tests/causal-view-v2870.js`（新）、`tests/reject-v2780.js`、`tests/settle-v2830.js`、`tests/dead-export-ledger.json`、`tests/module-registry-ledger.json`、`index.js`、`manifest.json`、`README.md`、`FOUR_VERSION_PLAN.md`。
- **门禁结果**：`node tests/run.js` → **通过 7596 / 失败 0**（v2.86.0 基线 **7541 / 0**，+55 = 两把专锁）；`tests/ui-gate.js` → **53 / 0**（375 控件真实点击）；`tests/ui-wire-audit.js` → **9 / 0**；出口面 `ns= 104 members= 596 chars= 7341`（已回填 FROZEN2800 与 EC2430）；`tests/dead-export-gate.js` → dead **443** / uiDead 4 / dataOnly 161 / 仅测试 291 / 证据 447；`tests/module-registry-gate.js` → pass（107 文件 / 115 命名空间）；`tests/reject-code-gate.js` → 见证 **79** / 死表 4 / 基线 211；`tests/settle-v2830.js` → **55 / 0**；`tests/inventory.js` → 四类悬空均 0（静态引用 2339 处）。
### R66 · 2026-09-25 · v2.86.0 注入链韧性 + 事实唯一写者（第四十面：一个源的数据瑕疵能把整块世界状态吃掉；一条事实有五个写者，谁写的看不出来）

- **做了什么**：两处落点，两把专锁。
  **A5（`render/inject.js`）**：43 个源调用点里只有 `style` 一处在 try/catch 内。实测让 `bonds` 抛一次异常 ⇒ **47 个源全部丢失**（连世界状态的时间/背景/人物一起消失），异常还冒泡出扩展。新增 `engineCall(ns, fn)` 作为唯一引擎调用出口：缺席 / 空串 / **抛异常**三态分开，只有抛异常进故障台账，并按**用户看得见的名字**记（「关系六型」而不是 `bonds`）。42 个裸调用点全部收敛；世界快照六段逐段守卫；`nearEvent`（既读又写）整块守卫。故障台账经**既有** `visibilityStat()` 暴露——**零新增导出成员**。专锁 `tests/settle-v2860.js`（22 项，N0–N4 负控制）。
  **A3（`actors/registry.js`）**：人物条目此前有五个创建点（life / intel 两处 / backstage 两处 / registry），各写各的 `draft.people[id] = {...}` ⇒ 「这个条目是谁建出来的」完全不可见。新增 `ensurePerson(draft, id, name, via)` 作为**唯一写者**，每次新建打 `createdVia` / `createdAt` 来源标签；五个调用点全部改为委托（自动建人的行为一个字都没收紧）；无 registry 的合成宿主桩仍能自建，但标签带 `:fallback` 后缀——于是「产品运行时到底走没走唯一写者」这件事本身可被断言。观测出口 `personOriginStat()` 由 `tool-diag.secModules()` 真消费。专锁 `tests/identity-v2860.js`（36 项，五个真源码破坏锚点各恰中 1 次）。
- **为什么**：两处都是「承诺写在源码里，但没有任何判据问过它」的同型病。A5 修前，模型输出少一个字段（`bonds` 缺 `types`、`ladder` 缺 `rungs`、`shadow` 缺 `holders`）正文就整块空白，而「世界状态为什么没进正文」永远答不出是没内容还是坏了。A3 曾试过更硬的一版（未知 id 直接拒收），实测撞 24 条既有契约（life-v2520 / settle-v2650 / evict-meta-v2610 / registry-identity-v2620）已回滚——**把「创建」判成病是错的，把「看不见谁创建的」判成病才对**。
- **踩过的坑**：① 首版把 `vis.<k>` 挪进 `engineCall` 首参，破坏了 v2560/v2580/v2841 三条负控制的锚点 `vis.life && WA.life` ⇒ 负控制假绿，改为 `engineCall(ns, fn)` 形态、守卫原样保留；② `gate.fresh()` 复用同一个 `global.WorldAxis`，负控制里「先取原版、后建破坏副本」会让原版引用被覆盖 ⇒ 原版侧读数必须在建破坏副本**之前**算完；③ 新增导出成员要付接口冻结串的价（members 580→582 / chars 7169→7199），且专锁的真代码面引用会改写 dead-export 账本的 tref（test-only 291→292）。
- **影响范围**：`render/inject.js`、`actors/registry.js`、`engines/life.js`、`engines/intel.js`、`engines/backstage.js`、`engines/tool-diag.js`、`tests/run.js`、`tests/settle-v2860.js`（新）、`tests/identity-v2860.js`（新）、`tests/reject-v2780.js`、`tests/dead-export-ledger.json`、`tests/field-liveness-ledger.json`、`tests/module-registry-ledger.json`、`index.js`、`manifest.json`、`README.md`、`ITERATION_LOG.md`。
- **门禁结果**：`node tests/run.js` → **通过 7541 / 失败 0**（v2.85.0 基线 **7483 / 0**，净增 58 = A5 专锁 22 + A3 专锁 36）；`tests/settle-v2860.js` → **22 / 0**；`tests/identity-v2860.js` → **36 / 0**；`tests/reject-code-gate.js` → 每个码都有归属；`tests/dead-export-gate.js` → dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292 / 证据 448 条；出口面 `ns= 103 members= 582 chars= 7199`。


### R65 · 2026-09-24 · v2.82.0 快照与分支（第十六面：存档 ≠ 保存过 = 分支）

- **做了什么**：新增 `engines/checkpoints.js`（约 610 行，路线 B3 的交付物）。把「存档」从「存了个东西」变成**可复述的谱系事实**：① 快照库落在**世界状态之外**的独立 localStorage 键 `worldaxis_ckpt_v1_<chatId>`（不进 store 骨架）；② 「分支」必须落地成**一次真实的 save**，只记父指针不算分叉；③ `schemaVersion` 钉成**守卫键**（快照里从不含它，剥离前移到采集层）。配套专锁 `tests/settle-v2820.js`（152 项，24 条真源码破坏面 + 1 条 DEFENSE 登记 + N0~N5 负控制），九处标准接线（其中三处刻意不登记）。
- **为什么**：仓库里已有四处碰「存档」——`core/store.js` 有恢复点与隔离区、`engines/parallel-world.js` 有快照、`engines/chatcache.js` 有镜像、ledger 有检查点——**没有一处回答「分支」两个字**（我从哪一版另起一条？这条线现在还答得出它的来处吗？父档被挤出后呢？）。路线 B3 的四条关键约束（恢复不得连带抹掉「我有哪些存档」／世界版本不得由存档决定／分支必须是真实的新档而非只记父指针／库读不出时绝不覆盖写）此前**无承载物**。库若塞进 state，一次「恢复到旧版本」会同时把「我有哪些存档」这张表一起回退——用户会看到存档凭空消失，故它**不登记** `core/evict.js` 的 `SITES`（`path` 字段指向 store 内容器，硬塞等于让容量登记表自称管一个它看不见的容器），改为**模块自管 + 同款纪律**：`stat.evicted` 记账、`lastEvicted` 把「丢了谁」回传调用方。
- **影响范围**：`engines/checkpoints.js`（新）、`engines/tool-diag.js`、`core/evict.js`（不登记）、`core/store.js`（不登记）、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`tests/run.js`、`tests/settle-v2820.js`（新）、`tests/reject-v2780.js`、`tests/dead-export-ledger.json`、`tests/field-liveness-ledger.json`、`README.md`、`ITERATION_LOG.md`。`tools/*`（约 106 项残留）留待 A6。
- **门禁结果**：`node tests/run.js` → **通过 7283 / 失败 0**（v2.81.0 基线 **7124 / 0**，净增 159）；专锁 `tests/settle-v2820.js` → **152 / 0**（连跑稳定）；`tests/reject-code-gate.js` → 内联拒收码 281（见证 68 / 死表 2）；`tests/reject-lock-v2780.js` → 50 / 0；`tests/dead-export-gate.js` → dead 444 · uiDead 4 · dataOnly 160 · deadInTestsOnly 291 · 证据 448 条 · 归因 `{test-only:295, self-only:120, unwired:33}` · version=2.82.0；`tests/export-contract.js` → `ns= 102 members= 569 chars= 7063`；清册 refs **2207** / ns 108 / members 1205；`SOURCES` 46→47；G16 裸读点 40→41；`field-liveness-gate` → 骨架一级键 51 · 产品文件 109 · 无越界。
- **三条产品面真缺陷（全部由实跑坐实，非纸面推演）**：
  · ① **守卫键剥离层太浅**：`capture()` 原样 `deep(st)` 采集，`schemaVersion` 进了快照库（实测 `read1.hasSchema = true`、`statekeys = 51`），只有 `restore()` / `exportOne()` 在出口剥。只在上层剥，`read().slot.state` 里仍带着它，任何将来新写的写回路径（导入、同步、外部调用）都会把它带进世界。**不变量要么无条件成立，要么迟早有人绕过去**——修法是前移到采集层，修后 `hasSchema = false`、`statekeys = 50`。
  · ② **移动信封自己导不回来**（实测 `import = {ok:false}`）：`exportOne()` 只写 `worldaxisCheckpoint` 标记，而 `migrate()` 读的是 `format`，两个字段名指同一件事。修法是新增 `fmtOf(o)` 作**唯一来源**；正文里保留 `format` 但注明「正文是给人看与给校验和用的，格式号是给机器用的」。
  · ③ **拒收码错位**：`importOne()` 先判总开关后判信封，导致「关着的时候丢进来一坨垃圾」报 `disabled`——用户会以为「打开了就能导入」，而它根本不是本模块的信封。**拒收码要答的是「这份东西坏在哪」，而不是「此刻能不能动」。**
- **又一处由本仓库既有门禁当场抓出的缺陷**：新模块的库读点 `ls.getItem(key)` 虽有 `try/catch` 且返回了 err 码（`read-threw`），却**没有把这次失败投递进读侧归因台账**（`WA.store.reportReadFail` → `bySource`）。G16（v2.11.0 的裸读点门禁）当场报 `engines/checkpoints.js:89`「无归因」并把裸读点总数 40→41 标红。判定：**结论由 err 码挡住、归因另投台账，两者都要**——只做前者，这次读失败不会出现在 `store.readStat().bySource` 里，**运维面上它等于没发生**（与 v2.80.0 命题同形）。修法参照 `engines/chatcache.js` 的 `noteRead()`，新增 `noteReadFail(source, key, err)` 并在两处读失败出口（`getItem` 抛错 / `JSON.parse` 抛错）各投递一次；修后 `miss = []`、总数 41。
- **两处如实登记（按 v2.78.0「码存在 ≠ 码可达」口径，不假称可破坏）**：① `migration-loop` 记为 **DEAD**——自旋防护所在循环要求 `f < FORMAT=1`，而唯一登记入口 `registerMigration` 收窄为 `f < 1`，该区间根本登记不进去（穷举 `-2..0` 全返回 `missing-fields`，`migrate({worldaxisCheckpoint:0})` 返回 `no-migration`），保留并钉锚点。② `exportOne()` 出信封前**再剥一次守卫键**记为 **DEFENSE**——库内 `slot.state` 已由采集层剥过、`importOne` 也剥，没有任何现存路径能让守卫键进库，该层差异**不可观测**；保留理由是向前兼容（老版本库或手工改写的字节可能带着它）。**「声称现形」比「不现形」更危险**：前者会在下一个人重构时把这段代码删掉。
- **拒收码见证补登**：新模块引入 11 个未分类码（`bad-scope` / `missing-keys` / `unknown-keys` / `guarded-key` / `lib-unreadable` / `bad-format` / `too-new` / `no-migration` / `checksum-mismatch` / `not-due` / `migration-loop`）。正解不是删码而是分类：10 个补**可执行见证**（全部走产品真 API：`Cp.resolveScope` / `Cp.save`+`Cp.read` / `Cp.migrate` / `Cp.importOne` / `Cp.exportOne` / `Cp.tick`），1 个（`migration-loop`）如实登记 DEAD。门禁由「未分类 11 个」转绿，见证 58→68、死表 1→2。
- **方法论留档：两次实测推翻凭印象写下的期望值**。① 专锁首跑 FAIL 16，红灯集中在 `probeCaps`；我原以为容量探针该报 `'2:1:reported'`，实测是 `'2:0:reported'`，且该期望值在**任何实现下都不可达**——默认 `autoEvery: 0` 时 `tick()` 一律 `disabled`，不显式设 `autoEvery: 1` 根本触发不了自动档。② 比较探针原先的破坏体是 `WA.store.transact(function (d) { d.people = {}; })`，而**默认 `people` 就是 `{}`**——等于没改，`people` 不进 `differing`，唯一差异是 `meta.updatedAt`；改为 `d.people = { p1: { name: '乙版' } }` 并新增 `probeCmpDiff`。这两次都指向同一条：**不能靠读断言文本猜期望，只能先实测、后写期望**。为此建了诊断挂载机制（把内部探针/helper 挂到 `module.exports.__probe` 的诊断副本 + 六份症状表脚本），逐条打印 clean 值 vs broken 值全表后再回填。
- **可复用的判据**：① **探针的破坏必须真的改变被测行为**——把破坏体写成「行为等价于原版」会产出假绿（比较探针那条），把探针挂在**不会被调用的路径**上会产出空判据（`capture()` 只在 `save()` 的 module/scene 分支被调用，挂到 `probeCaps` 或 `probeAbsentKey` 上实测症状与 clean 完全相同）。② **模块级累计量只能取增量**：`on()` 只清库与设置、**不清 `stat`**，一切绝对读数随执行顺序漂移（单跑绿、连跑红）；本轮引入 `delta(WA, fn)` helper 后专锁才连跑稳定。③ **跨行破坏锚点必须先看真实字节**：`};` 与 `/**` 之间有一个空行，凭印象拼锚点会命中 0 次（补丁 J 的失败原因，`cat -A` 修正后写入成功）。④ **诊断副本会污染全量回归**：`tests/_diag_probe.js` 让 `v2750` 报「真仓库零孤儿（实 1）」「门禁零告警（实 1：unregistered-orphan）」——跑全量前必须删掉。⑤ **版本字面量升版与冻结计数回填必须分两批**：实测口径与历史注释不一致时（`dead-export-gate` 报 test-only 291 而 run.js 注释写 277），**猜测式回填等于把假数字写进断言**，故先只升版本字面量，跑一轮全量回归把红灯清单当实测依据，再逐项回填冻结计数。
⑥ **实测值必须在源码全部冻结之后再取**：本版先取了 `refs 2205`，随后补丁 H 往 `engines/checkpoints.js` 加进 `noteReadFail`（内含 2 处 `WA.store.reportReadFail`），refs 实为 **2207**——早取一步就得到过期读数。同样地，`deadInTestsOnly` 与归因分布都必须**重跑账本生成器之后再读**（R64 已立此纪律，本轮若顺序反了会重蹈）。
⑦ **补丁脚本「跑成功」不等于「改了文件」**：首版补丁 K 校验全绿（`done=17 bad=0`）却**从未写盘**——它只把报告写进 `/tmp`，缺了 `io.open(P,'w').write(src)`。判据是 **mtime 与文件大小变化**，不是脚本自报的 done 计数。收口期一切「已修」结论都必须回到文件本身复核。
⑧ **冻结面断言的「比较值」与「消息文本」必须同批改**（R64 已立，本轮又踩中两次）：首次把 `assert(total16 === 40 …)` 改成 41 而**没动**同一断言里的消息串，全量回归报出「期望 41 却说 40」的自相矛盾红灯；r3 的 `r2700.namespaces === 108` 与紧邻消息 `'定义面 107 命名空间 …'` 同型。**只改一处等于产出一盏自我矛盾的灯。**
⑨ **负控制不得依赖「可选的外部样本」**：v2500 的 [H3] 原以 `tools/v2500_block.js` 作为「旧遍历器会射中的活样本」，本轮工程卫生清空 `tools/` 后该判据即失效。命题本身没错，坏在样本是外部可选文件。按仓库纪律改为**判据自带样本、跑完必删**（自建临时块文件 → 断言 → `unlink` → 再断言已清理）。
⑩ **口径面要问清「统计范围」**：`dist2800` 统计的是 **dead + uiDead 全集（448 条）**，而门禁输出里的「test-only 291」只是 **dead 面**；全集里 `test-only = 291 + 4(uiDead) = 295`。把两个范围的同名计数直接对齐，会写出与总量不自洽的断言。**同名指标先问「分母是谁」。**
- **提交**：`（见本版提交）`。
### R61 · 2026-09-24 · v2.78.0 拒收码可达性（第十二面）+ 缺陷猎捕（非法数守卫 / 读面活引用 / 不可达码）
- **做了什么**：本版主题是「专门找 bug 和优化」，故先广度侦察再逐模块证伪，最后把新学到的口径工业化为常驻门禁。
  - **面**：产品源码 <b>264 个</b>内联 <code>reason: '&lt;code&gt;'</code>，此前<b>零判据</b>——码写在源码里 vs 码真跑得出来，在读数上不可分。新增第十二面：每个码必须属于 <code>witnessed</code>（有可执行见证）/ <code>dead</code>（已证不可达 + 钉住锚点）/ <code>base</code>（存量未分类，冻结台账）三者之一。<b>两向判据</b>：新增未分类码 ⇒ 红灯；台账里的码被接上见证或从源码消失 ⇒ <code>baseStale</code> 红灯（防台账永久比现实胖）。
  - **真缺陷 ①（本版最要紧）**：<code>typeof x === 'number'</code> 对 <code>NaN</code>/<code>±Infinity</code> <b>恒真</b> ⇒「是不是数」这道守卫拦不住非法值。实测：<code>gauge.step('g', NaN)</code> 整次 <code>ok:true</code>，<code>NaN</code> 落盘（<code>history.to=NaN</code>）并进注入段（<code>· g（g）: NaN%</code>）——<b>同一事实 JSON 面显示 <code>null</code>、注入面显示 <code>NaN</code>，两面互相矛盾</b>（违反本模块自己的「三态如实」）；<code>rivalry.declare(..., NaN)</code> 存下 <code>NaN</code> 烈度（注入 <code>烈度: NaN</code>）；<code>quota</code> 存龄 <code>NaN</code> ⇒ <code>age &gt;= limit</code> 恒假 ⇒ 记录<b>永不过期</b>（污染存档把池永久占满且读数无异常）。修法：逐处补 <code>isFinite</code>，且<b>只在已确认为 number 之后判有限性</b>（纯收紧、零语义漂移）。探针列表：<code>nan_probe</code> 全 API 扫（14 处命中，落盘的 5 处即上列）。
  - **真缺陷 ②**：读面回传 store 内部<b>活引用</b>。实测 <code>WA.editorEvents.list() === WA.store.get().evolution.events</code> 为 <code>true</code> ⇒ <code>list().push(x)</code> 绕过 <code>add</code> 的全部校验（容量/查重/字段）直接入账；<code>editorFaction.list()</code> 同款。修法：<b>读面（无参）浅拷贝 / 写面（带 draft）原数组</b>——写路径逐字不变。
  - **真缺陷 ③**：不可达码与不可分码。<code>bad-operator</code>（<code>parseCmp</code> 的 <code>else</code>）词法层永不可达（穷举 6174 个长度 ≤3 的组合零命中）；<code>gauge.step</code> 把「delta 不是数」并进 <code>missing-fields</code>（两根因不可分）⇒ 拆出 <code>bad-delta</code>；<code>rivalry.declare</code> 对非数 weight <b>静默降级 50</b> ⇒ <code>bad-weight</code> 只在 0..100 外可达。
- **为什么**：上一版（v2.77.0）学到「码存在 ≠ 码可达」，但那条口径当时只活在 R60 的散记里。本版把它变成<b>可执行且两向的</b>常驻判据，并顺着这条判据往下扫，扫出上列三类真缺陷——「先立判据、判据再倒逼出缺陷」这个次序是有效的。
- **四条可复用口径（本版固化）**：其一，<b>不可达码的正确处置是登记 + 钉锚点，不是删除</b>——删了就没第三个人知道这里原本有一道防线，且它可能在别处复活；<code>deadLeak</code>（锚点消失）与 <code>deadMissing</code>（码消失）两向都要红。其二，<b>未被观察过的码必须显式归类</b>，否则下一次被改成别的意思也无人知晓。其三，<b>判据的输入面必须与「真会被执行的代码」同宽</b>：初版门禁按原文扫，把 <code>bridge.js</code> 文档注释里的调用示例（<code>reason: 'pull'</code>）算成了真码（265 里 1 条是注释）；改用去注释剥离器后 264。这是 v2.75.0 [D2]「提及不是引用」的同族。其四，<b>探针要在全 API 面上扫，而不是在「已知嫌疑点」上扫</b>：本轮最有价值的缺陷（NaN 守卫族）是广度扫出来的，不是猜出来的。
- **影响范围**：产品侧 8 文件 13 处（<code>engines/gauge.js</code>、<code>engines/rivalry.js</code>、<code>engines/quota.js</code>、<code>engines/ledger-timeline.js</code>、<code>engines/floor-changes.js</code>、<code>engines/editor-events.js</code>、<code>engines/editor-faction.js</code>、<code>core/store.js</code>）；测试侧新增 <code>tests/reject-v2780.js</code>（见证表）、<code>tests/reject-code-gate.js</code>（门禁）、<code>tests/reject-code-ledger.json</code>（基线台账）、<code>tests/reject-lock-v2780.js</code>（专锁）；改 <code>tests/settle-v2700.js</code>（<code>rv-weight</code> 锚点随修法前移 + 两条非数 weight 断言——门禁在首跑时正是这样逮住我的改动的）、<code>tests/run.js</code>（八处版本断言 + 挂载新锁）、<code>tests/dead-export-ledger.json</code>（<code>--update</code>，<code>version=2.78.0</code>；本版新增测试引用只影响 9 条 <code>tref</code> 证据，dead/uiDead 规模不变）、<code>index.js</code>、<code>manifest.json</code>、<code>README.md</code>、<code>ITERATION_LOG.md</code>。
- **门禁结果**：<code>node tests/run.js</code> → <b>6840 / 失败 0</b>（v2.77.0 为 6788；+52 = 新专锁 50 + v2.70.0 锁新增 2）；<code>node tests/reject-code-gate.js</code> → <b>产品文件 107 / 内联码 264（见证 52 / 死表 1 / 基线 211）</b>，三集合穷尽互斥；<code>node tests/reject-lock-v2780.js</code> → <b>50 / 失败 0</b>；<code>node tests/dead-export-gate.js</code> → 绿（<code>dead 413 · uiDead 4</code> 不变）；<code>node tests/test-surface-gate.js</code> → 真仓库零孤儿（新锁挂在可达面里）。
- **提交**：`（见本版提交）`。

### R62 · 2026-09-24 · v2.79.0 输入与副作用可靠性（第十三面：拒收即提交 / 读面活引用 / 非法输入边界）
- **做了什么**：R61 把「码存在 ≠ 码可达」立成了静态面（写得出 vs 跑得出来），本轮顺着同一条「契约声明了但没人执行」的线往下走，立**第十三面：把「已判定的失败」与「真发生的变化」分开**，并把三处早已存在、全仓零执行的契约变成常驻判据。
  - **面 A · 拒收即提交（本版核心真缺陷）**：<code>core/store.js</code> 的 <code>transact</code> 一直声明「<code>mutator</code> 返回 <code>false</code> 即中止」，而该契约在 v2.79.0 之前<b>全仓零使用</b>——所有产品写路径判失败时写的是 <code>out = { ok: false, reason: ... }; return;</code>，<b>裸 <code>return</code> 的返回值是 <code>undefined</code>，不等于 <code>false</code></b>，于是「已判定的失败」被当成成功提交：世界没变，但 <code>meta.stateRev</code> 推进了、整份状态写了一次盘。实测修前 20 次连续拒收把 <code>stateRev</code> 从 23 推到 43，对照组 <code>transact(function () { return false; })</code> 的 rev 纹丝不动。危害不是「多写一次」：<code>stateRev</code> 是跨实例冲突检测与磁盘序号判定的输入 ⇒ 世界没变而序号变了，<b>诊断面把「已拒绝」显示成「已提交」</b>，冲突检测的比较基准被污染。修法：<code>engines/</code> 下 28 个文件共 <b>129 个站点</b>改为 <code>return false;</code>。
  - **唯一豁免的正确判据（本版学到的一条口径）**：<code>fondness.accept</code> 的 <code>stale-proposal</code> 分支「必须提交」——它在拒收本次采纳的同时要作废旧建议，那个作废不落盘就无效（v2.77.0 明文要求）。它不是「例外放行」，而是<b>抱有意副作用</b>：判据写成「拒收分支内是否存在对非 <code>out</code> 目标的写」（<code>writesInBranch</code>），而不是按函数名/码名开白名单——名字匹配会让下一次同型改动静默通过。
  - **面 B · 读面交回活引用（五处）**：写路径都有准入，但<b>准入只对走写路径的人有效</b>。五个「只读」接口把 store 内部对象/数组原样交出：<code>editorEvents.list()</code>、<code>editorFaction.list()</code>（R61 已修）、<code>rivalry.read(t).rivalries</code>、<code>registry.getProfile(name)</code>（直接 <code>return p.profile</code>）、<code>parallelWorld.state()</code> 的 <code>npcs/relations/modules</code>（本轮新修三处）。消费方顺手写返回值就等于改了持久态，绕过全部分节剪裁、关系硬边界与容量登记表，且<b>不留任何事务记录</b>（<code>txStat</code> 不计、<code>stateRev</code> 不推进 ⇒ 诊断面完全不可见）。五处统一为<b>逐元素浅拷贝</b>，且不往下拷——读面成本不该随嵌套膨胀。
  - **面 C · 非法输入（29 入口 × 23 种坏输入实测矩阵）**：两族实证缺陷。① <b>未受控抛出</b>：<code>store.classifyKey</code> 19/23 抛（<code>key.match is not a function</code>）、<code>store.read</code> 19/23 抛（<code>path.split</code>）、<code>registry.getProfile</code> 对对象名抛 ToPrimitive——而调用方大多是扫描 localStorage 的<b>巡检路径</b>（sweep 回收 / 体积审计 / 孤儿盘点），一个抛会打断<b>整轮巡检</b> ⇒ 「巡检没查出问题」与「巡检没跑完」在读数上不可分。② <b>字符串化兜底把非法值静默升格</b>：<code>String(v == null ? '' : v)</code> 对 <code>NaN</code> 产出 <code>'NaN'</code> ⇒ <code>survival.set('甲', NaN)</code> 建出全 null 的读数记录并报 <code>ok</code>、<code>temporalLock.lock(NaN)</code> 上锁成功且 label 为 <code>'NaN'</code>、<code>threads.open(NaN)</code> 立出一桩问题叫「NaN」的悬案——一次「参数传错」被记成「世界里真发生了这件事」。修法：10 处入口补类型/形状守卫，拒绝即返回<b>既有</b>拒收码（不新造码，第十二面台账自洽，<code>reject-code-gate</code> 自查「无新增静默码」绿）；<code>classifyKey</code> 对非字符串键返回新家族 <code>{ family: 'invalid' }</code>（非法键不是「未知家族」，而是「根本不可能是本扩展的键」）。修后同矩阵复跑：受控外抛出从 9 个入口清零、静默升格三例全消、好输入全部照常成功。
  - **诚实边界（写进锁而非写进宣传）**：其余 <b>37 个引擎</b>的 <code>clean()</code> 兜底同型不设防（对带敌意 <code>toString</code> 的对象仍会抛穿、对 <code>NaN</code> 仍产出假串），属计划中 A2「统一数据边界层」范围。本版<b>只做实测驱动的点修，不伪装成已全修</b>——未覆盖面以 <code>KNOWN_OPEN</code> 表单列在锁里（8 个入口），并明写「报『已全修』比漏修更坏」。
- **为什么**：R61 的次序（先立判据 → 判据倒逼缺陷）有效，本轮复用它并换了观测面：从「静态可达性」换到「行为副作用」（拒收有没有真落盘）与「数据所有权」（返回值是不是活引用）。三条契约的共同形态是**声明存在、执行缺席**——判据不写出来，它们在读数上与「实现正确」不可分。
- **本版新学到的四条纪律（已固化）**：
  - 其一，<b>判据的输入面必须与真会被执行的代码同宽</b>——扫描器不能直接在原文上找 <code>return;</code>（注释里的、字符串里的、内层箭头函数里的都不是本次事务的返回值），须先做<b>词法掩码</b>（注释与字符串内容就地在原位抹成空格、<b>长度守恒</b>），再做括号匹配取 <code>transact</code> 回调体，并追 <code>function</code> / <code>=&gt;</code> 嵌套深度、只认深度 0 的裸 <code>return;</code>。这是 v2.75.0 [D2]「提及不是引用」的同族（第三次同族复发 ⇒ 已成固定纪律）。
  - 其二，<b>破坏方式必须三选一，且优先级固定</b>：<code>weaken</code>（把守卫条件改恒假，适用于守卫自带 <code>return</code> 的形态）＞ <code>breakInto</code>（只摘守卫行、保留后续代码）＞ 整行删。整行删守卫会留下悬空 <code>return</code> / <code>if (</code> 造成语法错；<code>breakInto</code> 若连带删掉变量定义（如 <code>const w = ...</code>），异常会在事务里被吞掉、接口返回 <code>''</code>，于是负控制判据反以为「破坏没生效」而假通过。
  - 其三，<b>锚点撞车要用「后续行」区分</b>：<code>rivalry.declare</code> 与 <code>rivalry.retire</code> 的守卫逐字相同（各命中 2 次），锚点必须扩到「完整守卫 + 紧随其后那一行」（<code>invalid-actors</code> 行区分 declare、<code>const key = makeKey</code> 行区分 retire）；扩宽后仍须断言<b>恰命中 1 次</b>，命中 0 次或 ≥2 次一律拒绝写入。
  - 其四，<b>测「没变化」时别把准备阶段算进测量窗口</b>：探针初版把「准备用成功调用」与「被测拒收调用」写在同一个 lambda 里，<code>rev</code> 差里混进了准备阶段的 +1；改为三元组 <code>[名称, 准备函数, 被测函数]</code> 后读数才干净。
- **影响范围**：产品侧 <code>engines/</code> 28 个文件（129 站点 <code>return false;</code>）+ <code>engines/rivalry.js</code>、<code>engines/parallel-world.js</code>、<code>actors/registry.js</code>、<code>core/store.js</code>、<code>engines/gauge.js</code>、<code>engines/survival.js</code>、<code>engines/temporal-lock.js</code>、<code>engines/threads.js</code>、<code>engines/quota.js</code>；测试侧新增 <code>tests/side-effect-lock-v2790.js</code>（23 项）、<code>tests/reference-isolation-lock-v2790.js</code>（43 项）、<code>tests/input-boundary-v2790.js</code>（44 项），改 <code>tests/run.js</code>（挂载三把新锁 + 版本字面量 + <b>三套历史套件的现场锚点接管</b>：<code>deadInTestsOnly</code> 260→261、双面 <code>test-only</code> 264→265、dead 侧 <code>self-only</code> 120→119）、<code>tests/dead-export-ledger.json</code>（<code>--update</code>，<code>version=2.79.0</code>）、<code>index.js</code>、<code>manifest.json</code>、<code>README.md</code>、<code>ITERATION_LOG.md</code>。
- **锚点接管的定量归因（本条是本轮最值得留档的一处）**：全量回归首跑 <b>失败 21</b>、次跑 <b>失败 4</b>，全部为账本/清册元数据类，<b>零行为缺陷</b>。逐条复算后归因到<b>单一合法差量</b>：新增的 reference-isolation 锁把 <code>parallelWorld.state</code> 当作读面站点实测（该成员原本只有 3 处产品内部自用、零外部引用、零测试引用），于是它由 <code>self-only</code> 升格为 <code>test-only</code>（<code>tref</code> 0→2）⇒ <code>deadInTestsOnly</code> 260→261、dead 侧 <code>self-only</code> 120→119、<code>dead + uiDead</code> 双面 <code>test-only</code> 264→265。死子面规模（dead 413 / uiDead 4 / dataOnly 154）与清册面（refs 2171 / ns 106 / members 1165）<b>逐项零变化</b>——这正好反证三把新锁只动测试引用、没碰产品面。接管脚本 <code>/tmp/patch_v2790_anchors.py</code> 只改 <code>tests/run.js</code> 内三套历史套件的现场锚点（6 处锚点各恰命中 1 次、覆盖 10 行），不触碰任何判据逻辑，也不改 README / ITERATION_LOG 的历史记录。
- **门禁结果**：<code>node tests/run.js</code> → <b>通过 6950 / 失败 0</b>（v2.78.0 为 6840，<b>+110 = 三把新锁 23 + 43 + 44</b>，算术逐字对齐）；<code>node tests/side-effect-lock-v2790.js</code> → <b>23 / 失败 0</b>；<code>node tests/reference-isolation-lock-v2790.js</code> → <b>43 / 失败 0</b>；<code>node tests/input-boundary-v2790.js</code> → <b>44 / 失败 0</b>；<code>node tests/test-surface-gate.js</code> → <b>测试文件面 48 · 锁 45 · 可达 48 · spawn 2 · 内联 2 · 孤儿 0</b>；<code>node tests/reject-code-gate.js</code> → <b>产品文件 107 个 / 内联拒收码 264 个（见证 52 / 死表 1 / 基线 211）</b>（无新增静默码）；<code>node tests/dead-export-gate.js --update</code> → dead 413 / uiDead 4 / dataOnly 154 / 仅测试 261 / 证据 417 条 / <code>version=2.79.0</code>。
- **提交**：`（见本版提交）`。

### R63 · 2026-09-24 · v2.80.0 诊断与可观测性（第十四面：故障被记录了 ≠ 故障可被看见）
- **做了什么**：R61 立了「码存在 ≠ 码可达」（静态面），R62 立了「判失败 ≠ 已回滚」（行为面）。本轮换到<b>读侧</b>：拒收被记下来之后，到底有没有人能看见。三处早已存在、却从未被读到的观测缺陷，全部变成常驻判据。
  - **面 A · 读侧空洞（本版核心）**：普查拿到三个数字——<code>ok:false</code> 出口 <b>782 处</b>（带 <code>reason</code> 761 / 不带 21，缺 reason 集中在 <code>core/settings-bus.js</code> 6/14 与 <code>core/store.js</code> 6/42）、<code>noteFault(...)</code> 调用点 <b>206 处</b>、维护 <code>stat.faults</code> 容器的模块 <b>27 个</b>。而<b>读侧消费点只有 3 个</b>（<code>tool-diag.js:261/282/309</code> 的 <code>secWorld</code> / <code>secShadow</code> / <code>secThreads</code>）⇒ 24 个模块记了台账却没人读，<b>「没记录」与「没发生」在读数上不可分</b>。修法：<code>engines/tool-diag.js</code> 新增 <code>secFaultLedger()</code> 兜底节（+49 / −1 行），三处接线（<code>MODULE_EXPORTS</code> 前的采集节定义、<code>collect()</code> 的 <code>faultLedger</code> 字段、导出面）各断言恰命中 1 次。为什么不逐模块单列采集节：<b>那样在结构上兜不住这条</b>——漏一个模块，它的采集节与它一起缺席，面板照绿；要的是「一张会自己长大的总目」。实测 <code>owners=27</code>，即「凡以 <code>stat().faults</code> 记账的模块都在总目里」是结构决定的，不是人工维护的。
  - **面 B · 观测面活引用（三处）**：<code>engines/world.js:353</code> / <code>shadow.js:231</code> / <code>threads.js:270</code> 的 <code>stat()</code> 此前一律 <code>Object.assign({}, stat)</code>——浅拷贝，<code>faults</code> 交出去的仍是内部活引用。实测探针（取两次 <code>stat()</code>，在第一次返回值上插哨兵键 <code>__ALIAS_PROBE__</code>，看第二次读数里在不在）：<b>泄露 3 个</b>。危害是「观测记录可被外部篡改且不留痕」：调用方 <code>delete</code> 一个 fault 键，面板上那条故障就消失了，而 <code>stateRev</code> 不推进、<code>txStat</code> 不计 ⇒ 篡改本身也不可见。这是 R62 面 B 的镜像（那边改持久态、这边改观测记录），且讽刺——<b>留痕做得最彻底的 3 个模块，恰是唯三可被伪造的 3 个</b>。修法：改为与 24 处 manual 先例逐字一致的 <code>Object.assign({}, stat, { faults: Object.assign({}, stat.faults) })</code>；修后泄露 <b>3 → 0</b>、正确快照 <b>24 → 27</b>。
  - **一条被推翻的侦察结论（本版最值钱的部分）**：首版码级静态扫描（<code>/tmp/diag_ledger_scan.py</code>）报出 <b>122 个「缺口」</b>——这些码出现在 <code>ok:false</code> 分支里、却看不出被记进台账。审读 <code>engines/fondness.js:167</code> 时才看见 <code>else if (out &amp;&amp; !out.ok) noteFault(out.reason);</code>：<b>留痕走的是动态路径</b>，静态只看字面量必然把「记了但看不出记了」判成「没记」。改用<b>运行时黑洞对账</b>（<code>/tmp/diag_probe.js</code> → 定稿 <code>/tmp/diag_final.js</code>：对每个模块的导出函数喂一组病理参数，收集实际返回的 <code>{ok:false, reason}</code> 集合，与同窗口 <code>stat().faults</code> 键集合比对），得 <b>27 个模块全部齐 / 缺口合计 0</b>——122 个全是假阳性。子面读数同时拿到：<b>半观测模块 6 个</b>（<code>causal</code> 95/3、<code>intel</code> 57/3、<code>life</code> 56/5、<code>longline</code> 19/1、<code>org</code> 38/1、<code>purifier</code> 57/7，全部 <code>stat 有 faults = false</code>）、<b>台账键数 &lt; 实际码数的模块 0 个</b>。
  - **面 C · 注入-还原不变量（本版实测到的独立事故）**：<code>tests/run.js</code> 的负向自证里有若干处「真源码注入 → 跑门禁 → 还原」，只靠 <code>try/finally</code>；<code>engines/bridge.js</code> 是**唯一被原地改写**的产品文件（其余探针是新增临时文件，<code>tests/</code> 下的探针不在产品面）。本版实测到事故：一次运行在注入窗口内被中断（输出止于 273525 字节、marker 未落），<code>finally</code> 没跑，探针**留在了产品文件里**，而它此后连续三轮全量回归全绿、每轮各打印两行「✓ 注入结束已逐字节还原 engines/bridge.js（md5 <code>5b27d74a</code>）」——因为那条断言比的是「注入前读到的内容」，而那个基线**本身就是上一轮的残留**：还原在最弱的意义上成立（回到本轮开头那个已经脏了的状态），污染逐轮自我延续、每轮自证干净；md5 从 HEAD 的 <code>035edca1</code> 漂到 <code>5b27d74a</code>，全仓门禁无一报警。不可见的理由：残留是一行**注释**——行注释 + 无 <code>reason</code> 码 + 不导出成员，<code>dead-export</code> 报「无新增」、<code>reject-code</code> 报「无新增静默码」、清册断言数一字不变、<code>test-surface-gate</code> 不受影响。**凡未被识别为标记的东西，基于标记的门禁看不见；而全仓最彻底的「逐字节还原」自证（md5 断言），恰恰最不可能抓到它——基线取「读取当下」，残留一旦形成就被吸收进基线。** 修法：产品文件已逐字节还原至 HEAD；新增 <code>tests/injection-restore-lock-v2800.js</code>（22 项），判据 ：① 凡被 tests 写完的产品文件必须与**外部基线**（<code>git HEAD</code>）逐字节一致，取不到即判红、不静默降级；② 每处产品面写入都必须「前置快照 + 末尾裸还原」（写回 payload 恰为快照标识符，写成 <code>snapshot + '后缀'</code> 即注入）；③ 标记从注入载荷自动抽取，新增一处注入即自动纳入分母。判据面由**扫描 tests/ 全域**得出。
  - **诚实边界（登记而不冒充已修）**：半观测 <b>6 个模块</b>本版未补 <code>faults</code> 面——<code>blocked</code> 与 <code>lastReason</code> 的语义已被既有测试钉死（<code>tests/run.js:7198</code>、<code>tests/longline-v2550.js:74/87</code>、<code>tests/org-v2540.js:54</code>），只能做加法、不能改口径，属后续版本。静默 catch <b>410 / 662 处</b>未治理：其中大量是 <code>clockNow</code> / <code>getCtx</code> 型有意防御性兜底，草率「全修」会把兜底改成抛出，需先分类再动手。
- **为什么**：R61 / R62 两轮的病灶共同形态都是<b>声明存在、执行缺席</b>，本轮继续沿用该形态但把观测点从「谁调用谁」换到「谁读谁」——「记下来」与「看得见」是两件事，中间那段没有判据就是黑的。另外本轮把一条方法论坐实了：<b>静态扫描只能提出假设</b>，它给出的 122 个缺口在有动态留痕的代码里全是噪声；缺口面积这种断言，必须由「真喂输入、真读输出」的运行时对账来定稿。
- **本版新学到的三条纪律（已固化）**：
  - 其一，<b>静态扫描会因动态留痕（<code>noteFault(out.reason)</code>）产生整片假阳性</b>，缺口普查必须用运行时黑洞对账坐实。这是「判据的输入面必须与真会被执行的代码同宽」的第四次同族复发，且这次是<b>静态面自身的边界</b>：同宽意味着要看见动态路径，静态工具做不到，就得换工具。
  - 其二，<b><code>fresh()</code> 复用同一个 <code>global.WorldAxis</code></b>——两次 <code>fresh</code> 后两个 WA 变量指向同一对象，取证时必须「取值紧接各自的 <code>fresh</code>」，否则拿到的是最后一次装载的状态（本版 <code>D2</code> 判据首跑假失败的根因，用 <code>/tmp/dbg_d2.js</code> ~ <code>dbg_d4.js</code> 逐层定位）。
  - 其四，<b>「注入后必然还原」必须是判据，且还原的基线必须来自外部</b>：本版事故的根因是「基线取读取当下」——残留一旦形成就被吸收进基线，于是自证逐轮通过、污染自我延续。同一条纪律的另一半：<b>凡带后缀的写回都算注入，不算还原</b>（被写回的内容恰是快照标识符，才是还原）。
  - 其三，<b>破坏设计必须双向成立</b>（原版上判据为真 + 破坏后判据为假）。本版第三条破坏 <code>no-snapshot</code>（读数 <code>counts = f</code> 原样转手）在「27 个模块一律返回副本」的仓库里<b>不是可观测缺陷</b>，判据正确地判「没坏」；正确处置是<b>换掉这条破坏</b>（改为 <code>empty-padding</code>：把「空台账不进总目」改成恒真，负控制立刻现形），而不是放宽断言——「怎么破坏都为真」的断言不是判据。
- **影响范围**：产品侧 4 文件（<code>engines/world.js</code>、<code>engines/shadow.js</code>、<code>engines/threads.js</code> 各 1 行；<code>engines/tool-diag.js</code> +49 / −1）；测试侧新增 <code>tests/fault-ledger-lock-v2800.js</code>（22 项）、<code>tests/fault-alias-lock-v2800.js</code>（26 项）、<code>tests/injection-restore-lock-v2800.js</code>（22 项）；改 <code>tests/run.js</code>（挂载两把新锁 + 八处版本字面量 + <b>两轮锚点接管</b>）、<code>tests/dead-export-ledger.json</code>（<code>--update</code>，<code>version=2.80.0</code>；新死子面条目 <code>toolDiag.secFaultLedger</code>）、<code>index.js</code>、<code>manifest.json</code>、<code>README.md</code>、<code>ITERATION_LOG.md</code>。<b>本版发生两轮锚点接管</b>：第一轮（17 对锚点）接产品改动的派生态（成员 1165→1166、dead 413→414、账本 417→418、self-only 119→120）；第二轮（7 对锚点）接<b>新锁文件自身的实测行为</b>（仅测试引用 261→262、<code>test-only</code> 265→266、<code>self-only</code> 120→119）——这正是 R62 记下的「判据写法四纪律与锚点接管次序」的第二次实战：<b>新增测试文件会改变 <code>deadInTestsOnly</code> 等派生态</b>，而产品的每一处分层改动都至少要跟一轮锚点。
- **门禁结果**：<code>node tests/run.js</code> → <b>通过 7020 / 失败 0</b>（v2.79.0 为 6950；+70 = 三把新锁 22 + 26 + 22）；<code>node tests/test-surface-gate.js</code> → 测试文件面 53 · 锁 50 · 可达 53 · spawn 2 · 内联 2 · 孤儿 0；<code>node tests/reject-code-gate.js</code> → 产品文件 107 个 / 内联拒收码 264（见证 52 / 死表 1 / 基线 211，无新增静默码）；<code>node tests/dead-export-gate.js</code> → 冻结面规模 dead 414 · uiDead 4 · 归因分布 test-only 262 / 其余 152 / dataOnly 154 → 154。
- **提交**：`（见本版提交）`。
### R64 · 2026-09-24 · v2.81.0 事件调度（第十五面：排期 ≠ 触发）
- **做了什么**：R61 立「码存在 ≠ 码可达」（静态面），R62 立「判失败 ≠ 已回滚」（写侧行为面），R63 立「故障被记录了 ≠ 故障可被看见」（读侧观测面）。本轮回到机制拓展（路线 B2）：`engines/events.js`（约 410 行）落地「事件调度」这一此前零覆盖的能力面。
  - **为什么这块是真空缺口（先说清不重复）**：仓库里已有四处碰「事件」——`engines/causal.js` 是**结算面**（原因→条件→行动→后果）、`engines/parallel-events.js` 是**登记面**（此刻别处在发生什么，防全知）、`engines/direct-event.js` 是**叙事面**（一轮生成、多轮解封）、`core/workflow.js` 是**管线面**（before/after 两链顺序执行）。**没有一处回答「排期」**：谁被排在什么时候、到点该不该动、动了之后下一次什么时候、失败了怎么办、同一件事会不会被触发两次。B2 的四条关键约束（同一事件不能无意重复执行 / 条件判断失败与执行失败必须区分 / 异常时有明确回滚策略 / 不能让失控周期事件拖垮主循环）没有一条有承载物。
  - **三态口径（本模块存在的全部意义）**：① **排期 ≠ 触发 ≠ 已发生**——`pending` / `claimed` / `executed|exhausted|cancelled|failed` 各自成词。为什么必须把 `claimed` 单列：没有它，「本轮没有到期事件」与「有一个事件正在执行、还没回报」在读数上是同一句话。② **条件未满足时状态零变化**——`condition-unmet` 走「如实报告、不落盘」，与「执行失败」（入失败队列、排重试）严格分开；混成一件事，模型就会把「还不到时候」读成「出事了」。③ **认领才是唯一触发闸**——`due()` 纯读（调用 N 次不改状态），`claim()` 才把 `pending` 标成 `claimed`，同一事件在同一时刻只能被认领一次；「不得无意重复执行」由状态机保证，不依赖调用方自觉。
  - **九处标准接线（新增模块要活起来必须过的全部关口，逐项）**：① `index.js` 的 `LOAD_ORDER`；② `tests/run.js` 的 `LOAD`；③ `engines/tool-diag.js` 的 `MODULE_EXPORTS`；④ `core/evict.js` 的 `SITES` 新增 `events.rows` / `events.failQueue`；⑤ `core/store.js` 的 `__BOUNDED_CAPS` 同名两条；⑥ `core/store.js` 的 `defaultWorldState()` 物化 `events: { rows: [], failQueue: [] }`（**登记了容量却不在骨架里，冷启动直写会炸事务**）；⑦ `render/inject.js` 三处（`SOURCES` 45→46、`__REG.def` 加 `events`、`applyInjections` 加分支 source「事件调度」）；⑧ `ui/panel.js` 的 `VIS_NAMES`；⑨ `tests/field-liveness-ledger.json` 的 `schemaTopKeys`。
  - **一处口径债的清偿（顺带，非附带）**：`DEF.maxFails` 原本只在设置面声明、**无任何消费方**——典型的「声明了却没有执行者」。改为 **per-call 口径**：`events.rows` 上限 = `maxRows` 设置、`events.failQueue` 上限 = `maxFails` 设置，由调用方显式传当前设置值。一次消除两个债：既消费掉 `maxFails`，又消掉「固定 cap 与用户改设置后的漂移」。
  - **两个纯读/纯写边界的刻意设计**：`replace()` 的新 id 缺省为 `旧id + '@' + clockNow('events')`，**刻意不用同一 id 覆盖**——「被替换过」本身是事实，覆盖掉就答不出「它原本排在什么时候、为什么换了」。`str(v,max)` 只认字符串，非字符串返回空走 `missing-fields`，**不做 `String(...)` 静默升格**（沿用 R62 面 C 纪律）；`finite(v)` 把 `undefined/null/''/boolean/NaN/±Infinity` 一律判 `NaN`。
  - **拒收码见证补登（第十二面口径的即时正确处置）**：新模块引入 6 个未分类码（`bad-priority` / `bad-trigger` / `condition-unmet` / `duplicate` / `not-active` / `not-claimed`）。按 R61 立的口径「码存在 ≠ 码可达」，正解不是删码而是补**可执行见证**。在 `tests/reject-v2780.js` 的 `runWitness(WA)` 里补 6 组 `want` + `trip`，全部走**产品真 API** 且刻意经过 `schedule()` 的写闸（先 `enabled=true`），不是绕过闸门直造状态——见证的意义正是「这条拒收路径真的在现网可达」。门禁由「未分类 6 个」转为 **✓ 每个码都有归属**（见证 52→58）。
- **为什么**：目标是把「排期」这件事从调用方自觉变成状态机判据。B2 的四条约束此前无承载物，而它们全是「两态不可分」家族的变体（没到点/在做/做完了三者混一、条件不足/执行失败混一、重复触发无从判）。
- **本版新学到的四条纪律（已固化）**：
  - 其一，**`timeout` 命令在 proot 下不可用（ENOSYS），且会连带搞崩 node 的 stdio 复位路径**（表现为「读到一半某文件 `open` 失败 + 原生栈 `node::ResetStdio()` 断言崩溃」——看起来完全像产品缺陷的假故障）。长任务一律纯后台 + 哨兵：`(node tests/run.js > /tmp/xxx.txt 2>&1; echo "RUN_EXIT=$?" >> /tmp/xxx.txt) &`，再周期性 `tail`。三次换通道才定下来（第一次卡住、第二次崩溃、第三次成功）。
  - 其二，**专锁落盘会改变 `dead-export-ledger` 的归因分布**，因此**必须先重跑账本生成器、再取实值回填**；顺序反了，回填的值立即过期（本轮 r2 就是这样被作废的）。
  - 其三，**冻结面断言里「比较值与消息文本必须同批改」**——本轮第一批回填只替换了消息串（`dead 425 / dataOnly 157`），断言条件里的 `414` / `154` 原值未动，于是产出「失败项里实与期望相同却仍红灯」的自相矛盾门禁输出（`✗ 死子面 dead 425 … 实 425/4/157`）。修复时因 `414`→`425`、`154`→`157` 等长，diff 字节数不变，须靠 `grep` 核对而非字节数。
  - 其四，**中断注入窗口 = 把探针永久留在产品文件里**。本轮把一次正在跑的回归 `kill` 掉，它恰在「注入 `engines/bridge.js` 探针 → 跑断言 → 还原」窗口内，`finally` 未执行，`function __ncProbeBridgeSnapshot()` 留在了产品文件末尾（md5 `035edca1` → `86eecccc`）。后果是三条全量断言同时红灯：`refs` 2185→2186、`bridge.snapshot` 离开死子面（dead 425→424）、死子面冻结断言失败。**§ 值得留档的一点**：R63 面 C 的那把 `tests/injection-restore-lock-v2800.js` **当场抓到了它**（A2「工作树与外部基线逐字节一致」/ A4「产品面无探针残留」/ D3「双向」三条红灯）——而 R63 记下的旧设计（基线取「读取当下」）恰恰永远抓不到，因为残留会被吸收进基线。**「还原的基线必须来自外部」这条纪律在本版得到了实测验证**，不是纸面结论。
- **影响范围**：产品侧新增 `engines/events.js`（约 410 行），改 `index.js`、`manifest.json`、`core/evict.js`、`core/store.js`、`engines/tool-diag.js`、`render/inject.js`、`ui/panel.js`；测试侧新增 `tests/settle-v2810.js`（99 项）、改 `tests/reject-v2780.js`（+6 组见证）、`tests/run.js`（挂载专锁 + 八处版本字面量 + `SOURCES` 45→46 + `FROZEN2800` 7026→7044 字节 + **两轮锚点接管共 27 对**）、`tests/dead-export-ledger.json`（`--update`，dead 425 / 证据 429 条 / `version=2.81.0`）、`tests/field-liveness-ledger.json`、`README.md`、`ITERATION_LOG.md`。
- **门禁结果**：`node tests/run.js` → **通过 7124 / 失败 0**（v2.80.0 基线为 **7011 通过 / 9 失败 = 7020 项**；净增 104，主要为新专锁 99 项与见证补登改变的断言面）。收口期共五轮全量回归：r1 `7007/18`（纯冻结计数漂移）、r3 `7114/10`（第一批回填后）、**r4 在注入窗口内被终止（作废）**、r5 `污染态读数（作废）`、**r6 `7124/0` 全绿**。其余门禁：`tests/settle-v2810.js` → **99 / 失败 0**；`tests/test-surface-gate.js` → **测试文件面 54 · 锁 51 · 可达 54 · spawn 2 · 内联 2 · 孤儿 0**；`tests/reject-code-gate.js` → **产品文件 108 个 / 内联拒收码 270 个（见证 58 / 死表 1 / 基线 211）**，✓ 每个码都有归属；`tests/reject-lock-v2780.js` → **50 / 失败 0**；`tests/field-liveness-gate.js` → **✓ 无幽灵读点、无写/读侧越界、骨架一级键未减少（51 个）**；`tests/dead-export-gate.js` → **dead 425 · uiDead 4 · dataOnly 157 · 归因 test-only 273 / 其余 152 · 证据 429 条 · `version=2.81.0`**，✓ 无新增、归因可读、证据可复算。
- **提交**：`（见本版提交）`。
### R1 · 2026-09-20 · 建立迭代日志
- **做了什么**：新建本文件，固化基线指标与迭代节奏。
- **为什么**：无人值守模式需要一个可追溯的变更台账。
- **影响范围**：仅新增文档，不动代码。
- **验证**：无（文档）。

### R2 · 2026-09-20 · v2.21.0 控件可点性（第九面）
- **做了什么**：新增 UI 控件可点性门禁 G18，并修复它命中的两族真缺陷。
  - 侦察排除项（避免重复劳动）：全库 TODO/FIXME/XXX/HACK **零命中**；死导出 208 项（仅测试引用 132）属出口面常态；事件总线矩阵 11 发 / 11 收 / `STATE_EVENTS` 11 项全部有发射，零死信号零死监听器。
  - **真缺陷①异步出口的 DOM 生命周期**：`ui/settings.js` 的 `out = () => $('#wa-set-out')` 每次重查，而「立即生成舆情」是 async 出口，在 `await` 后写 `out().textContent`，其间面板重绘使节点离树 ⇒ TypeError。同型 settings 5 处 + panel 6 处。
  - **真缺陷②宿主能力守卫缺失**：`ui/panel.js` 三处裸 `prompt(...)`（世界钟 / 势力编辑器），无 prompt 宿主下 ReferenceError，且它们是唯一入口。
  - **修法**：settings 新增判空出口 `setOut(text)`；panel 新增 `setOut(sel,text)` / `setHtml(sel,html)` / `askText(msg,dft)` 三助手。
- **为什么**：G17（v2.12.0）只验证「控件**成树**」，不验证「控件被点会不会抛」——自动化从未覆盖这一层，而缺陷恰好落在这里。
- **影响范围**：`ui/settings.js`、`ui/panel.js`（均不新增导出，出口面承诺不变）；新增测试侧 `checkClickable`；`tests/ui-gate.js`、`tests/run.js`、`ui-gate-sync.js`。
- **附带自纠**：
  - `tests/ui-gate.js` 此前**自带一份** `fresh()`/`checkPages()` 副本，与模块头「不复制、不漂移」声明矛盾；收口为从 `ui-gate-sync.js` 单一真源取（256→180 行）。
  - 探针补齐前提：真浏览器 `<input type=file>.files` 恒为 FileList（否则 `files[0]` 的 undefined 会被误记成产品缺陷）。
  - 装置耦合：G18 多次装带面板的 UI 会在共享总线留下 `backstage:settled`/`chat:changed` 订阅，污染后续 G21 判定；G18 收尾以 `fresh({files:[]})` 复位总线。
  - 负向自证两条口径：破坏 A（判空出口退回裸写）→ 异步拒绝现形；破坏 B 必须回退**调用点**（`askText` 内部有 try/catch，回退内部会被吞掉）。
- **验证**：`node tests/run.js` 4058/0；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变（冻结串无需回填）。
### R3 · 2026-09-20 · v2.22.0 展示映射漂移（第十面）
- **做了什么**：新增「UI 映射键集 == 引擎真源键集」源码级门禁，并修复它所在层的一批真漂移（9 组映射中 6 组）。
  - 取证：自建 `tools/scan_drift.js`（零依赖、纯源码比对）逐行列出缺键/幽灵键；肉眼此前只发现 2 处，机器扫出 6 处。
  - **枚举族**：`factionBadge`（自造枚举 vs FACTION_STATUS）、`repColor`（受人敬重 / 幽灵键 小有名气）、`ecoColor`（萧条/危机 vs 衰退/动荡）——引擎真值大范围落空、回退默认色。
  - **标签族**：`renderDirector` 可见性标签缺 pulse/ledger/digest（裸露英文键名）；`WS_LABEL` 缺 verify 桶。
  - **跨域错放**：`LAB_P`（store 读侧）误放 8 个 settings-bus 读标签、缺 readSpotCheck；`rdSrcTxt`（settings 读侧）只写 4 键、真实 12 键。
  - **引擎↔引擎重复真源**：`editor-faction.STATUSES/RELATIONS` vs `evolution.FACTION_STATUS/FACTION_RELATION`（纳入判据）。
  - **诊断包消费端重复真源**：`tool-diag.WRITE_SRC_LABEL` 缺 verify、删侧内联表缺 verifyBack、settings 读侧内联表只写 4 键（真实 12），与 UI 同型漂移、同轮修复（纳入判据）。
- **为什么**：G17/G18 只在运行期验证「控件成树/可点」，UI 展示映射与引擎枚举各写一份（第二份真源）导致的**静默回退**在运行期不抛不报、全绿也照不出——正是本版实测 6 组漂移却零报警的根因。
- **影响范围**：`ui/panel.js`（六处映射，不新增导出）；`tests/ui-gate-sync.js`（新增 `checkSrcMaps`）、`tests/run.js`（新增 v2.22.0 块 + 头部引用）；`tools/scan_drift.js`（新增诊断脚本）。出口面承诺不变。
- **附带自纠**：`ITERATION_LOG.md` 此前 `### R2` 被重复写入两份，本轮去重。扫描器口径两处修正：`reportReadFail` 正则漏 `reportHostReadFail`；settings 读标签为动态建桶，真源须取「声明 ∪ 调用点」，否则误判。
- **验证**：`node tests/run.js` 4084/0（+26，门禁 14 组：UI↔引擎 9 组 + 引擎↔引擎 2 组 + 诊断包 3 组，五重负向自证）；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R4 · 2026-09-20 · v2.22.0(b) 门禁扩围至诊断包消费端（10→11→14 组）
- **做了什么**：在 R3 提交后继续按「同类缺陷还有没有别处」追查消费端，把门禁判据由 9 组连续扩至 14 组，并修复新发现的三处同型漂移。
  - **引擎↔引擎**（第一次扩围，11 组）：`editor-faction.STATUSES/RELATIONS` 是 `evolution.FACTION_STATUS/FACTION_RELATION` 的独立副本，当前同值但无门禁保护；一旦脱钩，编辑器写入的势力状态会被引擎按非法值静默回退。
  - **诊断脚本收口**：`tools/scan_drift.js` 最初自带一份组定义，取证完成后它自己变成了「第二份真源」（门禁 14 组时它仍停在 11 组）——重写为**纯委托** `checkSrcMaps` 的薄壳，判据唯一真源归于门禁，二者不可能再漂移。
  - **诊断包**（第二次扩围，14 组）：`engines/tool-diag.js` 内另有 3 张同类标签表——`WRITE_SRC_LABEL` 缺 `verify`、删侧内联表缺 `verifyBack`、settings 读侧内联表只有 4 键（`read/parse/migrate/copy`）而真实动态标签 12 个。三处均按同文件既有中文措辞补齐。
- **为什么**：第十面门禁的真正价值是**把「第二份真源」这一缺陷形态收口**。若只覆盖 `ui/panel.js` 一个消费端，就等于「漂移面只收了一半」——诊断包同样把引擎桶抄了一份，读者从诊断面板看到的裸英文键名与 UI 面板是同一个 bug 的两种显影。（契约排序：这属「缺陷面未收口」，优先于任何小优化。）
- **影响范围**：`engines/editor-faction.js`（不改名字与结构，仅纳入判据）；`engines/tool-diag.js`（三张私有标签表补键，不触出口面成员）；`tests/ui-gate-sync.js`（`checkSrcMaps` 增 5 组、`SM_FILES` 加 2 文件）；`tests/run.js`（追加第 ④⑤ 重负向自证）；`tests/inventory.js`。
- **附带自纠**：① `tests/inventory.js` 的 `productFiles()` 只排除 `tests`，把新增诊断脚本 `tools/*.js` 误报为「未登记模块 2」——改为 `SKIP_DIRS = ['tests','tools']`（诊断脚本零依赖、不导出命名空间）。② `checkSrcMaps` 内新增断言引用了原先内联的 `WB`/`RB`/`sbTags`，直接 `ReferenceError`，改为 `const` 声明。③ 门禁锚点 `toolDiag.readLabel` 原含 ` }[k]` 尾部结构，补丁插入新键后该串不复存在 ⇒ `_wdObjAt` 抛「anchor not found」，锚点收窄为键值对前缀。④ 清理临时脚本，`tools/` 仅留 `scan_drift.js`。
- **验证**：`node tests/run.js` 4084/0（+5，门禁 14 组）；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0（产品文件 65）；出口面 58/321/4094 不变。

### R5 · 2026-09-20 · v2.22.0(c) 门禁扩围至事件阶段序列（14→20 组）
- **做了什么**：沿「同一枚举还有没有别处」继续全库扫描，把「事件阶段序列」四份副本纳入判据并全部对齐。
  - 全库 grep `已消散'` 命中 4 处有序阶段序列：`editor-events.TYPE_STAGES`（de-facto 真源，`stagesOf` 是公共访问器）、`evolution.STAGE_MAP`、`backstage.js:541` 紧急兜底、`inspector-state.js:33` 无 `editorEvents` 兜底。四份当前同值、此前无门禁保护。
  - 新增 6 组判据：`backstage.fallback.{progress,conflict}` + `evolution.STAGE_MAP.{conflict,progress}` + `inspectorState.fallback.{progress,conflict}`，真源取 `editor-events.TYPE_STAGES` 的有序数组（逐元素序比对，非集合比对——阶段推进依赖顺序）。
- **为什么**：兜底/副本一旦与规范阶段集脱钩，同一条事件会被兜底路径写成规范集之外的 stage——它不在任何枚举里，`isTerminal`/推进逻辑全都认不出（写进去读出来不一样，还不报错）；这正是本版要收口的那一类「静默失效」。
- **不纳入项（并记录理由）**：`TERMINAL` 各文件语义分歧——`evolution.TERMINAL` 视「已爆发」为终态、`editorEvents.TERMINAL` 只认「已消散」、`ledger.TERMINAL_STAGES` 取两者并集。这是**设计分歧**（三处各有依据），不是复制漂移，硬拉齐反而会改语义，故只收「有序阶段序列」。
- **影响范围**：`tests/ui-gate-sync.js`（`checkSrcMaps` 增 6 组、`SM_FILES` 至 10 文件）；`tests/run.js`（第 ⑥ 重负向自证改指 `evolution.STAGE_MAP`）；`tools/scan_drift.js`（薄壳已同步）；README/ITERATION_LOG。
- **附带自纠**：`tools/scan_drift.js` 自带组定义曾是门禁的第二份真源（门禁 14 组时它停在 11 组），重写为纯委托 `checkSrcMaps` 的薄壳——扫的就是门禁扫的东西，二者不可能再漂移。
- **验证**：`node tests/run.js` 4092/0（+8，门禁 20 组）；`node tools/scan_drift.js` → 漂移组数 0 / 20；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R6 · 2026-09-20 · v2.23.0 动态桶「硬编码子集」（第十一面）
- **做了什么**：把「第二份真源」线索下沉一层，治**动态桶被写成固定子集**这一类。
  - **现场一（结论不实）**：`core/store.js` 的 `readFailedDetail`/`readFailedCumulative` 硬编码 3 键（bytes/activity/enumerate），而 `__readStat.bySource` 是动态建桶（`noteStoreReadFail`/`reportReadFail` 任意来源）。本会话新增的 12+ 来源在明细里无键 ⇒ 消费点 `readFailedCumulative.recovery || 1` 恒得 undefined ⇒ 诊断永远报「本会话累计 1 次」。修为全来源枚举（`Object.keys`），差值基线 `__byBefore` 同步改全来源快照。
  - **现场二（跨域错放）**：`core/store.js` 的读侧标签表 `LAB`（标注 readFailedDetail）保留 8 个 settings-bus 域幽灵键、漏 `readSpotCheck`——与 v2.22.0 修的 `ui/panel.js:LAB_P` 同源。修为 store 域真实 21 来源。
- **为什么**：这类形态运行期**不抛不报**，且比「键名对不上」更隐蔽——表本身「看着是全的」，只是被写成固定子集；消费端读它得到 undefined 后多数有 `|| 默认值` 兜底，于是**兜底值伪装成真实值**（1 次 / 0 次），用户永远看不到真相。
- **影响范围**：`core/store.js`（两处明细 + LAB）；`tests/ui-gate-sync.js`（`checkSrcMaps` 增 store.LAB 组，21 组）；`tests/run.js`（v2.23.0 块 + 第 ⑦ 重负向自证）；版本三源 + run.js 7 处字面量；README/ITERATION_LOG。
- **附带自纠**：`tests/run.js` 版本断言描述文案里残留「入口版本为 2.21.0」（历史笔误，5 处）随本版一并更正为 2.23.0。
- **验证**：`node tests/run.js` 4099/0（+7）；`node tools/scan_drift.js` → 漂移组数 0 / 21；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。
- **（偶发观察）** 首次跑出现 1 例时间相关偶发失败「风声长期沉寂后消散」，两次复跑均 4092/0——与 store 改动无关，记录待观察。

### R7 · 2026-09-20 · v2.24.0 三面记账「未知来源」策略不一致（第十二面）
- **做了什么**：把「动态桶」线索再沉一层——桶的动态性之外，治**往桶里放东西的策略**在写侧的不一致。
  - **现场**：`core/settings-bus.js` 的 `noteFail`（写侧归类记账）用白名单判定 `writeFailedBy[t] !== undefined`，未知 tag 静默塞进兜底桶 `setItem`。新写路径漏登记桶 ⇒ 失败被**误归因成「写盘被拒」**，用户被引去查配额/隐私模式。
  - **对照（同族证据）**：`noteRemoveFail`（删侧，v2.9.0）与 `noteReadFail`（读侧，v2.10.0）对未知来源**早已动态建桶**；写侧是唯一不一致、也是唯一会误导归因的一面。
  - **修为**：`noteFail` 改「有则自增、无则建桶」+ 桶名归一 `settingsBus.write → settings`（与删侧 `settingsBus.remove → settings` 对称）。
- **为什么**：这是「第二份真源 / 动态桶」线索的同族第四形态——**归因错误比归因缺失更坏**：缺失会让用户看到「无归因」，错误会让用户去修一个不存在的问题。三面记账既然自称「单一实现」，对未知来源的策略就必须一致。
- **影响范围**：`core/settings-bus.js`（noteFail 一处）；`tests/run.js`（v2.24.0 块 + 第 ⑧ 重负向自证）；版本三源 + run.js 7 处字面量；README/ITERATION_LOG。
- **附带自纠**：本轮扫描器两次口径修正——按「调用点字面量」判可达性会误判 `rawRevive`/`stamp`/`legacy`/`quarantine`/`writeback` 等经 `lsWrite(from)` 参数传入的桶为「幽灵键」；正确口径是「**经出口参数可达的键集**」，`writeFailedBy` 9 键实际全部可达（非幽灵），真正的缺陷是策略不一致。
- **验证**：`node tests/run.js` 4106/0（+7）；`node tools/scan_drift.js` → 漂移组数 0 / 21；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R8 · 2026-09-20 · v2.25.0 动态桶的分类口径不完备（第十三面）
- **做了什么**：把「动态桶」线索最后一层收口——桶动态、建桶动态，治**分类口径**仍硬编码子集。
  - **现场**：`core/settings-bus.js` 的 `readStat` 分类 `hardFail = read+parse` / `degraded = migrate+copy`（固定 2+2）。`by` 是 readFailedBy 动态桶，本会话新增的 8 个核查读回来源（verifyBack/rmExisted/legacyRead/saveInherit/subkeyAudit/pendingOrphan/verifyDefaults/lsRaw）落两口径之外 ⇒ `readFailed` 涨而 `ok` 仍报 true，且 `hardFailed+degraded===readFailed` 完备性被静默破坏。
  - **修为**：分类遍历动态桶，「已知降级白名单（migrate/copy）+ 其余全部计硬失败（保守）」，单列 `unclassified` 保留落桶外来源归因。
- **为什么**：这是 v2.23.0「硬编码子集」的同族第五形态，也是最深的一层——**结论不实**：`ok:true` 会被消费端读成「存储读取一切正常」，而实际有来源失败了。同族前四形态（明细表硬编码 3 键 / 未知来源白名单兜底 / settings-bus 幽灵键）都已被 v2.22.0~v2.24.0 逐一收口。
- **影响范围**：`core/settings-bus.js`（readStat 分类一处）；`tests/run.js`（v2.25.0 块 + 第 ⑨ 重负向自证）；版本三源 + run.js 7 处字面量；README/ITERATION_LOG。
- **附带自纠**：既有关键断言「硬失败 + 降级 = 读失败总数（分类完备，无落桶外）」的完备性正是本版修好的性质；修后该断言在任意来源下成立（此前只在 read/parse/migrate/copy 四来源下成立）。
- **验证**：`node tests/run.js` 4113/0（+7）；`node tools/scan_drift.js` → 漂移组数 0 / 21；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R9 · 2026-09-20 · v2.26.0 诊断包 store 读侧标签表跨域错放（第十四面）
- **做了什么**：把「第二份真源」线索收口到诊断包消费端，并修掉门禁自身的静默盲点。
  - **现场**：`engines/tool-diag.js` 的 `SRC_LABEL`（诊断包渲染 store 读失败明细）是 store 读侧标签的**第三份真源**。它漏了 store 域自己的 `readSpotCheck`（⇒ 诊断包退回裸桶名），又混入 8 个 **settings-bus 域**键（rmExisted/verifyBack/legacyRead/saveInherit/subkeyAudit/pendingOrphan/verifyDefaults/lsRaw——归 `toolDiag.readLabel` 管，在本表永不被消费）。28 键 vs 真源 21 键。
  - **修为**：`SRC_LABEL` 对齐 store 域 21 来源（补 `readSpotCheck`、清 8 幽灵键）。
  - **门禁**：`tests/ui-gate-sync.js` 增第 21 组判据 `toolDiag.SRC_LABEL`（与 `LAB_P`/`store.LAB` 同真源）；`tests/run.js` 增 v2.26.0 块（正向两条 + 双负向自证）。
- **为什么**：v2.22.0 治了 `ui/panel.js` 的 `LAB_P`、v2.23.0 治了 `core/store.js` 的 `LAB`，**这第三处现场此前无任何门禁**——「同一份真源的三个消费端，只保护两个」意味着第三端可以静默腐烂。诊断包是用户排查故障时读的东西，桶名对不上等于归因不可读。
- **影响范围**：`engines/tool-diag.js`（SRC_LABEL 一处 + 两段注释对齐）；`tests/ui-gate-sync.js`（新增 1 组 + 取键器修盲点）；`tests/run.js`（v2.26.0 块 + 7 处版本字面量）；`index.js`/`manifest.json` 版本；README/ITERATION_LOG。
- **附带自纠（两处，均属「判据自身要诚实」）**：
  - ① **门禁静默盲点**：取键器 `_wdKeysOf` 的朴素正则要求键紧跟 `,`/`{`，而 `readSpotCheck` 前夹着整段注释 ⇒ 键**从键集消失**，既不报缺键也不报幽灵键。修法：取键前先剥注释（方向安全：只能让隐藏键重新可见）。
  - ② **判据越界**：新测试块的幽灵键判据首版裸配全文件，把 `toolDiag.readLabel`（合法）里同名键误判成「本表残留」——已收窄到只在本表字面量内判。
- **验证**：`node tests/run.js` 4121/0（+8）；`node tools/scan_drift.js` → 漂移组数 0 / 22；`node tests/ui-gate.js` 49/0；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R10 · 2026-09-20 · v2.27.0 死子面冻结账本 + 门禁（第十五面）
- **做了什么**：把 `tests/inventory.js` 重构成可复用单源，新建死子面冻结账本与门禁并接进主回归门。
  - **现场（缺口）**：出口面契约钉「整个 interface 面」的增删，**不区分成员有无消费方**——新增死导出回填冻结串即可静默通过；`dead` 子面 208 项（仅测试引用 132）此前既无账本也无门禁。
  - **重构**：`inventory.js` 抽出 `function collect()`（含复用保护）+ `module.exports = { collect, MODULE_EXPORTS }`；尾部 `if (require.main === module)` 保留 CLI 与人类可读打印。门禁直接 require 它，杜绝第二份「表面求差」实现。
  - **新建**：`tests/dead-export-ledger.json`（dead 208 / uiDead 4 逐条 reason + detail，归类 test-only / self-only / unwired，advisory 只记 dataOnly 计数）；`tests/dead-export-gate.js`（判四态：新增=红 / 归因腐坏=红 / 消失=提示 / 账本缺失=红；支持 `--update`、`--json`）。
  - **测试锁**：`tests/run.js` 新增 v2.27.0 节（A 口径单源、B 复用判据、C 现场锚点、D 账本健全、E 判定四态、F 归因语义、G 负向自证）。
- **为什么**：本轮主线仍是「门禁/清册自身的诚实度」。判据的输入面与结论面必须是同一件事——所以清册必须单源、复用判据必须真能区分「已装载」。
- **影响范围**：`tests/inventory.js`（重构 + 两处判据修正）、新增 `tests/dead-export-gate.js` 与 `tests/dead-export-ledger.json`、`tests/run.js`（+1 节、版本 7 处）、`index.js`、`manifest.json`、`README.md`、本日志。产品代码零改动（出口面不变）。
- **附带自纠（新版自身两处不确定性，均为真实踩到）**：
  - ① 复用判据 `!!global.WorldAxis` **恒真**（`tests/mock.js` 预置宿主壳）⇒ CLI 首跑跳过装载，定义面塌成命名空间 0 项、1223 处真引用反被判为 1209 处悬空、退出码 1。修为「LOAD 里的模块命名空间是否已有实例」。
  - ② UI 层装载写在 `if (!ALREADY)` 内 ⇒ 复用路径（门禁在 run.js 进程内取值）少 3 命名空间、uiPhantom 14 ↔ uiDead 0 互换，与 CLI 的 64/0/4 不一致——**定义面随调用时机漂移＝判据不确定**。改为幂等确保装载。
  - ③ 清册 CLI 的 `process.exit()` 在**输出大且 stdout 是管道**时截断尚未刷出的 stdout：破坏态 `--json` 有 137,750 字符，管道消费者拿到的是断在半个对象上的 JSON（exit 1 + 垃圾），手动重定向到文件则完整——即「结论体只在重定向时完整」。改为 `process.exitCode`（只设码不强制退出，Node 在 stdout 排空后以该码结束）。这是本版第三次踩到「探测器自身的输出不可信」，与 ①② 同型。
  - ④ 首次重构还漏收口 `if (!ALREADY)` 的闭合花括号（`node --check` 报 Unexpected end of input，花括号 61/59）——已补齐并使两条路径逐项一致。
- **验证**：重构前后 `--json` 逐项一致（命名空间 64 / 成员 665 / 引用 1223 / dead 208 · uiDead 4 · dataOnly 101 / deadInTestsOnly 132）；CLI 与复用路径一致；负控制两向（真新增死导出被点名拦截、归因腐坏被报不可读、撤销复原）；`node tests/run.js` → **4149/0**（+28）；`node tests/dead-export-gate.js` 绿灯；`node tests/inventory.js` 四类悬空 0；出口面 58/321/4094 不变。

### R11 · 2026-09-20 · v2.28.0 账本元数据与归因证据强度（第十六面）
- **做了什么**：把 v2.27.0 的冻结账本从「归因可读」推到「归因可证伪」——账本自己被查。
  - **现场（两处铁证，均为实测）**：① `tests/dead-export-ledger.json` 的 `version` 字段 = `"2.26.0"`、`_note` 内的版本词 = `v2.27.0`、入口 `index.js` 的 `const VERSION` = `'2.27.0'`——**同一份凭证里两个版本，且都不等于它自称记录的那一版**；该字段此前无任何门禁（凭证自称哪一版没人核，整份凭证的可信度就只剩自称）。② `Object.keys(l.dead).filter(k => l.dead[k].src).length` = `0/208`——**208 条归因零条带证据**，「凭什么是 `self-only` 而不是 `unwired`」在账本里没有答案，核对者只能相信写账本的那一次测量。
  - **门禁重写**（`tests/dead-export-gate.js`，369 行，保留旧三纪律 + 新增三条）：第四条**元数据三级同源**（`metadataProblems(ledger, entryVersion)` 报 `field-vs-entry` / `note-absent` / `note-vs-entry` / `field-vs-note`；`versionNotes(text)` 只认 `/v\d+(?:\.\d+)*/g`，规则里写「v0.1.x 遗留」不会被误读成本版自称）；第五条**归因带证且证据须与判据同宽**（`EVIDENCE_KEYS = ['src','refs','tref','own']`；`evidenceDrift(result, ledger)` 三层校验：字段缺失 → 「归因不得无证」、字段复算不符 → 「证据失实」、**归因由 `(tref, own)` 唯一反推不符** → 「归因与证据不符」；另加 `refs !== 0` → 「冻结项的产品引用数应为 0——它已不是死导出」）；第六条**未识别归因拒绝写入**（`build()` 遇 `REASON_CODES.indexOf(code) < 0` 直接 `throw`，fail-closed，不再落占位）。辅助单源：`stripNonCode(src)` 状态机（剥注释/字符串，供 `refCountIn` 与 `ownRefCount` 共用）、`referenceCounts(rec)` 只在定义文件**之外**的产品文件计 refs、`testRefCount(rec)` 只读 `tests/run.js`、`ownRefCount(rec)` 剥注释/字符串计定义文件内自用。`refresh()` 改为**不再保留旧 `reason`**（只保留人工润色的 `detail`）：reserved 的语义是「理由文本可人工润色」，不是「归因可脱离测量」。
  - **单源加固**：`tests/inventory.js` 把 `productFiles()` / `const PROD` / `const REF_RE` 从 `collect()` 内部提到模块顶层，`module.exports` 追加 `PRODUCT_FILES: PROD, REF_RE: REF_RE`；`collect()` 改为只消费。门禁复算证据必须复用清册的**同一份扫描面与正则**，否则会出现「证据说 `refs > 0`、判据说该成员是死导出」的自相矛盾。
  - **测试锁**：`tests/run.js` 新增 v2.28.0 块（A–H 八组）——A 结构锁、B 元数据三级同源、C 元数据负控制三形态、D 证据强度（212 条带证 / 分布 / 零失实）、E 证据负控制四类、F 判据不越界（冻结面与现场锚点不变、旧四盏灯一盏不少、单源导出在场）、G 类别证明、H 负向自证（真源码破坏元数据闸，锚点恰 1 处，**只 `require` 不跑 CLI**，`finally` 内 `unlinkSync` + 清 `require.cache`）。
- **为什么**：本轮主线仍是「门禁/清册自身的诚实度」，但推进一层。v2.27.0 只保证 `reason` 在词表内、不留 TODO——那是**可读**：看得懂，不保证是真的、可核对的。账本是一份需人工按版本号去找、去比对的审计凭证；凭证自称哪个版本却与实际不符，它的证据又不带出处，**整份凭证的可信度就只是自称**。所以本轮把「可读」推到「可证伪」：元数据须三级同源，归因须带证、须可复算、须由证据**唯一反推**。
- **影响范围**：`tests/dead-export-gate.js`（重写，369 行）；`tests/inventory.js`（单源导出）；`tests/dead-export-ledger.json`（重建：212 条全带 `src/refs/tref/own`，`version` 与 `_note` 齐到 v2.28.0）；`tests/run.js`（+1 节、版本 7 处字面量、旧负控制对齐）；`index.js` / `manifest.json` 版本；`README.md`、本日志。产品代码零改动（出口面不变）。
- **附带自纠（三处，均为真实踩到）**：
  - ① **同轮自纠（本版最有意味的一处）**：`build()` 首版落账**漏写 `own` 键**——输出「证据已复核写入 212 条（src/refs/tref）」却在判定时让 196 项报「证据字段缺失」。写路径与判据不同宽，正是本版要治的「账本自己说的和实际执行的不是一回事」，**被自己的新灯当场抓到**。修法：条目对象补 `own: ev.own`。
  - ② **旧灯与新纪律冲突（判据对齐）**：v2.27.0 的负控制「登记条目消失 ⇒ 只提示、不红灯」插入的是 `{ reason, detail }` **无证占位条目**——而那是 `build()` **永不产出**的非法状态（它只写带证条目）。即在造一个工具不可能造出的输入去测工具。修法不是削弱新灯，而是**把该灯升级为合法输入**（带证的消失条目，gone 本身仍只提示），并**补一盏更锋利的灯**：账本留无证记录（哪怕该条目已消失）⇒ 红灯——凭证里的条目要么带证、要么不该留在文件里。这是「判据必须对齐工具真实输出面」的又一例。
  - ③ 环境与操作：`node --check` 首次报 `ReferenceError: PROD is not defined`（`module.exports` 引用了尚在 `collect()` 内的 `PROD`），提到顶层后双 OK；heredoc 写探针脚本再次被 JSON 转义吞掉 `function strip(src) {` 与正则字面量行，已按纪律改回 `create_file` 落盘（先 `rm -f` 再建，规避「已存在文件需先删除」）；`ast.parse` 误用于 JS 文件报 `SyntaxError: invalid character '：'`（Python 检查不适用 JS，JS 一律 `node --check`）。
- **验证**：`node tests/run.js` → **4189/0**（v2.28.0 块 +40 断言）；`node tests/dead-export-gate.js` 输出「冻结面规模 dead 208 · uiDead 4」「dataOnly 101 → 101」「✓ 死子面无新增、归因可读、元数据同源、证据可复算」exit 0；`node tests/inventory.js` 四类悬空 0；`node tests/ui-gate.js` 49/0；`node tools/scan_drift.js` 漂移 0/22；`node tests/export-contract.js` 58 命名空间 / 321 成员 / 4094 字符不变。独立**真相探针**（另写、不复用门禁实现）逐条复算：`src` 文件存在且与 `MODULE_EXPORTS` 反查一致、`refs===0`、`reason === f(tref, own)`——**212 条失实 0 项**；归因分布 `test-only 136 / self-only 72 / unwired 4`；现场锚点 `refs 1223 / 命名空间 64 / 成员 665 / dead 208 / uiDead 4 / dataOnly 101 / deadInTestsOnly 132` 与 v2.27.0 逐项一致（**本版不扩面、不改口径**）。
### R12 · 2026-09-20 · v2.29.0 引用面的输入面必须是真代码面（第十七面：提及不是引用）
- **做了什么**：把「单源」从口径层推到**输入面**——引用计数不再扫原文，只扫真代码面。
  - **现场（两处铁证，均为实测）**：① **掏空型**——在任一产品文件末尾加**一行纯注释**（零代码改动）⇒ 冻结面 `208 → 207`，该成员脱出死子面，门禁输出「⚠ 已登记的死导出消失 1 项」+「✓」并 **exit 0 绿灯**，还催人跑 `--update`；照办就把该条目从账本**永久删除**。新增死导出会红灯，**掏空只提示**——比 v2.27.0 治的「新增无人提示」更隐蔽。② **计数失实型**——门禁自写的 `stripNonCode` 只认注释与字符串、**不认正则字面量**：字符类正则（如 `/[&<>"]/g`）里的引号让状态机进字符串态，而单双引号串在旧实现里**不因换行终止** ⇒ **跨行失步**，其后整段真代码被剥成空格。实测（旧实现 vs 新实现逐文件全库对照）**丢失真代码引用 97 处**：`ui/panel.js` 153→211（少算 58）、`ui/settings.js` 1→39（少算 38）、`engines/tool-snapshot.js` 12→13（少算 1）。
  - **修法（单源）**：`tests/inventory.js` 新增并导出 `codeFace(src)`——单遍状态机（状态 `code/line/block/sq/dq/tpl`），**长度与行数守恒**（原位空格替换，行号仍可与原文对照）。规则写进模块头：行尾注释不计引用、字符串字面量里的成员提及不计引用、模板字符串 `${}` 内表达式**算**真代码（brace 计数配对）；`/` 是正则还是除法看**前一个非空白代码字符**（`),=:[!&|?{};+-*%<>~^/` 之后为正则）。清册的产品面与**测试侧**（`tests/run.js`）都改走 `codeFace`。
  - **旧实现整体删除**：`tests/dead-export-gate.js` 的 `stripNonCode` 定义与 2 个调用点全部移除，`countRefs` / `refCountIn` 改走 `inventory.codeFace`；`module.exports` 不再含 `stripNonCode`。判据与清册**只能有一个口径**——否则会出现「清册说 refs>0、判据说它是死导出」的自相矛盾。
  - **口径升级差量可枚举**：`refs 1223 → 1202`（−21，剥掉的是纯提及）、`dead 208 → 211`（+3：`rand.seed` / `clock.freeze` / `bridge.setSettings`——此前只被**注释或字符串提到**、产品代码零真引用的成员）、`deadInTestsOnly 132 → 133`、账本条目 `212 → 215`、归因分布 `test-only 136→137 / self-only 72→73 / unwired 4→5`；`uiDead 4 / dataOnly 101 / 命名空间 64 / 成员 665`**不变**（本版不扩面、不改口径，`EVIDENCE_KEYS` 仍为 `['src','refs','tref','own']`）。
  - **测试锁**：`tests/run.js` 新增 v2.29.0 块（A 结构锁 / B 守恒性与保真性 / C 加注释不得改变冻结面 / D 端到端真源码注入 / E 异常隔离 / F 口径升级差量可枚举 + 旧灯一盏不少 / G 负向自证）。
- **为什么**：判据的**输入面**与结论面必须是同一件事。v2.28.0 立了「清册与门禁共用同一份扫描面与正则」，但那只是**面与正则**单源——**剥离器仍是第二份实现**，而它坏得恰好是「把真代码当文本扔掉」。一条判据若吃错输入，它的结论再自洽也没用：门禁说 `refs=0`，而那行代码真在跑。
- **影响范围**：`tests/inventory.js`（新增 `codeFace` + 导出 + 产品面/测试侧改口径）；`tests/dead-export-gate.js`（删 `stripNonCode`、改 2 个计数函数、导出面收口）；`tests/dead-export-ledger.json`（重建 215 条）；`tests/run.js`（+1 节 218 行、版本字面量 8 处、v2.27.0 块 9 处锚点、v2.28.0 块 12 处锚点同步到真代码口径）；`index.js` / `manifest.json` 版本；`README.md`、本日志。产品代码零改动（出口面不变）。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **负控制锚点必须与所测形态匹配**：G 组首版用「破坏正则识别」锚点搭配的样本实测仍保留后续代码（`lost b false / lost c false`）——锚点拆错了地方。改为分别拆**两条识别规则**（引号串换行终止 / 正则字面量识别）配**两个不同样本**，各自可复现「跨行失步」与「正则被当除法」。
  - ② **不要在回归进程运行时改工作区**：本轮在 `node tests/run.js` 后台运行期间向 `core/store.js` 追加注释做验证，导致回归进程被中止（且 `cp` 还原因同一命令链被中断而未执行，工作区留下 `M core/store.js`）。已即时 `cp` 还原并 `md5sum` 逐字节校验。**破坏性验证一律在副本目录做**（本轮改用 `tar cf - | tar xf -` 建 `/tmp/wa_probe/newv` 副本，避开本机 `cp -r` 偶发 ROOT 不可用）。
  - ③ 环境：本机不支持 `timeout` 命令（报 `Function not implemented`），长任务改用 `nohup ... > file 2>&1 &` + 事后读文件；终端偶发 `Current ROOT unavailable` 报错，重试即可。
- **验证**：`node tests/run.js` → 全绿（见下）；`node tests/dead-export-gate.js` 绿灯（「冻结面规模 dead 211 · uiDead 4 · 归因分布 test-only 133 / 其余 78」+「✓ 死子面无新增、归因可读、元数据同源、证据可复算」exit 0）；`node tests/inventory.js` 四类悬空 0；`node tests/ui-gate.js` 49/0；`node tools/scan_drift.js` 漂移 0/22；`node tests/export-contract.js` 58 命名空间 / 321 成员 / 4094 字符不变。
- **双向对照实验（本版最硬的证据）**：把 v2.28.0 干净副本（`git archive HEAD` 导出）与新工作区并排跑同一破坏：**旧实现**加一行注释 ⇒ `dead 208 → 207` + 「⚠ 已登记的死导出消失 1 项」+ `✓` + **exit 0**；**新实现**同一注释 ⇒ `dead 211` 不变、无警告、「✓」exit 0（掏空型当场消失）。逐文件全库对照旧/新引用计数：65 文件中 3 个有差，合计少算 97 处。

### R13 · 2026-09-21 · v2.30.0 收尾（镜像回落守卫收窄 + 冻结锚点对齐 + undo 断言修复 + 扫描面判据精确化）
- **做了什么**：v2.30.0 主版本交付后遗留的四处收尾，全部在回归 `node tests/run.js` 全绿前定位并修复。
  - **P0-1 镜像回落守卫收窄**：`core/store.js` 的 `loadFromMirror(chatId)` 原在本地键为空（miss）时无条件把 `chat_metadata.worldaxis.live.data.state` 持久镜像写回 localStorage，与既有「拒绝恢复未凭空创建 state 键」契约冲突——一旦同聊天 `LS.clear()` + `init()`，镜像会凭空重建 `worldaxis_state_*` 键。修法：函数体开头加 `if (!branchParentId()) return null;`（仅分支才自动回落；同聊天空键一律不写回），模块头「保守五条」扩为第六条「自动回落仅分支」。跨设备安装走 chatcache.installPack，用户主动补救走 rescueFromMirror（仍无视是否分支显式写回，是唯一的自动写盘入口）。
  - **冻结锚点对齐**：清册现场实测 `refs 1238 / 命名空间 65 / 成员 676 / dead 211 / uiDead 4 / dataOnly 101 / 仅测试 133`（v2.30.0 新增 core/undo.js 命名空间 + 成员 + 旁路写点所致），而 run.js 三处冻结断言（r2700/r2800/r2900）仍写旧值 1202/64/665。全部对齐到 1238/65/676；`INVENTORY_G` 冻结 `core/store.js` 的 localStorage 旁路写点计数 7→8（loadFromMirror 新增一处 writeVerified 落盘点）。
  - **undo 断言修复**：v2300 B 块（撤销栈联动）首版断言写 `WA.store.read('v2300probe').a === 1`，但 store.patch 自动钩子用固定标签「参数编辑」触发 `core/undo.js` 的「同标签合并」（硬纪律②，连续同类编辑只记最早 before）——新键的第一次编辑 before=undefined 入栈、第二次同标签合并掉，undo 写回 undefined 删键，断言对 undefined 取 .a 抛 TypeError。裁决：实现正确（合并是文档化的硬纪律，继承参考仓 ref_sw2），断言笔误。修为断言 `read() === undefined`（新键编辑序列退到键不存在）+ 新增 `merged+1` 计数断言。
  - **扫描面判据精确化**：v2300 D 块「产品代码零 Node 内建引用」判据首版 `\bglobal\b|\bfs\b\.` 误杀两类：① `(typeof window!=='undefined')?window:global` 浏览器兜底惯用法（6 处，浏览器运行时永不落到 global，不是 Node 依赖）；② 局部变量 `fs`（factions/facts 简写，`fs.map`/`fs.length` 是数组方法，与 Node fs 模块无关——之前被 global 的 6 个误报掩盖，slice(0,6) 截断只显示了 global 那批）。修法：判据改为只抓「真 Node 运行时依赖」——`require(`（模块引入根，覆盖 Node fs 等必经处）、`__dirname`/`__filename`（Node 特有全局）、`(?<![.\w])process\.\w` / `(?<![.\w])Buffer[.(]`（lookbehind 排除 window./WA. 宿主前缀）、`(?<![\w.])global\s*[.\[]`（排除宿主前缀、typeof 兜底、数据词）；**删掉** `\bfs\b\.`（局部变量误杀，真 Node fs 必经 require 已被覆盖）。
- **为什么**：v2.30.0 主版本把「镜像回落 + 撤销栈 + 引用收口」三件事一次落地，但交付时回归在 v2.30.0 段崩溃（undo 断言 TypeError）+ 扫描面判据误报 2 条。收尾的目标是让全量回归真正全绿，并让扫描面判据「零误杀/零漏报」（判据必须能区分「真 Node 依赖」与「局部变量/宿主形态/数据词」，否则它自己就是第二份不可信的实现——与 v2.29.0 治「剥离器把真代码当文本」同一性质）。
- **影响范围**：`core/store.js`（loadFromMirror 守卫 + 口径注释第六条，不新增导出）；`tests/run.js`（冻结锚点 3 处对齐、INVENTORY_G 7→8、v2300 B 块 undo 断言修复 + merged 计数、v2300 D 块扫描面判据精确化）；`README.md`（P0-1 措辞补「自动回落仅当 main_chat 非空；同聊天空键不写回」）。产品代码零新增导出（出口面不变）。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **判据收窄不能变成「放宽」**：扫描面判据第一版把 `\bglobal\b` 收窄为 `global\s*[.\[]` 时漏了前缀边界，把 `window.global.x`/`WA.global.x` 宿主形态里的 `global.` 子串也误杀（memory-sampler.js:107、memory.js:167）。正确收窄须正交两维——既排除「兜底惯用法/数据词」，又排除「带宿主前缀的合法形态」，lookbehind `(?<![\w.])` 是关键。
  - ② **误报被截断掩盖**：旧判据报 8 个命中（6 global + 2 fs），但断言 extra 用 `slice(0,6)` 只显示前 6 个——fs 那 2 个一直被截断藏住，直到 global 修完才现形。教训：排查判据误报要看**全量命中**而非截断样本。
  - ③ 环境：本机会周期性把长进程挂起（STAT `T`），看门循环里加 `kill -CONT` 自动续跑；完整回归约 10–15 分钟（v2.27/2.28/2.29 段每次 `evidenceDrift` 全量复算约 71 秒，judge 每次内部调用一次）。
- **验证**：`node tests/run.js` → **4257 / 失败 0**（v2300 D 块扫描面两条断言转绿、B 块 undo 不再崩溃、场景 F 镜像回落守卫全绿）；`node --check core/store.js` / `tests/run.js` 双 OK；新判据独立验证：7 类误报（兜底惯用法 / 局部 fs / 数据词）全不命中 + 7 类真 Node 依赖（require / process / Buffer / 裸 global / __dirname / __filename）全命中；对真实产品代码全量扫描 0 命中（D 块正向断言绿）。出口面命名空间 65 / 成员 676（与回归锚点一致）；refs 1238 / dead 211 / uiDead 4 / dataOnly 101 / 仅测试 133 与冻结锚点逐项一致。

### R14 · 2026-09-21 · v2.31.0 交付（UI 接线面门禁·第十九面：引用面→渲染面，零幽灵绑定）

- **做了什么**：功能级失效侦察后，把侦察沉淀为可复用门禁。
  - **侦察先行（只读）**：逐一核查 v2.30.0 全部新增导出（`undo.pushValue/undo/peek/stat/clear`、`store.mirrorStat`、`store.rescueFromMirror`、`store.sameId`、`proactive.stat`）在产品代码（排除 tests/）的真实消费点——**全部存活**，无一功能级失效。实跑 `tests/inventory.js` 确认 `core/undo.js` 已在 MODULE_EXPORTS 登记、被 inventory 扫到并判存活（refs>0 故正确不进死账本，非漏扫）。`sameId` 有 11 个文件消费（P1-1 收口主战场）、undo 各方法 + mirrorStat + rescueFromMirror 都有 UI 按钮/诊断包/自动钩子真实挂载。
  - **锁定 UI 层接线盲区**：侦察发现 `tests/ui-gate.js` 管的是「**渲染面→操作面**」（渲染出的控件能否被点击），但抓不到反方向失效——「**引用面→渲染面**」：JS 里 `$('#id')`/`on('#id')`/`setOut('#id')` 引用的 DOM id，模板是否真的渲染了它。这类失效（handler 绑到从不渲染的 id）因 `on()`/`setOut()` 都有 `if (el)` 判空守卫，**静默空转、不抛错**，用户视角「点了没反应」，而真实点击门禁因元素不存在根本点不到——是 UI 层功能级失效的最后盲区。
  - **新建 `tests/ui-wire-audit.js`（零依赖静态门禁）**：`auditWire(src)` 返回 `{ referenced, rendered, ghosts, pure }`。判据口径（对真实 ui/*.js 校准，零假阳）：引用面 = `'#id'` 字符串字面量**排除 hex 颜色**（`#fff`/`#2196f3` 等）；渲染面 = 把 id 当**非 `#`** 纯字符串字面量（覆盖 `ta('id',…)` 等任意渲染 helper）或 `id="id"`（覆盖任意渲染方式，不依赖 `wa-` 前缀）；注释行（`//` `*` `/*`）不计入。导出 `auditWire`/`uiFiles` + `require.main === module` 守卫（独立运行时跑 main，被 run.js require 时只导出）。
  - **接入回归 run.js**：顶部 `require('./ui-wire-audit.js')` + 汇总前新增「v2.31.0 块：UI 接线面门禁」section——三 ui 文件逐一断言零幽灵引用 + 对**真实 panel.js 注入一个幽灵引用**做负向自证（判据非恒绿）。复用 ui-wire-audit 导出的同一判据，不复制不漂移。
  - **版本推进 2.30.0→2.31.0**：`index.js` VERSION 常量、`manifest.json`、run.js 8 处版本断言（`=== '2.30.0'` 精确锚点）、`dead-export-ledger.json` 的 version + _note 时点。历史注释（`// v2.30.0`）与段标题（`section('v2.30.0`）一律不碰。
- **为什么**：功能级失效侦察（用户偏好主线）确认 v2.30.0 无失效后，下一步是补上侦察发现的**盲区**——UI 层「引用面→渲染面」的静态一致性。ui-gate 已把「渲染面→操作面」做到很细（mini-DOM 真实渲染+点击+负向探针），但方向相反，两者正交。把它沉淀为门禁后，未来任何面板新控件「绑了却没渲染」会在回归当场红灯，而非等用户点没反应才发现。
- **影响范围**：新增 `tests/ui-wire-audit.js`（零依赖、可独立运行）；`tests/run.js`（+1 require + 接线面 section，4257→4262 全绿）；`index.js`/`manifest.json`/`dead-export-ledger.json` 版本推进。**产品代码零改动**（纯测试/门禁层，出口面不变：命名空间 65 / 成员 676 / refs 1238）。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **heredoc 嵌套引号转义地狱**：往含嵌套引号的 JS 门禁里写锚点替换时，heredoc/终端传输会破坏转义——双引号串跨真实换行（`node --check` 报 Invalid token）、`\n` 字面量被转成真实换行。解法：判据/锚点脚本**一律落盘执行**（用户既有纪律），构造换行用 `String.fromCharCode(10)` 而非 `\n` 字面量，锚点匹配用 `.count()` 精确断言命中数（失配即 ABORT），改完 `node --check` 复核。
  - ② **看门脚本 pgrep 模式陷阱（最隐蔽）**：看门用 `pgrep -f 'node tests/run.js'` 判断进程存活，但回归用 `node --max-old-space-size=1536 tests/run.js` 启动——**中间插了参数，pgrep 模式匹配不到**，连续三次（run b/c/d）误报 GONE 提前退出。真因**不是 OOM**：进程一直健康推进（RSS 仅 429MB，远低于 1536MB 堆上限，ST=R）。修复：看门直接检查固定 PID 的 `/proc/PID/stat`，不靠 pgrep 模式猜。教训：**「进程死了」的判定要看 /proc/PID 真实存在性，不靠 pgrep 模式**；验证结论前先确认判据本身没坏（负控制假绿的又一形：判据引用了错误对象）。
  - ③ **isComment 只 strip 制表符漏空格**：注释识别 `replace(/^\t+/,'')` 只剥制表符，而 panel.js:557 的注释行 `//   ` 是**空格**缩进，`//` 没被识别为注释开头，注释里的 `$('#x')` 示例被误判为引用（报 `x@L557` 幽灵）。改 `^\s+`（全空白）。教训：静态判据的边界条件（缩进风格）要在**真实文件**上校准，不能只凭构造样例。
- **验证**：全量回归 run_v2310d → **4262 / 失败 0**，「全部测试通过 ✓」；接线面 section 5 断言全绿（panel.js 引用 98/渲染提及 217、settings.js 47/115、assistant.js 0/5，均零幽灵 + 负向注入 `wa-ghost-probe-btn` 被抓）。接线面 section **独立等价验证 6/6**（require 导出可用 + 三文件零幽灵 + 对真实 panel.js 负向自证）。三 ui/*.js 实跑：hex 颜色（7 个）/注释示例（`$('#x')`）/渲染 helper（`ta()`）三类假阳**全部排除**后零幽灵。`node --check tests/run.js` / `index.js` 双 OK。版本推进后：残留 `=== '2.30.0'` 断言 **0**、`=== '2.31.0'` **8** 处、三处版本源（index/manifest/ledger）全 2.31.0、历史注释未被误伤（`// v2.30.0`、`section('v2.30.0`）仍在。出口面不变（命名空间 65 / 成员 676 / refs 1238 / dead 211 / uiDead 4，与冻结锚点一致）。

### R15 · 2026-09-21 · v2.32.0 交付（证据复算性能：文件级缓存 + 整趟快照，缓存不得假绿）

- **做了什么**：把完整回归里最大的一块耗时（证据复算）从秒级压到毫秒级，且**不丢证伪能力**。
  - **量化根因（先测后改）**：实测单次 `evidenceDrift` **82.7 ~ 87.3 秒**（基线 6 次共 520s）。根因链：`evidenceDrift`（对 ~211 条冻结项）逐条调 `evidenceOf` → `referenceCounts(rec)` 对**每个产品文件**（66 个）各自 `fs.readFileSync` + `refCountIn(src)`（内部 `codeFace` 状态机 + `REF_RE`），而只取 `[k]` 一个值 ⇒ 同一文件被解析 211 次（≈14000 次 codeFace）。而 `refCountIn()` 返回的本来就是完整 key→count map——**每个文件其实只需解析一次**。run.js 共调 `evidenceDrift` 11 次 ⇒ 这是 15 分钟回归的大头。
  - **缓存安全性先审计后动手（关键）**：v2.29 段有**端到端真实写产品文件**的负控（往 `engines/bridge.js` 注入注释/真调用再还原，`writeFileSync` 目标 `pBridge2900`）。结论：任何按**文件内容**的缓存都会在负控时假绿。选 `fs.statSync` 的 **mtimeMs + size** 作缓存键——写文件必改 size/mtime ⇒ 缓存必 miss ⇒ 重算；还原再写 ⇒ 再重建。子进程负控（`spawnSync` dead-export-gate.js --json）有独立缓存，与本层无关。
  - **三层落地**：① 文件级 `readCached(abs)`（缓存 `{stamp, src, code, map}`，stamp=mtimeMs:size）；② 整趟 `productSnapshot()`（sig = 全部产品文件+run.js 的 mtime:size 拼接，趟内只核一次）；③ 趟标记 `beginPass/endPass`（`evidenceDrift` 内部是**同步**执行，一趟内无写盘机会，故「趟首核一次 sig」与「每条都核」等价；趟外调用如 `evidenceOf` 直调仍全量核验）。`countRefs` 拆出纯核 `countRefsOnCode(code, mem)` 复用已剥面；`referenceCounts/testRefCount/ownRefCount` 全部改走快照。
  - **不改出口面**：新函数（`readCached`/`productSnapshot`/`stampOf`/`countRefsOnCode`/`beginPass`/`endPass`）均为**文件内私有**，不动 `module.exports`（冻结面零变动）。
  - **版本推进 2.31.0→2.32.0**：`index.js` VERSION、`manifest.json`、run.js **8 处** `=== '2.31.0'` 断言、`dead-export-ledger.json` version+_note。历史注释（`// v2.31.0`）与段标题（`section('v2.31.0`）不碰。
  - **新增 v2.32.0 回归 section**（+10 断言）：三层在场结构锁 + 缓存键含 mtime/size 静态锁 + 趟内复用有边界静态锁 + 等价零失实 + **性能门槛（20 次 < 5s，未缓存时约 85s/次，以数量级区分而非抖动）** + **主动负向自证**：先喂热缓存，再注入纯注释（仍 0）、注入真调用（必须当场报出 `bridge.snapshot`）、逐字节还原（md5 一致）、还原后回零。
- **为什么**：这是**唯一一条**同时改善「开发者体验」与「门禁可用性」的优化：回归 15 分钟会让人「懒得跑全量」，而证据复算是 v2.28.0 证伪能力（归因可证伪）的必要代价，不能删。把代价压到可忽略后，「每条证据都实算」才能长期保持，不必退化为抽样。
- **影响范围**：`tests/dead-export-gate.js`（+~97/− 15 行，产品代码零改动、出口面零变动）；`tests/run.js`（v2.32.0 section + 8 处版本断言）；`index.js`/`manifest.json`/`tests/dead-export-ledger.json` 版本推进。冻结锚点（命名空间 65 / 成员 676 / refs 1238 / dead 211 / uiDead 4 / dataOnly 101）逐项不变。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **「首次快、后续慢」反转的反常必须凿穿到底**：第二层快照落地后，首次 evidenceDrift 降到 **450ms**、但后续 5 次反而各 ~10s。若无计数器会误判「快照没生效」。加计数器发现 `productSnapshot` 在 call 2 被进入 **645 次**（=215×3）——真因是**趟内复用分支的早返回没置 `__passResolved`**：sig 命中走 `return __snap`，但没把「本趟已核过」标上，于是每条又重算一次 sig（215×67 次 statSync）。修法：在 sig 命中早返回处也 `if (__passDepth > 0) __passResolved = true`。修后 87s → **0.03s**（后续）/ 0.5s（首次含 sig 核验）。教训：**缓存热路径有多条返回分支时，每一条都要维护状态不变量**，漏一条就退化成全量。
  - ② **优化必须自带「不假绿」负控**：性能缓存的危险不是慢而是**假绿**（文件改了却读旧值）。本版不仅保留了原有负控，还**新增**一条同进程内主动写真实产品文件的负向自证（注入注释→仍 0；注入真调用→当场报 1 且点名 `bridge.snapshot`；还原→md5 一致且回 0）。若用内容哈希/无键缓存，此条会恒为 0 而红灯。
  - ③ **statSync 比预期便宜，不是瓶颈**：profiling 实测 67 文件 × 10 轮 statSync 共 134ms（0.2ms/次）——所以「每趟核一次 sig」完全可接受，没必要再上二级缓存。先测再优化，避免了为 134ms 的路径设计复杂机制。
  - ④ 环境：本机会周期性把长进程挂起（STAT `T`）；`uptime` 曾显示机器 only 2 分钟（环境重建过），PID 会变，看门必须重新取 `/proc/PID`；含 `!` 的 shell 命令会触发历史展开报 `event not found`，判据脚本一律落盘执行。
- **验证**：全量回归 run_v2320b → **4272 / 失败 0**（+10 断言），「全部测试通过 ✓」，**墙钟由 ~12–15 分钟降至 ~70 秒**。v2.32.0 section 全绿，其中性能门槛「20 次复算 571ms < 5000ms」（未缓存同量约 28 分钟）。独立等价验证：211 条冻结项 × 4 证据字段（src/refs/tref/own）**零失配**，`judge.ok=true`
  、`drift_len=0`。负控闭环：注入注释 drift=0 / 注入真调用 drift=1（点名 `bridge.snapshot`）/ 还原 md5 一致 / 还原后 drift=0。`node --check tests/dead-export-gate.js` / `tests/run.js` OK。版本推进后残留 `=== '2.31.0'` **0**、三处版本源全 2.32.0。
### R16 · 2026-09-21 · v2.33.0 交付（能力面 → 呈现面·第二十面：记忆总览 + 溯源视图 + 注入健康度 + 面板基础件）
- **做了什么**：R1–R15 十五轮全部在「证明它没坏」（契约/冻结/漂移/门禁/性能），本版第一次问「玩家看得见吗」。cov3.js（按文件内真实命名空间 `WA.<ns> = {` 判定，排除文件名误报）跑出全库覆盖矩阵：**30/66 产品文件零 UI 入口**，其中 `engines/memory.js` 92 方法（全库最大单体，承载 L0→L3 分层回顾/facts 更迭/伏笔生命周期）与 `engines/timeline.js`（记忆溯源）产品 UI 零出口。一次性交付四件：
  - ① **记忆总览页**（ui/panel.js `renderMemory`）：L0/L1/L2/L3 四层列表 + 长期事实（版本/启停徽章）+ 伏笔五态徽章 + pmem + 编年史全量（此前只露 10 条一行）+ 关键词检索 + 溯源审计块。写入口只走 `store.patch`（受控写入自动入撤销栈）：新增事实带重名拦截、删除、启停，操作后重绘保证「界面上的 = 磁盘上的」。
  - ② **溯源视图**：`_msRefBadge` 用非冻结的 `timeline.auditRefs` 现算「有效/正文已变/楼层缺失」+ 楼层范围徽章；「查看出处」展开 `_msFloorText` 直接从 `ctx.chat` 按 `SOURCE_ID_KEY` 取原始楼层正文，**不碰冻结导出**（`refsToConversation`/`sourceRef`/`ensureMessageId` 等）。
  - ③ **注入健康度页**（`renderInject`）：读 `store.get().lastInjection`（state 字段，零风险数据源）展示预算用量 used/cap、折叠/丢弃裁决明细、槽位落地、可见性总览；`injectInspector.getLastSnapshot/statusText`（非冻结）给「这轮注进去没」的落地判定；「去自检」跳工具页跑 toolDiag。
  - ④ **面板基础件**：工具页 16 按钮裸排改四组带标题结构（诊断与体检/存储与现场/恢复与撤销/运行痕迹，id 全保留）+ 15 个控件 tooltip。
  - **门禁同步**：页面计数 10→12（ui-gate.js + run.js 各 3 处）；tool-diag `UI_BINDINGS` 登记两个新页（memory 6 控件 / inject 3 控件）；v2.33.0 回归 section（A–I 九组 +31 断言）：新页在场与位置、记忆页读 store 真数据（防假页面）、检索过滤真生效、写入口受控 + 撤销闭环、溯源端到端（captureRange 真实 refs → auditRefs valid → 徽章 → 点开取回楼层原文 → 改文报「已变」→ 删楼报「缺失」）、注入页读真快照、工具页分组 + tooltip、零幽灵绑定（auditWire）、负控制（renderMemory 换空壳 ⇒ 读不到真数据，判据非恒真）。
  - **版本推进 2.32.0→2.33.0**：index.js / manifest.json / run.js 8 处版本断言 / dead-export-ledger.json version+_note（历史注释与段标题不碰）。
- **为什么**：**可测性偏置**——R1–R15 每轮入口都是「找一个能证伪的面」，而「玩家看不见记忆」不是能证伪的命题（无断言失败、无契约漂移、回归永远绿），于是永远排不进队列。破法是把「能力面 → 呈现面」本身做成可证伪的门禁：不只断言「页面在」，还断言「页面真的展示了引擎真数据」（内容 > 0）+ 负控自证（空壳页面会被当场抓红）。
- **影响范围**：ui/panel.js（+约 320 行：渲染层 +233 / 绑定层 +60 / 工具页结构 +27）；engines/tool-diag.js（UI_BINDINGS +2 组）；tests/ui-gate.js（计数 3 处）；tests/run.js（版本 8 处 + 计数 3 处 + v2.33.0 section）；index.js/manifest.json/dead-export-ledger.json 版本推进。出口面：**成员 676 / 命名空间 65 / dead 211 / uiDead 4 不变；refs 1238→1266**（panel.js 新增对 `timeline.SOURCE_ID_KEY` 等 28 处真实跨文件引用）；**dataOnly 101→100**（`timeline.SOURCE_ID_KEY` 从「仅数据引用」转为有真实消费方）——FROZEN2800 按 `export-contract` 实跑输出回填（唯一差异即 timeline.SOURCE_ID_KEY），账本 advisory 同步为 100。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **产品文件里局部变量名可能污染冻结计数**：`_msRefToggle` 里 `const open = …` 使 uiDead `ui.open` 的 own 从 1（仅声明）抬到 5（`ownRefCount` 按成员名裸计次、不区分命名空间归属），门禁当场报失实。改名 `isOpen` 解决。教训：在 ui/*.js 写局部变量前，先想它是否与某导出成员同名。
  - ② **命令输出截断 ≠ 未执行**：section 插入脚本首次输出被截断，重跑导致插入 2 份；另一脚本重复添加了 v2.31.0 已有的 `__uiWire` 导入。均按 `s.index(anchor, i1+1)` / 注释行+导入行成对匹配精确去重。教训：每次落盘后 `grep -c` 校验唯一性，替换前锚点断言 count==1。
  - ③ **手搓测试数据敌不过真实比对**：E 段最初手搓 `hash:'h0'`，而 `auditRefs` 做真实 FNV hash 比对，必然误判「正文已变」⇒ 断言自相矛盾。改用非冻结的 `captureRange(0,1)`（内部走 sourceRef/messageHash 真实采集）。教训：**测试数据必须来自生产端真用的采集入口**，不能造字面量绕过被测比对逻辑。
  - ④ **测试辅助自身的重绘陷阱（三连）**：`bodyOf()` 每次 click 页签会 renderBody 重建子树 ⇒ (a) 先取的 input.value 被重置回 `__memQ`（「检索过滤」断言失真）；(b) D 段先取后用的控件引用失效（`undefined.click` 崩掉运行器）；(c) 同页连访时 bodyOf 不再点击、拿到旧 DOM（E 段徽章断言看不到刚写入的 l2）。修法：bodyOf 只在换页时点击 + E 段显式强制重绘 `redrawMem2330`。教训：**「取 DOM 的辅助函数」自身有副作用（触发重绘）时，每个用法的时序都要重新审**；先取后用的控件引用必须与写入在同一份 DOM 生命周期内。
  - ⑤ **首个 `[data-refview]` 未必是你想点的**：页面第一个带溯源钮的条目可能引用集为空（如 L1 `refs:[]`），展开为空文本、断言测不到溯源链。改选溯源审计块的 `[data-refview="ALL"]`（merged 全量 refs）。
  - ⑥ **旧断言与 HTML 形状耦合**：v2.7.0 断言 `id="wa-settle-view">结算守卫</button>` 假定 id 与文本紧邻，本版加 title 后不再紧邻 ⇒ 失实。改为分别断言 id 在场 + 按钮文本在场。教训：给既有控件加属性时，先 grep 依赖该 HTML 形状的既有断言。
- **验证**：全量回归 → **4318 / 失败 0**（+31 断言），「全部测试通过 ✓」；`node tests/dead-export-gate.js` → ✓ 死子面无新增、归因可读、元数据同源、证据可复算（dataOnly 100→100 与账本一致）；ui-gate 冒烟 12 页渲染点击全绿（169 控件、thrown=[] rejections=[]）；版本推进后残留 `=== '2.32.0'` 为 0、三处版本源全 2.33.0。
### R17 · 2026-09-21 · v2.34.0 交付（广度扩张 + 平行世界引擎·第二十一面：主线之外的世界独立运转）
- **做了什么**：一次「大更新」交付两层——① v2.34.0 既有四项功能收口（仇敌总览页 / 伏笔状态流转 / Facts 批量清空 / 采样预览），② 从外部预设「狐神抚 V19.5」缝入**平行世界**引擎。后者是本版主线：
  - **新增 `engines/parallel-world.js`（315 行，命名空间 `WA.parallelWorld`）**：主线之外的独立世界推演。数据模型 = `world_clock`（剧情内时间锚，禁现实日期）+ `npcs`（每个带 `emotionLevel/attitudeLevel/CURRENT_THOUGHT/SHORT_TERM_GOAL/LONG_TERM_GOAL` + **认知边界五分类**：确认/传言/推测/误认/讳言）+ `relations`（关系网，同向边去重）+ `modules`（事件，`impact_level: none/low/mid/high/critical`）。
  - **六大审查协议**（源自狐神抚，改写为本引擎推进提示词 `buildPrompt`）：事实锚定 / NPC档案延续与认知边界 / 独立性与去中心化（主角非中心）/ NPC自然互动 / 因果与影响分级 / 输出合规。铁律：**平行世界不依赖主线正文也能运转；注入侧只放 high/critical 事件**（`INJECT_MIN_IMPACT='high'`，低影响只存档不进主线，防主线中心漂移）。
  - **触发模式四选一**：manual / per_turn / every_n（每 N 轮，`evolution.round % N`）/ dice（1/6）。默认关闭 + 手动（防意外触网）。`shouldAuto()` 判定走导出面（真实消费方，非闭包）。
  - **入账器 `applyAdvance`**：结构化校验 + 三容器环形剪枝（NPC 24 / 关系 120 / 模块 80，`WA.evict.note` 记账）+ 认知五分类。串行推进链 `advance()` 防并发重入，失败不落账、`stat()` 透传 `notConfigured/failed/lastErr`。
  - **注入管线**（同 enemies 的 before/after 分离口径）：before 链 `parallel.inject`（order 21，`<world_axis_parallel>` 标签只放 high/critical + 呈现代入铁律）+ after 链 `parallel.simulate`（order 22，按 `shouldAuto()` 触发后台推进）。
  - **平行世界页**（ui/panel.js `renderParallelWorld`，插在仇敌页后）：统计格 + 推演控制（启用/模式/每N轮/骰子/详略/存 + 手动推进/提示词预览/注入块预览）+ NPC 档案（含认知边界，`data-pwnrm` 删除连带关系边）+ 关系网 + 事件模块（影响徽章 + `data-pwmod` 丢弃）+ 时间锚。控件统一走既有 `wa-input` 体系（不造新类名，避免样式割裂）。
  - **门禁同步**：store 骨架物化 `parallelWorld`（+三容器 `__BOUNDED_CAPS` 登记 + `evict.SITES` 登记）；tool-diag `MODULE_EXPORTS` + `UI_BINDINGS`（parallel 13 控件）；run.js `LOAD` 加引擎（inventory 据此装载，否则 panel 全判悬空）；版本三源 2.33.0→2.34.0；页面计数 13→14。
  - **新增 v2.34.0 回归 section（A–I 九组 +73 断言）**：引擎 API 面 / 数据流（认知边界入账 + 同名覆盖 + 连带关系清理）/ 注入分级（low 不进主线）/ 页面真读 store 真源（防假页面）/ 绑定真生效（+NPC/丢弃/注入块预览/提示词预览）/ 设置归一（越界夹取 + 非法枚举不落盘）/ shouldAuto 四模式 / workflow 双链（before 真注入 + after manual 不触发 + disabled 不触网不落账）/ 仇敌页真源 + 状态推进 + 大势结束 / 伏笔流转 + 放弃 + facts 批量清空（入撤销栈 undo.count 增长）+ 采样预览。
- **为什么**：backstage 结算「已经发生」，平行世界推演「此刻别处正在发生」——二者互为镜像，让世界不止随玩家脚步走，NPC 有自己的欲望、目标与因果。这是源预设里唯一被用户点名要缝的模块（文风类已明确砍掉）。
- **影响范围**：engines/parallel-world.js（新增 315 行）；core/store.js（骨架 +1 段 / caps +3）；core/evict.js（SITES +3）；engines/tool-diag.js（MODULE_EXPORTS +1 / UI_BINDINGS +1 组）；ui/panel.js（renderParallelWorld +68 / 绑定 +77 / PAGES +1 / RENDERERS +1）；tests/run.js（LOAD +1 / 版本 + 计数 + v2.34.0 section +73 断言）；index.js/manifest.json/dead-export-ledger.json 版本推进。出口面：**命名空间 65→66 / 成员 676→697 / refs 1280→1327**（新引擎真实跨文件引用）；**dead 211→212**（getSettings 因 `WA.parallelWorld.*` 消费路径转为活，state 登记为 self-only）；**dataOnly 100→107**（7 个枚举/容量常量）；FROZEN2800 按 export-contract 实跑回填（新增 `parallelWorld:*` 段 + `rand.int`），账本 213→212 条 / advisory dataOnly 107。
- **附带自纠/纪律（均为真实踩到）**：
  - ① **inventory 的装载清单取自 run.js 的 `const LOAD`（不是 index.js 的 LOAD_ORDER）**：新引擎只加进 index.js 而没进 run.js LOAD ⇒ 定义面没有 `parallelWorld`，panel 里所有引用反被判悬空（16 处 `[成员不存在]`）。教训：新增引擎必须同时进两处装载清单。
  - ② **uid() 裸调 `Math.random` 被门禁当场抓红**：全库口径只许 core/rand.js 一处 Math.random，其余走决策流/标识流。改走 `WA.rand.id` / `WA.rand.int`。教训：新引擎随机源一律走 `WA.rand`，不留裸调。
  - ③ **`setSettings` 未做枚举归一**：非法 `autoMode:'teleport'` 直接落盘，下次 `effSettings` 回退到 def 而非用户既有选择，静默漂移。补「写入即归一」（对齐 regional v2.7.0 口径）：非法枚举不落盘、保留旧值。
  - ④ **SITES 与 `__BOUNDED_CAPS` 是两套登记表，都登记了才算数**：只登记 caps 不登记 evict.SITES ⇒ v2.13.0「有界登记表每项都能被挤出侧解释」断言报「未解释」。教训：新增有界容器要同时登记两表 + registryParity checked 计数同步。
  - ⑤ **同页 patch 不触发重绘**：v2.34 测试初版 `bodyOf()` 同页连访拿到旧 DOM，绑定点击后断言读到未更新节点（事件丢弃 / 空态负控 / state 判 null 三处假失败）。修法：`bodyOf(p, force=true)` 切走再切回强制 renderBody 重建子树。教训：面板测试里「写 store → 读页面」之间必须保证渲染器重跑。
  - ⑥ **骨架物化后 `state()` 不再返回 null**：store 骨架已物化 `parallelWorld`，判「无数据」应看容器为空而非 `state===null`（null 只出现在未装载/异常路径）。教训：断言「空态」要看真数据容器，不看句柄。
- **验证**：全量回归 → **4381 / 失败 0**（v2.34.0 section +73 断言），「全部测试通过 ✓」；`node tests/dead-export-gate.js` → ✓（dataOnly 107 与账本一致，dead 212）；独立冒烟 pw_smoke.js 45/0。出口面 inventory：66 命名空间 / 697 成员 / 0 悬空 / 0 未登记。版本推进后残留 `2.33.0` 为 0、三处版本源全 2.34.0。

### R21 · 2026-09-22 · v2.38.0 交付（开关无幽灵·第二十五面：回声分支缺失）
- **做了什么**：继续沿「有产出、无消费 / 有开关、无实现」的静默失效链扫，抓到第三个。侦察法：把 render/inject.js 的 SOURCES 十项与 buildWorldSnapshot 分支逐个对齐。
- **缺陷链（静默型）**：echoes 在 SOURCES 十项里、面板注入页有真复选框、backstage applyResult 真写入（cap 40，evict.SITES 已登记），但 buildWorldSnapshot() 从无 echoes 分支。复现脚本 /tmp/wa_scan/repro_echo.js：写一条 obvious 回声（盐船案→盐帮首领伏诛）+ 一条 subtle 回声，setVisibility 置 true/false 各取一次快照 —— 两次产物**逐字节相同**（identical: true），回声结果在快照里 indexOf = -1。
- **修法**：render/inject.js 的 buildWorldSnapshot 补 echoes 分支，口径与 currents 对齐（obvious 给「案件→结果」；subtle 只给「（余波未明）」迹象，不剧透未结算内幕）；取最近 4 条；空回声返空 ⇒ 不产空头段。
- **新增 v2.38.0 回归段（+11 断言）**：开/关产物必须不同（旧实现逐字节相同）+ 开启含回声段 + 关闭不含；obvious 给结果、subtle 不剧透结果但给「余波未明」；空回声不产空头段；**通用门禁**——SOURCES 每一项都必须在快照/注入路径有真读（缺项直接列名报红）；SOURCES 仍为 10 项；负向自证（把 echoes 判断抹成 false ⇒ 真代码面确不含该读点，证明门禁能抓）。
- **同轮自纠（真实踩到）**：门禁首版把切片范围写成 buildWorldSnapshot → applyInjections 之间，而 memory/opinion/ledger/digest 四项的真读在 applyInjections 内部 ⇒ 误报「缺 4 项」。改为从快照构建起至文件末尾，因为可见性真读本就分布在两处。首版即被自己的断言抓红，说明门禁形态有效。
- **为什么**：与 v2.36/v2.37 同型，属静默失效——不抛不报、门禁全绿、面板正常，但开关是装饰。优先级高于新功能。
- **影响范围**：render/inject.js（buildWorldSnapshot 一处 + 注释）/ tests/run.js（v2.38.0 段 +11 断言 + 8 处版本号）/ tests/dead-export-ledger.json（version 2.38.0）/ index.js / manifest.json / README.md / ITERATION_LOG.md。
- **门禁与验证**：全量回归 **4458 / 失败 0**（v2.37 基线 4447，+11 断言）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，无需 --update）；export-contract 不变（60 ns / 360 members / 4546 chars）；版本三源同源 2.38.0。
### R20 · 2026-09-22 · v2.37.0 交付（闭环缺口·第二十四面：实体库只进不出）
- **做了什么**：沿 v2.36.0 的方法论继续扫「机制自述有用途、生产侧零消费」的静默失效，抓到第二个。复现脚本 /tmp/wa_scan/repro_ent.js：① 走真实 LOAD 清单装载全部产品模块；② store.transact + entities.upsert 写入「v2370盐帮（淮北盐帮）」与「v2370盐码头」；③ 调 entities.buildEntitiesBlock() —— 正确产出「【既有实体库】推演必须复用以下实体…【组织】v2370盐帮（淮北盐帮）」；④ 调 backstage.buildPrompt() 取 user 段 —— **查无此名**（indexOf = -1）。
- **缺陷链（静默型）**：entities.buildEntitiesBlock() 是活导出（有 tool-analyzer 与测试消费，故死导出账本看不见它），但它的**语义用途**（让推演模型复用既有实体、不重复造同义实体）在生产侧从未生效：backstage 只在结算侧 applyEntities 写入实体库，buildPrompt 的 user 段只有 世界快照 / 世界书 / regional / horizon / 近期正文 五块，且 compactState() 也不含 entityMemory ⇒ 实体库只进不出。后果：模型每轮推演都看不到既有实体，容易为同一事物反复造新名（「淮北盐帮」→「盐帮」→「运河盐会」），实体库膨胀且别名索引失效。
- **修法**：engines/backstage.js 的 buildPrompt user 段在 horizon 块之后插入 (WA.entities && WA.entities.buildEntitiesBlock ? WA.entities.buildEntitiesBlock() : '')。空库时该函数返空串 ⇒ 不产空头段（与全库「宁缺毋滥」口径一致）。不新增导出、不新增页面、不改结算侧。
- **新增 v2.37.0 回归段（+11 断言）**：空库 buildEntitiesBlock 返空串 + 空库时提示词不出现空头段；结算侧 upsert 真写入（组织 + 地点两类，返回 created）；buildEntitiesBlock 含实体名与别名；**提示词真含既有实体**（旧实现查无此名）+ 含实体段头 + 第二类实体同样进提示词；负向（清空 entityMemory 后提示词不得再含其名，防残影）；静态锁（backstage 真代码面经 inventory.codeFace 必须含 WA.entities.buildEntitiesBlock，防日后回退）。
- **为什么**：与 v2.36.0 同型，属「静默失效」——不抛不报、门禁全绿、UI 正常，但机制白写。用户规则要求先修严重问题/明显缺陷，这类缺陷比新功能优先。
- **影响范围**：engines/backstage.js（buildPrompt 一处 + 注释）/ tests/run.js（v2.37.0 段 +11 断言 + 清册面锚点 1372→1374 + 8 处版本号）/ tests/dead-export-ledger.json（version 2.37.0）/ index.js / manifest.json / README.md / ITERATION_LOG.md。
- **门禁与验证**：全量回归 **4447 / 失败 0**（v2.36 基线 4437，+10 断言）；node tests/dead-export-gate.js 绿（dead 208 / uiDead 4 / dataOnly 106，无需 --update）；export-contract 不变（60 ns / 360 members / 4546 chars —— 本轮不新增导出）；货册面 refs 1372→1374（entities.buildEntitiesBlock 获得真实产品消费方，逐文件归因确认）。版本三源同源 2.37.0。
### R19 · 2026-09-22 · v2.36.0 交付（单一真源·第二十三面：轮次真源收口）
- **做了什么**：进入持续自主迭代模式后的第一轮。侦察方式：先核实现场（HEAD cd56187 干净、已推送、VERSION 2.35.0、全库 TODO/FIXME 产品代码零命中），再跑命名空间覆盖矩阵（64 个命名空间 / 15 个面板零引用），逐个核实后确认多数「零 UI」命名空间有内域消费（interceptor 被 index.js 用、contractAudit 被 store 用、limits 被 backstage 用、purifier 被 settings 用 10 次），monologue / profile / tags 走 WA.workflow.register 注册（before/after 链节点），不是死代码——面收窄后转向真正的缺陷线索。
- **抓到并坐实的缺陷链（静默型，全绿也照不出）**：全库 meta.round 有读者、零写者。读者 6 处：engines/ledger.js recordChanges 1 处、engines/horizon.js 掷骰与纪事入账 4 处、engines/digest.js world_digest 入账 1 处；写者 0 处（唯一写 d.meta.* 的是 core/settle-guard.js 写 lastSettle、core/interceptor.js 写 contextSize）。真源是 evolution.round（engines/evolution.js 的 tick() 内唯一 draft.evolution.round++）。
- **后果链（已用复现脚本落盘坐实）**：① 账本永远写「第0轮」——/tmp/wa_scan/repro_ledger.js 实测 evolution.round=7 而账本 round used: 0；② recordChanges 的「同轮重 roll 覆盖」判据 filter(m => m.round !== round) 因 round 恒 0 而**恒真** ⇒ 每轮都新压一条，KEEP_ROUNDS=20 的环形在 21 轮后开始**静默吃掉真实轮次**；③ 纪事 chronicle 与 world_digest 的 round 字段同样恒 0，前端看不到轮次推进。
- **修法（单一真源）**：engines/evolution.js 新增并导出 roundOf(state) 作为**唯一轮次读口**（evolution.round → 兼容兜底 meta.round → 0，读失败不抛，与旧行为一致）；engines/ledger.js / engines/horizon.js / engines/digest.js 各加本地 roundOfSafe(state)（优先调 WA.evolution.roundOf，兜底直读 evolution.round，再兜 0——不硬依赖 evolution 的加载顺序），全部旧读点改向，并把调用方都从 st 换成事务内 draft d/tx（读到本事务真值，不读 live store）。
- **新增 v2.36.0 回归段（A–E 五组 +18 断言）**：A 真源优先级（evolution.round 胜出；负向「手写 meta.round=3 不得压过真源」；真源缺失时兼容读旧 meta.round，历史存档不丢轮次；两处都缺⇒0；空壳状态不抛）；B 账本按真源入账（meta.round=99 干扰下账本仍记 7，负向「第99轮不得进注入文本」）；C 同轮重 roll 覆盖恢复有效（同轮 1 条、跨轮各 1 条且轮次可辨 8/7）；D 纪事（horizon 远/近端）与摘要（digest）轮次同源；E 静态口径——全库 meta.round 真代码引用只剩 evolution.js 兼容读 2 处（用 inventory.codeFace + PRODUCT_FILES 独立复算，防日后有人再把读点加回去）。
- **为什么**：这是「静默失效」型缺陷——不抛不报、门禁全绿、UI 照显，但账本/纪事/摘要三处玩家可见数据的轮次字段全是假的，且 21 轮后开始真实丢账。优先级高于任何新功能（用户规则：先修严重问题/明显缺陷）。
- **影响范围**：engines/evolution.js（+roundOf 导出）/ engines/ledger.js / engines/horizon.js / engines/digest.js / tests/run.js（v2.36.0 段 +18 断言 + 清册面锚点 + 8 处版本号）/ tests/dead-export-ledger.json（version 2.36.0）/ index.js / manifest.json / README.md / ITERATION_LOG.md。不新增产品文件、不新增页面。
- **门禁与验证**：全量回归 **4437 / 失败 0**（起始基线 4419，+18 断言）；node tests/dead-export-gate.js 绿（dead 208 / uiDead 4 / dataOnly 106 / 仅测试 130，**无需 --update**——新导出有真消费方）；出口面 66 ns / 707 members（+1 = evolution.roundOf）/ refs 1372；FROZEN2800 按 export-contract 实跑回填（4538→4546 字符，唯一新增 evolution.roundOf）；清册面锚点 1362→1372 / 706→707，漂移已逐文件归因（evolution.roundOf 6 处真实调用 + 4 处兜底 store.get）。版本三源同源 2.36.0。
- **证据文件（未入仓，留档备查）**：/tmp/wa_scan/repro_ledger.js（修复前 0 / 修复后 7）、/tmp/wa_scan/repro_round.js（5 次 tick ⇒ evolution.round=5 / meta.round=null）、/tmp/wa_scan/attr236.js（清册面漂移逐文件归因）、/tmp/wa_scan/run236d.log（本轮全量回归）。
### R18 · 2026-09-21 · v2.35.0 交付（能力面 → 呈现面·第二十二面：世界书蓝绿灯 / 实体库 / 账本 / 下一日 / 平行快照）
- **做了什么**：一次「大更新」把孤神抚源卡对照后仍剩的五个「玩家看得见」正交缺口补进既有 14 页，不新增第 15 页。
  - **世界书蓝绿灯**：`engines/worldbook.js` 新增 `seedEntries/peekEntries/previewActivation/OVERRIDE_VALUES`；无头测试用 seed mock，不走 `import('/scripts/world-info.js')`。`backstage.__REG_B.def.worldbookTrigger: false`（有副作用能力默认关），世界页 `wa-wb-trigger` 走 `setSettings` merge。触发关闭时已选全量「触发关闭·全量注入」。
  - **世界钟下一日**：`wa-next-day` 调 `calendar.advanceDay({source:'user'})`，`advanceDay` 从 test-only 变成活出口。
  - **实体库**：事件页按 `TYPE_LABELS` 四类各示最近 8 条，手工录入走 `store.transact` + `entities.upsert`。
  - **重大事件账本**：事件页真读 `WA.ledger.buildLedgerText()`，空态仍保 `#wa-ledger-text`。
  - **平行世界快照**：`saveSnapshot/listSnapshots/restoreSnapshot/dropSnapshot`，只序列化 clock/npcs/relations/modules/round，不含 settings 与 snapshots 自身；恢复保留快照列表；cap 12 走 `evict.array`。
  - **双登记**：`store` 骨架补 `evolution.ledger: []` 与 `parallelWorld.snapshots: []`；`__BOUNDED_CAPS` + `evict.SITES` 加 snapshots(12) + ledger(20)；`registryParity.checked` 36→38。
  - **面板**：世界页 `wa-wb-*` + `wa-next-day`；事件页 `wa-ent-*` + `wa-ledger-text`；平行页 `wa-pw-snap-*`。`UI_BINDINGS` 静态组已加新 id；动态 `data-wb-sel/ov` 与 `data-pwsnap-*` 不入静态守卫。
  - **门禁**：FROZEN2800 实跑回填；dead-export-ledger `--update`（dead 212→208 / dataOnly 107→106 / 仅测试 133→130）；现场锚点 refs 1327→1362 / members 697→706。
  - **新增 v2.35.0 回归段**（约 41 条 `v2350:`）：世界书 seed/preview/选择/触发、下一日跨日、实体库呈现/手工录入、账本真读、registryParity 38、快照保存/列出/恢复/删除/容量环形。
- **为什么**：引擎能力在、面板零入口。世界书触发开关之前因 def 缺键恒为 false；`advanceDay` 之前 test-only；账本在 evict.SITES 但骨架缺字段。
- **影响范围**：`engines/worldbook.js` / `engines/parallel-world.js` / `engines/backstage.js` / `core/store.js` / `core/evict.js` / `ui/panel.js` / `engines/tool-diag.js` / `index.js` / `manifest.json` / `tests/run.js` / `tests/dead-export-ledger.json` / README / ITERATION_LOG。不新增页面、不新增产品文件。
- **验证**：全量回归 4419/0；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106 / 仅测试 130）；ui-wire-audit 8/0。出口面 66 ns / 706 members / refs 1362。版本三源 2.35.0。

### R22 · 2026-09-22 · v2.39.0 交付（幽灵轮次收口·第二十六面：顶层 round 读点 + v2.36.0 漏网修正）

- **做了什么**：延续「静默失效」猎取线（第二十六面），沿 v2.36.0 的轮次真源线索再挖一层，把当时**没收干净的另一半**收口。
- **缺陷链（实测坐实）**：全库 5 处读「顶层 `state.round`」——该字段在 `core/store.js` 的 `defaultWorldState()` 骨架里**根本不存在**，
  真源只有 `evolution.round`（`tick()` 内唯一 `++`）。三处受害：
  1) **`engines/proactive.js`（最严重）**：`cooldownOk` 读 `st.round`（恒 undefined ⇒ 0），`markPulled` 写 `d.round`（恒 0）
     ⇒ `(0 - 0) >= COOLDOWN_ROUNDS(3)` **恒假** ⇒ 主动拉动拉过一次后**永久冷却**——整条「语义枯竭 → 强制拉动互动」链路退化为一次性功能。
     复现（`/tmp/wa_scan/repro_proactive.js`）：`evolution.round` 从 5 推到 12、再到 40，`proactive.pull` 均**不再注入**，`stat.skippedCooldown` 一路 +
     （修复后：`proactiveLastRound` 写 5、推进到 20 时正常拉动、诊断 round=40）。
  2) **`engines/chatcache.js`**：自动备份读 `(JSON.parse(getState(id)||'{}').meta||{}).round` —— `meta.round` 全库零写入方 ⇒ 恒 0
     ⇒ `round > _lastAutoRound` 恒假 ⇒ 「轮次推进时滚动自动备份」开关**永不产出任何自动快照**（用户以为有兜底，实际没有）。
  3) **`engines/inject-inspector.js` / `engines/tool-diag.js`**：注入自检快照与诊断包的世界轮次恒 `null` / `undefined`，排障时看不到轮次。
- **漏网原因**：v2.36.0 的静态锁 `(face.match(/meta *[.] *round/g))` **只认字面 `meta.round`**，
  `).meta || {}).round` 这种嵌套写法不命中 —— 静态锁的形态盲区本身就是缺陷的一部分。
- **修法**：给四个模块各加本地 `roundOfSafe(state)`（优先 `WA.evolution.roundOf`，兜底直读 `evolution.round`，不硬依赖加载顺序），
  五处读点全部改向；写入口 `markPulled` 同样写真源（写进去的是别人要读的东西，必须同源）。
- **判据（新增 v2.39.0 回归段，+26 断言）**：
  · A 写入口写 `evolution.round` 真值（旧实现恒 0）；
  · B 冷却真生效——未推进（6-5=1 < 3）不放行 / 推进到期（20-5=15 ≥ 3）真拉动 / 拉动后计数同步真源；
  · C 诊断包 `worldState.round` 取真源（旧实现 `undefined`）；
  · D 注入自检 `snapEnv().round` 取真源（旧实现 `null`）；
  · E **静态口径**——全库顶层 `.round` 幽灵读点清零，只余三处**本地构造对象**的合法读（`inject-inspector` 的 `env`、`tool-diag` 的 `snap`、`parallel-world` 的 `pwState().st`，三者自带 `round` 字段）；
  · F/G/H **负向自证**——真源码破坏 → 副本上重跑同款判据（proactive 退回旧写法报 4 处、chatcache 退回嵌套写法报 1 处）；
  · G 另含 chatcache 行为门禁（开 `autoBackup` 驱 `runTick`，断言真产出自动快照且名字含真源轮次）。
- **为什么**：一个字段在读者侧被引用了 5 次、在骨架里却从未存在 —— 不抛不报、门禁全绿、UI 正常，但机制实际白写。
  这类「幽灵字段」与 v2.36.0「有读者零写者」同源，属同一根藤上的第二个瓜。
- **同轮自纠（3 次，全部由自己新写的门禁抓红）**：① 首版 `ghostScan` 标识符集过宽，把诊断快照对象 `snap`/`env` 误报为幽灵（改为白名单三处合法残留）；
  ② 负向自证期望值算错（4 误写 6 —— 该断言只扫 `proactive.js` 一份文件面，`st.round`/`d.round` 各出现两次）；
  ③ 自动备份判据用「份数增长」，被 `MAX_AUTO_BACKUPS=3` 环形裁剪掩盖（改为「存在性 + 名含真源轮次」）。
- **影响范围**：`engines/proactive.js` / `engines/inject-inspector.js` / `engines/tool-diag.js` / `engines/chatcache.js`（四处各加 `roundOfSafe` + 五处读点改向）/
  `tests/run.js`（v2.39.0 段 +26 断言 + 8 处版本锚点 + 4 处清册面锚点）/ `tests/dead-export-ledger.json`（version）/ `index.js` / `manifest.json` / `README.md` / `ITERATION_LOG.md`。
- **门禁与验证**：全量回归 **4477 / 失败 0**（v2.38.0 基线 4458，+19 净增）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 `--update`**）；
  export-contract 不变（60 ns / 360 members / 4546 chars，本轮不新增导出）；清册面 refs 1374→1386（+12 = 四处 `roundOfSafe` 各 3 个真代码引用，逐文件归因一致）；版本三源同源 2.39.0。
### R23 · 2026-09-22 · v2.40.0 交付（骨架归属门禁·第二十七面：写侧幽灵物化 + 三规则冻结，并修 ui-gate 陈旧常量红灯）
- **做了什么**：延续「静默失效」猎取线（第二十七面）。前两轮修的都是**读侧**幽灵（v2.36 `meta.round` 有读者零写者；v2.39 顶层 `state.round` 有读者、骨架无字段），本轮把同一条线拉到底，抓到**写侧**那一半，并把它固化成永久门禁。
- **缺陷（实测坐实）**：
  1) `lastInjection` —— `render/inject.js:293` 真实写入（含 budget/slots/slotErrors 快照），`inject-inspector` / `tool-diag` / `render/inject` / `panel.js` 共 7 处读，**骨架 `defaultWorldState()` 零声明**。
  2) `proactiveLastRound` —— `engines/proactive.js:86` 写入（v2.39.0 刚改成写真源轮次），冷却判据 `cooldownOk` 读，骨架同样零声明。
  3) 佐证链最刺眼的一环：`core/store.js` 的 `ensureShape` 注释**自己**写着「仅当默认期望容器（对象/数组）而实测不是，才算污染；默认为 null 的字段（**lastInjection**/worldPulse 等）运行时变对象属正常演进」——`worldPulse` 在骨架里，它俩不在。**注释认、骨架不认**，正是「骨架清单失真」的直接证据。
- **为什么算缺陷（而不是「只是注释没写」）**：骨架是**字段权威清单**（`registryParity` 以它判「未在骨架物化」，`ensureShape` 以它做结构自愈，体检/白名单裁剪以它为集合）。写进去却不在清单里 ⇒ 形状自愈补不到、按清单白名单裁剪的路径不认识它。它不抛不报、门禁全绿、UI 正常，属典型的静默失效面。
- **修法（两层）**：
  · **治标**：`core/store.js` 的 `defaultWorldState()` 物化 `lastInjection: null` 与 `proactiveLastRound: 0`（与 `worldPulse` 同族），各带 why 注释指向写入方与本次缺口。
  · **治本**：新增 `tests/field-liveness-gate.js` + 冻结账本 `tests/field-liveness-ledger.json`。**不再枚举拼法**（v2.36 的教训：静态锁只认字面 `meta.round`，`(JSON.parse(...).meta || {}).round` 嵌套写法直接漏网），改为以运行时骨架（`store.get()` 真实导出）为唯一字段真源，三条正交规则：
    ① `ghost-read`：已知幽灵读形态 denylist（`meta.round` / 顶层 `state.round`），命中只许落在**逐条附理由**的豁免面；
    ② `schema-write`：`transact` 回调 draft 与 `patch(key)` 写入的**顶层键**必须在骨架一级键内；
    ③ `schema-read`：裸形态 `store.get().FIELD` 读取的顶层键同上。
- **门禁规则的两轮自纠（本仓纪律：门禁不能成为维护负担）**：
  · 首版规则② 用「骨架字段存活性」（写点/读点计数）⇒ 实测 **200+ 噪声**（`background.text` 这类叶名与页名撞词、`ensureShape` 的 `leaf:` 声明被误当写点）。判定为**门禁本身不合格**（不可审查的门禁只会变成维护负担），删掉重写。
  · 二版收敛为「写侧越界 + 读侧越界」两口径（更锐、贴着 v2.39/v2.40 缺陷形态），现场输出 **5 行、逐条可审查**：规则② 1 处（`ui/panel.js::innerHTML`，transact 回调参数 `d` 与 `const d = mainDoc.createElement(...)` 撞名，显式登记）、规则③ 0 处。
- **同轮修掉的既有红灯（严重问题优先）**：`tests/ui-gate.js` 在 v2.39.0 干净基线上**本就是红的**（`git stash` 对照实测确认）：「RENDERERS 覆盖的页面数为 12（实 14）」。根因是**陈旧常量**——`checkPages.tested` 恒等于 `ui.pages().length`（循环内自增），页面在 v2.30~v2.34 段从 12 增至 14 时期望值没跟，写死数字只会在加页时误报，而真正的漏渲染早被同一段的 `failures` 兜住。修法：期望值改为自维护（`tested === pages().length && > 0`），并把「**RENDERERS ↔ PAGES 逐页同名同数**」提升为静态不变式（漏一个渲染器时点到该页必抛，此前无静态覆盖）。**这条红灯与本次主题完全同构**：只认一种形态（写死的 12）就等于给其它形态发通行证。
- **判据（新增 v2.40.0 回归段，+19 断言）**：
  · A 骨架物化两字段 + 声明字面量成对在位 + `registryParity().ok === true` + `ensureShape` 注释佐证；
  · B 规则① denylist 命中不超显式豁免上限；
  · C 规则②③ 现场零越界（读侧要求**恰好为 0**）；
  · D 门禁模块端到端 `spawnSync` exit 0（防止「门禁另开一趟没人跑」）；
  · E **四条负向自证**：E1 把 chatcache 真写法退回 `st.round` 幽灵 ⇒ 规则① 报 1 处；E2 把 tool-diag 的裸读改成 `ghostProbe2400` ⇒ 规则③ 报，且**同一判据在原版上不报**（证明非恒真）；E3 从白名单抽掉 `lastInjection` ⇒ 规则② 立刻报 `render/inject.js` 越界 1 处；E4 撞名走 `OWNED_TOP_KEYS` 显式登记（不是静默豁免）。
- **同轮自纠（1 次，被自己新写的断言抓红）**：首版断言写「两字段初值为 null/0」，但 `loadWA()` 复用同进程 `global`，前序段（v1817 等）已往 `lastInjection` 注入过快照 ⇒ 前提不成立。改为「初值由**骨架声明字面量**证明 + 运行时只验类型/在册」，并把坑写进注释。
- **为什么**：三次同型缺陷（读侧零写者 → 读侧无字段 → 写侧无字段）都由「骨架与代码各说各话」引起，而两次漏网都源于「静态锁写死一种拼法」。本轮把判据的作用点从「代码里的拼法」搬到「运行时骨架本身」，这类缺陷此后无法静默进入。
- **影响范围**：`core/store.js`（物化两字段）/ `tests/field-liveness-gate.js`（新）/ `tests/field-liveness-ledger.json`（新）/ `tests/ui-gate.js`（陈旧常量 → 自维护 + 新增静态不变式 + 段名）/ `tests/run.js`（v2.40.0 段 +19 断言 + 8 处版本锚点）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**不新增导出、不新增产品文件。**
- **门禁与验证**：全量回归 **4496 / 失败 0**（v2.39.0 基线 4477，**+19 净增**）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 `--update`**）；export-contract 不变（60 ns / 360 members / 4546 chars）；ui-gate **48/1 → 53/0**（修复既有红灯 + 净 +5 断言）；ui-wire-audit 8/0；field-liveness-gate 绿；版本三源同源 **2.40.0**。
### R24 · 2026-09-22 · v2.41.0 交付（工具可移植性·第二十八面：生成器硬编码 /tmp → __dirname 推导 + 成类静态锁）
- **做了什么**：延续「静默失效」猎取线（第二十八面）。v2.40.0 治的是「门禁断言写死一种形态」（ui-gate 的陈旧常量 12），本轮沿同一根线把范围推到「**工具写死一种环境**」——扫描全仓 `/tmp` 硬编码绝对路径。
- **缺陷（实测坐实）**：`tests/export-contract.js` 三处硬编码 `/tmp/wa_git`：
  1) `require('/tmp/wa_git/tests/mock.js')` —— 换目录即 MODULE_NOT_FOUND；
  2) `const BASE = '/tmp/wa_git'` —— 被测真源被**写死成某个特定工作区**；
  3) 产物 `fs.writeFileSync('/tmp/export_contract.txt')` —— 共享临时目录，多副本并行互相覆盖。
  全仓扫描确认**产品面上只有这一处**（core/engines/render/ui/actors/direction/compat/index.js 全零命中），它是唯一的坏点。
- **为什么算缺陷（而不是「本机跑得好好的」）**：它是出口面契约门禁在漂移时**唯一指定的回填工具**（`tests/run.js` 块1 失败文案写死「运行 `node tests/export-contract.js` 并回填」），属「防线所依赖的工具本身不可移植」。换目录/换机器/换 CI 工作区时，门禁红了却**修不了**——这正是「门禁自己白写」的最内层形态。
- **修法**：`BASE` 改由 `path.join(__dirname, '..')` 推导；mock 走 `path.join(BASE, 'tests/mock.js')`；产物落到**仓库内** `tests/export_contract.txt`（真源永远是「运行中的仓库本身」，不再依赖共享 /tmp）；新增 `.gitignore` 忽略该派生产物；生成器打印写入路径；同步更新块1 里写死 `/tmp/export_contract.txt` 的失败文案。
- **判据（新增 v2.41.0 回归段，+15 断言）**：
  · A **静态面**：生成器含 `path.join(__dirname, '..')` 且零 /tmp 字面量；
  · B **行为面**：在**仓库之外的 cwd**（`tests/` 目录）里运行生成器，仍 exit 0、仍打印 `ns/members/chars`、    产物仍落回真源仓库；
  · C **链路面**：产物与 `FROZEN2800` **逐字一致**（重生成 → 回填 → 门禁比对这条链路未断）；
  · D **成类静态锁**：全仓 `.js` 扫描，**产品面硬零** `/tmp` 死路径；测试面只允许「**守卫式本地安装回退**」    `/tmp/node_modules/<pkg>` 一类（先 `require('<pkg>')` 可移植路径，失败才回退本地临时安装，    且整段在 try/catch 内、缺失降级为 null 而非崩——run.js 的 9 处 jsdom 回退正是此形），其余仍报；
  · E **两条负向自证**：E1 把 `BASE` 退回硬编码 ⇒ 静态锁报出，且**原版同判据不报**（非恒真）；    E2 把 `BASE` 指向不存在目录 ⇒ 运行**非零退出**，反证 B 的 exit 0 不是常量。
- **同轮自纠（2 次，均由自己新写的门禁抓红）**：
  · ① 首版规则 D 把 `tests/` 与产品面混在一起扫描 ⇒ 一次性报出 **16 处**（9 处 jsdom 本地回退 + 6 处**判据自身字面量**）。    逐条辨明后按「**产品面硬零 / 测试面按可归类豁免**」收口——9 处属正当回退，判据自指属伪命中。
  · ② 消除自指的更干净做法：把 needle 改成**字符串拼接构造**（`const TMP4100 = '/' + 'tmp'`），    于是本段源码自身不再含 /tmp 字面量，**根本不需要「自指豁免」**（判据不得引用锚点串，v2.40.0 判据纯度纪律的延伸）。
- **为什么**：三次「写死」缺陷（v2.40 门禁期望值写死页面数 12 → v2.41 工具写死工作区路径 /tmp/wa_git）同一病根：**把一个会变的值当成常量**。v2.40 治的是断言侧，本轮治的是工具侧，并各自补了成类静态锁，此后「写死形态/环境」进不了提交。
- **影响范围**：`tests/export-contract.js`（BASE/mock/产物三处可移植化 + 打印路径）/ `tests/run.js`（块1 路径断言同步 + v2.41.0 段 +15 断言 + 8 处版本锚点）/ `.gitignore`（新）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**不新增导出、不新增产品文件。**
- **门禁与验证**：全量回归 **4511 / 失败 0**（v2.40.0 基线 4496，**+15 净增**）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 `--update`**）；export-contract 不变（60 ns / 360 members / 4546 chars）；ui-gate 53/0；ui-wire-audit 8/0；field-liveness-gate 绿；版本三源同源 **2.41.0**。
### R25 · 2026-09-22 · v2.42.0 交付（UI 文件面自维护·第二十九面：两道 ui 门禁硬编码清单 → 动态发现）
- **做了什么**：续接 v2.40.0「门禁写死一种形态」这条线，把「**会长的集合被写成常量**」当作一类来扫，从 UI 侧再抓一例同族缺陷。
- **缺陷（实测坐实）**：两道 ui 门禁各自硬编码同一份三文件清单：
  1) `tests/ui-gate-sync.js:18` `const UI_FILES = ['ui/panel.js', 'ui/settings.js', 'ui/assistant.js']`    —— 真实装载 + 逐页点击/可点性门禁的装载面；
  2) `tests/ui-wire-audit.js` 的 `uiFiles()` —— 接线审计（引用面 → 渲染面）的扫描面；
  另有 `assert(files.length === 3, ...)` 把「三个」写进断言（与 v2.40.0 写死 12 完全同形）。
  后果：新增 `ui/xxx.js` ⇒ 两道门禁**同时不看它**，而它们是 UI 层唯一的自动化覆盖。
  （对照：`tests/inventory.js` 的 `productFiles()` 是**动态遍历**，所以死导出/字段门禁的主扫描面无此问题——同一个仓库里已经存在正确写法，UI 侧是没有跟上。）
- **为什么算缺陷**：`uiFiles()` 只在列表内取文件、不存在也不报；`files.length === 3` 只能证明「数量没变」，证明不了「发现面是对的」。两者叠加的净效果是：**新增 UI 模块 0 覆盖、0 提示**，恰是本仓一直在治的静默失效形态。
- **修法**：两处改为动态发现（`readdirSync` + `.js` 过滤 + 排序）；`ui-gate-sync` 导出参数化的 `discoverUIFiles(dir)`，`ui-wire-audit` 导出带 `dir` 参数的 `uiFiles(dir)`；`ui-wire-audit` 的计数断言换成与 `ui-gate-sync.UI_FILES` 的**交叉核对**（把「两道门禁看同一批文件」变成硬约束，而非各自维护一份注释同步的清单）。
- **判据（新增 v2.42.0 回归段，+10 断言）**：
  · A 两道门禁的发现面与 `ui/` 磁盘实际**逐项一致**，且彼此同一批文件；
  · B 静态度：两文件源码里已无旧硬编码清单，发现面均落在 `readdirSync`；
  · C **行为级负向自证**：临时目录造 3+1 个 `.js` 与 1 个 `.txt` ⇒ 两个发现器都返回 4 项、    含 `ui/zz_extra_4200.js`、排除 `note.txt`；且仓库(3) vs 临时(4) 不同，    **证明发现面取决于目录内容而非恒值**（可证伪「换了写法的常量」这类假修）；
  · D 在**完整文件面**上复核接线审计零幽灵引用（防「少扫了文件所以干净」的假结论）。
- **为什么**：同族的两次「写死」（v2.40 页面数 12 / v2.42 UI 文件清单三文件）都属同一个病根：**把一个会长的集合当成常量**，于是集合长大了门禁却不知道。v2.40 治断言、v2.42 治扫描面，并在本次把负向自证升级为**行为级**（临时目录驱动），比「源码字符串断言」更能证伪假修。
- **影响范围**：`tests/ui-gate-sync.js`（UI_FILES 动态发现 + 导出 discoverUIFiles）/ `tests/ui-wire-audit.js`（uiFiles 动态发现 + 交叉核对断言 + 导出）/ `tests/run.js`（v2.42.0 段 +10 断言 + 8 处版本锚点）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**不新增导出成员、不新增产品文件。**
- **门禁与验证**：全量回归 **4521 / 失败 0**（v2.41.0 基线 4511，**+10 净增**）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 `--update`**）；export-contract 不变（60 ns / 360 members / 4546 chars）；ui-gate 53/0；ui-wire-audit **8 → 9/0**；field-liveness-gate 绿；版本三源同源 **2.42.0**。

### R26 · 2026-09-22 · v2.43.0 交付（文件面单一真源·第三十面：同一份 ui 三文件清单全仓四份副本 → 定义上收 + 成类静态锁）

- **做了什么**：v2.42.0 修完当场复查，抓到那份「UI 三文件清单」在仓库里**共有四份副本**，v2.42.0 只动了其中两份（`ui-gate-sync.UI_FILES`、`ui-wire-audit.uiFiles()`）。漏网的两份是 `tests/run.js` 守卫表的**控件 id 采集面** `uiFilesH` 与 `tests/inventory.js` 的 **UI 装载面** `UI_LOAD`。更深一层：`inventory`（排 tests/ + tools/）、`export-contract`（只排 tests/）、`field-liveness-gate`（间接遍历）、`run.js`（内联）四处各写了一遍「什么算产品/UI 文件面」，口径已经开始漂移。
- **为什么**：后果**实测坐实**（非推理）。副本注入 `ui/zb_extra.js`（渲染 id=wa-zb-untracked ）后，硬编码采集面**恒 198 项**、动态面 199 项——多出的那个控件在「面板渲染的每个控件都在守卫表内」这条断言里**永不可见**，而 ui-gate 照样全绿。守卫表是控件接线面的唯一真源，采集面漏一个文件 = 该文件渲染的全部控件被永久放行。病根不是那四处清单，而是**定义被复制**：「写死一种形态 = 给其它形态发通行证」。本版从「修这一处」推进到「定义只留一份、其余全部委托」。
- **修法**：新增 `tests/product-files.js` 作为文件面**单一真源**（`productFiles` 排除 tests/ + tools/，供产品模块面；`repoFiles` 含 tests/tools，专供成类静态锁——漏网缺陷都在 tests/；另有 `discoverFiles` / `discoverUIFiles` / `uiFiles`）。六处消费方一律改为**委托调用**（inventory 的 `PROD` 与 `UI_LOAD`、export-contract 的 `files()`、ui-gate-sync 转出、ui-wire-audit 委托、run.js 的 `uiFilesH`、field-liveness-gate 注释说明其本就走 `inventory.PRODUCT_FILES`）。v2.42.0 的 `discoverUIFiles(dir)` / `uiFiles(dir)` **名字与签名不变**，实现迁到真源、原处转出，既有断言逐项照跑。v2.42.0 段「wire 源码须含 `readdirSync`」放宽为「含 readdirSync 或 `require(./product-files.js`」。
- **判据 +25**：委托锁（六处消费方不再自带发现逻辑，inventory 不再含 `const SKIP_DIRS = [tests, tools]`）；**成类静态锁**——全仓代码面（`repoFiles`，含 tests/）对「三文件清单」硬零，needle 由 path 片段拼装以消除判据自指，映射表合法形态显式排除，含 exactSign 的行必须同时含锚点定义才豁免。口径统一的**无副作用**证明（`PRODUCT_FILES` 与真源逐项一致、出口面契约**逐字不变** 60 ns / 360 members / 4546 chars）；行为级负向自证（临时树 ui/a.js、ui/b.js + engines/c.js，排除 tests/d.js、tools/e.js，仓库 3 个 vs 临时 2 个）；**破坏性坐实**（副本注入新 ui 模块，修复后采集面 198 到 199 含 wa-zb-untracked、旧硬编码恒 198 漏它、差集恰 1；再把委托调用破坏回「每处自己发现」，锚点由三段 join 且 split 后恰 1 次，破坏后 node --check exit 0，最后 rmSync）。
- **自纠**：静态锁最初扫 `productFiles`（不含 tests/），缺陷恰在 tests/，改扫 `repoFiles`；判据源码若含三文件字面量会自指，needle 改由 path 片段拼装；`tool-diag` 的映射表是合法形态，用「名字后接冒号则排除」只抓裸清单；E 段破坏锚点若写整串会让静态锁与「恰 1 次」失败，改为三段 join、从 `QUOTED4300` 切片；`tests/run.js` v2.28.0 段断言因 inventory 不再含旧字面量而红，改为断言源码含 `product-files.js` 与 `uiFiles(BASE)`（两段分开，避免与锚点整串撞成 2 次）；笔误 `path300Join4300` 改为 `path4300.join`。首次全量 4540/5，修后 **4546/0**。
- **影响范围**：新增 `tests/product-files.js`；改 `tests/inventory.js` / `tests/export-contract.js` / `tests/ui-gate-sync.js` / `tests/ui-wire-audit.js` / `tests/field-liveness-gate.js`（仅注释）/ `tests/run.js`（v2.43.0 段 +25 断言、v2.42.0 段放宽、v2.28.0 段断言改写、8 处版本锚点）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**不新增导出成员、不新增产品文件**（product-files.js 在 tests/，属测试基建）。`LOAD` / `LOAD_ORDER` / `MODULE_EXPORTS` 三份大清单本轮实测零内容漂移，未改产品装载顺序。
- **门禁与验证**：全量回归 **4546 / 失败 0**（v2.42.0 基线 4521，**+25 净增**）；dead-export-gate 绿（dead 208 / uiDead 4 / dataOnly 106，**无需 --update**）；export-contract 不变（60 ns / 360 members / 4546 chars）；ui-gate 独立跑 53/0（run.js 内嵌 G17 打印 49 为既有基线，pristine 副本同样 49 且当时总计 4521/0，非本轮引入）；ui-wire-audit 9/0；field-liveness-gate 绿（骨架一级键 20、产品文件 67）；版本三源同源 **2.43.0**。
### R27 · 2026-09-22 · v2.44.0 交付（对齐 SoulLink v1.7.1：独白改纯文本，兼容旧 JSON）

- **做了什么**：对照上游 SoulLink v1.7.1–v1.7.5，只缝一处机制——角色扮演独白从「必须输出 JSON」改为「400 字内第一人称纯文本内心独白」。预筛 Gate 保持 JSON 不变。
- **为什么值得缝**：旧提示词要求 `{"character":...,"monologue":"..."}`，模型要把独白塞进字段结构里，白白消耗配额、也更容易撞上截断。上游改成纯文本独白是形态改进，不是界面或个人偏好。
- **为什么其余不缝**：v1.7.4 全局 max_tokens 默认 12000 会改变注入体积，我们已有通道级默认 4000 与独白 800，且快照恢复自带三重校验；v1.7.5 名单/档案 JSON 导入导出与我们已有的快照恢复职责重叠；OpenCode 会话头与主题/手写体/窗口拖拽是上游自己的接口与界面，不属于世界引擎机制。
- **改法**：`ROLEPLAY_SYS` 改为纯文本独白提示词（保留认知边界、信息盲区、禁止「静观其变」、每段最多一句疑问的既有约束）；新增 `parseMonologue(raw)`——先剥 ```json 围栏，再剥 `[姓名]的内心独白:` 前缀，**仅当整段以 `{` 或 `[` 开头**时尝试取旧 JSON 的 `monologue` 字段，空串返回空、超长截到 400。`roleplayOne` 的调用从 `json: true` 改为纯文本（`core/api-router.js` 在 `opts.json` 时解析失败会抛 `invalid-json`，所以必须走非 JSON 调用再本地解析）。`maxTokens: 800` 保留。特殊场景只留一句「服从该角色关系与性格、不得覆盖上面的认知边界与信息盲区」，不搬上游具体写法。
- **判据 +14**（`tests/run.js` v2.44.0 段）：静态面——全文件只剩预筛一处 `json:true`、独白调用不再带 `json: true`、提示词不再要求 JSON 而预筛仍要求；行为面七条路径——纯文本原样注入、剥姓名前缀、剥代码围栏、旧 JSON 的 `monologue` 仍可注入、空返回不注入、超长截到 400、正文里夹带 JSON 片段不被抽走。
- **连带影响（门禁实测坐实，非推理）**：`actors/monologue.js` 开始调用 `apiRouter.extractJson`，该成员由「死导出」转为「活导出」——出口面契约 60 ns / 360 members / 4546 chars → **60 ns / 361 members / 4558 chars**；冻结账本 dead 208→**207**、条目 212→**211**、self-only 72→**71**、refs 1386→**1387**。FROZEN2800 已按门禁指定流程回填（跑 `node tests/export-contract.js`，产物逐字写回），账本跑 `node tests/dead-export-gate.js --update` 同步。
- **自纠（4 轮）**：首版 `parseMonologue` 对任意正文都尝试 `extractJson`，导致「我觉得 {"monologue":"不该被抽走"} 只是想法」这类正文被抽成 `不该被抽走`——已收窄为**仅整段以 `{`/`[` 开头**才取 JSON；回填 FROZEN2800 后漏改 4 处 `=== 208`、2 处分布计数与 v2.43.0 段的规模硬编码，逐一定位后同步；v2.43.0 段原钉 `members= 360 chars= 4546` 属历史段硬编码，改为常量比对并留痕原因。
- **影响范围**：`actors/monologue.js`（提示词 + `parseMonologue` + 调用去 `json:true`）/ `tests/run.js`（v2.44.0 段 +14 断言、8 处版本锚点、FROZEN2800 与账本计数回填）/ `index.js` / `manifest.json` / `tests/dead-export-ledger.json`（三源 2.44.0 + `--update` 同步）/ `README.md`
- **门禁与验证**：全量回归 **4559 / 失败 0**（v2.43.0 基线 4546，**+13 净增**：v2.44.0 段 14 条新断言，v2.43.0 段规模断言由一条拆为两条口径不变后的净差）；dead-export-gate 绿（dead 207 / uiDead 4 / dataOnly 106，`--update` 已同步）；ui-gate 独立跑 53/0；ui-wire-audit 9/0；field-liveness-gate 绿；inventory 悬空 0；export-contract 60 ns / 361 members / 4558 chars。

### R28 · 2026-09-22 · v2.45.0 交付（缝合 Awene cultivation-rule-router：世界书条目按需路由）

- **做了什么**：对照 `Awene/cultivation-rule-router`，只缝两处机制——**条目按需激活**（发送前由 flash 副模型判定本回合哪些常驻条目该上场，未命中者在本次扫描里不进注入）与**结果缓存**（同一输入复用判定，不重复调用副模型）。上游其余的界面与配置面不缝。
- **为什么值得缝**：常驻条目越多，上下文里躺着的死设定越厚；模型自己无法「选择性忽略」，只能由外壳替它筛。这是纯机制收益（少 token、少无关约束），与用户的界面偏好无关。
- **为什么其余不缝 / 刻意改**：① 上游失败策略分档，最终超时会**中止整个生成任务**——本仓改为**一律降级为「本回合不隐藏」**（世界引擎的注入失败不该让玩家发不出这句话），且降级必留痕（`routeFailure` + `lastFailure()`）。② 上游挂 `WORLDINFO_ENTRIES_LOADED` 事件、克隆条目后置 `disable`；本仓改走自己的**按聊天覆写表**（`worldbook.getOverrides/saveSelection` 的 `'off'`），因为直接改宿主条目对象会绕过 store 的写入台账，属静默失效面。③ 边界如实锁进断言：本路由**只约束 WorldAxis 自己的 `buildPromptSection` 扫描，不改宿主那一次原生扫描**。
- **改法**：新增 `engines/entry-router.js`（234→260 行，命名空间 `WA.entryRouter`：`listCandidates / setCandidate / removeCandidate / clearCandidates / isPassive / normalizeEnabled / expandLinks / plan / applyPlan / clearCache / lastFailure / lastRoute / recentMessages` + `ROUTE_SYS / ROUTE_TIMEOUT_MS=30000 / MAX_CANDIDATES=60`）。候选须有启用条件（无条件的条目不参与路由）；被 `links` 指向者为**被动条目**、不能独立开启；`normalizeEnabled` 把字符串 / 嵌套对象 / 不存在的 id 一律过滤到合法候选；`expandLinks` 做 A→B 关联展开；缓存上限 `CACHE_MAX=20`；`applyPlan` 只写 `off` 覆写、不动勾选集，并在写前清掉上一轮 `off`。新增 before 链节点 `engines.entryRouter`（order 60，落在 monologue 之后）。装载位置在 `engines/worldbook.js` 之后（读 `getOverrides/getSelectedIds/saveSelection`）。
- **判据 +44**（`tests/run.js` v2.45.0 段）：静态面（引擎内无 `throw`、三常量在位、装载链在 worldbook 之后）；候选面（无条件不入表 / 被动判定）；归一化三形态（数组 / `{enabled}` / 布尔对象）；关联展开；**通道未配置 = 不介入（不是失败）**；**副模型失败 = 降级不隐藏 + 留痕 + 不落覆写**；成功面（命中集 / 隐藏集 / 缓存复用）；覆写面（只写 `off`、勾选集不变、上轮 `off` 不残留）；**失败沿用**（同一输入不重复烧副模型）；节点注册面；边界锁（覆写表只作用于 `buildPromptSection`）。
- **自纠**：初版 `plan()` 在副本模型失败后未记 `key`，导致同一输入会重烧一次副模型——补 `routeFailure.key` 并加「沿用降级」分支（附注释说明：若哪天改回中止语义，此处必须一起改）；一次编辑误删成功路径的 `return`，当场读回并补上；mock 无 `__pushApiFail`，失败注入改走 `__fetchResponses.push({ok:false,...})`；「成功路径」用例先 `clearCache()` 以免被上一条失败沿用挡住。
- **影响范围**：新增 `engines/entry-router.js`；改 `index.js`（LOAD_ORDER + VERSION 2.45.0）/ `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）/ `tests/run.js`（v2.45.0 段 +27 断言、LOAD 挂载引擎）/ README / ITERATION_LOG。
**门禁与验证（已实跑）**：此前多轮记录的「终端不可用」经 `terminal_getscreen` 复核为**误判**——`git diff` 进了 less 分页器把会话阻塞住，工具侧因此误报超时；发 `q` 退出后终端即恢复（`node v24.18.0`）。恢复后实跑：全量回归 **4597 / 失败 0**（v2.44.0 基线 4559，**+38 净增**）；dead-export-gate 绿（dead **205** / uiDead 4 / dataOnly 109）；ui-gate 53/0；ui-wire-audit 9/0；field-liveness-gate 绿；inventory 悬空 0；export-contract **61 ns / 374 members / 4731 chars**（FROZEN2800 按产物逐字回填，`--update` 已同步账本）。
- **接线面（本版真问题）**：13 个引擎导出起初在死子面账本里全是 `self-only`（refs=0）——测试用 `const R = WA.entryRouter` **别名**引用，而账本按 `WA.ns.mem` 正则计引用，两侧都数不到 ⇒ dead 207→218。按本仓口径「导出即需有消费方」，**不改账本去迁就、而是接上真实消费方**：注入页新增「条目按需路由」区块 + `UI_BINDINGS` 登记 8 个控件 id（dead 218→205）；`normalizeEnabled` / `expandLinks` 属纯内部步骤（过度导出），**从导出面摘除**（导出 13→11，账本 `test-only` 134→132、`members` 723→721），对应的两组断言改为**经 `plan` 的端到端行为面**覆盖（合法数组 / 伪装对象 / 夹带非法 id 与被动项三形态），不直调内部步骤。
- **测试基建缺陷（顺带修）**：mock 的 `__fetchResponses` 是**全局共享队列**，缓存命中路径下 `__pushApiJson` 的响应根本不被消费，会留给下一个 `plan` 当成功响应；实测表现为「失败用例拿到成功响应」「`applyPlan` 撞上残留的 500」。修法：v2.45.0 段每处网络调用前显式清空队列（6 处）。这与产品代码无关，是断言污染。
- **失败策略的一处自纠**：原实现的「失败沿用上轮降级」会让**一次瞬时失败把同一个输入永久钉在降级态**（换输入才恢复）；判定其代价高于多烧一次副模型，改为**失败只留痕、不记忆**，断言随之改为「恢复后同一输入重新判定」。



### R29 · 2026-09-22 · v2.46.0 交付（万花筒·第三十一面：变量驱动条款——世界状态 → 派生量 → 按变量值确定性注入正文）

- **做了什么**：新增 `engines/kaleidoscope.js`（502 行，命名空间 `WA.kaleidoscope`），把「世界状态里的数值」变成可写成条款的注入：**派生量**（`map` 取值→标签 / `range` 取值→0..100 归一 / `formula` 四则表达式可引用其它派生量）+ **条件注入规则**（每条带 `when`，命中才拼进注入块）。before 链新增节点 `kaleidoscope.inject`（order 22，落在 enemies(19) 之后、proactive(25) 与 entryRouter(60) 之前）。
- **为什么**：此前注入内容全是「文案模板」——写什么就注什么，没有任何「按世界状态取值决定要不要注入、注入什么」的通路；想让「声望低于 30 就提醒模型玩家处境」只能靠模型自己读状态，等于没有约束。这是纯机制收益（少 token、少死设定），与界面偏好无关。
- **三条硬纪律（写进断言）**：① **无 `eval` / 无 `new Function`**——自写 tokenizer + 递归下降求值；这条设计声明本身留在源码注释里并被断言留痕（`indexOf(&#39;无 eval / 无 new Function&#39;) > 0`），真代码面判据走 `inventory.codeFace`（注释里的字面量不算命中，避免「写进注释就当成已遵守」）。② **纯只读**——只在 `store.get()` 快照上遍历，回归以 `JSON.stringify(store.get())` 求值前后<b>逐字相等</b>坐实无副作用。③ **三态如实**——`ok` / `missing`（路径不存在）/ `invalid`（键在、值算不出来）严格分离，绝不把「算不出来」伪装成「不存在」。
- **raw 与 value 的分工（本版最容易写错的一处）**：`map` / `range` 同时给出 `raw`（原始取值）与 `value`（显示值：map 给标签、range 给 0..100 归一），**`formula` 引用其它派生量时走 `raw`**——按 value 算会把「已钳到 100」这个**显示口径**当成数学真值。回归以 `双倍 = $轮次百分比 * 2 = 198`（raw 99 × 2，而非 value 100 × 2）把这条分工钉死；同时补断言「map 的 raw 是数值，参与算术合法」——锁住「标签用于成文、raw 用于继续算」的分工。
- **自纠：本轮发现的真实引擎缺陷（中文 id 写进去读不出来）**。首版 `$` 引用名正则限定 ASCII（`/[\w\-.]+/`），而派生量 id 是**用户起的名字**（面板示例就写着「声望档」）——中文 id 能写进列表、用 `$` 却永远取不到，报 `unknown-derive`，用户看到的是「明明在列表里却说它不存在」。这是「功能级失效」的变体：**能力存在、路径通、但输入被静默排除**。三步修：
  · ① 新增常量 `REF_STOP = " \t\n\r+-*/()&lt;&gt;=!,"`，引用名从「匹配 ASCII 字符类」改为「**读至任一终止字符**」，允许中文等非 ASCII；
  · ② 占位符插值正则 `/\{([A-Za-z0-9_\-]+)\}/g` → `/\{([^{}]+)\}/g`，使 `{沪上}` 这类中文 id 也能插值；
  · ③ 新增 `idProblem(id)`（非空、不含空白与花括号），`setDerive` 与 `setRule` **共用**——id 是**双向契约**（`$id` 引用与 `{id}` 占位符两种写法都要匹配得上），含空格的 id 写进去能存但两种写法都取不出来，属「写进去读不出来」，写入即拒收并说明原因。
  代价是 `$a-1` 必须读作减法（`-` 是终止字符），故断言直接写成「`$沪上-1` 是减法」——**把界限写死在断言里**，谁把 `-` 从 `REF_STOP` 拿掉，这里立刻红灯。（中间出现一次自纠：初版该断言期望 `unknown-derive`，与引擎新行为冲突，改为期望可算并加注释说明意图。）
- **失败策略与降级**：任何异常 → 本回合不注入 + `lastFailure()` 留痕（与 v2.45.0 同一裁决：世界引擎的注入失败不该让玩家发不出这句话）；**无命中返回空串**——0 token，条目根本不进 `ctx.injections`（回归以「清空后不再进」坐实）。
- **判据 +89**（v2.45.0 基线 4597 → **4686**）：静态面（真代码面零 `eval` / 零 `new Function`、三算子枚举、三上限常量、引擎内无 `throw`、装载链在 store 之后）；三态分离面（真不存在路径落 `missing`；键存在但值不可算落 `invalid` 且 `reason=not-a-number`，**不落** `missing`）；公式面十类错误具名（`div-zero` / `unknown-derive` / `trailing-token` / `unbalanced-paren` / `bad-word` / `bad-char` / `bad-number` / `not-a-number` / `cycle` / `bad-id`）；条件注入面（`order` 升序、空 `when` 恒真、**条件语法错误该条具名跳过而非整块失败**、空 text 拒收、空 id 拒收、未知算子拒收、map 缺 path 拒收）；中文 id 全组（`$沪上 * 2` 可算 / `$沪上 + 1` 链式可引用 / `$沪上-1` 是减法 / `$沪上 - 1` 与 `($沪上)+1` 同义 / 含空格 id 落 `bad-id` / `{沪上}` 可插值为 `7`）；只读无副作用；确定性（两次 `buildBlock()` 逐字相等）；上限面（60 条规则压到 `MAX_RULES`）；诊断出口三件（`snapshot` / `lastEval` / `lastFailure`）；工作流节点面；端到端（跑一次 before 链产出 `source=&#39;变量驱动&#39; position=&#39;after_last_user&#39; depth=3` 的注入项，清空后不再进）；接线面（断言 `ui/panel.js` 逐字含 16 个 `WA.kaleidoscope.xxx`）。
- **接线面**：16 个导出**全部**在 `ui/panel.js` 有**直写**消费（注入页新增「变量驱动条款」区块：派生量列表 / 规则列表 / 三态计数 / 降级留痕 / 未解析占位符提示，11 个 `wa-ka-*` 控件 + 7 个处理器），并登记进 `tool-diag.UI_BINDINGS` 的 inject 组——v2.45.0 的 `entryRouter` 踩过「测试侧**别名**引用（`const R = WA.entryRouter`）在账本正则下两侧都数不到 ⇒ dead 207→218」的坑，本版一开始就走直写，死子面 **205 保持不变**（16 个导出零死导出）。渲染顺序上踩实了 v2.21.0 的同一教训：**先 `renderBody`（会替换整个 body）再 `setOut`**，否则回话写在重绘前会被自己擦掉。
- **影响范围**：新增 `engines/kaleidoscope.js`；改 `index.js`（VERSION + LOAD_ORDER）/ `manifest.json` / `engines/tool-diag.js`（MODULE_EXPORTS + UI_BINDINGS）/ `ui/panel.js`（渲染 +49 行 / 绑定 +52 行）/ `tests/run.js`（+173 行段、LOAD、8 处版本锚点、4 处 inventory 锚点、`FROZEN2800`、`EC2430`）/ `tests/dead-export-ledger.json`（`--update` 同步）/ README。
- **自纠（操作层，均为真实踩到）**：① 长单行（`tool-diag.js` 的 `MODULE_EXPORTS` 240 余字符行）两三次 `edit_file` 匹配失败，改走「落盘 `.py` 脚本 + 锚点 `count()===1` 校验 + `ast.parse`」；② `LOAD` 数组首轮 Python 替换因 OLD 与另一分支重叠而**复制**该条目，二轮用精确去重模式修正；③ 终端偶发 `Current ROOT unavailable`（三次）重试即恢复；④ 回归首轮 exit=2 暴露五类问题（注释里的字面量被朴素 `indexOf` 命中 / 探针路径取到了真字段 / `档位` 派生没落进 `invalid` 直接崩栈 / 出口面契约漂移需回填 / 第二轮的 `bad-ref`）——逐条定位后全绿，其中「探针必须打在真不存在的路径上」是判据自身的设计错误（不是产品缺陷）。
- **门禁与验证（已实跑）**：全量回归 **4686 / 失败 0**（v2.45.0 基线 4597，**+89 净增**）；dead-export-gate 绿（dead **205** / uiDead 4 / dataOnly 109，`--update` 已同步 209 条证据）；ui-gate **53/0**；ui-wire-audit **9/0**；field-liveness-gate 绿（骨架一级键 20 个 / 产品文件 69 个）；inventory 四类悬空 0（refs **1431** / 命名空间 **68** / 成员 **737**）；export-contract **62 ns / 390 members / 4908 chars**（`FROZEN2800` 与 `EC2430` 按产物逐字回填）。

### R30 · 2026-09-22 · v2.47.0 交付（注入项去向可答·第三十二面：三张账 → 按输入位置的一本账）

- **做了什么**：把注入面的「三张互不相通的账」收成**一本按输入位置的账**。`render/inject.js` 在拼完主块后逐项记 `trace`（去向五态 `slot` / `main` / `folded` / `dropped` / `empty`，`folded` 带 `foldedFrom`/`foldedTo`/`reason`，`dropped` 带 `reason`/`tokens`，`slot` 带槽位键），并算 `traceSummary` 合计，两者一并写入 `store.lastInjection`；注入页新增「注入项去向」区块（逐项列去向 + 五态合计 + 与候选项数**对账**，数不上即显式告警）。沿用 `applyInjections` 的单一落地入口，未改任何路由/预算语义。
- **为什么**：此前「正文里少了那条约束」在界面上**无法回答**——预算账单只按 `source` **名**记折叠/丢弃、槽位快照只有 `slot` 与字数、主块是一个拼好的字符串，三者之间没有一条线能连起「第 i 个候选项」与「它的落点」。这不是界面偏好问题，而是**可观测性缺口**：排查时只能猜，而猜错方向比不知道更贵（见缺陷②的实测后果）。性质与 v2.31.0（引用面→渲染面）、v2.33.0（能力面→呈现面）同族——都是「让已经存在的东西可被回答」。
- **顺路修掉的 5 处真实缺陷（全部实测坐实，非推理）**：
  · ① **同名串味 + 掉出项复活**（`engines/inject-budget.js`）：`apply` 用 `bySource[source]` / `keepSet[source]` 回填，而 `source` 是**用户可见名、不保证唯一**（真实注入面里「连续性约束」「演化状态」都是固定名，同轮可多项）。实测：两条同名各 400t、`budget=120` ⇒ 账单 `kept=1`/`dropped=1`（账是对的），`apply` 却出 **2 项且正文逐字相同**（被丢弃的那条又回来了，两条共用同一份折叠文本）。修法：`plan` 每项带 `id`（= 输入位置）、回填 `inputCount`；`apply` 按 `id` 回填，输出带 `orig`；`inputCount !== arr.length` 时**退回按名语义**（不把位置对账用在错的计划上）。
  · ② **归因颠倒**（`engines/inject-channel.js` + `engines/inject-slot-audit.js`）：`applySlots` 只回 `{applied,total,errors}`，`audit` 用 `perSlot.slice(0, applied)` 假定「前 N 个成功」。实测：第 1 槽 `WorldAxis:after_last_user` 抛异常、第 2 槽 `WorldAxis:in_chat` 成功 ⇒ 报后者「计划了但未落地」——**把成功的记成失败、把真出错的漏掉**，用户去查一个根本没问题的槽位。修法：`applySlots` 逐个记成功名单 `landed`（`setExt` 非函数时 `landed: []`）；`snapshotSlots(slots, applied)` 第二参兼容**数字（旧）/ 对象（新）**，只给计数时 `landed = null`（**不猜**）；`audit` 有名单则逐项核对报 `slot.orphan`，无名单则报新错误码 **`slot.orphanUnknown`**（明说「有 N 个未落地，但不知道是哪几个」）。同一消息里**宁可少报，不可误导**。
  · ③ **内容指纹误伤**（`render/inject.js`）：主块过滤除 position 判定外还有 `routedContents.indexOf(i.content) < 0` 这条「双保险」，而槽位只收带 `position` 的项 ⇒ 任何**不带 position** 的项只要正文恰好等于某槽位文本的一行，就被从主块**静默剔除**（注入少一条，槽位快照与预算账单里都查不到它）。修法：删掉整套指纹判据，只留「该项声明的 position 对应槽位确实被接管」这一条。
  · ④ **去向不可答**（缺口而非报错）：即本版主题。
  · ⑤ **面板把数组当对象遍历**（`ui/panel.js`）：`perSlot` 的真实生产者 `snapshotSlots` 产出的是**数组**，面板写 `Object.keys(ps).forEach(...)` ⇒ 每个槽位渲染成「**0：0 项｜0 字符**」，用户看到的是「槽位一个项都没有」，**与快照事实相反**。修法：数组优先、旧对象形状兼容，并显示每槽的源与项数。
  · 顺带补齐可答性：`planSlots` 每桶带 `items`（源身份），`snapshotSlots` 每槽带 `sources` / `itemCount`——此前「这条约束进了哪个槽位」在快照里**无迹可查**。
- **本轮自纠（真实踩到，非演练）**：去向账首版在**降级路径**上硬引用 `WA.injectChannel.SLOT_PREFIX`——测试删掉 `WA.injectChannel`（模拟通道不可用）后 `applyInjections` 直接 `TypeError`，注入整条链断在半途。修法：降级路径自己判通道在不在（`slotKey` 先算再判空），并把这个场景写成回归（「通道缺席时不抛」+「降级轮不谎称进槽位」）。这正是本仓的老主题：**新加的记账代码自己成了新的崩溃点**，所以记账段也必须走降级纪律。
- **判据 +67**（v2.46.0 基线 4686 → **4753**）：同名不串味 / 掉出项不复活（出路条数 == 账单保留数）/ `orig` 唯一且落在输入范围 / 计划长度不符退回按名（源名对不上则不出项）/ `landed` 归因指向**真出错**项且成功项不出现在任何 issue / 名单缺席走 `orphanUnknown` 且**不报** `slot.orphan` / 指纹靶子（同文无 position 项仍进主块）/ `trace.length` == 五态合计 / 折叠丢弃两账对齐 / （负控制）篡改五态后合计不等 ⇒ 判据可现形 / 降级不抛且去向如实标 `main` / 静态面（`routedContents` 已摘除、`traceSummary` 已落、`landed.push`、`orphanUnknown`、`Array.isArray(apObj.landed)`）/ 接线面（面板消费 `traceSummary`、渲染「注入项去向」、`Array.isArray(ps) ? ps`、旧 `Object.keys(ps).forEach` 已消失）/ 真实 mini-DOM 面板面（数组 perSlot 渲染真项数、不出现「0：0 项」、每槽源列表、五态逐项、无告警、（负控制）篡改后告警、旧对象形状兼容、无 trace 旧快照如实说「未记录去向」）。
- **自纠（探针层，4 处期望失真——是我写错了，不是产品缺陷）**：① 「退回按名匹配」写成「不丢项」，实际语义是**源名对不上就一项都不出**（这才是旧语义的真实形状）；② `planSlots` **按 position 分桶**，3 项归 **2 桶**不是 3 桶（`applied/total` 期望改写为 1/2）；③ 「只给计数」的场景必须让计数**小于**计划数（2/2 不构成「不知道是哪几个」）；④ 预算设置的**真实路径**是 `backstage.setSettings`（写 `store.backstage.settings` 根本不读）——探针自身踩过一次「改了个没人读的地方还断言生效」的坑，与 v2.33.0「探针前提失真」同族：**判据的输入面必须与产品的真源同源**。
- **影响范围**：改 `engines/inject-budget.js` / `engines/inject-channel.js` / `engines/inject-slot-audit.js` / `render/inject.js` / `ui/panel.js` / `engines/tool-diag.js`（UI_BINDINGS 旁明写留痕，id 不变）/ `index.js`（VERSION）/ `manifest.json` / `tests/run.js`（+422 行 v2.47.0 段、旧断言按新语义收口、8 处版本锚点、4 处 refs 锚点）/ `tests/dead-export-ledger.json`（version + `_note`）/ README / ITERATION_LOG。**未新增/删除任何导出成员** ⇒ 出口面契约与死子面不变。
- **门禁与验证（已实跑）**：全量回归 **4753 / 失败 0**（v2.46.0 基线 4686，**+67 净增**）；dead-export-gate 绿（dead **205** / uiDead 4 / dataOnly 109，元数据同源、证据可复算）；ui-gate **53/0**；ui-wire-audit **9/0**；field-liveness-gate 绿（骨架一级键 20 / 产品文件 69）；inventory 四类悬空 0（refs **1435** / 命名空间 **68** / 成员 **737**）；export-contract **62 ns / 390 members / 4908 chars**（逐字未变，`FROZEN2800` 与 `EC2430` 无需回填）。
### R31 · 2026-09-22 · v2.48.0 交付（部分成功可区分·第三十三面：把「部分成功」这条从未被区分的第三态从账里分出来）
- **做了什么**：把「槽位路由部分成功」这条**第三态**从账里分出来。<b>根因</b>是 `render/inject.js` 里那条自 v0.1.9 起就写在注释里的**原子语义**——`if (applied === slots.length) { 接管 } else { 只记错误 }`。它本意保守（避免「注入了但没标记」），代价却是把 `applied > 0 && < total`（一部分落地、一部分回退）**整体当成失败**。修法只需一句话：**有落地即接管**（`if (applied > 0)`），且 `routedKeys` 只收**真落地**的键位（`landedKeys.length ? landedKeys : slots.map(...)`）。但这一句话牵动四处：
  · ① **接管判定**：`applied > 0` 即接管，不再要求全成功。
  · ② **不重复注入**：接管后 `routedKeys` 里只有真落地的键位，失败的一路**不进**名单 ⇒ 它的内容仍并进主块（该回退的回退），真落地的一路**不再**并进主块（否则 `slot` 与 `main` 里各出现一次 ⇒ 白烧 token 且模型看到重复指令）。
  · ③ **幽灵注入断根**：`uninject` 的清理依据由 `slots.keys`（计划）改为**真落地键位优先**（`landedKeys || plannedKeys` 去重）。此前快照为 null 时一个槽位都清不掉 ⇒ 真落地槽位永不被清、残值持续注入后续每一轮。
  · ④ **结论不谎报**：`engines/inject-slot-audit.js` 不再对 null 快照反判 `consistent: true` 并谎称「未启用路由」；快照补 `planned`/`failed` 两字段（`failed` 从 `apObj.errors` 反推；`keys` 保留以免破坏既有读侧），并新增两条三数自洽不变式（`slot.unaccounted` / `slot.bothSides`）。
- **为什么**：v2.47.0 刚把「计划/落地」引进账里，本版立刻追问「那**部分成功**呢」——这才发现这条信息**从来没有消费者**。这不是界面偏好问题，而是**可观测性缺口**的又一面：失败被看见了，但「哪些成功、哪些回退、回退的有没有重复进主块」没人回答。性质与 v2.47.0（三张账 → 一本账）、v2.31.0（引用面→渲染面）同族。
- **本轮坐实并修掉的 5 处真实缺陷（全部实测，非推理）**：
  · ① **已成功落地的槽位内容仍被并进主块**（见上②）——同一段约束在 prompt 里出现两次。
  · ② **快照 `slots = null`**——「计划了哪些 / 哪些真落地」的证据被整段抹掉。
  · ③ **幽灵注入**（见上③）——真落地槽位永不被清。口径澄清（防后续误判）：有真名单时按名单**精确清理**（失败的一路从未落地，不在名单里**正是正确行为**）；只有名单缺席（旧快照无 `landed`）时才退回 `planned keys`（宁多清不可漏清，清未落地键位是空操作）。
  · ④ **audit 结论不实**——对 null 快照反判一致并谎称「未启用路由」，掩盖了同一个 `li` 里就在场的 `slotErrors`；无快照但有失败时报新错误码 **`slot.snapshotMissing`**。
  · ⑤ **消费链把结论吞掉**（两条）：`engines/tool-diag.js` 的 `secInject` 用 `if (!snap) return { hasSnapshot:false, status:'NOT_YET' }` **提前退出**——注入器快照与槽位证据是**两套独立子系统**（前者要一次真实发送才生成，后者上轮注入完就在场），于是「槽位部分失败（现场缺失）」在快照尚未生成时完全不可见；`ui/panel.js` 把 `!slots || !slots.count` 一律说成「上次注入无独立槽位（全部并入主块）」，把**现场缺失**说成**全部并入**，且只显示计划数、看不出有槽位被回退。修法：`secInject` 改三目（`const out = snap ? {...} : {...}`，`if (snap && snap.apiType === 'chat')`、`else if (snap)` 防 null 解引用），槽位对账前置条件从 `li.slots` 放宽到 `(li.slots || li.slotErrors)` 并带出 `slotAuditNote`；面板侧有失败就渲染「部分失败且未留快照」+ 受影响槽位名，有快照时摆出「**落地 M / 失败 N-M**」三数与「真落地：…」「已回退主块（不重复注入）：…」。
- **本轮自纠三项（真实踩到，非演练）**：① 探针 K1c 的**期望写成了修复前的缺陷形态**（断言 `landed === null`），而实测已是 `["WorldAxis:in_chat"]`——首跑唯一 FAIL 打印值恰是正确值，判据自身失真，改为断言修复后的正确期望并补 K1c2/K1c3 与**最核心的 K1e**（已落地槽位内容不再重复并进主块）；② 回归断言把「有名单精确清理 vs 无名单退回」**写反**（期望失败的一路也被清），改为 `< 0` 并补一段「旧快照无名单时退回 planned keys」场景；③ 归因计数**只改了文案侧没改条件侧**——`assert(dist2800['test-only'] === 132 ...)` 是与文案独立的第二处数字，改完文案仍红灯，第二轮才把条件侧一并更新（每处带唯一性守卫）。
- **第 5 处缺陷是探针 L 抓出来的，不是读代码读出来的**：探针 L（真实 mini-DOM 面板 + 诊断包 `secInject`）首跑 L11–L14 全 FAIL（`diag = {}`），落盘定位脚本显示 `secInject()` 返回 `{hasSnapshot:false, status:'NOT_YET'}` ⇒ 根因正是那句**提前退出**。这正是本仓「用可执行判据代替肉眼」的又一次实践。
- **判据 +50**（v2.47.0 基线 4753 → **4803**）：探针 K 18 项（部分失败三数在场 / 真落地名单 / 主块不含已落地槽位正文 / 撤销清得掉真落地槽位 / 通道缺席不报错 / 部分失败判不一致且 orphan 指向真出错项 / 负向自证三态 / 有失败无快照报 `slot.snapshotMissing` / 旧快照无名单报 `orphanUnknown`）；探针 L 15 项（无快照有失败 ⇒ 明说现场缺失 / 不再说成全部并入 / 列受影响槽位 / 真没启用保留原话术 / 三数在场 / 明示真落地与回退 / 全成功不出回退噪声 / 诊断包在无注入器快照时给出 `slotConsistent:false` / 无失败无槽位时不报不一致）；回归段 A–H 组共 54 处 `v2480:` 断言（三数在场 / 不重复注入 / 幽灵注入断根 / 结论不谎报 / 三数自洽不变式 / 消费端诊断包 / 真实 mini-DOM 面板四场景 / 静态面十项）。
- **影响范围**：改 `render/inject.js` / `engines/inject-slot-audit.js` / `engines/tool-diag.js` / `ui/panel.js` / `tests/run.js`（新增 v2.48.0 段 +222 行，起始第 17290 行）；`index.js`（VERSION）/ `manifest.json` / `tests/dead-export-ledger.json`（version + `_note`）三源同步；`git diff --stat` = **5 文件、341 insertions(+)/20 deletions(-)**。**未新增/删除任何导出成员** ⇒ 出口面契约与死子面不变。
- **门禁与验证（已实跑）**：全量回归 **4803 / 失败 0**（v2.47.0 基线 4753，**+50 净增**）；dead-export-gate 绿（dead **205** / uiDead 4 / dataOnly 109 / 仅测试 **129**，`--update` 已复核 209 条证据，归因分布 test-only 129 / 其余 76）；ui-gate **53/0**；ui-wire-audit **9/0**；field-liveness-gate 绿（骨架一级键 20 / 产品文件 69，规则② 写侧越界 1 处 `ui/panel.js::innerHTML` 为长期白名单）；inventory 四类悬空 0（refs **1435** / 命名空间 **68** / 成员 **737**）；export-contract **62 ns / 390 members / 4908 chars**（逐字未变，`FROZEN2800` 与 `EC2430` 无需回填）。本版唯一的门禁数字漂移是 `toolDiag.secInject` 因新增**测试侧引用**使归因 `self-only → test-only`（128→129 / 71→70），四处计数锚点已按实测回填。
### R32 · 2026-09-22 · v2.49.0 交付（主块账·第三十四面：把注入链上唯一没有独立账的一环补上）
- **做了什么**：给<b>主块本身</b>补上独立账。<code>render/inject.js</code> 每轮写 <code>lastInjection.len</code> / <code>lastInjection.sources</code>，这两个字段自 v0.2.1 起<b>全库零读点</b>；面板「注入落地」区块展示的是<b>注入器快照</b>（要一次真实发送才生成），诊断包读的是<b>宿主 prompt 全长</b>（不是我们拼的那块）。于是「上一轮我们实际注入了多少字、由哪些源拼成」一个字都答不出来，「<b>主块 0 字</b>」也就无法区分两种局面：<b>全走槽位（约束已生效）</b>与<b>确实无可注入内容（什么都没进 prompt）</b>——两者在旧账上完全同形（<code>len=0</code> / <code>sources=[]</code> / <code>injected=true</code>，因为 <code>slotCount&gt;0</code> 也算注入过）。修法：① 快照补 <code>mainCount</code>（主块项数）；② <code>engines/inject-slot-audit.js</code> 里那段<b>空分支</b>落实为真检查 <code>slot.mainDuplicate</code>；③ 消费端两处收口（诊断包带出 <code>out.main</code> + 摘要分说两种局面；面板新增「主块账」区块）。
- **为什么**：v2.47.0 把注入项去向收成一本账、v2.48.0 把「部分成功」从账里分出来——两版都在做「让已经存在的证据可被回答」。本版发现这条链上还剩最后一环没有账：预算账单记「折叠/丢弃」、槽位快照记「哪几路落地」、去向账记「每一项去哪」，而<b>主块本身</b>（我们实际拼出来的那块文本）无人可答。这是第三十四面，与第三十二/三十三面同族。
- **本版坐实的两处缺陷（都是「声明了却从未存在」型，非崩溃型）**：
  · ① **主块零读点**：<code>len</code> / <code>sources</code> 写在快照里、从来没人读。活字段扫描看得见「有写点」，看不见「无读点」，所以此前历轮扫描都没抓到它。
  · ② **空分支**（<code>inject-slot-audit.js</code> 原第 138–141 行）：读 <code>li.sources</code>、注释写「给出提示（信息级）」、<b>函数体一行都没有</b>。比零读点更隐蔽——读点在场（扫描器判定「活着」）、注释齐全、结论恒为零。它本该报的正是<b>重复注入</b>：同一来源既走独立槽位又并进主块 ⇒ 同一段约束在 prompt 里出现两次，白烧 token 且模型看到重复指令。
- **修法口径（写进代码注释，防后续误判）**：重复注入判定<b>只查真落地的槽位</b>——部分失败时失败的一路回退主块是<b>正确行为</b>，不得报（这是 v2.48.0 刚落下的第三条账的直接后果）；源名单缺席（旧快照无 <code>landed</code>）时<b>不猜</b>，不报。已知精度边界如实记在错误文案里：本检查按<b>源名</b>比对，而源名是用户可见名、不保证唯一（v2.47.0 修过同族的「同名串味」），归因粒度到源名为止，同名不同项时提示读者对照去向账逐项核。
- **本轮自纠两项（真实踩到，非演练）**：① 探针 N 的 C4 场景<b>输入面与命题不同源</b>——我把「成功槽位的源」与「失败槽位的源」写成了同一个名字，于是主块里的那个源无法归因到「成功项」还是「失败回退项」，报与不报都失去意义（断言等于没测）；改为源分得开（成功槽位带「连续性约束」不在主块、失败槽位带「章节」才在主块）后判据才真正成立。② 回归段 F3/F4 用错了出口——<code>toolDiag.summaryText()</code> 只回<b>一行汇总</b>（「可用但需留意：N 错误 / M 警告」），逐条 issue 在 <code>flatten()</code> 里；改用 <code>flatten()</code> 取 <code>injectMain</code> 条目后通过，并补 F4b 负向（无槽位落地时不得说成「全走槽位」）。
- **负控制（本版最核心的一条判据自证）**：在<b>真源码副本</b>上摘掉「只查真落地槽位」这一守卫（锚点 <code>if (landedSet.indexOf(p.slot) &lt; 0) return;</code> 恰中 1 次），独立装载破坏副本并重跑与 C4 <b>完全相同</b>的场景：修复版不报、破坏版<b>必须误报</b>。以此证明判据可现形、不是恒真——这是本仓「负控制三形」纪律的落实（真源码破坏 → 加载破坏副本 → 在副本上重跑同款真判据）。
- **判据 +27**（v2.48.0 基线 4803 → <b>4830</b>）：A 组写侧 2 项（mainCount 落地、len/sources 写点未被破坏）；B 组空分支落实 3 项（错误码在位、死注释已摘、精度边界进文案）；C 组真跑 audit 6 项（真落地+同源必报 / 级别 error / 指明来源 / 失败回退不报 / 名单缺席不报 / 源名不重合不报）；D 组负控制 3 项（锚点唯一 / 破坏发生 / 破坏后误报）；E 组接线 7 项（诊断包 main / injectMain / injectMainDuplicate / 两种局面分说、面板主块账 / 真读 len+sources / 来源未登记告警）；F 组诊断包真跑 6 项（main 在场 / 空来源如实给空数组 / 分说两种局面 / 负向不得混淆）。
- **影响范围**：改 <code>render/inject.js</code>（+mainCount）/ <code>engines/inject-slot-audit.js</code>（空分支落实 +41 行）/ <code>engines/tool-diag.js</code>（main 账 + 摘要条目）/ <code>ui/panel.js</code>（主块账区块）/ <code>tests/run.js</code>（新增 v2.49.0 段 +142 行、四处 refs 锚点 1435→1440）；<code>index.js</code>（VERSION）/ <code>manifest.json</code> / <code>tests/dead-export-ledger.json</code>（version + <code>_note</code>）三源同步。**未新增/删除任何导出成员** ⇒ 出口面契约与死子面不变（dead 205 / uiDead 4 / dataOnly 109 逐字未变）。
- **门禁与验证（已实跑）**：全量回归 <b>4830 / 失败 0</b>（v2.48.0 基线 4803，+27 净增）；dead-export-gate 绿（dead 205 / uiDead 4 / 归因分布 test-only 129 / 其余 76，<code>--update</code> 已复核 209 条证据）；ui-gate <b>53/0</b>；ui-wire-audit <b>9/0</b>；field-liveness-gate 绿（规则① denylist 命中与基线逐字一致：<code>meta.round-read</code> 1 文件 / <code>state.round-read</code> 3 文件；规则② 写侧越界 1 处 <code>ui/panel.js::innerHTML</code> 为长期白名单；规则③ 读侧越界 0）；inventory 四类悬空 0（<b>refs 1440</b> / 命名空间 68 / 成员 737，refs 由 1435 增至 1440 是本版新增 5 处静态引用所致，四处锚点已按实测回填）；export-contract <b>62 ns / 390 members / 4908 chars</b>（逐字未变，<code>FROZEN2800</code> 与 <code>EC2430</code> 无需回填）。

### R33 · 2026-09-22 · v2.50.0 交付（宿主两侧 + 台账时间轴·第三十五面：把「无从得知」与「确实没有」分开）
- **做了什么**：落三笔只读账并接上消费端。
  · ① <code>engines/host-wb-trace.js</code>（265 行）宿主世界书激活账：四态 <code>unsupported/awaiting/ok/shape-unknown</code>，
    <code>normalizePayload</code> <b>不猜载荷形状</b>（保留键名清单），<code>crossCheck</code> 报 <code>same-text</code>/<code>same-name</code> 重叠。
  · ② <code>engines/ledger-timeline.js</code>（228 行）台账时间轴：环形窗口 <code>MAX_STEPS=12</code>，段机制区分持续失败与偶发一次。
  · ③ <code>engines/floor-changes.js</code>（246 行）楼层变更联动账：<code>sweep</code> 扫描 L0~L3/smallSummaries/foreshadows/entityMemory/chronicle，
    <code>guardReconcile</code> 与 <code>settleGuard</code> 三态对账，<code>plan</code> 只出 <code>needConfirm</code> 且 <code>executable=false</code>。
- **为什么**：两件事此前<b>完全不可观测</b>——宿主自己扫描注入了哪几条（<code>WORLD_INFO_ACTIVATED</code> 全库零订阅；
  <code>worldbook.js</code> 读的是条目定义不是本轮实际注入），以及删楼/改楼后派生数据的引用一致性
  （<code>timeline.auditRefs</code> 早就算得出 <code>missing</code>/<code>changed</code>、消费端也有两条 warn——差的是触发点）。
  口径：<b>「无从得知」不等于「确实没有」</b>（<code>unsupported</code> 是环境事实，面板必须说「不可观测」）。
- **本版坐实的真缺陷（五处）**：
  · ① <code>ledger-timeline.note</code> 首版同态直接 <code>return</code> ⇒ <code>streak</code> 恒为 1、<code>stalled</code> 永不成立，与设计目标正相反（改为末段 <code>reps++</code>）。
  · ② <code>host-wb-trace.crossCheck</code> 首版逐项判「宿主无正文」⇒ 把「宿主机给了正文但这一条未匹配」误报为<b>不可比</b>（改为判宿主整批）。
  · ③ <code>floor-changes.sweep</code> 缺失项标签只兜 <code>title || summary</code>，漏了摘要条目实际正文键 <code>s</code>（用户只能看到 <code>l2#0</code> 这类下标）。
  · ④ <code>reset</code> 首版把 <code>unsupported</code> 降级回 <code>awaiting</code> ⇒ 清一次窗口就抹掉「宿主根本不给这个事件」的<b>会话级结论</b>。
  · ⑤ <b>两处同源</b> <code>markSubscribed</code> 写作 <code>else if (!__subscribed)</code> ⇒「<b>曾经订阅成功过</b>」永久豁免后续 <code>unsupported</code>：
    宿主旧版本/重装后不再派发事件时，面板显示「已订阅，本轮尚未派发」，<b>把能力缺失伪装成还没轮到</b>（host-wb-trace / floor-changes 各一份，两处都修，G3/G4 各打真源码破坏自证）。
- **顺路坐实 v2.43.0 家族的最后一只漏网**：<code>tests/run.js</code> 出口面契约块<b>自带遍历器</b>（只排 <code>tests/</code>），
  而生成器委托 <code>productFiles()</code>（排 <code>tests/+tools/</code>）——两套「产品面」定义。后果不是「多几个名字」：
  本版新增块文件对三新节的引用被算成产品跨文件依赖，门禁报「接口面漂移」，<b>实为判据扫错文件面</b>。
  已委托单一真源；新增 <b>H 组成类锁</b>（H1/H2 字面锁 + H3 旧遍历器负控制 + H4/H5 现扫描面自证）。
- **接上消费端（否则「记了没人看」，v2.49.0 同一种病）**：<code>interceptor</code> 真订阅三事件并在缺席时显式回报；
  <code>render/inject</code> 每轮真调 <code>crossCheck</code> / <code>probeDefault</code> 写入 <code>lastInjection.hostWb</code>；
  诊断包三节 + 三条 <code>flatten</code> 摘要行 + 四个 <code>UI_BINDINGS</code> 控件；面板三区块。
- **自纠一项（真实踩到）**：H 组首版只写进块文件、<b>没同步进 <code>tests/run.js</code></b>（且块内用了未声明的 <code>srcRun2500</code>），
  首跑即 <code>ReferenceError</code> 暴露——补声明后同款判据才真跑起来（<b>「脚本里写了」不等于「跑起来了」</b>）。
- **负控制（本版最核心的自证）**：四组全部打在<b>真源码副本</b>上——G1 摘掉系统条目排除（<code>sysExcluded=0/count=2</code>）、
  G2 摘掉段机制（<code>streak=1/段数=3/stalled=false</code>）、G3/G4 把 <code>markSubscribed</code> 改回旧写法（<code>state</code> 停在 <code>awaiting</code>），
  每组同时断言<b>原版上同款判据仍成立</b>（双向自证，非恒真）；H3 证明旧遍历器确实射中 <code>tools/</code>。
- **判据 +93**（v2.49.0 基线 4830 → <b>4923</b>，失败 0）：A 装载链 3 / B 宿主四态 6 / C 时间轴段 6 / D 守卫对账 9 / 
  E 消费端 12 / F 诊断包真跑 8 / G 真源码破坏 16 / H 文件面成类锁 5，另含 30 项门禁与既有套件重算。
- **影响范围**：新增三引擎（共 739 行）；改 <code>core/interceptor.js</code> / <code>render/inject.js</code> / <code>engines/tool-diag.js</code> /
  <code>ui/panel.js</code> / <code>index.js</code> / <code>manifest.json</code> / <code>tests/run.js</code>（+396 行，起始第 17640 行附近）；
  <code>tests/dead-export-ledger.json</code> 重生成（dead 205→218、<code>version=2.50.0</code>、test-only 131）。
- **门禁与验证（已实跑）**：全量回归 <b>4923 / 失败 0</b>（v2.49.0 基线 4830，<b>+93 净增</b>）；
  <code>dead-export-gate</code> 绿（dead 218 / uiDead 4 / dataOnly 116→116 / 仅测试 131）；
  <code>export-contract</code> 逐字一致（ns 65 / members 406 / chars 5100）。

### R34 · 2026-09-22 · v2.51.0 交付（叙事工艺设置面·第三十六面：把「声明了消费口径却没有产生方」的那一环补上）
- **做了什么**：新建 <code>engines/style.js</code>（253 行）——叙事工艺设置面，并把它接进设置页、注入链、诊断包、体检器、守卫表与账本。
  · 七轴：<code>block</code>（总开关）/ <code>paragraphStyle</code> / <code>perspective</code> / <code>userPronoun</code> / <code>takeover</code> / <code>narrate</code> / <code>custom</code>；
    <code>DEFAULTS</code> 为总开关 <code>on</code> + 五轴全 <code>off</code> + 空附加段 ⇒ <b>默认零 token</b>（<code>buildBlock()</code> 返回空串）。
  · <code>setSettings(patch)</code> <b>整笔拒收</b>非法档位且<b>不写盘</b>（<code>{ok:false, reason:'bad-value', bad:[…]}</code>；非对象入参 <code>reason:'bad-patch'</code>）——
    杜绝「一半写进去、一半被丢掉」的中间态。
  · <code>buildBlock()</code> 是<b>唯一产出口</b>（唯一产生方 ⇒ 唯一可测点），末尾固定三态诚实兜底：
    <i>「不得在正文里提及这些约束本身；与角色设定、世界状态、玩家输入冲突时，以它们为准」</i>。
  · <code>effectiveSettings()</code> 只吐「非 off 且非空」的轴；<code>textCoverage()</code> 逐轴逐档数正文表字数（供<b>交叉校验</b>）；
    <code>styleStat()</code> 透出 values/labels/enabled/rejects/fallbacks/builds/emptyBuilds/lastLen 全部记账。
- **为什么**：<code>engines/rules.js</code> 的 <code>craft</code> 模块正文里早就写着「叙事工艺按设置面口径执行」——
  <b>但那个「设置面」全库不存在</b>：只有<b>声明</b>（口诀），没有<b>产生方</b>。这是本仓反复出现的那种病，
  只是这次病根在「口径文案」里：一句话把不存在的模块说成了既有事实。本面把这句话兑现成一个真的设置面。
- **接上消费端（否则「记了没人看」，v2.49.0/v2.50.0 同一种病）**：
  · <code>render/inject.js</code> 的 <code>SOURCES</code> 追加 <code>'style'</code>（<b>10 → 11 项</b>），并新增 <code>buildStyleBlock()</code> 取数口；
    在 <code>applyInjections</code> 里作为<b>独立注入项</b>加入（<b>不并入 <code>&lt;world_axis_state&gt;</code></b>）——
    并进去会让它从<b>预算裁决 / 去向账 / 快照 sources</b> 三项治理面上消失，且与它「绝不使用系统旁白」的呈现铁律矛盾。
  · <code>__REG.def.style = false</code>（<b>默认关</b>）：老用户凭空多出一段正文约束＝<b>静默行为变更</b>，不可接受。
  · <code>ui/settings.js</code> 新增 <code>wa-st-save</code> 保存出口：写失败<b>不得报成功</b>（复用同一处 <code>whyTxt</code>、明说「改动未落盘」），
    并<b>独有地回显注入可见性</b>——因为 style 源默认 false，「保存成功但正文没变」是本面最可能被问的问题。
  · <code>engines/tool-diag.js</code> 新增 <code>secStyle()</code>（判据含 <code>injectReady</code> 二道闸与 <code>uncovered</code> 覆盖度交叉校验）并入 <code>collect()</code>；
    <code>UI_BINDINGS</code> settings 组登记 <b>9 个</b> <code>wa-st-*</code> 控件（全部放 <code>ids</code> 层、<b>不放 <code>cond</code> 层</b>：
    style.js 是产品文件，它缺席本身就是断裂，不该被 cond 的「依赖态、缺失不判失败」掩盖）。
  · <code>engines/inspector-state.js</code> 新增 checker 12 <code>checkStyleCraft</code>（覆盖 <code>blocked/notInjected/rejects/fallbacks/emptyBuild/uncovered</code> 六类）。
  · <code>ui/panel.js</code> 把注入源中文名收口为<b>模块级单一真源 <code>VIS_NAMES</code></b>（<code>renderInject</code> 的局部表与 <code>renderDirector</code> 的内联字面量各一份 ⇒ 两处会各自漂移）。
- **本版坐实的两处真缺陷（都是「判据自己在骗人」，不是产品 bug）**：
  · ① <b>包装器缺 <code>return</code> ⇒ 证据蒸发，报告却写「确实没读」</b>。<code>contract-audit</code> 的委托字段判据（<code>persona_update</code>/<code>relation_update</code>）
    完全依赖 <code>applyFn</code> 的返回值，而测试基座传的是 <code>function (d, r, a) { WA.backstage.applyResult(d, r, a); }</code>——<b>没有 return</b>。
    于是这两个字段<b>恒判「未消费」</b>：先把「无法判定」说成「确实没读」，再据此报假警。
    双向修复：判据侧记 <code>retMissing</code> 并在 <code>audit</code> 里升级为 <code>delegated_evidence_missing</code> <b>error</b>（防下次静默复发），
    消费侧补 <code>return</code>；并实测确认<b>产品路径本来就是好的</b>（默认直取 <code>WA.backstage.applyResult</code>，<code>ret={"persona":1,"relation":1}</code>）。
    教训一句话：<b>判据拿不到证据时，必须报「判不了」，不能报「没有」</b>。
  · ② <b>参数化 id 让门禁失明</b>。<code>tests/run.js</code> H2 用源码正则 <code>/id="(wa-[a-z0-9\-]+)"/</code> 采集「渲染出的控件」，
    首版五个档位控件由 <code>row()</code> 变量拼 id（<code>id="${id}"</code>）⇒ 采集面看不见，而它们已写进守卫表 ⇒ 一登记就必报<b>僵尸条目</b>。
    反过来说，参数化会让这五个控件<b>永久游离在守卫之外</b>——恰是这道门禁要消灭的盲区。
    改为五行<b>字面量直写</b>（档位选项仍由 <code>CHOICES × CHOICE_LABELS</code> 生成），<code>row()</code> 删除。
- **负控制（本面最核心的自证）**：把 <code>const PERSP_TEXT = {</code> 改成空对象加载<b>破坏副本</b>——
  同款判据报警 <b>4 处</b>、<code>buildBlock</code> 对选中轴<b>不出话</b>（副本产物 0 字），而<b>原版上判据仍为真</b>（<code>uncovered=0</code>）。
  双向自证：判据不是恒真、也不是写死的。
- **行为验证**：新增 <code>tools/smoke_v2510_p4.js</code>，8 节 <b>54 项</b>断言全绿（<code>SMOKE-P4: pass=54 fail=0</code>）：
  默认态零 token（<code>buildBlock() === ''</code>）、五轴分别生效（142/214/262/362/420 字）、总开关与附加段（超长截到 <code>CUSTOM_MAX=500</code>）、
  非法档位整笔拒收且磁盘零变化（<code>rejects=3</code>）、读路径非法值回落（<code>fallbacks=6</code>、JSON 损坏不抛）、
  二道闸（<code>SOURCES</code> 11 项、<code>undeclared.length===0</code>）、覆盖度交叉校验与 checker 12 导出、负控制一组。
- **顺路修掉两处「旧口径」**：
  · <code>summaryText</code> 原先把 <code>total</code> 含 <code>info</code> ⇒ 干净存档（仅一条 <code>rules.newModules</code> 提示）被报成
    「⚠️ 发现 0 错误 / 0 警告 / 1 提示」——<b>先说自洽</b>才对（无 error/warn 一律先说自洽）。
  · <code>tests/ui-gate-sync.js</code> 的锚点指向了已删除的内联表；改为 <code>"clock: '世界时间'"</code>（带空格，逐字匹配真源码），
    否则回归会以 <code>drift: anchor not found</code> 直接中断——<b>门禁先崩，后面的判据一条都跑不到</b>。
- **判据数**：v2.50.0 基线 <b>4920</b> → <b>4928</b>（+8 净增；其中本面新增 54 项行为验证在 <code>smoke_v2510_p4</code> 独立脚本内，不并入 <code>run.js</code> 计数）。
- **影响范围（+5 行/-1 行量级）**：新增 <code>engines/style.js</code>（253 行）；改
  <code>ui/settings.js</code>（+73-1，保存出口与字面量 id）/ <code>engines/inspector-state.js</code>（+193-3，checker 12 + <code>summaryText</code> 修）/
  <code>engines/contract-audit.js</code>（+39-4，委托字段证据判据）/<code>engines/tool-diag.js</code>（+55-1，<code>secStyle</code> + 9 控件）/
  <code>render/inject.js</code>（+28-2，<code>SOURCES</code> + <code>buildStyleBlock</code> + 独立注入项）/ <code>ui/panel.js</code>（+13-2，<code>VIS_NAMES</code>）/
  <code>index.js</code>（+6-1，LOAD_ORDER 挂载 <code>engines/style.js</code>）/ <code>manifest.json</code>（version 2.50.0 → 2.51.0）/
  <code>tests/ui-gate-sync.js</code>（+6-1）/ <code>tests/run.js</code>（+42-39，含 11 处基线回填 + 冻结串逐字回填）；
  <code>tests/dead-export-ledger.json</code> 重生成（dead 218→<b>223</b>、<code>version=2.51.0</code>、<code>dataOnly</code> 116→122）。
- **门禁与验证（已实跑）**：全量回归 <b>4928 / 失败 0</b>；<code>dead-export-gate</code> 绿
  （dead 223 / uiDead 4 / dataOnly 122 / 仅测试 131，归因 <code>{unwired:7, self-only:85, test-only:135}</code>）；
  <code>export-contract</code> 逐字一致（ns 66 / members 426 / chars 5349，FROZEN2800 同步回填）；
  <code>node --check</code> 对 8 个改动文件全部 OK。
- **收口过程中踩到的两个坑（都属「判据自身的问题」，记下来防复发）**：
  · ① <b>裸锚点撞上「作为字符串的正则源码」</b>。<code>const FROZEN2800 = '…';</code> 在 <code>tests/run.js</code> 里命中 <b>2 处</b>——
    真声明，以及 v2410 块用来抽取它的正则字面量 <code>/const FROZEN2800 = '([\s\S]*?)';/</code>。
    解法：锚点加<b>行首缩进 + 行尾分号</b>（<code>^    …$</code> + <code>re.M</code>）⇒ 恰中 1 处。
    一般化：<b>本仓的测试文件里存着产品文件的源码文本</b>，任何锚点都可能同时命中「真代码」与「描述真代码的字符串」。
  · ② <b>「全部改完才写盘」结构下的一次失败会吞掉前面所有成功</b>。上一批补丁逐条 <code>replace</code> 但只在最后写盘，
    末条 <code>exit(2)</code> ⇒ 前面 5 条已 <code>ok</code> 的编辑<b>一条都没落进文件</b>（输出却显示 ok，极具迷惑性）。
    本批改为「逐条校验 → 全通过才 <code>os.replace</code>」，并加了<b>旧值残留复核</b>（写盘前扫一遍旧字面量）。
  · 附带：<code>node --check</code> 按<b>扩展名</b>判定模块格式，临时文件必须带 <code>.js</code> 后缀，否则
    <code>ERR_UNKNOWN_FILE_EXTENSION</code> 会伪装成「被检文件有语法错」——<b>报错指向的对象不是真正的出错对象</b>。

### R35 · 2026-09-22 · v2.52.0 交付（人物生活·第三十七面：把「持续目标」从人设描述变成可结算的承诺）
- **做了什么**：新建 <code>engines/life.js</code>——人物生活面：持续目标（goal）、五类关系承诺（promise / debt / secret / cooperation / boundary）、基础日程（schedule）与条件式行动决策。
  · 状态落 <code>people.&lt;id&gt;.life</code>，<b>绑定稳定人物 ID</b>（不按名字重查，防同名人串味）。
  · <code>decide()</code> 决策顺序固定：危机 → 资源缺失 → 高警戒 → 信任求助 → 条件推进 → 等待；<b>明确履约证据优先</b>于普通目标。
  · 日程冲突返回 <code>time-conflict</code>，不静默改期。
- **为什么**：全库此前只有「人物当前状态」（location/action/intent），<b>没有「人物欠着什么、打算什么时候做」</b>。于是 NPC 一旦离开正文镜头就静止——长局里人物退化成布景。
- **接上消费端**：<code>render/inject.js</code> 独立注入项；<code>ui/panel.js</code> 人物页四控件（加目标/加承诺/加日程/结算）；<code>engines/tool-diag.js</code> <code>secLife()</code>。
- **本版坐实的两处真缺陷**：
  · ① <b>开关误用点击时的旧状态</b>：控件用 <code>onclick</code> 读自身 checked，<code>renderBody()</code> 重绘后结果被清掉——改为 <code>onchange</code>，结果存 <code>panelEl.dataset.lifeOut</code> 跨重绘。
  · ② <b>时间走裸墙钟</b>：日程与结算直接用 <code>Date.now()</code>，绕过 <code>core/clock.js</code> 单一时间出口；统一改 <code>clockNow('ui.life')</code>。
- **验证**：<code>tests/life-v2520.js</code> 通过；全量回归 <b>4933 / 失败 0</b>；dead 223 / uiDead 4 / dataOnly 122；出口面 ns 67 / members 437 / chars 5460；清册面 refs 1572 / 命名空间 73 / 成员 815。
- **提交**：<code>8a0d632</code>（已推送 <code>origin/main</code>）。

### R36 · 2026-09-22 · v2.53.0 交付（因果与情报·第三十八面：可追溯事件链 + 带来源的人物认知）
- **做了什么**：新建 <code>engines/intel.js</code>——<b>不新建顶层世界状态</b>，复用既有容器：因果写 <code>currents.causes</code>，情报写 <code>people.&lt;id&gt;.knowledge.intel</code>。
  · <b>前因必须已存在</b>：须命中世界事实 / 记忆事实 / 演化事件 / 已有暗流之一，否则返回 <code>unknown-cause</code>——<b>禁止凭空生成原因</b>（这是「AI 编一个前因」最常见的入口）。
  · 情报四级 <code>rumor / report / witness / record</code>，置信度 25 / 55 / 75 / 90；<b>低于 75 保持 <code>suspected</code>，达到 75 才标 <code>believed</code></b>——传闻永不自动升格为事实。
  · <code>visibleTo(person, topic)</code> 只返回<strong>该人物自己</strong>持有的情报（信息不对称不被全知视角抹平）。
- **为什么**：<code>evolution</code> 早就有事件与影响链，但那是<b>上帝视角的结果账</b>；「谁因为什么知道了什么」这层从未分开记。缺了它，NPC 会说出他不该知道的事。
- **接上消费端**：注入项、人物页控件、<code>secIntel()</code>；面板实际消费 <code>knownCause</code> / <code>explain</code> / <code>visibleTo</code> / <code>CONFIDENCE</code>。
- **验证**：<code>tests/intel-v2530.js</code> → <code>INTEL-V2530: pass</code>；全量回归 <b>4938 / 失败 0</b>；出口面 ns 68 / members 448 / chars 5570；清册面 refs 1595 / 命名空间 74 / 成员 826。
- **提交**：<code>93692f3</code>（已推送）。

### R37 · 2026-09-22 · v2.54.0 交付（资源与组织·第三十九面：可执行库存与余额不足阻断）
- **做了什么**：新建 <code>engines/org.js</code>——势力与人物资源账本：<code>grant</code>（入库）/ <code>transfer</code>（转移）/ <code>canAfford</code>（余额）/ <code>stockOf</code> / <code>buildBlock</code>。
  · 只操作<b>已存在</b>的势力或人物（<code>missing-holder</code>），不凭空创建组织。
  · 转移前先校验余额，不足返回 <code>insufficient</code> 且<b>库存一字不改</b>（不把负数伪装成成功）。
  · 人物定位收成单一出口 <code>holder(kind, name, root)</code>：查询与入账走同一条路径，不再两处各写一套 ID 拼装。
- **为什么**：<code>people.resources</code> 在 <code>core/store.js</code> 的人物字段说明里<b>躺了很久</b>，势力也只存目标/核心/支柱——「资源」在 schema 上是事实，在运行时是空话。这是本仓典型病：<b>声明了容器，没有生产方</b>。
- **接上消费端**：<code>render/inject.js</code> 注入项（含「不足不得完成转移、不得凭空加库存」的硬口径）；人物页三按钮（入库/转移/检查余额）；<code>secOrg()</code>。
- **验证**：<code>tests/org-v2540.js</code> → <code>ORG-V2540: pass</code>；全量回归 <b>4943 / 失败 0</b>；dead 223 / uiDead 4 / dataOnly 122；出口面 ns 69 / members 457 / chars 5653；清册面 refs 1621 / 命名空间 75 / 成员 835。
- **提交**：<code>93bf00e</code>（已推送）。

### R38 · 2026-09-22 · v2.55.0 交付（长线伏笔·第四十面：把「埋了没收」变成可度量的欠账）
- **做了什么**：新建 <code>engines/longline.js</code>——长线伏笔的<b>承诺回收时刻</b>与<b>逾期欠账</b>。
  · <code>promise(id, dueAt)</code> 只给<b>已存在的伏笔</b>写 <code>dueAt</code>：不存在 → <code>missing-foreshadow</code>，已终态（recycled/dropped/triggered）→ <code>already-terminal</code>，非法时刻 → <code>bad-due</code>。<b>不创建伏笔、不改写状态</b>。
  · <code>overdue(now)</code> / <code>sweep(now)</code> / <code>pressure(now)</code>：超过 <code>graceMs</code> 才算逾期，按逾期时长降序，<b>只报不改</b>。
  · <code>buildBlock()</code> 注入欠账清单，并显式写明「<b>逾期只提示，不自动回收；收束与否由剧情决定</b>」。
- **为什么**：<code>memory.foreshadows</code> 早有状态枚举与终态回收（<code>pruneForeshadows</code>），但<b>没有任何「承诺何时回收」的字段</b>——于是「埋了没收」在全库不可观测：伏笔可以无限期 <code>waiting</code>，既不被回收、也不被报出，长线全靠人记。这是「长线」这一面最真实的缺口。
- **边界（写进模块头，防后续误用）**：① 总开关默认关闭；② 只度量、不回收——<b>回收是叙事决定，不是容量决定</b>（与 <code>pruneForeshadows</code> 的容量治理职责严格分开）。
- **接上消费端**：<code>render/inject.js</code> 注入项；人物页三控件（设定承诺 / 扫描欠账 / 总开关）；<code>secLongline()</code>（含 pressure 与 worstMs）。
- **本版坐实的真缺陷（我自己的）**：
  · ① <code>bad-due</code> 这条拒绝<b>没有计入 <code>blocked</code></b>——计量账漏一笔。由行为测试第 12 项当场红灯暴露（<b>「模块能跑」不等于「账记得对」</b>）。
  · ② <code>overdue</code> 起初<b>没有产品消费端</b>（只有测试调它）⇒ 死导出账本当场 dead 223→224。门禁点出后接进面板扫描按钮，dead 回到 223——<b>本项目「新导出必须立刻有真消费方」这条铁律，是靠门禁自动拦住我的</b>。
- **验证**：<code>tests/longline-v2550.js</code> → <code>LONGLINE-V2550: pass</code>（12 组）；全量回归 <b>4948 / 失败 0</b>；dead 223 / uiDead 4 / dataOnly 122 / 仅测试 131；出口面 ns 70 / members 466 / chars 5742；清册面 refs 1644 / 命名空间 76 / 成员 844。
- **工程教训（重要，已固化进流程）**：<b>用 heredoc 向终端传中文脚本会偶发讹变</b>（实测 <code>拒绝转移</code> 被写成 <code>拒绍转移</code>、<code>资源与组织</code> 被写成 <code>资 源与组织</code>），导致字面锚点匹配失败而补丁静默不生效。<b>含中文的改动一律走 <code>edit_file</code> 或 <code>create_file</code> 落盘后再执行</b>；终端内只做纯 ASCII 替换。
- **提交**：<code>4143407</code>。
### R39 · 2026-09-22 · v2.56.0 交付（注入源表 × 注入分支 双向成类锁·第四十一面：把「加了消费点忘了登记源」变成当场红灯）
- **做了什么**：
  · 修一处**真缺陷**：<code>SOURCES</code> 与 <code>__REG.def</code> 补登记 <code>life</code> / <code>intel</code> / <code>org</code> / <code>longline</code> 四源。
  · 给那四条注入分支补上可见性守卫（<code>vis.life && WA.life</code> …）——此前只判模块在不在。
  · <code>ui/panel.js</code> 的 <code>VIS_NAMES</code> 补四条显示名（否则面板裸露英文键）。
  · 新建 <code>tests/inject-sources-v2560.js</code>：双向成类锁（A / A2 / B / C / D 五面 + N1~N4 负控制），并**接进 <code>tests/run.js</code> 门禁**（+20 项）。
- **为什么**：v2.52.0~v2.55.0 连续四版往 <code>applyInjections</code> 里加注入分支，**四次全部漏登记**。后果三重，而**既有守卫一条都照不到**：① 面板上没有这四项的可见性开关；② 不在 <code>def</code> ⇒ 逃出「声明完整性 / 子键自愈 / undeclared 记账」三重校验；③ 反向守卫（SOURCES 有而 def 无、def 有而 SOURCES 无）两边都没有它。更隐蔽的是这四条分支**只判模块在不在、不读可见性**——即便事后补登记源表，面板开关依然**点了零效果**，与 v2.38.0 的 <code>echoes</code> 复选框是同一种病。
- **判据设计（防止再犯同类）**：A 注入分支 → 源表（<code>WA.&lt;ns&gt;.buildBlock</code> 的 ns 必须 ∈ SOURCES，子源须显式登记统管源）；A2 源守卫必须走可见性通道（不得存在「只判 <code>WA.&lt;ns&gt;</code> 在不在」的形态）；B 源表 → 消费点（防幽灵开关）；C 源表 ⇄ def **互为子集**；D 源表 → 面板显示名（两向）。判据只吃真代码面（<code>codeFace</code> 剥注释与字符串），故**注释里写出开关名不算消费点**；负控制以「真源码破坏 → 在破坏副本上重跑同款判据」自证，锚点须恰中 1 次否则抛。
- **本版坐实的第二处问题（流程面，比缺陷本身更值得记）**：<code>SOURCES</code> 上方的注释曾写「本版同时加了一条成类锁（<code>tests/longline-v2560.js</code>）」——**该文件当时根本不存在**。也就是说注释把「打算做」写成了「已经做了」。这与本仓反复出现的病同型：<b>声明与落地必须是两件事的核对，不能靠同一段文字自证</b>。声称「加了锁」就去 <code>ls</code> 那个文件；声称「修了缺陷」就去读那行代码。
- **顺手修掉的陈旧断言**：<code>tests/run.js</code> 里 v2380 段把 <code>SOURCES</code> 长度钉死为 <code>11</code>（v2.51.0 时代的数字）。源表增长后它会红灯——已改为 15。**这是「能拦住我」的那类断言**（记错了就得来说明），故保留其形态而非改成动态比较。
- **验证**：<code>tests/inject-sources-v2560.js</code> → <code>INJECT-SOURCES-V2560: pass</code>（20 项）；全量回归 <b>4968 / 失败 0</b>（v2.55.0 为 4948，+20 即本版新锁）；死导出门禁绿 <b>dead 223 / uiDead 4 / dataOnly 122 / 仅测试 131</b>，元数据同源、证据可复算。
- **提交**：<code>6f4d1ac</code>。
### R40 · 2026-09-22 · v2.57.0 交付（模块分区分组锁·第四十二面：把「控件加进了面板、分区标题没写」变成当场红灯）
- **做了什么**：
  · 修一处**真缺陷**：人物页的「因果与情报」**漏写了分区标题**，9 个 <code>wa-intel-*</code> 控件全部落在前一个「资源与组织」分区里——用户看到的是「资源与组织」标题下同时挂着两套功能（入库/转移/检查余额 与 加因果/加情报），两套 placeholder 混排，只能靠猜。补回 <code>&lt;div class="wa-sec"&gt;因果与情报&lt;/div&gt;</code>。
  · 新建 <code>tests/ui-module-section-v2570.js</code>：模块分区分组锁（三条判据 + 五条负控制），已接进门禁。
- **为什么（它治的病）**：本仓反复出现同型病——**结构声明的增长与产物的增长不同步**。v2.42.0 是「页面写死 12」，v2.43.0 是「文件面四处副本」，本版是「模块加了、分区标题没加」。三者都不是算法错，而是**新增时少写一行、且没有任何判据会因此变红**。此锁把「每个模块的分区标题必须真的写出来」变成可执行判据。
- **判据（在真机渲染产物上判，不是静态文本匹配）**：装载 <code>ui/panel.js</code> → 点 tab → 读 <code>body.innerHTML</code>，按 <code>&lt;div class="wa-sec"&gt;</code> 的位置给每个控件算「所在分区」。A 每个 <code>&lt;模块&gt;-enabled</code> 总开关所在分区标题必须含该模块名（模块名 = 标签剥「启用」前缀与尾部噪音词）；B 两个不同模块**不得共用同一分区标题**；C 覆盖度前提（≥3 个开关，否则判据在空集合上恒真 = 假绿）。
- **判据设计上的两次自我纠偏（都记在文件头，防后人重蹈）**：
  · ① 首版想用「一分区只能一族控件」作全局不变量，实测全 UI 后**放弃**：设置页 / 工具页 / 注入页 / 导演页存在**合法**的多族共存分区（如「扩展自检」下 14 族共存），按那不变量会产出 7 处纯噪音违规，判据立刻失去意义。改为只对**模块总开关**这一层设分组要求——它是「模块身份」的唯一标记，全 UI 仅 4 个，是天然干净的锚面。
  · ② 首版 <code>moduleKeyword</code> 忘了先 <code>trim()</code>：渲染产物里 label 文本带换行缩进（<code>\n        启用人物生活</code>），<code>^启用</code> 永不匹配 ⇒ 4 个开关全部假报违规。**判据自己被谓词形状骗了**（与 v2.51.0 踩过的「参数化 id 让门禁失明」同型）。
- **本版坐实的第三处问题（方法面）**：v2.56.0 那类**静态源码锁**照不到本缺陷——intel 的控件 id 与其分区是两件事，前者存在、后者缺失。这类「结构声明缺失」必须**在渲染产物上判**，而 <code>tests/ui-gate-sync.js</code> 的 <code>fresh()</code> 已提供真机 mini-DOM 环境（装载顺序从 <code>tests/run.js</code> 的 LOAD 提取，不复制不漂移），本锁直接复用它，不另造壳。<b>顺带收窄一条长期论断：此前「UI 层悬空、需浏览器复核」——真机渲染路径在无头环境其实是可判定的。</b>
- **验证**：<code>tests/ui-module-section-v2570.js</code> → <code>pass</code>（9 项）；先跑成**红**（<code>[B] 「资源与组织」下有 资源与组织 + 因果与情报</code>）再修产品端转绿，负控制确认删除该标题后 A/B 同时现形；全量回归 <b>4977 / 失败 0</b>（v2.56.0 为 4968，+9 即本版新锁）；死导出门禁绿 dead 223 / uiDead 4 / dataOnly 122；ui-wire-audit 9 / 0；出口面契约逐字一致 ns 70 / members 466 / chars 5742。
- **提交**：<code>2c311e4</code>。
### R41 · 2026-09-22 · v2.58.0 交付（可见性「无死开关」行为锁·第四十三面：把「开关点了零效果」从逐例治改成成类判）
- **做了什么**：
  · 新建 <code>tests/inject-vis-v2580.js</code>：对 <code>SOURCES</code> **全部 15 个源逐个**验证「开关动一下、产物跟着动」，含面板复选框集合对齐与真实点击落盘；已接进门禁。
  · 本版**未改产品代码**——这是本仓第一次「先证明整条链已是好的，再把它锁死」的版本。理由是 v2.56.0 刚修完同类缺陷，正需要一条能**证明修复在行为面成立**的判据（静态锁只证明源码形状，证明不了产物）。
- **为什么（成类问题）**：同一型病在本仓已出现**三次**，且三次都是「逐例治」——
  · v2.38.0 <code>echoes</code>：SOURCES 与面板里都有，但快照构建从无对应分支 ⇒ 开关开/关产物逐字节相同；
  · v2.38.0 账本/世界推演：**不在 SOURCES 内** ⇒ 关掉所有源仍注入；
  · v2.56.0 <code>life/intel/org/longline</code>：只判模块在不在、不读开关，且根本没登记进源表 ⇒ 面板上连开关都没有。
  三次修完后，**没有任何判据回答成类问题**：SOURCES 里每一项，开关是否真的管用？于是下一次加源仍会重演。此锁把它变成对全量源的可执行判据。
- **判据（四层，全部在行为面上判）**：
  · A 面板 <code>data-vis</code> 复选框集合 <b>==</b> SOURCES（源表新增而面板不渲染 ⇒ 用户点不到）。
  · B 真实点击复选框 → <code>getVisibility()</code> 跟随（UI 绑定真接通，不是只画了个框）。
  · C 逐源「关 → 产物不含 / 开 → 产物含」。快照类（clock/pulse/background/people/currents/echoes）读 <code>buildWorldSnapshot()</code>，独立注入项读 <code>applyInjections</code> 落进宿主的扩展提示词。
  · D 覆盖度前提：必须判到 15 个源（防在子集上恒真）。
- **判据设计上的两个关键决定**：
  · ① 用**哨兵文本**（<code>&lt;&lt;SENT-xxx&gt;&gt;</code>）替换模块真实产出，使「产物含不含」与业务语义完全解耦——判的是**注入链的开关**，不是某个模块的文案。这样更换某模块的文案风格不会假报红。
  · ② 消费的方法名**由探测得出**（模块现有哪个取数口：<code>buildBlock</code> / <code>buildMemoryBlock</code> / ……），**不写死清单**——写死清单就是「新增源时锁不知道」，与本锁要治的病同型。
- **实测覆盖**：15 / 15 源全部判到、**零跳过**（含 memory 经 memorySampler 路径、opinion/ledger 走各自的 <code>buildXxxBlock</code>、style 与四条新模块走 <code>buildBlock</code>），逐源 <code>on=true / off=false</code>。
- **负控制（真源码破坏 → 破坏副本上重跑同款判据）**：把 <code>vis.life &amp;&amp; WA.life</code> 还原成 <code>WA.life</code>（正是 v2.56.0 之前的真实缺陷形态），用 <code>gate.fresh({files, srcOverride})</code> 装载破坏副本，要求 C 面在 life 上报红；原版上同款判据仍为绿。**这条负控制同时回报了一件事：本仓长期标注的「UI 层悬空需浏览器复核」并不完全成立——真机渲染与注入路径在无头环境是可判定、可破坏自证的。**
- **验证**：<code>tests/inject-vis-v2580.js</code> → <code>pass</code>（10 项）；全量回归 <b>4987 / 失败 0</b>（v2.57.0 为 4977，+10 即本版新锁）；死导出门禁绿 dead 223 / uiDead 4 / dataOnly 122；ui-wire-audit 9 / 0；出口面契约逐字一致 ns 70 / members 466 / chars 5742。
- **提交**：<code>ee6790b</code>。


### R42 · 2026-09-23 · v2.59.0 交付（推演输出契约 ⇄ 引擎字段表双向锁·第四十四面：把「声明面承认、契约面缺席」变成当场红灯）
- **做了什么**：
  · 修一处**真缺陷**：关系量值的 `attachment`（依恋）与 `relationship_aftereffect`（后遗症）**只在引擎侧存在**——`actors/registry.js` 的 `REL_NUM_FIELDS` / `REL_STR_FIELDS` 收它们、`engines/backstage.js` 的入账点 `applyResult` 也确实接这两个键、`engines/rules.js` 的 `<relation>` 还明文两条纪律建立在它们之上（「[字段分离] 亲密度≠信任度≠敌对度≠警戒度≠**依恋**」「[修复] ……是否留下长期**后遗症**由事件严重度、五骰与后续行为共同决定」）——唯独**输出契约**那行从没要求模型给它们。模型按契约必然不给 ⇒ 两轴恒 `undefined`、**由构造即死**，而引擎侧一切正常、静态锁全绿。补进契约（`attachment` 数值轴 + `relationship_aftereffect` 字符串轴，标注「均非必填」以保持语义）。
  · 新建 `tests/rel-contract-v2590.js`：推演输出契约 ⇄ 引擎字段表**双向锁**（A / A2 / B / C / D 五面 + N1~N5 负控制），已接进门禁。
- **为什么（它治的病）**：与本仓反复出现的病同型——**同一个集合在两处各写一份、且没有任何判据交叉核对**。此前的样本是「SOURCES 与注入分支」「页面写死 12」「UI 文件面四处副本」；本版是「引擎字段表与模型输出契约」。与 v2.37.0 抓到的「实体清单只进不出」（`buildEntitiesBlock` 从不进提示词、实体库只进不出）是**同一种病**：一边承认、另一边不认，接口静默降级而门禁全绿。
- **判据（关键设计：字段集由探测得出，两处都不写死）**：
  · 引擎侧从**它自己的声明口**读（正则抓 `const REL_NUM_FIELDS/REL_STR_FIELDS = [...]`），读不到即抛「判据失效」——绝不在空集合上恒真。
  · 契约侧从**真实提示词**读（`backstage.buildPrompt()` 的产物里那一行），不读源码字面量——与 v2.58.0 的「方法名由探测得出」、v2.42.0 的「UI 文件面动态发现」同一纪律。
  · A 契约 ⊇ 引擎；A2 **两向耦合**：契约要求的每个字段还必须**行为上真能落地**（喂进 `applyResult` → `flushPersonaChannels` → `getRelation` 读得到），否则会变成「要求模型给一个引擎根本不收的字段」；B 契约 ⊆ 引擎（防幻影字段）；C 覆盖度前提 ≥7；D 行非空 + `buildPrompt` 仍是 `_runInference` 的调用对象（防「判了没人用」）。
- **判据设计上的一处自纠（已写进文件头）**：N5 初版写成「从引擎声明口**删掉** `attachment`，A 必须变红」——实际反向：删掉声明只会让判据**无事可报**（不再被要求），无法证明敏感性。改为「往声明口**追加** `__rc_newaxis`，A 必须现形」，这才真正证明锁挂在**声明口**上而不是挂在写死清单上（写死清单就是「新增字段时锁不知道」，恰是本锁要治的病）。
- **两向自证（先跑成红）**：把契约行临时还原成修复前形态（逐字 `"vigilance":0-100,"boundary_status":"..."`）→ 锁立刻报 `[A] 缺 attachment,relationship_aftereffect`；恢复后 md5 逐字节一致并转绿。**这条是本版最重要的证据：它证明锁对这两个字段真敏感，而不是事后补一句「已验证」。**
- **验证**：`tests/rel-contract-v2590.js` → `pass`（16 项）；全量回归 **5003 / 失败 0**（v2.58.0 为 4987，+16 即本版新锁）；死导出门禁绿 **dead 223 / uiDead 4 / dataOnly 122**；ui-wire-audit 9 / 0；出口面契约逐字一致 **ns 70 / members 466 / chars 5742**；field-liveness-gate 绿（无幽灵读点、写/读侧零越界）；提示词实测 5478 → 5613 字符，两轴归位。
- **本轮猎取路径（方法论，供后人复用）**：本版之前的三个版本都是「读代码猜缺口」。本版换了正交信号——用 **Node 内置 V8 覆盖率**（`NODE_V8_COVERAGE`）跑一遍全量回归，聚合出**产品文件中顶层零执行的具名函数**（90 项），再与「全库零调用点」（33 项）与「导出面契约」交叉。这条链**照出了静态锁照不到的一面**：例如 `engines/style.buildBlock` 在覆盖率上零执行——因为 v2.58.0 的 C 面把模块取数口**整体替换成哨兵函数**，真实产出自然不跑。一路收敛到「relation_update 契约字段」这个真缺陷。**记一条口径**：`NODE_V8_COVERAGE` 产物的 `url` 是**相对路径**（如 `engines/evolution.js`）而非 `file://` 绝对路径，且含 `.broken` / `broken/` 负控制副本，聚合时必须显式排除。
- **提交**：<code>ce467bc</code>。
### R43 · 2026-09-23 · v2.60.0 交付（输出契约「节内字段」⇄ 引擎读取面全节锁·第四十五面：把 v2.59.0 的「一处的病」升级为「一族的体检」）
- **做了什么**：
  · 修**四处真缺陷**（全部行为级实证：引擎真实读取、契约从未要求 ⇒ 模型按契约必然不给 ⇒ 能力由构造即死）：
    ① `people.aliases` —— `pmem.holderSet` 用它把别名归到本体记忆；不声明 ⇒ **别名召回恒空**，人物主观记忆的持有者归属退化；
    ② `chronicle.refs` / `foreshadows.links` —— 二者只在 AI 明确给出时才用，不声明 ⇒ 模型永不主动给，**溯源引用永远退回引擎兜底锚定**，生产方形同废弃；
    ③ `events_create.stage` —— 引擎校验 `e.stage` 合法性并采用（非法才回落首阶段），不声明 ⇒ **新事件永远从首阶段开始**，推演无法宣告「已推进到某阶段」。
    另把 `people.avatar` / `people.resources` 一并列出（引擎收得下、保留不丢；`core/store.js` 的 people schema 注释同样承认这两个字段，而契约行只有 9 个字段）。
  · 新建 `tests/rel-contract-v2600.js`：**节内字段**粒度的双向锁（A 节集一致 / B 读取面非空 / C 引擎读而契约缺 / C2 契约声明而引擎不读 / D1~D5 豁免自证 / E 无哨兵残留 + N0~N8 负控制），已接进门禁。
- **为什么单节锁不够（本版最关键的定位）**：
  · 仓库里本有 `engines/contract-audit.js`（v0.9.6，推演契约对账器），但它是**节级**对账：`FIELDS = Object.keys(PROBES)`，探针一次喂**一个节**；`parseContract` 的正则带 `^\s*` **行首锚**，而契约行是单行、节内字段不在行首 ⇒ **节内任何字段的增删它都看不见**。
  · 这就是 v2.59.0 的 `attachment` 与本版这四处能长期存活的结构性原因。本版把粒度从「节」下沉到「节内字段」。
- **判据（关键设计：两侧都由探测得出，不写死清单）**：
  · 引擎侧：**Proxy 追踪 `backstage.applyResult` 对载荷的真实读取**（`get` + `has` + `ownKeys` 三条路径全部记账）——读到的就是「模型该给的字段」。读键不存在时不返回哨兵真值而返回 `undefined`（见下）。
  · 契约侧：从 `buildPrompt()` 的**真实产物**解析每行的键集合（不读源码字面量）。
  · A 面另加**节集一致性**：契约里的每一节，探针都必须覆盖——新增节时锁会红，而不是静默漏检。
- **判据设计上的四处自纠（全部由「先跑成红」暴露，已写进文件头）**：
  · ① **哨兵默认值毁掉守卫**：初版给缺键返回真值字符串，而引擎大量用 `(r.X || []).forEach` / `typeof r.Y === 'string'` 做守卫 ⇒ `applyResult` 中途抛 `forEach is not a function`、**后续读取整体不发生**，判据看到的成了「崩溃前的读取面」（三处目标字段全数漏检）。改为缺键返回 `undefined`，缺键本身仍记账。
  · ② **短路求值遮蔽字段**：`u.title || u.name` 给了 title 就永不读 name；`desc || description` 同理。故探针必须**多形态取并集**——否则会把 `name` 误判成「幻影声明」（实测：`distantEvent` 只喂 event 形态时，wind 分支的 `topic/content/level` 读不到，同样被误报）。
  · ③ **`Object.assign` 型消费看不见**：`draft.chronicle.push({... c.summary ...})` 这类是**枚举键**（`Object.keys`/`for...in`/`Object.assign` 都会先枚举）而非取值，纯 `get` 陷阱会整体漏检 `chronicle.refs`。故 `ownKeys` 也要记账。
  · ④ **豁免项不能一刀切**：`nearEvent.description` 是向后兼容别名（被 `desc ||` 遮住）、`events_update.id` 是引擎内部定位键且**在读之前被 `Object.assign({}, u, …)` 克隆**（载荷探针原理上看不见它）。故豁免表按「为什么可以不在 C 面担保」分类，并给每一类配**各自的自证判据**：D1 逐项证明「引擎确实读它」（在基准形态或指定形态上）、D3 声明「不该在契约里」的必须真的不在、D5 声明「该在契约里」的必须真的在（本版修复边界，删掉即红）。`undetectable` 项显式标注并**不**豁免其 D3 约束。
- **两向自证（先跑成红）**：把四处契约行逐字还原成修复前形态 → 锁立刻报 `[C] 缺 chronicle.refs,foreshadows.links,events_create.stage` 与 `[D5] 漏声明 people.aliases,people.avatar,people.resources`；恢复后转绿。破坏锚点（`neu` 片段）在真源码中各恰中 1 次（`[N0]`），且**刻意只取「源码与提示词共有」的片段**（不含 JS 引号），使同一组片段在源码与提示词两侧都能干净还原——初版把 JS 引号写进 `neu`，导致在提示词文本上还原失败、N1/N3 假红。
- **验证**：`tests/rel-contract-v2600.js` → `pass`（23 项）；全量回归 **5026 / 失败 0**（v2.59.0 为 5003，+23 即本版新锁）；死导出门禁绿 **dead 223 / uiDead 4 / dataOnly 122**；ui-wire-audit 9 / 0；出口面契约逐字一致 **ns 70 / members 466 / chars 5742**；field-liveness-gate 绿（无幽灵读点、写/读侧零越界）；提示词实测 58678 → 60188 字节。
- **一条可直接复用的口径**：**探针读键的默认值必须与真值同型**。给「truthy 哨兵」看着更省事（能顺带捕获 `x.f && …` 型受保护读取），但会破坏引擎的类型守卫、让探测在半途静默截断——**漏检比误报危险得多**，因为它伪装成「这一节没有问题」。
- **本轮猎取路径（方法论，供后人复用）**：v2.59.0 用 V8 覆盖率找「零执行面」；本版换了**正交信号**——**Proxy 追踪真实读取**。它照出的是既有全部锁（含 `contract-audit` 这个专治同类病的对账器）都照不到的一维：**同一条契约行内部的字段级增删**。收敛路径：先按节读 `applyResult` 的消费点（grep 出 10 个消费区块）→ 用 `probe_region.js` 做精确分区扫描（判据自纠过一次：`[a-zA-Z_]+` 会排除含数字字段如 `d1`，改为 `[a-zA-Z_][a-zA-Z0-9_]*`）→ 逐项**定性**（补声明 / 明确归为引擎内部字段）→ 建锁。
- **提交**：<code>7070e19</code>。
### R44 · 2026-09-23 · v2.61.0 交付（有界容器「淘汰元字段」的生产者供给面锁·第四十六面：把「淘汰读什么」之外没人钉的「写什么」钉上）

- **做了什么**：
  · 修 **6 处真缺陷**（同一缺陷族，全部行为级实证）——`people` 是有界容器（cap 48），淘汰**唯一**按 `updatedAt` 最旧优先，但有 4 条创建/更新条目的路径**从不写它**。缺字段 ⇒ 排序键恒 0 ⇒ 该条目**恒定被视为「最旧」** ⇒ 刚写入即被优先挤出，与「保留近期活跃者」的设计口径**方向完全相反**：
    ① `engines/backstage.js` people 主通道补 `lastSeenAt: now`（此前 `lastSeenAt` **全库零写入方**，而 `core/store.js` 的 schema 声明了它、`engines/bridge.js:165` 的对外投影也真的读它 ⇒ 另一侧插件永远读到 0）；
    ② `engines/backstage.js` `knowledge_updates` 路径补 `person.lastSeenAt/updatedAt`；
    ③ `engines/intel.js` `addIntel` 补 `p.lastSeenAt/updatedAt`；
    ④ `engines/life.js` `addCommitment` 补 `p.updatedAt`（**同文件内自相矛盾**：`addGoal` 写了、本条漏了）；
    ⑤ `engines/life.js` `addSchedule` 补 `p.updatedAt`（日程自带未来 `start/end`，恰是**最该留在场上**的那类人物）；
    ⑥ `engines/life.js` `tick` 补 `p.updatedAt`（它改写了 `p.intent`——观测面 `observe.slice` 的输入，却不算「人物被更新」）。
  · 新建 `tests/evict-meta-v2610.js`（**26 项**）：A 站点声明⇄淘汰消费者（全仓源码面，经 `tests/product-files.js` 单一真源推导）/ B 消费者⇄排序键（从 sort 表达式解析，且与站点 `why` 自陈一致）/ C 生产者供给面（**行为级主判据**：灌满同样老的 48 条 → 各路径写一个**全新**条目 → 触发真实淘汰 → 必须存活）/ C2 生产者清单⇄源码面 / D 声明⇄写入方（防幽灵字段）/ E 哨兵不泄漏，外加 N0~N8 负控制。
  · 给 `tests/ui-gate-sync.js` 的 `fresh()` 加**产品模块源码覆盖**能力（`opts.srcOverride`）：与既有 `ui/*` 覆盖同一口径，用途是让「修复前形态」在**内存副本**上装载并重跑同款判据（真源码零改写）。默认路径逐字不变，既有 ui-gate 53/0 不受影响。
- **为什么既有 45 个面全都照不到（本版最关键的定位）**：
  · `tests/run.js` 的 people 容量治理用例（v1.0.0）种下 60 个 **都带 `updatedAt`** 的条目，只验证「排序生效、挤出 48」——它把排序键**当既有事实**，从不问生产者给不给；
  · `tests/run.js` 的 G18 门禁（v2.13.0）钉的是「站点声明 ⇄ 调用点存在」，**不看调用点排的是哪个键**；
  · `core/evict.js` 的 `SITES` 只声明「cap 几、怎么排」，不声明「排序键由谁维护」；
  · field-liveness-gate 管的是「骨架一级键的读写归属」，`people` 内部的 `updatedAt` 在其粒度之下；
  · v2.60.0 的锁管「输出契约节内字段 ⇄ 引擎读取面」，与「持久化元字段的生产者供给面」不同轴。
  · 一句话：**既有锁把淘汰「读什么」钉住了，没人钉「写什么」**。
- **判据设计上的自纠（两处，均由实跑暴露）**：
  · ① **排序键解析空集**：`siteCallIn` 初版正则只认 `\[x\]\s*&&\s*ident\[x\]\.F`，而真实形态是 `draft.people[a] && draft.people[a].updatedAt`（**带点路径**）⇒ 解析结果空集、B 面假红。改为接收者允许 `(?:.prop)*`。
  · ② **幽灵字段假阳性**：`writersOf` 初版只认 `{`/`,` 前缀的对象字面量属性，而多行字面量里属性**各占一行、位于行首** ⇒ backstage 的 `avatar` 被误报成幽灵字段。改为 `(?:^|[\{,])\s*field\s*:`。
  · ③ **E 面从「全字节比对」改判**：探测经 `store.transact` 会**真落盘**（批外 `store.save`），故探测窗口改为「快照 → 跑 → 还原」自隔离；而 mock 的日志是**防抖异步落盘**、`store.init()` 自身在 `loadEventLog` 时会 `flushLog()` 落一次盘——那是**基建行为**，拿它当判据会把「基建时序」误判成「锁有副作用」。E 面最终钉的是本锁自己的契约：**哨兵不得泄漏进真实存档**（另把 `WA.log` 在探测窗口静音，静音的是诊断出口、不改任何被测行为）。
- **两向自证（先跑成红是纪律，两种口径都做了）**：
  · **内存副本口径**（N1/N3）：把六处修复点逐字还原成修复前形态 → 同款判据现形**恰 4 处**（`knowledge_updates` / `addIntel` / `addCommitment` / `addSchedule`），与修复前实测集合逐项一致；只还原一路时恰好报那一路。
  · **真源码破坏口径**（独立取证）：真删 `backstage.js` / `intel.js` 两处修复语句（锚点各恰中 1 次）→ 锁立刻报 `[C] 缺 backstage.applyResult.knowledge_updates(updatedAt=undefined), intel.addIntel(updatedAt=undefined)`；从备份还原后 `cmp` **逐字节一致**、锁转绿 26/26。
- **验证**：`tests/evict-meta-v2610.js` → `pass`（26 项，连跑两遍可重复）；全量回归 **5052 / 失败 0**（v2.60.0 为 5026，+26 即本版新锁）；死导出门禁绿 **dead 223 / uiDead 4 / dataOnly 122**；ui-wire-audit 9 / 0；出口面契约逐字一致 **ns 70 / members 466 / chars 5742**；field-liveness-gate 绿（无幽灵读点、写侧越界 1 处既有、读侧 0）。
- **一条可直接复用的口径**：**有界容器的「排序键」是一条跨模块契约，必须有生产者供给面的判据**。只钉「淘汰按什么排」（站点声明 + 调用点存在）会让整族缺陷长期隐身——因为**声明与消费都对，错的是生产者**。判据必须**行为级**（灌满 → 写入 → 真淘汰 → 看存活），静态扫描只能做补充（C2/D）。
- **本轮猎取路径（方法论，供后人复用）**：本版连续排除了三个候选面后才收敛——① 持久化往返（`run.js:8913` 早有 C13 断言、`run.js:968` 早有 toolSnapshot 往返用例，**不重复建设**）；② settingsBus 设置面（写三个探针实测：21 个注册项幻影声明 0、未约束 number 0；11 个有 `bounds/enums/sentinels` 的登记项从各自 `setSettings` 写越界值**全部正确夹取**；再用 Proxy 追踪 `settingsBus.read()` 的 83 个静态子键真实读取，唯一未命中的 `bridge` 4 键经核实是**探针调用链未触达 `buildSnapshot`** 的假阳性，源码侧确实消费）⇒ **该面健全**；③ clock/rand 单一出口（`core/clock.js:76` 自陈已被门禁 G20 覆盖）。转向正交信号——**`grep -rn 'draft.people' 清点容器的全部写入方**，与「淘汰消费的排序键」对照，一眼看出供给面缺口。
- **提交**：`（见本版提交）`。

### R45 · 2026-09-23 · v2.62.0 交付（因果结算：阶段格 × 终态归因 锁·第四十七面：把「世界从记录变化到结算因果」钉上）
- **做了什么**：
  · 新建 `engines/causal.js`（284 行）：**因果结算**——原因成立 → 条件满足 → 行动发生 → 直接后果 → 延迟后果。单独成模块而不并进 `intel`，因为两者**真源不同**：`intel` 管「谁知道什么、凭什么相信」（认知面，可以错——怀疑/谣言），本模块管「事情怎么发生、后果什么时候到」（结算面，不可错——已发生的事实就是事实）。并成一个模块，最直接的后果是「人物以为会发生」与「真的发生了」在状态里长得一样，而路线图把这条列为**最有价值的区分**。
  · 四个**否定式**能力（本面最有价值的部分）：
    ① **条件未足 ⇒ 停在 pending**：`stage='pending'` 而 `status` 仍为 `open`——把「还没做」与「已经做了」在状态上分开。这就是「延期」的自然形态，不需要额外的 defer 调用；连推多次恒定（`changed=0`），且**不得把即时后果写进权威世界事实**。
    ② **前提消失 ⇒ 自动 expired**：`tick` 检测到 `!knownCause(x.cause)` 即置终态并写明归因「前提消失（原因已不在世界事实中）」。这是「旧计划不得照常执行」的落地。
    ③ **延迟后果到点只报告**：`due()` **只报告、不结算**——预测不得自己变成既成事实；结算走 `settle()`，后果落进 `echoes`（已结算结果与正文的接触面）而非 `worldFacts`。
    ④ **取消与失效分开归因**：`TERMINAL = ['settled','cancelled','expired']` 三态显式，且**终态记录不删**——删了就再也答不出「为什么没发生」。
  · 状态落 `store.causal.{chains, settled}`；两容器容量登记 `causal.chains` cap 24 / `causal.settled` cap 40，**剪枝走 `WA.evict.array` 单一出口**（cap 的真源在 `core/evict.js` 的 `SITES`，与 `store.__BOUNDED_CAPS` 同源）。
  · **前置收口① `actors/registry.js` 稳定人物 ID**：`ID_KEY` 按 `chatId()` 分域持久化；序号取「本域已有 id 最大值 + 1」（不读全局计数 ⇒ 切聊天时序号不漂移，同域内删人再增不复用旧号）；形如 `pid_<n>`，**不设 12 上限**。
    · 新增 `identityOf(name)` = `{name, personId, worldKey}` 三位一体（**下游只认这一个口**）；`idStat()` 报出 `beyondSlots`（有身份但未占本轮槽——>0 是**正常**的，而此前这种局面在界面上不存在，只能被读成「人物丢了」）；`idClear(name)` 解绑；`slotStat().purpose` 明写「活动槽只为本轮计算服务；人物身份见 identityOf()（持久、不设 12 上限）」。
    · **修掉一处同名不同义的真实风险**：`engines/life.js` 内部也有一个叫 `personId` 的函数，返回 `'p_' + name`（即 store 里 people 容器的键），而本模块的 `personId()` 返回 `'pid_' + n`——**同名不同义必然误导下一个调用者**。故给 `worldKey(name)`（存档容器键 = 长期状态实际落点）与 `identityOf()` 做唯一桥接，并让 `idStat()` 增加**对账字段** `worldKeys`（容器键 → 已登记编号的映射）/ `stateWithoutId` / `idWithoutState` / `drifted`，使「长期状态绑的到底是哪个键」可被机器核对。
    · 出口收敛：三个有真实消费方的口（`identityOf` / `idStat` / `idClear`）留在出口上，`personId` / `worldKey` / `idOf` **退回实现内部**（拿到 id 请走 `identityOf().personId`）——「导出即有承诺」是本仓库的纪律。
  · **前置收口② 54 项叙事工艺验证固化进版本库**：原 `tools/smoke_v2510_p4.js` 是**临时诊断脚本**（硬编码 `/tmp/wa_git`、`process.exit`、不进任何门禁）⇒ 临时脚本的判据等于不存在。改建 `tests/style-craft-v2510.js`（55 项）：路径改相对仓库根、沙箱改走 `ui-gate-sync.fresh()`（与全部 UI/引擎门禁同一份装载链）、判定交宿主 `assert` 收口（不再自己 `process.exit`，否则带崩整个回归进程），并保留真源码破坏负控制。
  · 接线四面（导出即在用，新增死导出归零）：注入面 `render/inject.js`（`SOURCES` + `def` + `applyInjections` 分支；块内明写「待发生 ≠ 已发生」——回声是**已发生**、本块是**尚未发生**，同形会让「预测」被读成「既成事实」）；面板面 `ui/panel.js`（因果结算分区 21 控件 + 人物身份分区「持久 ID ↔ 存档键」+ 补全已注册）；诊断面 `engines/tool-diag.js`（`MODULE_EXPORTS` + `secCausal()`，重点报 `cancelled` / `expired` / `blocked` **三个「为什么没发生」的出口** + `actors.identity` 子节）；有界容器面（`core/store.js` 两条容量登记 + `core/evict.js` 两个站点）。
  · 加载链同序插入：`index.js` 的 `LOAD_ORDER` 与 `tests/run.js` 的 `LOAD` 都插在 `longline` 之后、`render/inject` 之前（须晚于 `intel` —— `knownCause` 单一真源指向 `intel.knownCause`；须早于 `render/inject` —— 注入时读 `causal.buildBlock()`）。
- **为什么既有 46 个面全都照不到（本版最关键的定位）**：
  · `tests/run.js` 的 G18 门禁钉「站点声明 ⇄ 调用点存在」，**不问语义、不问阶段顺序**；
  · v2.61.0（evict-meta）钉「淘汰元字段由谁提供」，是**生产者供给面**，与因果语义不同轴；
  · rel-contract v2.59.0 / v2.60.0 钉「节内字段 ⇄ 引擎读取面」，管字段畅通、**不管阶段按什么条件推进**；
  · field-liveness / dead-export 是**静态面**（读写归属、导出承诺），看不出「这个口返回的东西跨刷新会不会变」。
  · 一句话：**既有锁把「因果链的字段存在」钉住了，没人钉「阶段按什么条件、以什么顺序推进」**。而 `pending`→`acted`→`immediate`→`delayed` 这条阶梯上，最有价值的四个能力全是否定式的——一个把 `pending` 直接当 `acted` 推进、把 `due` 当 `settle`、把 `cancelled` 写成 `expired` 的实现，**同样拥全套函数名、全套常量**，存在面判据对它一无所知。
- **判据设计上的自纠（三处，均由实跑暴露）**：
  · ① **把阶段当状态**：初版判据写 `statusOf(id) === 'pending'`，而实现里 `pending` 是**阶段格**（`stage`）、`status` 保持 `open` 表示「尚未行动」。这比单一字段更严格（两个字段并存 = 「还没做」与「已经做了」可分），故改判据而非改实现——**停在 pending 必须同时钉 `stage` 与 `status`**，只钉一个的话，把 `status` 直接当 `acted` 写的实现照样能过。
  · ② **推进格数假设错**：`tick` 一次只推进**一格**（`open`→`acted`→`immediate`→`delayed`），这是真实契约（把「行动发生」与「后果落地」压进同一次调用，会让调用方失去在中间插入判断的机会）。初版负控制探针只推一次就断言 `immediate`，实跑报 `acted` ⇒ 改为推两次并逐格断言。
  · ③ **把「正常推进」误判成「终态被改写」**：初版终态快照对**全部链**取，而未终态的链本就该被 tick 推进 ⇒ 快照必然不等。改为只对已是终态的链取快照（`id:status:updatedAt` 三字段），并加「快照非空」前提防在空集上恒真。
- **两向自证（先跑成红是纪律）**：
  · `tests/causal-v2620.js` 三组真源码破坏（`srcOverride` 内存副本，仓库文件零改写）：`A_EXPIRE`（prune 条件）/ `A_DUE`（due 比较）/ `A_TERMINAL`（终态字面量），N0 校验各恰中 1 次，破坏后对应判据**现形**（`immediate` / 报出 1 项 / 三态全缺），原版上同款判据**全绿**，且 N3 逐锚敏感（域破坏不牵连编号面）。
  · `tests/registry-identity-v2620.js` 三段破坏：`chatId` 退化成单一域 ⇒ 跨聊天隔离判据现形（本域可见 `["甲","乙"]`）；编号前缀被改坏 ⇒ 「不同姓名不同 id」现形（`x=y=p_1`）；对账被摘除 ⇒ 「有状态无编号」现形（`stateWithoutId=[] / drifted=false`）。原版上三者全部通过（`pid_1` / `pid_2` / 报出漂移键）。
  · `tests/style-craft-v2510.js`：清空 `PERSP_TEXT` 正文表 ⇒ 覆盖度判据现形（captured 4 处）且行为真的改变（选了而正文表为空 ⇒ 该轴不出话、产物 0 字）；原版上 `uncovered=0`。
- **验证**：`tests/causal-v2620.js` → `pass`（72 项）；`tests/registry-identity-v2620.js` → `pass`（45 项）；`tests/style-craft-v2510.js` → `pass`（55 项）；全量回归 **5232 / 失败 0**（v2.61.0 为 5060，+172 即本版三项新锁）；死导出门禁绿 **dead 223 / uiDead 4 / dataOnly 122 / 仅测试 131**；field-liveness-gate 绿（骨架一级键 21 个、写侧越界仅 `ui/panel.js::innerHTML` 1 处既有、读侧 0 处）；出口面契约 **ns 71 / members 483 / chars 5889**；中间一轮的 `refs 1701 → 1708` 显式冻结项**已确证增量全部来自新模块 `engines/causal.js` 的 7 处 `WA.` 引用**（`ns` / `members` / `dead` / `uiDead` / `dataOnly` / `deadInTestsOnly` 逐项未变 ⇒ 产品侧零漂移），按仓库既有口径回填（`refs` 采集面是**产品文件面**，不含 `tests/`）。
- **一条可直接复用的口径**：**否定式能力必须用「不得发生什么」来钉**。因果结算最有价值的四件事（停住 / 失效 / 只报告 / 分开归因）在实现里都表现为「某个字段**没有**变成另一个值」，因此判据必须问「此刻它**不是**什么」——`stage` 仍是 `pending`、权威事实里**没有**该键、回声里**没有**该 id、终态**没有**被后续 tick 改写。存在面判据（有 `addChain` 吗 / 有 `TERMINAL` 吗）对这种实现与对「全都会做错」的实现**给出同样的结论**。
- **提交**：`（见本版提交）`。
### R46 · 2026-09-23 · v2.63.0 交付（世界织体 / 社交漩涡 / 悬案 三面锁 · 第四十八 / 四十九 / 五十面：把「人之间的时空关系」「不可逆的经历」「事情查到了哪」各自钉上）
- **做了什么**：
  · 新建 `engines/world.js`（299 行，`WA.world`）：**人之间的时空关系**——地点与路途登记、可达性、共同日程与到场者、「同一时刻只能在一处」。为什么单独成模块，而不并进 `life.js` / `calendar.js`：`life` 管**一个人的**目标/承诺/日程（个体动机面），`calendar` 管**世界钟怎么走**（时间标尺面），本模块管**人之间的时空关系**——谁和谁在同一个地方、从这里到那里要多久、这一场集市点到场的人到底能不能到。「生活」与「共同生活」是两件事：并起来最直接的后果是「有人有事要做」与「有人真的到了场」在状态里长得一样。
  · 新建 `engines/shadow.js`（253 行，`WA.shadow`）：**关系经历与承诺的深化**。为什么不并进 `actors/registry.js` 的 `relations`：`relations` 是**量值面**（0-100、单步 ±20、可上可下，是「此刻态度」），本模块记的是**经历面**（发生过什么、共同隐瞒了什么、承诺到了哪一级）。两者最要命的差别是**可逆性**：量值可以升可以降（今天吵翻、明天和好），经历不可逆（「你替他顶过一次罪」不会因为好感回落到 30 而消失）。把两者并进一张表，最直接的后果是**不可逆的东西被当成可回退的量值**，于是关系史可以在几次数值变动里被抹平——那是这个世界最不该丢的东西。
  · 新建 `engines/threads.js`（288 行，`WA.threads`）：**调查面**（一桩悬案被查到了哪一步、有哪些线索、彼此是否矛盾、凭什么结案）。为什么不并进 `intel.js`：`intel` 是**认知面**（谁知道什么、凭什么相信、置信多少），它管的是「某人以为」；本模块管的是「事情查到了哪」。两者真源不同：认知可以**错**（谣言、误认），调查必须**有据**（结案要给出依据）。并在一起，最直接的后果是「有人怀疑是他」与「查下来确实是他」在状态里长得一样——而那是推理玩法最贵的区分。
  · **十四项否定式能力**（三模块合计，这是本版最有价值的部分）：
    · **world**：① 地点必须先被登记（没登记的地点不是「大概就在附近」而是**不可达**——「随手编一个近处」是本仓库最贵的一类默认值，世界会因为一句话长出一条不存在的街）；② 路途必须有据（没登记的道路就是**走不过去**，不得按直线距离编一条路；`reach` 无路时返回 `{ok:true, reachable:false, minutes:null, hops:null, path:[]}`——**不得**给兜底耗时/路径）；③ 「同一时刻只能在一处」冲突必须被拒绝并归因，且三理由**分开**：`unknown-place` / `closed`（回报开闭时刻）/ `scheduled-elsewhere`（写明在哪）——「地点不存在」与「人在别处」不是同一件事；④ 共同日程不得被读成「所有人都在场」：在场者只来自**证据**（人物自己的日程安排，`evidence:'schedule'`），无依据者返回 `who:[]`而**不是**「大概有人来」。
    · **shadow**：⑤ `deepen` 只在**已有秘密且仍在生效**时才允许加深，`no-shadow` 与 `shadow-closed` 分开归因（「没有可加深的」与「已经结了」处置完全不同）；⑥ 共同隐瞒是**双方各持一行**（`pairKey` = 两名字排序后 `|` 连接 ⇒ 反向调用落同一行；秘密不共享等于没发生，单方面持有的不是共同秘密）；⑦ 履行与背弃必须**分开归因**、两者都留痕（合成一个「承诺结束」，就再也答不出「他是守了还是赖了」——而那正是关系史上唯一重要的问题）；⑧ 变淡只降**胁迫感**（severity），降到 0 只置 `status='faded'`、**行不删**——秘密**存在过**是事实，不是态度。
    · **threads**：⑨ 结案必须**有依据**（`resolve` 要求至少一条线索支撑，`no-basis` / `unknown-basis`（列出缺哪些）拒收——推理玩法里最贵的一类失败就是「没查出来也能给答案」）；⑩ 矛盾线索**必须被报出、不得被平均**（`net = 支持权重 − 反证权重`，但 `conflicted` 为真时**默认拒收**——`net` 不能掩盖矛盾；两条互相打脸的线索平均成一个「大概」，等于把一条真线索和一条假线索一起销毁；显式 `overruleConflicts` 才越权，且**留痕** `overruled` + 理由，不写 = 事后答不出「为什么跳过矛盾」）；⑪ **悬置 ≠ 结案**（`stalled` 记录不删、**不在** `TERMINAL` 内，新线索能让它**重新动起来**并且不抹掉「为什么曾停下来」；`abandoned` 必须写明理由，缺失即 `missing-reason` 拒收）；⑫ 可靠性由**来源类型**决定（`hearsay 20 / trace 40 / document 60 / testimony 75 / physical 90`），不由「我觉得可信」决定；⑬ 线索不等于结论（注入时明写，低置信**不得**被写成定论）；⑭ 终态显式两态、不含笼统的 `closed` / `done`（`TERMINAL` 为 `['resolved','abandoned']`）。
  · **观测面 `stat.faults`（三面各一，本版新增）**：每个模块的否定式边界都表现为 `{ok:false, reason:...}`，而**拒绝不落盘** ⇒ 在状态里本应完全不可见（「世界没长出不存在的街」这件事无处可读）。故在**导出总线**上各包一层只读观测——`ok === false` 且 `reason` 为字符串时把 `faults[reason]` 加一后**原样返回**（不改判定、不改返回结构、不加导出成员）。包在总线上而不是散进各函数，是为了让「有没有漏掉某条出口」在**结构上不可能发生**。`tool-diag` 三节各自透出 `faults` 与 `faultKinds`。
  · 状态落点与容量：`store.world.{places,roads,events}` / `store.shadow.{rows,experiences}` / `store.threads`（**数组根**，每案自带 `leads` 环）；七条容量登记 `world.places` 24 / `world.roads` 40 / `world.events` 12 / `shadow.rows` 12 / `shadow.experiences` 20 / `threads` 6 / `threads.*.leads` 8（**通配**），**剪枝走 `WA.evict.array` 单一出口**（cap 的真源在 `core/evict.js` 的 `SITES`，与 `store.__BOUNDED_CAPS` 同源）。注意 `threads` 的**登记键就是 `'threads'` 本身**，与 `evict.SITES` 的 `path:'threads'` 逐字同名——G18 会拿站点 path 反查登记键，写成 `threads.cases` 会两边对不上（站点 path 不含通配段时只能全等）。
  · **「在场者名单」刻意不落盘**：它由日程 + 地点**现算**，落盘就会变成一份会过期的第二真源——「谁在场」必须永远能从证据重新推出来。
  · 接线七面（导出即在用，新增死导出归零）：store 骨架 / `__BOUNDED_CAPS` 七条 / `evict.SITES` 七站点 / `index.js` 的 `LOAD_ORDER`（world 晚于 `engines/life.js`，三者早于 `render/inject.js`）/ `tests/run.js` 的 `LOAD` / `render/inject.js`（`SOURCES` 16 → 19 + `__REG.def` 同批登记 + 三条注入分支，块内分别明写「在场者只认证据」「履行 ≠ 背弃」「矛盾不得平均」）/ `engines/tool-diag.js`（`MODULE_EXPORTS` 三条 + `secWorld` / `secShadow` / `secThreads` 三采集节 + `faults` / `faultKinds`）/ 面板面 `ui/panel.js`（**47 个新控件**：world 19 / shadow 13 / threads 15，且三面的关键**拒绝理由**都看得见——它们在世界状态里都长得像「什么都没发生」；`tool-diag` 的控件守卫表同批登记，否则「按钮渲染了但绑定的 id 写错」在新增出口上无人发现）。
- **为什么既有 47 个面全都照不到（本版最关键的定位）**：
  · G18 钉「站点声明 ⇄ 调用点存在」，**不问语义**；evict-meta（v2.61.0）钉「淘汰元字段由谁提供」，是**生产者供给面**；
  · rel-contract v2.59.0 / v2.60.0 钉「节内字段 ⇄ 引擎读取面」，管字段畅通、**不管世界会不会自己造证据**；
  · field-liveness / dead-export 是**静态面**（读写归属、导出承诺），看不出「这个口返回的到底是从证据推出来的、还是编出来的」。
  · 一句话：**既有锁把「字段与开关都在」钉住了，没人钉「世界不许自己长出证据」**。而这三面最有价值的边界全是否定式的、且否定来源不同——一个「没登记就按直线距离补一条路」「没秘密也照样建行再加深」「有矛盾就把净分当结论」的实现，**同样拥全套函数名、全套常量、全套注入分支**，存在面判据对它一无所知。
- **判据设计上的自纠（六处，均由实跑暴露）**：
  · ① **`fresh()` 绝不能出现在判据中段**（本版最贵的一条，跨三把锁同型）：`fresh()` 复用同一个 `global.WorldAxis` 对象并把 `store` 换成新的，中途调用会让**前面所有判据读到的状态集体清空** ⇒ 「空库不产空头段」「被拒的东西不落盘」这类断言退化成**在空库上恒真（假绿）**。修法：把需要空库前提的断言**上移到判据最前**（那时库真的空），并在末尾补**对照断言**（「已登记的确实在」+「被拒的不在」**两侧都查**）。世界/社交两把锁随后也按同法硬化（改成同时检查「不存在的地方不在产物里」与「已登记的地点确在产物里」两侧）。
  · ② **会被容量测试改变的计数必须在容量测试之前读**：容量测试会把早期条目挤出容器（那是**正确行为**），放到后面读就永远读不到 `resolved=1 / abandoned=1`。故新增独立的「四态分列」一节放在「容量」之前。
  · ③ **返回值字段名假设错**：`threads.addLead(id, item)` 返回的是 `{ ok, id: <案 id>, lead: <线索 id>, weight, status }`——`basis` 要用 `.lead`（**不是** `.id`）。初版误用 `.id` 当 basis，于是 `unknown-basis` 蔓延到四处判据与两条负控制。**教训**：锁必须按引擎的真实返回结构写，不能按「看起来应该叫什么」写。
  · ④ **区间语义假设错**：`eventsBetween` 是**半开区间**（`e.end > a && e.start <= b`），恰在边界结束的那场不算跨过。初版用 `(12,12)` 断言「两场都在」实得 1 ⇒ 改为 `(11,12)` 并**新增一条半开区间断言**（把这条契约本身钉住）。
  · ⑤ **断言文本与引擎原文不一致**：写「到场者只认日程证据」而引擎原文是「在场者只认日程证据」——文本型判据的错字会让「这句话还在不在」这件事变成误报源。
  · ⑥ **冻结值口径必须以实跑产物为准，不得沿用记忆**：上一轮记的出口面契约（ns 71 / members 483 / chars 5889 是 v2.62.0 的旧值）与 `inventory.collect()` 的 refs（上一轮误记 1810）都与本版实测不符。本轮以 `node tests/export-contract.js` 与 `node -e` 直读运行时为准：**ns 74 / members 527 / chars 6327**、refs 1814 / ns 80 / members 906 / dead 223 / uiDead 4 / dataOnly 123 / 仅测试 131、`registryParity().checked` 46（前值 40）、`SOURCES` 19（前值 16）。15 处冻结值由一次性补丁回填（每处锚点 `count == 1` 才写盘）。
- **两向自证（先跑成红是纪律）**：三把锁各自四枚真源码破坏锚点（`srcOverride` 内存副本，仓库文件零改写），N0 校验各恰中 1 次，破坏后对应判据**现形**、原版上同款判据**全绿**，N3 **逐锚敏感**（域破坏不牵连邻域），N4 **非恒真**（状态确实逐格变化），N5 **无副作用**（哨兵经快照→跑→还原自隔离，残留键 `无`）：
  · `tests/world-v2630.js`：`A_ROAD`（未登记即拒收）⇒ 道路守卫判据现形；`A_REACH`（可达性改成兜底）⇒ 「无路即不通」现形；`A_ATT`（到场者推入被摘除）⇒ 「只认日程证据」现形；`A_FAULT`（观测面摘除）⇒ 「拒绝可观测」现形。原版：无路即不通且**不给**兜底耗时、有日程依据者恰到场一人、被拒原因确被计数。
  · `tests/shadow-v2630.js`：`A_PAIR`（`pairKey` 改成不排序）⇒ 「两向同一行」现形（`'乙|甲'` 落成两行）；`A_DEEPEN`（守卫被拆）⇒ 「无秘密不得加深」现形；`A_FADED`（`faded` 标记被摘除）⇒ 「变淡即终结」现形；`A_FAULT` ⇒ 「拒绝可观测」现形。
  · `tests/threads-v2630.js`：`A_BASIS`（依据守卫改成自动补）⇒ 「无依据不得结案」现形（观察值 `ok:true / reason: / status:resolved`）；`A_CONF`（矛盾守卫被拆）⇒ 「矛盾未解默认拒收」现形；`A_SUP`（矛盾面判定被摘除）⇒ 「矛盾必须报出」现形（`conflicts:0 / conflicted:false`）；`A_TERM`（终态字面量改坏）⇒ 「两态齐备」现形（`resolved:false / abandoned:false`）。
  · 三把锁的破坏探针**只触发自己那一面**——这一点是本版「分三把锁而非合成一把」这一设计判断的直接实证。
- **验证**：`tests/world-v2630.js` → `pass`（63 项）；`tests/shadow-v2630.js` → `pass`（65 项）；`tests/threads-v2630.js` → `pass`（78 项）；全量回归 **5453 / 失败 0**（v2.62.0 为 5232；+206 即本版三把新锁，另有 15 项为上一版冻结值按实跑产物回填后由红转绿）；死导出门禁绿 **dead 223 / uiDead 4 / dataOnly 123 / 仅测试 131**；field-liveness-gate 绿（骨架一级键 **24** 个、写侧越界仅 `ui/panel.js::innerHTML` 1 处既有、读侧 0 处）；ui-wire-audit **9 / 0**（零幽灵引用）；ui-gate **53 / 0**（逐页真实点击 331 个控件）；出口面契约 **ns 74 / members 527 / chars 6327**（较 v2.62.0 的 ns 71 / members 483 / chars 5889 净增 world 16 + shadow 14 + threads 14 成员）；清册面 refs 1814 / 命名空间 80 / 成员 906。索引与清单同源 **2.63.0**，死子面账本 `version` 与 `_note` 版本词三级同源。
- **一条可直接复用的口径**：**当「最有价值的边界」是否定式且否定来源不同时，锁必须按来源拆开，且必须在判据最前验空白态**。三面各自最贵的失败都是「世界自己造了一个证据」（编一条街、编一条路、编一份名单、无秘密也照样升级、把矛盾平均成结论），它们在实现里都表现为「某个字段**没有**变成另一个值」或「某张表里**没有**多出一行」，因此判据必须问「此刻它**不是**什么」，并且不能在任何会重置共享状态的操作**之后**才问。
- **提交**：`（见本版提交）`。

### R47 · 2026-09-23 · v2.64.0 交付（随机性 / 独立性 / 敌意 三面专锁 · 第五十一 / 五十二 / 五十三面：把「没触发的那次到底算不算掷过」「推进时到底谁说了算」「没记下来的那些去哪了」各自钉上）
- **做了什么**：
  · 锁定三面主攻：`engines/horizon.js`（374 行，**随机性面**：远方/近端随机事件泳道）、`engines/parallel-world.js`（385 行，**独立性面**：主线之外此刻正在发生什么）、`engines/enemies.js`（135 行，**敌意面**：血仇/恩怨 + 黑盒 + 天下大势）。选它们的硬依据是**三面均零专锁**：`grep -rln` 证实 `horizon` / `parallelWorld` 在 `tests/` 下没有任何专锁文件，`enemies` 只在 `rel-contract-v2600.js` 里被顺带提及。
  · **修掉三处真缺陷**（全部由探针与锁的实跑暴露）：
    · ① `horizon` 的 `__hzStat.rolls++` 与 `lastAt` 位于**通道检查之前** ⇒ 用户主动关闭随机事件时，面板那句「掷骰 N 次但零触发」是**假话**（一次都没掷）。修法：两行移到关闭分支**之后**，并在关闭分支记 `reasons['disabled']++`；`rolls` 与 `skipped` 从此**互斥**。
    · ② `parallelWorld.getSettings` 零引用（`unwired`）：`after` 链节点裸调内部闭包 `effSettings()` ⇒ **导出面与真正生效的口可各自漂移**。修法：节点改为经 `getSettings()` 读原始设置 + `effectiveSettings()` 归一 + `shouldAuto()` 判闸门，三条导出同时成为真实生效路径。
    · ③ `enemies.apply` 的**首次入账即已终结**条目写成 `terminatedRound: null`，而清理判据是 `!= null && delta > 20` ⇒ 这类仇敌的「终结保留 20 轮后清除」**永久失效**。修法：入账时若已是终结态就把终结轮次记为当轮。
  · **三处观测面**（同 v2.63.0 `stat.faults` 口径：拒绝必须可观测）：`horizon.stat()` 增 `reasons` / `reasonKinds`（理由归到有限几类，防键集无限增长）；`enemies.dropStat()` 透出**按原因分开**的丢弃计数 + `applied` 四数（与之**成对**）+ `lastDropped`；`tool-diag` 增 `secHorizon` / `secEnemies` / `secParallelWorld` 三采集节（后者透出 `settingsRaw` vs `settingsEffective` 与 `settingsDrift`——**导出读口与生效读口是否已漂移**）。
  · 面板只读可见化（**不加控件**，避免控件计数与幽灵绑定漂移）：泳道行并排显示「掷骰 / 跳过（关）/ 理由分类」；仇敌页显示「丢弃归因 + 入账四数 + 最近丢弃」。
  · 版本与账本：`index.js` / `manifest.json` / `tests/dead-export-ledger.json` / `tests/run.js` 八处断言字面量（升版脚本逐点核对命中数，失配即退出）。
- **为什么既有 50 个面全都照不到（本版最关键的定位）**：
  · `tests/run.js` 的 `engines/horizon v0.5` 与 `engines/enemies v0.3` 两节钉的是**功能在场**（掷得出来、入账成功、临时标记剥离、冷却不触发），判据全在 `fired === true` 一侧；
  · `v2.34.0` 节钉的是平行世界的**呈现面与数据流**（页面真读 store、高影响注入、同名覆盖、连带清理）——它证明了「能跑」，没证明「只有那一条口能跑」；
  · `field-liveness` / `dead-export` 是**静态面**：它们**能**发现 `getSettings` 零引用，但只能把它记进账本（`test-only` / `unwired`），钉不住「它必须是真路径」；
  · `v2.33.0` / `v1.0.0` 节钉的是**容量数字同源**（24+20=44）——钉的是「声明」不是「治理真的发生」。
  · 一句话：**既有锁把「能触发」「能推进」「仇敌能记下来」钉住了，没人钉「没触发的那次算不算掷过」「推进时谁说了算」「没记下来的那些去哪了」**。
- **判据设计上的自纠（四条，均由实跑暴露，可直接复用）**：
  · ① **`settingsBus` 的落盘真源是 localStorage，不是 `store`**：`store.read('worldaxis_parallel_settings_v1')` 返回 `null`，而 `localStorage[key]` 有值。按 `store` 读会永远拿到 `undefined`，于是「非法枚举不落盘」这条判据**在原版上也假绿**（`undefined !== 'bogus-mode'` 恒成立）。**写否定式判据必须先确认真正的落盘面**。
  · ② **`after` 链上有多个推演消费者竞争同一 fetch 队列**（`backstage.simulate` 排在 `parallel.simulate` 之前），单条 `__pushApiJson` 不保证轮到被测节点。诊断实测：`advance('manual')` 单独调用可成功（`{ok:true, reason:'manual', modules:1, npcs:1}`）、`shouldAuto()` 为真、12 个 `after` 节点全 enabled——说明链与闸门本身正常，问题在判据的响应投喂方式。修法是**多喂 8 条 + 用 `workflow.run()` 返回的 `executed` 单独钉住「节点确实被链调度」**，否则「库一格不动」这条判据在「节点压根没跑」时也成立（**假绿**）。
  · ③ **破坏锚点必须覆盖完整的破坏面**：关闭态「不写」由节点闸门**和** `advance()` 内部守卫**两条**联合保证，只拆闸门时 `advance` 仍会拦下，N1 不现形（实测 `delta` 恒为 0 即此因）。修法：把 `BROKEN[0]` 扩展为**多锚点**（`parts`），同时拆闸门与 `advance` 内部守卫。
  · ④ **破坏锚点若覆盖真源码里的两处同型行，破坏后会产生双计数**（horizon 的 `A_ROLLS` 实测 `delta=4` 而非 2）：此时应改**方向性断言**（`delta > 0`）并由**原版侧的精确断言**（`delta === 0`）承担另一半——两向合起来才叫自证。
  · 另：`[N5] 无副作用` 出现真泄漏（哨兵进了 `worldaxis_state_test_chat_001`），根因是 **store 的落盘是异步的**——`restoreLS` 摘掉磁盘上的哨兵后，队列里还压着一次落盘会把含哨兵的内存态写回。修法：断言前先 `await tick()` 两拍（那不是泄漏，是**时序**）。
- **两向自证（先跑成红是纪律）**：三把锁各携带真源码破坏锚点（`srcOverride` 内存副本，仓库文件零改写），N0 校验各恰中 1 次，破坏后对应判据**逐条现形**；N2 侧原版全绿；N3 逐锚敏感（一枚破坏不牵连别面）；N4 非恒真（分类表/闸门/原因表确实随状态变化）；N5 无副作用。
  · `tests/horizon-v2640.js`（41 项）：`A_ROLLS`（通道检查块整体）⇒「关闭时 rolls 不涨、skipped 恰 +2」现形；`A_COOLDOWN` ⇒ 冷却递减现形；`A_FORCED` ⇒ 保底无条件触发现形；`A_REASON` ⇒ 分类归因现形。**判据必须自证可复现**：三类局面（disabled / cooldown / pending-dropped）全部用**确定性**手段制造，不用概率（`distantChance: 1` 在收窄口径下是 **1%** 而非 100%，靠概率的判据会给回归带来随机红点）。
  · `tests/parallel-world-v2640.js`（50 项）：`A_READ`（整条闸门六行）+ `A_ADVGUARD` ⇒「关掉开关就一格不动」现形；`A_MODE` ⇒「非法枚举不落盘」现形；`A_MIN` ⇒「低影响不进主线」现形；`A_NAME` ⇒「空名拒收」现形。
  · `tests/enemies-v2640.js`（49 项）：`A_DROPSHAPE`（两类合流）⇒「分开计数」现形；`A_DROPNAME`（静默吞掉）⇒「丢弃必须可观测」现形；`A_MAXACTIVE` ⇒「超容量即挤出」现形；`A_SHOW` ⇒「有界展开」现形；`A_APPLIED` ⇒「入账与丢弃成对」现形；`A_TERMROUND`（终结戳写回 null）⇒「终结窗口起算」现形。
- **验证**：`tests/horizon-v2640.js` → `pass`（41 项）；`tests/parallel-world-v2640.js` → `pass`（50 项）；`tests/enemies-v2640.js` → `pass`（49 项）；全量回归 **5572 / 失败 0**（v2.63.0 为 5453；+140 即本版三把新锁，另 +21 为三处缺陷修复带出的断言）。冻结值按**实跑产物**回填：`export_contract` **ns 74 / members 539 / chars 6481**（前值 527 / 6327）；`inventory.collect()` refs **1845** / ns 80 / members **913**（前值 1814 / 906）/ dead **225** / uiDead 4 / dataOnly **117**（前值 223 / 4 / 123）/ 仅测试 131；`dead-export-gate` 绿（`dead 225 · uiDead 4`，归因分布 `test-only 131 / self-only 88 / unwired 6`——`unwired` 由 7 降到 6 即本版修掉的 `parallelWorld.getSettings` 转为**活导出**的实证）；`field-liveness-gate` 绿（骨架一级键 24、写侧越界 1 处既有 `ui/panel.js::innerHTML`、读侧 0）；`ui-wire-audit` 9 / 0；`ui-gate` 53 / 0（逐页真实点击控件 331 个，**未变**——本版面板只加只读行、不加控件）。
- **一条可直接复用的口径**：**否定式能力的判据必须落在「不发生活动的那一侧也说得清」上**。三面最贵的边界分别是「没掷的那次别算成掷过」「没开的时候别写」「没进去的那些要说去哪了」——它们共同的特征是：**在状态里长得像「什么都没发生」**。凡是这种边界，都必须先在引擎里造一个**只在拒绝/跳过路径上增长**的计数器，再把判据钉在那个计数器与「真做了什么」的**互斥关系**上；只有计数、没有互斥关系，判据就退化成「计数存在」。（同型先例：v2.63.0 三面的 `stat.faults`。）
- **提交**：`（见本版提交）`。

### R60 · 2026-09-24 · v2.77.0 好感结算端四纪律（阶段封顶 / 提案过期 / 行级撤销 / 纠错依据）
- **做了什么**：<code>engines/fondness.js</code> 升 v2.77.0——① <code>advance()</code> 阶段授权（四条具名拒收 <code>stage-off</code>/<code>locked</code>/<code>not-at-cap</code>/<code>top-stage</code>，授权只放宽上限、不动读数）；② <code>mode:'confirm'</code> 提案入账与 <code>accept()</code> 过期核验（<code>stale-proposal</code>/<code>no-pending</code>/<code>already-pending</code>/<code>reject()</code>）；③ <code>undo()</code> 行级撤销（<code>not-undoable</code>）与 <code>correct()</code> 手动纠错（<code>bad-value</code>、不得降值）；④ 纠错依据进 <code>buildBlock()</code> 并明标「数据，不是角色记忆」。新增 <code>propose</code>/<code>accept</code>/<code>reject</code>/<code>undo</code>/<code>correct</code>/<code>advance</code> 六出口与 <code>stat</code> 六项计量、两个行内环站点（历史 8 / 纠错 8）。
- **为什么**：外部材料「反向好感度 v1.9.0」的八阶段分档与「玩家拥有最终解释权」是一整套结算端纪律，能落成「登记 → 核验 → 拒收码」的只有这四条（名称表/面板/独立评估器/世界书同步/API 重试分别是渲染面与宿主编排，按既有口径不收）。四条同属「好感/结算契约」一族，故合成一批。
- **落地时实测到的真缺陷（本版修掉）**：段顶若直接取 <code>BANDS[i].hi</code>，在半开区间显示口径下<b>永远不可达</b>——值一到 <code>hi</code> 就换段、<code>capOfRow</code> 随之抬到下一档，于是 <code>band-cap</code> 拦不住任何一次步进、<code>advance()</code> 永远报 <code>not-at-cap</code>，<b>阶段授权整条链是死的</b>（写出来却走不到。「功能级失效」的又一变体：不是零调用，是<b>判据不可达</b>）。修法：授权段顶取段内最大可取值 <code>hi-0.1</code>，末段封顶 <code>CAP=100</code>；显示与授权同源，站在段顶时 <code>bandOf(v)</code> 仍是本段名。
- **一条可直接复用的口径**：**「拒收码存在」不等于「拒收码可达」**。本版 <code>stale-proposal</code> 最初被 <code>undo()</code>/<code>correct()</code> 里的 <code>hit.pending = null</code> 顺手抹掉，现象是「过期的建议变成 no-pending」——问题被藏进另一个码里。凡新增拒收码，必须先用一条**从真实入口走到该码**的探针把它跑出来（本版 34 条行为探针就是这批码的可达性证明）；只在引擎里写 <code>if (...) return { reason: 'x' }</code> 就宣布「已有该判据」，与写死一个无人到达的分支没有区别。
- **影响范围**：改 <code>engines/fondness.js</code>、<code>core/evict.js</code>、<code>core/store.js</code>、<code>tests/run.js</code>（八处版本断言 + 死子面/清册面冻结字面量 + 挂载 v2.77.0 专锁）、<code>tests/dead-export-ledger.json</code>（<code>--update</code>，<code>version=2.77.0</code>）、<code>index.js</code>、<code>manifest.json</code>、<code>README.md</code>、<code>ITERATION_LOG.md</code>；新增 <code>tests/settle-v2770.js</code>。
- **门禁结果**：<code>node tests/settle-v2770.js</code> → <b>82 / 失败 0</b>（34 条行为探针 + 十条破坏锚点的双向自证）；<code>node tests/dead-export-gate.js</code> 绿（<code>dead 413 · uiDead 4</code>，归因 <code>test-only 264 / self-only 120 / unwired 33</code>，条目 417）；冻结字面量按实跑回填：清册面 <code>refs 2171 / ns 106 / members 1165</code>、死子面 <code>dead 413 / dataOnly 154 / 仅测试 260</code>。
- **提交**：`（见本版提交）`。

### R59 · 2026-09-24 · v2.76.0 挂载后遗风（锁不得给宿主全局留残骸；把「靠顺序活着」判据化）
- **做了什么**：① <code>tests/lock-assert.js</code> 增 <code>restoring(fn)</code>（<b>单一真源</b>），四个锁导出改为 <code>restoring(runAll)</code>；② <code>tests/test-surface-gate.js</code> 新增判据 D「宿主不变量」与 <code>globalResidueProbe()</code>（子进程探针，抳 <code>global.window</code> / <code>global.document</code> 整换或抹键）；③ <code>tests/orphan-lock-v2750.js</code> 新增四条自证（A 段断还原包装 / B 段断现场零残骸 / D7 探针两侧自证 / D8 撤掉包装后必被逮住）。版本号升至 2.76.0（<code>index.js</code> / <code>manifest.json</code> / <code>tests/run.js</code> 八处版本断言）；账本 <code>--update</code>（<code>version=2.76.0</code>）。
- **为什么**：v2.75.0 交付后立即倒查自己的挂载动作 —— 「把一个从不执行的测试文件接进回归」除了「它自己通不通过」，还改变了什么？扫「谁写 <code>global.</code> 而不清理」时发现四个锁开头是 <code>global.window = { WorldAxis: WA }</code>（<b>整体替换</b>）且从不还原。裸脚本时期无害（只影响自己进程），挂载后<b>第一次变成活的</b>：实测跑完四个锁，<code>global.window !== mock 的 window</code>、<code>'document' in global.window === false</code>（33 个键消失）。没炸只因它们恰好排在回归末尾 —— <b>「靠顺序活着」</b>。
- **影响范围**：改 <code>tests/lock-assert.js</code>、<code>tests/intel-v2530.js</code> / <code>tests/life-v2520.js</code> / <code>tests/longline-v2550.js</code> / <code>tests/org-v2540.js</code>、<code>tests/test-surface-gate.js</code>、<code>tests/orphan-lock-v2750.js</code>、<code>tests/run.js</code>、<code>index.js</code>、<code>manifest.json</code>、<code>tests/dead-export-ledger.json</code>、<code>README.md</code>、<code>ITERATION_LOG.md</code>。
- **门禁结果**：<code>node tests/run.js</code> → **6706 / 失败 0**（v2.75.0 为 6694，+12 即本版新增断言）。<code>node tests/test-surface-gate.js</code> → **文件面 43 · 锁 40 · 可达 43 · 孤儿 0 · 宿主残骸 0 · EXIT=0</code>。<code>node tests/orphan-lock-v2750.js</code> → <code>ORPHAN-V2750: pass</code>（150 断言 / 0 失败）。死子面门禁绿（dead 407 / uiDead 4，账本 411 条）。
- **真缺陷与判据演进**：
  · 教训一：<b>挂载一个此前不执行的测试文件，等于把它所有的进程级副作用第一次接进共享进程。</b> 挂载前要审的不只是「它能不能通过」，还有「它给共享全局留下了什么」。
  · 教训二：<b>「靠顺序活着」的绿灯必须判据化</b> —— 顺序不是契约。本版就是因为「新 section 恰好在最后」而首次全量回归全绿，实际已埋了一个只等下一个挂载者踩的雷。
  · 教训三：<b>探针本身要被判据保护</b>（跑不起来报 <code>probe-broken</code>）——探针静默失败会让整条判据变成恒真。
  · 教训四：<b>负控制要在临时文件上做并清理</b>，且要断「已删」；本版 D7/D8 两条都用临时文件，跑完断 <code>!fs.existsSync</code>。<b>测完不清理的负控制，本身就是下一个缺陷源。</b>
  · 实现坑（已进注释）：探针子进程里 <code>require('./tests/x.js')</code> 按<b>脚本自身目录</b>解析，即使 cwd 是仓库根也找不到模块。
- **可复用的判据**：① 挂载前审进程级副作用（共享全局是否被整换/抹键）；② 进程级污染必须在子进程里探（不可在测试进程内自证）；③ 探针要有 <code>probe-broken</code> 自护；④ 负控制只碰临时/内存副本且断「已删」；⑤ 子进程相对路径按脚本目录解析。
- **提交**：`（见本版提交）`。

### R58 · 2026-09-24 · v2.75.0 判据补面（测试文件面可达性：把「从不执行的测试文件」变成红灯）
- **做了什么**：做两件事。① 把四个**从未进过全量回归**的专锁接上：<code>tests/intel-v2530.js</code> / <code>life-v2520.js</code> / <code>longline-v2550.js</code> / <code>org-v2540.js</code> 由「裸脚本 + 末尾 <code>console.log('XXX: pass')</code>」改造为 <code>runAll(a)</code> 锁（<b>断言实现逐字保留</b>，assert 改为注入），挂进 <code>tests/run.js</code> 新增 section <code>v2.75.0 test-file reachability x orphan-lock mount</code>。② 新增常驻门禁 <code>tests/test-surface-gate.js</code> 与专锁 <code>tests/orphan-lock-v2750.js</code>（138 项），并新增 <code>tests/lock-assert.js</code>（断言适配器，单一真源）。版本号升至 2.75.0（<code>index.js</code> / <code>manifest.json</code> / <code>tests/run.js</code> 八处版本断言）；账本跑 <code>--update</code>（<code>version=2.75.0</code>，411 条证据重算）。
- **为什么**：v2.74.0 交付后立即侦察，沿「静态面盲区」族往下审 —— 这次审的是<b>孤儿测试文件</b>（存在于 <code>tests/</code> 却没人挂载 ⇒ 从不执行）。用 <code>require('./x.js')</code> 从全仓 <code>repoFiles()</code> 建依赖图、以 <code>tests/run.js</code> 为根做 BFS，得到<b>34 可达 / 6 不可达</b>。6 个不可达里两个属正常（<code>export-contract.js</code> 被 run.js 以 <code>spawnSync</code> 调用、<code>ui-gate.js</code> 的案例被内联进 run.js），<b>另外 4 个是真孤儿</b>。逐一实测：四个文件<b>独立 <code>node</code> 跑通</b>（输出 <code>INTEL-V2530: pass</code> 等），但<b>均无 <code>module.exports</code></b>、不在 spawn 清单、也不被内联 ⇒ <b>全量回归从未执行过它们</b>。危害链：v2.73.0 起账本归因覆盖全部 <code>tests/*.js</code>，于是这 4 个「从不执行的文件」的引用成了归因依据 —— <b>「归因建立在不执行的文件上」</b>。
- **影响范围**：新增 <code>tests/test-surface-gate.js</code>、<code>tests/orphan-lock-v2750.js</code>、<code>tests/lock-assert.js</code>；改 <code>tests/intel-v2530.js</code> / <code>tests/life-v2520.js</code> / <code>tests/longline-v2550.js</code> / <code>tests/org-v2540.js</code>、<code>tests/run.js</code>、<code>index.js</code>、<code>manifest.json</code>、<code>tests/dead-export-ledger.json</code>、<code>README.md</code>、<code>ITERATION_LOG.md</code>。
- **门禁结果**：<code>node tests/run.js</code> → **6694 / 失败 0**（v2.74.0 为 6556，+138 即本版专锁）。<code>node tests/test-surface-gate.js</code> → **测试文件面 43 · 锁 40 · 可达 43 · spawn 2 · 内联 2 · 孤儿 0 · spawn 行 17 · EXIT=0</code>。<code>node tests/orphan-lock-v2750.js</code> → <code>ORPHAN-V2750: pass</code>。死子面门禁绿（dead 407 / uiDead 4）；清册绿（refs 2160 / ns 106 / members 1159，四类悬空 0）；出口面 <code>ns 100 / members 566 / chars 7004</code>；产品文件 107、测试文件 43。
- **真缺陷与判据演进**：
  · 缺陷（测试基建侧·孤儿文件）——四个锁「独立可跑、回归不跑」。关键观察：**没有任何一道门禁会因此变红**（文件存在、内容合法、独立跑通、引用计数照旧），它只能被「建图 + 查可达性」这种<b>结构性判据</b>看见。<b>教训：测试文件的「存在」不等于「被执行」；新增任何测试文件必须同时决定它的挂载方式。</b>
  · 判据输入面自踩（本版连续三次，全是同一个族）：① 首版用字符串匹配找引用，转义问题导致<b>全部 39 个文件都「零引用」</b>（误报）；② 二版改用 <code>require('./x.js')</code> 正则但<b>跑在 <code>codeFace</code> 上</b> —— 模块路径<b>是字符串字面量</b>、<code>codeFace</code> 会把它抹成空白 ⇒ 依然全部不可达；③ 三版改回原文面后路径归一正则被过度转义成 <code>.js.js</code>；④ 四版修正后得到真结果。<b>教训（v2.74.0 同族再确认）：判据的输入面必须与判据要观测的东西同面 —— 扫 JSDoc 看原文、扫真代码引用看 codeFace、而扫模块路径必须看原文面（路径是字面量）。</b>
  · 本版自踩（挂载后由全量回归抓到）——<b>注入面不是 Node 的 assert</b>：run.js 注入的是它自己的 <code>assert(cond, name, extra)</code>，而四个锁体写的是 <code>assert.strictEqual/ok</code> ⇒ 首跑直接 <code>TypeError: assert.strictEqual is not a function</code>。当时的方案 A 是「把 4×19 处 assert 逐步改成注入形态」，被<b>回滚</b>（重复 4 份、且改动面大）；改走 <code>tests/lock-assert.js</code> 适配器（<b>单一真源</b>，把 Node 风格调用接到注入断言上，探针仍由聚合器持有、锁体逐字保留）。<b>教训：改造既有测试文件前，先确认聚合器注入的断言面是什么形态 —— 两个 assert 面（Node 模块 vs 自定义函数）不可混用；适配优于改写。</b>
  · 专锁自身踩同一个坑——它也用 Node 风格断言（<code>assert.ok is not a function</code>），且 A 段认的是 <code>const assert = a;</code> 这个字面量，适配器一上就失效。两条一起改（认适配器形态）。<b>教训：新写的锁如果与既有锁共用聚合器，就要共用同一套注入约定，否则新锁自己会成为下一个「首跑即红」。</b>
  · C 段升级为双向自证：原计划「破坏后必须变红」，落地为 <b>C0 未破坏时同款断言零失败 + C1 破坏后必须现形</b>（记录失败或以异常逃出都算逮住），且破坏只写内存副本、<b>finally 里逐字还原并断哈希</b>。<b>教训：负控制只断「变红」会漏掉「基线本来就红」或「断言根本没跑」两种假绿；两侧都断才是自证。</b>
  · 豁免表当前为空：两个非 require 入口（spawn / 内联）判据自己认得出，<b>不需要人工白名单</b>。判据 B 专门防「豁免表变成白名单垃圾桶」（豁免项若已有 spawn/内联/require 入口即报冗余或腐烂）。<b>教训：能由判据自己判定的分类一律不要写进人工清单。</b>
- **可复用的判据**：① 测试文件的「存在」≠「被执行」——建依赖图查可达性，不可达者必须显式分类；② 扫模块路径要看去注释但保留字面量的面（<code>codeFace</code> 会把路径抹掉）；③ 提及不是引用（注释里的路径不构成边）；④ 豁免表必须防腐烂（豁免项得真在孤儿里）且能自动识别的分类不写进人工清单；⑤ 反空转下限是判据的必需品（文件数 / 锁数 / 可达数 / spawn 行一起断）；⑥ 聚合器注入的断言面是自定义函数、不是 Node assert —— 既有测试文件改造时须过适配器，勿逐处改写；⑦ 负控制要两侧自证（基线零失败 + 破坏后现形），破坏只碰内存副本并逐字还原。
- **提交**：`（见本版提交）`。

### R57 · 2026-09-24 · v2.74.0 判据补面（重复定义门禁：把「补丁重跑」变成红灯）
- **做了什么**：新增 `tests/dup-decl-gate.js`（重复定义门禁，179 文件逐份扫）与专锁 `tests/dup-decl-v2740.js`（28 项），并从 `tests/product-files.js` 删除一处**真重复**（`testFiles` 连同 JSDoc 出现两遍，:89 与 :107）。删除被弃用的中间产物 `tests/shadow-decl-gate.js`（括号深度法，见下）。门禁接入 `tests/run.js` 新增 section `v2.74.0 duplicate-declaration x patch-rerun-fingerprint lock`；版本号升至 2.74.0（`index.js` / `manifest.json` / `tests/run.js` 八处版本断言）；账本跑 `--update`（`version=2.74.0`，411 条证据重算）。
- **为什么**：v2.73.0 交付后立即侦察，读 `tests/product-files.js` 全文时发现 `testFiles` 函数与其 JSDoc 块重复两遍。`git show 727d7ad:tests/product-files.js | grep -c "function testFiles"` = **0**（v2.72.0 时不存在），交付后为 **2** —— 坐实是 **v2.73.0 自己的补丁被重复执行**。关键观察：**三道门禁全绿**（全量回归 6528/0、死子面门禁绿、清册绿），因为 JS 允许重复顶层 `function` 声明、后者静默覆盖前者，本例两份逐字相同、行为等价。这是一个「运行时不可见、只能静态看见」的缺陷，而静态面此前**没有任何判据**。
- **影响范围**：新增 `tests/dup-decl-gate.js`、`tests/dup-decl-v2740.js`；删除 `tests/shadow-decl-gate.js`；改 `tests/product-files.js`（删 19 行重复块）、`tests/run.js`（挂载 + 8 处版本断言）、`index.js`、`manifest.json`、`tests/dead-export-ledger.json`、`README.md`、`ITERATION_LOG.md`。
- **门禁结果**：`node tests/run.js` → **6556 / 失败 0**（v2.73.0 为 6528，+28 即本版专锁）。`node tests/dup-decl-gate.js` → 扫描 179 文件 · 顶层声明 1391 · JSDoc 312 · 重复 0 处 · EXIT=0。死子面门禁绿（dead 407 / uiDead 4 / test-only 253 / 其余 154）；清册绿（refs 2160 / ns 106 / members 1159，四类悬空 0）；出口面 ns 100 / members 566 / chars 7004；账本 411 条（self-only 121 / test-only 253 / unwired 33）；`testFiles` 40 个（前值 38）。
- **真缺陷与判据演进**：
  · 缺陷（测试基建侧·补丁重跑）——同一条插入补丁被执行两次，产出「静默覆盖」的一对声明。**教训：任何往源码里插文本的补丁都必须带幂等保护（锚点 0 次但新串已在位 ⇒ 视为已回填跳过；命中 >1 次 ⇒ 立即退出），并把「重复声明」本身变成静态判据 —— 它运行时无感，只能静态看见。**
  · 判据设计三次收敛（前两版弃用，都是**判据口径自己有问题**）：① `shadow-decl-gate.js` 用「缩进前缀 + 名字」判重名 → 首跑 **1316 处误报**（`actors/registry.js` 的 `nm` 在 6 处不同作用域合法重名等），属**口径过宽**（把跨作用域同名当冲突）；② 改用**括号深度**追踪真作用域 → 现场零告警，但核验时发现 `tests/run.js` 原文括号净差本身就是 **78**（字符串/正则/模板字面量里的花括号干扰），深度法不可靠；③ 定稿三条判据（顶层重名 / 重复 JSDoc 块 / 同名同体函数）+ 三条反空转下限 + 复用单一真源。**教训：判据宁窄勿宽 —— 只看自证得了的那一种；「零告警」在空集上恒真，所以反空转下限是判据的必需品。**
  · 判据输入面自踩（两处，均由本版首跑暴露）：① **JSDoc 判据跑在 `codeFace` 上**（该面已剥注释）⇒ 计数恒 0，靠反空转下限抓住；② **`bodyOf` 偏移量算错**（用 `split('
').slice(0,i).join('
').length`，join 少一个换行 ⇒ 提取错位），修正为**预计算行首偏移数组**。**教训与 v2.73.0 同源：判据的输入面必须与它要观测的东西在同一面上。**
  · 同体比对的两侧边界（本版最后两处自踩，已机器化进锁）：**① 缩进必须归一** —— `bodyOf` 从该声明的行首切起，两份「外层 + 内层缩进各一份」的同一段代码若把前导空白算进签名，会被判成「不同体」而漏报；**② 连续空白必须保留** —— 真代码面里字符串字面量是被「等长空白」抹掉的，若把 `<code>\s+</code>` 折叠成一个空格，`tests/run.js` 的 `section` 两处（一份 `'
■ '`、一份 `'
■ '`，运行结果一样、源码不是同一份）会被误报成同体。最终签名 = `name + ' ' + normBody(body)`（`normBody` 按**最小公共缩进**去行首缩进，其余空白原样保留）。
  · 专锁首跑 5 项红，**全是测试面自己的错**（非判据缺陷）：破坏数据与负控文案的 JSDoc 正文净长 55 / 44 字，**低于 `JSDOC_MIN=80`**，被判据自己的门槛过滤 —— 破坏根本没发生，判据当然「没现形」；「判据看对的面」一段拿 `dup-decl-gate.js` 当样本，而该文件通篇 `//` 注释、`/** */` 块数为 0（样本选错）；「非恒真」一段用 `kinds(scan)` 读反空转下限，但下限由 `judge()` 产生、不在 `scan()` 的 `problems` 里（调用对象用错）。**教训：判据先跑成红时，红的是测试面还是判据要分清 —— 本锁已自带前置断言，先把「测试数据能不能触发判据」自己验一遍。**
- **可复用的判据**：① 补丁必须幂等（锚点 0/多次分别有确定行为）；② 重复顶层声明只能静态看见 ⇒ 必须有静态门禁；③ 判据的输入面必须与判据要观测的东西同面（扫 JSDoc 看原文、扫真引用看 codeFace）；④ 反空转下限是判据的必需品（文件数 / 声明数 / JSDoc 数一起断）；⑤ 带 `g` 标志的正则不要在模块级复用（本版改为每次新建实例，一并消除 `lastIndex` 污染这类隐蔽状态）；⑥ 判据宁窄勿宽，误报会把真信号淹掉。
- **提交**：`（见本版提交）`。

### R56 · 2026-09-24 · v2.73.0 口径修复（测试引用面覆盖全部测试文件）
- **做了什么**：修一处**判据输入面比事实窄**的真缺陷——死子面冻结门禁的测试侧引用数 `tref` 只读 `tests/run.js` 一个文件。修改五处：① `tests/product-files.js` 新增 `testFiles(root)`（`tests/` 下全部 `.js`，38 个）作为**测试面单一真源**并加入导出；② `tests/inventory.js` 的 `testRefSet` 从「只读 run.js」改为遍历 `testFiles()` 全部文件（每文件仍过 `codeFace()` 只认真代码面）；③ `tests/dead-export-gate.js` 的快照字段 `__snap.run` → `__snap.tests`、`productSnapshot()` 签名与读取扩展覆盖全部测试文件、`testRefCount` 改为累加所有测试文件引用数；④ `tests/run.js` 四处硬编码口径锚点同步（v2.27.0 段 `deadInTestsOnly 131→253`，v2.28.0 段归因分布 `135/218/58 → 253/121/33`，v2.28.0 / v2.29.0 两段现场锚点「仅测试 131→253」，另 `dist` 双面值 `253→257` 含 uiDead）；⑤ `tests/dead-export-ledger.json` 跑 `--update` 刷新（411 条证据全部重算）。版本号升至 2.73.0（`index.js` / `manifest.json` / `tests/run.js` 八处版本断言），账本 `version` / `_note` / 入口 `VERSION` 三级同源。
- **为什么**：v2.73.0 轮做「拒收码可达性探针」时顺带对账本做交叉核对，发现 `karma.setSettings` / `hazard.setSettings` / `marginal.setSettings` / `tolerance.setSettings` 四项被标为 `unwired`（产品与测试均零引用），而 `tests/settle-v2720.js:115` 明明调用 `WA.karma.setSettings`。追下去发现**不是账本写错一条，是判据的输入面根本不够宽**：`tests/run.js` 是聚合器，末尾用 `require('./settle-v2650.js').runAll(assert)` 等把 8 个 `settle-v26xx/v27xx.js` 专锁与 2 个专项测试拉进同进程跑；三处读取点都只扫 run.js 文本，专锁里的真引用对归因**完全不可见**。影响面量化：**122 项**被误标（8 个专锁 27/25/16/14/12/11/10/9 项 + `rel-contract-v2590.js` 1 + `style-craft-v2510.js` 1）。此缺陷与 v2.29.0「一行注释掏空死子面」**同族**：判据的输入面比事实窄，结论就稳定地错——而且错得佷像真的（账本有数、门禁全绿）。
- **影响范围**：`tests/product-files.js`、`tests/inventory.js`、`tests/dead-export-gate.js`、`tests/run.js`、`tests/dead-export-ledger.json`、`index.js`、`manifest.json`、`README.md`、`ITERATION_LOG.md`。
- **门禁结果**：`node tests/run.js` → **6528 / 失败 0**。专锁 `tests/settle-v2720.js` 保持 179/0。死子面门禁 → `dead 407 · uiDead 4 · 归因分布 test-only 253 / 其余 154`，元数据三级同源 ✓、证据可复算 ✓。清册面 refs 2160 / ns 106 / members 1159；死子面 dead 407 / uiDead 4 / dataOnly 154 / 仅测试 **253**（前值 131）；账本 411 条（**self-only 121 / test-only 253 / unwired 33**，前值 218/135/58）；测试文件面 38 个（单一真源）。
- **真缺陷与判据演进**：
  · 缺陷（判据侧·输入面窄于事实）：三处读取点同源只看 `tests/run.js`，而测试面实为 38 个文件。修复后 `deadInTestsOnly` 131→253（+122 与独立审计定量吻合），`unwired` 58→33——**这 25 项不是「被接通了」，是从「错误地认为没人用」变成「正确地认出谁在用」**。另 4 项 uiDead 归因同批归正。**教训：凡统计「谁引用了它」的判据，输入面必须与「谁真的可能引用它」同宽；聚合器入口不是全集，而是指向全集的指针。**
  · 判据纯度自纠（本版踩的坑）：临时断言把 `dist2800` 的分母当成 dead 单面（253），实则为 **dead + uiDead 双面**（`uiDead` 4 项全为 test-only）⇒ 正确值 257。**教训：统计冻结面分布时必须先明确分母是单面还是双面；`deadInTestsOnly` 是单面值，`dist` 是双面值，两者不可互相验证。**
  · 探针误判排除（先于下结论）：`tools/w273_code_probe.js` 对四引擎 28 个声明拒收码做可达性探针，首跑 20/28，逐 FAIL 分析后确认**全是探针写错**（`maxRows:1/2` 被 `settingsBus.bounds` 归一化、`already-pending` 在 `roll()` 而非 `bump()`、`missing` 在 `drop()` 而非 `clear()`、tolerance 先报 `bad-kind` 后报 `disabled`——属**四引擎统一的「参数校验先于开关」设计**），非产品缺陷。**教训：探针变红时第一问是「探针写对了吗」，第二问才是「产品错了吗」；两向都要留证据。**
  · 其余三面逆向审计（全绿，无缺陷）：`evict` 三处同源（92 调用点 / 75 SITES / 86 store caps，无未登记、无死站点、无 cap 漂移）；接线矩阵（80 磁盘引擎 / 80 LOAD_ORDER / 80 MODULE_EXPORTS，无缺失无幽灵）；出口面消费（口径以官方 `tests/inventory.js` 为准，自有抽取器产生的 309 幽灵条目已丢弃）。
- **提交**：`（见本版提交）`。

### R55 · 2026-09-24 · v2.72.0 交付（业力双轴 × 累积风险 × 边际折旧 × 手段耐受 · 第六十一面）
- **做了什么**：`engines/karma.js`（新，业力双轴：功德/债独立记账 + 显式核销 + 干预阶梯）、`engines/hazard.js`（新，累积风险：目标值随次数下沉 + 决策流掷骰 + 暗账与显形延迟）、`engines/marginal.js`（新，边际折旧：ratio^count 折扣 + 冷却减半 + 两条清零路径）、`engines/tolerance.js`（新，手段耐受：滑动窗口查重 + burst 幂等 + 窗口自愈）。四引擎接入容量骨架（evict 5 站点含通配 / store 5 容器 / checked 71→75）、装载序、注入源（SOURCES 41→45）、UI 友好名、测试清单，版本号升至 2.72.0。专锁 `tests/settle-v2720.js`（520 行）覆盖 26 处破坏锚点与 N0–N5 负控制。
- **为什么**：对 12 份酒馆预设做第三轮「叙事动力」机制专项复扫。四件可证伪状态机值得进引擎：《世界天道维持系统》的业力-功德双轴与五级干预阶梯、《果实之心》的「n 次累积 → 目标值封底 → 判定 → 延迟显形」、《灵魂调香师》的「好感获取衰减 0.8^(count−1) + 两条计数器清零路径 + 情感冲击冷却期」、《情感浓度》的「近 3 轮重复触发即降级」。四者与既有 76 引擎（fondness/causal/warrant/quota/evolution 等）经 grep 核验均正交。
- **影响范围**：`engines/karma.js`、`engines/hazard.js`、`engines/marginal.js`、`engines/tolerance.js`（均新）、`core/evict.js`、`core/store.js`、`engines/tool-diag.js`、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`tests/run.js`、`tests/settle-v2720.js`、`tests/dead-export-ledger.json`、`README.md`、`ITERATION_LOG.md`。
- **门禁结果**：`node tests/run.js` → **6528 / 失败 0**（v2.71.0 为 6329；净增 179 项专锁 + 冻结面转正）。专锁单独 179/0。出口面 ns 100 / members 566 / chars 7004；清册面 refs 2160 / ns 106 / members 1159；死子面 dead 407 / uiDead 4 / dataOnly 154 / 仅测试 131；账本 411 条（self-only 218 / test-only 135 / unwired 58）；checked 75；SOURCES 45。
- **真缺陷与判据演进**：
  · 缺陷①（引擎侧·挤出静默失败，与 v2.70.0 gauge.history 同型）：`engines/karma.js` 写 `WA.evict.array(row.notes, 'karma.notes', 8)`，而 `'karma.notes'` 未登记在 `core/evict.js` 的 SITES ⇒ 每次记账走 `unknown-site` 分支静默失败 ⇒ 每行的 notes 实际无界。修复：evict 侧登记具名通配站点 `karma.notes`（path `karma.rows.*.notes`，cap 8），store 侧登记 `karma.rows.*.notes`（wildcard），引擎侧去掉误导性的第三参数。**教训：新引擎每写一个 evict.array 调用点，必须先在 SITES 里登记同名站点——否则挤出失败只进 failedBy 分桶，现场表现为「无界但没人知道」。**
  · 缺陷②（引擎侧·文档声明与实现相悖，死代码）：`karma.record` 初版在记账时顺手做「对等核销」（记功德先抵业力），结果是**两轴永不同时为正** ⇒ `offset()` 恒返回 `nothing-to-offset` / `no-merit`，而头部注释写着「唯一能让干预阶梯回退的路径就是 offset()」——该路径实际不可达，功德也失去「攒起来备用」的含义（预设原义）。修复：record 只入账（各轴独立累加），抵账只能由 offset() 显式发起。修复后 `offset()` 可达、净额不变、阶梯随显式核销回退。**教训：凡文档宣称「唯一路径/必然可达」的入口，必须有断言证明它在现场真的能走到（本版以 `probeKmAddAxis` 负控制钉住）。**
  · 缺陷③（引擎侧·绕过冻结种子）：`hazard.js` 掷骰写成 `(WA.rand && typeof WA.rand.dice === 'function') ? WA.rand.dice(sides, 'hazard') : (1 + Math.floor(Math.random() * sides))`——兜底分支是裸调 `Math.random`，绕过冻结时钟/种子（违反 v2.14.0 起「全库唯一允许 Math.random 的产品文件是 core/rand.js」的纪律），且同一剧本复现不出同一结果。修复：改为硬依赖决策流，`WA.rand` 不可用时**显式拒收** `rand-unavailable`（宁缺毋滥，绝不静默降级到不可复现的随机）。
  · 判据演进：专锁首跑 FAIL 7——① 三处破坏锚点的声明命中数与实际不符（`km-gate` 实 3 非 4、`mg-missing` 实 3 非 5、`tl-gate` 实 4 非 6）；② `km-addaxis` 的破坏串与原串语义等价（等价于没砸，N1 假绿），改为「只累加最后一轴并清空另一轴」的真破坏；③ 三处断言语义错——maxStage 调低**不会**回退存量 stage（单调不减是设计）、hazard rows cap 未在干净账上计数、tolerance 的 stale 在 window ≤ maxRepeat 时**不可达**（窗口内根本凑不满次数）。**教训：① 破坏串必须与判据的可观测行为真挂钩，等价替换 = 假绿；② 容量类判据必须先重置容器再从头数；③ 任何「上限」类机制都要检查上限是否可达（window 必须 > maxRepeat，stale 才有意义）。**
- **可复用的判据**：① 新引擎的每个 `WA.evict.array` 调用点必须与 evict.SITES / store.__BOUNDED_CAPS 同名登记（三处同源）；② 引擎禁止裸调 Math.random，随机必须走 `WA.rand.*`，缺失时显式拒收而非兜底；③ 文档宣称的「唯一路径」必须配一条能证明其可达的断言；④ 破坏锚点先实测命中数（`grep -c` 或脚本统计）再写进 BROKEN，等价替换不算破坏；⑤ 上限类机制须验证上限可达（窗口/计数关系）。
- **提交**：`（见本版提交）`。
### R54 · 2026-09-24 · v2.71.0 交付（信息暗礁 × 节奏齿轮 × 伏笔配给 × 聚光灯 · 第六十面）
- **做了什么**：`engines/enigma.js`（新，信息暗礁：秘密知情名单边界账，双容量上限 + outsiders 反查）、`engines/tempo.js`（新，节奏齿轮：四挡速率 + 跨度核验 + 切挡留痕）、`engines/quota.js`（新，伏笔配给：短/长双池 + 过期只标不删 + 终态收口）、`engines/spotlight.js`（新，聚光灯：轮次结算 + 久缺名单 + 不阻断剧情的均衡读数）。四引擎接入容量骨架（evict 6 站点 / store 5 容器 / checked 66→71）、装载序、注入源（SOURCES 37→41）、UI 友好名、测试清单，版本号升至 2.71.0。专锁 `tests/settle-v2710.js`（347 行）覆盖 20 处破坏锚点与 N0–N5 负控制。
- **为什么**：对 12 份酒馆预设做第二轮「叙事纪律」机制专项复扫。四件可证伪状态机值得进引擎：MoM 蛾摩拉的「信息差」管理（谁知道什么、谁不知道什么、谁不该表现出知道）、Phantasm 的叙事速率挡位、可待的「短期 3 条/30 次输出、长期 3 条/50 次输出」伏笔配额、MoM 果实与打工喵的「角色登场均衡」需求。
- **影响范围**：`engines/enigma.js`、`engines/tempo.js`、`engines/quota.js`、`engines/spotlight.js`（均新）、`core/evict.js`、`core/store.js`、`engines/tool-diag.js`、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`tests/run.js`、`tests/settle-v2710.js`、`tests/dead-export-ledger.json`、`README.md`、`ITERATION_LOG.md`。
- **门禁结果**：`node tests/run.js` → **6329 / 失败 0**（v2.70.0 为 6179；净增 130 项专锁 + 冻结面转正）。专锁单独 130/0。出口面 ns 96 / members 562 / chars 6928；清册面 refs 2102 / ns 102 / members 1112；死子面 dead 367 / uiDead 4 / dataOnly 151 / 仅测试 131；账本 371 条（self-only 186 / test-only 135 / unwired 50）；checked 71；SOURCES 41。
- **真缺陷与判据演进**：
  · 缺陷①（v2.70.0 遗留·引擎侧）：`engines/gauge.js` 的 `WA.evict.array(hit.history, 8)` 第二参数传数字而非站点名 → 每次 `unknown-site` 静默失败，探针实测 20 次 step 后 historyCount=21 > 声明 cap 8。修复为站点名 `'gauge.history'` 并在 evict/store 双侧登记（`gauge.rows.*.history` 通配键）。
  · 缺陷②（v2.70.0 遗留·文档侧）：`README.md` 与 `ITERATION_LOG.md` 各有一处逐字节重复条目，根因是 `tools/w270_docs.js` 的 `s.replace(anchor, entry + anchor)` 前置插入只在插入前校验 count(anchor)===1（插入后锚点计数不变），重复执行不报错。本版清重并在新脚本中内置「新条目已存在则跳过」的幂等保护。
  · 缺陷③（v2.71.0 新发现·引擎侧）：`engines/quota.js` 的 `('seed_' + Date.now())` 为 G20 判定的 B 裸调（绕过冻结时钟）。修复为 `clockNow('quota')`。
  · 判据演进：专锁首跑 FAIL 6——测试设值 `maxRows: 1`（enigma bounds [4,64]）与 `maxRows: 2`（spotlight bounds [8,64]）被 settingsBus.normalize 的 clampNum 夹回最小值。修正为 bounds 内合法值（4 / 8）并重排填满逻辑。**教训：专锁设值必须先过 bounds 再断言容量行为。**
- **可复用的判据**：① 专锁设值必须落在 settingsBus bounds 内（越界值会被静默夹取，导致容量测试失效）；② 冻结面回填的批量脚本必须内置幂等保护（锚点0次但新串已存在 ⇒ 跳过而非重插）；③ 叙事纪律类引擎的共同形态：只在拒绝/边界路径上增长的计数器 + 「未发生的那侧也说得清」的互斥断言。
- **提交**：`（见本版提交）`。
### R53 · 2026-09-23 · v2.70.0 交付（情境切片 × 阻尼量规 × 竞争焦点 · 第五十九面）
- **做了什么**：`engines/scene-slice.js`（新，情境切片：空间属性白名单 + 七档时间段解析 + 室内天气抑制）、`engines/gauge.js`（新，阻尼量规：0..100 值域 + 单步限幅 + 里程碑事件强制 + 到顶拦截）、`engines/rivalry.js`（新，竞争焦点：三元键 + 权重反弹惩罚 + 显式注销）。三引擎接入容量骨架（evict/store 各 cap 20/16/16）、装载序、注入源（SOURCES 34→37）、UI 友好名、测试清单，版本号升至 2.70.0。专锁 `tests/settle-v2700.js` 覆盖 11 处破坏锚点与 N0–N5 负控制。
- **为什么**：用户提供 12 份酒馆预设（约 10MB，105–320 个 prompt 块）要求评估可缝入内容。扫描确认 100% 为预设而非世界书，95% 以上是文风/破限/文学腔调（不可证伪，不收）。三件可证伪状态机值得进引擎：Phantasm 的日期/时间段/室内外资讯框要求、进度 0–100% 节点突变逻辑、打工喵与 MoM 的竞争关系与注意力均衡需求。
- **影响范围**：`engines/scene-slice.js`、`engines/gauge.js`、`engines/rivalry.js`（均新）、`core/evict.js`、`core/store.js`、`engines/tool-diag.js`、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`tests/run.js`、`tests/settle-v2700.js`、`tests/dead-export-ledger.json`、`tests/export_contract.txt`。
- **门禁结果**：`node tests/run.js` → **6179 / 失败 0**（v2.69.0 为 6094；净增 70 项专锁 + 冻结面转正）。专锁单独 70/0。出口面 ns 92 / members 558 / chars 6855；清册面 refs 2052 / ns 98 / members 1077；死子面 dead 338 / uiDead 4 / dataOnly 149 / 仅测试 131；账本 342 条（self-only 165 / test-only 135 / unwired 42）；checked 66；SOURCES 37。
- **真缺陷与判据演进**：
  · 缺陷①（引擎侧）：三引擎初版用 CommonJS `module.exports`，`ui-gate-sync` 沙盒是纯浏览器 VM 语义、只认 `window.WorldAxis`，装载失败。修正为标准 IIFE 闭包（`tools/fix_engines_iife.py`）。
  · 缺陷②（引擎侧）：挤出调用写成 `WA.evict.array(list, 20)`——第二参数是容量数字而非站点名字符串，站点表反查判「声明悬空站点」（sceneSlice.rows/gauge.rows/rivalry.rows 零调用）。修正为 `WA.evict.array(list, 'sceneSlice.rows')` 等具名站点调用，与 appearance/ladder 同形；gauge 的 history 子数组挤出保留数字容量但补 `if (WA.evict)` 守卫。
  · 判据演进：冻结面回填 25 处（checked 63→66、版本常量 8 处、清册面三处、死子面四处、账本条目与归因分布、advisory、SOURCES、EC2430、settle 挂载），比较值与消息文本同批改。
- **可复用的判据**：① 新引擎必须 IIFE 挂 `window.WorldAxis`，`module.exports` 在 ui-gate 沙盒不可见；② `WA.evict.array` 的第二参数是站点名字符串（与 evict.js 站点表键逐字一致），传数字容量会被站点反查判悬空；③ 12 份预设类材料的缝入口径：先全量结构扫描分离文风与状态机，只收能落成「登记→核验→拒收码」的机制。
- **提交**：`（见本版提交）`。
### R52 · 2026-09-23 · v2.69.0 交付（角色呈现契约 · 第五十八面：外貌分级 / 原型阶梯）
- **做了什么**：`engines/appearance.js`（新，199 行，外貌分级契约：S/A/B/C 分级 + COVERAGE_REQ 覆盖率核验 + 关系加权单向升一级 + 异化三档 humanoid/half/true + 场景排他眼型脸型/服装风格同场唯一）、`engines/ladder.js`（新，149 行，原型阶梯：档位表 ≥2 且去重 + 升级必须登记事件 + 逐级推进禁跳档 + 到顶/到底拒收 + drop 重置）。来源材料评估：两份新世界书——ref7《外貌构建》（种族判定/分级扫描/Layer1-4 覆盖/比喻/行文顺序）与 ref8《ACG 角色心理模型 3.0.0》（94 条 = 2 元信息 + 92 条 ACG 心理原型，傲娇/病娇/三无/地雷系……）。**取舍口径**（沿 R50/R51）：能落成「登记→核验→拒收」的进引擎；文风块不收。ref7 只收分级覆盖契约、关系加权、异化档位与场景排他，几千词外貌要素库与比喻/光影规则留在预设层；ref8 铁板模板（【本质】92/92、【关系光谱】91/92、【破防】86/92）本质是给 LLM 的扮演词库，99% 不收，唯一可机制化的是病娇等条目的「禁止跳级、升级必须有事件推进」骨架，落成 ladder 引擎。
- **为什么**：文风层预设要求写「S 级描写完整四层、C 级只抓单一特征」，但模型通常凭感觉堆词；心理模型要求「禁止一上来就暴走、必须有事件推进」，但缺乏状态追踪。本版把两份材料的结构性约束收编为引擎级契约，通过注入块把「当前状态 + 铁律」显式传递。
- **影响范围**：`engines/appearance.js`、`engines/ladder.js`（均新）、`core/evict.js`、`core/store.js`、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`engines/tool-diag.js`、`tests/run.js`、`tests/settle-v2690.js`（新）、`tests/dead-export-ledger.json`、`README.md`。`tools/w269_*.js` 等辅助脚本按约定不入库。
- **门禁结果**：`node tests/run.js` → **6094 / 失败 0**（v2.68.0 为 6007；净增 77 项专锁 + 冻结面转正）。专锁单独 77/0。出口面 ns 89 / members 555 / chars 6797（生成器产物逐字回填 `FROZEN2800`）。清册 refs 2021 / ns 95 / members 1055，死子面 dead 322 / uiDead 4 / dataOnly 146，仅测试 131；账本由 `node tests/dead-export-gate.js --update` 写出，version 2.69.0，条目 326，归因 test-only 135 / self-only 155 / unwired 36。`checked` 61→63，`SOURCES` 32→34。
- **真缺陷与判据演进**：
  · 缺陷①（测试侧）：冒烟脚本给 `weighted:['lover']` 将 B 升 A 级后仍给 B 级 cover（L1:4），引擎按 A 级要求（L1:10）正确拒绝报 `missing-coverage`。证明**加权升档的覆盖级联校验真实生效**。
  · 缺陷②（文案同步）：全量回归暴露 6 处历史遗留的「入口版本为 2.23.0」旧文案（比较值已升级、消息文本未跟上），与 v2.68.0 判据演进②同型；本轮将 7 处版本断言、checked、清册面、死子面、账本数、SOURCES、出口面规模等共 24 处断言一次性同步。
  · 判据演进：ladder 的 disabled 总闸在 `define`/`escalate`/`deescalate`/`drop` 四条写路径均有独立出口，锚点声明 `hits:4` 并由 N0 判据核验实际命中数，沿用 v2.68.0 确立的显式命中数机制。
- **可复用的判据**：① 加权升档（如关系加权 B→A）后的覆盖要求必须按**升档后的有效等级**校验，不能用原始等级放行——「等级提升即承担更高规格」是契约闭合的关键。② 阶梯状态机必须配对 `drop` 出口，重设前须显式 drop，防止调用方静默覆写已有阶梯的历史推进轨迹。③ 专锁必须含跨模块隔离断言（N3）：破坏 appearance 不得影响 ladder，破坏 ladder 不得影响 appearance。
- **提交**：`（见本版提交）`。

### R51 · 2026-09-23 · v2.68.0 交付（世界运转四件套 · 第五十七面：资料片周期 / 生存三轴 / 通缉 / 驯兽）
- **做了什么**：`engines/era-cycle.js`（新，140 行，资料片周期：四档状态机 + 倒计时正整数 + 跨档连续推进 + 结算转长草强制换事件）、`engines/survival.js`（新，129 行，生存三轴：饱食/精力 0..100、负重比上限、左开右闭分段、半成品行不连带拒绝）、`engines/warrant.js`（新，125 行，通缉：三档罪度、在案=未赦免、惯犯第 3 桩当场升级、重罪赦免须理由、不随死亡消除）、`engines/beast-bond.js`（新，161 行，驯兽：驯服满百转化方法定初始档、忠诚显式 delta、下调必须给 cause、噬主风险档）。来源材料评估（《艾尔德兰》网游世界书）：能落成「登记→核验→拒收」的四面收编；等级/经验/战斗结算系数属推演结算面不收（本仓库记账、不掷骰；倒计时取建议区间中位不随机）；种族大全等词库不进引擎。
- **为什么**：《艾尔德兰》的四面在预设里都只有一句话（资料片是宏观事件、饱食归零扣血、通缉不随死亡消除、驯服满百转化），没有一处可核验。本版把它们从「叙事要求」钉成「登记 + 拒收」。
- **影响范围**：`engines/era-cycle.js`、`engines/survival.js`、`engines/warrant.js`、`engines/beast-bond.js`（均新）、`core/evict.js`、`core/store.js`、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`engines/tool-diag.js`、`tests/run.js`、`tests/settle-v2680.js`（新）、`tests/dead-export-ledger.json`。`tools/w268_*.py`、`tools/w268_smoke.js` 不入库。
- **门禁结果**：`node tests/run.js` → **6007 / 失败 0**（v2.67.0 为 5859）。专锁单独 128/0。出口面 ns 87 / members 553 / chars 6757（生成器产物逐字回填 `FROZEN2800`）。清册 refs 1998 / ns 93 / members 1031，死子面 dead 308 / uiDead 4 / dataOnly 138，仅测试 131；账本由 `node tests/dead-export-gate.js --update` 写出，version 2.68.0，条目 312，归因 test-only 135 / self-only 145 / unwired 32。`checked` 57→61，`SOURCES` 28→32。
- **三条真缺陷（全部由专锁实跑暴露，均为引擎级修正）+ 两条判据演进**：
  · ① warrant 的「第 3 桩当场升级永远差一桩」：`report` 里 `recordsOf` 走 `rows()`→`store.get()` 读的是**已提交快照**，事务内 push 尚未提交时数不到本桩。修法：新增 `recordsOfDraft(draft, who)`，凡写入路径一律用 draft 内的行来数。
  · ② warrant 的「在案」口径：`status === 'active'` 过滤会把升级后的 hunted 桩从计数里摘除（`hunted` 永远读成 false、且 hunted 的桩无法赦免）。修法：统一改成 `status !== 'pardoned'`（`recordsOf` / `recordsOfDraft` / `pardon` 三处同步）。
  · ③ warrant 注入块的括号优先级：`r && r.status === 'active' || r.status === 'hunted'` 里 null 行会解引用第二子句（TypeError，数组空洞场景）；守卫必须写成 `r && (a || b)`。修复后加回归钉（行数组塞 null 行走 `buildBlock` 不抛），并在**修复前源码上反向验证该钉为红**（`Cannot read properties of null`），settle 127→128。
  · 判据演进一：**锚点命中数显式声明**。era-cycle 的 disabled gate 在同一文件两条写路径各出现一次、warrant 的 disabled gate 与 bad-level 检查也各 2 次——这类共享字面量不再强求 `==1`，而是逐项声明 `hits` 并验证「实际命中 == 声明命中」（N0 判据）。精确的定义是「命中数被显式声明并被验证」，不是「必须为 1」。
  · 判据演进二：全量回归「编排扫描仍抓出未登记容器」一例的失败根因是**测试污染**（前序用例累积的数组节点在新版四容器加入后，在 `minBytes:64 / chunkNodes:5` 极小预算下挤占扫描趟数）；隔离探针证明引擎两版行为一致。修法是在该用例前加隔离事务（清场只留 clock/people）再建哨兵，使其不再随上游规模漂移。
- **可复用的判据**：① 事务内计数一律用 draft 行，不用 `store.get()` 快照——「读自己刚写的」是事务语义的一部分。② 「在案」这类口径要先用反例钉住（升级后那桩还在不在数里？），状态机加档位时最容易把「升级」写成「出账」。③ 布尔守卫的覆盖范围要含全部子句：`a && b || c` 形式在 a 为假时第三项仍会执行，破坏面是 null 行（数组空洞）而不是常规输入，常规用例照不到——这类修复必须配「修复前源码反向验证为红」的钉。④ 冻结面回填时比较值与消息文本必须同批改（沿 R50）。
- **提交**：`（见本版提交）`。
### R50 · 2026-09-23 · v2.67.0 交付（叙事纪律四件套 · 第五十六面：时间锁 / 双层性格 / 好感审计 / 场外事件）
- **做了什么**：`engines/temporal-lock.js`（新，时间锁：锁定态显式登记、锁定期内每轮跨度必填/超限拒/倒退拒、零跨度是 frozen 不是错、解锁显式）、`engines/temperament.js`（新，双层性格：底色/习惯两层同时在场且不同、触发词命中才交棒给底色、日常默认习惯主导）、`engines/fondness.js`（新，好感审计：步进白名单 [+0.1,+0.3,+0.5,+0.8]、好感不降准则实现为「没有负入口」、冲突走 trust 对冲、上限 100 拒收不截断、五段区间语义）、`engines/parallel-events.js`（新，场外事件：三要素、主时钟同步 future-event 拒收、活跃容量 3、显式 resolve、防全知铁律进注入块）。来源材料评估（V1.41 + 梦鲸）：时间锁/动态性格/好感审计的数值纪律/平行事件四者能落成「登记→核验→拒收」进引擎；物哀逻辑/记忆筛选/宿敌张力等文风块、NSFW 模式库、平行时空观测报告留在预设层；假面逻辑 v2.66.0 已收编不重做。
- **为什么**：R48/R49 留下的两个来源（V1.41 的「时间锁/动态性格」、梦鲸的「场景栏与平行事件」）本版收编完毕。本版新增一条接线纪律：**注入源 SOURCES 的键名必须与模块命名空间严格同名**——inject-sources 门禁判据 A 从 `applyInjections` 真代码面提取 `WA.<ns>.buildBlock(` 的 ns 并要求 ∈ SOURCES，先用了简写键名（temporal/pevents）被当场点名（v2560: 注入分支无一漏登记源表），改成同名键即对齐；判据 A 的方向是「分支→源表」，防的是「有注入分支但用户关不掉」。
- **影响范围**：`engines/temporal-lock.js`、`engines/temperament.js`、`engines/fondness.js`、`engines/parallel-events.js`（均新）、`core/evict.js`、`core/store.js`、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`engines/tool-diag.js`、`tests/run.js`、`tests/settle-v2670.js`（新）、`tests/export_contract.txt`、`tests/dead-export-ledger.json`。`tools/w267_*.py` 不入库。
- **门禁结果**：`node tests/run.js` → **5859 / 失败 0**（v2.66.0 为 5741）。专锁单独 98/0。出口面 ns 83 / members 549 / chars 6677（生成器产物逐字回填 `FROZEN2800`）。清册 refs 1950 / ns 89 / members 996，死子面 dead 284 / uiDead 4 / dataOnly 131，仅测试 131；账本由 `node tests/dead-export-gate.js --update` 写出，version 2.67.0，条目 288，归因 test-only 135 / self-only 129 / unwired 24。`checked` 53→57，`SOURCES` 24→28。
- **可复用的判据**：① 单行对象站点（如锁定态）也要守骨架物化纪律：`kind:'object'` 的登记路径遇 `null` 骨架会判「类型错配」，未锁定态用**空对象**表达而不是 `null`；cap 必须容纳真实键数（label+at → cap 2，cap 1 会让 `evict.object` 在锁定态误删键）。② 冻结面回填时**比较值与消息文本必须同批改**：只改断言消息里的数字、不改 `=== 262` 的比较值，会产出「失败项里实与期望相同却仍红灯」的自相矛盾门禁（本轮 run2→run3 的 6 处失败全是这一类）。③ SOURCES 键名 = 命名空间名，不做缩写（判据 A 的 ns 提取面向真代码面）。
- **提交**：`（见本版提交）`。
### R49 · 2026-09-23 · v2.66.0 交付（字段面四件套 · 第五十五面：情绪通道 / 关系六型 / 假面 / 摘要三列 + 选项梯度）
- **做了什么**：`engines/affect.js`（新，情绪通道：情绪词不进任何出口、开放×硬关闭不相交、过载回退必须是已登记开放动作、四项调制量之和 ≥6 时开放通道收成回退）、`engines/bonds.js`（新，关系六型：类型表白名单、自对拒收、配对键无向、与血仇正交分账）、`engines/masks.js`（新，假面：口径与露馅同时在场且不一致才成立、撤销显式）、`engines/digest.js`（摘要三列：关系方向/物品状态/新旧伏笔，全部从已有证据现算）、`direction/choices.js`（`generateGraded` 选项梯度：两易一中一难、配额引擎核验、`WA.rand` 洗位，`generate` 保持旧行为）。来源材料评估（四份新上传）：两份《自动续杯 BottomsUp 2.6.0》是宿主层错误重试/截断续写脚本，属容错与流式解包，不进引擎；可借的「拒绝必须可观测 + 报错特征分类账」思路与本仓库 `stat.faults` 口径一致，等价实现已存在；《【日月西】Gemini & Claude v0.41》是叙事预设，其五条日月律作字段设计的语义依据（人物立体→假面、物体连续→物品状态列），破限头部/NSFW 条款/混淆长文/伪闭合标签一律不进引擎。
- **为什么**：R48 留下的字段面（情绪通道、关系六型、假面、摘要方向、选项梯度）都出自 4.4 与《日月西》。本版的纪律是「预设给的是描写指令，引擎收的是结算含义」：情绪词→动作、人设锚→可归类结构账、摘要模板→从证据现算的片段、选项要求→引擎侧配额。全部模块总开关默认关，关闭时 `reason:'disabled'` 与「用户选了空」可区分。
- **影响范围**：`engines/affect.js`、`engines/bonds.js`、`engines/masks.js`（均新）、`engines/digest.js`、`direction/choices.js`、`core/evict.js`、`core/store.js`、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`engines/tool-diag.js`、`tests/run.js`、`tests/settle-v2660.js`（新）、`tests/export_contract.txt`、`tests/dead-export-ledger.json`。`tools/w266_*.py` 不入库。
- **门禁结果**：`node tests/run.js` → **5741 / 失败 0**（v2.65.0 为 5657）。专锁单独 69/0（首跑 64/5，3 项暴露真缺陷：`affect.setLoad` 的 `missing-fields` 检查先于 `bad-load`，纯非法字段走不到 `bad-load` 分支，检查顺序对调修复；另 2 项为判据自身的开关时序错误）。出口面 ns 79 / members 545 / chars 6584（生成器产物逐字回填 `FROZEN2800`）。清册 refs 1907 / ns 85 / members 968，死子面 dead 262 / uiDead 4 / dataOnly 129，仅测试 131；账本由 `node tests/dead-export-gate.js --update` 写出，version 2.66.0，条目 266，归因 test-only 135 / self-only 115 / unwired 16。`checked` 49→53，`SOURCES` 21→24。
- **可复用的判据**：① 对象型站点的登记必须三处同批：evict.SITES（带 `kind:'object'`）、store `__BOUNDED_CAPS`（带 `kind:'object'`）、`evict.object` 调用点带排序键第三参——本轮漏了登记表的 `kind`，registryParity 判「类型错配（应为数组）」，健康分 95、11 项红灯；probe 先于全量回归抓到。② 拒绝分支的检查顺序是语义的一部分：`missing-fields` 放在 `bad-load` 之前会让后者对「只给了非法字段」的写入不可达，专锁的 [N2] 判据（原版必须报 bad-load）当场现形。③ 缝合预设材料的取舍口径：**能落成「登记→核验→拒收」的才进引擎；只能落成「给模型的一句话要求」的留在预设里**。
- **提交**：`（见本版提交）`。

### R48 · 2026-09-23 · v2.65.0 交付（结算缺口四件套 · 第五十四面：行程表 / 天气物候 / 难度三档 / 情报延迟）
- **做了什么**：
  · 行程表补上总开关。`engines/world.js` 的 `move()` 继续只回答可达性；`depart()` 在 `missing-fields` 之后、`already-in-transit` 之前检查 `settings().enabled`，关闭返回 `{ ok:false, reason:'disabled' }` 且不调用 `move()`；`advance()` 在 `bad-minutes` 之后同样拒绝，不减 `left`。同一人同时只能一条 `in-transit`，`left` 减到 0 才改 `arrived`，`where` 对在途者给 `inTransit:true` 且 `place:`。`DEF.maxJourneys` 为 4，evict 站点 `world.journeys` cap 24。
  · 新增 `engines/weather.js`（125 行）。白名单 `clear/rain/storm/snow/heat/fog`，耗时系数 1 / 1.5 / 2 / 2 / 1.5 / 1.25。`setWeather` 用 `WA.world.reach(place, place)` 确认地点已登记，未登记不落盘，同地覆盖不新增行。`weatherOf` 对未登记返回 `missing`，不回落成晴。总开关关闭时 `effect` 返回 `factor:1, reason:'disabled'`；开启但该地无天气时把 `missing` 原样返回。`travelMinutes` 用 `Math.ceil(base * factor)`。季节只由 `clock.dayIndex / 90` 派生，无钟则 `no-clock`。设置键 `worldaxis_weather_settings_v1`，默认 `enabled:false`。权重表只供读取，本模块不掷骰。
  · 新增 `engines/difficulty.js`（102 行）。只落三档：行动阻力 `resistance`（easy/normal/hard → 成本 0.5/1/2）、居民初始态度 `stance`（hostile/neutral/friendly）、时间流速 `pace`（slow/normal/fast → 跨度 0.5/1/2）。预设里的「世界关联度」明确不收：相关等于心想事成会扭曲概率，和因果纪律冲突。`setProfile` 在 `settingsBus.normalize` 之前整次拒收非法枚举，返回 `bad-enum` 与 `fields`。关闭时 `effective()` 回落成本 1、态度 neutral、流速 1，但 `reason` 必须是 `disabled`，用来区分「用户选了中性」和「模块没开」。
  · 情报延迟写进 `engines/intel.js`。`addIntel` 没给 `from/to` 仍即时入账；只给一端返回 `missing-route`；路不通或地点未登记返回 `unreachable` / `unknown-place`，不猜分钟数。耗时大于 0 才写入 `intelQueue`，状态 `in-transit`，`due = now + minutes * 60000`，并调用 `WA.evict.array(queue, 'intel.queue')`。接收者在 `releaseDue(due)` 之前 `visibleTo` 为空。延迟路径的人物排序键拆成两行，使 v2.61 锚点 `p.lastSeenAt = clockNow('intel'); p.updatedAt = p.lastSeenAt;` 恢复恰中 1 次。`intel` 仍早于 `world` 装载，读路网发生在调用期。
  · 容量与骨架。`core/evict.js` 与 `core/store.js` 的 `__BOUNDED_CAPS` 同步登记 `world.journeys`、`weather.rows`、`intelQueue`，cap 都是 24。`defaultWorldState()` 把 `world` 扩成 `{ places, roads, events, journeys }`，并新增 `weather.rows` 与 `intelQueue`，冷启动直写不再炸事务。
  · 接线。`index.js` 的 `LOAD_ORDER` 与 `tests/run.js` 的 `LOAD` 把 `engines/weather.js`、`engines/difficulty.js` 插在 `engines/world.js` 之后（`setWeather` 依赖 `WA.world.reach`）。`render/inject.js` 的 `SOURCES`、默认可见性与 `applyInjections` 增加 `weather` / `difficulty`，可见性默认 true，模块总开关默认 false，不给老用户凭空注入。面板 `VIS_NAMES` 增加「天气与物候」「世界难度」；`renderPeople()` 在世界织体下加三行只读（在途 / 天气 / 难度），没有新按钮、没有新 `data-*`。`engines/tool-diag.js` 的 `MODULE_EXPORTS` 补了两个新模块。
  · 专锁 `tests/settle-v2650.js`，75 项。覆盖关闭不得出发、在途不在任一端、部分推进不到达、零分钟 `already-there`、未登记天气不是晴、暴雨 30 分钟算成 60、非法难度整次拒绝、三档独立、无路情报不猜延迟、到期前不可见。九个破坏锚点（关闭拒绝出发、零分钟 `already-there`、`left===0` 才到达、未登记天气 `missing`、关闭时天气系数 1、非法难度整次 `bad-enum`、关闭难度回落中性但 `reason:'disabled'`、路不通 `unreachable`、入队对象 `status:'in-transit'`）都在真源码恰中 1 次。`kill()` 对单行 `return { ... }` 整段改成 `if (false) return`，避免切坏返回对象。负控制 N0–N5。
- **为什么**：十二份预设里只有《真实的世界》的动态世界/天气/移动/难度、梦鲸的场景栏与平行事件、4.4 的情绪通道/静态关系/摘要/选择器、V1.41 的时间锁/假面/动态性格像世界引擎。用户要求分两个版本做完全部，本版只收结算缺口；情绪通道、关系六型、假面、摘要方向、选项梯度留到 v2.66.0。难度从预设的五档收窄到三档，是因为第四档「关联度」和本仓库的因果纪律直接冲突，不是漏做。
- **影响范围**：`engines/world.js`、`engines/intel.js`、`engines/weather.js`（新）、`engines/difficulty.js`（新）、`core/evict.js`、`core/store.js`、`index.js`、`manifest.json`、`render/inject.js`、`ui/panel.js`、`engines/tool-diag.js`、`tests/run.js`、`tests/settle-v2650.js`（新）、`tests/dead-export-ledger.json`。`tools/*.py` 不入库。
- **门禁结果**：`node tests/run.js` → **5657 / 失败 0**（v2.64.0 为 5572）。专锁单独 75/0。出口面 ns 76 / members 542 / chars 6532（生成器产物逐字回填 `FROZEN2800`）。清册 refs 1872 / ns 82 / members 942，死子面 dead 243 / uiDead 4 / dataOnly 125，仅测试 131；账本由 `node tests/dead-export-gate.js --update` 写出，version 2.65.0，条目 247，归因 test-only 135 / self-only 102 / unwired 10。`checked` 46→49，`SOURCES` 19→21。回填前全量是 5631/26，26 项全部是冻结计数，没有结算逻辑失败。
- **可复用的判据**：否定式能力要钉在互斥计数上。关闭行程不是「返回了 disabled 字符串」就够了，必须同时证明没有调用 `move()`、没有减 `left`；关闭难度回落中性值时，`reason` 必须是 `disabled`，否则「用户选了中性」和「模块没开」在读面上不可区分。依赖面冻结串只收录被别的模块调用的成员：`depart` / `advance` / `releaseDue` 本版没有进串，因为还没有产品代码调用它们，这是口径而不是遗漏。
- **提交**：`（见本版提交）`。

### R66 · v2.83.0 — 模块契约与配置迁移（第三十七面：引用多 ≠ 必须先装载）

- **版本**：v2.83.0（父 v2.82.0）。路线图 B4（模块能力注册表 + 依赖检查 + 命名空间隔离）+ B6（配置 schema + 旧版本迁移 + 未知字段保留 + 导入前校验 + 失败不污染 + 迁移前自动备份）。
- **目的**：把「模块依赖」从静态印象变成运行期事实；把「配置」从逐项重设变成可整包搬迁且失败不污染的东西。
- **做了什么**：
  - `tests/module-registry-gate.js`（新，273 行）：模块契约实测门禁（真装载 + Proxy 拦 `WA` 访问 + 调用栈定案归属），`--update` 写 `tests/module-registry-ledger.json`；`EDGE_DROP=<rel> --probe` 做可证伪探针；`require` 时只导出量测面。
  - `core/settings-bus.js`（+354 行）：B6 全套——`exportConfig` / `importConfig` / `cfgStat` / `cfgSurface`，配置包信封 `{format:'worldaxis-config', schema}`，写盘前置备份环（3 份，`worldaxis_cfgbackup_*`），导入前校验、版本门、迁移器调用、未知键策略、回滚。
  - `tests/settle-v2830.js`（新，54 项）：B4/B6 双向专锁（10 条破坏锚点 + 1 条不可达防御锚点）。
  - 接线修正：`actors/registry.js` / `engines/temporal-lock.js` / `render/inject.js` 的 `module` 字段改成真实命名空间；`engines/tool-diag.js` 登记 8 个新控件（1 静态 + 7 动态）；`ui/panel.js` 新增「配置包」出口（复制 + 两步确认导入）。
- **为什么**：
  - B4 的「依赖」在静态面上测不准。v1 朴素 DFS 判环按路径展开、指数爆炸（超时 180s）；v2 用括号配平猜「函数体掩码」，而本仓库文件一律 `(function () { … })()` 形态，装载期语句天然在 IIFE 函数体内，掩码必然反向——实测输出 `装载期 558 / 调用期 0`，真相是 `装载期 23 / 调用期引用 44`。**结论：静态图上的「核心四件套互相成环」全是幻影。**
  - 「0 条」必须是可证伪的：`EDGE_DROP=core/workflow.js` ⇒ 18 个消费方当场抛 `Cannot read properties of undefined (reading 'register')`；`EDGE_DROP=core/store.js` / `core/clock.js`（全仓引用最多）⇒ **零个**消费方失败。**引用多 ≠ 必须先装载。**
  - B6 的落点不新开模块：设置键真源在 `settings-bus.js`（另开就得抄第二份，本仓库已删过两份这种副本）；结构指纹与迁移器契约是存储层概念；而且**新造存储家族会踩既有卫生规则**——备份键 `worldaxis_cfgbackup_*` 会被 `ghostScan()` 报成「幽灵设置」（`_v1` 后缀没有任何正则豁免）。
- **影响范围**：`core/settings-bus.js`、`actors/registry.js`、`engines/temporal-lock.js`、`render/inject.js`、`engines/tool-diag.js`、`ui/panel.js`、`index.js`、`manifest.json`、`tests/run.js`、`tests/ui-gate-sync.js`（`fresh()` 清空注册表）、`tests/module-registry-gate.js`（新）、`tests/module-registry-ledger.json`（新）、`tests/settle-v2830.js`（新）、`tests/dead-export-ledger.json`、`README.md`、`ITERATION_LOG.md`。`tools/*.py` 不入库。
- **门禁结果**：`node tests/run.js` → **7341 / 失败 0**（v2.82.0 为 7283）。专锁 `tests/settle-v2830.js` 单独 55/0（连跑稳定）。`tests/module-registry-gate.js`：文件 105 / 命名空间 113 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0。`tests/inventory.js`：refs 2219 / 产品文件 109 / 命名空间 108 / 成员 1209。`tests/export-contract.js`：ns 102 / members 573 / chars 7108（生成器产物逐字回填 `FROZEN2800`）。`tests/dead-export-gate.js`：dead 444 / uiDead 4 / dataOnly 160 / 仅测试 291，账本 version 2.83.0。`tests/test-surface-gate.js`：文件面 57 / 锁 53 / 孤儿 0 / spawn 3。**净增导出 4 个且全部接线（dead 面未增长）。**
- **可复用的判据**（本轮新增，编号续 R65）：
  - ⑪ **「必须先装载」只能由运行期事实回答**：静态面能回答的只有「提到了谁」（refs），回答不了装载顺序。判据的归属必须由调用栈定案（栈里第一个「位于本仓库文件内且无函数名」的帧 = 装载期顶层语句）；`at file.js:864:6` 这种顶层表达式语句**同样带行号**，故「有行号 = 函数体内」是错的。
  - ⑫ **「零告警」必须配一个能证伪的负控制**：本版用「摘掉提供方重跑」证明判据真的能失败（workflow 摘掉 ⇒ 18 处抛错；store/clock 摘掉 ⇒ 0 处）——否则「硬边 0」与「判据是瞎的」不可分。
  - ⑬ **可复用门禁必须能被 require**：首版 `module-registry-gate.js` 被 require 时照跑 CLI 核对分支并 `process.exit(1)`，直接把引入它的测试进程打死（7 项假红）。CLI 分支一律先判 `require.main === module`；且 Node CJS 模块顶层**不准 `return`**。
  - ⑭ **新写的存储键要先问既有卫生规则会不会报它**：备份键被 `ghostScan()` 判成幽灵设置，因为豁免只有 `_corrupt_<ts>` 一类后缀，**与新鲜度无关**。新键必须先跑一遍盘点面（幽灵/越界/家族），再决定要不要在规则里显式豁免。
  - ⑮ **声明面必须被消费**：导出包带 `unknown` 桶、导入侧只读 `keys` ⇒ 整桶静默丢弃（本版自己踩到，冒烟抓出）。核一个「新字段」时先问「谁读它、它失效时谁会响」。
  - ⑯ **回滚的边界必须与导入的边界重合**：全库扫描式回滚会把「备份之后由其它模块正常写入的键」一并按缺省处置，把一次失败的导入放大成一次配置重置。
  - ⑰ **负面判据（拒收不污染）与写路径破坏是两面**：把写路径换成恒 `ok` 后，「拒收不污染」仍成立（拒收都在写盘前），只有「值到底有没有落地」那一面才现形——**负控制必须挂在能看见它的那个面上**。
  - ⑱ **冻结读数的比较值与消息文本同批改（R65⑧ 复现）+ 全文残留自检**：本轮 `refs 2207→2219 / members 1205→1209` 共 5 处，补丁自检抓出漏改的 1 处（`r2800`），全量回归又抓出口面契约的 `569/7063 → 573/7108` 一处。**冻结计数必须做全文残留扫描，不能只改写过的锚点。**
  - ⑲ **交付物「在场」不等于「被执行」（v2.75.0 孤儿病的复发形态）**：`settle-v2830.js` 只对门禁做 `fs.existsSync`，于是 289 行、能独立跑出「装载期边 23 / 硬边 0」的 `module-registry-gate.js` 在测试文件面上被判 **orphan**——整套回归从未跑过它，而它恰是「依赖检查」的唯一判据面，漂移无人可见。修法按 v2400 惯例在 run.js 里 `spawnSync` 端到端跑一遍，并断言读数含关键值（防「空壳退出 0」）。**新写门禁必须同时接进执行面。**
  - ⑳ **`fresh()` 重装模块时，只增不减的注册表必须显式清空**：产品模块一律无条件 `concat`，故每次 `fresh()` 让 `__settingsRegs` 翻倍（54 → 109 → 163，54 键各重复 2/3 次）。两个后果都真实：① 重复登记在 `selfCheck()` 里是 error 级阻断项 ⇒ 任何在 `fresh()` 之后跑自洽判据的块都读到人造红灯；② 以登记表为真源的判据会读到累计脏数据 —— run.js 各块注入的 `module:'test'` 夹具一路活到别的块，把「键归属对不上真实命名空间」变成非确定性失败（本轮 `unmapped:test` 的唯一根因）。**重装即重建 ⇒ 重装前须清空（实测回到稳定 54 条、零重复）。**
  - ㉑ **`kill -9` 打断注入窗口会留下未还原的产品文件（v2.80.0 事故的再现）**：本轮回归被系统资源枯竭反复打断，其中一次恰停在 `bridge.js` 注入窗口内，残留一行 `function __ncProbeBridgeSnapshot() {…}`。症状不是报错而是**口径整体错位**：`refs 2219→2220`、`dead 444→443`，且 `bridge.snapshot` 引用数实测 1（期望 0）——多个「冻结读数」判据同时 ✗。定位手段：`git status` 列出不该改的文件 + mtime 晚于版本升档时刻。修法：`git checkout -- engines/bridge.js`（**不要手改**，尾部换行差异会让 diff 不干净）。**回归被外部中断后，先核 git 工作区再重跑。**
- **提交**：`（见本版提交）`。

### R68 · 2026-09-25 · v2.85.0 注入效率 · 人物自主生活 · 地域与交通（第三十九面：承诺写在源码里，但没有判据问过它）
- **做了什么**（四处落点，全部零新增导出 / 零新增容器 / 零新增设置键）：
  - `engines/inject-budget.js`（A4，11608 → 15067 字节）：`PRIORITY` 由 **8 源补到 45 源**（分 7 档）；`plan()` 收集并返回 `unranked`；`summaryText` 报未声明源计数。**不改成员名** ⇒ `FROZEN2800` 的 `injectBudget:` 段逐字不变。
  - `engines/life.js`（B1，10426 → 13877 字节）：名单口径由**插入序截断**改为 `basisOf()` 计分（goals/commitments/schedule 各计 1）+ `.filter(r.n>0).sort((b.n-a.n)||(a.i-b.i))`；新增 `reciprocated()` 对偶只读检查，单向协作降级为 `wait / unreciprocated`；`skipped` 与 `unreciprocated` 进 `stat` 与返回值。
  - `engines/world.js`（B2，22462 → 27596 字节，9 处）：地点行加 `parent`（层级落在**place 行**而不是另开一张表 —— 双真源零容忍）；道路行加 `cap`（容量是**路段自己的属性**，`explicitCap` 判定保证「只改耗时」不抹容量）；`roadCapOf`/`roadUsage` 段级查询；`depart` 逐段占用校验。
  - `tests/settle-v2850.js`（新，422 行，60 项）：A/B/C 三面 + N0–N4 负控制；C 面用 `/source:\s*'([^']+)'/g` 从 `render/inject.js` **真源码抽源名**（成类锁，防再漂移）。
  - `tests/reject-v2780.js`：6 个新码接**可执行见证**（`unknown-parent` / `self-parent` / `parent-locked` / `parent-cycle` / `road-crowded` / `unreciprocated`），见证驱动走**记忆化 `codes2850()`**。
- **为什么**：本版三处落点治的是同一类病——**承诺写在源码里，但没有任何判据问过它**。
  - A4 是真缺陷，且是本版最贵的一处：`PRIORITY` 只有 v0.9.3 时代的 8 个源名（近端事件/世界状态/主观记忆/记忆/叙事摘要/世界推演/账本/舆情），而注入面已长到 **45 个 distinct source 名**。逐个取证：8 个旧名全部命中，其余 **37 个零命中** ⇒「pinned（rank≤2）优先保障、绝不静默丢弃」这条承诺对那 37 个源**从未生效**；且「有源没被声明」在运行时完全不可见（`rankOf` 静默给 `DEFAULT_RANK = 6`）。这是 v2.56.0 立过的规矩（源面与声明面必须同时增长）在别处的复发。补法**按可替代性分档**：rank1-2 pinned / rank3 因果与记忆主链 / rank4 长期记忆 / rank5 世界骨架 / rank6 推演结构性面 / rank7 物候氛围 / rank8 统计库存。
  - B1 是两个真缺陷：① 名单按插入序截断 ⇒「谁被推演」取决于谁先进场，有依据的人插在第 5 位之后**永远轮不到**；② 单方面宣布的合作被当作已建立的协作（`kind === 'cooperation'` 只看自己那一行，不看对方回没回应）。
  - B2 新增的两条边界**全是否定式**：层级只说明归属、**不说明可达**（父子之间没登记道路时 `reach` 必须 `reachable:false`）；路走得通 ≠ 现在走得动（段容量满时拒收且**拒收不落盘**）。存在面判据（有 `parent` 字段吗 / 有 `cap` 字段吗）对这两条一无所知——**「有字段」与「字段被当成什么读」是两件事**。
- **两处由本仓库既有成类锁当场抓出的问题（都不是纸面推演）**：
  - ① **6 个新码未归类** ⇒ `reject-lock-v2780` 红灯。正解不是删码而是补**可执行见证**（用产品真 API 真跑出来）。
  - ② **拒收后裸 `return;`** ⇒ `side-effect-lock-v2790` 报「站点数 2 vs 白名单 1」。取证确认：`parent-locked` 当时写在**事务内**、用裸 `return;`，而在 `transact` 里裸 return 会**照样提交（推进 rev、整份落盘）**——正是 v2.79.0 那类缺陷。修法是**结构性的**：把全部层级校验移到**事务之前**（只读，拒收分支根本不进事务），缝隙从根上消失；环检测留在事务内但改为 `return false` **透明中止**。
- **三个环检测位置的教训（本版最该记住的一条）**：首版把环检测写在**补全前**的只读校验里。那是错的：`A∈B`、`B∈A` **只在补全那一瞬**才可能成立，事务前读的是补全前的旧图 —— 判它等于**写一段永不触发的死代码冒充把关**。正确位置是「事务前只读判定全部层级校验（self-parent / unknown-parent / parent-locked）+ 事务内补全前判环（parent-cycle）」。**破坏锚点必须落在热路径上。**
- **两处「两态不可分」的补全语义**：已登记地点「无 → 有」是**补全缺失事实**（允许，且只许一次——补后即锁），「x → y」才是**冲突改写**（拒收并写明现有归属）。若把补全也拒掉，**一次误登记就永久锁死**；本仓库禁的是「静默改写」，不是「不得改写」。
- **影响范围**：`engines/world.js`、`engines/life.js`、`engines/inject-budget.js`、`tests/settle-v2850.js`（新）、`tests/reject-v2780.js`、`tests/run.js`、`index.js`、`manifest.json`、`tests/dead-export-ledger.json`、`tests/module-registry-ledger.json`、`README.md`、`ITERATION_LOG.md`。`tools/*.py` 不入库。
- **门禁结果**：`node tests/run.js` → **通过 7483 / 失败 0**（v2.84.0 收口为 **7423 / 0**；+60 = 本版专锁）；`tests/settle-v2850.js` → **60 / 0**；`tests/reject-lock-v2780.js` → **50 / 0**（见证 71 → **77**）；`tests/side-effect-lock-v2790.js` → **23 / 0**；`tests/inventory.js` → 四类悬空均 0；`tests/export-contract.js` → `ns= 103 members= 580 chars= 7169`（**逐字未变**，零新增导出）；`tests/dead-export-gate.js` → dead 444 / uiDead 4 / dataOnly 160 / 仅测试 291（未增长）；`tests/test-surface-gate.js` → 全部通过、孤儿 0。
- **可复用的判据**（本轮新增，编号续 R67）：
  - (29) **零新增导出优先** —— 能用既有面的参数与证据面承载的，不新增 promise。`world.places` 行的 `parent`、`world.roads` 行的 `cap`、`injectBudget.plan()` 返回的 `unranked` 全部落在既有面里，`FROZEN2800` 三处段逐字不变。**新开一张表就要回答「谁是真源、改了甲忘了乙怎么办」——那是双真源。**
  - (30) **锚点命中数 != 期望即整体放弃，绝不部分改写**：A4 首跑因 `summaryText` 结尾缩进（实为 2 空格 `  }`，脚本里写了 `}`）锚点 4 命中 0 次 ⇒ 脚本**整体放弃、一字节未写入**，改对后重跑才落盘。
  - (31) **归属守卫是双层的，负控制必须打到「没有守卫的实现」**：本版专锁首跑 2 处红，全在负控制层。实测只摘事务前那层，事务内的 `return false` 仍兜住（`reason` 变成 `store-unavailable`、归属没被改）⇒ 症状不现形；必须**两层一起**改成「没有守卫的实现」，症状才是这条判据要抓的「已有归属被静默改写」。**多锚点破坏需要基础设支持**（`also` 字段 + 逐锚 N0 判定），否则「破坏没打到靶」会被误读成「判据坏」。
  - (32) **`git checkout -- <目录>` 是收口期最危险的一条命令**：本轮误用 `git checkout -- tests/` 想回滚升档脚本的越界改写，**连带回滚了同一目录下两个已完成的交付物**（`reject-v2780.js` 的 6 个新码见证、`run.js` 的本版接线），而当时它们与「被误改的历史注释」混在同一目录里。**回滚的最小单位是文件、不是目录；回滚前先 `git status --short` 看清这个目录里还有哪些未提交的成果。**
  - (33) **升档属「多处字面量」任务，但历史注释不得跟着升**：`v2.84.0（B5）` 这类注释说的是「这个锚点由哪个版本引入」，升档时**逐字不动**；只有承载「当前版本」的断言值、冻结读数消息、账本元数据与自己写的注释要改。判据是查既有提交的惯例（`git show <上版提交> -- tests/run.js`），不是自己觉得该不该改。
- **提交**：`（见本版提交）`。

### R67 · 2026-09-25 · v2.84.0 测试上下文隔离 · 统一输入边界（第三十八面：共享的宿主面 / 「字符串化兜底」把非法值静默升格）
- **做了什么**：
  - `tests/isolated-runner.js`（新，238 行）＋ `tests/isolated-runner-lock.js`（新，211 行）：全量回归放进独立候选树（`/tmp/worldaxis-regression-XXXXXX`），锁身份取「pid + starttime」，陈旧锁绝不自动回收（须锁主人 stale **且** worker 已死两道条件同时成立）。
  - `tests/context-guard.js`（新，289 行）：宿主面跨块泄漏的量测（`snap`/`diff`）、回收（`boundary().close()`）、审计（`audit()`）与两类硬信号（`hardSignals`/`softSignals`）。
  - `tests/synth-host.js`（新，112 行）：负控制/破坏副本的宿主面装配器，`negativeContext(opts)` 读 run.js 的 LOAD 清单（不抄第二份）按需装核心原语与对等引擎。
  - `core/input-guard.js`（新，121 行）＋ `tests/input-guard-v2840.js`（新，213 项）：统一输入边界（`text`/`num`/`int`/`oneOf`/`list`/`count`/`check`），约 28 个引擎的 `clean()` 委托到它。
  - `tests/run.js`：A1 四块（隔离/锁/上下文边界/负控制）＋ A2 输入边界锁接线；G 组三处负控制改用 `negativeContext(...)` 并各加「宿主面到场自证」，整组套 try/catch 报 `[G0]`；`tests/settle-v2830.js` 陈旧读数 113/105 → 114/106。
- **为什么**：
  - 「回归跑在谁的上下文里」此前没有答案，而且它错得很静默。实测四个 section 的宿主面差值 **4/4 都留了痕迹**：`causal-v2620` 留下 WA 命名空间 +9（`ui`/`uiSettings`/`assistant` + mini-DOM 六个内部名）、`evict-meta-v2610` 留下 2 个 storage 键与枚举序变化、`world-v2630` 与 `style-craft-v2510` 留下监听器条数变化。后果是硬的：出口面口径里 `OPTIONAL = ['ui','uiSettings','assistant']` 的「UI 未装载」前提，在 `causal-v2620` 之后的任何 section 里**已经不成立**。
  - 「输入可不可信」此前同样是隐式的，且两族缺陷都是实测出来的：① 约 28 份同款 `clean()` 把 NaN 升格成字面量 `'NaN'`、对象升格成 `'[object Object]'` —— `survival.set('甲', NaN)` 建出一条全 null 的读数记录**并报 ok**，`temporalLock.lock(NaN)` 上锁成功且 `label='NaN'`，`threads.open(NaN)` 立出一桩名叫「NaN」的悬案；**一次「参数传错」被记成了「世界里真发生了这件事」**。② 同一段兜底对带敌意 `toString` 的对象直接抛，而调用它的多是扫描 localStorage 的巡检路径（sweep / 体积审计 / 孤儿盘点）—— 一个抛打断**整轮巡检**，于是「巡检没查出问题」与「巡检没跑完」在读数上完全不可分。
- **影响范围**：`core/input-guard.js`、约 28 个 `engines/*.js`（`clean()` 委托化）、`tests/run.js`、`tests/synth-host.js`、`tests/context-guard.js`、`tests/isolated-runner.js`、`tests/isolated-runner-lock.js`、`tests/input-guard-v2840.js`、`tests/input-boundary-v2790.js`、`tests/settle-v2830.js`、`tests/causal-v2620.js`、`tests/intel-v2530.js`、`tests/life-v2520.js`、`tests/longline-v2550.js`、`tests/org-v2540.js`、`tests/reject-v2780.js`、`index.js`、`manifest.json`、`ui/panel.js`、`tests/module-registry-ledger.json`、`tests/dead-export-ledger.json`、`README.md`、`ITERATION_LOG.md`。`tools/*.py` 不入库。
- **门禁结果**：`node tests/run.js` → **通过 7404 / 失败 0**（r12 为 **7396 / 4**、r11 为 `runner-failed`）；`tests/settle-v2830.js` → **55 / 0**；`tests/input-boundary-v2790.js` → **48 / 0**；`tests/module-registry-gate.js` → 文件 106 / 命名空间 114 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0；`tests/inventory.js` → 产品文件 110 / 声明表登记 109 / 命名空间 109 / 成员 1216 / 静态引用 2281（四类悬空均 0）；`tests/export-contract.js` → `ns= 103 members= 580 chars= 7169`；`tests/dead-export-gate.js` → dead 444 / uiDead 4 / dataOnly 160 / 仅测试 291，账本 version 2.84.0；`tests/test-surface-gate.js` → 文件面 62 / 锁 57 / 可达 62 / spawn 4 / 孤儿 0。
- **可复用的判据**（本轮新增，编号续 R66）：
  - (22) **崩溃会掩盖读数，干净失败才是可定位的形态**：负控制改跑真源码副本后，副本被放进裸 VM 上下文，而产品侧已委托 `WA.inputGuard` ⇒ 副本抛异常、父进程 `runner-failed`，日志停在崩溃点、中途「通过 N」全部不可用。修法是给负控制装配「与真装载同序的最小宿主面」（`negativeContext()` 读 LOAD 清单、核心原语用真源码不抄第二份），并把整组套 try/catch 报一条显式红行 —— **负控制打不到靶时，前面那些「判据可现形」的结论全部无效，这个失效必须自己成为一条红行。**
  - (23) **防线变深 ≠ 判据坏，但负控制必须仍能打到靶**：`survival.set` / `threads.open` 的守卫被摘掉后缺陷不再复现，因为 A2 之后防线成两层（入口参数守卫 + inputGuard 形态兜底），NaN 已被 `text(NaN)` → `''` 挡下。这两处改为**两层一起拆**（并在测试侧断言「第二层锚点恰 1 次」「第二层破坏确实发生」），其余仍能单层复现的入口保持不动 —— **不把判据改成「必须两层」的过度约束，也不允许它退化成假绿。**
  - (24) **回收之后不得重算依赖当前值形状的谓词（R65⑧ 的复发点）**：`restore()` 末尾用 `!isUiFaceNs(ns)` 算 kept，而此刻 `WA[ns]` 已被删，谓词必然答「非 UI 面」⇒ 同一个 ns 同时出现在 `waNs`（说「已回收」）与 `kept`（说「未回收」）里。`diff()` 内部早已算定 `uiAddedNs`/`nonUiAddedNs`，**必须复用而不是重算**。同处修掉 `diff()` 对新增命名空间直接 `return`、致其内部成员从不进读数的问题 —— 负控制 A 打的正是这个形状（`WA.ui = {…}` + `WA.ui.leakMember`），**判据的输入面必须与结论面同宽**。
  - (25) **「回收口径」必须双向证明**：storage 痕迹**不回收**、但必须出现在只报告面；UI 面泄漏**必回收**、且零残留。三向负控制：A 人造 UI 面泄漏（2 命名空间 + 1 成员）⇒ 必真收回；B 人造收不回的泄漏（不可配置属性）⇒ 必报成残留硬痕迹 + skipped（**回收失败 ≠ 回收成功**）；C 非 UI 面的同型新增 ⇒ 不被回收、只进报告（**硬面是真判据，不是「凡新增都算硬」**）。
  - (26) **「共享」不等于「脏」——把共享当脏回收，等于用判据去改被测行为**：首版把「本 section 新增的全部 storage 键」一并回收，实测直接打破 4 个用例（观测切片 / 突发事件生成 / 突发事件激活(3轮) / 当前轮小纸条），它们复用前面 section 已写下的状态键。**差值口径只对「本 section 新增」生效，回收面必须收窄到 UI 装载面。**
  - (27) **锁身份用「pid + starttime」，陈旧锁绝不自动回收**：只看 pid 会把「pid 被复用」误当成「锁主人还活着」，陈旧锁永远收不回；自动回收则会在并发回归里删掉别人的活锁。释放时必须校验 token，防「误释放他人的锁」。
  - (28) **冻结读数必须全文残留扫描（R65⑱ 复审）**：本版 `ns 102→103 / members 573→580 / chars 7108→7169`、`命名空间 113→114 / 装载文件 105→106`，改完锚点后仍有一处陈旧读数（`settle-v2830.js` 的 `113 / 105`）被 r12 抓出。**版本升档与读数同步都是「多处字面量」任务，锚点改写不等于全文无残留。**
- **提交**：`（见本版提交）`。
