# Agent Note: EXV7-8 世界自传（分章压缩）

Status: implemented

## Problem

`chrono.chronicle()` 答「逐条发生了什么」——它是扁平时间序，长局会滚成几百条；
`worldDiary.build()` 答「这几轮镜头外发生了什么」，只覆盖最近几轮、向前滚动；
`worldBriefing.view()` 答「这一轮各引擎吃进几笔」，是单轮流水。

三者都不回答**「整局跑下来，世界分几个阶段、每个阶段留了什么」**。长局需要的不是再多一份
逐条读数，而是一层**压缩**：把扁平列表压成有边界的分章。这一层此前一格都没有。

## Decision

新增 `engines/world-autobiography.js`，导出七口
（`getSettings / setSettings / autobiography / exportText / buildBlock / stat / reset`）。

**唯一判据来源**：条目集合与「哪些不许进」全部走 `chrono.chronicle`（`hidden` 过滤、排序、
上限判据一处都不重写）。本模块只做分章，不做第二份聚合器。

**规格没写的一条边界，实现时必须自己定**：`chrono.chronicle()` 的行**不带 `round`**
（行形状 `{at, kind:'fact', label, title, text, refs}` —— 它刻意把内部轮号从读数面剥掉）。
而「每 N 轮一章」只能用轮号做减法；用 `at` 折轮需要换算率，本仓没有、也不许造。

故 `roundIndexOf()` 从**真源** `store.chronicle` 按 `at` 建索引。冲突口径：同一 `at` 挂两条
不同 `round` 时，该时刻的轮坐标**整格判不可信记 `null`** —— 宁可少一个轮标签，也不给一个错的
轮号（轮号一错，章的先后就全错）。

**退化如实报**：一条轮边界都找不到而长局又超过 `volumeChapterSize` 时，按条数切章，
并把 `chapterMode` 报成 `by-volume`、`degraded:true`，`note` 里当场说破「这不是按轮切的」。
真实写入方（`backstage.js:684/801`、`regional.js:162`）大量条目不带 `round`，
故这条退化路径会被**频繁**触发 —— 是已知上限，不是缺陷，报在 `roundMisses` 里。

**三种「没得看」分开报**：`disabled`（模块关着）≠ `chapters:0`（一条归档都没有，`ok:true`）
≠ 三路源故障（`chrono-absent` / `chrono-threw` / `chronicle-refused`，各自独立码）。

**容量用 `droppedChapters` + `droppedLines`**，不冒充拒收码（沿用 EXV7-7 的 `maxPeople` 教训：
`reason:` 是拒收码保留字，`reject-code-gate` 会把任何 `reason: '<码>'` 当拒收码扫）。

## Alternatives considered

**① 往 `chrono` 的 `chronicle()` 里加 `round` 字段。**
拒绝了：那会改变一个既有读口的行形状，而 `chrono.buildBlock` 与三把既有锁都逐字钉住它；
更重要的是「读数面剥掉内部轮号」是它当初有意的设计（避免调用方按轮号重逢）。

**② 用 `at` 差值折算轮号**（例如 `round = floor((at - base) / perRound)`）。
拒绝了：轮与 `at` 之间没有换算率，造一个就是「凭空的尺子」。本仓在 `agenda` 上付过代价
（真实时间与剧情时间混算过一次，代价是离线间隔被抹平）。

**③ 把 `worldDiary` / `worldBriefing` 的内容并进章正文。**
拒绝了：它们覆盖的是「最近几轮」与「单轮流水」，**不属于任何一章**；并进去会让同一段时间
出现两条来源，且章边界对它们无意义。改为尾部附记，各自缺席各自如实报。

**④ 四个导出（`buildBlock` / `stat` / `reset` / `setSettings`）先记进死导出账本。**
拒绝了：本仓迭代主线就是「导出了 API 但全库零调用点」。记进账本等于承认它们只是导出给人看。
改为逐个接真消费方：诊断节读出 `stat`、面板读数仪清零表收 `reset`、设置页保存走 `setSettings`、
注入源消费 `buildBlock`（默认 **false**，不给老用户凭空多出约束）。账本自然从 1182 落回 1178。

## Consequences

**做对了**：长局第一次有「阶段」这一层；导出面给的是可复制的 Markdown，不写盘、不下载；
`hidden` 只计数不进正文；无文本条目如实留空（`· 河涨`），不补写、不润色。

**代价 / 已知上限**：真实归档多数条目带不动轮号，故 `by-volume` 退化会被频繁触发；
`roundMisses` 只统计本次取到的条目，不是全库统计。这两条都如实回带，不在 UI 上藏。

**必须记住的边界**：`MODULE_EXPORTS` 漏登记过一次（首跑 `export-contract` 里整个
`worldAutobiography` 命名空间缺席，而专锁是绿的）——「漏登记」这件事专锁咬不住，只有契约面
与死导出面看得见。专锁 A24 现在点名钉住它。

**同批欠账**：`reject-recovery` 的 `REJECT_FACE` 快照落后 10 条（3 条本版新码 + 7 条历史欠账），
本轮按现场复算一次收敛。同一形态本仓已栽过五次（v2.203.0 / v2.209.0 / v2.221.0 / v2.222.0 / v2.231.0）。

## Verification

- `tests/v7-world-autobiography-2292.js`：**pass (79)**（A0–A24 / B1–B21 / C1–C6 / D1–D17 / N0–N9）
- 三条源故障码在 `tests/reject-v2780.js` 各带可执行见证（摘掉 / 抛错 / 返 `ok:false` 三种形态）
- `export-contract`：`worldAutobiography` 七口全进契约面，`FROZEN2800` 回填 25969 → 26059 字符
  （294 命名空间 / 2318 成员），与产物逐字相等
- `reject-code-gate`：1313 码，见证 746 / 死表 50 / 基线 547，无新增静默码
- `dead-export-gate`：1178 / 6 / 551（四个导出接线后回到基线）
- `reject-recovery-lock`：149 / 0（`REJECT_FACE` 快照补齐 10 条）
- 其余定向门禁全绿（见 `ITERATION_LOG.md` R234「验收与边界」）
## Related V8 boundary
[V8 只读汇流、兑现与归档边界](2026-11-03-v8-projection-archive-boundaries.md) 扩展此决定的消费链，不替换原有 owner 与可见性口径。
