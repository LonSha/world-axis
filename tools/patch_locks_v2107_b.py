#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""定点修补两份 v2.107.0 专锁（第二轮：loadCopy 的 require 解析 + N1 破坏块完整替换）。"""
import io, sys

BASE = '/tmp/wa_git/tests/'
L17 = BASE + 'reject-code-coverage-v2107.js'
L20 = BASE + 'module-cycle-gate-v2107.js'

REQ_FROM = "  const req = function (p) { return require(path.resolve(dir, p)); };\n"
REQ_TO = (
    "  // require 解析必须与 Node 同规矩：裸模块名（fs / path / vm）走模块查找，\n"
    "  // 只有相对路径才补 dir。若一律 path.resolve(dir, p)，`fs` 会被拼成 <dir>/fs ⇒\n"
    "  // Cannot find module（副本装载失败会被误读成「判据在破坏下也没反应」）。\n"
    "  const req = function (p) {\n"
    "    if (p.charAt(0) !== '.') return require(p);\n"
    "    return require(path.resolve(dir, p));\n"
    "  };\n"
)

# 锁 #20：N1 破坏块从「只换 IIFE 首行」改为「整块换掉」
N1_FROM = """  const narrow = 'const ALIAS_RE = new RegExp("const\\\\\\\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\\\\\\\s*=\\\\\\\\s*window\\\\\\\\.WorldAxis\\\\\\\\s*=\\\\\\\\s*window\\\\\\\\.WorldAxis\\\\\\\\s*\\\\\\\\|\\\\\\\\|\\\\\\\\s*\\\\\\\\{\\\\\\\\s*\\\\\\\\}\\\\\\\\s*;");';
  const n1src = breakOnce(S, ANCHORS.aAlias.txt, narrow, 'N1');
"""
N1_TO = """  const narrow = 'const ALIAS_RE = new RegExp("const\\\\\\\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\\\\\\\s*=\\\\\\\\s*window\\\\\\\\.WorldAxis\\\\\\\\s*=\\\\\\\\s*window\\\\\\\\.WorldAxis\\\\\\\\s*\\\\\\\\|\\\\\\\\|\\\\\\\\s*\\\\\\\\{\\\\\\\\s*\\\\\\\\}\\\\\\\\s*;");';
  // 破坏必须换掉**整个 IIFE 块**：只换首行会留下孤立的 `})();`，破坏副本变成 SyntaxError，
  // 于是「判据没反应」与「副本根本没装载起来」长得一模一样（本锁要治的正是这类混淆）。
  // 块文本由切片取得（不是字面量），故锚点整串在本锁里仍只出现 1 次（锚点表那行）。
  const n1i = S.indexOf(ANCHORS.aAlias.txt);
  const n1j = S.indexOf('})();', n1i) + 5;
  const aliasBlock = S.slice(n1i, n1j);
  const n1src = breakOnce(S, aliasBlock, narrow, 'N1');
"""

L20_EDITS = [
    ('loadCopy-require', REQ_FROM, REQ_TO, 1),
    ('N1-whole-block', N1_FROM, N1_TO, 1),
]
L17_EDITS = [
    ('loadCopy-require', REQ_FROM, REQ_TO, 1),
]


def patch(path, edits):
    with io.open(path, encoding='utf-8') as f:
        s = f.read()
    orig = s
    for label, frm, to, expect in edits:
        n = s.count(frm)
        if n != expect:
            print('ABORT %s: %s 命中 %d 次（期望 %d）' % (path, label, n, expect))
            return False
        s = s.replace(frm, to)
        print('  ok %-18s x%d' % (label, n))
    if s == orig:
        print('ABORT %s: 无改动' % path)
        return False
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(s)
    print('written %s (+%d bytes)' % (path, len(s.encode('utf-8')) - len(orig.encode('utf-8'))))
    return True


ok = patch(L17, L17_EDITS) and patch(L20, L20_EDITS)
print('PATCH2: ' + ('done' if ok else 'FAILED'))
sys.exit(0 if ok else 1)