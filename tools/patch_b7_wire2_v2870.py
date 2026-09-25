# -*- coding: utf-8 -*-
"""v2.87.0 B7：接真消费者（tool-diag）。锚点按实码字节重建（上一版因缩进差 2 空格零命中）。
"""
import io, sys
P = 'engines/tool-diag.js'
s = io.open(P, encoding='utf-8').read()

A1 = "    const personOrigin = safe(function () { return WA.registry && WA.registry.personOriginStat ? WA.registry.personOriginStat() : null; }, null);\n"
N1 = (A1 +
      "    // v2.87.0 B7：题材规则组合的现场读数（启用哪些题材 / 生效模块 / 拒收次数）。\n"
      "    //   它是 WA.theme.statView 的真消费方——「题材装上了没」在诊断面必须可答。\n"
      "    const theme = safe(function () { return WA.theme && WA.theme.statView ? WA.theme.statView() : null; }, null);\n")
A2 = "      personOrigin: personOrigin,\n"
N2 = "      personOrigin: personOrigin,\n      theme: theme,\n"
A3 = "      const read = WA.lonshaReader.readLonshaSnapshot({ refresh: false });\n"
N3 = ("      // v2.87.0 B7：三插件职责分离（事实结算 / 证据读取 / 交互执行）。\n"
      "      //   谁的活谁干：本扩展只做事实结算面，缺席方如实标注而非写死「已接入」。\n"
      "      const separation = safe(function () { return WA.theme && WA.theme.separation ? WA.theme.separation() : null; }, null);\n"
      "      const read = WA.lonshaReader.readLonshaSnapshot({ refresh: false });\n")
A4 = "        mounted: !!src.mounted, ok: !!read.ok, reason: read.reason,\n"
N4 = "        mounted: !!src.mounted, ok: !!read.ok, reason: read.reason,\n        separation: separation,\n"

for tag, a in [('A1', A1), ('A2', A2), ('A3', A3), ('A4', A4)]:
    c = s.count(a)
    print(tag, 'hits', c)
    if c != 1:
        print('ABORT', tag); sys.exit(1)

s = s.replace(A1, N1).replace(A2, N2).replace(A3, N3).replace(A4, N4)
io.open(P, 'w', encoding='utf-8').write(s)
print('OK patched')
print('DONE')
