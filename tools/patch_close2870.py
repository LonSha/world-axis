# -*- coding: utf-8 -*-
"""v2.87.0 close: refill three export-contract anchors."""
import io, sys, subprocess

BASE = '/tmp/wa_git/'
contract = io.open(BASE + 'tests/export_contract.txt', encoding='utf-8').read().strip()
print('new contract len = %d' % len(contract))

p = BASE + 'tests/run.js'
s = io.open(p, encoding='utf-8').read()
HEAD = "const FROZEN2800 = '"
i = s.find(HEAD)
j = s.find("';\n", i)
if i < 0 or j < 0:
    print('ABORT: FROZEN2800 not found')
    sys.exit(2)
old = s[i + len(HEAD):j]
print('old FROZEN len = %d' % len(old))
if old != contract:
    s = s[:i] + HEAD + contract + s[j:]
    io.open(p, 'w', encoding='utf-8').write(s)
    print('FROZEN2800 rewritten')
else:
    print('FROZEN2800 already up-to-date')

s = io.open(p, encoding='utf-8').read()
OLD_EC = "const EC2430 = 'ns= 103 members= 590 chars= 7282';"
NEW_EC = "const EC2430 = 'ns= 104 members= 596 chars= 7341';"
n = s.count(OLD_EC)
print('EC2430 hits = %d' % n)
if n == 1:
    s = s.replace(OLD_EC, NEW_EC)
    print('EC2430 rewritten')
elif n > 1:
    print('ABORT: EC2430 not unique')
    sys.exit(3)

ANCHOR_NOTE = "    //   B5 ba causal.settleBlockReason jieshang zhenshi xiaofeizhe"
io.open(p, 'w', encoding='utf-8').write(s)

q = BASE + 'tests/settle-v2830.js'
t = io.open(q, encoding='utf-8').read()
OLD_MR = ("  a(led.nsCount === 114 && led.loadedCount === 106,\n"
          "    'v2830/mr: \u547d\u540d\u7a7a\u95f4 115 / \u88c5\u8f7d\u6587\u4ef6 107"
          "\uff08\u4e0e LOAD_ORDER \u7684 109 \u5dee 3 \u4e2a ui/*\uff09'\n"
          "    + ' \u2014\u2014 v2.84.0 A2 \u65b0\u589e core/input-guard.js"
          "\uff08inputGuard \u547d\u540d\u7a7a\u95f4\uff09');")
NEW_MR = ("  a(led.nsCount === 115 && led.loadedCount === 107,\n"
          "    'v2830/mr: \u547d\u540d\u7a7a\u95f4 115 / \u88c5\u8f7d\u6587\u4ef6 107"
          "\uff08\u4e0e LOAD_ORDER \u7684 110 \u5dee 3 \u4e2a ui/*\uff09'\n"
          "    + ' \u2014\u2014 v2.84.0 A2 \u65b0\u589e core/input-guard.js"
          "\uff08inputGuard \u547d\u540d\u7a7a\u95f4\uff09\uff1b'\n"
          "    + ' v2.87.0 B7 \u65b0\u589e engines/theme.js"
          "\uff08theme \u547d\u540d\u7a7a\u95f4\uff09');")
m = t.count(OLD_MR)
print('settle-v2830 MR anchor hits = %d' % m)
if m == 1:
    t = t.replace(OLD_MR, NEW_MR)
    io.open(q, 'w', encoding='utf-8').write(t)
    print('settle-v2830 rewritten')
elif m > 1:
    print('ABORT: MR anchor not unique')
    sys.exit(4)

for f in (p, q):
    r = subprocess.run(['node', '--check', f], capture_output=True)
    print('syntax %s rc = %d %s' % (f.split('/')[-1], r.returncode, r.stderr.decode()[:200]))
print('DONE')
