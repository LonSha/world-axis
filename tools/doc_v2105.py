#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.105.0 收口之三：文档（FOUR_VERSION_PLAN.md 勾选块 + ITERATION_LOG.md 的 R88）。
纪律：锚点恰中 1 次；比较值与消息文本同批（文档里的读数一律取自本轮实测）。"""
import io, sys

ROOT = '/tmp/wa_git'

PLAN_ANCHOR = '## 完成纪律'
PLAN_BLOCK = '''## v2.105.0 门禁超时熔断（计划一 #3）
- [x] 验收（gate-timeout，v2.105.0）：取值面 `tests/gate-timeout.js`（新模块）＋专锁 `tests/gate-timeout-v2105.js` **53/0**（A 静态面 A1–A16 / B 运行时 B1–B13 / C 不变式 C1–C2 / N0–N10 负控制，负控制一律「真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据」+ 锚点工具两向自证）；全量回归 `node tests/run.js` → **8867 / 0**（v2.104.0 基线 8806/0，**+61**）；出口面契约 `ns= 109 members= 694 chars= 8296`（**逐字未变**——本版全部落在 tests/ 侧，产品面零扩张）；死子面 dead 454 / uiDead 4 / dataOnly 169（**零新增**）；拒收码 **362**（见证 124 / 死表 5 / 基线 233，**三者全不变**）；模块注册 文件 112 / 命名空间 120 / 装载期边 23 / 硬边 0 / 调用期引用 44；测试文件面 **92 文件 / 87 锁 / 可达 92 / spawn 4 / 孤儿 0**；dup-decl 扫描 211 文件 / 顶层声明 2390 / 重复 0；六道独立门禁全绿；三本带版本同源判据的台账 version=2.105.0。
- [x] 本版读数（`discover()`）：**现场调用点 10 / 武装点 10 / 预算处 10（三者相等）· 统一预算 96000ms · shell 保险丝 240s · inline 上限 10800ms · 形态 {spawn 8, spawn+shell 1, spawn-only 1} · 自洽（一套预算）· 对照门禁 11 道（含 1 条对照）**。
- [x] 阈值口径（**否决计划原文的 3s / 20s / 5s**）：先实测、再定阈值。本版实测 —— `export-contract` 568~595ms · **`dead-export-gate` 12022~13001ms（本仓唯一 10s 级门禁）** · `module-registry-gate` 160ms · `field-liveness-gate` 402ms · `reject-code-gate` 361ms · `test-surface-gate` 683ms · `dup-decl-gate` 511ms · `isolated-runner-lock` 2721ms · `inventory --json` 605ms · `tar --exclude=.git` 96ms · `node --check tests/run.js` 120ms。计划里的「export-contract 3s」只有 **5 倍**余量；「全量 20s」与实测 **6~8 分钟**差一个量级。⇒ 预算统一取「**最重那道门禁的实测 × 8**」= **96000ms**（对 0.16s 的门禁是余量过剩——过剩是安全的，紧贴不是）。
- [x] 内容：① `tests/gate-timeout.js`（新模块，24 导出）——「门禁超时」的**单一真源**：`GATE_TIMEOUTS{spawnMs:96000, shellMs:240}` / `RATIOS{spawn:8,inline:4,heavy:4}` / `ARMED_SITES`（10 条：key + **现场唯一锚点** + mode + kill + shellFuse + pipe）/ `GATES`（11 条实测证据）/ `coherence()`（不许两套预算 + 站点表与武装表不许各说一套 + **含管道必须有保险丝**的客观规则）/ `spawnOptsFor` / `withTimeout` / `tailLines` / `formatHangBlock`（卡死取证块：哪一道门禁、超了多少、末 N 行 stdout）/ `parseCallBlocks`（**括号平衡**切块，先剥字符串字面量——tar 那句的命令串里有个永不闭合的 `(`）/ `findSiteBlock` / `siteStats`。② `tests/run.js`：**10 个 spawnSync 调用点全部武装 `timeout: 96000`**（出口 5 处另给 `killSignal: 'SIGKILL'`；tar 那句改写成 `timeout -k 5 240 tar …`——**必须带 `-k`**，因为它在管道里，不带给宽限只会杀写端而读端照挂；`node --check` 处如实记档 `spawn-only`：spawnSync 的 timeout 只覆盖 `node` 本身，**读文件读到一半的阻塞不可中断**），并新增 section 打印现场读数 + **逐站点**核对 + 调专锁。③ `tools/patch_v2105_a/b/c/d.py`（取值面预算统一 90000→96000；run.js 8 处武装 + tar 改写 + --check 注释；tar/--check 两处补武装；模块补站点锚点表与解析器）、`tools/fix2105_d.py`（还原占位符替换的连带伤害）、`tools/sec2105.py`（接入 run.js）、`tools/bump_v2105.py` / `tools/bump_run_ver_v2105.py`（升版）、`tools/doc_v2105.py`（本文档）。
- [x] 病灶的真实形态（本版立足点）：**兜底存在≠风险被看见**。此前 run.js 唯一兜底是外层 `isolated-runner` 的 10 分钟 SIGKILL，而全量回归实测 6~8 分钟 ⇒ **余量不足一倍**；被强杀时日志里只剩一行 `Status: runner-failed`：「卡在哪一道门禁、卡死前最后说了什么」**全部丢失**。故本版的判据不是「加了 timeout」，而是把三件事变成**可判定的读数**：预算值、现场调用点数、以及卡死时的取证块。
- [x] **本版自测期连撞的五类「自己身上的」缺陷（全部留痕，且都是它要治的那族病）**：① **D1 定位口径**——专锁初版拿模块里的 key 去 run.js 定位站点，而那些 key **只活在模块里**、run.js 一个字都没有 ⇒ 十处全报 `site-missing`、判据从第一天起恒假。正解：用 run.js **现场唯一**的调用行行首片段作锚点，且**逐站点**判断（「别处还有 timeout」不构成该站点已武装——专锁里用 N1b 专门证明全局存在性口径会漏报）。② **D2 破坏不彻底**——`str.replace(a,b)` 在 JS 里只替换**第一处**，于是「10 处预算全改成 10ms」实际只改了 1 处，区间判据只现形 1 条 ⇒ 断言恒假。正解：`split/join` 或带 `g` 的正则，并把「破坏是否真发生」也数出来。③ **D3 标签依赖**——「外部命令要另有 shell 保险丝」原先看的是 `mode === 'spawn+shell'` 这个**标签**，把标签抹平（`mode→'spawn'`）判断就**无声逃逸**；而模块头自己写着「口径是行为读数，不是字形比对」。正解：看**客观形态**（命令串里有没有管道），专锁 N4 在破坏副本上验证这条规则真会现形。④ **D4 观察位取窗口**——选项探测必须在**调用点之后的整个块**里取，不能只看固定几行（本仓三个调用点带跨行注释，options 落在调用行之后第 11~12 行；取窗口的判据会在**真源码上假红**）。⑤ **D5 锚点包含被测值**——`negative-probe-v2410` 那一行初版把整行（含 `timeout: 96000`）当锚点 ⇒ 一旦预算被改动（**正是本锁要守的东西**）锚点先失效、报出来的是 `site-missing` 而不是 `value-mismatch`：判据被它要抓的破坏顺手打掉了（自我指涉）。正解：锚点截到 options 之前。
- [x] **一处工具级教训（补丁工程）**：补丁 D 用「全局 `str.replace` 还原占位符」把 `TIMEOUT` → `timeout: `，结果**把标识符当前缀一起换了**——`GATE_TIMEOUTS` → `GATE_timeout: S`、`TIMEOUT_ARMED` → `timeout: _ARMED`，并让正则里的 `\(` 变成裸 `(`（`node --check` 立刻报 Unterminated group）。且修正时**手写的期望计数是错的**（写 11/9，真值 8/10）——守卫拦下了这次错误。教训两条：**占位符必须带界符或用行级重建**；**期望计数一律实测取得，不写在纸上**。
- [ ] 未覆盖（如实留在清单）：**强杀只对「直接子进程」负责**——`detached:true` 可用 `kill(-pid)` 整组杀（实测 200ms 后已死），未 detach 时 `kill(-pid)` 返回 `ESRCH` 杀不掉、只能 `kill(pid)`，**孙进程不在覆盖内**；本仓十道门禁源码**零 spawn**（唯一例外 `test-surface-gate.js` 的宿主残骸探针，走 spawnSync 且自限），故「直接子进程被杀 ⇒ 门禁停摆」在本仓成立——这条边界由专锁显式钉住，**不许被「我们已经保险了」这句话盖过去**。`node --check` 的 `spawn-only` 形态同上（读盘阻塞不可中断，如实记档）。`withTimeout` **无法打断同步探针自己**（JS 单线程）——它抓的是「每次 `fn()` 之间的墙钟间隔」，抓不了「`fn` 自己转 10s 不返回」，后者的保险丝只有父进程强杀。预算值是按**当前实测**定的（最重 12~13s × 8）：若未来出现更重的门禁，`coherence()` 会报 `two-spawn-budgets` 强制重定，但**余量本身不会被自动调大**（那是另一个问题）。**UI 层仍未做实机验证**（`ui/panel.js` 在无头回归里不装载）。

'''

LOG_ANCHOR = '## 迭代记录\n'
LOG_BLOCK = '''### R88 · 2026-09-27 · v2.105.0 门禁超时熔断（计划一 #3：兜底存在≠风险被看见）

- **做了什么**：
  - `tests/gate-timeout.js`（新，约 460 行，24 导出）：门禁超时的**单一真源**。`GATE_TIMEOUTS{spawnMs:96000, shellMs:240}`、`RATIOS{spawn:8,inline:4,heavy:4}`、`ARMED_SITES`（10 条现场站点：key + **现场唯一锚点** + mode + kill + shellFuse + pipe）、`GATES`（11 条实测证据）、`coherence()`（三组规则：统一预算 vs 逐门禁建议上限、站点表 vs 武装表不许各说一套、**含管道必须有 shell 保险丝**的客观规则）、`spawnOptsFor` / `runTable` / `limitsOf` / `buildTable` / `withTimeout` / `tailLines` / `formatHangBlock` / `modeCounts` / `summary` / `discover`，以及解析器三件 `stripLiterals` / `parseCallBlocks`（括号平衡切块）/ `findSiteBlock` 与 `siteStats`。
  - `tests/gate-timeout-v2105.js`（新，四段专锁 **53/0**）：A1–A16 静态 / B1–B13 运行时 / C1–C2 不变式 / N0–N10 负控制。
  - `tests/run.js`：**10 个 spawnSync 调用点全部武装 `timeout: 96000`**（出口 5 处另给 `killSignal: 'SIGKILL'`；tar 改写为 `timeout -k 5 240 tar …`；`node --check` 处如实标注「只取证」），新增 section 打印现场读数并**逐站点**核对。
  - `tools/patch_v2105_a/b/c/d.py`、`tools/fix2105_d.py`、`tools/sec2105.py`、`tools/bump_v2105.py`、`tools/bump_run_ver_v2105.py`、`tools/doc_v2105.py`。
- **为什么**：
  - run.js 的 10 个调用点此前**无一**声明 timeout；唯一兜底是外层 `isolated-runner.js` 的 **10 分钟** SIGKILL，而全量回归实测 **6~8 分钟** ⇒ **余量不足一倍**。更糟的是被强杀时的**信息损失**：日志里只剩一行 `Status: runner-failed`——卡在哪一道门禁、卡死前最后说了什么，**全部丢失**。本版把这三件事变成可判定的读数。
  - 阈值**不许照抄计划**：计划原文写「export-contract 3s / 全量 20s / 专锁各 5s」，而实测 export-contract **0.58s**（3s 只有 5 倍余量）、全量 **6~8 分钟**（与 20s 差一个量级）。故先实测再定：**唯一 10s 级门禁是 `dead-export-gate`（12.0~13.0s）**，预算取它的 8 倍 = 96000ms，全表统一。
  - 为什么不逐道各算：门禁里有几道跨 git 版本会明显变重（P1 计划里就有「从 git 读上版快照比对」的判据），紧贴实测会在那些版本上变成**假红**。8 倍对 12s 是 96s，对 0.16s 是余量过剩——**过剩是安全的，紧贴不是**。
- **本版自测期连撞的五类「自己身上的」缺陷（全部是它要治的那族病）**：
  - **D1 定位口径**：专锁初版拿模块里的 key（`'negative-probe-broken'` 之类）去 run.js 定位站点，而那些 key **只活在模块里**、run.js 一个字都没有 ⇒ 十处全报 `site-missing`、判据从第一天起恒假。正解：用 run.js **现场唯一**的调用行行首片段作锚点，且**逐站点**判断；专锁用 **N1b** 专门证明「全局存在性口径会漏报」（别处仍有 timeout 时，被拆的那一处必须照样现形）。
  - **D2 破坏不彻底**：`str.replace(a, b)` 在 JS 里只替换**第一处** ⇒「10 处预算全改 10ms」实际只改了 1 处，区间判据只现形 1 条，断言恒假。正解：`split/join`；并让「破坏是否真发生」也进断言。
  - **D3 标签依赖**：`coherence()` 里「外部命令要另有 shell 保险丝」原先看的是 `mode === 'spawn+shell'` 这个**标签**——把标签抹平（`mode→'spawn'`）判断就**无声逃逸**，而模块头自己写着「口径是行为读数，不是字形比对」。正解：看**客观形态**（命令串含不含管道），并加 N4 在破坏副本上验证这条规则真会现形。
  - **D4 观察位取窗口**：选项探测必须在**调用点之后的整个块**里取（本仓三个调用点带跨行注释，options 落在调用行之后第 11~12 行）。**取窗口的判据会在真源码上假红**——这是「负控制全绿而正控红」的典型形态。
  - **D5 锚点包含被测值**：`negative-probe-v2410` 那一行初版把含 `timeout: 96000` 的整行当锚点 ⇒ 一旦预算被改动（**正是本锁要守的东西**）锚点先失效、报的是 `site-missing` 而非 `value-mismatch`——判据被它要抓的破坏顺手打掉了。正解：锚点截到 options 之前。
- **工具级教训（补丁工程，两处）**：
  - 补丁 D 用「全局 `str.replace` 还原占位符」把 `TIMEOUT` → `timeout: `，结果**把标识符当前缀一起换了**：`GATE_TIMEOUTS` → `GATE_timeout: S`、`TIMEOUT_ARMED` → `timeout: _ARMED`，并让正则里的 `\(` 变成裸 `(`（`node --check` 立刻报 Unterminated group）。**占位符必须带界符，或按行定点重建**。
  - 修正时**手写的期望计数是错的**（写 11/9，真值 8/10）——补丁的守卫拦下了这次错误，`ABORT` 而不是静默改写。**期望计数一律实测取得，不写在纸上**。
- **口径踩坑（正控红 vs 判据红）**：本轮 4 条红里有 3 条是**判据口径错**（B7 行号 off-by-one：79 行输入断言「首行不在」必然恒假；N7 双破坏叠加导致实际不是 99；N2 因锚点含被测值而报 `site-missing` 而非 `value-mismatch`），只有 1 条是 run.js section 里的**属性名写错**（`d.armedSites` 不存在，消息打印真值 10/10/10 而条件在比 `undefined`）。教训：**红的时候先问「这个数是我算的还是实现的」**——消息里打印的读数正确、条件却为假，几乎一定是判据写错。
- **影响范围**：`tests/gate-timeout.js`、`tests/gate-timeout-v2105.js`、`tests/run.js`、`index.js`、`manifest.json`、`tests/reject-lock-v2780.js`、`tests/reject-code-ledger.json`、`tests/module-registry-ledger.json`、`tests/dead-export-ledger.json`、`tools/patch_v2105_a/b/c/d.py`、`tools/fix2105_d.py`、`tools/sec2105.py`、`tools/bump_v2105.py`、`tools/bump_run_ver_v2105.py`、`tools/doc_v2105.py`、`FOUR_VERSION_PLAN.md`、`ITERATION_LOG.md`。
- **门禁结果**：`node tests/run.js` → **通过 8867 / 失败 0**（v2.104.0 基线 8806/0，**+61**）；专锁独立跑 **53/0**；`tests/export-contract.js` → `ns= 109 members= 694 chars= 8296`（**逐字未变**）；`tests/reject-code-gate.js` → 产品文件 116 / 内联拒收码 362（见证 124 / 死表 5 / 基线 233，**三者全不变**）；`tests/test-surface-gate.js` → 文件面 **92** / 锁 **87** / 可达 92 / spawn 4 / 内联 2 / 孤儿 **0**；`tests/module-registry-gate.js` → 文件 112 / 命名空间 120 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0；`tests/dead-export-gate.js` → dead 454 / uiDead 4 / dataOnly 169 → 169；`tests/field-liveness-gate.js` → 写侧越界 1 处（`ui/panel.js innerHTML`）/ 读侧 0 处；`tests/dup-decl-gate.js` → 扫描 211 文件 / 顶层声明 2390 / JSDoc 495 / 重复 0；负控制审计读数 **锁 63（统一 12 / 非统一 51 / 装载不了 0 / 装载中 0）· 被审锚点 110 · 问题 0**；三本台账 version=2.105.0。
- **可复用的判据**（编号续 R87）：
  - (64) **阈值不许照抄计划里的数字**：上限必须 =「**最重那道**的实测 × 余量倍数」，且倍数（8）与被测对象（最重 12~13s）都要写成可读的读数；逐道紧贴实测会在门禁变重的版本上变成**假红**。
  - (65) **不许有两套预算**：同一口径里若「逐门禁表算出 96s」而「现场武装值写 90s」，则现场真读 90s、任何「统一预算 = 96s」的陈述都是假的。须把它做成可调用判据（`coherence()`），并让负控制（N3）在破坏副本上验证它真会现形。
  - (66) **形态受限的调用点用「形态自证」而非放弃**：`node --check` 与 `sh -c 'tar …'` 的主体是外部命令，spawnSync 的 timeout 只作用于直接子进程 ⇒ 两处照样武装（覆盖 `sh`/`node` 本身），tar 另加 shell 侧 `timeout -k <grace> <secs> tar`（**必须带 `-k`**：那句在管道里，缺了只杀写端、读端照挂），并把「不可中断段」如实记为 `mode:'spawn-only'`，**不假称已覆盖**。
  - (67) **判据的定位口径必须是「现场唯一签名」**，不能用「模块内标签」；且必须**逐站点**判断——「别处还有 timeout」不构成该站点已武装（用一条负控制专门证明全局存在性口径会漏报）。
  - (68) **「无 timeout 的调用点」必须被数出来**：`siteStats` 数「调用点数 / 带预算的调用点数 / 预算处数」，断言三者相等（10/10/10）；并用负控制证明「全删 timeout 后未武装计数 = 全部 10 处」。
  - (69) **锚点不许包含它要守卫的那个值**：否则破坏该值时锚点先失效，报出来的是 `site-missing`（判据被打掉）而不是 `value-mismatch`（判据命中）——**判据的自我指涉不止「抄了锚点串」一种形态**。
  - (70) **观察位要取「整段」而不是「固定窗口」**：调用点的选项可能落在调用行之后十几行（中间有跨行注释）。取窗口的判据会在**真源码上假红**，而负控制照样全绿——这是最难自查的一类口径错。

'''

def sub_once(path, old, new, why):
    p = ROOT + '/' + path
    s = io.open(p, encoding='utf-8').read()
    n = s.count(old)
    if n != 1:
        print('ABORT %s: 锚点命中 %d 次 —— %s' % (path, n, why))
        return False
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new))
    print('OK   %s: %s' % (path, why))
    return True


ok = True
ok = sub_once('FOUR_VERSION_PLAN.md', PLAN_ANCHOR, PLAN_BLOCK + PLAN_ANCHOR, '插入 v2.105.0 勾选块') and ok
ok = sub_once('ITERATION_LOG.md', LOG_ANCHOR, LOG_ANCHOR + LOG_BLOCK, '插入 R88') and ok
print('ALL_OK' if ok else 'HAS_ABORT')