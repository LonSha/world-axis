#!/usr/bin/env python3
# WorldAxis v2.102.0（A2 = O12）回填补丁 D：把 tests/run.js 的硬读数锚点对齐现场。
#
# 现场读数（本版实跑采集，单一来源 = tests/inventory.js + 各账本 + 出口面契约）：
#   refs 2587→2631（+44）   命名空间 114→115（+1）   成员 1322→1349（+27）
#   dead 445→454（+9）      uiDead 4（不变）        dataOnly 167→169（+2）
#   deadInTests 293（不变） 账本条目 449→458（+9）  归因 self-only 120→129（+9）
#   出口面 ns= 108→109 / members= 678→694 / chars= 8147→8296
#   模块注册 命名空间 119→120 / 文件 111→112
#
# 为什么 +9 死口而不是先行预期的 +12：本轮把 slots / baseline / curveAll **接进了
#   面板的两个真出口**（缓存槽透视 + 「上次真算于」），于是它们不再零引用；
#   另把 mark / dirtyOf / consume / ensure / fingerprint / coldWarmCheck / bench /
#   benchAll / noteSpan 九口如实登记为 self-only（内部自用、外部零引用 = 过度导出）。
#
# 纪律（本仓踩过两次的坑）：
#   ① 比较值与消息必须**同批改**：只改比较值不改消息，或反之，都会造成「消息与实值相同
#      却报红」的假红。
#   ② 锚点一律取**单行短串**（多行锚点要逐字符猜缩进，命中率低且失败信息难读）。
import io, sys

P = '/tmp/wa_git/tests/run.js'
src = io.open(P, encoding='utf-8').read()
orig = src
n = 0


def rep(old, new, tag):
    global src, n
    c = src.count(old)
    if c != 1:
        sys.exit('[patch_d] 锚点命中数不符 (%d != 1) :: %s\n  anchor: %r' % (c, tag, old))
    src = src.replace(old, new, 1)
    n += 1
    print('  ok  %s' % tag)


# ── 第一组：清册面现场值（三处各改比较值与消息） ──
rep("assert(r2700.namespaces === 114 && r2700.members === 1322,",
    "assert(r2700.namespaces === 115 && r2700.members === 1349,", 'N1 r2700 比较值')
rep("定义面 114 命名空间 / 1322 成员（v2.101.0",
    "定义面 115 命名空间 / 1349 成员（v2.102.0（A2/O12）：新增 engines/perf-trace.js（27 导出：21 口 + 6 枚只读数据成员），其中 partial 一口接面板真消费方；v2.101.0",
    'N1b r2700 消息')

rep("assert(r2800.refs === 2587 && r2800.namespaces === 114 && r2800.members === 1322,",
    "assert(r2800.refs === 2631 && r2800.namespaces === 115 && r2800.members === 1349,", 'N2 r2800 比较值')
rep("清册面（refs 2587 / 命名空间 114 / 成员 1322，v2.101.0",
    "清册面（refs 2631 / 命名空间 115 / 成员 1349，v2.102.0（A2/O12）：engines/perf-trace.js 新增且 partial 接面板真消费方 ⇒ refs +44 / 命名空间 +1 / 成员 +27；v2.101.0",
    'N2b r2800 消息')

rep("assert(r2900.refs === 2587 && r2900.namespaces === 114 && r2900.members === 1322,",
    "assert(r2900.refs === 2631 && r2900.namespaces === 115 && r2900.members === 1349,", 'N3 r2900 比较值')
rep("清册面（refs 2587 / 命名空间 114 / 成员 1322）——真代码口径下的现场值（v2.101.0",
    "清册面（refs 2631 / 命名空间 115 / 成员 1349）——真代码口径下的现场值（v2.102.0（A2/O12）：engines/perf-trace.js；v2.101.0",
    'N3b r2900 消息')

# ── 第二组：refs 单值（D1 已落地过一次；此处仅兜「若已被改则跳过」） ──
if src.count("r2700.refs === 2631") != 1:
    rep("assert(r2700.refs === 2587, '现场静态引用 2587 处（真代码口径，实 ' + r2700.refs + '；",
        "assert(r2700.refs === 2631, '现场静态引用 2631 处（真代码口径，实 ' + r2700.refs + '；v2.102.0（A2/O12）：性能面 partial 一口接面板真消费方 ⇒ refs +44 / 命名空间 +1 / 成员 +27；",
        'N4 r2700.refs')
else:
    print('  --  N4 r2700.refs 已落地，跳过')

# ── 第三组：死子面（三处，比较值 + 消息） ──
rep("assert(r2700.dead.length === 445 && r2700.uiDead.length === 4 && r2700.dataOnly.length === 167,",
    "assert(r2700.dead.length === 454 && r2700.uiDead.length === 4 && r2700.dataOnly.length === 169,",
    'N5 r2700 死子面比较值')
