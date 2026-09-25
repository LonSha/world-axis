# -*- coding: utf-8 -*-
"""v2.86.0：回填接口冻结串（registry 新增 ensurePerson / personOriginStat 两个成员）
并把 tests/run.js 里 v2.8.0 块的 FROZEN2800 逐字替换为新生成的契约串。"""
import io, re, sys
BASE = '/tmp/wa_git/'
contract = io.open(BASE + 'tests/export_contract.txt', encoding='utf-8').read().strip()
print('new contract len = %d' % len(contract))

p = BASE + 'tests/run.js'
s = io.open(p, encoding='utf-8').read()
i = s.find("const FROZEN2800 = '")
j = s.find("';\n", i)
if i < 0 or j < 0:
    print('ABORT: FROZEN2800 not found'); sys.exit(2)
old = s[i + len("const FROZEN2800 = '"):j]
print('old contract len = %d' % len(old))
if old == contract:
    print('already up-to-date'); sys.exit(0)
s = s[:i] + "const FROZEN2800 = '" + contract + s[j:]
io.open(p, 'w', encoding='utf-8').write(s)
import subprocess
r = subprocess.run(['node', '--check', p], capture_output=True)
print('syntax rc =', r.returncode, r.stderr.decode()[:200])
print('DONE')