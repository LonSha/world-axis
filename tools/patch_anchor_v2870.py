# -*- coding: utf-8 -*-
"""v2.87.0：读数锚点与冻结串随 B6 观测面增量更新。

增量来源（不是手填凑绿）：
  · stateView 是 causal 的**新导出成员** ⇒ 出口面 members 582 -> 583、
    chars 7199 -> 7209（ns= 103 不变）；跨文件依赖面 causal 段插入 stateView。
  · B6 专锁 causal-view-v2870.js 的真代码面引用它 ⇒ refs 2289 -> 2291（+2）。
  · members 1218 -> 1219 同源自新成员。
  · 死导出面 dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292 **全不变** ——
    stateView 有真消费方（tool-diag 的 collect().causal.now），不是死导出。
"""
import io, sys

PATH = 'tests/run.js'
src = io.open(PATH, encoding='utf-8').read()

REPL = [
    # 1) 冻结串：causal 段插入 stateView（按字典序在 stat 之后、tick 之前）
    ('causal:STAGES TERMINAL addChain buildBlock cancel classify defer due getSettings knownCause setSettings settle settleBlockReason stat tick',
     'causal:STAGES TERMINAL addChain buildBlock cancel classify defer due getSettings knownCause setSettings settle settleBlockReason stat stateView tick'),
    # 2) 出口面规模
    ("const EC2430 = 'ns= 103 members= 582 chars= 7199';",
     "const EC2430 = 'ns= 103 members= 583 chars= 7209';"),
    # 3) 清册面：refs 2289 -> 2291
    ("assert(r2700.refs === 2289, '现场静态引用 2289 处（真代码口径，实 '",
     "assert(r2700.refs === 2291, '现场静态引用 2291 处（真代码口径，实 '"),
    ("assert(r2800.refs === 2289 && r2800.namespaces === 109 && r2800.members === 1218,",
     "assert(r2800.refs === 2291 && r2800.namespaces === 109 && r2800.members === 1219,"),
    ("assert(r2900.refs === 2289 && r2900.namespaces === 109 && r2900.members === 1218,",
     "assert(r2900.refs === 2291 && r2900.namespaces === 109 && r2900.members === 1219,"),
    # 4) 成员数：1218 -> 1219
    ("assert(r2700.namespaces === 109 && r2700.members === 1218,",
     "assert(r2700.namespaces === 109 && r2700.members === 1219,"),
]

# 文案里的数字与说明一并更新（避免「读数对、说明旧」）
TEXT = [
    ('现场静态引用 2289 处', '现场静态引用 2291 处'),
    ("'定义面 109 命名空间 / 1218 成员（v2.86.0：A3 唯一写者 +2 成员，实 '",
     "'定义面 109 命名空间 / 1219 成员（v2.87.0：B6 观测面 +1 成员，实 '"),
    ("'清册面（refs 2289 / 命名空间 109 / 成员 1218，v2.86.0：A3 唯一写者 +2 成员）'",
     "'清册面（refs 2291 / 命名空间 109 / 成员 1219，v2.87.0：B6 观测面 +1 成员、专锁 +2 引用）'"),
    ("'清册面（refs 2289 / 命名空间 109 / 成员 1218）——真代码口径下的现场值（v2.86.0：A3 唯一写者 +2 成员）'",
     "'清册面（refs 2291 / 命名空间 109 / 成员 1219）——真代码口径下的现场值（v2.87.0：B6 观测面 +1 成员、专锁 +2 引用）'"),
]

for old, new in REPL + TEXT:
    n = src.count(old)
    if n != 1:
        print('ABORT anchor count=%d for: %s' % (n, old[:70]))
        sys.exit(1)

for old, new in REPL + TEXT:
    src = src.replace(old, new)

io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK patched anchors v2.87.0')
print('DONE')
