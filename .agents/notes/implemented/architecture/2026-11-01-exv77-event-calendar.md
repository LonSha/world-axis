# Agent Note: EXV7-7 事件日历（事件钟未来轴 + 承诺台账）
Status: implemented
## Problem
「未来会发生什么、谁承诺了什么」在 v2.290.0 的现场没有一处能一屏答出来，两侧各有缺口：
- **事件侧**：`engines/events.js` 有 `active()`（状态清单，按 `priority` 降序）与 `due()`（只报已到点的）。两者都不回答「**按时间先后**，接下来会陆续到点什么」——`active()` 的序是优先级，`due()` 的集合只有到点的。任何想问这个问题的消费方（面板、诊断、导出）都只能自己遍历 `rows()`、逐条判 `kind`、自己算 `at <= now` 再排序 —— 那是每个消费方各自重算一遍，正是本仓反复治理的「两处各说一遍」。
- **承诺侧**：更糟。`life.buildBlock()` 里承诺只以短句出现（`kind「text」`），只取每人前 `maxItems` 条、只取 active、**不报 `due`、不报谁许给谁**。于是「谁欠着几笔、哪笔已经到期、五类里哪类一条都没有」在注入面与界面上都是空白的。
把两侧硬合成一个「未来时间轴」的诱惑很强（`plans/V7_MASTER_PLAN.md` 的 EXV7-7 规格原文就写「合并成未来时间轴」），但两侧的时刻**不在同一把尺子上**：`events.scheduledAt` 一律由 `clockNow('events')` 产生，`life` 的承诺只有调用方给的 `due` 窗口。**两者之间没有换算率。**
## Decision
在两个源模块里各建一个只读投影，**不做合并器**，由展示层并列呈现：
- `events.timelineView(opts)` — 事件钟上的未来轴。返回 `{ok, now, clock:'events', total, cap, truncated, dropped, timedCount, untimedCount, dueCount, blockedCount, byKind, byStatus, rows, untimed, note}`；行含 `at/due/blocked/condition/unknown/nextAt/remainRuns/intervalMs/runs/canAct/ref`。排序：`at` 升序 → `priority` 降序 → `id` 升序；`untimed` 单列按 `priority` 降序 + `id` 升序。
- `life.commitmentsView(opts)` — 承诺台账。返回 `{ok, now, total, overdueCount, people, peopleTotal, cap, truncated, dropped, byKind, rows, note}`；`rows` 逐人给 `{person, count, shown, truncated, items:[{kind, target, text, due, overdue, status, at}]}`。`byKind` **恒含五个键**（`COMMITMENTS.forEach(k => byKind[k]=0)`），缺的报 0。

三条硬口径：

1. **不猜时刻**。`hasAt = at !== null && String(x.kind) !== 'conditional'` —— `conditional` 没有确定时刻，一律进 `untimed`，绝不塞进时间序给一个假日期。「条件是外部事实，本模块拒不猜它哪天成立」是判据（写在同一行代码里），不是文案。
2. **只报事实，不代判处置**。`due = hasAt && status === 'pending' && at <= t` 只是比对；逾期该怎么处置归 `tick` / 调用方。`commitmentsView` 的 `overdue = due !== null && due <= t` 同理。`secret` 不因是秘密就在作者面被藏起 —— 这是作者面/诊断面读数，藏起来等于让作者看不见自己写的秘密；对玩家的可见性裁剪是别的模块的事。
3. **只读**。不 tick、不推进状态、不改 `status`、不写盘。两读口各留 `timelineReads` / `commitmentReads` 计数（零计数 = 调用没发生，让「点了没反应」与「点了但结果为空」可分）。

