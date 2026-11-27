# 承诺面裁决：五条「只在注释里活着」的名字，哪三条能关、哪两条不能

> 对应门禁：`tests/promise-face-v2605.js`（GNS 面，v2.605.0 立，v2.607.0 扩到 32 条判据）
> 本轮读数：幽灵 9 · 真缺口 2 · 已关 5（history 4 / testSide 1 / 占位 2）· 注释点名 534
> 本文只做一件事：把「注释里以调用形态点名、而代码面零出现」的五个名字**逐条读到源码层面**，
> 给出「为什么这条能改注释关掉、那条不能」的理由，以及**什么条件下应当改判**。

## 一、结论先行

五条 `claim` **不是同一种东西**，分成两类：

| # | 名字 | 位置 | 一句话事实 | 裁决 | 版本 |
|---|---|---|---|---|---|
| 1 | `onCommit` | `core/commit.js:710` | JSDoc 详述「链提交后钩子 + 漏账进 faults」，`chain()` 体一次没读 `o.onCommit` | **不关**（行为承诺，需产品判断） | — |
| 2 | `effectPending` | `core/commit.js:474` | 注释说「`effectPending()` 读它」，导出表无读口 —— 有写无读 | **不关**（API 面欠账，需产品判断） | — |
| 3 | `undoTurns` | `engines/source-reconcile.js:5` | 是 npc-life 那台的 API；本仓对应物叫 `undoFrom` | **关**（归属欠标） | 2.607.0 |
| 4 | `exclusive` | `engines/defer-token.js:17` | 是 dsh-toy 的 API；本仓对应物叫 `serial` | **关**（归属欠标） | 2.607.0 |
| 5 | `sizeAll` | `engines/storage-forecast.js:63` | 本仓从来没有这名字；`totalBytes` 属 `store.storageStat()` | **关**（改名） | 2.607.0 |

一句话分界：

- **①② 是「注释承诺了一个没有的行为」** —— 补上就改行为，删注释就是撕掉一句已经写进契约的设计判断，两边都是产品决策，门禁**不得自己关**。
- **③④⑤ 是「注释提了一个别处的名字，却没说是别处的」** —— 名字没错、实现也有，错的是**归属**。治法只有给注释补主体（或换成真名），**零行为影响**。

由此得到一个反直觉的结论：**「只在注释里活着」这件事，一半是真缺口，一半是标点问题**。不分开，就只剩「幽灵 14」这一个数，而 14 不能作为任何行动的依据。

## 二、它们为什么曾被归成一类

门禁的判据只有一句：**注释里写成 `` `name(` ``，而这个 `name` 在产品代码面零出现**。

对这句话来说，五条完全同形。要分开它们，**只能去读源码**——判据本身没有这个能力，也不该有（见第六节）。所以本轮的产出不是新判据，是一份**裁决 + 三条注释修**，然后把三条已关的登记进 `RESOLVED` 表，让门禁能自证「关掉了」。

## 三、逐条

### 1. `onCommit` —— 不关（行为承诺）

**源码事实**（`core/commit.js`）：

- 710-716 行的 JSDoc 写得极具体：`onCommit(scope)` 在**链事务提交之后**调用（账外的邀约落库归它）；链**自己**不知道任何模块的写口，是消费方在这里说清「本链的邀约谁落库」；它返回 `{passed, failed, pending}` 时，本面据此把邀约落库的漏账记进 `faults` —— **世界提交了、邀约没落**是两种事实，读数上必须分得开。
- 715 行 `@param {{opId?, site?, steps?, fn:function, onCommit?:function}} opt` —— 类型面已经把这个参数当成契约的一部分。
- 718 行起 `function chain(opt)` 的**函数体开头只判 `typeof o.fn !== 'function'`**，全文没有一处读 `o.onCommit`。

**为什么不关**：

- **补实现 = 行为变更**：`chain()` 的提交后钩子从今天开始**生效**。钩子抛错算不算链失败？钩子与 `faults` 归因谁先落？钩子写库失败能不能回滚已提交的世界？（答案是不能——所以它是「漏账」而不是「回滚」，但这条要写进契约。）
- **改注释 = 撤承诺**：那 7 行 JSDoc 里真正值钱的不是名字，是那句「**世界提交了、邀约没落是两种事实，读数上必须分得开**」。这句判断本身成立，只是没人实现。删掉它，等于把一个已识别的失败模式从文档里抹掉。