rep("死子面 dead 445 / uiDead 4 / dataOnly 167（v2.101.0",
    "死子面 dead 454 / uiDead 4 / dataOnly 169（v2.102.0（A2/O12）：perf-trace 九口如实登记为 self-only（内部自用、外部零引用 = 过度导出），另六枚只读数据成员 ⇒ dataOnly +2；其中 slots / baseline / curveAll 已接面板真消费方故不在此列；v2.101.0",
    'N5b r2700 死子面消息')

rep("assert(r2800.dead.length === 445 && r2800.uiDead.length === 4 && r2800.dataOnly.length === 167",
    "assert(r2800.dead.length === 454 && r2800.uiDead.length === 4 && r2800.dataOnly.length === 169",
    'N6 r2800 死子面比较值')
rep("现场锚点（dead 445 / uiDead 4 / dataOnly 167 / 仅测试 293，v2.101.0",
    "现场锚点（dead 454 / uiDead 4 / dataOnly 169 / 仅测试 293，v2.102.0：perf-trace 九口 self-only + 六枚数据成员；v2.101.0",
    'N6b r2800 死子面消息')

rep("assert(r2900.dead.length === 445 && r2900.uiDead.length === 4 && r2900.dataOnly.length === 167",
    "assert(r2900.dead.length === 454 && r2900.uiDead.length === 4 && r2900.dataOnly.length === 169",
    'N7 r2900 死子面比较值')

# ── 第四组：账本键数 / advisory / 条目数 / 归因分布 ──
rep("assert(Object.keys(led2700.dead).length === 445 && Object.keys(led2700.uiDead).length === 4,",
    "assert(Object.keys(led2700.dead).length === 454 && Object.keys(led2700.uiDead).length === 4,",
    'N8 led2700 键数')
rep("assert(led2700.advisory && led2700.advisory.dataOnly === 167, 'advisory 面只记计数不拦截（dataOnly=167，v2.101.0",
    "assert(led2700.advisory && led2700.advisory.dataOnly === 169, 'advisory 面只记计数不拦截（dataOnly=169，v2.102.0：perf-trace 六枚只读数据成员 +2；v2.101.0",
    'N9 led2700 advisory')
rep("assert(allEnt2800.length === 449, '账本条目 449 条（v2.101.0",
    "assert(allEnt2800.length === 458, '账本条目 458 条（v2.102.0：perf-trace 九口如实登记 self-only ⇒ 449 + 9 = 458；v2.101.0",
    'N10 allEnt2800')
rep("assert(dist2800['test-only'] === 297 && dist2800['self-only'] === 120 && dist2800['unwired'] === 32,",
    "assert(dist2800['test-only'] === 297 && dist2800['self-only'] === 129 && dist2800['unwired'] === 32,",
    'N11 dist2800 比较值')
rep("'归因分布 test-only 297 / self-only 120 / unwired 32（v2.101.0",
    "'归因分布 test-only 297 / self-only 129 / unwired 32（v2.102.0：perf-trace 九口 self-only ⇒ 120 + 9 = 129；v2.101.0",
    'N11b dist2800 消息')
rep("assert(led2900.advisory && led2900.advisory.dataOnly === 167, 'advisory 只记计数（dataOnly 167，v2.101.0",
    "assert(led2900.advisory && led2900.advisory.dataOnly === 169, 'advisory 只记计数（dataOnly 169，v2.102.0：perf-trace 六枚只读数据成员 +2；v2.101.0",
    'N12 led2900 advisory')
rep("v2.101.0：interop 五枚数据成员 +4；v2.99.0：canon.LIMITS +1）",
    "v2.102.0：perf-trace 六枚只读数据成员 +2；v2.101.0：interop 五枚数据成员 +4；v2.99.0：canon.LIMITS +1）",
    'N12b advisory 尾注')

# ── 第五组：出口面契约常量 + 端到端读数 ──
rep("const EC2430 = 'ns= 108 members= 678 chars= 8147';",
    "const EC2430 = 'ns= 109 members= 694 chars= 8296';", 'N13 EC2430')
rep("'命名空间 119'", "'命名空间 120'", 'N14 命名空间 119→120')
rep("'文件 111'", "'文件 112'", 'N15 文件 111→112')
rep("v2830/mr: 端到端读数含「命名空间 119",
    "v2830/mr: 端到端读数含「命名空间 120", 'N15b 端到端消息')

# ── 第六组：FROZEN2800（唯一真源 = tests/export_contract.txt，逐字重建） ──
ec = io.open('/tmp/wa_git/tests/export_contract.txt', encoding='utf-8').read()
a = src.index("    const FROZEN2800 = '")
b = src.index("';\n", a) + len("';\n")
src = src[:a] + "    const FROZEN2800 = '" + ec + "';\n" + src[b:]
n += 1
print('  ok  N16 FROZEN2800 按现场契约串逐字重建（%d 字符）' % len(ec))

if src == orig:
    sys.exit('[patch_d] 无任何改动，拒绝写出')
io.open(P, 'w', encoding='utf-8').write(src)
print('[patch_d] %d 处补丁全部落地，写出 %d 字节（原 %d）' % (n, len(src), len(orig)))