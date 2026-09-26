#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.105.0 收口之二：tests/run.js 内 8 处「入口版本期望」锚点同批同步。
铁律：比较值与消息文本必须同批改（否则消息会撒谎，或比较值恒假）。
每处锚点先预检命中数，不唯一即整体放弃（不写半套）。
（口径与 tools/bump_run_ver_v2104.py 同源，只换 OLD/NEW。注意：**不许**把历史叙述里的
 v2.104.0 section 标题一起改掉——那些是「上一版做了什么」的记录，不是版本期望。）"""
import io, sys

P = '/tmp/wa_git/tests/run.js'
OLD = '2.104.0'
NEW = '2.105.0'

s = io.open(P, encoding='utf-8').read()

PATTERNS = [
    ("assert(verF2500 === '" + OLD + "' && mfF2500.version === verF2500", 'v2500 入口↔清单同源同值'),
    ("assert(verF2600 === '" + OLD + "'", 'v2600 入口↔清单同源同值'),
    ("assert(ver === '" + OLD + "', '入口版本为 " + OLD + "（实 '", 'v2800 段入口版本'),
    ("assert(ver2800 === '" + OLD + "', '入口版本为 " + OLD + "（实 '", 'v2800 入口版本'),
    ("assert(ver2900 === '" + OLD + "', '入口版本为 " + OLD + "（实 '", 'v2900 入口版本'),
    ("assert(ver2100v === '" + OLD + "', '入口版本为 " + OLD + "（实 '", 'v2100v 入口版本'),
    ("assert(ver2110 === '" + OLD + "', '入口版本为 " + OLD + "（实 '", 'v2110 入口版本'),
    ("assert(VER2800 === '" + OLD + "', '入口 VERSION = " + OLD + "（实 '", 'v2800 入口 VERSION'),
]

log = []
ok = True
for pat, why in PATTERNS:
    n = s.count(pat)
    if n != 1:
        log.append('ABORT [%s]: 锚点命中 %d 次（要求恰好 1）' % (why, n))
        ok = False
        continue
    s = s.replace(pat, pat.replace(OLD, NEW))
    log.append('OK   [%s]' % why)

if ok:
    io.open(P, 'w', encoding='utf-8').write(s)
    log.append('已写回；本文件剩余 %s 出现次数 = %d（历史叙述行，非版本期望锚点）'
               % (OLD, s.count(OLD)))
else:
    log.append('未写回（有锚点不唯一）')

print('\n'.join(log))
print('ALL_OK' if ok else 'HAS_ABORT')
sys.exit(0 if ok else 1)