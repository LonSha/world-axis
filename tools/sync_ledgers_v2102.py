#!/usr/bin/env python3
# 台账版本同源（v2.102.0）：账本 version 字段与 _note 版本词必须与 index.js 的 VERSION 同值。
#   dead-export-gate 的元数据三级同源判据会逐级核（field-vs-entry / note-vs-entry / field-vs-note），
#   故两处必须同批改。reject-code-ledger 的 _note 记录的是「上一次内容修订版本」（v2.97.0），
#   不是台账版本 —— 它的 version 字段才是，故只改 version 字段与追加一条本版说明。
import io, json, os

BASE = '/tmp/wa_git'
VER = '2.102.0'

# ── 1. dead-export-ledger.json：version + _note 版本词 ──
p = os.path.join(BASE, 'tests/dead-export-ledger.json')
j = json.load(io.open(p, encoding='utf-8'))
j['version'] = VER
j['_note'] = j['_note'].replace('（v2.101.0）', '（v' + VER + '）', 1)
assert VER in j['_note'], '_note 未带上本版版本词'
io.open(p, 'w', encoding='utf-8').write(json.dumps(j, ensure_ascii=False, indent=2) + '\n')
print('ok  dead-export-ledger version=%s, _note 已带版本词' % j['version'])

# ── 2. module-registry-ledger.json：只改 version 字段 ──
p = os.path.join(BASE, 'tests/module-registry-ledger.json')
j = json.load(io.open(p, encoding='utf-8'))
j['version'] = VER
io.open(p, 'w', encoding='utf-8').write(json.dumps(j, ensure_ascii=False, indent=2) + '\n')
print('ok  module-registry-ledger version=%s' % j['version'])

# ── 3. reject-code-ledger.json：改 version 字段 + 追加本版说明到 _note 尾 ──
p = os.path.join(BASE, 'tests/reject-code-ledger.json')
j = json.load(io.open(p, encoding='utf-8'))
j['version'] = VER
add = ('\nv%s：新增 6 个码全部带可执行见证（perf-trace：bad-layer-or-key / module-absent / '
       'produce-failed / reuse / unknown-class / unknown-span），见证 118→124；基线保持 233 条不变。'
       '其中 reuse 是一条**正常归因**（ensure 命中路径上答「这次为什么是它」），不是拒收码，'
       '但它在源码里以同一词法形状出现，故同样按「有归属」处理并带见证。') % VER
if add not in j['_note']:
    j['_note'] = j['_note'] + add
io.open(p, 'w', encoding='utf-8').write(json.dumps(j, ensure_ascii=False, indent=2) + '\n')
print('ok  reject-code-ledger version=%s, _note 已追加本版说明' % j['version'])

# ── 4. field-liveness-ledger.json：本版无内容变化，只核一下（不盲改） ──
p = os.path.join(BASE, 'tests/field-liveness-ledger.json')
j = json.load(io.open(p, encoding='utf-8'))
print('info field-liveness-ledger version=%s（本版内容未变，按「不盲改」保留；'
      '该门禁自己不做版本同源判据，现场 ✓）' % j.get('version'))