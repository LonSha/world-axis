#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.104.0 收口：版本号同批同步（index.js / manifest.json / 三本带版本台账 / 版本期望断言）。
纪律：比较值与消息文本必须同批改。所有锚点先预检命中数，不唯一即整体放弃（幂等保护）。"""
import sys, io

ROOT = '/tmp/wa_git'
OLD = '2.103.0'
NEW = '2.104.0'
report = []
ok = True


def read(p):
    with io.open(ROOT + '/' + p, encoding='utf-8') as f:
        return f.read()


def write(p, s):
    with io.open(ROOT + '/' + p, 'w', encoding='utf-8') as f:
        f.write(s)


def sub1(path, old, new, why):
    global ok
    s = read(path)
    n = s.count(old)
    if n != 1:
        report.append('ABORT %s: 锚点命中 %d 次（要求恰好 1）—— %s' % (path, n, why))
        ok = False
        return False
    write(path, s.replace(old, new))
    report.append('OK   %s: %s' % (path, why))
    return True


# 1) 入口与清单
sub1('index.js', "const VERSION = '" + OLD + "';", "const VERSION = '" + NEW + "';", 'index.js VERSION')
sub1('manifest.json', '"version": "' + OLD + '"', '"version": "' + NEW + '"', 'manifest version')

# 2) 版本期望断言（reject-lock 的结构检查）
sub1('tests/reject-lock-v2780.js',
     "led.version === '" + OLD + "'",
     "led.version === '" + NEW + "'",
     'reject-lock 台账版本期望')

# 3) reject-code-ledger：version 字段 + _note 追加本版说明
s = read('tests/reject-code-ledger.json')
n = s.count('"version": "' + OLD + '"')
if n != 1:
    report.append('ABORT reject-code-ledger: version 锚点 %d 次' % n)
    ok = False
else:
    s = s.replace('"version": "' + OLD + '"', '"version": "' + NEW + '"')
    add = ('\\nv' + NEW + '：本版**未新增任何产品侧内联拒收码**（计划一 #2 负控制审计全部落在 '
           'tests/ 侧：tests/negative-control-audit.js 全仓锚点静态审计 + '
           'tests/negative-control-audit-v2104.js 四段专锁）。见证 124 / 死表 5 / 基线 233 '
           '**三者不变**——审计面扩张不触碰产品面，这正是「把可比对的东西做出来」而非「多加规则」。')
    old_end = '故同样按「有归属」处理并带见证。"'
    cnt = s.count(old_end)
    if cnt != 1:
        report.append('ABORT reject-code-ledger: _note 结尾锚点 %d 次' % cnt)
        ok = False
    else:
        s = s.replace(old_end, '故同样按「有归属」处理并带见证。' + add + '"')
        write('tests/reject-code-ledger.json', s)
        report.append('OK   reject-code-ledger: version + _note 追加 v' + NEW + ' 段')

print('\n'.join(report))
print('ALL_OK' if ok else 'HAS_ABORT')
sys.exit(0 if ok else 1)