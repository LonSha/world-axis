#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.104.0 收尾核验：版本一致 / 台账同源 / 专锁可独立跑 / 孤儿为零 / 文档就位。
判据全部现场取真值，不写死期望；失败的判据先怀疑判据自己。"""
import io, json, os, subprocess

ROOT = '/tmp/wa_git'
fails = []
oks = []


def ok(name, cond, detail=''):
    (oks if cond else fails).append('%s%s' % (name, ('  :: ' + detail) if detail else ''))


def read(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8').read()


def jread(p):
    return json.loads(read(p))


def run(cmd):
    r = subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, text=True)
    return r.returncode, (r.stdout or '') + (r.stderr or '')


# 1) 版本一致（注意：index.js 里 VERSION 行是缩进的，判据不能用 startswith）
ver_line = [l for l in read('index.js').split('\n') if 'VERSION = ' in l and "'2." in l][0].strip()
ver_manifest = jread('manifest.json')['version']
ok('index.js VERSION = 2.104.0', "'2.104.0'" in ver_line, ver_line)
ok('manifest.json version = 2.104.0', ver_manifest == '2.104.0', ver_manifest)

# 2) 三本台账同源
for p in ['tests/reject-code-ledger.json', 'tests/module-registry-ledger.json', 'tests/dead-export-ledger.json']:
    v = jread(p).get('version')
    ok('%s version = 2.104.0' % p, v == '2.104.0', str(v))

# 3) run.js 内无旧版本期望锚点
old_anchors = read('tests/run.js').count("=== '2.103.0'")
ok('run.js 内零 2.103.0 版本期望锚点', old_anchors == 0, '实 %d' % old_anchors)

# 4) 专锁可独立跑 + 被 require 也能跑
rc, out = run('node tests/negative-control-audit-v2104.js')
ok('专锁可独立跑（exit 0）', rc == 0, out.strip().split('\n')[-1] if out.strip() else '')
ok('专锁 49 项全绿', 'pass（49 项）' in out, '')
rc2, out2 = run('node -e "const m=require(\'./tests/negative-control-audit-v2104.js\');let P=0,F=0;m.runAll(c=>{c?P++:F++;});console.log(\'PASS=\'+P+\' FAIL=\'+F);"')
ok('专锁被 require 时也全绿（两种运行态）', rc2 == 0 and 'FAIL=0' in out2, out2.strip().split('\n')[-1] if out2.strip() else '')

# 5) 审计模块读数（四档）
rc3, out3 = run('node -e "const m=require(\'./tests/negative-control-audit.js\');const d=m.discover();console.log(JSON.stringify(d));"')
ok('审计模块可被消费', rc3 == 0 and '"locks"' in out3, '')
if '"locks"' in out3:
    d = json.loads(out3.strip().split('\n')[-1])
    ok('四档相加 = 锁数', d['uniform'] + d['nonUniform'] + d['unloadable'] + d['pending'] == d['locks'], str(d))
    ok('装载不了 = 0', d['unloadable'] == 0, str(d['unloadable']))
    ok('问题 = 0', d['problems'] == 0, str(d['problems']))

# 6) 孤儿为零（测试文件面门禁）
rc4, out4 = run('node tests/test-surface-gate.js')
ok('测试文件面门禁通过', rc4 == 0 and '全部通过' in out4, '')
ok('孤儿 0', '孤儿 0' in out4, ' | '.join([l for l in out4.split('\n') if '孤儿' in l][:1]))

# 7) 文档就位
ok('FOUR_VERSION_PLAN 有 v2.104.0 段', '## v2.104.0' in read('FOUR_VERSION_PLAN.md'))
ok('ITERATION_LOG 有 R87 条目', '### R87 · 2026-09-27 · v2.104.0' in read('ITERATION_LOG.md'))

# 8) index.js 无旧版本**常量**残留（历史注释不算）
bad = [l for l in read('index.js').split('\n') if "VERSION = '2.103.0'" in l]
ok('index.js 无旧版本常量残留', len(bad) == 0, str(bad))

print('=== OK (%d) ===' % len(oks))
for x in oks:
    print('  ✓ ' + x)
if fails:
    print('=== FAIL (%d) ===' % len(fails))
    for x in fails:
        print('  ✗ ' + x)
    raise SystemExit(1)
print('SEAL_OK')