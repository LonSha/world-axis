#!/usr/bin/env node
// WorldAxis tests/opv29-z2-12-v2529.js — V29 优化线 Z2（OPV29-12）专锁
//
// 治的病
//   OPV29-07～11 全是「按职责把大文件拆段」。拆段最常见的假绿不是语法错
//   （`node --check` 当场红），而是**判据面悄悄变小**：某个 assert 跟着被搬走的代码
//   一起丢了，文件照样能 require、锁照样绿 —— 绿的理由从「判过了」变成「没判」。
//
// 本锁钉住 tools/split-guard.js 的四面（每面都带负控制或真跑）：
//   A 指纹身份：P/F + 消息文本；文件内排序幂等。
//   B 比对口径：少一条红 / 多一条只可见 / 改名=少+多 / 文件面缺失红 / 多重集计数（不是集合相等）/ 空转拒收。
//   C 现场：真跑一把真锁取到判据，再与自己比对必须 PASS。
//   D 可读性：红必须说人话（「少判据」「结论：FAIL」字样在源码里），用法两种入口都在。
'use strict';
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  fails.push(line); console.log('  ✗ ' + line); return false;
}
const SG = require('../tools/split-guard.js');

// ── A. 指纹身份 ─────────────────────────────────────────────
a(typeof SG.capture === 'function' && typeof SG.compare === 'function'
  && typeof SG.fingerprint === 'function' && typeof SG.collectOne === 'function'
  && typeof SG.normFile === 'function',
  'A1 工具导出齐备（capture / compare / fingerprint / collectOne / normFile）');

const fp1 = SG.fingerprint({ locks: { 'x.js': { rows: [{ ok: true, msg: 'm' }, { ok: false, msg: 'm' }] } } });
a(fp1['x.js'].length === 2 && fp1['x.js'][0] !== fp1['x.js'][1],
  'A2 同一条文本、通过与否不同 ⇒ 身份不同（P|/F| 进指纹）', fp1['x.js']);
const fpA = SG.fingerprint({ locks: { 'x.js': { rows: [{ ok: true, msg: 'b' }, { ok: true, msg: 'a' }] } } });
const fpB = SG.fingerprint({ locks: { 'x.js': { rows: [{ ok: true, msg: 'a' }, { ok: true, msg: 'b' }] } } });
a(JSON.stringify(fpA) === JSON.stringify(fpB), 'A3 文件内按文本排序 ⇒ 指纹幂等（顺序变了不算变化）');

// ── B. 比对口径（全部真调 compare，负控制带真实读数）────────────
function cap(rows) { return { locks: { 'x.js': { rows: rows } } }; }
const r1 = SG.compare(cap([{ ok: true, msg: 'a' }, { ok: true, msg: 'b' }]), cap([{ ok: true, msg: 'a' }]));
a(r1.ok === false && r1.missing.length === 1 && r1.added.length === 0,
  'B1 少一条 ⇒ FAIL 且 missing=1（拆段假绿当场红）', [r1.ok, r1.missing.length]);

const r2 = SG.compare(cap([{ ok: true, msg: 'a' }]), cap([{ ok: true, msg: 'a(改名)' }]));
a(r2.ok === false && r2.missing.length === 1 && r2.added.length === 1,
  'B2 判据改名 ⇒ 同时报「少一条 + 多一条」（改名不许静默通过）', [r2.missing.length, r2.added.length]);

const r3 = SG.compare(cap([{ ok: true, msg: 'dup' }, { ok: true, msg: 'dup' }]), cap([{ ok: true, msg: 'dup' }]));
a(r3.ok === false && r3.missing.length === 1,
  'B3 两条同名判据剩一条 ⇒ 红（多重集计数，不是集合相等）', r3.missing.length);

const r4 = SG.compare({ locks: { 'x.js': { rows: [{ ok: true, msg: 'a' }] }, 'y.js': { rows: [{ ok: true, msg: 'b' }] } } },
  { locks: { 'x.js': { rows: [{ ok: true, msg: 'a' }] } } });
