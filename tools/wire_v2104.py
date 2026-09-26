# -*- coding: utf-8 -*-
# v2.104.0：把负控制审计接入 tests/run.js（真消费两个新模块 ⇒ 不是孤儿）
import io, sys

P = '/tmp/wa_git/tests/run.js'
s = io.open(P, encoding='utf-8').read()

ANCHOR = """  }

  }  // ── 汇总 ──"""

NEW = """  }

  // ── v2.104.0（计划一 #2）：负控制锚点的自动化审计 —— 「锚点还准不准」不该只由各锁自己说了算 ──
  //   治的病：本仓每版手写 25+ 条破坏锚点，而「锚点是否唯一」「判据里有没有抄锚点串（自我指涉）」
  //   「锚点指向的文件还读不读得到」这些性质，此前**只有各锁自己在运行时自查一遍**：
  //     ① 口径散落在 61 个 runNegative 里——改一处口径只管一把锁；
  //     ② 谁都没统计过「全仓到底有多少把锁的负控制是可静态审计的」——「不可审计的那部分」
  //        从来不是一个可读的数字，于是它等于不存在。
  //   本面把锚点的静态性质收敛成**一次全仓审计**，并**如实分四档**（uniform / non-uniform /
  //   unloadable / pending）：三档之外的「正在装载中」也必须是可读的一档 —— 否则一把锁会因为
  //   「谁先 require」而被静默归进另一档（本版实测踩到：自己的专锁作入口时正是如此）。
  //   两条否决式口径与 v2.103.0（O16）同族：**零命中不得算通过**、**装载失败不得静默跳过**。
  section('v2.104.0（计划一 #2）：负控制锚点静态审计（四档可见 + 零命中/装载失败否决）');
  {
    const nca = require('./negative-control-audit.js');
    const d = nca.discover();
    // 四档**必须打出来**：这正是「看得见」与「看不见」的分界
    console.log('  锁 ' + d.locks + '（统一 ' + d.uniform + ' / 非统一 ' + d.nonUniform
      + ' / 装载不了 ' + d.unloadable + ' / 装载中 ' + d.pending + '）'
      + ' · 被审锚点 ' + d.anchors + ' 条 · 问题 ' + d.problems + ' 条');
    assert(d.locks + 0 === d.uniform + d.nonUniform + d.unloadable + d.pending,
      'v2104: 四档相加 = 锁总数（不许有落不进档的锁）');
    assert(d.unloadable === 0,
      'v2104: 零「装载不了」的锁——装载失败必须如实记档，不得静默跳过');
    assert(d.problems === 0,
      'v2104: 全仓锚点问题 0 条（非 0 时按 kind 归因：shape / not-unique / impure / empty-anchors …）');
    assert(d.uniform >= 10 && d.anchors >= 100,
      'v2104: 审计面非空（统一锁 ≥10 / 锚点 ≥100）——空表上的「健康」恒真');

    // 专锁（A 静态 / B 运行时 / C 不变式 / N 负控制）
    require('./negative-control-audit-v2104.js').runAll(assert);
  }

  }  // ── 汇总 ──"""

if s.count(ANCHOR) != 1:
    print('ABORT 汇总锚点命中 %d 次' % s.count(ANCHOR)); sys.exit(1)
s = s.replace(ANCHOR, NEW)
io.open(P, 'w', encoding='utf-8').write(s)
print('OK run.js 接入 v2.104.0 section')