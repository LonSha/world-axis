#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.84.0 读数同步：出口面契约读数 + 当前读数确认标记。

与 patch_v2840_ver.py 的分工：
  · 那个脚本管**同形多次出现**的断言字面量（逐个复算命中数）；
  · 本脚本管**各只出现一次**的读数与文案，因此锚点必须逐字完整（含前后缀），
    命中数 != 1 即中止——读数同步最怕的就是「改了一处、另一处还钉着旧数字」。

本版为什么这些读数会变（不是手滑，是真实增量）：
  · 出口面契约：v2.84.0 新增 core/input-guard.js（inputGuard 命名空间，6 个成员）
    + causal.settleBlockReason（B5 的真实消费者）⇒ ns 102→103 / members 574→580
    / chars 7126→7169。
  · 清册面（refs / 命名空间 / 成员）已在上一轮同步，本脚本只补「确认标记」的版本词。
"""
import io
import sys

BASE = '/tmp/wa_git'

# (锚点, 替换) —— 每项须在文件中恰中 1 次
EDITS = [
    # ── ① 出口面契约读数（唯一一处**未**同步的旧读数，r11 的唯一红行）──
    ("const EC2430 = 'ns= 102 members= 574 chars= 7126';",
     "const EC2430 = 'ns= 103 members= 580 chars= 7169';"),
    # ── ② 当前读数的确认标记：这几行描述的是**此刻**的现场值，
    #      版本词过时会让「这个读数是谁确认的」失真 ──
    ("'死子面 dead 444 / uiDead 4 / dataOnly 160（v2.83.0：新导出全部接线，死面未增长，实 '",
     "'死子面 dead 444 / uiDead 4 / dataOnly 160（v2.84.0：A2 新增的 inputGuard 导出全部接线，死面未增长，实 '"),
    ("assert(r2700.deadInTestsOnly === 291, '其中仅测试引用 291（v2.83.0：未变，实 '",
     "assert(r2700.deadInTestsOnly === 291, '其中仅测试引用 291（v2.84.0：未变，实 '"),
    ("'账本条目数与现场一致（dead 444 / uiDead 4，v2.83.0）'",
     "'账本条目数与现场一致（dead 444 / uiDead 4，v2.84.0）'"),
    ("'清册面（refs 2281 / 命名空间 109 / 成员 1216，v2.83.0 模块注册 +4）'",
     "'清册面（refs 2281 / 命名空间 109 / 成员 1216，v2.84.0 统一输入边界 +1 命名空间）'"),
    ("'清册面（refs 2281 / 命名空间 109 / 成员 1216）——真代码口径下的现场值（v2.83.0 模块注册 +4）'",
     "'清册面（refs 2281 / 命名空间 109 / 成员 1216）——真代码口径下的现场值（v2.84.0 统一输入边界 +1 命名空间）'"),
    ("'死子面 dead 444 / uiDead 4 / dataOnly 160 / 仅测试 291（v2.83.0：未变，实 '",
     "'死子面 dead 444 / uiDead 4 / dataOnly 160 / 仅测试 291（v2.84.0：未变，实 '"),
    # ── ③ EC2430 的说明注释：补上本版这一段（保留 v2.83.0 的历史出处）──
    ("    //   仍由「本次运行产物 == FROZEN2800」这条更强的断言承担。\n    const EC2430",
     "    //   仍由「本次运行产物 == FROZEN2800」这条更强的断言承担。\n"
     "    // v2.84.0：A2 统一输入边界新增 core/input-guard.js（inputGuard 命名空间 6 成员），\n"
     "    //   B5 把 causal.settleBlockReason 接上真实消费者 ⇒ 出口面 574→580 成员、7126→7169 字符。\n"
     "    const EC2430"),
]


def main():
    p = '%s/tests/run.js' % BASE
    src = io.open(p, encoding='utf-8').read()
    out = src
    bad = []
    for anchor, repl in EDITS:
        hits = out.count(anchor)
        if hits != 1:
            bad.append((anchor[:60], hits))
            continue
        out = out.replace(anchor, repl)
    if bad:
        for a, h in bad:
            print('中止：锚点命中 %d 次（须为 1）：%s' % (h, a))
        return 2
    if out != src:
        io.open(p, 'w', encoding='utf-8').write(out)
    print('同步完成：%d 处' % len(EDITS))
    return 0


if __name__ == '__main__':
    sys.exit(main())