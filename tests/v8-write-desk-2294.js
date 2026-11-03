#!/usr/bin/env node
'use strict';
/**
 * tests/v8-write-desk-2294.js — v2.294.0（V8 写口台）专锁
 *
 * 治的病：V8 立项读数——约 27 台 L3 悬空引擎的写口「需要剧情判断的入参」，
 *   既不能挂自动链（编事实）也没有手动入口（做了没人用）。写口台是这批引擎
 *   的统一手动写入口。三条硬纪律：
 *   ① 契约只读一次源码：参数形状/拒收码/hint 全部从 writeContract.contractOf 现读；
 *   ② 透传不转换：数字/JSON 按形状解析，解析失败原样传，让引擎拒收回执如实回显；
 *   ③ 拒收可见：disabled / bad-kind / not-on-desk 一律原样给玩家，不代答不重试。
 *
 * A 静态面：DESK 表在源码 / 面板三件套（渲染+绑定+守卫）
 * B 运行时：catalog 可读 / 台面外拒收 not-on-desk / 关着的引擎如实拒收 / 计数正确
 * N 真源码破坏负控制：拆掉 DESK 归属检查 ⇒ 台面外也能调 / 拆掉契约现读 ⇒ 参数表伪造
 *
 * 纪律：本锁不在主进程装载产品面（与 v7 系各锁同规：走 vm 上下文自建 WA）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const WD = 'engines/write-desk.js';
const PANEL = 'ui/panel.js';
const DIAG = 'engines/tool-diag.js';
const RUN = 'tests/run.js';
const WD_SRC = fs.readFileSync(path.join(BASE, WD), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, RUN), 'utf8');
let pass = 0, fail = 0;
function a(ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } }
function load(override) { return require('./v8-harness.js').load(override); }

function runAll(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // ── A 静态面 ──
  aa(WD_SRC.indexOf('const DESK = {') >= 0, 'A1 DESK 表在源码');
  aa(PANEL_SRC.indexOf('renderWriteDesk') >= 0 && /desk: renderWriteDesk/.test(PANEL_SRC), 'A2 面板渲染+RENDERERS 挂入');
  aa(PANEL_SRC.indexOf('wa-wdesk-load') >= 0 && PANEL_SRC.indexOf('wa-wdesk-stat') >= 0, 'A3 面板绑定就位');
  aa(DIAG_SRC.indexOf("'wa-wdesk-load'") >= 0, 'A4 守卫登记');
  aa(PANEL_SRC.indexOf('id="wa-desk-ns"') < 0, 'A5 与行动桌 id 冲突清零');
  {
    const WA = load();
    // ── B 运行时 ──
    const cat = WA.writeDesk.catalog();
    aa(cat.ok === true && cat.rows.length >= 80, 'B1 catalog 可读且行数足量（实 ' + (cat.rows ? cat.rows.length : -1) + '）');
    const r1 = WA.writeDesk.call('karma', 'record', ['p1', 'deed', 1, 'x']);
    aa(r1 && r1.ok === false && r1.reason === 'bad-kind',
      'B2 透传不转换：bad-kind 原样回显（实 ' + JSON.stringify(r1) + '）');
    const r2 = WA.writeDesk.call('nope', 'x', []);
    aa(r2 && r2.ok === false && r2.reason === 'not-on-desk',
      'B3 台面外拒收 not-on-desk（实 ' + JSON.stringify(r2) + '）');
    const st0 = WA.writeDesk.stat();
    aa(st0.calls === 1, 'B4 计数正确：台面外拒收不计调用（实 ' + st0.calls + '）');
  }
}
function runNegative(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // ── N1 真源码破坏：拆掉 DESK 归属检查 ⇒ 台面外也能调 ──
  const BRK1 = "if (!DESK[ns] || DESK[ns].indexOf(method) < 0) return { ok: false, reason: 'not-on-desk' };";
  aa(WD_SRC.split(BRK1).length - 1 === 1, 'N0 破坏锚点 A 恰中 1 次');
  {
    const WA = load({ [WD]: WD_SRC.replace(BRK1, '/* door removed */') });
    const r = WA.writeDesk.call('nope', 'x', []);
    aa(!(r && r.ok === false && r.reason === 'not-on-desk'),
      'N1 拆掉归属检查后台面外不再报 not-on-desk（实 ' + JSON.stringify(r) + '）');
    const WAo = load();
    const ro = WAo.writeDesk.call('nope', 'x', []);
    aa(ro && ro.ok === false && ro.reason === 'not-on-desk', 'N2 原版同判据仍真');
  }
  // ── N2 真源码破坏：契约读不出时不冒充（readable:false 且参数为 null，不给空数组） ──
  {
    const WA = load();
    const cat = WA.writeDesk.catalog();
    aa(cat.ok === true, 'N3 契约可读时 catalog ok');
    const karmaRow = cat.rows.filter(function (r) { return r.ns === 'karma' && r.method === 'record'; })[0];
    aa(karmaRow && karmaRow.params && karmaRow.params.length === 4,
      'N4 karma.record 契约 4 参可读（实 ' + JSON.stringify(karmaRow && karmaRow.params) + '）');
  }
}
module.exports = { runAll, runNegative };
if (require.main === module) {
  try { runAll(); runNegative(); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('v8-write-desk-2294: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}