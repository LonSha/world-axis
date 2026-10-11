# WorldAxis 优化提升计划（第二代）：U1–U9

Status: proposed（2026-10-10 立；只读制订轮，不改产品实现、不改测试实现、不动版本）
基线：2026-10-10 的 `/home/user/wa_git` 工作树，`index.js` / `manifest.json` 均为 **v2.189.0**，HEAD `13410ae`，
全量回归 **15852 / 0**（v2.189.0 收口轮读数）。

> **本文件不进 `tools/gen-plan-status.js` 的复算面**：该生成器只处理 `plans/` 下四个登记过的文件
> （O / E / TP / TX）。U / Y 两线的现场读数块**由人维护**，但其中的版本与交付断言由
> `tests/u9-fact-report-v2190.js` 的常守判据盯着（见 U9）。这是刻意的：不把新计划塞进旧生成器，
> 免得「生成器只认旧编号形态」这件事再犯一次。

## 为什么另起两个前缀（而不是 O10–O18 / E10–E18）

`plans/O_OPTIMIZATION.md`（O1–O9）与 `plans/E_EXPANSION.md`（E1–E9）顶部的「**已交付 9 / 未交付 0**」
是 `tools/gen-plan-status.js` 现场复算出来的，判据原文写在生成器文件头：

> 一个编号算「已交付」，当且仅当 ① `tests/` 下存在**证据文件**；② 该文件在 `tests/run.js` 里**被引用**。
> 本块只判「有没有、挂没挂」，**不判「做得对不对」**。

立项轮按这个自述核对覆盖面，确认「交付」的语义边界（全部为本次实测）：

| 现场事实 | 读数 | 取法 |
|---|---|---|
| O/E 交付判据所判 | 「证据文件存在 + 挂进 run.js」 | `tools/gen-plan-status.js` 文件头 |
| O/E 各九项的面板消费 | **确有**（E 线六模块在 `ui/panel.js` 里各有 9–29 处调用；`checkpoints` 12 个导出全部接线） | `grep -oE 'WA\.<ns>\.[a-zA-Z]+' ui/panel.js \| sort -u` |
| **v2.189.0 四个新引擎的面板消费** | **1 处**（仅显示名映射表 `ui/panel.js:131`） | `grep -c 'beatReport\|beatLedger\|planAudit\|genGate' ui/panel.js` |
| 四个新引擎的消费者类型 | 注入源 2（beatReport / genGate）· 诊断登记 4 · 设置读口 4（全在 `programmatic`） | `tests/consumer-ledger.json`、`engines/tool-diag.js:2074-2077` |
| 九个 TX 模块接入统一提交链 | `WA.commit` 出现在 **4** 个引擎里（含 `tool-diag` 的只读诊断） | `grep -rl 'WA.commit' engines \| wc -l` |
| `programmatic` 登记面 | **137** 条（`dead` 843 / `uiDead` 3） | `tests/consumer-ledger.json`、`tests/dead-export-ledger.json` |

结论有三条，逐条决定了本代的分工：

1. **O/E 两线不是空壳** —— E 线六模块确实有面板入口，`checkpoints` 的「28 导出零面板入口」
   是 **v2.173.0 立项当时**的读数，v2.184.0（E3）已接上。任何继续引用那句的文档都是过期断言。
2. **真正的空白在 v2.189.0 这一批**：四个引擎有注入面、有诊断登记、有专锁，**没有玩家入口**。
   这不是「做得不对」，是「判据判不到这一层」—— 与 v2.189.0 收口轮那 17 处红的形态完全同源
   （**判据的覆盖面与数字的存活期必须对齐**）。
3. 因此本代不再沿用 O/E 编号：沿用会让「O10 已交付」与「O1–O9 已交付」在同一个块里长得一样，
   从而把「文件面交付」与「玩家路径交付」继续混为一谈。

**编号声明**：U / Y 是**本代标识**，与 O1–O9、E1–E9，以及更早的 O1–O16 / E 线 / RP–RX / SP–S / TP–TX
**均无继承关系**；本代每一项的验收口径显式包含「真实消费者」与「可视/可操作路径」两层，
不再以「有证据文件」单独判定完成。

## 现场读数基线（本次实测，非文档抄录）

| 读数 | 现场值 | 取法 |
|---|---|---|
| 版本 / HEAD | v2.189.0 / `13410ae` | `grep -n "VERSION =" index.js`；`git log -1 --oneline` |
| 全量回归 | 15852 / 0 | v2.189.0 收口轮实测 |
| 引擎 / 测试文件 | 170 / 228 | `ls engines/*.js \| wc -l`、`ls tests/*.js \| wc -l` |
| 最大单文件 | `ui/panel.js` 851536 B | `wc -c ui/panel.js` |
| 回归入口规模 | 22241 行 / 1772014 B / 237 节 | `wc -l -c tests/run.js`；`grep -c "^  section("` |
| 死子面 | dead 843 / uiDead 3 | `tests/dead-export-ledger.json` |
| 消费者登记 | programmatic 137 | `tests/consumer-ledger.json` |
| 统一提交链消费方 | 4 个引擎文件 | `grep -rl 'WA.commit' engines` |
| 笔记树 | 18 篇 | `find .agents/notes -name '*.md' \| wc -l` |
| 回归硬超时 | 1500000 ms | `tests/run.js` 隔离运行器默认值 |

## 九项优化

### U1 拍引擎家族的统一运行门面

- **现状（现场实测）**：`engines/beat-report.js`（四值白名单 `pass/adjust/setup/reject`，`report/view/buildBlock/diagnose/stat`）、
  `engines/plan-audit.js`（纯只读三态复验）、`engines/beat-ledger.js`（拍号由引擎推进，`claim/land/current/view/diagnose/stat`）、
  `engines/gen-gate.js`（四道按轮记账的闸门）。四者都**已装载、已产注入块、已进诊断登记**，
  但没有统一运行门面 —— 下一个接线的人（面板 / 章节流程 / 生成流程）要分别读四份启用判定、四份返回体形态。
- **实施范围**：一个只做**编排**不做**判定**的门面。它统一：① 读四模块的启用态；② 装配输入上下文；
  ③ 归一输出结构（结论 / 依据 / 拒收码 / 可恢复性）；④ 给出「本刻四闸谁在卡」的一句可读结论。
  **保留四个模块各自的白名单与硬条件**，不做宽容降级，不合并成一个引擎。
- **边界**：门面不新增拒收码语义（表外值仍由各引擎自己拒收）；门面不写 store；四个模块全关或门面自身关闭时，
  注入面与旧行为**逐字不变**；不复用 `inject-budget` 的折叠结果做判定（折叠是成本面，不是正确性面）。
- **验收**：① 四模块经门面调用与直调**等价**（同一输入同一结论，含拒收 reason 与 allowed 列表）；
  ② 输入缺失时门面转出的 reason 与引擎同源（不许门面自己造码）；③ 全关时门面返回空块且零注入；
  ④ 专锁含真源码破坏两向自证（打破面 → 等价判据现形；原版 → 同款判据为真）。

### U2 九个 TX 模块接入统一原子提交链

- **现状**：`core/commit.js`（九成员 + 回执台账 `commit.receipts` cap 64）的真实消费方是
  `backstage` / `coop` / `story-choice`（+ `tool-diag` 只读诊断）；九个 TX 模块多数各走 `store.transact`。
