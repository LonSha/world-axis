#!/usr/bin/env node
// WorldAxis tests/opv29-z1-14-v2529.js — V29 优化线 Z1（OPV29-14）专锁
//
// 治的病
//   计划原文：「52 条死表逐条定性：删/接/留（留要写理由）」，验收「死表数下降且记账；
//   **不许静默跳过**」。此前 DEAD 表每条只有 anchor + why：人读得懂，机器不保证——
//   增删一条、理由写「TODO」、锚点对应的源码行被人改掉，都不会红。
//
// 本锁钉住 tools/dead-table-triage.js（B 段全部用沙箱根真造文件，不玩字符串戏法）：
//   A 现场：52 条全定性 / keep 52 · del 0 · wire 0 / 锚点漂移 0 / 欠账已声明。
//   B 负控制：缺定性 · 幽灵条目 · 理由太短 · 占位词 · keep 前提失效 · 假删 · 缺欠账 · 账对不上。
//   C 真跑：CLI 现场 rc=0，坏沙箱 rc=1。
//   D 真修证据：bad-draft 的锚点本轮归位（tools 的 T5 上线当天抓到的真漂移）。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  console.log('  ✗ ' + line); return false;
}
const T = require('../tools/dead-table-triage.js');

const ANCHOR = "return { ok: false, reason: 'aa-code' };";

// ── 沙箱工厂：造 tests/ + engines/ ────────────────────────
function sandbox(opts) {
  const o = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-lock-'));
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'engines'), { recursive: true });
  const deadKeys = o.deadKeys || ['aa-code'];
  const deadBody = deadKeys.map(function (k) {
    const anchor = (o.brokenAnchor && k === 'aa-code')
      ? "return { ok: false, reason: 'gone-anchor' };"
      : "return { ok: false, reason: '" + k + "' };";
    return "  '" + k + "': { anchor: " + JSON.stringify(anchor)
      + ", why: '沙箱夹具：该码在产品面结构不可达，此处只用于验证门禁判据是否真的会红。' }";
  }).join(',\n');
  fs.writeFileSync(path.join(dir, 'tests', 'reject-v2780.js'),
    "'use strict';\nmodule.exports = { tables: {}, DEAD: {\n" + deadBody + '\n} };\n');
  fs.writeFileSync(path.join(dir, 'engines', 'foo.js'),
    "'use strict';\nfunction guard(flag) {\n  if (flag) " + ANCHOR.replace('aa-code', deadKeys[0])
    + "\n  return { ok: true };\n}\nmodule.exports = { guard: guard };\n");
  const entries = (o.entries !== undefined) ? o.entries : deadKeys.map(function (k) {
    return { key: k, action: 'keep', why: '沙箱夹具的定性理由：该码在产品面结构不可达且锚点仍在源码里，故保留并钉住前提。' };
  });
  const led = { _note: 'sbx', _debt: (o.debt === undefined
    ? '沙箱夹具的欠账说明：本轮没有删也没有接，所以死表数与上一版相同，必须把原因写在这里供审计复核。'
    : o.debt), version: 'x', entries: entries };
  fs.writeFileSync(path.join(dir, 'tests', 'dead-table-triage.json'), JSON.stringify(led, null, 1));
  return dir;
}
const GOODWAY = '沙箱夹具的定性理由：该码在产品面结构不可达且锚点仍在源码里，故保留并钉住前提。';

// ── A. 现场 ───────────────────────────────────────────────
const live = T.check(ROOT);
a(live.scan.deadCount === 52, 'A1 现场死表 52 条（实测 ' + live.scan.deadCount + '）', live.scan.deadCount);
const liveKeep = (live.ledger.entries || []).filter(function (e) { return e.action === 'keep'; }).length;
a(liveKeep === 52 && live.ledger.entries.length === 52,
  'A2 52 条逐条定性且全为 keep（台账 ' + live.ledger.entries.length + ' 条）', live.ledger.entries.length);
a(String(live.ledger._debt || '').length >= 40, 'A3 del=0 已声明欠账（' + String(live.ledger._debt || '').length + ' 字）');
a(live.ok === true, 'A4 现场 --check 一致（ok=' + live.ok + '）', live.problems);
const drift = Object.keys(live.scan.per).filter(function (k) { return !live.scan.per[k].anchorOk; });
a(drift.length === 0, 'A5 锚点漂移 0 条（实测 ' + drift.length + '）', drift);

