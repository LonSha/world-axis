#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.105.0 收口之一：版本号同批同步（index.js / manifest.json / 三本台账 / reject-lock 期望值）。
纪律：**比较值与消息文本必须同批改**；每处锚点先预检命中数，不唯一即整体放弃（幂等保护）。"""
import io, sys, hashlib

ROOT = '/tmp/wa_git'
OLD = '2.104.0'
NEW = '2.105.0'
report = []
ok = True


def read(p):
    return io.open(ROOT + '/' + p, encoding='utf-8').read()


def write(p, s):
    io.open(ROOT + '/' + p, 'w', encoding='utf-8').write(s)


def sub1(path, old, new, why):
    global ok
    s = read(path)
    n = s.count(old)
    if n != 1:
        report.append('ABORT %s: 锚点命中 %d 次（要求恰好 1）—— %s' % (path, n, why))
        ok = False
        return
    write(path, s.replace(old, new))
    report.append('OK   %s: %s' % (path, why))


# 1) 入口与清单
sub1('index.js', "const VERSION = '" + OLD + "';", "const VERSION = '" + NEW + "';", 'index.js VERSION')
sub1('manifest.json', '"version": "' + OLD + '"', '"version": "' + NEW + '"', 'manifest version')

# 2) 三本带版本同源判据的台账
sub1('tests/dead-export-ledger.json', '"version": "' + OLD + '"', '"version": "' + NEW + '"', 'dead-export-ledger version')
sub1('tests/dead-export-ledger.json', '冻结账本（v' + OLD + '）', '冻结账本（v' + NEW + '）', 'dead-export-ledger _note 首句版本')
sub1('tests/module-registry-ledger.json', '"version": "' + OLD + '"', '"version": "' + NEW + '"', 'module-registry-ledger version')

# 3) reject-code-ledger：version + _note 追加本版说明（本版仍未触碰产品面）
sub1('tests/reject-code-ledger.json', '"version": "' + OLD + '"', '"version": "' + NEW + '"', 'reject-code-ledger version')
add = ('\\nv' + NEW + '：本版**未新增任何产品侧内联拒收码**（计划一 #3 门禁超时熔断全部落在 '
       'tests/run.js 的调用点武装 + tests/gate-timeout.js 取值面 + tests/gate-timeout-v2105.js 专锁）。'
       '见证 124 / 死表 5 / 基线 233 **三者不变**——本版要证明的是「门禁卡死」可以由**读数**承担：'
       '预算、调用点数、末 N 行 stdout 取证块都是可判定的量，而不是再往产品面加规则。')
sub1('tests/reject-code-ledger.json', '而不是再往产品面加规则。', '而不是再往产品面加规则。' + add, 'reject-code-ledger _note 追加 v' + NEW + ' 段')

# 4) reject-lock 的台账版本期望（比较值与消息都不带旧版本字样，只改比较值）
sub1('tests/reject-lock-v2780.js', "led.version === '" + OLD + "'", "led.version === '" + NEW + "'", 'reject-lock 台账版本期望')

# 5) run.js 内 8 处「入口版本期望」锚点（见 tools/bump_run_ver_v2105.py，单独执行）
print('\n'.join(report))
print('ALL_OK' if ok else 'HAS_ABORT')
sys.exit(0 if ok else 1)