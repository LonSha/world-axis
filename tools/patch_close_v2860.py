# -*- coding: utf-8 -*-
"""v2.86.0: close out the version.

- index.js VERSION + manifest.json version: 2.85.0 -> 2.86.0
- ITERATION_LOG.md: prepend an R66 entry (newest first)
- README.md: prepend a v2.86.0 section before the v2.85.0 one
Each anchor hits exactly once.
"""
import io, sys

# 1) version constants
for f in ('index.js', 'manifest.json'):
    s = io.open(f, encoding='utf-8').read()
    n = s.count("2.85.0")
    # index.js also mentions 2.85.0 in a comment; only bump the version literal
    s = s.replace("const VERSION = '2.85.0';", "const VERSION = '2.86.0';", 1)
    s = s.replace('"version": "2.85.0"', '"version": "2.86.0"', 1)
    io.open(f, 'w', encoding='utf-8').write(s)
    print(f, 'done')

# 2) iteration log
LOG = 'ITERATION_LOG.md'
ls = io.open(LOG, encoding='utf-8').read()
ANCH = '## 迭代记录\n'
n = ls.count(ANCH)
if n != 1:
    print('ABORT log anchor %d' % n); sys.exit(1)
ENTRY = (
"## 迭代记录\n"
"### R66 · 2026-09-25 · v2.86.0 注入链韧性 + 事实唯一写者（第四十面：一个源的数据瑕疵能把整块世界状态吃掉；一条事实有五个写者，谁写的看不出来）\n"
"\n"
"- **做了什么**：两处落点，两把专锁。\n"
"  **A5（`render/inject.js`）**：43 个源调用点里只有 `style` 一处在 try/catch 内。实测让 `bonds` 抛一次异常 ⇒ **47 个源全部丢失**（连世界状态的时间/背景/人物一起消失），异常还冒泡出扩展。新增 `engineCall(ns, fn)` 作为唯一引擎调用出口：缺席 / 空串 / **抛异常**三态分开，只有抛异常进故障台账，并按**用户看得见的名字**记（「关系六型」而不是 `bonds`）。42 个裸调用点全部收敛；世界快照六段逐段守卫；`nearEvent`（既读又写）整块守卫。故障台账经**既有** `visibilityStat()` 暴露——**零新增导出成员**。专锁 `tests/settle-v2860.js`（22 项，N0–N4 负控制）。\n"
"  **A3（`actors/registry.js`）**：人物条目此前有五个创建点（life / intel 两处 / backstage 两处 / registry），各写各的 `draft.people[id] = {...}` ⇒ 「这个条目是谁建出来的」完全不可见。新增 `ensurePerson(draft, id, name, via)` 作为**唯一写者**，每次新建打 `createdVia` / `createdAt` 来源标签；五个调用点全部改为委托（自动建人的行为一个字都没收紧）；无 registry 的合成宿主桩仍能自建，但标签带 `:fallback` 后缀——于是「产品运行时到底走没走唯一写者」这件事本身可被断言。观测出口 `personOriginStat()` 由 `tool-diag.secModules()` 真消费。专锁 `tests/identity-v2860.js`（36 项，五个真源码破坏锚点各恰中 1 次）。\n"
"- **为什么**：两处都是「承诺写在源码里，但没有任何判据问过它」的同型病。A5 修前，模型输出少一个字段（`bonds` 缺 `types`、`ladder` 缺 `rungs`、`shadow` 缺 `holders`）正文就整块空白，而「世界状态为什么没进正文」永远答不出是没内容还是坏了。A3 曾试过更硬的一版（未知 id 直接拒收），实测撞 24 条既有契约（life-v2520 / settle-v2650 / evict-meta-v2610 / registry-identity-v2620）已回滚——**把「创建」判成病是错的，把「看不见谁创建的」判成病才对**。\n"
"- **踩过的坑**：① 首版把 `vis.<k>` 挪进 `engineCall` 首参，破坏了 v2560/v2580/v2841 三条负控制的锚点 `vis.life && WA.life` ⇒ 负控制假绿，改为 `engineCall(ns, fn)` 形态、守卫原样保留；② `gate.fresh()` 复用同一个 `global.WorldAxis`，负控制里「先取原版、后建破坏副本」会让原版引用被覆盖 ⇒ 原版侧读数必须在建破坏副本**之前**算完；③ 新增导出成员要付接口冻结串的价（members 580→582 / chars 7169→7199），且专锁的真代码面引用会改写 dead-export 账本的 tref（test-only 291→292）。\n"
"- **影响范围**：`render/inject.js`、`actors/registry.js`、`engines/life.js`、`engines/intel.js`、`engines/backstage.js`、`engines/tool-diag.js`、`tests/run.js`、`tests/settle-v2860.js`（新）、`tests/identity-v2860.js`（新）、`tests/reject-v2780.js`、`tests/dead-export-ledger.json`、`tests/field-liveness-ledger.json`、`tests/module-registry-ledger.json`、`index.js`、`manifest.json`、`README.md`、`ITERATION_LOG.md`。\n"
"- **门禁结果**：`node tests/run.js` → **通过 7541 / 失败 0**（v2.85.0 基线 **7483 / 0**，净增 58 = A5 专锁 22 + A3 专锁 36）；`tests/settle-v2860.js` → **22 / 0**；`tests/identity-v2860.js` → **36 / 0**；`tests/reject-code-gate.js` → 每个码都有归属；`tests/dead-export-gate.js` → dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292 / 证据 448 条；出口面 `ns= 103 members= 582 chars= 7199`。\n"
"\n"
)
ls = ls.replace(ANCH, ENTRY, 1)
io.open(LOG, 'w', encoding='utf-8').write(ls)
print('log done')

