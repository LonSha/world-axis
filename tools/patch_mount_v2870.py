# -*- coding: utf-8 -*-
"""v2.87.0：把 B6 专锁 causal-view-v2870 挂进 run.js（紧随 identity-v2860）。
不挂 = 孤儿（test-surface-gate 会红）。锚点恰中 1 次。
"""
import io, sys
PATH = 'tests/run.js'
src = io.open(PATH, encoding='utf-8').read()
OLD = ("  require('./identity-v2860.js').runAll(assert);\n"
       "  require('./identity-v2860.js').runNegative(assert);\n")
NEW = ("  require('./identity-v2860.js').runAll(assert);\n"
       "  require('./identity-v2860.js').runNegative(assert);\n"
       "  // v2.87.0（第四十一面）：因果观测面 —— 当前状态与累计分列（B6）。\n"
       "  //   实测：causal.stat() 是**进程累计**（刷新即零），而「这条链现在怎么了」\n"
       "  //   此前只能逐条 classify —— tool-diag 与 ui/panel 读到的那个数既答不出\n"
       "  //   「发生过几次」，也答不出「现在怎么样」。本锁把两份读数分列做成可测事实。\n"
       "  require('./causal-view-v2870.js').runAll(assert);\n"
       "  require('./causal-view-v2870.js').runNegative(assert);\n")
n = src.count(OLD)
if n != 1:
    print('ABORT anchor count=%d' % n)
    sys.exit(1)
src = src.replace(OLD, NEW)
io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK mounted causal-view-v2870')
print('DONE')