a(r4.ok === false && r4.goneFiles.length === 1 && r4.goneFiles[0] === 'y.js',
  'B4 文件面缺失 ⇒ FAIL 且点名 goneFiles（不是跳过）', r4.goneFiles);

const r5 = SG.compare(cap([{ ok: true, msg: 'a' }]), cap([{ ok: true, msg: 'a' }, { ok: true, msg: '新' }]));
a(r5.ok === true && r5.added.length === 1,
  'B5 多一条 ⇒ PASS 但 added=1（新增可见，不静默）', [r5.ok, r5.added.length]);

const r6 = SG.compare(cap([{ ok: true, msg: 'a' }]), cap([{ ok: false, msg: 'a' }]));
a(r6.ok === false && r6.missing.length === 1 && r6.added.length === 1,
  'B6 同文本但从 ✓ 变 ✗ ⇒ 红（状态参与身份，不是只比文本）', [r6.missing.length, r6.added.length]);

const emptyCap = SG.capture(['no-such-lock-at-all.js']);
a(emptyCap.empty.length === 1 && !emptyCap.locks['no-such-lock-at-all.js'].rows.length,
  'B7 零判据（缺文件/空转）被记进 empty ⇒ 可拒收，不许当基线', emptyCap.empty);

// B8：CLI 侧真的拒收（rc=3 且不写文件）——这一条走真进程
const outFile = path.join(require('os').tmpdir(), 'sg-should-not-exist-' + process.pid + '.json');
try { fs.unlinkSync(outFile); } catch (e) {}
const cli = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'split-guard.js'),
  '--capture', outFile, 'no-such-lock-at-all.js'], { cwd: ROOT, encoding: 'utf8' });
a(cli.status === 3 && !fs.existsSync(outFile),
  'B8 --capture 遇零判据 ⇒ rc=3 且基线文件一字不写（空基线会让比对恒真）',
  [cli.status, fs.existsSync(outFile)]);

// ── C. 现场真跑：拿一把真锁采判据，再与自己比对 ─────────────────
const real = SG.capture(['settle-v2820.js']);
const realRows = ((real.locks['settle-v2820.js'] || {}).rows) || [];
a(realRows.length > 0 && real.empty.length === 0,
  'C1 现场真跑 settle-v2820.js 采到判据（实 ' + realRows.length + ' 条）', realRows.length);
a(realRows.every(function (x) { return x.ok === true; }),
  'C2 现场这把锁的判据全为 ✓（采集没把红吞成绿）', realRows.filter(function (x) { return !x.ok; }).length);
const self = SG.compare(real, SG.capture(['settle-v2820.js']));
a(self.ok === true && self.nowCount === self.baseCount && self.baseCount > 0,
  'C3 同一现场连采两次 ⇒ PASS 且条数相等（实 ' + self.baseCount + ' → ' + self.nowCount + '）');

// ── D. 可读性 / 接线 ────────────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, 'tools', 'split-guard.js'), 'utf8');
function cnt(s, sub) { return s.split(sub).length - 1; }
const cCap = cnt(src, '--capture'), cCmp = cnt(src, '--compare');
const cMiss = cnt(src, '少判据'), cFail = cnt(src, '结论：FAIL'), cChild = cnt(src, 'lock-child.js');
a(cCap > 0 && cCmp > 0, 'D1 两种入口都在（--capture ' + cCap + ' 处 / --compare ' + cCmp + ' 处）', [cCap, cCmp]);
a(cMiss > 0 && cFail > 0, 'D2 红必须说人话（「少判据」' + cMiss + ' 处 / 「结论：FAIL」' + cFail + ' 处）', [cMiss, cFail]);
a(cChild > 0, 'D3 采集走子进程入口 lock-child（' + cChild + ' 处 —— 与锁级并行同一套，避免宿主污染把第二次采集变成另一个世界）', cChild);

// ── 汇总 ────────────────────────────────────────────────
if (fail) {
  console.log('OPV29-Z2-12-V2529: FAIL ' + fail + '/' + (pass + fail));
  process.exitCode = 1;
} else {
  console.log('OPV29-Z2-12-V2529: pass (' + pass + ')');
}