- **实施范围**：按耦合风险分批接入：① `diplomacy` + `operations`；② `freight` + `commission`；
  ③ `agency` + `investigation`；④ `aftermath` + `story-choice`；⑤ `world-blueprint` 与剩余协调模块。
  **只要求跨模块业务链**走统一提交，不把单模块内部写入强行拉进来。
- **边界**：不为省事把链拆成单模块事务（那正是本项要治的半写）；外部副作用失败不谎报成功；
  回执是簿记不是世界事实（不写世界键）；不静默改变既有单模块写入的语义。
- **验收**：每条链覆盖六面 —— 正常提交 / 中段失败 / 重试 / 重复 `opId` / 重载后回执 / 副作用失败；
  不得出现半提交；重试不得重复写入；失败能指出在哪一层；回执在重载后仍答得出；专锁真源码破坏两向自证。
- **进度（v2.194.0 · 批次①：diplomacy + operations）**：
  - 交付物：`core/commit.js` 链面（`chain` / `chainStat` / `chainSelfCheck` / `active` / `inflight` / `step`，
    导出面 15 项）+ `engines/diplomacy.js` 单一漏斗 `rx` 的在途标注 + `engines/operations.js` 五个写口
    （`enact` / `disburse` / `settle` / `handover` / `cancel`）统一走 `chainWrite`。
  - **链的首个真实产品消费者**：`operations.disburse` 自己开链 —— 跨模块转账（`org.transfer`）与本地
    记账同链一次提交，治好「钱出去了、账上没记」的两笔顶层事务半写（专锁 B5a–B5l 逐条取证，
    B5g 逐字比对「钱没出去、账也没记」）。链内次序固定为**先记账（无副作用）→ 后转账（有副作用）**，
    免得「目标账找不到」时转账的 org 流水已经写过（那类副作用链撤不回）。
  - 专锁 `tests/s3-u2-v2194.js` **57/57**（A 链六面 / B 在途不谎报含 B5 产品消费者 / C 硬边界如实登记）；
    反向自证 6 条真源码破坏（R6–R12）**全部被抓且逐字节还原**。
  - 摘除：链的零调用入口（`invite` / `settleInvites` / `registerFlusher` / `flushInvites` / `seen` /
    `opKeyWith` 及邀约专属失败码）与「成功路径透出 `abortWhy`」（实测零消费者）一并删除；
    链的只读读面接上产品消费方 `engines/tool-diag.js` 的 `commit` 节（原本只会停在 test-only 死导出）。
  - 门禁：死导出（`chainStat` / `chainSelfCheck` 不再计 test-only，`--update` 后全绿）/ 拒收码
    （`bad-chain` / `steps-full` / `chain-nested` / `step-threw` 四码入活见证表，`insufficient-funds`
    死表锚点随形态更新且理由改真）/ 模块注册表 / `FROZEN2800` 逐字回填（14772 字符）/ O2 专锁
    （`rx` 锚点同步，43/43）—— 全部复跑绿。**本批未跑全量回归**（按流程约定：全量留到计划全部内容完成之后）。
  - 待办：③`agency` + `investigation`；④`aftermath` + `story-choice`；⑤`world-blueprint` 与剩余协调模块。
- **进度（v2.194.0 · 批次②：freight + commission）**：
  - 正靶是**两条探针实测的真病**（不是阅读推断）：
    ① `commission.settle` / `cancel` 调 `WA.org.transfer` 只给 **4 个实参**（真签名是 6 参
       `(fromKind, fromName, toKind, toName, item, amount)`）⇒ 恒 `bad-resource`，而返回值被读成
       `r.ok !== false` ⇒ **转账从未发生，合约照样记 settled、回执照样报 `paid:true`**；
       `cancel` 侧同类，且异常被静默吞掉 ⇒ 托管没退回也记 cancelled。
    ② `commission.create` 的 `canAfford(principal, reward)` **参数错位**（把 name 当 kind、把数当 name）
       ⇒ 恒 false ⇒ **任何 `reward>0` 的委托都建不出来**。
  - 交付物：`engines/commission.js` 新增 `chainWrite` / `chainInflight` / `nestedVerdictSince` /
    `txCount` / `nextOpId` / `markSettledOnDraft` / `markCancelledOnDraft`（导出面仍 12）；
    `create` 要求有报酬时显式给 `item` 与 `principalKind` / `agentKind` 并正确调 `canAfford`，
    `create` / `advance` 走 `chainWrite`，`settle` / `cancel` 在链外顶层**自开链**（链内次序固定
    「先记账 → 后转账」，与批次①同一条次序纪律）；`engines/freight.js` 新增 `markInflight` /
    `nestedVerdictSince` / `txCount` / `wallNow`（导出面仍 10），四口（`dispatch` / `arrive` /
    `cancel` / `reroute`）统一在途如实标注（链上 `chain:true / persisted:false / projected:true`）
    与「被保存点撤回 ⇒ `ok:false`」判据。
  - **时效判据的第三代口径（本批的技术主线）**：`nestedVerdictSince` 初版用**墙钟毫秒**判新旧
    —— 测试冻结时钟下同毫秒连开事务会给出**相等**读数，把旧读数误判成本次的 ⇒ `C1b` 跨进程抖动；
    二代改用 `store.txStat().count` —— 无关事务会推进它，同样判不出「`lastNested` 何时写的」。
    真源补齐：**`store` 在 `lastNested` 里记 `seq`**（本笔嵌套事务在 `__txStat.count` 上的序号），
    消费方按 `ln.seq < n0 + 1` 判新旧（`seq` 缺失时回退计数口径）；`core/commit.js` 同步增
    `__chainStartedCount`。连跑 6 次无抖动。
  - 专锁 `tests/s3-u2-v2195.js` **39/39**（A 付费通路真发生 / B 在途不谎报含 freight 四口逐口 /
    C 硬边界如实登记 + 次序锚点）；反向自证 13 条真源码破坏（R13–R25）**全部被抓且逐字节还原**。
    自证当场抓到两处**专锁自身缺口**并补齐：`A6` 只核了退款落地与状态、没核「链外顶层开链」两面
    （假绿，补 A6d/A6e）；`B3` 只钉了 `dispatch` 一口、`arrive` / `cancel` / `reroute` 漏测
    （补 B6/B7/B8 三口逐口）。另登记一项**只有源码锚点能守**的事实：链内次序颠倒时 A 段全部读数
    仍绿（记账在草稿里，整链中止会把草稿整体丢弃），故补 `C3a` / `C3b` 次序锚点。
  - 门禁：死导出 / 拒收码（`refund-failed` 走可执行见证；`no-budget` 由死表锚点转活并改真理由）/
    模块注册表 / 模块图边恒等式（调用期 1676 → 1678、合计 1786）/ 散装读数（refs 5378 → 5417）/
    `FROZEN2800`（14772 字符不变）/ TX 与契约面专锁 / O2 专锁 —— 全绿。
     **本批未跑全量回归**（同批次①，按流程约定）。
  - 版本白名单：12 只旧专锁的版本清单统一追加 `2.194.0`（随升版追加当版，属常规维护）。
