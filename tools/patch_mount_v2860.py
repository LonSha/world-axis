# -*- coding: utf-8 -*-
"""v2.86.0：把 A3 专锁 identity-v2860 挂进 run.js（紧随 settle-v2860）。

不挂 = 孤儿（test-surface-gate 会红）。锚点恰中 1 次。
"""
import io, sys

PATH = 'tests/run.js'
src = io.open(PATH, encoding='utf-8').read()

OLD = ("  require('./settle-v2860.js').runAll(assert);\n"
       "  require('./settle-v2860.js').runNegative(assert);\n")
NEW = ("  require('./settle-v2860.js').runAll(assert);\n"
       "  require('./settle-v2860.js').runNegative(assert);\n"
       "  // v2.86.0（第四十面）：事实唯一写者（A3）。\n"
       "  //   实测：人物条目有五个创建点（life / intel 两处 / backstage 两处 / registry），\n"
       "  //   各写各的 `draft.people[id] = {...}` ⇒ 「这个条目是谁建出来的」完全不可见。\n"
       "  //   本锁把「创建只此一处 + 每次新建打来源标签 + 残点必带 fallback」做成可测事实。\n"
       "  require('./identity-v2860.js').runAll(assert);\n"
       "  require('./identity-v2860.js').runNegative(assert);\n")

n = src.count(OLD)
if n != 1:
    print('ABORT anchor count=%d' % n)
    sys.exit(1)
src = src.replace(OLD, NEW)
io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK mounted identity-v2860')
print('DONE')
