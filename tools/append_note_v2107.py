#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 tests/reject-code-ledger.json 的 _note 追加 v2.107.0 沿革段（保持转义 \\n 形态）。"""
import io, json, sys

P = '/tmp/wa_git/tests/reject-code-ledger.json'
with io.open(P, encoding='utf-8') as f:
    s = f.read()

# 守卫：幂等
if 'v2.107.0：' in s:
    print('SKIP：已含 v2.107.0 沿革段')
    sys.exit(0)

ANCHOR = '（判据只在 tests/readings.js 里）。."'
if s.count(ANCHOR) != 1:
    print('ABORT：锚点命中 %d 次（期望 1）' % s.count(ANCHOR))
    sys.exit(1)

SEG = (
    '\\n'
    'v2.107.0：本版同样**未新增任何产品侧内联拒收码**（计划一 #17 拒收码分类完备性审计 '
    '+ #20 模块依赖静态图，两把专锁 + run.js 两个 section）。见证 124 / 死表 5 / 基线 233 '
    '**三者不变** —— 本版要证明的是「覆盖率」这个数能自己站住：'
    '① 分母 = 见证 + 死表 + 基线（恒等式）；② 三集都必须是扫描面的子集；'
    '③ 覆盖率 = （见证 + 死表）/ 分母，且下限 ≥30% 写进判据；'
    '④ 未登记的延后见证**一律算真缺口**（DEFERRED 默认空表，登记才叫已接受）；'
    '⑤ 声明面的重复码必须报出来（字典静默覆盖是本版要治的第二种病）。'
)

REPL = ANCHOR[:-1] + SEG + '."'
s2 = s.replace(ANCHOR, REPL)
assert s2 != s, '未发生改动'
json.loads(s2)  # 写完必须仍是合法 JSON
with io.open(P, 'w', encoding='utf-8') as f:
    f.write(s2)
j = json.loads(s2)
print('OK version=%s note+%d chars' % (j['version'], len(j['_note']) - len(json.loads(s)['_note'])))