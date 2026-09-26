#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.104.0 收口之三：reject-code-ledger 的 version + _note 段。
（前一版脚本的 _note 结尾锚点写错了：真实结尾是「不需要以产品面扩张为代价。」）
纪律：锚点先预检命中数，不唯一即整体放弃。"""
import io, sys

P = '/tmp/wa_git/tests/reject-code-ledger.json'
OLD = '2.103.0'
NEW = '2.104.0'

s = io.open(P, encoding='utf-8').read()

# 1) version 字段
a1 = '"version": "' + OLD + '"'
n1 = s.count(a1)
if n1 != 1:
    print('ABORT version 锚点命中 %d 次' % n1); sys.exit(1)

# 2) _note 结尾（v2.103.0 段的收尾句）
a2 = '不需要以产品面扩张为代价。'
n2 = s.count(a2)
if n2 != 1:
    print('ABORT _note 结尾锚点命中 %d 次' % n2); sys.exit(1)

add = ('\\nv' + NEW + '：本版**未新增任何产品侧内联拒收码**（计划一 #2 负控制审计全部落在 tests/ 侧：'
       'tests/negative-control-audit.js 全仓锚点静态审计 + tests/negative-control-audit-v2104.js '
       '四段专锁）。见证 124 / 死表 5 / 基线 233 **三者不变**——审计面扩张不触碰产品面：'
       '本版要证明的是「锚点还准不准」可以被**单点复核**，而不是再往产品面加规则。')

s = s.replace(a1, '"version": "' + NEW + '"')
s = s.replace(a2, a2 + add)
io.open(P, 'w', encoding='utf-8').write(s)
print('OK reject-code-ledger: version -> ' + NEW + ' + _note 追加一段')
print('新 _note 长度 = %d' % len(s))