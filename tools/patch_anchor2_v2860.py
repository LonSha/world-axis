# -*- coding: utf-8 -*-
"""v2.86.0：dead-export 读数锚点随 A3 专锁增量更新。

identity-v2860.js 的真代码面新增两处测试引用：
  intel.releaseDue   tref 1 -> 2
  toolDiag.secModules tref 0 -> 1   （self-only 119 条里转出一条 test-only）

故 dead 面 test-only 291 -> 292、self-only 120 -> 119；
冻结面合计（dead + uiDead）test-only 295 -> 296。
每处锚点恰中 1 次。
"""
import io, sys

PATH = 'tests/run.js'
src = io.open(PATH, encoding='utf-8').read()

RULES = [
    ("assert(r2700.deadInTestsOnly === 291, '其中仅测试引用 291（v2.85.0：未变，实 '",
     "assert(r2700.deadInTestsOnly === 292, '其中仅测试引用 292（v2.86.0：A3 专锁 +1，实 '"),
    ("assert(dist2800['test-only'] === 295 && dist2800['self-only'] === 120 && dist2800['unwired'] === 33,\n"
     "'归因分布 test-only 295 / self-only 120 / unwired 33（v2.82.0 快照与分支 +19；死面 291 + 界面 4 = 295，与 448 自洽，实 ' + JSON.stringify(dist2800) + '）');",
     "assert(dist2800['test-only'] === 296 && dist2800['self-only'] === 119 && dist2800['unwired'] === 33,\n"
     "'归因分布 test-only 296 / self-only 119 / unwired 33（v2.86.0：A3 专锁 +1 测试引用；死面 292 + 界面 4 = 296，与 448 自洽，实 ' + JSON.stringify(dist2800) + '）');"),
    ("&& r2800.deadInTestsOnly === 291,\n"
     "'现场锚点（dead 444 / uiDead 4 / dataOnly 160 / 仅测试 291，v2.82.0 快照与分支 +19）');",
     "&& r2800.deadInTestsOnly === 292,\n"
     "'现场锚点（dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292，v2.86.0：A3 专锁 +1）');"),
    ("&& r2900.deadInTestsOnly === 291,\n"
     "'死子面 dead 444 / uiDead 4 / dataOnly 160 / 仅测试 291（v2.85.0：未变，实 ' + r2900.dead.length + '/'",
     "&& r2900.deadInTestsOnly === 292,\n"
     "'死子面 dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292（v2.86.0：A3 专锁 +1，实 ' + r2900.dead.length + '/"),
]

fails = []
for old, new in RULES:
    n = src.count(old)
    if n != 1:
        fails.append('MISS(%d) %r' % (n, old[:48]))
        continue
    src = src.replace(old, new)

if fails:
    print('ABORT')
    for f in fails:
        print(' ', f)
    sys.exit(1)

io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK rewrote %d groups' % len(RULES))
print('DONE')
