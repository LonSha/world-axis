# -*- coding: utf-8 -*-
"""v2.86.0：修正 identity-v2860 的两条负控制 —— 去掉「环境自污染」。

病：gate.fresh() 复用同一个 global.WorldAxis。若「先取原版 WAo、再建破坏副本 WAb，
最后才求值 judge(WAo)」，WAo.registry 已被后一次装载覆盖成破坏版 ⇒ 原版侧读到的
也是破坏行为，判据必然失配（实测：N4 原版未标注 1 / 破坏后 1；N3 原版假）。

修法：① 原版侧读数在创建破坏副本**之前**求值完毕（先算后建）；
      ② 依赖 store 的读数先显式复位 people 表，不继承前面用例的遗留。
"""
import io, sys

PATH = 'tests/identity-v2860.js'
src = io.open(PATH, encoding='utf-8').read()

RULES = []

# ① B4/B5 块：显式复位 people 表（不继承遗留，读数才可预期）
RULES.append((
    "    const WA = gate.fresh({}).WA;\n"
    "    WA.store.transact(function () { }, 'v2860id:init');\n",
    "    const WA = gate.fresh({}).WA;\n"
    "    // 显式复位：fresh() 复用同一个 global.WorldAxis，store 可能带着前面用例的遗留行\n"
    "    WA.store.transact(function (d) { d.people = {}; }, 'v2860id:init');\n"))

# ② N4：原版读数先算完，再建破坏副本
RULES.append((
    "    const WAo = gate.fresh({}).WA;\n"
    "    WAo.store.transact(function () { }, 'v2860id:n4o');\n"
    "    WAo.life.addGoal('寅', { text: 't' });\n"
    "    const okUn = WAo.registry.personOriginStat().unlabeledCount;\n"
    "    const WAb = gate.fresh({ srcOverride: { 'actors/registry.js': bTag } }).WA;\n"
    "    WAb.store.transact(function () { }, 'v2860id:n4b');\n"
    "    WAb.life.addGoal('寅', { text: 't' });\n"
    "    const badUn = WAb.registry.personOriginStat().unlabeledCount;\n",
    "    // 顺序要紧：fresh() 复用同一个 global.WorldAxis，后一次装载会覆盖前一个 WA 的模块引用。\n"
    "    //   故原版侧必须在建破坏副本**之前**把读数算完（否则读到的也是破坏行为）。\n"
    "    const WAo = gate.fresh({}).WA;\n"
    "    WAo.store.transact(function (d) { d.people = {}; }, 'v2860id:n4o');\n"
    "    WAo.life.addGoal('寅', { text: 't' });\n"
    "    const okUn = WAo.registry.personOriginStat().unlabeledCount;\n"
    "    const okLabeled = judgeLabelAtRuntime(WAo);\n"
    "    const WAb = gate.fresh({ srcOverride: { 'actors/registry.js': bTag } }).WA;\n"
    "    WAb.store.transact(function (d) { d.people = {}; }, 'v2860id:n4b');\n"
    "    WAb.life.addGoal('寅', { text: 't' });\n"
    "    const badUn = WAb.registry.personOriginStat().unlabeledCount;\n"))

# ③ N4 里的运行时判据改用先算好的 okLabeled（不再在破坏副本创建后回读原版）
RULES.append((
    "    a(judgeLabelAtRuntime(WAb) === false, 'v2860/id: [N1] 破坏副本上运行时判据同样现形（不只静态面）');",
    "    a(okLabeled === true && judgeLabelAtRuntime(WAb) === false,\n"
    "      'v2860/id: [N1] 运行时判据两向自证：原版打标签 / 破坏副本不打（不只静态面）');"))

# ④ N3：原版结果先算完
RULES.append((
    "    const WAo = gate.fresh({}).WA;\n"
    "    const WAb = gate.fresh({ srcOverride: { 'actors/registry.js': bIdem } }).WA;\n"
    "    a(judgeIdempotent(WAo) === true && judgeIdempotent(WAb) === false,",
    "    const WAo = gate.fresh({}).WA;\n"
    "    const okIdem = judgeIdempotent(WAo);   // 先算后建：避免被下一次装载覆盖\n"
    "    const WAb = gate.fresh({ srcOverride: { 'actors/registry.js': bIdem } }).WA;\n"
    "    a(okIdem === true && judgeIdempotent(WAb) === false,"))

fails = []
for old, new in RULES:
    n = src.count(old)
    if n != 1:
        fails.append('MISS(%d) %r' % (n, old[:60]))
        continue
    src = src.replace(old, new)

if fails:
    print('ABORT')
    for f in fails:
        print(' ', f)
    sys.exit(1)

io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK rewrote %d groups' % len(RULES))
print('DONE')
