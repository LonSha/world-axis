# -*- coding: utf-8 -*-
"""修正 patch_a5_v2860.py 的 EXP_OLD 锚点：原文件导出块是简写 `    SOURCES,`。"""
import io, ast, sys
P = 'tools/patch_a5_v2860.py'
s = io.open(P, encoding='utf-8').read()

OLD = 'EXP_OLD = "    SOURCES: SOURCES,"'
NEW = 'EXP_OLD = "    SOURCES,\\n"'

c = s.count(OLD)
print('anchor hits = %d' % c)
if c != 1:
    sys.exit(2)
s = s.replace(OLD, NEW)
io.open(P, 'w', encoding='utf-8').write(s)
ast.parse(s)
print('AST OK')