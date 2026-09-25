# -*- coding: utf-8 -*-
"""v2.87.0 close: refill doc readings with measured values."""
import io, sys
BASE = '/tmp/wa_git/'

def sub(path, pairs):
    s = io.open(BASE + path, encoding='utf-8').read()
    for old, new, cnt in pairs:
        n = s.count(old)
        if n != cnt:
            print('ABORT %s: hits %d expected %d for %r' % (path, n, cnt, old[:60]))
            sys.exit(2)
        s = s.replace(old, new)
    io.open(BASE + path, 'w', encoding='utf-8').write(s)
    print('patched %s' % path)

# ── README：v2.87.0 条目的门禁行 ──
sub('README.md', [
    ('<code>node tests/run.js</code> \u2192 \u89c1\u672c\u7248\u6536\u53e3\u8bfb\u6570\uff1b',
     '<code>node tests/run.js</code> \u2192 <b>\u901a\u8fc7 7596 / \u5931\u8d25 0</b>\uff08v2.86.0 \u57fa\u7ebf <b>7541 / 0</b>\uff0c+55 = \u4e24\u628a\u4e13\u9501\uff09\uff1b', 1),
    ('\u51fa\u53e3\u9762 <code>ns= 103 members= 590 chars= 7282</code>\uff08\u5df2\u56de\u586b <code>FROZEN2800</code> \u4e0e <code>EC2430</code>\uff09',
     '\u51fa\u53e3\u9762 <code>ns= 104 members= 596 chars= 7341</code>\uff08\u5df2\u56de\u586b <code>FROZEN2800</code> \u4e0e <code>EC2430</code>\uff09', 1),
    ('\u4ec5\u6d4b\u8bd5 291 / \u8bc1\u636e 447\uff1b<code>tests/module-registry-gate.js</code> \u2192 pass\uff08107 \u6587\u4ef6 / 115 \u547d\u540d\u7a7a\u95f4\uff09\u3002',
     '\u4ec5\u6d4b\u8bd5 291 / \u8bc1\u636e 447\uff1b<code>tests/module-registry-gate.js</code> \u2192 pass\uff08107 \u6587\u4ef6 / 115 \u547d\u540d\u7a7a\u95f4\uff09\uff1b'
     '<code>tests/settle-v2830.js</code> \u2192 <b>55 / 0</b>\uff1b<code>tests/inventory.js</code> \u2192 \u56db\u7c7b\u60ac\u7a7a\u5747 0\uff08\u9759\u6001\u5f15\u7528 2339 \u5904\uff09\u3002', 1),
])

# ── FOUR_VERSION_PLAN：验收行读数同步 ──
sub('FOUR_VERSION_PLAN.md', [
    ('\u51fa\u53e3\u9762 `ns=103 members=590 chars=7282`',
     '\u51fa\u53e3\u9762 `ns=104 members=596 chars=7341`', 1),
])
print('DONE')