- **进度（v2.194.0 · 批次③：agency + investigation）**：
  - 正靶是**四条探针实测的真病**（不是阅读推断）：
    ① `agency.schedule` 读不到当前步 —— `plan.current` 的扁平回执只带 `seq`，本模块读 `planRow.step`
       ⇒ `step` 恒 `undefined` ⇒ 恒 `no-step`：**「行动反馈闭环」100% 空转，且没有任何一行读数报错**
       （本仓点名的「功能级失效」的教科书样本）。
    ② `processReceipts` 找不到行动行 —— `act` 的结算回执把行动 id 写在 **`id`** 上，本模块读
       `r.actId`（那个字段从来不存在）⇒ 恒 `no-act-row`。
    ③ 回执**永不消化** —— 唯一去重判据 `!r._agencyProcessed` 是**只读**字段，全库无人写它
       ⇒ 同一条回执每轮都被当新的再消化一次。
    ④ 消化与结算**不同生共死**（两笔独立事务，结算成因消化标记没写上 ⇒ 重复消化）。
  - investigation 侧的 `reveal` 是**三写半写**：`enigma.mark` + `intel.addIntel` + 本模块记账
    分属三笔顶层事务 ⇒ 让第三笔失败时，enigma 已写进世界、线索仍 investigating，回执照样 `ok:true`。
  - 交付物：`engines/agency.js` 新增 `commitOf` / `chainInflight` / `nextOpId` / `txCount` /
    `nestedVerdictSince` / `activeStepOf` / `chainWrite` / `planRowOf` / `pendingStepOf` /
    `advanceStepOnDraft`；`engines/investigation.js` 新增 `chainInflight` / `nestedTx` /
    `findClueForWrite` / `writeEvidence` / `nextOpId` / `txCount` / `nestedVerdictSince` /
    `markInflight` / `markRevealedOnDraft`。两模块的读口在链内改查链草稿、写口三态如实标注。
  - 专锁 `tests/s3-u3-v2196.js` **39/39**。
  - 门禁：拒收码（`no-act-id` 是新增的**形状读数码**：两处 id 都认之后「连 id 都没有」才被显式
    表达出来；标准 boot 下 `act.receipt()` 恒写 `id` ⇒ 不可达，登记进死表）/
    `reject-code-ledger.json` 的 `deadCount` 与 `reject-v2780.js` 的 `DEAD` 表锚点同步；
    模块图边恒等式（调用期 1678 → 1682、合计 1786 → 1790）/ 散装读数（refs 5417 → 5459）。
    **本批未跑全量回归**（按流程约定：全量留到计划全部内容完成之后）。
    〖台账形状〗本批把 changelog 末条写成了**裸字符串**（前 9 条皆为 `{version,module,codes,note}`
    对象）—— 同一张台账两种形状，任何按对象遍历 changelog 的消费方会在那里崩或静默跳过；
    批次④ 已按既有形状改写并补回文件尾换行。
- **进度（v2.194.0 · 批次④：aftermath + story-choice）**：
  - 正靶是**五条探针实测的真病**（`/tmp/probe_u4a.js` / `/tmp/probe_u4b.js`，不是阅读推断）：
    aftermath 三病 —— ① 链内读面看不见本链新实体（`find` / `findByEvent` 读已提交快照
    `store.get()`，而 `register` 写在外层 draft 上）⇒ 链内 `view` 恒 `not-found`；
    ② 同一链内重复 `eventId` **去重失效**（判据读同一份过期快照）⇒ 两条同类效果都落世界，
    而「同一事件效果只生效一次」是本模块的边界 4；③ 链上写入**不报在途**（回执只有 `ok:true`）。
    另测出一条**跨模块真半写**：`aftermath.repair` 报 `{status:'repaired'}` 而 `region` 的
    `lane.blocked` **仍为 true** —— 「效果已修好」与「这条路仍然不通」两个互斥事实同时挂在世界上。
    story-choice 两病 —— ① 链内 `review` 找不到本链刚登记的选择点；② 链级半写（`present` 的
    `branchTree.fork` 树记账与点落库、`confirm` 的兑现与回执回写分属独立事务 ⇒ 「点存在、树上无
    节点」这类互斥事实可被留下）。
  - 交付物：`engines/aftermath.js` 新增 `nestedTx` / `chainInflight` / `inChainDraft` /
    `readEffects` / `markInflight` / `rowForWrite` / `laneBlocked` / `_clearLaneIfBlocked`；
    `repair` 在 `status='repaired'` 的**同一笔**内调 `_clearLaneIfBlocked` 并在回执带 `laneCleared`，
    `stat()` 新增 `bridgeMiss` 读数（**必须恒为 0**；`root` 为 null 时不写，宁可如实计 bridgeMiss
    也不偷偷另开一笔）；`engines/story-choice.js` 新增 `nestedTx` / `chainInflight` /
    `inChainDraft` / `readPoints` / `markInflight` / `rowForWrite`。两模块 diagnose 新增
    `checks.chain` 能力自报（与 `closedLoop` 分开报），版本与 `registerModule` 同步升到 `2.194.0`。
  - **本批最值得记的一条纠错**：照抄批次③为两模块各加了自证槽 `WA.__aftermathWarn` /
    `WA.__storyChoiceWarn`（写口找不到行时点亮），并据此把模块图门禁的静态提供方改到 254、
    ns 面差改到 41、零读名单改到 29、`internalPrefixed` 追加两个名字。专锁首跑即实测该点位
    **恒不可达**（读口 `find` 与写口 `rowForWrite` 同层同源：find 通过 ⇒ rowForWrite 必通过），
    属零调用死代码 ⇒ 按本仓「不留看起来会被用的出口」口径**删除**那两个槽与其点亮分支，
    并**回退**三处读数（252 / 39 / 27）与 `internalPrefixed` 的两项。留痕待查的不是槽，是那份
    越改越乐观的推断；`module-cycle-gate-v2107.js` 里三次常量全部改为**实测值**（nsProvided 252 /
    差 39 / 零读 27 / drift 0，用 `node -e "...audit()"` 现取）。
  - 专锁 `tests/s3-u4-v2197.js` **52/52**（A0–A5 aftermath / B0–B4 story-choice / C1–C4 硬边界与
    如实登记）。C2 原设计为「写口找不到行 ⇒ 点亮自证位」，首跑 FAIL 即暴露上面的不可达性，
    改写为验**真实可达**的修好即通路（`lane.blocked === false` + 回执 `laneCleared:true` +
    `stat().bridgeMiss === 0`）。
  - 门禁：散装读数 **refs 5459 → 5467**（`sync-hardcoded.js --write`，3/3 站点；逐处归因：
    aftermath +5 = `commit.inflight` ×2 + `region.places` ×2 + `commit.chain`×1；story-choice +3 =
    `commit.inflight` ×2 + `commit.chain` ×1 —— 由逐文件回退实测得出：只退 aftermath 得 5462、
    只退 story-choice 得 5464）；reads 复跑 **61 项**；模块图边恒等式（调用期 1681 → 1682、
    合计 1789 → 1790，一条新增边 = `engines/story-choice.js → commit`；`aftermath → commit` 在 HEAD
    上已存在）；模块注册表（文件 205 / 命名空间 213 / 装载期边 108 / 硬边 0 / 调用期引用 212）；
    拒收码门禁（产品文件 218 / 内联码 809 = 见证 534 / 死表 49 / 基线 226，每个码都有归属）。
    **本批未跑全量回归**（按流程约定：全量留到计划全部内容完成之后）。
  - **挂载面的真缺陷（本批实测抓到，比孤儿更隐蔽）**：U2 的四把专锁（`s3-u2-v2194` / `s3-u2-v2195` /
    `s3-u3-v2196` / `s3-u4-v2197`）导出的 `runAll` 全是
    `function () { return { failed: bad, total: results.length }; }` —— **不接参数、不转发**。
    而 `run.js` 的 `runLock(spec, method)` 做的是 `require(spec)[m](assert)`（注入聚合器自己的
    assert，v2.75.0 起统一形态）。于是：锁挂上了、也跑了，但**锁红了全量回归照样绿**（形式挂载 =
    假绿）。批次① 从 HEAD 起就是这形态，②③④ 沿用 ⇒ 四把一并改为逐条转发
    `results.forEach(r => a(r.ok, r.label))`，并用「注入真 assert / 注入恒假 assert」双向实测
    （四把各自注入面收到条数 = `results.length`，恒假面同条数 ⇒ 非空转，`/tmp/mount_real.js`）。
  - **孤儿面（实测抓到）**：②③④ 三把锁交付时**只有裸脚本入口**，没挂进 run.js 的包装面 ——
    `tests/orphan-lock-v2750.js` 的 [B]「真仓库零孤儿」当场报
    `实 3：s3-u2-v2195 / s3-u3-v2196 / s3-u4-v2197`。「独立 `node` 能跑通」不等于「进了回归」；
    三把按批次①同规挂进 `run.js` 的 U2 节（不新开挂载形态），orphan 门禁复跑 pass。
    教训写在此处：**挂载与转发是两件事**，只做前者会同时产生假绿与孤儿，而两者都不改变任何输出。
  - 待办：⑤ `world-blueprint` 与剩余协调模块 —— **⑤ 已交付（见下一块）**。

