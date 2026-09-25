# -*- coding: utf-8 -*-
"""修正 patch_a5_v2860.py 的 MS_OLD 锚点：OLD 侧必须写原文件的真形态（带参调用）。

背景：第 3 段的正则只匹配 `WA.<ns>.<meth>()` 空参形态，故 memorySampler 的带参调用
      在「修前文件」里仍是原样；MS_OLD 却按第 3 段改后的形态（engineCall 包裹）书写，
      于是锚点在原文件里命中 0 次。
"""
import io, ast, sys
P = 'tools/patch_a5_v2860.py'
s = io.open(P, encoding='utf-8').read()

OLD = "        const pb = engineCall(vis.memory, 'memorySampler', function () { return WA.memorySampler.buildBlock(); });\n"
NEW = "        const pb = WA.memorySampler.buildBlock({ recentText: recent });\n"

c = s.count(OLD)
print('anchor hits = %d' % c)
if c != 1:
    sys.exit(2)
s = s.replace(OLD, NEW)
io.open(P, 'w', encoding='utf-8').write(s)
ast.parse(s)
print('AST OK')