#!/usr/bin/env python3
# WorldAxis v2.102.0 收口补丁 E：处理「升版后才暴露」的 9 项失败 + 我引入的两处消息重复。
#
# 9 项失败的性质完全一致：**历史套件把「入口版本号」钉死在 2.101.0**。
#   这是本仓每版收口的固有动作（R84 那条路径也踩过同型）：版本号是**单一真源**
#   （index.js 的 VERSION），各套件只许「随当前版本升级」跟着走，不得各自为政。
#   故这里只做机械替换 2.101.0 → 2.102.0（**只替换作为版本断言的场合**），
#   不动任何历史叙述文本。
import io, sys, os

BASE = '/tmp/wa_git'


def patch(path, pairs):
    p = os.path.join(BASE, path)
    s = io.open(p, encoding='utf-8').read()
    orig = s
    for i, (old, new, expect) in enumerate(pairs, 1):
        c = s.count(old)
        if c != expect:
            sys.exit('[patch_e] %s #%d 锚点命中数不符 (%d != %d)\n  anchor: %r' % (path, i, c, expect, old))
        s = s.replace(old, new, expect)
        print('  ok  %-40s #%d' % (path, i))
    if s == orig:
        sys.exit('[patch_e] %s 无任何改动，拒绝写出' % path)
    io.open(p, 'w', encoding='utf-8').write(s)


# ── 1. tests/run.js：七处「入口版本断言」+ 一处账本条数消息 + 两处我引入的重复 ──
patch('tests/run.js', [
    # 七处版本断言（比较值与消息同批改 —— 本仓既有纪律）
    ("assert(verF2500 === '2.101.0' && mfF2500.version === verF2500,",
     "assert(verF2500 === '2.102.0' && mfF2500.version === verF2500,", 1),
    ("assert(verF2600 === '2.101.0', '入口与清单同源同值（实 ' + verF2600 + '）');",
     "assert(verF2600 === '2.102.0', '入口与清单同源同值（实 ' + verF2600 + '）');", 1),
    ("assert(ver === '2.101.0', '入口版本为 2.101.0（实 ' + ver + '）');",
     "assert(ver === '2.102.0', '入口版本为 2.102.0（实 ' + ver + '）');", 1),
    ("assert(ver2800 === '2.101.0', '入口版本为 2.101.0（实 ' + ver2800 + '）');",
     "assert(ver2800 === '2.102.0', '入口版本为 2.102.0（实 ' + ver2800 + '）');", 1),
    ("assert(ver2900 === '2.101.0', '入口版本为 2.101.0（实 ' + ver2900 + '）');",
     "assert(ver2900 === '2.102.0', '入口版本为 2.102.0（实 ' + ver2900 + '）');", 1),
    ("assert(ver2100v === '2.101.0', '入口版本为 2.101.0（实 ' + ver2100v + '）');",
     "assert(ver2100v === '2.102.0', '入口版本为 2.102.0（实 ' + ver2100v + '）');", 1),
    ("assert(ver2110 === '2.101.0', '入口版本为 2.101.0（实 ' + ver2110 + '）');",
     "assert(ver2110 === '2.102.0', '入口版本为 2.102.0（实 ' + ver2110 + '）');", 1),
    ("assert(VER2800 === '2.101.0', '入口 VERSION = 2.101.0（实 ' + VER2800 + '）');",
     "assert(VER2800 === '2.102.0', '入口 VERSION = 2.102.0（实 ' + VER2800 + '）');", 1),
    # 账本条数消息里的版本归因（实值 454/4 已在前一轮改对，此处只把版本词补上本版注明）
    ("'账本条目数与现场一致（dead 445 / uiDead 4，v2.101.0）');",
     "'账本条目数与现场一致（dead 454 / uiDead 4，v2.102.0）');", 1),
    # 我引入的两处消息重复（patch_d 与已有文本拼接时的重复片段）
    ("'advisory 面只记计数不拦截（dataOnly=169，v2.102.0：perf-trace 六枚只读数据成员 +2；v2.102.0：perf-trace 六枚只读数据成员 +2；v2.101.0：interop 五枚数据成员 +4；v2.99.0：canon.LIMITS +1）'",
     "'advisory 面只记计数不拦截（dataOnly=169，v2.102.0：perf-trace 六枚只读数据成员 +2；v2.101.0：interop 五枚数据成员 +4；v2.99.0：canon.LIMITS +1）'", 1),
    # r2900 死子面消息仍留着 v2.101.0 的实值（比较值已对，消息未同步）
    ("'死子面 dead 445 / uiDead 4 / dataOnly 167 / 仅测试 293（v2.101.0：interop 一死口 + 五数据成员；",
     "'死子面 dead 454 / uiDead 4 / dataOnly 169 / 仅测试 293（v2.102.0：perf-trace 九口 self-only + 六枚数据成员；v2.101.0：interop 一死口 + 五数据成员；", 1),
])

# ── 2. tests/reject-lock-v2780.js：台账 version 断言随版本走 ──
patch('tests/reject-lock-v2780.js', [
    ("led.version === '2.101.0'", "led.version === '2.102.0'", 1),
])

print('[patch_e] 全部落地')