- **进度（v2.195.0 · 批次⑤：world-blueprint + world-seed + `core/commit.js` 的跨层副作用面）**：
  - 正靶是**五条探针实测的真病**（`/tmp/probe_u5a.js` / `/tmp/probe_u5b.js` / `/tmp/probe_u5c.js`，不是阅读推断）：
    ① 链内**写后读看不见本链实体** —— `world-blueprint.get` / `world-seed.get` 走 `store.get()`
       的**已提交快照**，而写口落在链草稿上 ⇒ 链内 `get` 恒 `unknown-blueprint` / `unknown-seed`
       （提交后世上确有它，链里却读不到）。
    ② **同一链内重复登记判据失效** —— 去重读的也是那份过期快照 ⇒ 链上两次同签名 `save` 都报
       `ok:true`，提交后**同一份蓝图真存两份**（顶层同样输入是被 `duplicate-blueprint` 拒的）。
    ③ 链上写入**不报在途**：回执只有 `ok:true`，看不出「这一笔还没提交」。
    ④ **跨层半写**（`/tmp/probe_u5c.js` C1）：`importBlueprint` 在链里被调、随后整链中止 ⇒
       世界上人 / 地 / 势力全 0（与链的原子性一致），而蓝图 `mech` 那一段的 `setSettings`
       **已经写进 settingsBus**（实测 libCap 3 → 7）。同一刻「这个世界没装成」与「这个世界机制已改了」
       两个互斥事实同时成立 —— 这一条 `defer`（世界提交后可补做的通知面）治不了：机制开关是
       **世界装成的前提**，推迟它等于让世界带着没生效的机制先落地（那是另一种半写）。
    ⑤ **谎报**（C2）：`setSettings` 抛错被 `catch (err) {}` 静默吞掉 ⇒ 世界照装、回执
       `{ok:true, installed:{…}}`，而机制一行没生效；`stat().faults` 也看不出（实测 `{}`）。
  - 交付物：`core/commit.js` 新增 `effect(chainObj, kind, fn)` / `pending()` 两读口（导出面 **15 → 17**）、
    常量 `LIMITS_EFFECT = { LIST: 8 }`、`CHAIN_FAULTS` 14 项（新增 `bad-effect` / `chain-effects-full`）、
    `markPending()`（链中止时把**已做未提交**的副作用推进有界待办，**不自动重放** —— 机制开关按浏览器
    全局存，自动重做等于把一个聊天的配置写到所有聊天）、`chainPack` 回带 `effects` / `effectMiss`、
    `active()` 报表内副作用读数；`engines/world-blueprint.js` 新增 `chainDraft` / `bucketRead` /
    `listRead` / `markInflight` / `reportWrite`，`doWrite` 链上改走链草稿，`importBlueprint` 的机制段
    改 `mechReport = {applied, refused, failed}` 三栏（链上经 `WA.commit.effect(null,'mech:'+eng,run)`
    逐项记账，失败额外 `commit.step` 并写 `_stat.faults['mech:'+codes]`），回执与 `stat().lastMech`
    同批带出；`engines/world-seed.js` 同型接入（并明确**不动** `initConfirm` —— 初始化是「开新局」，
    本质是顶层操作）；`engines/tool-diag.js` 的 `commit` 节新增 `effects: {pending, cap, items}`
    （两个新读口**各有产品侧真消费者**，不停在 test-only）。
  - 专锁 `tests/s3-u5-v2198.js` **88/88**（A0–A9 跨层副作用面：成功回带 / `effect-refused` / 抛错带真因 /
    `bad-effect` / `effectMiss=2` / 容量闸 8 与「链面闸 ≠ 世界面 `effects-full`」/ 链外 `bad-chain` /
    链中止后 pending 四格齐全且世界一格未动 / 诊断面消费方在场；B0–B6 world-blueprint 五病 +
    跨层半写 + 谎报分栏；C0–C6 world-seed 同型 + `initConfirm` 不动；D1–D5 顶层与嵌套三态、
    导出面与模块版本 2.195.0、`CHAIN_FAULTS` 新增两条；N0–N4 **真源码破坏负控制**：破坏两模块
    `chainDraft` 读口 ⇒ 写后读与去重同款判据当场翻假（且复现「同一份存两份」），破坏 `effectMiss`
    累计 ⇒ `effectMiss=2` 翻成 0，真源文件逐字未变）。
  - **一条必须分列的码名纪律（本批实证）**：`effects-full`（aftermath 的**世界面**效果账容量，
    不可达死表）与 `chain-effects-full`（commit 的**链面**副作用容量，真可达见证）**必须是两个码名**
    —— 重名会让见证集与死表集相交 ⇒ 恒等式差 -1，这是 `reject-lock` B 组「见证 ∩ 死表 = ∅」与
    `coverage`「sum === total」两条硬判据同时要求的。**一个执行点一个码名**。
  - `engines/reject-recovery.js` 同批收口：`no-step` 由判不出面**迁入**拒收面（批次③ 给
    `engines/agency.js` 加了一处带 `ok:false` 的同码返回，括号配对判据「只要有一处落在 `ok:false`
    对象里即拒收面」），新增 `no-act-id`（`request-setup`）与 `step-threw`（`retry-same-input`）两档、
    白名单补 `bad-effect` / `chain-effects-full` / `chain-nested` / `refund-failed` / `steps-full`，
    版本 2.192.0 → **2.195.0**（产品模块 + 模块注册 + `diagnose().version` 三处同源）。
  - 门禁（全部实测、本批未跑全量回归，按流程约定）：拒收码门禁 **811 = 见证 536 / 死表 49 / 基线 226**
    （产品文件 218）；`reject-recovery` 三面现场复算 **811 = 拒收 723 / 成功 34 / 判不出 54**
    —— 归因由**逐文件回退实测**得出（退 `core/commit.js` ⇒ 809 = 721/34/54，少 `bad-effect` 与
    `chain-effects-full` 两个拒收码；退 `engines/agency.js` ⇒ 810 = 722/34/54，少 `no-act-id` 一个
    判不出码且 `no-step` 迁回判不出；退 `reject-recovery` / `world-blueprint` / `world-seed` ⇒ 仍 811）；
    散装读数 **refs 5467 → 5476**（逐文件回退实测归因：world-blueprint +5 / world-seed +2 /
    tool-diag +2；`core/commit.js` 本身不改 refs，它增的是**成员** 2554 → **2556**）；
    死子面 **856 / uiDead 3 / dataOnly 297 不变**（两个新导出各有真消费者 —— 退 `world-blueprint`
    或退 `tool-diag`，对应那个导出当场被判「新增死导出 857」，这条正是「新增导出必须有真消费者」的现场证据）；
    模块注册表（文件 205 / 命名空间 213 / 装载期边 108 / 硬边 0 / 调用期引用 212）/
    `module-cycle-gate-v2107` pass(65) / `readings-v2106` pass(61) / `settle-v2830` pass(55) /
    `version-surface-gate-v2185` pass(14，20 条白名单全跟上 2.195.0) / `o8-consumer-gate-v2187` 38/0 /
    `u3-loose-readings-v2191` 35/0 / `u4-export-lifecycle-v2191` 30/0 / `docs-archive-gate` ✓ /
    `gen-error-codes --check` 双向零差 / `fact-report --self-test` pass（版本三方一致，
    `run.js` 消息面钉 **9** 处）。
  - **挂载面（本批当场做，不留欠账）**：专锁按批次①–④ 同规挂进 `tests/run.js` 的 U2 节
    （`runLock('./s3-u5-v2198.js')`，不新开挂载形态），且 `runAll` 是**逐条真转发**
    （`results.forEach(r => a(r.ok, r.label))`）—— 批次④ 实测过的「形式挂载 = 假绿」形态本批不再重演。
    `orphan-lock-v2750` 复跑 pass（[B] 读数回 **0** 孤儿），`test-surface-gate` 实测
    测试文件面 **238** / 锁 208 / 孤儿 **0**。
  - **一条注释纪律（本批自纠）**：`tests/run.js` 那处「面总数 804 → 811」的归因注释**初版写的是
    凭印象编的算式**（未实测就写「某几码为本批存量」）。当场改用两条实测通道校正：`node -e` 现场复算
    三面 + **逐文件 `git show HEAD:<file>` 回退**后重跑 `live()`，再按实测重写注释。**注释里的算式
    与判据的输入面必须同源** —— 凭印象写下的数字在下一轮升版时会变成一份「看起来是实测的历史」。
  - **同批跨批修复（存量欠账，只在全量里现形）**：`tests/beat-facade-lock-v2193.js`（**R170 / v2.193.0 的 U1 专锁**）
    的 `ANCHORS` 写成**扁平字符串表**（全仓唯一一把），统一档审计器 `tests/negative-control-audit.js`
    的 `auditAnchor` 第一步就要求 `{ rel, txt }` 对象 ⇒ 它被判 `shape: 锚点不是对象` **8 条**，
    `anchor-scan` 的**统一档（门禁面）**当场非零，`tests/anchor-scan-v2126.js` 与 `tests/anchor-scan-v2133.js`
    两把门禁**红**。归因靠 **`git worktree add --detach HEAD` 干净树实测**（同一组 8/8 ⇒ 存量、非本批）；
    修法是**对齐契约、不动锚点字面量**（8 条锚点原文各在 `engines/beat-facade.js` 恰 1 次、在本锁恰 1 次），
    表改 `{ rel: FA, txt: … }` 并补 20 处 `.txt` 用法。修后 `anchor-scan-v2126` **pass(31)** /
    `anchor-scan-v2133` **pass(55)** / `negative-control-audit-v2104` **pass(49，problems 0)** /
    该锁自身 `runAll` 仍 **38 / 0**。**教训**：`ANCHORS` 是**跨锁契约** —— 形状漂移在本锁里不报错
    （本锁只用 `indexOf`，字符串照样能用），只在**消费者**（别人的审计器）里现形。
  - 待办：U2 剩余协调模块（`backstage` / `coop` 等既有链面消费者按需复查），随后按本计划推进
    U3–U9 与 `plans/Y_EXPANSION.md` 的 Y 线。**全量回归仍留到计划全部内容完成之后**。