**改判触发器**（满足其一即回来改判）：

1. 任何调用点开始传 `onCommit`（真需求出现）⇒ 补齐实现，`claim` 转实装。
2. 定下「本仓不提供提交后钩子」⇒ 把 JSDoc 改成**否定式**（写明「不提供，账外落库请自行在 `chain()` 之外完成」），并注明为什么当初考虑过。

### 2. `effectPending` —— 不关（API 面欠账）

**源码事实**（`core/commit.js`）：

- 474 行：`/** 已做而未随链提交的副作用（链中止时登记；effectPending() 读它）。**不自动重放**。 */`
- 475 行紧跟 `function markPending(c, reason, persistReason)`，478-481 行注明它是「**唯一落盘点**」「此处**不早退**」。
- 导出表没有 `effectPending` —— **有写无读**。

**为什么不关**：

- **补读口 = 新增一个对外 API 面**。而且要想清：读回来给谁看（面板？诊断？），要不要带条数与原因分布，要不要按站点聚合。
- **改注释 = 承认「登记了但没人读」**。这在工程上是可接受的（pending 记账本身有价值，`stat` 里有计数），但必须写成肯定句：「登记后不提供明细读口，只计次」，而不是留着 `effectPending()` 这个名字让人去找。

**改判触发器**：

1. 诊断面板需要列 pending 明细（条数 / 原因 / 站点）⇒ 补读口。
2. 决定「pending 只作内部计数」⇒ 注释改成否定式，并把 `stat.pending` 的口径写清。

### 3. `undoTurns` —— 已关（attribute，v2.607.0）

**源码事实**：

- `engines/source-reconcile.js:4-5` 原写：缝合来源 npc-life `world-service.js`（`capture` / `current` / `reconcile` / `resetBaseline`）与 `timeline.js`（`proposeTurn` 纯函数事务 / `undoTurns(fromIndex)`）。13 行：「本模块补的是**撤销**这一半」。
- 本仓 `WA.timeline` 的导出表（`engines/timeline.js:179`）只有 `SOURCE_ID_KEY, hashText, messageHash, ensureMessageId, sourceRef, captureRange, digestRefs, auditRefs, refsToConversation, unionRefs, chatId` —— **没有 undo 面**，这点当时判得对。
- 但本仓**有**撤销面，只是换了名：`engines/source-reconcile.js:141` `function undoFrom(timeline, fromIndex)`，271 行已导出。语义同源：取 `turns[from].before` 整快照回退（不做逆序补丁），`revoked` 回带给调用方。

**误在哪**：注释里那个 `timeline.js` 是**上游那台**，而本仓也有一台同名文件。读者在 `source-reconcile.js` 里看到 `timeline.js`，第一反应是本仓的 `engines/timeline.js`，然后去那里找 `undoTurns` —— 当然找不到。

**改法**：把主体写进同一行（`**该项目的** timeline.js`），并显式指出本仓落点 `undoFrom(timeline, fromIndex)`，外加一句「主体别认错：这里的 `timeline.js` 是 npc-life 那台」。

### 4. `exclusive` —— 已关（attribute，v2.607.0）

**源码事实**：

- `engines/defer-token.js:15-17` 是一段「同名形状在**设备侧**已被别的项目独立验证过」的旁证：dsh-toy `src/runtime.ts:39-44` 的 `StopTimer{token, timer}`，`scheduleStop` 里先比代际，不符即早退；「全部传输操作再经 `exclusive()` 串进一条尾链」。
- `index.js:674` 同一典故**早就带了主体**：「v2.251.0（拓展 DT-1）：延迟任务的代际令牌与串行尾链（cf. dsh-toy StopTimer token + exclusive）」。
- 本仓的对应物是 `serial()`（`defer-token.js:26` 机制段：「`serial()` 把所有操作串进同一条尾链」，195 行已导出）。

**误在哪**：**同一句话的两处注释，一处带了项目前缀、一处没带** —— 没带的那处被读成本仓 API。补充证据：全仓 `exclusive` 的命中里，`tests/exp8-research-v2231.js:69` 那个是另一个语义（「exclusive transfer」），与此无关，说明这个词在本仓是**多义的**，不标主体只会越来越糊。

