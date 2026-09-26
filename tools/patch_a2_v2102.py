#!/usr/bin/env python3
# WorldAxis v2.102.0 / A2 — 把 engines/perf-trace.js 接进两条装载链
#
# 纪律（本仓惯例）：
#   · 每个补丁先落盘 .py 再执行（禁 heredoc 内嵌 python3 -c）；
#   · rep() 带 expect（默认 1），命中数不符当场 SystemExit（宁可失败，不许静默多改）；
#   · 执行后核对锚点命中数与落盘行数。
import io
import os
import sys

ROOT = '/tmp/wa_git'


def rep(path, old, new, tag, expect=1):
    p = os.path.join(ROOT, path)
    with io.open(p, 'r', encoding='utf-8') as f:
        s = f.read()
    n = s.count(old)
    if n != expect:
        raise SystemExit('[%s] 锚点命中 %d 次（期望 %d）: %r' % (tag, n, expect, old[:80]))
    with io.open(p, 'w', encoding='utf-8') as f:
        f.write(s.replace(old, new))
    print('[ok] %-22s %s (命中 %d)' % (tag, path, n))


RUN_ANCHOR = "  'engines/interop.js',\n"
RUN_NEW = ("  'engines/interop.js',\n"
           "  // v2.102.0（A2 = O12）：性能基线与分层增量（纯内存观测）。位置与 index.js LOAD_ORDER 同序，\n"
           "  //   须**晚于** render/inject.js 与 engines/tool-diag.js —— 它读的是这两处的现场出口\n"
           "  //   （visibilityStat / buildWorldSnapshot / collect），先于它们装载只会把四个面一律判成缺席。\n"
           "  'engines/perf-trace.js',\n")

IDX_ANCHOR = "    'engines/interop.js',\n"
IDX_NEW = ("    'engines/interop.js',\n"
           "    // v2.102.0（A2 = O12）：性能基线与分层增量（纯内存观测：不写存档、不落盘）。\n"
           "    //   为什么必须**最后**（与 interop 并列在 compat 之后、ui 之前）：它测的四个面全是既有出口——\n"
           "    //   render.visibilityStat / render.buildWorldSnapshot / toolDiag.collect / canon.alignView，\n"
           "    //   不是自己另探一遍；先于它们装载只会让基线一律落到「模块缺席」。\n"
           "    'engines/perf-trace.js',\n")

rep('tests/run.js', RUN_ANCHOR, RUN_NEW, 'run.js LOAD')
rep('index.js', IDX_ANCHOR, IDX_NEW, 'index.js LOAD_ORDER')
print('done')
