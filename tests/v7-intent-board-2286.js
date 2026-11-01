#!/usr/bin/env node
'use strict';
/**
 * tests/v7-intent-board-2286.js — v2.286.0（V7 EXV7-2）人物意图看板专锁。
 *
 * 【本锁与探针的分工】探针（tools/v7probes/p_intent_face.js）答「本次改动对不对」；
 *   本锁答「以后会不会退回去」。这一项最容易退化的四处，逐条钉在这里：
 *   ① **给没链的人也造一行**：为「看着满」补空行，于是「他没计划」与「看板坏了」同形；
 *      锁钉「查 3 人只出 2 行、skipped 恰 1（无链的人不进看板）」。
 *   ② **拟稿冒充事实**：pending 步被叙述成既成事实；
 *      锁钉「未结算步 asFact 严格 false」。
 *   ③ **卡点自己编一句**：不再逐字取 chain.blockedBy（改说「受阻」之类的概括词）；
 *      锁钉「卡点文案恰为『缺 银元×3』」。
 *   ④ **关着还出行**：disabled 前置判定被删掉；锁钉「关着时 board 报 disabled」。
 *   N 段对上述四处各做一次**真源码破坏**，并两向自证：原版上同一判据必真（判据不是空转）、
 *   破坏版上同一判据必假；最后做纯度检查（跑完全部负控制后源文件逐字未变）。
 *
 * 【判据纯度（H5）】四条破坏锚点在本文件内**各只声明一次**，判据不得引用锚点串本身；
 *   工具两向自证（H6）：锚点不存在 / 出现两次时 must1 必抛。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const IB_REL = 'engines/intent-board.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';

const IB_SRC = fs.readFileSync(path.join(BASE, IB_REL), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8');
const SET_SRC = fs.readFileSync(path.join(BASE, SET_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG_REL), 'utf8');

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

// ── 负控制锚点（本文件内各只声明一次 —— 判据纯度 H5）──
const A_NOROW = "if (!c || c.ok !== true) return null;";
const A_FACT = "asFact: c.step.status === 'done'";
const A_NEED = "out.push('缺 ' + String(b.detail || ''));";
const A_OFF = "if (!cfg.enabled) return { ok: false, reason: 'disabled' };";

const STEPS = [{ kind: 'work', text: '去码头搬货' },
               { kind: 'work', text: '攒够路费', need: { resource: '银元', amount: 3 } }];

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
  // 不清空 global.WorldAxis：mock.js 只 require 一次，它挂的宿主面（WA.log / mainWin 等）
  //   删掉后不会重建；而各模块求值期都会 `WA.xxx = {...}` 无条件覆盖自身命名空间，
  //   所以破坏副本看到的就是它自己的 intentBoard（覆盖即生效，无需删仓）。
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

/** 造三个人：甲（有链）/ 丙（有链）/ 乙（零计划）——「有链的出行、没链的不进看板」由此可判。 */
function seedPlan(WA, opts) {
  opts = opts || {};
  try { WA.store.init(); } catch (e) {}
  try { WA.plan.setSettings({ enabled: true, maxSteps: 4 }); } catch (e) {}
  WA.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', resources: { '银元': 1 }, updatedAt: 1,
        life: { goals: [{ id: 'g1', text: '攒钱去乙地', status: 'active' }], commitments: [], schedule: [] } },
      'p_乙': { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1,
        life: { goals: [], commitments: [], schedule: [] } },
      'p_丙': { id: 'p_丙', name: '丙', resources: {}, updatedAt: 1,
        life: { goals: [{ id: 'g1', text: '当上掌柜', status: 'active' }], commitments: [], schedule: [] } }
    };
    d.plan = { plans: [] };
  }, 'lock:intent:seed');
  WA.plan.expand('甲', 'g1', STEPS);
  if (!opts.onlyFirst) WA.plan.expand('丙', 'g1', STEPS);
  return WA;
}

/** 走到第 1 步：资源不足 → 该行必受阻（卡点两类中的 need 类）。 */
function makeBlocked(WA) {
  WA.plan.advance('甲');
  WA.plan.settle('甲', 'done');
  WA.plan.advance('甲');
}

