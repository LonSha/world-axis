#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.103.0 收口：版本号同批同步（index.js / manifest.json / 三本带版本台账 / 版本期望断言）。
纪律：比较值与消息文本必须同批改。所有锚点先预检命中数，不唯一即整体放弃。"""
import json, re, sys, io

ROOT = '/tmp/wa_git'
OLD = '2.102.0'
NEW = '2.103.0'
report = []

def read(p):
    with io.open(ROOT + '/' + p, encoding='utf-8') as f:
        return f.read()

def write(p, s):
    with io.open(ROOT + '/' + p, 'w', encoding='utf-8') as f:
        f.write(s)

def sub1(path, old, new, why):
    """恰中 1 次才替换，否则放弃。"""
    s = read(path)
    n = s.count(old)
    if n != 1:
        report.append('ABORT %s: 锚点命中 %d 次（要求恰好 1）—— %s' % (path, n, why))
        return False
    write(path, s.replace(old, new))
    report.append('OK   %s: %s' % (path, why))
    return True

ok = True

# 1) 入口与清单
ok &= sub1('index.js', "const VERSION = '" + OLD + "';", "const VERSION = '" + NEW + "';", 'index.js VERSION')
ok &= sub1('manifest.json', '"version": "' + OLD + '"', '"version": "' + NEW + '"', 'manifest version')

# 2) 版本期望断言（reject-lock 的 A 结构检查）
ok &= sub1('tests/reject-lock-v2780.js',
           "led.version === '" + OLD + "'",
           "led.version === '" + NEW + "'",
           'reject-lock 台账版本期望')

# 3) reject-code-ledger：version 字段 + _note 追加本版说明
s = read('tests/reject-code-ledger.json')
n = s.count('"version": "' + OLD + '"')
if n != 1:
    report.append('ABORT reject-code-ledger: version 锚点 %d 次' % n); ok = False
else:
    s = s.replace('"version": "' + OLD + '"', '"version": "' + NEW + '"')
    add = ('\\nv' + NEW + '：本版**未新增任何产品侧内联拒收码**（A3 = O16 依赖可见性治理全部落在 '
           'tests/ 与 tools/ 侧：tests/dependency-guard.js 可选依赖单一真源 + '
           'tests/dependency-guard-v2103.js 四段专锁 + tests/ui-dom.js 的 JSDOMShim 同形替身）。'
           '见证 124 / 死表 5 / 基线 233 **三者不变**——这正是本版要证明的一件事：'
           '门禁可见性的提升不需要以产品面扩张为代价。')
    old_note_end = '故同样按「有归属」处理并带见证。"'
    cnt = s.count(old_note_end)
    if cnt != 1:
        report.append('ABORT reject-code-ledger: _note 结尾锚点 %d 次' % cnt); ok = False
    else:
        s = s.replace(old_note_end, '故同样按「有归属」处理并带见证。' + add + '"')
        write('tests/reject-code-ledger.json', s)
        report.append('OK   reject-code-ledger: version + _note 追加 v' + NEW + ' 段')

print('\n'.join(report))
print('ALL_OK' if ok else 'HAS_ABORT')