# 3) README
RD = 'README.md'
rs = io.open(RD, encoding='utf-8').read()
R_ANCH = '<b>v2.85.0</b>'
if rs.count(R_ANCH) < 1:
    print('ABORT readme anchor'); sys.exit(1)
R_ENTRY = (
"<b>v2.86.0</b> — <b>注入链韧性 + 事实唯一写者（第四十面：一个源的数据瑕疵能把整块世界状态吃掉；一条事实有五个写者，谁写的看不出来）</b>。两处落点，两把专锁，两向自证。\n"
"  <b>A5 · 注入链</b>：43 个源调用点里只有 <code>style</code> 一处在 try/catch 内。实测让 <code>bonds</code> 抛一次异常 ⇒ <b>47 个源全部丢失</b>（连世界状态一起消失），异常还冒泡出扩展。新增 <code>engineCall</code> 作为唯一引擎调用出口，缺席 / 空串 / 抛异常三态分开，故障按<b>用户看得见的名字</b>记（「关系六型」而不是 <code>bonds</code>）。故障台账经既有 <code>visibilityStat()</code> 暴露——<b>零新增导出成员</b>。专锁 <code>tests/settle-v2860.js</code>（22 项）。\n"
"  <b>A3 · 唯一写者</b>：人物条目此前有五个创建点，各写各的 ⇒ 「谁建的」完全不可见。新增 <code>registry.ensurePerson</code> 作为唯一写者，每次新建打 <code>createdVia</code> 来源标签；五个调用点全部委托（自动建人的行为一个字都没收紧）；无 registry 的合成宿主桩仍能自建，但标签带 <code>:fallback</code> 后缀——于是「产品运行时到底走没走唯一写者」可被断言。专锁 <code>tests/identity-v2860.js</code>（36 项）。\n"
"  <b>门禁</b>：<code>node tests/run.js</code> → <b>通过 7541 / 失败 0</b>（v2.85.0 为 <b>7483 / 0</b>，+58 = 两把专锁）；出口面 <code>ns= 103 members= 582 chars= 7199</code>（A3 新增 2 个成员）；<code>tests/dead-export-gate.js</code> → dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292。\n"
"\n"
)
rs = rs.replace(R_ANCH, R_ENTRY + R_ANCH, 1)
io.open(RD, 'w', encoding='utf-8').write(rs)
print('readme done')
print('DONE')