### U3 散装读数的登记与「过期即现形」

- **现状**：v2.189.0 收口轮的 **17 处红没有一处是新代码写错**，全是「新代码进来后没人通知的旧读数」。
  `tests/settle-v2830.js` 三处最典型：写死的、不在 `tests/readings.js` 族扫描面内、无任何判据盯着的数字，
  于是从 v2.185.0 一路红到全量回归才现形（发现通道 = 跑一次 17 分钟）。
  既有机制：`tests/readings.js`（族内同值 / 等于现场实测 / 消息与比较值同步三判据）、
  `tools/sync-hardcoded.js`、`tools/sync-e2e-readings.js`（A/B/C/D 四形态站点登记）。
- **实施范围**：**扩面而非重写**。把「版本号 / 模块数 / 命名空间 / 成员 / 拒收码 / 死导出 / 控件数 / 回归数」
  之外仍散装存在的读数纳入审查表，每条登记四项：**真源**（账本或探针）、**形态**、**允许的写法**、**由谁盯**。
  写死的历史事实（如计划文件里的「基线 v2.173.0」）保留，但必须有显式的「这是历史」标记，
  不许与当前读数长得一样。
- **边界**：① 不把动态统计改成另一份手写常量（那是本病的反向形态，v2.189.0 收口轮刚修过一处同族）；
  ② 宽泛正则一律不加（误伤沿革叙述会让人开始忽略告警）；③ 沿革叙述里的旧数字不算失配。
- **验收**：① 改模块注册表后，相关读数在**分钟级**门禁里现形，不必跑全量；
  ② 失配报出文件 / 行号 / 读数类型 / 真源；③ 新增散装读数若无登记则红；
  ④ 审查表自身不得成为第二真源（真值一律取账本或探针，表只登记站点）。

### U4 导出面从「有登记」升级为「有去向与复查期」

- **现状**：`tests/consumer-ledger.json` 的 `programmatic` 面已 137 条；`dead` 面 843 条。
  登记解决了 O8 的「无消费者且未标注归零」，但**登记没有复查期**。
  四个新引擎的设置读口即此形态：已注册进 `settingsBus`、零调用方、理由是「面板尚未渲染该模块」——
  理由说得对，但它**不会自己到期**，下一个升版的人没有信号回头处理它。
- **实施范围**：在既有登记上叠加生命周期字段（`purpose` / `nextConsumer` / `reviewAfter` / `disposition`），
  并把消费者类型细分为七档：真实玩家路径 / 注入路径 / 其他引擎 / 维护者诊断 / 测试专用 / 程序化保留 / 应删除。
