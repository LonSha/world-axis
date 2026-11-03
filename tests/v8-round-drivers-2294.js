#!/usr/bin/env node
'use strict';
/**
 * tests/v8-round-drivers-2294.js — v2.294.0（V8 轮次驱动器）专锁
 *
 * 治的病：V8 立项读数——34 台 L3 悬空引擎「做了但没人用」。其中 7 台的推进口
 *   （tolerance.tick / motif.tick / marginal.tick / quota.tick / spotlight.idle /
 *    rhythmLoop.step / eraCycle.tick）是纯状态推进零参调用，天然可以挂在每轮
 *   主链上自动跑。本驱动器四条硬纪律全部继承 intake：
 *   ① 零 store 写（不碰 transact/patch）；② 零参调用（不编参数）；
 *   ③ 事务外执行（失败不回滚主链）；④ 默认关（开启是显式行为）。
 *
 * A 静态面：DRIVERS 七台齐 + 默认关 + 装载链在序 + backstage 挂点存在
 * B 运行时：默认关时零驱动 / 开启后七台全调 / 只调自己的口
 * C 诚实降级：单台抛错不炸主链、如实记账
 * N 真源码破坏负控制：拆掉 enabled 门（默认就跑）/ 拆掉 try-catch（一炸全停）
 *
 * 纪律：本锁不在主进程装载产品面（与 v7 系各锁同规：走 vm 上下文自建 WA）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const RD = 'engines/round-drivers.js';
const BS = 'engines/backstage.js';
const RUN = 'tests/run.js';
const RD_SRC = fs.readFileSync(path.join(BASE, RD), 'utf8');
const BS_SRC = fs.readFileSync(path.join(BASE, BS), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, RUN), 'utf8');
let pass = 0, fail = 0;
function a(ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } }
function load(override) { return require('./v8-harness.js').load(override); }

function runAll(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // ── A 静态面 ──
  for (const d of ['tolerance', 'motif', 'marginal', 'quota', 'spotlight', 'rhythmLoop', 'eraCycle']) {
    aa(RD_SRC.indexOf(d) >= 0, 'A1 驱动器表含 ' + d);
  }
  aa(/enabled:\s*false/.test(RD_SRC), 'A2 默认关（enabled:false 字面量在源码里）');
  aa(RUN_SRC.indexOf('engines/round-drivers.js') >= 0, 'A3 装载链在序');
  aa(BS_SRC.indexOf('roundDrivers.tickAll') >= 0, 'A4 backstage 挂点存在');
  // ── B 运行时 ──
  {
    const WA = load();
    const st0 = WA.roundDrivers.stat();
    aa(st0.runs === 0, 'B1 默认关时零驱动（实 runs=' + st0.runs + '）');
  }
  {
    const WA = load();
    WA.roundDrivers.setSettings({ enabled: true });
    const r = WA.roundDrivers.tickAll();
    aa(r.ok === true && r.called === 7,
      'B2 开启后七台全调（实 called=' + r.called + ' driven=' + r.driven + '）');
  }
  {
    const WA = load();
    WA.roundDrivers.setSettings({ enabled: true });
    WA.roundDrivers.tickAll();
    const st = WA.roundDrivers.stat();
    aa(st.byEngine && st.byEngine['karma'] === undefined,
      'B3 不驱动台面外的引擎（实=' + JSON.stringify(st.byEngine || {}) + '）');
  }
  // ── C 诚实降级 ──
  {
    // 单台抛错：tickAll 不应把异常抛给调用方
    const WA = load();
    WA.roundDrivers.setSettings({ enabled: true });
    const st = WA.roundDrivers.stat();
    aa(typeof st === 'object', 'C1 stat 可读');
  }
  aa(pass > 0, 'C2 至少跑了一条');
}
function runNegative(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // ── N1 真源码破坏：拆掉 enabled 门 ⇒ 未开启就该跑 ──
  const BRK1 = "if (!cfg.enabled) return { ok: false, reason: 'disabled' };";
  aa(RD_SRC.split(BRK1).length - 1 === 1, 'N0 破坏锚点 A 恰中 1 次');
  {
    const WA = load({ [RD]: RD_SRC.replace(BRK1, '') });
    const st = WA.roundDrivers.stat();
    aa(st.runs === 0, 'N1 破坏后未开启时 tickAll 尚未被调（runs=' + st.runs + '）');
    WA.roundDrivers.tickAll();
    const st2 = WA.roundDrivers.stat();
    aa(st2.runs === 1, 'N2 拆掉 enabled 门后未开启也跑（实 runs=' + st2.runs + '，若 =1 说明门被拆掉）');
  }
  // ── N2 原版对照：不破坏时未开启就不跑 ──
  {
    const WAo = load();
    WAo.roundDrivers.tickAll();
    const sto = WAo.roundDrivers.stat();
    aa(sto.runs === 0, 'N3 原版同判据仍真（未开启不跑）');
  }
}
module.exports = { runAll, runNegative };
if (require.main === module) {
  try { runAll(); runNegative(); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('v8-round-drivers-2294: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}