// ── 主线判据 ──

function runA(WA) {
  section('A 结构与导出面');
  assert(!!WA.intentBoard && typeof WA.intentBoard === 'object', 'A1: WA.intentBoard 在场');
  const api = ['getSettings', 'setSettings', 'board', 'buildBlock', 'view', 'stat', 'reset', '_blockedText'];
  const miss = api.filter(function (k) { return typeof (WA.intentBoard || {})[k] !== 'function'; });
  eq(miss.length, 0, 'A2: 导出面 8 口齐（缺 ' + JSON.stringify(miss) + '）');
  const cfg = WA.intentBoard.getSettings();
  eq(cfg.enabled, true, 'A3: 出厂开启（宁可关得掉，不可默认看不见）');
  eq(cfg.maxRows, 8, 'A4: 默认 maxRows = 8');
  eq(cfg.maxRest, 3, 'A5: 默认 maxRest = 3');
  WA.intentBoard.setSettings({ maxRows: 999 });
  assert(WA.intentBoard.getSettings().maxRows <= 24,
    'A6: bounds 生效（maxRows 上界 24，实 ' + WA.intentBoard.getSettings().maxRows + '）');
  WA.intentBoard.setSettings({ maxRows: 8 });

  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  assert(!!m && m[1].indexOf(IB_REL) >= 0, 'A7: tests/run.js 的 LOAD 清单含 ' + IB_REL);
  const idxSrc = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  assert(idxSrc.indexOf("'" + IB_REL + "'") >= 0, 'A8: index.js 的加载序含 ' + IB_REL);
  assert(PANEL_SRC.indexOf('wa-intent-block') > 0, 'A9: 面板渲染块在场（wa-intent-block）');
  assert(SET_SRC.indexOf('wa-ib-save') > 0 && SET_SRC.indexOf('wa-ib-maxrows') > 0,
    'A10: 设置面控件在场（wa-ib-save / wa-ib-maxrows）');
  assert(DIAG_SRC.indexOf("'" + IB_REL + "': 'intentBoard'") > 0, 'A11: 诊断 MODULE_EXPORTS 已登记 intentBoard');
  assert(DIAG_SRC.indexOf('function secIntentBoard()') > 0, 'A12: 诊断节 secIntentBoard 在场');
}

function runB(WA) {
  section('B 卡点纯函数（两类不合并）');
  const bt = WA.intentBoard._blockedText;
  const t1 = bt([{ kind: 'need', detail: '银元×3' }]);
  eq(t1.length, 1, 'B1: need 类只出一条');
  eq(t1[0], '缺 银元×3', 'B2: need 类译成人话逐字（实 ' + JSON.stringify(t1) + '）');
  const t2 = bt([{ kind: 'after', seq: 1, text: '攒够路费', waitingOn: 'running' }]);
  assert(t2.length === 1 && t2[0].indexOf('等前置第 1 步') === 0 && t2[0].indexOf('正在做') > 0,
    'B3: after 类带出等待方状态（实 ' + JSON.stringify(t2) + '）');
  const t3 = bt([{ kind: 'after', seq: 2, text: 'x', waitingOn: 'blocked' }]);
  assert(t3.length === 1 && t3[0].indexOf('那一步自己卡住了') > 0,
    'B4: after 类区分「那一步自己卡住了」（实 ' + JSON.stringify(t3) + '）');
  eq(bt([null, undefined, {}, 'x', 0]).length, 0, 'B5: 脏项不造文案（不编一句「受阻」）');
  eq(bt('not-array').length, 0, 'B6: 非数组入参不抛、返回空');
}

