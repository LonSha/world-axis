#!/usr/bin/env python3
# v2.105.0 补丁 a：把 gate-timeout.js 的武装值统一到「逐门禁表最高档」（96000 = 12000 × 8）。
#   病根：先前 GATE_TIMEOUTS.spawnMs=90000 与逐门禁表中的 dead-export-gate(96000) 不自洽，
#   等于同一份口径里有两个 spawn 预算 ⇒ 「单一真源」这句话当场失效。
#   修法：武装值 = 逐门禁表的最高档（8 倍余量对每一道门禁都成立），并新增 coherence() 判据。
import ast, sys, re

P = '/tmp/wa_git/tests/gate-timeout.js'
src = open(P, encoding='utf-8').read()

n = src.count('90000')
if n != 9:
    print('ABORT: 期望 9 处 90000（1 处 spawnMs + 8 处 armed），实 %d' % n)
    sys.exit(1)

src = src.replace('90000', '96000')

# 注释里的余量示例同步（82s → 96s，与 8 倍口径一致）
old_c = '10.3s 的 dead-export-gate 得 82s'
new_c = '12s 的 dead-export-gate 得 96s'
if old_c not in src:
    print('ABORT: 注释锚点不存在 :: ' + old_c)
    sys.exit(1)
src = src.replace(old_c, new_c)

if '90000' in src:
    print('ABORT: 替换后仍有 90000')
    sys.exit(1)

open(P, 'w', encoding='utf-8').write(src)
ast.parse(open(P, encoding='utf-8').read())

print('OK 90000 -> 96000（9 处）')
print('OK 注释余量示例 82s -> 96s')
print('AST=OK  size=%d' % len(src))