// ── B. 负控制（沙箱真造文件）────────────────────────────────
const s0 = sandbox({});
const r0 = T.check(s0);
a(r0.ok === true, 'B0 沙箱基线本身是绿的（后面的红才可信）', r0.problems);

const s1 = sandbox({ entries: [] });
const r1 = T.check(s1);
a(r1.ok === false && r1.problems.some(function (p) { return /静默跳过/.test(p); }),
  'B1 死表码没有定性 ⇒ 红（点名，不许静默跳过）', r1.problems);

const s2 = sandbox({ entries: [{ key: 'aa-code', action: 'keep', why: GOODWAY },
  { key: 'not-exist', action: 'keep', why: GOODWAY }] });
const r2 = T.check(s2);
a(r2.ok === false && r2.problems.some(function (p) { return /幽灵条目/.test(p); }),
  'B2 幽灵条目（定性了不存在的码）⇒ 红', r2.problems);

const s3 = sandbox({ entries: [{ key: 'aa-code', action: 'keep', why: '太短了' }] });
const r3 = T.check(s3);
a(r3.ok === false && r3.problems.some(function (p) { return /理由太短/.test(p); }),
  'B3 理由太短（<24 字）⇒ 红', r3.problems);

const s4 = sandbox({ entries: [{ key: 'aa-code', action: 'keep', why: GOODWAY + 'TODO' }] });
const r4 = T.check(s4);
a(r4.ok === false && r4.problems.some(function (p) { return /占位词/.test(p); }),
  'B4 理由含占位词（TODO）⇒ 红', r4.problems);

const s5 = sandbox({ brokenAnchor: true });
const r5 = T.check(s5);
a(r5.ok === false && r5.problems.some(function (p) { return /前提失效/.test(p); }),
  'B5 keep 的前提失效（anchor 已不在源码里）⇒ 红（T5 抓的就是 bad-draft 那种漂移）', r5.problems);

const s6 = sandbox({ entries: [{ key: 'aa-code', action: 'del', why: '沙箱夹具：故意把仍在死表里的码定性为删，用来验证门禁能不能抓住假删这种糊弄。' }] });
const r6 = T.check(s6);
a(r6.ok === false && r6.problems.some(function (p) { return /假删/.test(p); }),
  'B6 假删（该码仍在死表里却定性为 del）⇒ 红', r6.problems);

const s7 = sandbox({ debt: '' });
const r7 = T.check(s7);
a(r7.ok === false && r7.problems.some(function (p) { return /没写 _debt/.test(p); }),
  'B7 del=0 却没写欠账 ⇒ 红（不许用「全留」换通过）', r7.problems);

const s8 = sandbox({ deadKeys: ['aa-code', 'bb-code'],
  entries: [{ key: 'aa-code', action: 'keep', why: GOODWAY },
    { key: 'bb-code', action: 'del', why: '沙箱夹具：两条死表只定性一条，用来验证账目对不上时门禁会不会红。' }] });
const r8 = T.check(s8);
a(r8.ok === false && r8.problems.some(function (p) { return /账对不上|假删/.test(p); }),
  'B8 账对不上（死表 2 条 / 台账剩 1 条）⇒ 红', r8.problems);

// ── C. 真跑 CLI ───────────────────────────────────────────
const cLive = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'dead-table-triage.js'), '--check'],
  { cwd: ROOT, encoding: 'utf8' });
a(cLive.status === 0, 'C1 现场 CLI --check ⇒ rc=0（实 ' + cLive.status + '）', cLive.status);
const cBad = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'dead-table-triage.js'), '--check', '--root', s5],
  { cwd: ROOT, encoding: 'utf8' });
a(cBad.status === 1, 'C2 坏沙箱 CLI --check ⇒ rc=1（实 ' + cBad.status + '）', cBad.status);

// ── D. 真修证据 ───────────────────────────────────────────
const bd = live.scan.per['bad-draft'];
a(bd && bd.anchorOk === true && bd.hits >= 1,
  'D1 bad-draft 锚点归位（源码出现 ' + (bd && bd.hits) + ' 处 / anchorOk=' + (bd && bd.anchorOk) + '）', bd);

// ── 汇总 ────────────────────────────────────────────────
[s0, s1, s2, s3, s4, s5, s6, s7, s8].forEach(function (d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
});
if (fail) {
  console.log('OPV29-Z1-14-V2529: FAIL ' + fail + '/' + (pass + fail));
  process.exitCode = 1;
} else {
  console.log('OPV29-Z1-14-V2529: pass (' + pass + ')');
}