function runC(WA) {
  section('C 看板语义（不造空行 / 如实报缺席 / 开关）');
  seedPlan(WA);
  const b = WA.intentBoard.board();
  eq(b.ok, true, 'C1: 看板 ok');
  eq(b.rows.length, 2, 'C2: 有链的两人各一行（实 ' + JSON.stringify(b.rows.map(function (r) { return r.name; })) + '）');
  eq(b.skipped, 1, 'C3: 零计划的乙被跳过而不是补空行');
  eq(b.checked, 3, 'C4: 查过的人数如实报（3）');
  eq(b.rows[0].goalText, '攒钱去乙地', 'C5: 目标逐字取 chain.goalText');
  eq(b.rows[0].step.asFact, false, 'C6: 未结算步 asFact 严格 false（拟稿不冒充事实）');
  eq(b.rows[0].step.text, '去码头搬货', 'C7: 当前步逐字取 chain.step.text');

  // maxRows 截断 + capped 如实报
  WA.intentBoard.setSettings({ maxRows: 1 });
  const b2 = WA.intentBoard.board();
  eq(b2.rows.length, 1, 'C8: maxRows=1 时只出一行');
  eq(b2.capped, true, 'C9: 被压掉的人如实报 capped（不假装全在）');
  WA.intentBoard.setSettings({ maxRows: 8 });

  // 空世界：ok:true / rows:[] / empty:true —— 与「引擎缺席」分开
  WA.store.transact(function (d) {
    d.people = { 'p_乙': d.people['p_乙'] };
    d.plan = { plans: [] };
  }, 'lock:intent:empty');
  const b3 = WA.intentBoard.board();
  eq(b3.ok, true, 'C10: 有人在场但零链时 ok 仍为 true（世界没坏，只是没人有计划）');
  eq(b3.rows.length, 0, 'C11: 零链时零行');
  eq(b3.empty, true, 'C12: 零链时 empty 为 true（与「引擎缺席」分开）');
  eq(b3.reason, 'empty', 'C13: reason 报 empty');

  // plan 引擎缺席
  const keep = WA.plan;
  try { delete WA.plan; } catch (e) {}
  const b4 = WA.intentBoard.board();
  eq(b4.ok, false, 'C14: plan 缺席时 ok:false（不合成空看板）');
  eq(b4.reason, 'no-plan-engine', 'C15: plan 缺席报 no-plan-engine');
  assert(typeof b4.note === 'string' && b4.note.indexOf('不是') > 0,
    'C16: 缺席注记说清「不是没人有计划」（实 ' + JSON.stringify(b4.note) + '）');
  eq(b4.rows === undefined, true, 'C17: 缺席时不给 rows（空数组会被读成「查过了没人」）');
  WA.plan = keep;

  // 关着
  WA.intentBoard.setSettings({ enabled: false });
  const b5 = WA.intentBoard.board();
  eq(b5.ok, false, 'C18: 关着时 ok:false');
  eq(b5.reason, 'disabled', 'C19: 关着时报 disabled（不是 empty）');
  eq(WA.intentBoard.buildBlock(), '', 'C20: 关着时注入块是空串（零 token）');
  WA.intentBoard.setSettings({ enabled: true });
}

