#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.103.0 收尾核验：逐项确认收口完整性，不通过即报出。"""
import io, json, subprocess

R = '/tmp/wa_git/'

def sh(c):
    p = subprocess.run(['bash', '-lc', c], cwd=R, capture_output=True, text=True)
    return (p.stdout + p.stderr).strip()

log = []
def chk(cond, name, detail=''):
    log.append(('OK   ' if cond else 'FAIL ') + name + (('  ' + detail) if detail else ''))
    return cond

ok = True

# 1) 版本一致
idx = io.open(R + 'index.js', encoding='utf-8').read()
mf = json.load(io.open(R + 'manifest.json', encoding='utf-8'))
ok &= chk("const VERSION = '2.103.0';" in idx, 'index.js VERSION=2.103.0')
ok &= chk(mf.get('version') == '2.103.0', 'manifest version=2.103.0')
ok &= chk(idx.count('2.102.0') == 1 and 'v2.102.0' in idx, 'index.js 旧版本仅存历史注释一处（非版本残留）')

# 2) 三本台账同源
for f in ['tests/reject-code-ledger.json', 'tests/module-registry-ledger.json', 'tests/dead-export-ledger.json']:
    d = json.load(io.open(R + f, encoding='utf-8'))
    ok &= chk(d.get('version') == '2.103.0', f + ' version=2.103.0', str(d.get('version')))
d = json.load(io.open(R + 'tests/dead-export-ledger.json', encoding='utf-8'))
ok &= chk('v2.103.0' in d.get('_note', ''), 'dead ledger _note 版本词已同步')
d = json.load(io.open(R + 'tests/reject-code-ledger.json', encoding='utf-8'))
ok &= chk('v2.103.0' in d.get('_note', ''), 'reject ledger _note 版本词已同步')

# 3) O16 交付面
run = io.open(R + 'tests/run.js', encoding='utf-8').read()
ok &= chk(run.count('jsdom 不可用') == 0, 'run.js 零「jsdom 不可用」静默跳过')
ok &= chk(run.count("require('./ui-dom.js').JSDOMShim") == 10, '替身接入 10 处',
          str(run.count("require('./ui-dom.js').JSDOMShim")))
ok &= chk(run.count("=== '2.102.0'") == 0, 'run.js 零旧版本期望锚点')

# 4) 新模块导出面
dg = io.open(R + 'tests/dependency-guard.js', encoding='utf-8').read()
ok &= chk('os.tmpdir()' in dg and "'/tmp'" not in dg, 'dependency-guard 不写裸 /tmp 字面量')
ok &= chk("key: 'jsdom'" in dg or "'jsdom'" in dg, 'jsdom 已登记为可选依赖')
ud = io.open(R + 'tests/ui-dom.js', encoding='utf-8').read()
ok &= chk('JSDOMShim' in ud and '__WA_SHIM_HOST__' in ud, 'ui-dom 替身与自建挂点在位')

# 5) 专锁跑通
lock = sh('node tests/dependency-guard-v2103.js 2>&1 | tail -2')
ok &= chk('pass（29 项）' in lock, '专锁 dependency-guard-v2103 独立跑 29/0', lock[:120])

# 6) 六道门禁
gates = [
    ('node tests/export-contract.js 2>&1 | head -1', 'ns= 109 members= 694 chars= 8296', 'export-contract'),
    ('node tests/reject-code-gate.js 2>&1 | tail -1', '每个码都有归属', 'reject-code-gate'),
    ('node tests/test-surface-gate.js 2>&1 | tail -3', '全部通过', 'test-surface-gate'),
    ('node tests/module-registry-gate.js 2>&1 | tail -1', 'pass', 'module-registry-gate'),
    ('node tests/dead-export-gate.js 2>&1 | tail -1', '✓', 'dead-export-gate'),
    ('node tests/field-liveness-gate.js 2>&1 | tail -1', '✓', 'field-liveness-gate'),
]
for cmd, want, name in gates:
    out = sh(cmd)
    ok &= chk(want in out, '门禁 ' + name, out[:100])

# 7) 工作区状态
st = sh('git status --porcelain')
log.append('--- 工作区改动 ---')
log.append(st)

print('\n'.join(log))
print('SEAL_OK' if ok else 'SEAL_HAS_FAIL')