- **边界**：**登记不是豁免**（承 O8 原判据）；不为消读数而删除可用接口；
  「形态变了」（机器判，`shape-stale`）与「理由过期」（人复核）分开报，不合成一档。
- **验收**：① 新增导出无登记即红；② 超期未复核的 `programmatic` 条目进入清单并能在诊断面列出；
  ③ 四个新引擎的每个导出都有明确去向；④ `disposition: 应删除` 的条目真的被删，或改成保留并给出理由。

### U5 拒收码到恢复动作的统一映射

- **现状**：拒收码已 800+（v2.189.0 收口轮实测 **804 = 见证 530 / 死表 48 / 基线 226**），
  三面已治理（分类、见证、覆盖率），但「拒收之后该干什么」不是统一契约。
  新拍引擎尤其明显：`adjust` / `setup` / `reject` / `bad-round` / `hard-cut` / `landed-immutable`
  都可拒收，但处置方向**相反** —— 前两个补因、后四个才要回滚或重写。
- **实施范围**：为拒收码增加结构化恢复语义（`retry-same-input` / `request-setup` / `adjust-input` /
  `rollback` / `manual-review` / `permanent-reject`），由**一份**映射供诊断面、面板面、日志面共用。
- **边界**：① 不把可重试与可忽略合成一档；② 恢复建议不得暗示「忽略即可」（那是静默降级）；
  ③ 表外码不落进任何默认档，须显式登记（未登记即红）；④ 恢复语义不写 store。
- **验收**：① 每个新码都有结构化恢复建议；② 建议与码的处置方向不矛盾（`adjust` 不得给出 rollback）；
  ③ 空结果不被误报成「没有问题」；④ 拒收后零隐式写入；⑤ 正反两向专锁。

### U6 真实手机性能与存储预算

- **现状**：`perf-ledger`（滚动窗口台账）/ `perf-trace` / `perf-baseline`（O3 第二批，未测面 `p50` 保持 `null`）/
  `storage-forecast` 基础件齐备；三档真实存档实测基线仍缺。
- **实施范围**：小局 / 代表性长局 / 容量边缘三档真实存档，采集生成前后、事务复制、序列化、提交、
  注入构建、面板首次打开、切页、前后台恢复的 p50 / p95 / 最大阻塞与写盘次数。
- **边界**：先采基线再冻结预算；未采到样本的面保持 `null`（**不许拿 0 冒充** —— 那是合法耗时读数）；
  第三方测量库只临时放 `/tmp`，不进零依赖仓库；不为达标牺牲失败隔离、视角过滤与容量治理。
- **验收**：① 同档同操作前后对照；② 热点可解释下降（复制次数 / 写盘次数 / 阻塞时间至少一项）；
  ③ p95 满足已冻结的宿主预算；④ 手机触屏滚动与前后台恢复有实机读数；⑤ 缺宿主数据时如实标「待验收」。

### U7 真实 SillyTavern 宿主闭环

- **现状**：`tests/ui-live.js` 四驱动通道已备（含零依赖内置 CDP，Node 自带 WebSocket 直连，
  `host: 'stub'` 的桩位与降档理由都如实登记）；`tests/o1-host-matrix-v2186.js` 已把矩阵判据立起来。
  缺口是**覆盖面**：四个新引擎与九个 TX 模块的玩家路径尚未逐条走。
- **实施范围**：按 U1 / U2 / Y1 / Y2 的产出逐个补四路径（成功 / 拒收 / 重载 / 重复）×
  四类证据（交互序列 / 控制台输出 / 操作后状态 / 重载后状态），桌面与手机各覆盖一组关键路径。
- **边界**：宿主证据缺失就保持「待验收」，**不用无头全绿顶替**；不为取证据改产品行为（改行为属另一项）；
  mini-DOM 与真浏览器结论冲突时以真浏览器为准，并把差异留档。
- **验收**：四栏表（源码 / 无头 / 宿主 / 玩家）后两栏不再全空；每项至少一条玩家路径与一条拒收路径留证；
  负控制须证明「破坏面板接线 ⇒ 宿主判据真的现形」（即绿灯来自真接线，不是按钮点了个空）。

### U8 回归分层与长回归的日常可用性

- **现状**：全量回归单趟约 17 分半、237 节、1.77 MB 源码。分层工具已交付：
  `tools/test-layers.js`（归属表 + `select()` + `buildOutcome()` 单一真源）、`tools/slow-sections.js`（耗时归集）、
  `tools/prune-sections.js`（把未选中节的**节体**拿掉，不是只注释打印）。
  但「快 / 中 / 全」尚未成为默认工作流 —— 一次改动仍倾向跑全量。
- **实施范围**：把三档入口固化成可复读命令与读数（选区、跳过清单、拒绝清单、本趟耗时与慢节点名），
  并把「独立进程组 + 输出落盘 + 锁回收」写成一条可复制流程（本仓现场踩过「后台进程随会话退出被杀」）。
- **边界**：分层不得改变全量判据（承 O6 边界）；跳过必须显式并计数；`refuse` 不许给通过结论；
  加速绝不靠减少判据；全量入口仍是 `node tests/run.js` 且行为逐字不变。
- **验收**：① 选区不漏跑（裸语句节的节体不得在 `section()` 提前返回时仍执行）；
  ② 同判据在选区内外的结论一致；③ 失败可按节稳定重现；④ 三档入口的读数写进文档且由门禁复算。

### U9 发布前事实报告（版本 / 文档 / 工作树三方对齐）

- **现状**：v2.189.0 收口轮现场确认过四类事实脱节：版本号在 `index.js` / `manifest.json` /
  `tests/run.js` 消息面各写一遍；文档读数可能落后（`docs/ERROR_CODES.md` 曾停在 788 码，实测应为 804）；
  计划文件状态可由「文件存在 + 挂进 run.js」推出与玩家路径无关的「已交付」；
  工作树可能与 HEAD 不一致（本轮 51 项未提交改动）。
- **实施范围**：一条命令输出发布前事实：① 三方版本；② 全量回归读数；
  ③ 拒收码三面；④ 模块注册读数；⑤ 死子面与消费者读数；⑥ UI / 宿主验收状态；
  ⑦ 工作树改动清单与未跟踪交付物；⑧ `.bak` 与回归临时目录残留；⑨ **当前文档中仍存在的旧基线**（列出位置，不改写）。
- **边界**：报告**只读**；不自动改写计划正文（人写意图部分保留）；旧基线只列出，由人决定是否更新；
  不把「列出」当作「已修」。
- **验收**：① 三方版本不一致即失败；② 报告与 agent note 内容一致；
  ③ 发布提交前该报告为必跑步骤（写进 `CONTRIBUTING` 式说明或 README 的发布段）；
  ④ 报告里的每一项都能被读者用给出的命令复算。

## 与旧计划的关系