function runD(WA) {
  section('D 卡点进看板 + 注入块 + stat/只读');
  seedPlan(WA);
  makeBlocked(WA);
  const b = WA.intentBoard.board();
  const row = b.rows.filter(function (r) { return r.name === '甲'; })[0] || {};
  eq(row.isBlocked, true, 'D1: 资源不足的行标受阻');
  eq((row.blocked || []).length, 1, 'D2: 卡点只有一条（不把两类合并）');
  eq(row.blocked && row.blocked[0], '缺 银元×3', 'D3: 卡点逐字取 chain.blockedBy 并译成人话（实 ' + JSON.stringify(row.blocked) + '）');
  eq(row.step && row.step.seq, 1, 'D4: 当前步是第 1 步');
  eq(row.step && row.step.asFact, false, 'D5: 卡住的那步仍是拟稿（asFact:false）');

  // 注入块：只列受阻者
  const bb = WA.intentBoard.buildBlock();
  assert(typeof bb === 'string' && bb.indexOf('甲') >= 0 && bb.indexOf('缺 银元×3') > 0,
    'D6: 注入块带人名与卡点（实 ' + JSON.stringify(String(bb).slice(0, 70)) + '）');
  eq(bb.indexOf('丙') < 0, true, 'D7: 没卡点的人不进注入块（省 token）');

  // maxRest 压后续步但 restTotal 如实
  const restBefore = (row.rest || []).length;
  WA.intentBoard.setSettings({ maxRest: 0 });
  const row2 = WA.intentBoard.board().rows.filter(function (r) { return r.name === '甲'; })[0] || {};
  eq((row2.rest || []).length, 0, 'D8: maxRest=0 时不再列后续步');
  eq(row2.restTotal, row.restTotal, 'D9: 被压掉的步数仍如实报 restTotal（' + restBefore + ' -> ' + (row2.rest || []).length + '）');
  WA.intentBoard.setSettings({ maxRest: 3 });

  // stat
  WA.intentBoard.reset();
  WA.intentBoard.board();
  WA.intentBoard.board();
  const st = WA.intentBoard.stat();
  eq(st.boards, 2, 'D10: stat 记到看板次数');
  eq(st.planAvailable, true, 'D11: stat 分开报 plan 在场');
  eq(st.enabled, true, 'D12: stat 分开报开关');
  WA.intentBoard.reset();
  eq(WA.intentBoard.stat().boards, 0, 'D13: reset 清零计数');

  // 只读：看完板世界存档逐字未变
  const snap = function () {
    const s = WA.store.get();
    return JSON.stringify(s.people) + '|' + JSON.stringify(s.plan);
  };
  const before = snap();
  WA.intentBoard.board();
  WA.intentBoard.view();
  WA.intentBoard.stat();
  WA.intentBoard.buildBlock();
  eq(snap() === before, true, 'D14: 看板全程只读（世界存档逐字未变）');
}

function runE() {
  section('E 面板与设置面（真 DOM、真点通）');
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA2 = env.WA, dom = env.dom;
  seedPlan(WA2);
  const panel = dom.getElementById('wa-panel');
  assert(!!panel, 'E1: 面板在场');
  if (WA2.ui && typeof WA2.ui.open === 'function') WA2.ui.open();
  if (WA2.ui && typeof WA2.ui.goPage === 'function') WA2.ui.goPage('overview');
  const readBody = function () {
    const p = dom.getElementById('wa-panel');
    const bd = p && p.querySelector ? p.querySelector('.wa-body') : null;
    return String((bd && bd.innerHTML) || '');
  };
  const html = readBody();
  assert(html.indexOf('id="wa-intent-block"') >= 0, 'E2: 概览页渲染出看板块');
  assert(html.indexOf('人物意图看板读数不可用') < 0, 'E3: 不是「引擎缺席」降级态');
  assert(html.indexOf('甲') >= 0 && html.indexOf('攒钱去乙地') >= 0, 'E4: 看板里有真人与真目标');
  assert(html.indexOf('打算') >= 0, 'E5: 未结算步标「打算」（不冒充已发生）');
  const el = dom.getElementById('wa-intent-block');
  assert(!!el, 'E6: 看板块在 DOM 树内（不是游离字符串）');
  assert(!!el && String(el.className || '').indexOf('wa-intent') >= 0, 'E7: 类名是契约（wa-intent）');

  makeBlocked(WA2);
  if (WA2.ui && typeof WA2.ui.goPage === 'function') { WA2.ui.goPage('world'); WA2.ui.goPage('overview'); }
  const el2 = dom.getElementById('wa-intent-block');
  const txt2 = el2 ? String(el2.textContent || '') : '';
  assert(txt2.indexOf('卡在') >= 0 && txt2.indexOf('缺 银元×3') >= 0,
    'E8: 卡点单独成行进面板（实 ' + JSON.stringify(txt2.slice(0, 90)) + '）');

  WA2.intentBoard.setSettings({ enabled: false });
  if (WA2.ui && typeof WA2.ui.goPage === 'function') { WA2.ui.goPage('world'); WA2.ui.goPage('overview'); }
  assert(readBody().indexOf('id="wa-intent-block"') < 0, 'E9: 关着时整块不渲染（不占屏）');

  if (WA2.ui && typeof WA2.ui.goPage === 'function') WA2.ui.goPage('settings');
  const html4 = readBody();
  const IDS = ['wa-ib-enable', 'wa-ib-maxrows', 'wa-ib-maxrowsv', 'wa-ib-maxrest', 'wa-ib-maxrestv', 'wa-ib-save', 'wa-ib-out'];
  const miss4 = IDS.filter(function (id) { return html4.indexOf('id="' + id + '"') < 0; });
  eq(miss4.length, 0, 'E10: 设置页七枚控件全渲染（缺 ' + JSON.stringify(miss4) + '）');
  const domMiss = IDS.filter(function (id) { return !dom.getElementById(id); });
  eq(domMiss.length, 0, 'E11: 七枚都在 DOM 树内、可点到（缺 ' + JSON.stringify(domMiss) + '）');

  const en = dom.getElementById('wa-ib-enable');
  if (en) en.checked = true;
  const mr = dom.getElementById('wa-ib-maxrows');
  if (mr) { mr.value = '5'; if (mr.oninput) mr.oninput(); }
  const mrv = dom.getElementById('wa-ib-maxrowsv');
  eq(mrv && String(mrv.textContent || '').trim(), '5', 'E12: 滑块拖动读数即时跟随（实 ' + JSON.stringify(mrv && mrv.textContent) + '）');
  const sv = dom.getElementById('wa-ib-save');
  assert(!!sv && typeof sv.click === 'function', 'E13: 保存按钮可点击');
  if (sv) sv.click();
  const now = WA2.intentBoard.getSettings();
  eq(now.maxRows, 5, 'E14: 点保存后引擎设置真变（maxRows 实 ' + now.maxRows + '）');
  eq(now.enabled, true, 'E15: 点保存后 enabled 真变（实 ' + now.enabled + '）');
  const outEl = dom.getElementById('wa-ib-out');
  assert(!!outEl && String(outEl.textContent || '').indexOf('5') >= 0,
    'E16: 结果出口回显真实生效值（实 ' + JSON.stringify(outEl && outEl.textContent) + '）');
}