**两条来源在展示层并列，不合并成一个计数**：诊断 `secCalendar()` 里 `events` 与 `commitments` 是两个自执行块，面板是两枚按钮（`wa-cal-events` / `wa-cal-commit`）。合并之后「事要跑」和「债要还」哪一边坏了就再也分不开。
## Alternatives considered
- **改 `engines/agenda.js`，把这两个源补进它** — `agenda` 已经是「未来时间轴」的五源聚合器（`longline/commission/diplomacy/freight/aftermath`）且**恰好缺**这两个，看上去正是该补进去的地方。不采用，四条硬约束加一条口径冲突：① `EXPORT_COUNT = 9` 与尾部 `if (_exported !== EXPORT_COUNT) throw`；② `tests/run.js` 冻结串逐字含 `agenda:getSettings overdueList setSettings sources stat upcoming`；③ `sources().length === 5` 被三把既有锁逐字钉住（`s3-b2-e2-v2182.js` B14 / `s3-b2-e5-v2182.js` B27 / `s3-b2-o3-v2182.js` B37）；④ 面板与诊断已有「五源可用性」文案。更要紧的是 `agenda.upcoming()` 先调 `storyNow()`，拿不到剧情钟就 `reason:'no-story-clock'` **整表拒算** —— 把事件钟的时刻塞进去必然误导读者。唯一能绕过这四条的做法是把 `sources()` 扩到七源，那要同批改三把锁的判据与两处文案，为一项交付动三处既有断言，收益不抵风险。
- **在 events 或 life 任一侧建「合并时间轴」，读另一侧的数据** — 要么让 `events` 去读 `life` 的存档结构（跨模块读别人的私有形状，改一次就断），要么把事件钟时刻折算成剧情日（折算率不存在）。都不采用。
- **给 `conditional` 猜一个「大概什么时候」** — 猜出来的日期会被下游当事实用，而它没有任何依据。本仓对「未知时间冒充现在」已有明确禁令，此处同理，因此不采用。
- **两枚按钮合成一枚「未来概览」** — 合并后单侧坏掉时，界面上只剩一个数字变小，看不出是哪一边。分开发和「两种「没得看」必须可分」同一条纪律，因此不采用。
- **把容量截断写成 `skipped.push({ reason: 'maxPeople' })`** — 这是本轮实际写过的版本，被 `reject-code-gate` 抓红：`reason:` 在本仓是**拒收码保留字**（`CODE_RE = /reason\s*:\s*'([a-zA-Z][a-zA-Z0-9_-]*)'/g`），于是「读成功了但只列了前 N 个」被当成第 1312 个拒收码，要求把正常截断登记进**拒收码死表**。登记等于把「截断」写成「拒收」，概念污染，且以后每个读口写个 `reason` 就得跟一条死表账。改为 `truncated + dropped`（与 `engines/bonds.js:88,113` 及事件轴同词表），并用专锁 A14 把「本读口的拒收码只许 `disabled` 一个」两向锁住。
## Consequences
- **收益**：「接下来先后会到点什么、哪些到点了没人认领、哪些压根没有确定时刻」从「逐消费方遍历 rows 自己算」变成一次调用；「谁欠着几笔、哪笔到期、五类各几条」第一次可直接读，且 `cooperation: 0` 这种「这一类没有」与「这一类不在词表里」（代码 bug）可分。两读口零写盘，事件行的 `status` 仍是 `pending`（读不改状态），面板点击与诊断节同源。
- **代价与已知上限**：两份投影并列意味着读者要自己看两栏，不存在「世界未来总数 = 事件 + 承诺」这一个数字 —— 这是刻意的，那个数字只能靠折算得到，而折算在本仓付过代价（`agenda` 注释原文：「真实时间与剧情时间混算过一次，代价是离线间隔被抹平」）。`repeat` 事件到点后的 `nextAt` 报 `null`（下一跳要等 claim 落地才定），不提前写成已知。`timelineView` 的 `at` 一律是**事件钟**毫秒（`clock: 'events'`、`day` 恒 `null`），不做剧情日换算。
- **一次性清掉的欠账**：`FROZEN2800` 回填 9 个命名空间（`events.timelineView` / `life.commitmentsView` 为本版；`sediment.placesView` 为 v2.290.0 漏账；`worldBriefing` / `intentBoard` 为 v2.289.0 漏账；`bonds` / `fondness` / `intel` / `relationTemp` 为更早欠账）。293 命名空间 / 2311 成员。欠账能攒住是因为抓它的断言「本次运行产物 == FROZEN2800」只在全量 `run.js` 里执行，而 V7 纪律 12 让全量一直没跑。

## Verification
专锁 `tests/v7-event-calendar-2291.js`，**pass (62)**：
- A0～A15：两导出与两实现锚点、`clock: 'events'` 声明、`String(x.kind) !== 'conditional'` 作为判据、五类词表初始化、诊断 `secCalendar` 定义 + 挂载、两读口真消费、两读口各有缺席分支、面板渲染 + 绑定四件、`UI_BINDINGS` 登记、**A14/A15 拒收码纯度与容量词表**。
- B1～B12：事件轴运行时 —— 四 kind 分列、`byKind` 逐类、时刻升序 + `due` 标记、未到点不标 due、`dueCount`、`conditional` 的 `at=null/unknown/blocked` 与进 `untimed`、`remainRuns`/`nextAt`、`canAct === (status==='pending')`、终态默认不进未来轴、`includeTerminal` 可复盘。
- C1～C11：承诺台账运行时 —— `total`/`people`、五类恒全且 `cooperation:0`、`overdueCount`、逐人条数、逾期事实带 target、未逾期保留 `due`、`secret` 可见、稳定序、查无此人 ⇒ 空台账、无到期 ⇒ `due=null` 且不标逾期。
- D1～D12：只读与边界 —— 两读口连读零写盘、两读口留读数、事件行状态仍 `pending`、三处容量截断、两模块关闭态各自 `disabled`、空世界 `ok:true/total:0` 与关闭态可分、空台账仍报五类、**`dropped` 是实数**。
- N0～N10：真源码破坏两向自证 —— 摘掉 `conditional` 排除条件则 `timed=1 untimed=0` 当场现形（N0/N1）、负控制不改动真源码（N2）、原版同判据仍真（N3）、摘掉五类词表初始化则 `byKind` 只剩 1 个键（N4/N5/N6）、摘掉两个导出则 API 真消失（N7～N10）。

**未执行完整 `node tests/run.js`**：V7 纪律 12 在效期（EXV7-1～9 全部交付前禁止全量回归）。本轮验证为定向门禁集合，清单见 `ITERATION_LOG.md` 的 R233「验收与边界」。