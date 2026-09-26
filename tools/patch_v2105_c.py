#!/usr/bin/env python3
# v2.105.0 补丁 c：把 tar 与 node --check 两处也武装上 spawnSync 预算。
#
# 为什么还要补这两处（补丁 b 已武装 os 直接子进程，但这两处的主体是外部命令）：
#   · tar：spawnSync 的 timeout 只作用于直接子进程 `sh`；`sh` 会把它自己的副本再 exec 成
#     tar。本仓实测这两条腿对得上，但「对得上」是形态结论、不是保证，故
#     （一）也给 spawnSync 预算（覆盖 sh/node 起不来或卡在 exec 之前的情况）；
#     （二）tar 另有 shell 侧 `timeout -k 5 240 tar …` 保险丝（补丁 b 已写入）。
#   · node --check：同理给 spawnSync 预算，覆盖 `node` 本身；「读到一半的磁盘 stall」
#     在 spawnSync 语义下不可中断，如实记在 tests/gate-timeout.js 的 mode='spawn-only'。
#
# 落盘后 run.js 里**零个**没有 timeout 的 spawnSync 调用点——病根（无一声明 timeout）
# 才算真正治掉。锚点均为「原文子串」，各须恰中 1 次，否则整体放弃（不写半套）。
import sys

P = '/tmp/wa_git/tests/run.js'
MS = 96000

EDITS = [
    ('tar-copy',
     "'timeout -k 5 240 tar --exclude=.git -cf - . | (cd ' + negDir4300 + ' && tar -xf -)'], { cwd: BASE, encoding: 'utf8' });",
     "'timeout -k 5 240 tar --exclude=.git -cf - . | (cd ' + negDir4300 + ' && tar -xf -)'], { cwd: BASE, encoding: 'utf8', timeout: 96000 });"),

    ('syntax-check',
     "    const checkBroken4300 = cp4300.spawnSync(process.execPath, ['--check', path4300.join(negDir4300, 'tests/run.js')],\n"
     "      { encoding: 'utf8' });",
     "    const checkBroken4300 = cp4300.spawnSync(process.execPath, ['--check', path4300.join(negDir4300, 'tests/run.js')],\n"
     "      { encoding: 'utf8', timeout: 96000 });"),
]

if MS != 96000:
    print('ABORT: 预算常量与 tests/gate-timeout.js 不同源')
    sys.exit(1)

src = open(P, encoding='utf-8').read()
_orig = src

for key, old, new in EDITS:
    n = _orig.count(old)
    if n != 1:
        print('ABORT: 锚点命中 %d 次（需 1）:: %s' % (n, key))
        sys.exit(1)

_applied = sum(1 for k, o, nw in EDITS if _orig.count(nw) == 1)
if _applied == len(EDITS):
    print('SKIP: 两处目标形态齐备，补丁已应用（幂等，不重写）')
    sys.exit(0)
if _applied > 0:
    print('ABORT: 仅 %d/%d 处已应用（半套状态），拒绝继续' % (_applied, len(EDITS)))
    sys.exit(1)

for key, old, new in EDITS:
    src = src.replace(old, new)

# 落盘前复核：全文件 `= 96000` 形式的预算应为 10 处（8 处补丁 b + 2 处本补丁）
n = src.count('timeout: 96000')
if n != 10:
    print('ABORT: 落盘前复核失败 —— `timeout: 96000` 命中 %d（期望 10）' % n)
    sys.exit(1)

open(P, 'w', encoding='utf-8').write(src)
print('OK 两处锚点各恰中 1 次并改写完成（长度 %d → %d）' % (len(_orig), len(src)))
print('   tar：spawnSync 预算 96000 + shell 保险丝 `timeout -k 5 240`（双层）')
print('   node --check：spawnSync 预算 96000（只覆盖 node 本身，「读到一半的 stall」如实记档为不可中断）')
print('   全文件 `timeout: 96000` 共 10 处 = run.js 的 10 个 spawnSync 调用点，一个不漏')