// ── 负控制：真源码破坏 + 两向自证 ──

function judgeRows(WA) {           // ① 无链的人不许进看板
  const b = WA.intentBoard.board();
  return b.ok === true && b.rows.length === 2 && b.skipped === 1;
}
function judgeFact(WA) {           // ② 拟稿不许冒充事实
  const b = WA.intentBoard.board();
  const r = b.rows.filter(function (x) { return x.name === '甲'; })[0];
  return !!(r && r.step && r.step.asFact === false);
}
function judgeBlock(WA) {          // ③ 卡点必须逐字取自 chain
  const b = WA.intentBoard.board();
  const r = b.rows.filter(function (x) { return x.name === '甲'; })[0];
  return !!(r && r.blocked && r.blocked[0] === '缺 银元×3');
}
function judgeOff(WA) {            // ④ 关着就得说关着
  WA.intentBoard.setSettings({ enabled: false });
  const b = WA.intentBoard.board();
  WA.intentBoard.setSettings({ enabled: true });
  return b.ok === false && b.reason === 'disabled';
}

function runNegative() {
  section('N 负控制：真源码破坏 + 两向自证');

  // N0 锚点唯一性（破坏必须恰中 1 次，否则「破坏」本身是假的）
  let anchorOk = true, anchorErr = '';
  try {
    must1(IB_SRC, A_NOROW, 'A_NOROW');
    must1(IB_SRC, A_FACT, 'A_FACT');
    must1(IB_SRC, A_NEED, 'A_NEED');
    must1(IB_SRC, A_OFF, 'A_OFF');
  } catch (e) { anchorOk = false; anchorErr = String(e && e.message || e); }
  assert(anchorOk, 'N0: 四条破坏锚点在真源码中各恰中 1 次（' + anchorErr + '）');

  // N0b 工具两向自证（H6）：锚点不存在必抛；锚点出现两次必抛
  let t1 = false, t2 = false;
  try { must1(IB_SRC, 'ANCHOR_THAT_NEVER_EXISTS_' + IB_SRC.length, 'self'); } catch (e) { t1 = true; }
  try { must1(A_NOROW + IB_SRC + A_NOROW, A_NOROW, 'self'); } catch (e) { t2 = true; }
  assert(t1, 'N0b: 锚点不存在时 must1 必抛（工具不空转）');
  assert(t2, 'N0c: 锚点出现两次时 must1 必抛（破坏不许打成多份）');

  // 两向自证之一：原版上四条判据必须为真（否则后面的「破坏后为假」毫无信息量）
  const O = loadAll();
  seedPlan(O);
  assert(judgeRows(O) === true, 'N1a: 原版上「无链不进看板」判据为真（判据非空转）');
  assert(judgeFact(O) === true, 'N2a: 原版上「拟稿不冒充事实」判据为真');
  makeBlocked(O);
  assert(judgeBlock(O) === true, 'N3a: 原版上「卡点逐字取 chain」判据为真');
  assert(judgeOff(O) === true, 'N4a: 原版上「关着说关着」判据为真');

  // 两向自证之二：真源码破坏后，同一判据必须为假
  const broke = function (from, to) {
    const s = IB_SRC.split(from).join(to);
    if (s === IB_SRC) throw new Error('破坏未生效（锚点没打中）');
    return s;
  };

  // N1: 给 no-plan / unknown-goal 的人也造一行
  let n1 = null;
  try {
    const W1 = loadAll({ [IB_REL]: broke(A_NOROW,
      "if (!c) return null;\n    if (c.ok !== true) return { name: name, goalId: '', goalText: '', goalStatus: '', status: 'no-plan', reason: '', tries: 0, total: 0, done: 0, step: null, blocked: [], isBlocked: false, rest: [], restTotal: 0, drift: false };") });
    seedPlan(W1);
    n1 = judgeRows(W1);
  } catch (e) { n1 = false; }
  assert(n1 === false, 'N1b: 破坏「无链不进看板」后判据必假（实 ' + JSON.stringify(n1) + '）');

  // N2: 拟稿一律标成事实
  let n2 = null;
  try {
    const W2 = loadAll({ [IB_REL]: broke(A_FACT, 'asFact: true') });
    seedPlan(W2);
    n2 = judgeFact(W2);
  } catch (e) { n2 = false; }
  assert(n2 === false, 'N2b: 破坏「拟稿不冒充事实」后判据必假（实 ' + JSON.stringify(n2) + '）');

  // N3: 卡点自己编一句
  let n3 = null;
  try {
    const W3 = loadAll({ [IB_REL]: broke(A_NEED, "out.push('受阻');") });
    seedPlan(W3);
    makeBlocked(W3);
    n3 = judgeBlock(W3);
  } catch (e) { n3 = false; }
  assert(n3 === false, 'N3b: 破坏「卡点逐字取 chain」后判据必假（实 ' + JSON.stringify(n3) + '）');

  // N4: 删掉 disabled 前置判定
  let n4 = null;
  try {
    const W4 = loadAll({ [IB_REL]: broke(A_OFF, "if (false) return { ok: false, reason: 'disabled' };") });
    seedPlan(W4);
    n4 = judgeOff(W4);
  } catch (e) { n4 = false; }
  assert(n4 === false, 'N4b: 破坏「关着说关着」后判据必假（实 ' + JSON.stringify(n4) + '）');

  // N5: 纯度 —— 全部负控制跑完后源文件逐字未变
  const nowSrc = fs.readFileSync(path.join(BASE, IB_REL), 'utf8');
  eq(nowSrc === IB_SRC, true, 'N5: 全部负控制跑完后 ' + IB_REL + ' 逐字未变（破坏只在内存副本上）');
}

function main() {
  console.log('=== WorldAxis tests/v7-intent-board-2286.js ===');
  pass = 0; fail = 0; fails.length = 0;
  const WA = loadAll();
  runA(WA);
  runB(WA);
  runC(WA);
  runD(WA);
  runE();
  runNegative();

  console.log('\n专锁汇总: ' + pass + ' pass / ' + fail + ' fail');
  if (fail) {
    console.error('\n失败项:');
    fails.forEach(function (f) { console.error('  - ' + f); });
    if (require.main === module) process.exit(1);
    throw new Error('Lock failed with ' + fail + ' failures');
  }
}

if (require.main === module) {
  main();
}

module.exports = { runAll: main, main: main };
