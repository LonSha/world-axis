#!/usr/bin/env node
'use strict';
/**
 * tests/v7-cap-tier-2283.js — v2.283.0（V7 OPV7-8）悬空引擎出厂档位下调专锁。
 *
 * 【本锁与探针的分工】探针（tools/v7probes/p_cap_tier_opv78.js）答「本次改动对不对」；
 *   本锁答「以后会不会退回去」。这一项最容易退化的三处，都钉在这里：
 *   ① **full 档把无驱动机制重新全开**：为图省事把排除过滤删掉，让 full 重新回到 100 台；
 *      锁钉「full 规模恰为 65（100 - 35），35 个悬空机制在切 full 后依然全部为 false」。
 *   ② **漏登排除名单或名单缩水**：排除名单漂移、缩水会重新让悬空机制露头；
 *      锁钉「L3_EXCLUDES 导出恰为 35 个全合法且全出厂关闭的命名空间」。
 *   ③ **切档复核放水**：假开而不真复核 notEffective；
 *      锁钉「applyTier('full') 的 notEffective 必须严格为空数组」。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const TIER_REL = 'engines/capability-tier.js';
const PANEL_REL = 'ui/panel.js';
const TIER_SRC = fs.readFileSync(path.join(BASE, TIER_REL), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8');
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
const A_FILTER = "function probeFull() {\n    const rows = allSwitches().filter(function (r) {\n      return r.hasBuild && r.hasSet && L3_EXCLUDES.indexOf(r.key) < 0;\n    });";
const A_SNAP_FILTER = "if (n === 'full') return rows.filter(function (r) { return r.hasBuild && r.hasSet && L3_EXCLUDES.indexOf(r.key) < 0; }).map(function (r) { return r.key; });";
const A_NOTE = "item.note = '开得起来的世界（已下调排除 35 个需手动录入数据的悬空机制）';";

let LOAD = null;
function loadList() {
  if (LOAD) return LOAD;
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  LOAD = vm.runInNewContext('[' + m[1] + ']');
  return LOAD;
}

function loadAll(ov) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try {
    const ls = global.localStorage;
    if (ls && typeof ls.clear === 'function') ls.clear();
    else if (ls && ls.__store) ls.__store = {};
  } catch (e) {}
  const ctx = vm.createContext(global);
  for (const rel of loadList()) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    const body = (ov && ov[rel] !== undefined) ? ov[rel] : fs.readFileSync(p, 'utf8');
    try { vm.runInContext(body, ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}

// ── 主线判据 ──

function runA(WA) {
  section('A 结构与定义');
  const cap = WA.capabilityTier;
  assert(cap && typeof cap === 'object', 'A1: WA.capabilityTier 正常存在');
  assert(Array.isArray(cap.L3_EXCLUDES), 'A2: L3_EXCLUDES 是数组');
  eq(cap.L3_EXCLUDES.length, 35, 'A3: L3_EXCLUDES 长度恰为 35');
  eq(new Set(cap.L3_EXCLUDES).size, 35, 'A4: L3_EXCLUDES 无重复项');

  let allExist = true, allOff = true;
  cap.L3_EXCLUDES.forEach(k => {
    if (!WA[k] || typeof WA[k] !== 'object') allExist = false;
    if (!WA[k] || !WA[k].getSettings || WA[k].getSettings().enabled !== false) allOff = false;
  });
  assert(allExist, 'A5: 35 个悬空机制全部为真实存在的引擎命名空间');
  assert(allOff, 'A6: 35 个悬空机制出厂状态全部为 enabled: false');
}

function runB(WA) {
  section('B 档位读数与下调面');
  const cap = WA.capabilityTier;
  const v = cap.view();
  assert(v && v.enabled === true, 'B1: view() 正常返回');
  eq(v.tier, 'lite', 'B2: 初始出厂档位为 lite');
  eq(v.tiers.length, 3, 'B3: 档位列表包含 3 档（lite, standard, full）');

  const liteItem = v.tiers.find(t => t.name === 'lite');
  const stdItem = v.tiers.find(t => t.name === 'standard');
  const fullItem = v.tiers.find(t => t.name === 'full');

  eq(liteItem && liteItem.size, 0, 'B4: lite 档规模为 0（不额外开）');
  eq(stdItem && stdItem.size, 34, 'B5: standard 档规模为 34');
  //   v2.293.0（V7 收口 · 基线跟位）：MECH 100 → 102（世界自传 + 一键播种两个注入面），
  //   排除名单仍是 35 ⇒ 规模 65 → 67。判据形态未变（仍是「有注入面的 − 排除」）。
  eq(fullItem && fullItem.size, 67, 'B6: full 档下调后规模恰为 67（102 - 35）');
  assert(fullItem && typeof fullItem.note === 'string' && fullItem.note.indexOf('35') >= 0, 'B7: full 档包含 35 排除注记');

  assert(Array.isArray(v.manualOnly) && v.manualOnly.length === 35, 'B8: view().manualOnly 暴露 35 个排除机制');
  assert(typeof v.manualNote === 'string' && v.manualNote.indexOf('手动录入数据') >= 0, 'B9: view().manualNote 包含手动录入说明');
}

function runC(WA) {
  section('C 切档、复核与回滚');
  const cap = WA.capabilityTier;

  // 切到 full 档
  const rFull = cap.applyTier('full');
  assert(rFull.ok === true, 'C1: 切到 full 档成功');
  eq(rFull.tier, 'full', 'C2: applyTier 返回 tier 为 full');
  assert(Array.isArray(rFull.notEffective) && rFull.notEffective.length === 0, 'C3: notEffective 为空（全部当场复核生效）');
  eq(rFull.turnedOn.length, 60, 'C4: full 档新开 60 个（65 目标 - 5 出厂机制）');
  //   注：v2.293.0 复核发现本行**与 B6/C5 自相矛盾**（65 目标下新开应为 60，随目标
  //   涨到 67、出厂涨到 7，新开仍恰为 60 —— 60 = 67 − 7 与 65 − 5 同值，故**本行不该变**）。
  //   这正是「只改登记值」的边界：目标与出厂同涨同落时，差值判据保持不变。

  const vFull = cap.view();
  eq(vFull.running, 67, 'C5: full 档运行机制数为 67（= MECH 102 − 排除 35）');
  eq(vFull.dormant, 35, 'C6: full 档休眠机制数为 35');

  // 验证 35 个排除机制无一被打开
  let anyL3On = false;
  cap.L3_EXCLUDES.forEach(k => {
    const sh = cap.shapeOf(k);
    if (sh && sh.on === true) anyL3On = true;
  });
  assert(!anyL3On, 'C7: 切到 full 档后 35 个悬空机制依然全为关闭状态');

  // 幂等切换
  const rFullAgain = cap.applyTier('full');
  assert(rFullAgain.ok === true && rFullAgain.noop === true, 'C8: 重复切 full 幂等生效（noop: true）');

  // 回滚到 lite 档
  const rRoll = cap.rollback();
  assert(rRoll.ok === true, 'C9: rollback() 执行成功');
  eq(rRoll.tier, 'lite', 'C10: 回滚后返回 tier 为 lite');

  const vLite = cap.view();
  eq(vLite.running, 7, 'C11: 回滚后运行机制数恢复出厂 7 台（v2.293.0：自传 + 播种）');
  eq(vLite.dormant, 95, 'C12: 回滚后休眠机制数恢复 95 台（102 − 7，未随 BASE_ON 变）');
}

function runD() {
  section('D 面板文案与说明对齐');
  assert(PANEL_SRC.indexOf('开得起来的世界') >= 0, 'D1: ui/panel.js 包含「开得起来的世界」说明');
  assert(PANEL_SRC.indexOf('排除 35 个需手动录入数据的悬空机制') >= 0, 'D2: ui/panel.js 包含「排除 35 个」文案');
  assert(PANEL_SRC.indexOf('full｜开得起来') >= 0, 'D3: ui/panel.js full 按钮标题更新为「full｜开得起来」');
}

// ── 负控制（N1–N4）──

function runNegative() {
  section('N 负控制：真源码破坏');

  must1(TIER_SRC, A_FILTER, 'A_FILTER');
  must1(TIER_SRC, A_SNAP_FILTER, 'A_SNAP_FILTER');
  must1(TIER_SRC, A_NOTE, 'A_NOTE');

  // N1: 破坏 probeFull 过滤条件，恢复旧 full 全开逻辑
  let n1Threw = false;
  try {
    const brokenSrc = TIER_SRC.replace(A_FILTER, "function probeFull() {\n    const rows = allSwitches().filter(function (r) {\n      return r.hasBuild && r.hasSet;\n    });");
    const badWA = loadAll({ [TIER_REL]: brokenSrc });
    const r = badWA.capabilityTier.applyTier('full');
    if (r && r.turnedOn && r.turnedOn.length === 60) {
      // 没抛且 turnedOn 仍为 60 说明判据没咬住
    } else {
      n1Threw = true;
    }
  } catch (e) { n1Threw = true; }
  assert(n1Threw, 'N1: 破坏 probeFull 排除过滤时，切 full 开启数量偏离 60，判据必咬');

  // N2: 破坏 L3_EXCLUDES 名单（删去一个元素）
  let n2Threw = false;
  try {
    const brokenSrc = TIER_SRC.replace("'eraCycle'", "");
    const badWA = loadAll({ [TIER_REL]: brokenSrc });
    if (badWA.capabilityTier.L3_EXCLUDES.length !== 35) {
      n2Threw = true;
    }
  } catch (e) { n2Threw = true; }
  assert(n2Threw, 'N2: 破坏 L3_EXCLUDES 数组长度时，35 名单自洽性检查必咬');

  // N3: 破坏 view 中的 note 注入
  let n3Threw = false;
  try {
    const brokenSrc = TIER_SRC.replace(A_NOTE, "// item.note omitted");
    const badWA = loadAll({ [TIER_REL]: brokenSrc });
    const fullItem = (badWA.capabilityTier.view().tiers || []).find(t => t.name === 'full');
    if (!fullItem.note || fullItem.note.indexOf('35') < 0) {
      n3Threw = true;
    }
  } catch (e) { n3Threw = true; }
  assert(n3Threw, 'N3: 破坏 view() full 注记时，判据必咬');

  // N4: 纯度验证，原文件逐字未变
  const currentSrc = fs.readFileSync(path.join(BASE, TIER_REL), 'utf8');
  eq(currentSrc, TIER_SRC, 'N4: 全部负控制跑完后 capability-tier.js 逐字未变');
}

function main() {
  console.log('=== WorldAxis tests/v7-cap-tier-2283.js ===');
  pass = 0; fail = 0; fails.length = 0;
  const WA = loadAll();
  runA(WA);
  runB(WA);
  runC(WA);
  runD();
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
