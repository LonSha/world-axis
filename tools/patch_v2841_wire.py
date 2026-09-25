#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 tests/settle-v2841.js 接进真实执行链（run.js）。
纪律：锚点命中数必须为 1，否则整体放弃。锚点必须在 settle-v2830 的两个 require 之后、
  module-registry-gate 端到端块之前 —— 与既有 settle-v28xx 的落位同一惯例。"""
import io
BASE = '/tmp/wa_git'
ANCHOR = """  await require('./settle-v2830.js').runAll(assert);
  await require('./settle-v2830.js').runNegative(assert);
"""
BLOCK = """  await require('./settle-v2830.js').runAll(assert);
  await require('./settle-v2830.js').runNegative(assert);
  // v2.84.0 A3 收口：**开关组合面**与**存档兼容**。
  //   为什么还要一把新锁：tests/inject-vis-v2580.js 已逐源证明「单开关真生效」，但它的
  //   probeAll 在每个源上只翻「该源自己」那一个开关、其余全开 —— 于是三类组合至今无判据：
  //   两两关闭、全关、以及「关了 A 不许误伤 B」。第二项尤其重要：v2.58.0 的锁对
  //   「A 的关闭连累 B」这种缺陷是**瞎的**。
  //   另一半是存档兼容：本版 A2 收紧了输入边界（约 28 份 clean() 委托到 inputGuard），
  //   而没有任何判据回答「收紧之后旧存档还读不读得进」——「更严格」不得以误伤存档为代价。
  require('./settle-v2841.js').runAll(assert);
  require('./settle-v2841.js').runCompat(assert);
  require('./settle-v2841.js').runNegative(assert);
"""
def main():
    p = '%s/tests/run.js' % BASE
    src = io.open(p, encoding='utf-8').read()
    hits = src.count(ANCHOR)
    if hits != 1:
        print('中止：run.js 中锚点命中 %d 次（须为 1）' % hits)
        return 2
    if 'settle-v2841' in src:
        print('中止：run.js 已接 v2841')
        return 2
    out = src.replace(ANCHOR, BLOCK)
    io.open(p, 'w', encoding='utf-8').write(out)
    print('已改写 tests/run.js')
    n = io.open(p, encoding='utf-8').read()
    for t in ["require('./settle-v2841.js').runAll", "require('./settle-v2841.js').runCompat", "require('./settle-v2841.js').runNegative"]:
        print('  含 %-46s %s' % (t, n.count(t)))
    return 0
if __name__ == '__main__':
    import sys
    sys.exit(main())
