#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.103.0 (A3 = O16) — 把可选依赖专锁接入 run.js（治孤儿 + 落三档可见性）。

锚点：run.js 末段 `}` ＋ `  }  // ── 汇总 ──`
做法：在其前插入新 section。
"""
import sys

P = '/tmp/wa_git/tests/run.js'
src = open(P, encoding='utf-8').read()

ANCHOR = "  }  // ── 汇总 ──"
if src.count(ANCHOR) != 1:
    print('!! 锚点命中 %d 次（期望 1）—— 整体放弃' % src.count(ANCHOR))
    sys.exit(1)

BLOCK = """  // ══════════ v2.103.0（A3 = O16）══════════
  // 第五十九面（O16 首刀）：可选依赖可见性治理。
  //   治的病：「缺依赖 ⇒ 静默 skip ⇒ 门禁全绿」。本仓曾有 10 处
  //     `try{require('jsdom')}catch{null}` + `if(!JSDOM){console.log('⚠ 跳过')}`，
  //   缺依赖时端到端一条不跑、回归照绿，且 pass 计数**更低** —— 没有任何一处会告诉你
  //   「本次绿灯比上次少跑了 N 条断言」。判据的绿，建立在自己没跑这件事上。
  //   处置：替身（tests/ui-dom.js 的 JSDOMShim，与 jsdom 同形）顶上；依赖从可选且静默
  //   变成可选且可见（三档 full/fallback/missing）。
  section('v2.103.0（A3 = O16）：可选依赖可见性（三档 + 零依赖替身）');
  {
    const dg2103 = require('./dependency-guard.js');
    const p2103 = dg2103.probe();
    // 三档可见性：**必须打出来** —— 这正是「静默」与「可见」的分界。
    p2103.deps.forEach(function (d) {
      const tag = d.tier === dg2103.TIERS.FULL ? '✓ 全覆盖'
        : d.tier === dg2103.TIERS.FALLBACK ? '⚠ 降级通过（走零依赖替身）' : '✗ 关键依赖缺失';
      console.log('  ' + tag + '：' + d.name + '（how=' + d.how + '）');
      if (d.tier === dg2103.TIERS.FALLBACK) console.log('      替身：' + d.fallback);
      if (d.tier === dg2103.TIERS.MISSING) console.log('      ⇒ 受影响面必须报红，不许静默放行：' + d.affects.join('、'));
    });
    assert(p2103.summary.missing === 0,
      'v2103: 零「关键依赖缺失」（既无依赖也无替身 ⇒ 该块必须报红）');
    assert(p2103.deps.every(function (d) { return d.tier === dg2103.TIERS.FULL || d.tier === dg2103.TIERS.FALLBACK; }),
      'v2103: 每项依赖都落在 full / fallback 两档之一（不存在第三态）');
    assert(typeof dg2103.registry === 'function' && dg2103.registry().length >= 1,
      'v2103: 登记表非空（空表上的三档结论恒真）');

    // 专锁（A 静态 / B 运行时 / C 不变式 / N 负控制）
    const lock2103 = require('./dependency-guard-v2103.js');
    lock2103.runAll(assert);
  }

"""

src = src.replace(ANCHOR, BLOCK + ANCHOR)
open(P, 'w', encoding='utf-8').write(src)
print('已插入 section，锚点剩余 =', src.count(ANCHOR))
print('JSDOMShim 引用数 =', src.count("require('./ui-dom.js').JSDOMShim"))