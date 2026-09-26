#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.105.0（计划一 #3）：把「门禁超时熔断」接入 tests/run.js。
   为什么必须接入：本仓纪律是「无消费方不挂导出」——tests/test-surface-gate.js 会把
   没人 require 的测试文件记为**孤儿**（上一版读数「孤儿 0」）。新模块与新专锁都要有消费方。
   顺手把读数**打出来**：本版治的正是「门禁会不会卡死」是一条**没有读数的命题**。
   纪律：锚点恰中 1 次，不满足即整体放弃。"""
import io, sys, hashlib

P = '/tmp/wa_git/tests/run.js'
src = io.open(P, encoding='utf-8').read()
orig = src

ANCHOR = "  }  // ── 汇总 ──\n"

SECTION = r"""  // ── v2.105.0（计划一 #3）：门禁超时熔断 —— 「门禁会不会卡死」不该是一条没有读数的命题 ──
  //   治的病：run.js 的 10 个 spawnSync 调用点此前**无一**声明 timeout（唯一的兜底是外层
  //   isolated-runner 的 10 分钟 SIGKILL，而全量回归实测 6~8 分钟 ⇒ 余量不足一倍）；
  //   真被强杀时日志里只剩一行 "Status: runner-failed"，卡在哪一道门禁、卡死前最后说了
  //   什么，全部丢失 —— 这三件事正是本版要变成**读数**的东西。
  //   阈值口径：**不许照抄计划里的 3s / 20s / 5s** —— 实测最重门禁 12s、export-contract 0.58s，
  //   故预算 =「最重那道门禁实测 × 8」= 96000ms，全表统一（多一档就多一处会漂移的地方；
  //   本版第一次落盘正是「表算 96s、现场写 90s」两套预算并存，故把自洽钉成可调用判据）。
  section('v2.105.0（计划一 #3）：门禁超时熔断（10 个调用点全部武装 + 卡死取证块 + 逐站点现场核对）');
  {
    const gt = require('./gate-timeout.js');
    const d = gt.discover();
    // 读数**必须打出来**：看不见的东西等于不存在
    console.log('  ' + d.summary);
    console.log('    · 现场读数（run.js 自身）：调用点 ' + d.siteStats.sites + ' / 武装点 '
      + d.siteStats.armedSites + ' / 预算处 ' + d.siteStats.budget
      + ' · 形态 ' + JSON.stringify(d.modeCounts)
      + ' · 另有一道外部命令形态的 shell 侧保险丝 ' + d.limits.shellMs + 's');
    assert(d.siteStats.sites === d.armedSites && d.armedSites === d.siteStats.budget,
      'v2105: 现场三数相等（调用点 = 武装点 = 预算处，实 ' + d.siteStats.sites + '/'
      + d.siteStats.armedSites + '/' + d.siteStats.budget + '）——留一个没声明的调用点就是留一条静默挂起的路径');
    assert(d.armedCount === d.sites.length && d.sites.length >= 8,
      'v2105: 武装表与现场站点清单同长（' + d.armedCount + ' vs ' + d.sites.length + '）——空表上的「全部有 timeout」恒真');
    assert(d.limits.spawnMs >= 60000 && d.limits.spawnMs <= 300000 && d.limits.shellMs >= 60,
      'v2105: 预算落在判据区间内（' + d.limits.spawnMs + 'ms / shell 保险丝 ' + d.limits.shellMs + 's）'
      + ' —— 不许紧贴实测，也不许大到等于没有超时');
    assert(d.coherence.length === 0, 'v2105: 自洽（' + d.coherenceSummary + '）——现场只读一个预算');
    const mc = d.modeCounts;
    assert(mc['spawn+shell'] === 1 && mc['spawn-only'] === 1,
      'v2105: 三档形态齐备（' + JSON.stringify(mc) + '）——外部命令形态不许被静默抹平成普通 spawn，'
      + '也不许假装 spawnSync 的 timeout 能中断外部命令本身（如实记为 spawn-only）');

    // 现场逐站点核对：**逐站点**才算（「别处还有 timeout」不构成该站点已武装）
    const runSrc = require('fs').readFileSync(__filename, 'utf8');
    const located = gt.ARMED_SITES.filter(function (s) { return !!gt.findSiteBlock(runSrc, s.anchor); });
    assert(located.length === gt.ARMED_SITES.length,
      'v2105: 现场 ' + gt.ARMED_SITES.length + ' 个调用点全部可按锚点定位（实 ' + located.length + '）');
    const unarmed = gt.ARMED_SITES.filter(function (s) {
      const b = gt.findSiteBlock(runSrc, s.anchor);
      return !b || !/(?:^|[^\w])timeout: \d+/.test(b.text);
    });
    assert(unarmed.length === 0,
      'v2105: 每个调用点**自己的**整段 options 里都有 timeout（缺的：'
      + ((unarmed.map(function (s) { return s.key; }).join(',')) || '无') + '）——病根是否复发就看这一条');
    const fuse = gt.findSiteBlock(runSrc, gt.ARMED_SITES[3].anchor);
    assert(!!fuse && fuse.text.indexOf(String(d.limits.shellMs) + ' tar') > 0 && fuse.text.indexOf('-k ') > 0,
      'v2105: 管道形态的调用点另有 `timeout -k <grace> ' + d.limits.shellMs + ' tar` 保险丝'
      + '（缺 -k 只杀写端、读端照挂）');

    // 专锁（A 静态 / B 运行时 / C 不变式 / N 负控制）
    require('./gate-timeout-v2105.js').runAll(assert);
  }

"""

if src.count(ANCHOR) != 1:
    print('ABORT 插入锚点命中 %d 次（要求 1）:: 汇总块' % src.count(ANCHOR))
    sys.exit(1)
# 幂等守卫口径要窄：run.js 里本来就有 patch B 留下的 `tests/gate-timeout.js` 注释字样，
#   拿 'gate-timeout' 做守卫会把注释当「已接入」而误报。真判据是**消费方**挂没挂。
if src.count("require('./gate-timeout.js')") != 0 or "v2.105.0（计划一 #3）" in src:
    print('ABORT 疑似重复执行：消费方已挂')
    sys.exit(1)

src = src.replace(ANCHOR, SECTION + ANCHOR)

if src.count("require('./gate-timeout.js')") != 1 or src.count("require('./gate-timeout-v2105.js')") != 1:
    print('ABORT 消费方没挂上')
    sys.exit(1)
io.open(P, 'w', encoding='utf-8').write(src)
print('OK 已接入 tests/run.js（%d → %d 字节，+%d）' % (len(orig), len(src), len(src) - len(orig)))
print('  md5 %s' % hashlib.md5(src.encode('utf-8')).hexdigest())