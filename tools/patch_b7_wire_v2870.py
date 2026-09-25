# -*- coding: utf-8 -*-
"""v2.87.0 B7：把题材组合与职责分离接上**真消费者**（tool-diag）。

不接的后果：新导出没人读 => dead-export-gate 判「死导出」，且「题材生效了吗」
在诊断面上答不出。锚点均须恰中 1 次。
"""
import io, sys
P = 'engines/tool-diag.js'
s = io.open(P, encoding='utf-8').read()

OLD1 = ("      // v2.86.0 A3：把「人物条目是谁建出来的」接进模块节。\n"
        "    //   它是 registry.personOriginStat 的真消费方——观测出口没人读就是死导出，\n"
        "    //   而这条读数正是「有没有人又绕开唯一写者」的唯一现场证据。\n"
        "    const personOrigin = safe(function () { return WA.registry && WA.registry.personOriginStat ? WA.registry.personOriginStat() : null; }, null);\n")
NEW1 = (OLD1 +
        "    // v2.87.0 B7：题材规则组合的现场读数（启用哪些题材 / 生效模块 / 拒收次数）。\n"
        "    //   它是 WA.theme.statView 的真消费方——「题材装上了没」在诊断面必须可答。\n"
        "    const theme = safe(function () { return WA.theme && WA.theme.statView ? WA.theme.statView() : null; }, null);\n")
if s.count(OLD1) != 1:
    print('ABORT d1=%d' % s.count(OLD1)); sys.exit(1)
s = s.replace(OLD1, NEW1)

OLD2 = ("      loadedCount: loaded.length,\n"
        "      missingCount: missing.length,\n"
        "      personOrigin: personOrigin,\n")
NEW2 = ("      loadedCount: loaded.length,\n"
        "      missingCount: missing.length,\n"
        "      personOrigin: personOrigin,\n"
        "      theme: theme,\n")
if s.count(OLD2) != 1:
    print('ABORT d2=%d' % s.count(OLD2)); sys.exit(1)
s = s.replace(OLD2, NEW2)

# secLonsha：把三插件职责分离接进 lonsha 节（B7 第三项的真出口）
OLD3 = ("      const read = WA.lonshaReader.readLonshaSnapshot({ refresh: false });\n")
NEW3 = ("      // v2.87.0 B7：三插件职责分离（事实结算 / 证据读取 / 交互执行）。\n"
        "      //   谁的活谁干：本扩展只做事实结算面，缺席方如实标注而非写死「已接入」。\n"
        "      const separation = safe(function () { return WA.theme && WA.theme.separation ? WA.theme.separation() : null; }, null);\n"
        "      const read = WA.lonshaReader.readLonshaSnapshot({ refresh: false });\n")
if s.count(OLD3) != 1:
    print('ABORT d3=%d' % s.count(OLD3)); sys.exit(1)
s = s.replace(OLD3, NEW3)

OLD4 = ("      const out = {\n        mounted: !!src.mounted, ok: !!read.ok, reason: read.reason,\n")
NEW4 = ("      const out = {\n        mounted: !!src.mounted, ok: !!read.ok, reason: read.reason,\n        separation: separation,\n")
if s.count(OLD4) != 1:
    print('ABORT d4=%d' % s.count(OLD4)); sys.exit(1)
s = s.replace(OLD4, NEW4)

io.open(P, 'w', encoding='utf-8').write(s)
print('OK patched tool-diag for B7')
print('DONE')