**改法**：`dsh-toy 的` 前缀 + 去掉调用括号 + 指出本仓对应物 `serial()` + 与 `index.js:674` 对齐成同口径。

### 5. `sizeAll` —— 已关（rename，v2.607.0）

**源码事实**：

- `engines/storage-forecast.js:62-68` 是 v2.270.0 的一次修复记录：第一优先级**曾读 `r.totalBytes`**，而 `store.sizeAudit()` 返回的字段叫 **`total`**；于是永远读不到，静默退到 `saveStat().bytes`（未落盘时为 0），预测器把水位记成一串 0、斜率恒 0、永远「到不了顶」，看起来一如往常地正常。
- 原注释把这个「另一支」写成了 `sizeAll()`。**全仓从来没有这个函数**（`grep -rn sizeAll` 只命中这句注释本身）。
- 返回 `totalBytes` 的是 `store.storageStat()`（`core/store.js:5213-5246` 的盘点支）；`diagBudget()`（5387）另有一处同名字段。`engines/save-health.js:84` 早就把这条教训总结成「只信 `total`（真源）；没有 `total` 才退到 `totalBytes`」。

**误在哪**：**叙述的事实（两处不同源、静默退化）一字不错，错的只是「另一支」的人名**。这种错最隐蔽——它长得像历史记录，所以每次审查都会跳过它。

**改法**：把名字换成 `store.storageStat()`，并把「盘点支在 core/store.js，返回 `totalBytes` 的是它，不是 `sizeAudit`」补上。**不写「改判记录」进源注释**：一处注释里留着错误名字只会让 R4 判据失效（这也是 `fsec` / `devSettingsHtml` 的既有做法——改判记录进本文与 ITERATION_LOG，不进现场）。

## 四、三条改法对照

| 名字 | 文件 | 改前 | 改后 | 类型 |
|---|---|---|---|---|
| `undoTurns` | `engines/source-reconcile.js` | ``与 `timeline.js`（`proposeTurn` 纯函数事务 / `undoTurns(fromIndex)`）`` | 「与**该项目的** `timeline.js`（`proposeTurn` 纯函数事务 / `undoTurns` 撤销面）」+ 主体警示 + 本仓落点 `undoFrom(timeline, fromIndex)` | attribute |
| `exclusive` | `engines/defer-token.js` | 「全部传输操作再经 `exclusive()` 串进一条尾链」 | 「全部传输操作再经 **dsh-toy 的** `exclusive` 面串进一条尾链」+「本仓对应物是 `serial()`」+ 与 `index.js:674` 同口径 | attribute |
| `sizeAll` | `engines/storage-forecast.js` | 「`totalBytes` 是 `sizeAll()` 那支的名字」 | 「`totalBytes` 是 `store.storageStat()` 那支的名字……盘点支在 core/store.js」 | rename |

三条**全是注释修，零行代码变更**。这一点由 D1（12 个归属文件在扫描前后的哈希一致）与全量回归共同保证。

## 五、为什么「不新增第五类」

一度想给这三条开一个新类别（`borrowed` / `foreign`）。最后没开，理由是：

1. **四类的划分依据是「事实的种类」**：`claim`（会被当成已存在）/ `history`（原文就是墓碑）/ `testSide`（名字在测试面）/ `placeholder`（占位形态）。这四条互斥且穷尽**扫描器能分辨的东西**。
2. 而 ③④⑤ 与 `claim` 的差别**扫描器分不出来**——它需要读懂「这一句在讲谁」。硬造一类，等于把人工判断塞进数据表，再让判据去「复算」一个人为结论。
3. 更关键：**这三条本来就该消失**。它们不是「一种新的幽灵」，而是「关得掉的那种」。给它们开类，反而会让它们长期留在表里。

所以做法是：**关掉 + 登记进 `RESOLVED`，并按「关闭方式」分两种**：

- `rename` —— 旧名是错的（拼错 / 指错支）⇒ 换成真名 ⇒ 旧名在该文件**连子串都不许留**。
- `attribute` —— 旧名是对的、主体是错的 ⇒ 旧名留下，但**不得再写成调用形态**，且必须补两列：`owner`（主体词）与 `ours`（本仓对应物），并由 R6 / R7 两条钉住「它们真的在文件里」。

