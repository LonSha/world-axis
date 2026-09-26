# -*- coding: utf-8 -*-
# v2.104.0 计划一 #2：给负控制审计加第四档 pending（治「审计 require 到正在装载中的文件」）
#
# 【它治的病】审计在**专锁自己作入口**时会被 require 环咬到：
#   negative-control-audit-v2104.js（入口）
#     → require('./negative-control-audit.js')      （A 模块开始装载，cache 里 loaded=false）
#       → audit() → require('negative-control-audit-v2104.js')（回到入口，in-flight）
#         → 读到的是一个 **尚未完成** 的 module.exports ⇒ `mod.ANCHORS` 为 undefined
#   ⇒ 后果一：Node 打 4 条 circular-dependency 警告（Accessing non-existent property 'ANCHORS'）；
#   ⇒ 后果二：这把锁被平白归进「非统一」档，**归类结果依赖运行顺序**（自跑 / 被 run.js 跑，
#     同一个文件得到两种形态）。这正是本版（以及 v2.103.0 的 O16）反复治的同一族病：
#     **看不见的东西被当成「没问题」**。
# 【处置】加第四档 `pending`：require.cache 里存在且 `loaded !== true` 即如实记为 pending，
#   既不静默跳过，也不误判成 unloadable（能读、能判是锁，只是此刻不在可读 exports 状态）。
#   四档相加必须等于锁总数——「不许有落不进档的锁」这条判据保持成立。
import io, sys

P = '/tmp/wa_git/tests/negative-control-audit.js'
s = io.open(P, encoding='utf-8').read()
n_ok = 0


def sub1(anchor, repl, tag):
    global s, n_ok
    n = s.count(anchor)
    if n != 1:
        print('ABORT %s :: 命中 %d 次（要求恰好 1）' % (tag, n))
        sys.exit(1)
    s = s.replace(anchor, repl)
    n_ok += 1
    print('OK %s' % tag)


# ── 1. 形态表加第四档 ──
sub1(
    "const KINDS = { UNIFORM: 'uniform', NON_UNIFORM: 'non-uniform', UNLOADABLE: 'unloadable' };",
    "const KINDS = { UNIFORM: 'uniform', NON_UNIFORM: 'non-uniform', UNLOADABLE: 'unloadable',\n"
    "  PENDING: 'pending' };   // pending = 此刻正在装载中（见下方 auditLock 的 in-flight 守卫）",
    'KINDS')

# ── 2. require 前置 in-flight 守卫 ──
sub1(
    "  let mod = null;\n"
    "  try { mod = require(path.join(TESTS, file)); }\n"
    "  catch (e) {",
    "  // in-flight 守卫：被审计文件**此刻正在装载中**（专锁自己作入口时必经此处）⇒\n"
    "  // 它的 exports 尚未完成，`mod.ANCHORS` 读到 undefined，会平白多出一档「非统一」并把\n"
    "  // 归类结果绑在运行顺序上。如实记为 pending——既不是静默跳过，也不是 unloadable。\n"
    "  const abs = path.join(TESTS, file);\n"
    "  const cached = require.cache[abs];\n"
    "  if (cached && cached.loaded !== true) {\n"
    "    return { file: file, kind: KINDS.PENDING, anchors: 0, problems: [] };\n"
    "  }\n"
    "  let mod = null;\n"
    "  try { mod = require(abs); }\n"
    "  catch (e) {",
    'in-flight 守卫')

# ── 3. 汇总加 pending ──
sub1(
    "  const unloadable = locks.filter(function (l) { return l.kind === KINDS.UNLOADABLE; });",
    "  const unloadable = locks.filter(function (l) { return l.kind === KINDS.UNLOADABLE; });\n"
    "  const pending = locks.filter(function (l) { return l.kind === KINDS.PENDING; });",
    'audit pending 分档')

sub1(
    "      unloadable: unloadable.length,\n",
    "      unloadable: unloadable.length,\n"
    "      pending: pending.length,\n",
    'summary pending')

# ── 4. discover 透出 pending ──
sub1(
    "    unloadable: r.summary.unloadable,\n",
    "    unloadable: r.summary.unloadable,\n"
    "    pending: r.summary.pending,\n",
    'discover pending')

io.open(P, 'w', encoding='utf-8').write(s)
print('WROTE %s （%d 处锚点全部恰中 1 次）' % (P, n_ok))