| 本项 | 旧项 | 关系（不是重列，是换判据） |
|---|---|---|
| U1 | 无（v2.189.0 新交付的直接后续） | 把四个新引擎从「模块可用」变成「产品可用」 |
| U2 | O2（跨 TX 原子提交） | O2 判「证据文件在不在」，U2 判「跨模块链真的走没走统一提交」 |
| U3 | O7 / O8 的一部分 | O7 治计划文件顶部块，U3 治**所有**散装读数 |
| U4 | O8 | O8 判「有没有登记」，U4 判「登记有没有到期、有没有去向」 |
| U5 | 无 | 拒收码治理此前到「分类与见证」为止，未到「恢复动作」 |
| U6 | O3 / TP6 | 同一件事：先采基线，再冻结预算 |
| U7 | O1 / TP9 宿主面 | O1 立了矩阵判据，U7 拿它跑四个新引擎与 TX 的路径 |
| U8 | O6 | O6 交付了分层工具，U8 把它变成默认工作流 |
| U9 | O7 文档面 | O7 管计划文件块，U9 管发布前的一次性事实报告 |

## 实施顺序

| 批次 | 项 | 理由 |
|---|---|---|
| 第一批 | U3 + U4 + U9 | 先把「完成标准」修正 —— 否则后续每一项交付都会重演本轮的旧读数红 |
| 第二批 | U1 + U5 + Y1 + Y2 | 让 v2.189.0 的四个新引擎第一次有玩家入口 |
| 第三批 | U2 + U7 + Y3 + Y4 | 补真实运行闭环：不半写、能验收、能操作、能存档 |
| 第四批 | U6 + U8 + Y5–Y9 | 在提交、宿主、存档边界都立住之后，再扩世界表达能力 |

## 交付记录（与勾选面分开，逐项就地写）

> 本段的写法：每一项交付后**只追加一行**，写清「哪一版 / 证据文件 / 专锁读数 / 现场读数」。
> 与顶部那张「现场读数基线」表一样，本段由人维护；但其中**可被机判的那部分**
> （版本号、工具是否入册、锁是否挂进 `tests/run.js`）由 `tests/u9-fact-report-v2190.js` 与
> `tests/toolchain-gate.js` 盯着 —— 写在本段里的「已入册 / 已挂节」不是自由文本。

| 项 | 版本 | 证据文件 | 专锁 | 现场读数（交付时实测） |
|---|---|---|---|---|
| U9 发布前事实报告 | **v2.190.0** | `tools/fact-report.js` + `tests/u9-fact-report-v2190.js` | **52 / 0** | 版本三方一致（`index.js` / `manifest.json` = 2.190.0，`run.js` 消息面钉 9 处）· 拒收码 804 = 见证 530 / 死表 48 / 基线 226（恒等式为平）· 模块注册 引用 211 / 装载 203 · 死子面 dead 843 / uiDead 3 · 旧基线 8 处（**只列出**） |
| U3 散装读数登记 | **v2.191.0** | `tests/loose-readings.json` + `tools/loose-readings.js` | **35 / 0** | 4 个站点 / 3 种形态 / 1 个探针（`tests/module-registry-ledger.json`）· 核对 6 处字面量 / 问题 0 · 表内零真值字段（`value-in-table` 硬判据）· 改探针读数 ⇒ **分钟级**报出文件 / 行号 / 读数类型 / 真源，不必跑全量 |
| U4 导出面去向与复查期 | **v2.191.0** | `tools/consumer-types.js` + `tests/u4-export-lifecycle-v2191.js` | **30 / 0** | 登记 **137 条**（settings-registry-only 73 / ui-component-library 41 / query-api 20 / data-const 3）· 生命周期问题 0 · `disposition` 全 `keep` · `reviewAfter` 全 `2.196.0` · O8 门禁仍 38 / 0 |
| U5 拒收码 → 恢复动作 | **v2.192.0** | `engines/reject-recovery.js` + `tools/reject-recovery.js` + `tests/reject-recovery-lock-v2192.js` | **115 / 0** | `reason` 字面量 **804 = 拒收 717 / 成功 34 / 判不出 53**（括弧配对实测，**804 从来不是拒收面**）· 六档分布 64 / 287 / 288 / 71 / 10 / 17 · 无恢复动作 67（成功 34 + 契约外 32 + 词法碎片 1）· `OVERRIDES 38` / `NEUTRAL_REVIEW 53`（契约外 32）/ `ARTIFACTS 1` · 核对器零问题 · 幽灵码三条全 `unknown`（边界 ③）|
| U1 拍引擎家族统一运行门面 | **v2.193.0** | `engines/beat-facade.js` + `tests/beat-facade-lock-v2193.js` | **38 / 0** | op **9** 条（`report` / `audit` / `equivalent` / `plan` / `land` / `claim` / `transition` / `gate` / `record`）· 家族 **4** 员 / 产块 **2** 员 · 归一形状 `{ ok, engine, op, reason, recovery, fault, … }` · **零内联 `reason:` 字面量**（编排层失败走 `fault` 四码）· 真代码面零 `store.transact` · 恢复档只读 U5（`bad-round` ⇒ `adjust-input`，缺席即 `null`）· 家族全关 ⇒ 空块（注入面逐字不变）|
| U2 批次① diplomacy + operations | **v2.194.0** | `core/commit.js` + `engines/diplomacy.js` + `engines/operations.js` + `tests/s3-u2-v2194.js` | **57 / 0** | 链导出面 **15** 项（`chain` / `chainStat` / `chainSelfCheck` / `active` / `inflight` / `step`）· 链首个真实产品消费者 `operations.disburse`（跨模块转账与本地记账同链，「先记账 → 后转账」次序锚点 C3a/C3b）· 反向自证 6 条真源码破坏 R6–R12 全部被抓且逐字节还原 · 摘除六个零调用入口 · `tool-diag` 接上 `commit` 节（链只读面不再停 test-only）|
| U2 批次② freight + commission | **v2.194.0** | `engines/commission.js` + `engines/freight.js` + `tests/s3-u2-v2195.js` | **39 / 0** | 两条探针实测真病（`commission` 调 `org.transfer` 只给 4 实参 ⇒ 恒 `bad-resource` 却记 settled；`canAfford` 参数错位 ⇒ `reward>0` 的委托建不出来）· **时效判据第三代口径**：`store.lastNested` 里记 `seq`（初版墙钟毫秒 / 二代 `txStat.count` 都判不出「何时写的」）· 反向自证 13 条 R13–R25 全部被抓 · 自证当场补两处专锁缺口（A6d/A6e、B6/B7/B8）|
| U2 批次③ agency + investigation | **v2.194.0** | `engines/agency.js` + `engines/investigation.js` + `tests/s3-u3-v2196.js` | **39 / 0** | 四条探针实测真病（`plan.current` 只带 `seq` 而本模块读 `planRow.step` ⇒ 恒 `no-step` 而「反馈闭环」100% 空转 / 回执 id 写在 `id` 而本模块读 `r.actId` ⇒ 恒 `no-act-row` / `_agencyProcessed` 全库无写入方 ⇒ 回执永不消化 / 消化与结算不同生共死）· `no-act-id` 为新增**形状读数码**（标准 boot 不可达，登记死表）· 报价凭印象的利得栏已如实登记 |
| U2 批次④ aftermath + story-choice | **v2.194.0** | `engines/aftermath.js` + `engines/story-choice.js` + `tests/s3-u4-v2197.js` | **52 / 0** | 五条探针实测真病 + 一条跨模块真半写（`repair` 报 `repaired` 而 `region.lane.blocked` 仍 true）· 本条最值得记的是**把越改越乐观的推断回退**（照抄批次③ 加的两个自证槽实测恒不可达 ⇒ 删除并回退三处读数到实测值）· **同批抓到挂载面真缺陷**：四把锁 `runAll` 不转发（形式挂载 = 假绿）⇒ 一并改逐条转发；②③④ 三把孤儿 ⇒ 挂进 run.js U2 节 |
| U2 批次⑤ world-blueprint + world-seed | **v2.195.0** | `core/commit.js` + `engines/world-blueprint.js` + `engines/world-seed.js` + `engines/tool-diag.js` + `tests/s3-u5-v2198.js` | **88 / 0** | 五条探针实测真病（链内写后读看不见本链实体 / 同链重复登记去重失效 ⇒ 同一份存两份 / 链上不报在途 / **跨层半写**（世界一格未动而机制已写 settingsBus）/ 机制失败被 `catch(err){}` 吞掉 ⇒ 回执照样 `ok:true`）· `commit` 导出面 **15 → 17**（`effect` / `pending`，两个新读口各有产品消费者 `tool-diag`）· `LIMITS_EFFECT = {LIST:8}` / `CHAIN_FAULTS` 14 项 / `effectMiss` · **拒收码 811 = 见证 536 / 死表 49 / 基线 226**，三面复算 **723 / 34 / 54**（归因由逐文件回退实测）· refs **5467 → 5476** / 成员 **2554 → 2556** · 死子面 856 不变（新导出各有真消费者）· 专锁 N 段真源码破坏两向自证、真源逐字未变 · **注释纪律自纠**：`run.js` 面数归因注释初版系编造，当场用实测重写 |
| U2 批次⑥ backstage + coop（既有链面消费者收口） | **v2.196.0** | `engines/backstage.js` + `engines/collab.js` + `engines/coop.js` + `ui/panel.js` + `engines/bridge.js` + `tests/b9-coop-v2118.js` + `tests/s3-u2-v2194.js` | **93 / 0 · 97 / 0 · 67 / 0** | 两条探针实测真病（`backstage._start` 结算失败仍发 `settled` + 回报 `ok:true` ⇒ 悬浮球与投影缓存被骗 / `coop.confirm` 回执与世界写入分属两笔 ⇒ `receipt-failed`·`receipt-threw`·`no-receipt-face` 三态各留「世界已改而回执 0」或「永久谎报已确认、不可自愈」）· 修法：失败走新事件 `backstage:failed` 且返体如实 `ok:false`；回执登记搬进同一笔 `coop:confirm`（`collab.enqueue` 新增 `opts.draft`，嵌套只推内存、探针 D 三条实测）· 新码 `need-receipt`（走见证）+ `enqueue-threw`（入死表），旧三码随路径退场 · 顺带关掉「`coop.confirm` 事务外调 `enqueue` 穿透 exec 沙箱」口子 · `STATE_EVENTS` 11 → 12 |

