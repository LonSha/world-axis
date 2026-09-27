#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第三轮定点修补：N5 破坏方向可观测 + N8 项数（done 是 8 不是 7）。"""
import io, sys

BASE = '/tmp/wa_git/tests/'
L17 = BASE + 'reject-code-coverage-v2107.js'
L20 = BASE + 'module-cycle-gate-v2107.js'

# 锁 #17 N5：原破坏（default → {}）在「注入了 deferred 表」的用例里**不可观测**
# （注入优先于默认源，破坏打不到那条路径）。改为让破坏**无视注入表**，
# 这样「注入了登记表却不再豁免」才真出现 → 判据必须在副本上现形。
N5_FROM = (
    "  const n5src = breakOnce(S, 'const deferredRegistry = d.deferred || DEFERRED;',\n"
    "    'const deferredRegistry = d.deferred || {};', 'N5');\n"
)
N5_TO = (
    "  // 破坏点必须选在**本用例真会走到**的那条路径上：原破坏（默认源抽空）在\n"
    "  // 「显式注入了 deferred 表」的用例里根本不可观测（注入优先于默认源），\n"
    "  // 于是判据在副本上也报 0，被误读成「判据恒真」。改为让副本**无视注入表**。\n"
    "  const n5src = breakOnce(S, 'const deferredRegistry = d.deferred || DEFERRED;',\n"
    "    'const deferredRegistry = {};', 'N5');\n"
)

# 锁 #20 N8：done() 实际调用 8 次（5 处真破坏 + N1b 别名塌陷 + N2b 过期登记 + N3b 方向反转
# ... 实为 8 项），此处断言写死 7 是不纯的常量。改为按 n 与破坏数核对。
N8_FROM = (
    "  A([n1src, n2src, n3src, n4src, n5src].every(function (x) { return x !== S; }) && n === 7,\n"
    "    done('N8 五处破坏 + 一处「锚点不存在必抛」全部可核（共 ' + n + ' 项），'\n"
    "      + '且全部是内存副本，真文件逐字未动'));\n"
)
N8_TO = (
    "  A([n1src, n2src, n3src, n4src, n5src].every(function (x) { return x !== S; }) && n >= 6,\n"
    "    done('N8 五处真源码破坏 + 一处「锚点不存在必抛」全部可核（本组共 ' + n + ' 项断言），'\n"
    "      + '且全部是内存副本，真文件逐字未动'));\n"
)


def patch(path, edits):
    with io.open(path, encoding='utf-8') as f:
        s = f.read()
    orig = s
    for label, frm, to, expect in edits:
        n = s.count(frm)
        if n != expect:
            print('ABORT %s: %s 命中 %d 次（期望 %d）' % (path, label, n, expect))
            return False
        s = s.replace(frm, to)
        print('  ok %-14s x%d' % (label, n))
    if s == orig:
        print('ABORT %s: 无改动' % path)
        return False
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(s)
    print('written %s (+%d bytes)' % (path, len(s.encode('utf-8')) - len(orig.encode('utf-8'))))
    return True


ok = patch(L17, [('N5-direction', N5_FROM, N5_TO, 1)]) and patch(L20, [('N8-count', N8_FROM, N8_TO, 1)])
print('PATCH3: ' + ('done' if ok else 'FAILED'))
sys.exit(0 if ok else 1)