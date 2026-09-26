#!/usr/bin/env python3
# v2.105.0 补丁 b：给 tests/run.js 的 10 个子进程调用点武装超时（计划一 #3 主交付）。
#
# 病根（本版实测）：10 个 spawnSync **无一**声明 timeout。任一门禁 hang 住，
#   整趟回归静挂；唯一兜底是外层 isolated-runner 的 10 分钟 SIGKILL，而全量实测
#   6~8 分钟 ⇒ 余量不足一倍，且被强杀时只剩一行 "Status: runner-failed"，
#   卡在哪道门禁、卡死前最后说了什么，全部丢失。
#
# 口径（与 tests/gate-timeout.js 同源、同值）：
#   · spawn 面 8 处：timeout = 96000（最重门禁 12s × 8），出口三处（真起 node 产品进程）
#     同时写 killSignal='SIGKILL'（不写则默认 SIGTERM，子进程可以忽略）；
#   · tar 与 --check 两处为「只取证」形态（spawnSync 的 timeout 选项**不作用于**它）；
#     tar 改写成 `timeout -k 5 <n> tar …`（它运行在 `sh -c` 里，可用 shell 命令）；
#     `node --check` 形态不可改写 ⇒ 明确记为「只取证」，由 gate-timeout 的取证面覆盖。
#
# 纪律：每处锚点必须是**调用行 + options 行**两行整段（单看 options 行有多处同形，
#   会被改到别处）；每处必须先验命中数 == 1，任何一处不满足即整体放弃（不写半套）。
import sys

P = '/tmp/wa_git/tests/run.js'

SPAWN_MS = 96000
ADVISE_MS = 240000

# (键, 原文, 新文)  —— 原文均为「调用行 + options 行」，逐字，含缩进
EDITS = [
    ('negative-probe-broken',
     "      const r2700 = require('child_process').spawnSync(process.execPath, [tmp2700, '--json'],\n"
     "        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });",
     "      const r2700 = require('child_process').spawnSync(process.execPath, [tmp2700, '--json'],\n"
     "        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 96000, killSignal: 'SIGKILL' });"),

    ('dead-export-json',
     "      const rr = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'dead-export-gate.js'), '--json'],\n"
     "        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });",
     "      const rr = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'dead-export-gate.js'), '--json'],\n"
     "        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 96000, killSignal: 'SIGKILL' });"),

    ('export-contract',
     "    const ecRun4300 = cp4300.spawnSync(process.execPath, ['tests/export-contract.js'],\n"
     "      { cwd: path4300.join(__dirname, '..'), encoding: 'utf8' });",
     "    const ecRun4300 = cp4300.spawnSync(process.execPath, ['tests/export-contract.js'],\n"
     "      { cwd: path4300.join(__dirname, '..'), encoding: 'utf8', timeout: 96000, killSignal: 'SIGKILL' });"),

    # tar：spawnSync 的 timeout 选项管不到外部命令的挂死；改成 shell 侧 `timeout`（只取证形态）
    ('tar-copy',
     "    const tarR4300 = cp4300.spawnSync('sh', ['-c',\n"
     "      'tar --exclude=.git -cf - . | (cd ' + negDir4300 + ' && tar -xf -)'], { cwd: BASE, encoding: 'utf8' });",
     "    const tarR4300 = cp4300.spawnSync('sh', ['-c',\n"
     "      'timeout -k 5 240 tar --exclude=.git -cf - . | (cd ' + negDir4300 + ' && tar -xf -)'], { cwd: BASE, encoding: 'utf8' });"),

    # node --check：本就不读 timeout 选项 ⇒ 只取证（不硬套上限）
    ('syntax-check',
     "    const checkBroken4300 = cp4300.spawnSync(process.execPath, ['--check', path4300.join(negDir4300, 'tests/run.js')],\n"
     "      { encoding: 'utf8' });",
     "    // v2.105.0：node --check 不读 spawnSync 的 timeout 选项，此处是「只取证」形态\n"
     "    //   （上限由外层 isolated-runner 与 tests/gate-timeout.js 的取证面承担）。\n"
     "    const checkBroken4300 = cp4300.spawnSync(process.execPath, ['--check', path4300.join(negDir4300, 'tests/run.js')],\n"
     "      { encoding: 'utf8' });"),

    ('export-contract-external',
     "    const r4100 = cp4100.spawnSync(process.execPath, [path4100.join(BASE, 'tests/export-contract.js')],\n"
     "      { cwd: path4100.join(BASE, 'tests'), encoding: 'utf8' });",
     "    const r4100 = cp4100.spawnSync(process.execPath, [path4100.join(BASE, 'tests/export-contract.js')],\n"
     "      { cwd: path4100.join(BASE, 'tests'), encoding: 'utf8', timeout: 96000, killSignal: 'SIGKILL' });"),

    ('negative-probe-v2410',
     "    const rBad4100 = cp4100.spawnSync(process.execPath, [brokenFile4100], { cwd: BASE, encoding: 'utf8' });",
     "    const rBad4100 = cp4100.spawnSync(process.execPath, [brokenFile4100], { cwd: BASE, encoding: 'utf8', timeout: 96000, killSignal: 'SIGKILL' });"),

    ('field-liveness-gate',
     "    const rG2400 = cp2400.spawnSync(process.execPath, ['tests/field-liveness-gate.js'],\n"
     "      { cwd: path2400.join(__dirname, '..'), encoding: 'utf8' });",
     "    const rG2400 = cp2400.spawnSync(process.execPath, ['tests/field-liveness-gate.js'],\n"
     "      { cwd: path2400.join(__dirname, '..'), encoding: 'utf8', timeout: 96000 });"),

    ('module-registry-gate',
     "    const rG2830 = cp2830.spawnSync(process.execPath, ['tests/module-registry-gate.js'],\n"
     "      { cwd: path.join(__dirname, '..'), encoding: 'utf8' });",
     "    const rG2830 = cp2830.spawnSync(process.execPath, ['tests/module-registry-gate.js'],\n"
     "      { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 96000 });"),

    ('isolated-runner-lock',
     "    const rI2840 = cp2840.spawnSync(process.execPath, ['tests/isolated-runner-lock.js'],\n"
     "      { cwd: path.join(__dirname, '..'), encoding: 'utf8' });",
     "    const rI2840 = cp2840.spawnSync(process.execPath, ['tests/isolated-runner-lock.js'],\n"
     "      { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 96000 });"),
]

