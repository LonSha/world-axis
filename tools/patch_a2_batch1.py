#!/usr/bin/env python3
# WorldAxis v2.84.0 A2 第一批：把 8 个 KNOWN_OPEN 站点从自备 clean() 兜底切到统一输入边界。
# 每处都要求锚点恰命中 1 次，否则退出（防静默打偏）。
import sys

EDITS = [
    # (file, old, new, label)
    ('engines/hazard.js',
     "  function bump(key) {\n    const k = clean(key, 60);\n",
     "  function bump(key) {\n    // v2.84.0：走统一输入边界（NaN/对象不再被升格成 'NaN'/'[object Object]'）\n    const k = WA.inputGuard.text(key, 60);\n",
     'hazard.bump'),
    ('engines/hazard.js',
     "  function drop(key) {\n    const k = clean(key, 60);\n",
     "  function drop(key) {\n    const k = WA.inputGuard.text(key, 60);\n",
     'hazard.drop'),
    ('engines/karma.js',
     "    const w = clean(who, 40);\n    const k = String(kind == null ? '' : kind).trim().toLowerCase();\n    const amt = Number(amount);\n",
     "    const w = WA.inputGuard.text(who, 40);\n    // 枚举归一走边界层：非法 kind 不再经 String() 升格（对象会抛、NaN 会变 'nan'）\n    const k = WA.inputGuard.text(kind, 40).toLowerCase();\n    const amt = WA.inputGuard.num(amount, NaN);\n",
     'karma.record'),
    ('engines/karma.js',
     "  function drop(who) {\n    const w = clean(who, 40);\n",
     "  function drop(who) {\n    const w = WA.inputGuard.text(who, 40);\n",
     'karma.drop'),
    ('engines/ladder.js',
     "  function drop(who, kind) {\n    const w = clean(who, 40), k = clean(kind, 24);\n",
     "  function drop(who, kind) {\n    const w = WA.inputGuard.text(who, 40), k = WA.inputGuard.text(kind, 24);\n",
     'ladder.drop'),
    ('engines/enigma.js',
     "  function mark(secret, knower) {\n    const key = clean(secret, 60), who = clean(knower, 40);\n",
     "  function mark(secret, knower) {\n    const key = WA.inputGuard.text(secret, 60), who = WA.inputGuard.text(knower, 40);\n",
     'enigma.mark'),
    ('engines/enigma.js',
     "  function drop(secret) {\n    const key = clean(secret, 60);\n",
     "  function drop(secret) {\n    const key = WA.inputGuard.text(secret, 60);\n",
     'enigma.drop'),
    ('engines/tolerance.js',
     "  function drop(key) {\n    const k = clean(key, 48);\n",
     "  function drop(key) {\n    const k = WA.inputGuard.text(key, 48);\n",
     'tolerance.drop'),
    ('engines/marginal.js',
     "  function drop(who) {\n    const w = clean(who, 40);\n",
     "  function drop(who) {\n    const w = WA.inputGuard.text(who, 40);\n",
     'marginal.drop'),
    ('engines/parallel-events.js',
     "  function add(title, location, persons, opts) {\n    const t = clean(title, 40), loc = clean(location, 40);\n",
     "  function add(title, location, persons, opts) {\n    const t = WA.inputGuard.text(title, 40), loc = WA.inputGuard.text(location, 40);\n",
     'parallelEvents.add(标题/地点)'),
    ('engines/parallel-events.js',
     "    const cast = persons.map(function (x) { return clean(x, 24); }).filter(Boolean);\n",
     "    const cast = WA.inputGuard.list(persons, MAX_PERSONS + 1, 24);\n",
     'parallelEvents.add(人员列表)'),
    ('engines/fondness.js',
     "  function apply(person, opts) {\n    const who = clean(person, 40);\n",
     "  function apply(person, opts) {\n    const who = WA.inputGuard.text(person, 40);\n",
     'fondness.apply'),
]

fail = 0
for rel, old, new, label in EDITS:
    src = open(rel, encoding='utf-8').read()
    n = src.count(old)
    if n != 1:
        print('ANCHOR-MISS %s :: %s (hits=%d)' % (label, rel, n)); fail += 1; continue
    open(rel, 'w', encoding='utf-8').write(src.replace(old, new, 1))
    print('OK %s :: %s' % (label, rel))
sys.exit(1 if fail else 0)