#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""定点修补两份 v2.107.0 专锁（落盘后执行；每处改动都先核锚点命中数）。"""
import io, sys

BASE = '/tmp/wa_git/tests/'
L17 = BASE + 'reject-code-coverage-v2107.js'
L20 = BASE + 'module-cycle-gate-v2107.js'

SHEBANG_FROM = (
    "  const fn = vm.runInNewContext(\n"
    "    '(function (module, exports, require, __filename, __dirname) {\\n' + src + '\\n})',\n"
)
SHEBANG_TO = (
    "  // shebang 不是合法 JS：包进 CommonJS 外壳后 `#!...` 会变成 SyntaxError\n"
    "  // （Invalid or unexpected token），而 `.js` 带 shebang 本身是对的（可执行入口）。\n"
    "  // 装载副本前必须先剥掉——本锁锚点一律取函数体/常量区，不取首行，故此剥离不影响破坏落点。\n"
    "  const body = src.replace(/^#![^\\n]*\\n/, '');\n"
    "  const fn = vm.runInNewContext(\n"
    "    '(function (module, exports, require, __filename, __dirname) {\\n' + body + '\\n})',\n"
)


def patch(path, edits, total_guard=None):
    with io.open(path, encoding='utf-8') as f:
        s = f.read()
    orig = s
    for label, frm, to, expect in edits:
        n = s.count(frm)
        if n != expect:
            print('ABORT %s: %s 命中 %d 次（期望 %d）' % (path, label, n, expect))
            return False
        s = s.replace(frm, to)
        print('  ok %-16s x%d' % (label, n))
    if s == orig:
        print('ABORT %s: 无改动' % path)
        return False
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(s)
    print('written %s (+%d bytes)' % (path, len(s.encode('utf-8')) - len(orig.encode('utf-8'))))
    return True


# ---------- 锁 #17 ----------
E17 = [
    ('shebang', SHEBANG_FROM, SHEBANG_TO, 1),
    # N2 破坏串去重：换成「锚点属性访问 + 追加短路体」，本文件里锚点整串仍只出现 1 次（锚点表那行）
    (
        'N2-dedupe',
        "  const n2src = allReplace(S, ANCHORS.aDecl.txt,\n"
        "    'function declarations(opt) { return { rows: [], counts: {}, declared: 0, occurrences: 0, duplicated: [] };',\n"
        "    'N2');\n",
        "  const n2src = allReplace(S, ANCHORS.aDecl.txt,\n"
        "    ANCHORS.aDecl.txt + ' return { rows: [], counts: {}, declared: 0, occurrences: 0, duplicated: [] };',\n"
        "    'N2');\n",
        1,
    ),
]

# ---------- 锁 #20 ----------
RUNTIME_N5_FROM = (
    "    runtime: { 'core/a.js': { requires: [], requiresFiles: [] },\n"
    "      'core/b.js': { requires: ['alpha'], requiresFiles: ['core/a.js'] } } });\n"
)
RUNTIME_N5_TO = (
    "    runtime: { modules: { 'core/a.js': { requires: [], requiresFiles: [] },\n"
    "      'core/b.js': { requires: ['alpha'], requiresFiles: ['core/a.js'] } } } });\n"
)
RUNTIME_LOAD_FROM = (
    "    runtime: { 'core/a.js': { requires: [], requiresFiles: [] },\n"
    "      'core/b.js': { requires: ['alpha'], requiresFiles: ['core/a.js'] } },\n"
)
RUNTIME_LOAD_TO = (
    "    // 注入面必须与真源同构：readLedger 返回的是**账本对象**（含 modules 一层）。\n"
    "    // 少写一层 ⇒ 交叉验证面静默全空，「0 条违规」会在空集上恒真（不可用 ≠ 健康）。\n"
    "    runtime: { modules: { 'core/a.js': { requires: [], requiresFiles: [] },\n"
    "      'core/b.js': { requires: ['alpha'], requiresFiles: ['core/a.js'] } } },\n"
)
RUNTIME_EMPTY_FROM = (
    "    runtime: { 'core/a.js': { requires: [], requiresFiles: [] },\n"
    "      'core/b.js': { requires: [], requiresFiles: [] } },\n"
)
RUNTIME_EMPTY_TO = (
    "    runtime: { modules: { 'core/a.js': { requires: [], requiresFiles: [] },\n"
    "      'core/b.js': { requires: [], requiresFiles: [] } } },\n"
)

E20 = [
    ('shebang', SHEBANG_FROM, SHEBANG_TO, 1),
    # aLeak 锚点：原串在模块里根本不存在（0 次）⇒ 换成模块里恰 1 次的真实行
    (
        'aLeak-anchor',
        "  aLeak: { rel: MOD_REL, txt: 'const fld = s.raw || s.field;' },",
        "  aLeak: { rel: MOD_REL, txt: 'const deadNs = Object.keys(g.nsOwner).filter(' },",
        1,
    ),
    # A6c 从恒假（.length >= 0）改为真锚点断言
    (
        'A6c',
        "  A(S.indexOf('Object.keys(g.nsOwner)').length >= 0 && S.indexOf('readAll[ns]') >= 0,\n",
        "  A(S.indexOf(ANCHORS.aLeak.txt) >= 0 && S.indexOf('return !readAll[ns];') >= 0,\n",
        1,
    ),
    # N5 注入面（含 } }); 收尾，唯一）
    ('N5-runtime', RUNTIME_N5_FROM, RUNTIME_N5_TO, 1),
    # B12 / B12b 注入面（两处同文）
    ('B12-runtime', RUNTIME_LOAD_FROM, RUNTIME_LOAD_TO, 2),
    # B13 / B14 注入面（两处同文）
    ('B13-runtime', RUNTIME_EMPTY_FROM, RUNTIME_EMPTY_TO, 2),
    # N6 说明改为「历史占位串（从未落进模块）」，行为不变
    (
        'N6-label',
        "  // ── N6 真源码破坏：假锚点（本锁表的 aLeak 指向一个不存在的行）⇒ breakOnce 必抛 ──\n"
        "  let threw = false;\n"
        "  try { breakOnce(S, ANCHORS.aLeak.txt, 'X', 'N6'); } catch (e) { threw = true; }\n",
        "  // ── N6 假锚点（v2.107.0 开发期占位串，从未落进模块）⇒ breakOnce 必抛 ──\n"
        "  let threw = false;\n"
        "  try { breakOnce(S, 'const fld = s.raw || s.field;', 'X', 'N6'); } catch (e) { threw = true; }\n",
        1,
    ),
    # C2b 从恒真改为「与现场文件面同源」
    (
        'C2b',
        "  A(M.productFiles().length === M.productFiles().length, 'C2b productFiles 连调同长');\n",
        "  A(M.productFiles().length === a.files,\n"
        "    'C2b productFiles 连调同长且与现场文件面同源（' + M.productFiles().length\n"
        "    + ' === ' + a.files + '）');\n",
        1,
    ),
]

ok = patch(L17, E17) and patch(L20, E20)
print('PATCH: ' + ('done' if ok else 'FAILED'))
sys.exit(0 if ok else 1)
