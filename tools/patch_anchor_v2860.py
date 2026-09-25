# -*- coding: utf-8 -*-
"""v2.86.0: 清册读数锚点随 A3 唯一写者增量更新。

A3 让 actors/registry.js 新增两个导出成员（ensurePerson / personOriginStat），
且五个创建点收敛到唯一写者 ⇒ 静态引用数随之增长。四处清册锚点必须同步：

  refs     2281 -> 2289
  members  1216 -> 1218
  出口面   580 / 7169 -> 582 / 7199（ns= 103 不变）

口径本身不变，只更新「现场值」；每处替换断言命中数恰为期望值。
"""
import io, sys

PATH = 'tests/run.js'
src = io.open(PATH, encoding='utf-8').read()

RULES = [
    ('r2700.refs === 2281', 'r2700.refs === 2289', 1),
    ('现场静态引用 2281 处', '现场静态引用 2289 处', 1),
    ('r2700.members === 1216', 'r2700.members === 1218', 1),
    ('定义面 109 命名空间 / 1216 成员（v2.85.0：读数未变',
     '定义面 109 命名空间 / 1218 成员（v2.86.0：A3 唯一写者 +2 成员', 1),
    ('r2800.refs === 2281 && r2800.namespaces === 109 && r2800.members === 1216',
     'r2800.refs === 2289 && r2800.namespaces === 109 && r2800.members === 1218', 1),
    ('清册面（refs 2281 / 命名空间 109 / 成员 1216，v2.85.0：读数未变）',
     '清册面（refs 2289 / 命名空间 109 / 成员 1218，v2.86.0：A3 唯一写者 +2 成员）', 1),
    ('r2900.refs === 2281 && r2900.namespaces === 109 && r2900.members === 1216',
     'r2900.refs === 2289 && r2900.namespaces === 109 && r2900.members === 1218', 1),
    ('清册面（refs 2281 / 命名空间 109 / 成员 1216）——真代码口径下的现场值（v2.85.0：读数未变）',
     '清册面（refs 2289 / 命名空间 109 / 成员 1218）——真代码口径下的现场值（v2.86.0：A3 唯一写者 +2 成员）', 1),
    ("const EC2430 = 'ns= 103 members= 580 chars= 7169';",
     "const EC2430 = 'ns= 103 members= 582 chars= 7199';", 1),
]

fails = []
for old, new, want in RULES:
    got = src.count(old)
    if got != want:
        fails.append('MISS %r got=%d want=%d' % (old[:40], got, want))
        continue
    src = src.replace(old, new)

if fails:
    print('ABORT')
    for f in fails:
        print(' ', f)
    sys.exit(1)

io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK rewrote %d anchor groups' % len(RULES))
print('residual 2281=%d 1216=%d' % (src.count('2281'), src.count('1216')))
print('now 2289=%d 1218=%d' % (src.count('2289'), src.count('1218')))
print('DONE')
