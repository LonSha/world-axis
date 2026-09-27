#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 ITERATION_LOG 的 R91 段里补一行「一次性脚本已归档」点名（R89 口径）。"""
import io, sys

P = '/tmp/wa_git/ITERATION_LOG.md'
with io.open(P, encoding='utf-8') as f:
    s = f.read()

if 'tools/patch_locks_v2107.py' in s:
    print('SKIP：已点名')
    sys.exit(0)

# 唯一锚点：R91 段里紧跟「升版同批」那行的下一条
ANCHOR = '- **为什么**：#17 治的是「**覆盖率不是一个可读的数字**」'
if s.count(ANCHOR) != 1:
    print('ABORT：锚点命中 %d 次（期望 1）' % s.count(ANCHOR))
    sys.exit(1)

LINE = (
    '  - 一次性脚本（已归档入 `tools/`，按 R89 口径「文档点名的一次性脚本必须实存」）：'
    '`tools/patch_locks_v2107.py` / `tools/patch_locks_v2107_b.py` / `tools/patch_locks_v2107_c.py`'
    '（两把专锁的三轮定点修补：shebang 剥离、require 解析、锚点去重、破坏点同路径）· '
    '`tools/append_note_v2107.py`（拒收码台账沿革段）· `tools/doc_v2107.py`（本文两处）· '
    '`tools/bump_v2107.js` · `tools/seal_check_v2107.js`。\n'
)

s2 = s.replace(ANCHOR, LINE + ANCHOR)
assert s2 != s
with io.open(P, 'w', encoding='utf-8') as f:
    f.write(s2)
print('OK ITERATION_LOG +%d chars' % (len(s2) - len(s)))