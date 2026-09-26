# -*- coding: utf-8 -*-
"""v2.104.0 文档：ITERATION_LOG.md 插入 R87 条目（在 R86 之前——条目倒序）"""
import io, sys

P = '/tmp/wa_git/ITERATION_LOG.md'
s = io.open(P, encoding='utf-8').read()

ANCHOR = '### R86 · 2026-09-27 · v2.103.0'
if s.count(ANCHOR) != 1:
    print('ABORT R86 锚点命中 %d 次' % s.count(ANCHOR)); sys.exit(1)

SEC = '''### R87 · 2026-09-27 · v2.104.0 负控制锚点的自动化审计（计划一 #2：每个锁都说自己查过了，但没人查过那些锁）

- **做了什么**：
  - `tests/negative-control-audit.js`（新，175 行）：全仓负控制锚点的**一次静态审计**。`KINDS` 四档形态（`uniform` / `non-uniform` / `unloadable` / `pending`）、`PROBLEM_KINDS` 六类（`shape` / `rel-unreadable` / `not-unique` / `impure` / `not-a-lock` / `empty-anchors`）、`hits` / `isLock`（用**段名** `function runNegative\\s*\\(` 判锁，不依赖行号）/ `listTestFiles` / `auditAnchor` / `auditLock` / `audit` / `discover`。
  - `tests/negative-control-audit-v2104.js`（新，328 行）：四段专锁 **49 项全绿**（A1–A13 静态 / B1–B13 运行时 / C1–C3 不变式 / N0–N8 负控制）。
  - `tests/run.js`：新增 section「v2.104.0（计划一 #2）：负控制锚点静态审计」，**打印四档读数**并真消费两个新模块（否则它们是孤儿）。
  - `tools/patch_o17_v2104.py`（给审计加第四档）、`tools/gen_v2104_lock.py`（生成专锁）、`tools/wire_v2104.py`（接入 run.js）、`tools/bump_v2104.py` / `tools/bump_run_ver_v2104.py` / `tools/bump_ledger_v2104.py`（升版收口）、`tools/doc_v2104.py` / `tools/doc_log_v2104.py`（文档）。
- **为什么**：
  - 本仓每版手写 25+ 条破坏锚点，而「锚点是否唯一」「判据里有没有抄锚点串（自我指涉 → 破坏会连判据一起打掉）」这些性质，此前**只有各锁自己在运行时自查一遍**。于是：① 同一套口径散落在 **61** 个 `runNegative` 里，改一处只管一把锁；② 谁都没统计过「全仓到底有多少把锁的负控制是**可静态审计**的」——**「不可审计的那部分」从来不是一个可读的数字，于是它等于不存在**。本版把它变成四个可读的数：锁 62（统一 10 / 非统一 51 / 装载不了 0 / 装载中 1）· 被审锚点 104 · 问题 0。
- **本版三处「自己身上的」真缺陷（全部是它要治的那族病）**：
  - **D1 require 环**：本锁作入口 → 审计模块装载中 → `audit()` require 回本锁（in-flight）→ 读到尚未完成的 exports（`mod.ANCHORS` 为 `undefined`）⇒ 本锁被**静默归进「非统一」档**、Node 打 4 条 circular 警告，且**归类结果取决于谁先装载**（自己跑算非统一、被 run.js 跑算统一）。处置：**加第四档 `pending`**（`require.cache` 里存在且 `loaded !== true` 即如实记档）——既不静默跳过，也不误判成 unloadable；配套 B11 断言两种运行态（`pending` 恰为 1 / 0）与 N8（往 `require.cache` 塞一个 `loaded=false` 条目，破坏版实测被静默编进「非统一」且**零问题上报**）。
  - **D2 锚点形态**：初版把 `ANCHORS` 导出成**纯字符串**，而仓库统一口径是 `{rel, txt}`。若真被归入统一档，审计会如实报 3 条 `shape`——**那不是误报，审计是对的**（A10 钉住这一点）。
  - **D3 纯度口径的结构性边界（H7）**：含**非换行反斜杠**的锚点做不了统一锚点——源码里必须写成两个反斜杠才不丢字符，而纯度判据只把真换行还原成转义形态、不还原前者 ⇒ 必然 0 命中 ⇒ 被判 `impure`。处置：这类锚点改为**按行前缀现场抓取**（`lineWith(src, needle)`——不手拼字面量 ⇒ 本文件根本不存在整体形态 ⇒ 纯度天然满足）。
- **口径踩坑（误报比漏报更费事）**：审计探针首跑报 **17 处**「字面量在本文件出现 0 次」——是**我自己的口径写错**：`a.txt` 是**解转义后**的真文本（含真换行），拿去 split 单行源码必然 0 命中。改用与 `interop-v2101` 的 N15 逐字同源的转义口径（`a.txt.replace(/\\n/g, '\\\\n')`）后得 **0 问题（10 锁 / 104 锚点全健康）**。**误报会让一把健康的锁看起来坏了**——这正是本版要治的「结论不可单点复核」的镜像。
- **影响范围**：`tests/negative-control-audit.js`、`tests/negative-control-audit-v2104.js`、`tests/run.js`、`index.js`、`manifest.json`、`tests/reject-lock-v2780.js`、`tests/reject-code-ledger.json`、`tests/module-registry-ledger.json`、`tests/dead-export-ledger.json`、`FOUR_VERSION_PLAN.md`、`ITERATION_LOG.md`。`tools/*.py` 不入库。
- **门禁结果**：`node tests/run.js` → **通过 8806 / 失败 0**（v2.103.0 基线 8753/0，+53）；专锁独立跑 **49/0** 且两种运行模式（入口 / 被 require）都 49/0、STDERR 零警告；`tests/export-contract.js` → `ns= 109 members= 694 chars= 8296`（**逐字未变**）；`tests/reject-code-gate.js` → 产品文件 116 / 内联拒收码 362（见证 124 / 死表 5 / 基线 233，**三者全不变**）；`tests/test-surface-gate.js` → 文件面 **90** / 锁 **85** / 可达 90 / spawn 4 / 内联 2 / 孤儿 **0**；`tests/module-registry-gate.js` → 文件 112 / 命名空间 120 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0；`tests/dead-export-gate.js` → dead 454 / uiDead 4 / dataOnly 169 → 169；`tests/field-liveness-gate.js` → 写侧越界 1 处（`ui/panel.js innerHTML`）/ 读侧 0 处；三本台账 version=2.104.0。
- **可复用的判据**（编号续 R86）：
  - (60) **反斜杠锚点只准现场拼接**：含非换行反斜杠的锚点若手拼字面量，① 极容易差一个字符（本版实测把 `\\(/` 手写成 `\\(\\)` ⇒ 0 命中），② 就算拼对，纯度判据（只还原真换行为转义形态）也必然判它 0 命中 ⇒ `impure`。**正解是按行前缀从目标文件抓取**。
  - (61) **「正在装载中」必须是独立可读的一档**：把 in-flight 文件归进「非统一」等于**分类错了却没有任何一条读数说它错了**；而三档之外若没有第四档，同一个文件会因为「谁先 require」而得到两种形态。
  - (62) **审计的旁证要能被观测**：破坏版的副作用（Node 的 circular 警告）应当被**收成一条断言**（临时接管 `process.emitWarning`），既不污染回归输出，又证明守卫确实拦下了一次真读取——「守卫存在」与「守卫起作用」是两件事。
  - (63) **同一把锁的两种运行态都要断言**（入口 `pending=1` / 被 require `pending=0`），否则「归类不依赖运行顺序」这句话没有被证明过。
- **提交**：`（见本版提交）`。

'''

s = s.replace(ANCHOR, SEC + ANCHOR)
io.open(P, 'w', encoding='utf-8').write(s)
print('OK ITERATION_LOG.md 插入 R87 条目')