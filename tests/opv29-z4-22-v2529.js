#!/usr/bin/env node
// WorldAxis tests/opv29-z4-22-v2529.js — V29 优化线 Z4（OPV29-22）专锁
//
// 治的病
//   计划原文：「测试替身不得替代被测源码；篡改真源码必须红」。
//   `require.cache[X] = stub`（替身顶替）与 `delete require.cache[X]`（清缓存重读真源）
//   在 grep 里长得几乎一样，此前没有任何机器判据能分开它们。
//
// 本锁钉住 tools/mock-boundary.js（B 段全部用沙箱根真造文件与真跑子进程）：
//   A 现场：清缓存 51 处 / 替身注入 2 处且在册 / 产品源顶替 0 处 / 台账每条带 why。
//   B 负控制：未登记注入 ⇒ 红；产品源被顶替 ⇒ 红；登记条数失实 ⇒ 红；影子条目 ⇒ 红；零清缓存 ⇒ 红。
//   C 真跑：CLI 现场 rc=0，坏沙箱 rc=1。
//   D 自证：沙箱「真源 + 清缓存后读真源的锁」在真源被改坏后必须 rc=1（读的是真源不是缓存旧脸）。
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
const MB = require('../tools/mock-boundary.js');

// ── 沙箱工厂：造 tests/ + 台账 ────────────────────────────
function sandbox(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-lock-'));
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  const lockLines = [];
  if (opts.purge !== false) lockLines.push("delete require.cache[require.resolve('../engines/foo.js')];");
  if (opts.inject) lockLines.push("require.cache[pabs] = inflight;");
  if (opts.productInject) lockLines.push("require.cache[require.resolve('../engines/foo.js')] = fake;");
  fs.writeFileSync(path.join(dir, 'tests', 'x.js'), lockLines.join('\n') + '\n');
  const entries = [];
  if (opts.ledger !== false) {
    entries.push({
      file: 'tests/x.js',
      sites: (opts.ledgerSites === undefined ? (opts.inject || opts.productInject ? 1 : 0) : opts.ledgerSites),
      why: opts.shortWhy ? '太短' : '本锁自己造的夹具，用于测试装载中档位，且随后 delete 复原，不替换产品源'
    });
    if (opts.shadow) entries.push({ file: 'tests/none.js', sites: 1, why: '影子条目用于负控制，这条在现场并不存在注入点' });
  }
  fs.writeFileSync(path.join(dir, 'tests', 'mock-boundary-ledger.json'),
    JSON.stringify({ _note: 'sbx', version: 'x', entries: entries }, null, 1));
  return dir;
}

// ── A. 现场 ───────────────────────────────────────────────
const live = MB.check(ROOT);
a(live.scan.purge >= 1, 'A1 现场清缓存重读真源站点 ≥1（实测 ' + live.scan.purge + ' 处）', live.scan.purge);
a(live.scan.inject.length === 2 && live.ok === true,
  'A2 现场替身注入 2 处且全部在册（check ok=' + live.ok + '）', live.scan.inject.map(function (x) { return x.at; }));
a(live.scan.productInject.length === 0, 'A3 产品源被替身顶替 = 0 处（实测 ' + live.scan.productInject.length + '）', live.scan.productInject);
const ledRaw = (function () {
  try { return fs.readFileSync(path.join(ROOT, 'tests', 'mock-boundary-ledger.json'), 'utf8'); } catch (e) { return null; }
})();
let led = null;
try { led = ledRaw === null ? null : JSON.parse(ledRaw); } catch (e) { led = null; }
const ledOk = !!(led && Array.isArray(led.entries) && led.entries.length === 1
  && led.entries.every(function (e) { return String(e.why || '').length >= 20; }));
a(ledOk, 'A4 台账 1 条且 why ≥20 字（' + ((led && led.entries && led.entries[0]) || {}).file + '）',
  ledRaw === null ? '台账文件读不出' : (led && led.entries ? led.entries.length : 'JSON 解析失败'));

// ── B. 负控制（沙箱真造文件）────────────────────────────────
const s0 = sandbox({ inject: true });
const r0 = MB.check(s0);
a(r0.ok === true, 'B0 已登记的替身注入 + 有清缓存 ⇒ 沙箱本身是绿的（后面的红才可信）', r0.problems);

const s1 = sandbox({ inject: true, ledger: false });
const r1 = MB.check(s1);
a(r1.ok === false && r1.problems.some(function (p) { return p.indexOf('未登记的替身注入') >= 0; }),
  'B1 未登记的替身注入 ⇒ 红（点名文件）', r1.problems);

const s2 = sandbox({ purge: true, productInject: true });
const r2 = MB.check(s2);
a(r2.ok === false && r2.scan.productInject.length === 1,
  'B2 产品源被替身顶替 ⇒ 红且点名 target（实 ' + r2.scan.productInject.length + ' 处）', r2.scan.productInject);

const s3 = sandbox({ inject: true, ledgerSites: 5 });
const r3 = MB.check(s3);
a(r3.ok === false && r3.problems.some(function (p) { return /登记失实/.test(p); }),
  'B3 登记条数失实（登记 5 / 现场 1）⇒ 红', r3.problems);

const s4 = sandbox({ inject: true, shadow: true });
const r4 = MB.check(s4);
a(r4.ok === false && r4.problems.some(function (p) { return /影子条目/.test(p); }),
  'B4 登记了现场不存在的注入（影子条目）⇒ 红', r4.problems);

const s5 = sandbox({ purge: false });
const r5 = MB.check(s5);
a(r5.ok === false && r5.problems.some(function (p) { return /清缓存/.test(p); }),
  'B5 全场零清缓存 ⇒ 红（不许「反正没人清缓存」的虚空通过）', r5.problems);

// ── C. 真跑 CLI ─────────────────────────────────────────
const cLive = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mock-boundary.js'), '--check'],
  { cwd: ROOT, encoding: 'utf8' });
a(cLive.status === 0, 'C1 现场 --check ⇒ rc=0（实 ' + cLive.status + '）', cLive.status);
const cBad = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mock-boundary.js'), '--check', '--root', s2],
  { cwd: ROOT, encoding: 'utf8' });
a(cBad.status === 1, 'C2 坏沙箱 --check ⇒ rc=1（实 ' + cBad.status + '）', cBad.status);

// ── D. 自证：改坏真源必须红 ──────────────────────────────
const p = MB.provePurgeReadsTruth();
a(p.ok === true && p.before === 0 && p.after === 1,
  'D1 沙箱自证：真源完好 rc=' + p.before + ' / 真源被改坏 rc=' + p.after + '（清缓存读的是真源）', p);

// ── 汇总 ────────────────────────────────────────────────
[s0, s1, s2, s3, s4, s5].forEach(function (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
if (fail) {
  console.log('OPV29-Z4-22-V2529: FAIL ' + fail + '/' + (pass + fail));
  process.exitCode = 1;
} else {
  console.log('OPV29-Z4-22-V2529: pass (' + pass + ')');
}
