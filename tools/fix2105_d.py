#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""定点修复：补丁 D 的占位符替换器（TIMEOUT → 'timeout: '）误伤了两个标识符：
     GATE_TIMEOUTS → GATE_timeout: S
     TIMEOUT_ARMED → timeout: _ARMED
   教训（补进 R88）：**用「全局 str.replace 还原占位符」是把前缀当词用**——
     占位符要是真标识符的前缀，就会连带改掉标识符；而且**期望计数不许手写**
     （我第一次写的 11/9 是错的，真值是 8/10——守卫拦下了这次错误的手写）。
   本补丁的计数全部实测取得，不写死数字。"""
import io, sys, hashlib

P = '/tmp/wa_git/tests/gate-timeout.js'
src = io.open(P, encoding='utf-8').read()
orig = src

C = 'timeout: '          # 被误写进去的形态
BAD_A = 'GATE_' + C + 'S'
BAD_B = C + '_ARMED'
GOOD_A = 'GATE_TIMEOUTS'
GOOD_B = 'TIMEOUT_ARMED'

n_a = src.count(BAD_A)
n_b = src.count(BAD_B)
if not (5 <= n_a <= 40) or not (5 <= n_b <= 40):
    print('ABORT 受损计数不合理（%d / %d）——不写半套' % (n_a, n_b))
    sys.exit(1)
if src.count(GOOD_A) != 0 or src.count(GOOD_B) != 0:
    print('ABORT 正常标识符已被改写（%d / %d）' % (src.count(GOOD_A), src.count(GOOD_B)))
    sys.exit(1)

src = src.replace(BAD_A, GOOD_A).replace(BAD_B, GOOD_B)

if src.count(GOOD_A) != n_a or src.count(GOOD_B) != n_b:
    print('ABORT 还原后计数不等于受损前（%d/%d vs %d/%d）' % (src.count(GOOD_A), src.count(GOOD_B), n_a, n_b))
    sys.exit(1)
if src.count(BAD_A) != 0 or src.count(BAD_B) != 0:
    print('ABORT 仍有受损残留（%d / %d）' % (src.count(BAD_A), src.count(BAD_B)))
    sys.exit(1)
# 正则面（timeout: 反斜杠d+）与字面量面必须安然无恙
if src.count('timeout: ' + chr(92) + 'd+') != 2:
    print('ABORT 正则面被动过：%d 处' % src.count('timeout: ' + chr(92) + 'd+'))
    sys.exit(1)

io.open(P, 'w', encoding='utf-8').write(src)
print('OK 定点还原完成（%d → %d 字节）' % (len(orig), len(src)))
print('  md5 %s' % hashlib.md5(src.encode('utf-8')).hexdigest())
print('  GATE_TIMEOUTS=%d / TIMEOUT_ARMED=%d / ARMED_SITES定义=%d'
      % (src.count(GOOD_A), src.count(GOOD_B), src.count('const ARMED_SITES')))