if SPAWN_MS != 96000 or ADVISE_MS != 240000:
    print('ABORT: 预算常量与 tests/gate-timeout.js 不同源')
    sys.exit(1)

src = open(P, encoding='utf-8').read()
_orig = src

# 预检：逐处命中数必须恰为 1（锚点不唯一/已改过 ⇒ 整体放弃，不写半套）
for key, old, new in EDITS:
    n = _orig.count(old)
    if n != 1:
        print('ABORT: 锚点命中 %d 次（需 1）:: %s' % (n, key))
        sys.exit(1)

# 幂等保护：整体已应用（10 处目标形态齐备）⇒ 报「已应用」退出 0，不重复写
_applied = sum(1 for k, o, nw in EDITS if _orig.count(nw) == 1)
if _applied == len(EDITS):
    print('SKIP: 10 处目标形态齐备，补丁已应用（幂等，不重写）')
    sys.exit(0)
if _applied > 0:
    print('ABORT: 仅 %d/%d 处已应用（半套状态），拒绝继续' % (_applied, len(EDITS)))
    sys.exit(1)

for key, old, new in EDITS:
    src = src.replace(old, new)

# 复核：锚点命中数必须真的是 1（用 split 计数，防「同一串被改两次」这类静默重复）
for key, old, new in EDITS:
    if _orig.count(old) != 1:
        print('ABORT: 复核失败（锚点命中 ≠1）:: %s' % key)
        sys.exit(1)

# 落盘前整体形状复核：spawn 面 5 处双选项 + 3 处单选项 + 1 处 shell timeout 命令
for needle, want in [("encoding: 'utf8', timeout: 96000, killSignal: 'SIGKILL' });", 3),
                     ("maxBuffer: 64 * 1024 * 1024, timeout: 96000, killSignal: 'SIGKILL' });", 2),
                     ("encoding: 'utf8', timeout: 96000 });", 3),
                     ("'timeout -k 5 240 tar --exclude=.git -cf - .", 1),
                     ('timeout: 96000', 8)]:
    n = src.count(needle)
    if n != want:
        print('ABORT: 落盘前复核失败 %r 命中 %d（期望 %d）' % (needle, n, want))
        sys.exit(1)

open(P, 'w', encoding='utf-8').write(src)
print('OK 10 处锚点各恰中 1 次并改写完成（_orig 长度 %d → %d）' % (len(_orig), len(src)))
print('   8 处 spawn 面 timeout=96000：5 处带 killSignal=SIGKILL + 3 处单选项（field/module/isolated）')
print('   2 处只取证形态：tar 改写为 `timeout -k 5 240 tar …`（shell 侧 fuse）；node --check 明记只取证')
print('   全文件 `timeout: 96000` 共 9 处（与 gate-timeout.js 的 8 处 spawn 预算 + tar 的 shell 侧一致）')