U9 的交付口径（按本文件开头那套验收标准逐条应答，不靠「文件存在」）：

- **源码契约**：九项取数各有导出（`versions` / `rejectCodes` / `moduleRegistry` / `deadSurface` / `hostStatus` /
  `staleBaselines` / `worktree` / `howLines` + `build` / `print` / `selfTest`），导出面由 A1 逐字锁定。
- **正向测试**：B 组 11 项（三方版本一致、恒等式为平、取法九行、打印面含只读声明 …）。
- **负向测试**：N 组 18 项，全部在**内存副本**上做真源码破坏并两向自证（含「工具自身两向自证」与「取法面挖空现形」）。
- **重载 / 重复 / 容量边界**：C 组逐字节不变（连调两次读数相同、取证面 8 份文件未被写）。
- **真实消费者**：`tests/run.js` 的新增节（三条断言 + 两处 `runLock`）**即是它的第一个消费者**；
  另在 `README.md` 发布段与 `docs/contributing.md` 的收口流程里作为一条可复跑命令。
- **文档现场读数**：`README.md` v2.190.0 条目 + `ITERATION_LOG.md` `R167`。
- **可复读的回归证据**：`node tools/fact-report.js`（只读）；整趟隔离回归 **通过 15907 / 失败 0**（`status: passed` · `unchanged: true`，本版提交后实测）。
- **如实边界**：本项是**读数面**工具，**不含任何自动修动作**；报告列出的八处旧基线不会因为它存在而消失。

U3 的交付口径（按本文件开头那套验收标准逐条应答）：
- **验收 ① 分钟级现形**：`node tools/loose-readings.js` —— 改探针（`tests/module-registry-ledger.json`）任一项读数后立刻报失配，**不跑全量回归**；专锁 N 组以「真源码破坏」两向自证该判据非恒真 / 非恒假。
- **验收 ② 报四件事**：失配逐条给**文件 / 行号 / 读数类型（形态）/ 真源**（专锁 A 组逐字锁定这四个字段）。
- **验收 ③ 新增无登记即红**：反向漏网判据（**字段真存在于已登记探针 + 站点文件路径也匹配**）抓出族外新出现的同类散装点 ⇒ 报 `unregistered-loose-reading`。
- **验收 ④ 表不得成为第二真源**：表里出现 `want` / `value` / `truth` 类字段 ⇒ `value-in-table` 当场报红；真值一律现取探针（专锁 N8 / N8b 两向自证）。
- **如实边界**：只覆盖「族外测试文件里写死且真值可由探针现取」的形态；**产品源码内的散装读数不在本项范围**，沿革叙述里的旧数字不算失配（不加宽泛正则）。

U4 的交付口径（同上）：
- **源码契约**：四个生命周期字段（`purpose` / `nextConsumer` / `reviewAfter` / `disposition`）+ **6 项**新导出（`REVIEW_WINDOW_MINOR` / `NEXT_CONSUMER_OF` / `parseVersion` / `compareVersion` / `reviewAfterOf` / `staleReviews`）—— **导出面 19 → 25**（`require` 键集实测）；生命周期四项字段由专锁 A 组逐条锁定。
- **验收 ① 新增导出无登记即红**：承 O8 原判据（`unregistered` 一档），O8 门禁 38 / 0 仍全绿。
- **验收 ② 超期条目进清单并可在诊断面列出**：`staleReviews()` 是**纯函数**（可就地注入「现在」，专锁 N 组把窗口推后 ⇒ 137 / 137 全超期现形，**证明它算的不是恒空清单**）；面板侧实机**未验**（无头回归不装载 `ui/panel.js`）—— 如实登记，不宣称已接诊断面板。
- **验收 ③ 四个新引擎的每个导出都有明确去向**：`nextConsumer` **按形态派生**（73 条 settings-registry-only 的去向统一为「面板该模块的设置区（读口 → 控件）」），不是逐条手写散文。
- **验收 ④ `应删除` 的真删或改保留给理由**：本版 `disposition` 全 `keep`（现场 0 条 `应删除`），该条由专锁 N5 / N5b 盯着 —— 一旦有人标 `应删除` 却不删，红灯。
- **如实边界**：复查期**只判「到没到点」**，不判「该不该删」；下一个窗口 v2.196.0 需人工回头处理那 73 条。

## 提醒：本文件不宣称任何一项已交付

U1–U9 全部为 **proposed**。任何一项要转为已交付，须同时给出：源码契约、正向测试、负向测试、
重载/重复/容量边界、真实消费者、文档现场读数、可复读的回归证据；涉及 UI 或宿主的还须追加真实宿主证据。
只有「证据文件存在」或「挂进 run.js」**不构成**交付。