#!/usr/bin/env node
'use strict';
/**
 * tests/v7-yield-baseline-2284.js — v2.284.0（V7 OPV7-9）产出回归基线门禁专锁。
 *
 * 【本锁与探针的分工】探针（tools/v7probes/p_yield_baseline.js）答「本次产出读数是多少」；
 *   本锁答「以后会不会产出倒退」。这一项最容易退化的两处，都钉在这里：
 *   ① **产出面衰退**：任何改动使空世界非空掉出 4、开局非空掉出 14，或者推演非空掉出 14；
 *      锁钉「三态产出下界硬判据，允许向上漂移，严禁向下衰退」。
 *   ② **单调性倒退**：开局后比空世界内容还少、或推演后内容变少（shrinking 倒退）；
 *      锁钉「intakeYield >= seededYield >= emptyYield 的单调非递减性」。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');   // v2.293.0：负控制探针临时文件改走 os.tmpdir()，消除 /tmp 死路径字面量（v2410）
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const PROBE_REL = 'tools/v7probes/p_yield_baseline.js';
const PROBE_SRC = fs.readFileSync(path.join(BASE, PROBE_REL), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function assert(ok, msg) {
  if (ok) { pass++; return; }
  fail++; fails.push(msg);
  console.log('  ✗ ' + msg);
}
function eq(a, b, msg) { assert(a === b, msg + '（实得 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + '）'); }
function section(t) { console.log('\n── ' + t + ' ──'); }
function cnt(s, n) { return String(s).split(n).length - 1; }
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag);
  return c;
}

// 负控制锚点（本文件内各只声明一次 —— 判据纯度 H5）
const A_BOTTOM_EMPTY = "a(res.empty.count >= 4, '空世界非空产出 >= 4";
const A_BOTTOM_SEEDED = "a(res.seeded.count >= 14, '真实开局后非空产出 >= 14";

const probeModule = require(path.join(BASE, PROBE_REL));

function runMainBaseline() {
  section('A 产出回归基线测量');
  const WA = probeModule.createFreshEnv();
  try { WA.store.init(); } catch (e) {}

  const res = probeModule.measureYieldBaseline(WA);

  assert(res && res.empty && typeof res.empty.count === 'number', 'A1: 空世界产出测量完成');
  assert(res.empty.count >= 4, 'A2: 空世界非空产出保持在基线 >= 4（实 ' + res.empty.count + '）');

  assert(res && res.seeded && typeof res.seeded.count === 'number', 'A3: 真实开局播种后产出测量完成');
  assert(res.seeded.count >= 14, 'A4: 开局后非空产出保持在基线 >= 14（实 ' + res.seeded.count + '）');

  assert(res && res.intake && typeof res.intake.count === 'number', 'A5: 推演分发后产出测量完成');
  assert(res.intake.count >= 14, 'A6: 推演后非空产出保持在基线 >= 14（实 ' + res.intake.count + '）');

  assert(res.seeded.count >= res.empty.count, 'A7: 开局后非空产出不低于空世界（单调非递减）');
  assert(res.intake.count >= res.seeded.count, 'A8: 推演后非空产出不低于开局后（单调非递减）');
}

function runContract() {
  section('B 核心引擎产出见证');
  const WA = probeModule.createFreshEnv();
  try { WA.store.init(); } catch (e) {}
  WA.capabilityTier.applyTier('full');
  WA.playableBlueprint.installSample('town-workshop', { force: true, ignoreMissing: true });

  const coreDrivers = ['life', 'org', 'world', 'difficulty', 'bonds', 'perspective'];
  coreDrivers.forEach(k => {
    const m = WA[k];
    let b = '';
    try { b = m.buildBlock(); } catch (e) { b = ''; }
    assert(typeof b === 'string' && b.trim().length > 0, 'B-core: 核心驱动机制 ' + k + ' 开局后必须有非空产出');
  });
}

function runNegative() {
  section('N 负控制：真源码破坏');

  must1(PROBE_SRC, A_BOTTOM_EMPTY, 'A_BOTTOM_EMPTY');
  must1(PROBE_SRC, A_BOTTOM_SEEDED, 'A_BOTTOM_SEEDED');

  // N1: 破坏空世界下界阈值（抬高到 999 必报错）
  let n1Threw = false;
  try {
    const brokenSrc = PROBE_SRC.replace(A_BOTTOM_EMPTY, "a(res.empty.count >= 999, '空世界非空产出 >= 4");
    const tmpFile = path.join(os.tmpdir(), '_n1_probe.js');   // v2.293.0：/tmp 死路径 → os.tmpdir()（v2410）
    fs.writeFileSync(tmpFile, brokenSrc);
    const r = require('child_process').spawnSync('node', [tmpFile], { cwd: BASE, encoding: 'utf8' });
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    if (r.status !== 0) n1Threw = true;
  } catch (e) { n1Threw = true; }
  assert(n1Threw, 'N1: 空世界下界被破坏抬高时，探针必报失败');

  // N2: 破坏开局下界阈值（抬高到 999 必报错）
  let n2Threw = false;
  try {
    const brokenSrc = PROBE_SRC.replace(A_BOTTOM_SEEDED, "a(res.seeded.count >= 999, '真实开局后非空产出 >= 14");
    const tmpFile = path.join(os.tmpdir(), '_n2_probe.js');   // v2.293.0：/tmp 死路径 → os.tmpdir()（v2410）
    fs.writeFileSync(tmpFile, brokenSrc);
    const r = require('child_process').spawnSync('node', [tmpFile], { cwd: BASE, encoding: 'utf8' });
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    if (r.status !== 0) n2Threw = true;
  } catch (e) { n2Threw = true; }
  assert(n2Threw, 'N2: 开局下界被破坏抬高时，探针必报失败');

  // N3: 原文件纯度
  const curSrc = fs.readFileSync(path.join(BASE, PROBE_REL), 'utf8');
  eq(curSrc, PROBE_SRC, 'N3: 全部负控制跑完后 p_yield_baseline.js 逐字未变');
}

function main() {
  console.log('=== WorldAxis tests/v7-yield-baseline-2284.js ===');
  pass = 0; fail = 0; fails.length = 0;
  runMainBaseline();
  runContract();
  runNegative();

  console.log('\n专锁汇总: ' + pass + ' pass / ' + fail + ' fail');
  if (fail) {
    console.error('\n失败项:');
    fails.forEach(f => console.error('  - ' + f));
    if (require.main === module) process.exit(1);
    throw new Error('Lock failed with ' + fail + ' failures');
  }
}

if (require.main === module) {
  main();
}

module.exports = { runAll: main, main: main };