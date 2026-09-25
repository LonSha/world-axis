# -*- coding: utf-8 -*-
"""v2.86.0: fix two things left by the rollback.

1) tests/run.js line 14996: the assertion string lost its closing quote
   (anchor2 patch truncated it). Restore the closing.
2) the rollback base was taken BEFORE the inventory-anchor bump, so the
   2281/1216/580 anchors came back. Re-apply that bump (same rules).
Each anchor must hit exactly once.
"""
import io, sys

PATH = 'tests/run.js'
src = io.open(PATH, encoding='utf-8').read()

RULES = [
    # (1) closing quote
    ("'死子面 dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292（v2.86.0：A3 专锁 +1，实 ' + r2900.dead.length + '/\n",
     "'死子面 dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292（v2.86.0：A3 专锁 +1，实 ' + r2900.dead.length + '/\n"),
    # (2) inventory anchors re-applied (from patch_anchor_v2860)
    ('r2700.refs === 2281', 'r2700.refs === 2289'),
    ('现场静态引用 2281 处', '现场静态引用 2289 处'),
    ('r2700.members === 1216', 'r2700.members === 1218'),
    ('定义面 109 命名空间 / 1216 成员（v2.85.0：读数未变',
     '定义面 109 命名空间 / 1218 成员（v2.86.0：A3 唯一写者 +2 成员'),
    ('r2800.refs === 2281 && r2800.namespaces === 109 && r2800.members === 1216',
     'r2800.refs === 2289 && r2800.namespaces === 109 && r2800.members === 1218'),
    ('清册面（refs 2281 / 命名空间 109 / 成员 1216，v2.85.0：读数未变）',
     '清册面（refs 2289 / 命名空间 109 / 成员 1218，v2.86.0：A3 唯一写者 +2 成员）'),
    ('r2900.refs === 2281 && r2900.namespaces === 109 && r2900.members === 1216',
     'r2900.refs === 2289 && r2900.namespaces === 109 && r2900.members === 1218'),
    ('清册面（refs 2281 / 命名空间 109 / 成员 1216）——真代码口径下的现场值（v2.85.0：读数未变）',
     '清册面（refs 2289 / 命名空间 109 / 成员 1218）——真代码口径下的现场值（v2.86.0：A3 唯一写者 +2 成员）'),
    ("const EC2430 = 'ns= 103 members= 580 chars= 7169';",
     "const EC2430 = 'ns= 103 members= 582 chars= 7199';"),
]

# rule 1: the closing quote is the only difference — do it explicitly
BAD = "'死子面 dead 444 / uiDead 4 / dataOnly 160 / 仅测试 292（v2.86.0：A3 专锁 +1，实 ' + r2900.dead.length + '/\n"
GOOD = BAD[:-1] + "'\n"

fails = []
n = src.count(BAD)
if n != 1:
    fails.append('MISS close-quote (%d)' % n)
else:
    src = src.replace(BAD, GOOD)

for old, new in RULES[1:]:
    n = src.count(old)
    if n != 1:
        fails.append('MISS(%d) %r' % (n, old[:40]))
        continue
    src = src.replace(old, new)

if fails:
    print('ABORT')
    for f in fails:
        print(' ', f)
    sys.exit(1)

io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK fixed close-quote + reapplied 9 inventory anchors')
print('DONE')