## 六、门禁这轮新增了什么（32 条判据）

| 判据 | 口径 |
|---|---|
| R4（改） | 关掉后不得再以调用形态出现；`rename` 型更严：旧名在该文件**零子串** |
| R6（新） | `attribute` 型的**主体词必须在本行或上两行** —— 不能只写在表里 |
| R7（新） | `attribute` 型的 `ours` 必须在该文件的**代码面真存在** —— 不许拿一个还没写的名字当退路 |
| B10（新） | `claim` 类必须都是「行为承诺」型：`why` 里得说得出一处「代码没读 / 有写无读 / 导出表里没有」 |
| B3（改） | 四类计数 `claim 2 / history 4 / testSide 1 / placeholder 2` |
| E1（改） | 一行读数含「幽灵 9 · 真缺口 2 · 已关 5」 |

B10 是防退步的那一条：**防的是把「借名」当成真缺口混进来、再靠改注释「关」掉** —— 那不叫关，叫洗。以后谁想把一条 `attribute` 型的名字放回 `claim`，B10 会先问「你说得出哪处代码没读吗」。

## 七、复算命令

```bash
# 1) 门禁本体（应打印：幽灵 9 · 真缺口 2 · 已关 5，最后 pass (32)）
node tests/promise-face-v2605.js

# 2) 三条已关：名字还在，但不再带调用括号
grep -n 'undoTurns' engines/source-reconcile.js   # 应只有头部注释里那一处，且不带调用括号
grep -n 'exclusive' engines/defer-token.js        # 应只有头部注释里那一处 + serial() 的说明
grep -rn 'sizeAll' --include=*.js .               # 应零命中（旧名一个不留）

# 3) 本仓对应物是真的
grep -n 'function undoFrom' engines/source-reconcile.js
grep -n 'undoFrom: undoFrom' engines/source-reconcile.js
grep -n 'function serial' engines/defer-token.js
grep -n 'totalBytes: totalBytes' core/store.js

# 4) 两条没关的，注释与代码的分歧仍在（这是预期的）
grep -n 'onCommit' core/commit.js                 # 710 / 715 两处：JSDoc 与 @param，函数体不读
grep -n 'effectPending' core/commit.js            # 474 一处：说「effectPending() 读它」
```

第 4 段的两条**现在仍是分歧**，这不是遗漏：它们是第五节的改判触发器没被触发。

## 八、与邻座的关系

- **`orphan-engine-adjudication`（orphan 锁）** 判的是「这台引擎**有没有真读点**」；本面判的是「这个名字**有没有真实现**」。同一句话（「文档比实现多走一步」）的两个方向：前者管**接线**，后者管**命名**。
- **`ns-consumer-ledger`** 判 ns 读点增删；本面判注释点名的存活。三条台账都在回答同一个问题：**这份文档说的，现场还认不认**。
- 一个贯穿 R278–R282 的观察：**所有真缺口都长着同一张脸——「文档比实现多走了一步」**。区别只在这步走到哪儿：走到注释里（GNS 面管）、走到基约定里（TLX 面管：`clock.dayIndex` 0 基 vs `calendarPlan.label` 0 基 vs `undercurrent.baseDay` 1 基）、走到完成度声明里（CAL 面管）。本轮补上第四种：**走到归属上**——名字是别人的，注释没说是别人的。

## 九、改判记录

| 版本 | 改判 | 依据 |
|---|---|---|
| 2.606.0 | `fsec` → `foldSec(page, sec, label, body)`；`devSettingsHtml` → `if (!__dev) return playerSettingsHtml();` | 两条都是**拼错名/记错形态**，改注释即修（R281 GNS-2） |
| 2.607.0 | `undoTurns` / `exclusive` 归 `attribute` 并关；`sizeAll` 归 `rename` 并关 | 三条都是**归属欠标**，改注释即修（本轮 R282） |
| 2.607.0 | 新增判据 R6 / R7 / B10；R4 改为 mode 感知 | 关掉要能自证关掉了，且不许把「借名」洗成「已修」 |
