#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.105.0 收尾核验：版本一致 / 台账同源 / 专锁可独立跑且被 require 也绿 / 现场读数三数相等 /
孤儿为零 / 文档就位 / tools 脚本实存（文档里点名的一次性脚本不得只存在于文档里）。
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


# 1) 版本一致（index.js 的 VERSION 行是缩进的，判据不能用 startswith）
ver_line = [l for l in read('index.js').split('\n') if 'VERSION = ' in l and "'2." in l][0].strip()
ok('index.js VERSION = 2.105.0', "'2.105.0'" in ver_line, ver_line)
ok('manifest.json version = 2.105.0', jread('manifest.json')['version'] == '2.105.0', jread('manifest.json')['version'])

# 2) 三本台账同源
for p in ['tests/reject-code-ledger.json', 'tests/module-registry-ledger.json', 'tests/dead-export-ledger.json']:
    v = jread(p).get('version')
    ok('%s version = 2.105.0' % p, v == '2.105.0', str(v))

# 3) run.js 版本期望锚点：零旧、八新（比较值与消息文本同批改）
old_n = read('tests/run.js').count("=== '2.104.0'")
new_n = read('tests/run.js').count("'2.105.0'")
ok('run.js 内零 2.104.0 版本期望锚点', old_n == 0, '实 %d' % old_n)
ok('run.js 内 2.105.0 期望锚点 = 8 处', new_n == 8, '实 %d' % new_n)

# 4) index.js 无旧版本常量残留（历史注释不算）
bad = [l for l in read('index.js').split('\n') if "VERSION = '2.104.0'" in l]
ok('index.js 无旧版本常量残留', len(bad) == 0, str(bad))

# 5) 专锁两种运行态都要全绿
rc, out = run('node tests/gate-timeout-v2105.js')
ok('专锁可独立跑（exit 0）', rc == 0, out.strip().split('\n')[-1] if out.strip() else '')
ok('专锁 53 项全绿', 'pass（53 项）' in out, '')
rc2, out2 = run("node -e \"const m=require('./tests/gate-timeout-v2105.js');let P=0,F=0;m.runAll(c=>{c?P++:F++;});console.log('PASS='+P+' FAIL='+F);\"")
ok('专锁被 require 时也全绿（两种运行态）', rc2 == 0 and 'FAIL=0' in out2 and 'PASS=53' in out2,
   out2.strip().split('\n')[-1] if out2.strip() else '')

# 6) 现场读数：三数相等（调用点 = 武装点 = 预算处）、自洽、三档形态齐备
rc3, out3 = run("node -e \"const m=require('./tests/gate-timeout.js');const d=m.discover();console.log(JSON.stringify({s:d.siteStats,coh:d.coherence,modes:d.modeCounts}));\"")
ok('取值面模块可被消费', rc3 == 0 and '"s"' in out3, out3.strip()[-80:])
if '"s"' in out3:
    d = json.loads(out3.strip().split('\n')[-1])
    s = d['s']
    ok('三数相等且 = 10（sites / armedSites / budget）',
       s['sites'] == 10 and s['armedSites'] == 10 and s['budget'] == 10, json.dumps(s, ensure_ascii=False))
    ok('自洽（一套预算，无 coherence 问题）', d['coh'] == [], json.dumps(d['coh'], ensure_ascii=False))
    ok('三档形态齐备且合计 = 10',
       set(d['modes'].keys()) == {'spawn', 'spawn+shell', 'spawn-only'} and sum(d['modes'].values()) == 10,
       json.dumps(d['modes']))
    ok('形态读数与末次实测一致（spawn 8 / spawn+shell 1 / spawn-only 1）',
       d['modes'] == {'spawn': 8, 'spawn+shell': 1, 'spawn-only': 1}, json.dumps(d['modes']))

# 7) 孤儿为零（测试文件面门禁）
rc4, out4 = run('node tests/test-surface-gate.js')
ok('测试文件面门禁通过', rc4 == 0, '')
ok('孤儿 0', '孤儿 0' in out4, ' | '.join([l for l in out4.split('\n') if '孤儿' in l][:1]))

# 8) 文档就位（且顺序：v2.105.0 段必须在「## 完成纪律」之前）
plan = read('FOUR_VERSION_PLAN.md')
ok('FOUR_VERSION_PLAN 有 v2.105.0 段', '## v2.105.0' in plan)
ok('v2.105.0 段落在 v2.104.0 之后、完成纪律之前',
   0 < plan.find('## v2.105.0') and plan.find('## v2.104.0') < plan.find('## v2.105.0') < plan.find('## 完成纪律'))
log = read('ITERATION_LOG.md')
ok('ITERATION_LOG 有 R88 条目', '### R88 · 2026-09-27 · v2.105.0' in log)
ok('R88 排在 R87 之前（迭代日志最新在前）', log.find('### R88') < log.find('### R87'))

# 9) 文档里点名的一次性脚本必须实存（本版踩过：脚本落在 /tmp、文档写的是 tools/）
for p in ['tools/patch_v2105_a.py', 'tools/patch_v2105_b.py', 'tools/patch_v2105_c.py', 'tools/patch_v2105_d.py',
          'tools/fix2105_d.py', 'tools/sec2105.py', 'tools/bump_v2105.py', 'tools/bump_run_ver_v2105.py',
          'tools/doc_v2105.py']:
    ok('%s 实存' % p, os.path.exists(os.path.join(ROOT, p)))

print('=== OK (%d) ===' % len(oks))
for x in oks:
    print('  ✓ ' + x)
if fails:
    print('=== FAIL (%d) ===' % len(fails))
    for x in fails:
        print('  ✗ ' + x)
    raise SystemExit(1)
print('SEAL_OK')
