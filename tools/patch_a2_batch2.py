#!/usr/bin/env python3
# WorldAxis v2.84.0 A2 第二批：把 28 个引擎各自的自备 clean() 兜底**统一委托**到 core/input-guard.js。
# 为什么不是只改 8 个站点：兜底是同一个形状复制了 28 份，只改 8 处等于让另外 20 处继续升格；
# 而「统一数据边界」这句话的全部意义就是**全域只有一个形态判定**。
# 保留各自的默认上限（max || NN）：改默认值会改变调用方的既有行为，不属本批范围。
import re, sys, io

FILES = ['engines/warrant.js','engines/tolerance.js','engines/threads.js','engines/intel.js',
 'engines/survival.js','engines/spotlight.js','engines/world.js','engines/shadow.js','engines/weather.js',
 'engines/affect.js','engines/bonds.js','engines/quota.js','engines/org.js','engines/temperament.js',
 'engines/parallel-events.js','engines/masks.js','engines/marginal.js','engines/longline.js','engines/life.js',
 'engines/ladder.js','engines/karma.js','engines/hazard.js','engines/fondness.js','engines/era-cycle.js',
 'engines/enigma.js','engines/causal.js','engines/beast-bond.js','engines/appearance.js']

PAT_A = re.compile(r'function clean\(v, max\) \{ return String\(v == null \? \'\' : v\)\.replace\(/\\s\+/g, \' \'\)\.trim\(\)\.slice\(0, max \|\| (\d+)\); \}')
PAT_B = re.compile(r'function clean\(v, max\) \{ return String\(v == null \? \'\' : v\)\.split\(/\\s\+/\)\.join\(\' \'\)\.trim\(\)\.slice\(0, max \|\| (\d+)\); \}')

fail = 0
for rel in FILES:
    src = io.open(rel, encoding='utf-8').read()
    hits = PAT_A.findall(src) + PAT_B.findall(src)
    if len(hits) != 1:
        print('ANCHOR-MISS %s (hits=%d)' % (rel, len(hits))); fail += 1; continue
    default = hits[0]
    def repl(m):
        return ("function clean(v, max) { return WA.inputGuard.text(v, max || %s); }" % m.group(1))
    new = PAT_A.sub(repl, src)
    if new == src:
        new = PAT_B.sub(repl, src)
    if new == src:
        print('REPL-FAIL %s' % rel); fail += 1; continue
    io.open(rel, 'w', encoding='utf-8').write(new)
    print('OK %s (default %s)' % (rel, default))
sys.exit(1 if fail else 0)