#!/usr/bin/env node
// V11 EXV11-2 世界真空诊断看板专锁。
//
// 【它治什么】
//   看板把 snapshotState() 的五态合成一屏，每态配「下一步该干什么」。真正的风险不是
//   「渲染不出」，而是**五个态塌成一句**：例如 no-session 与 no-facts 都写成
//   「世界是空的」，玩家就分不出「去开局」还是「去录事实」。本锁逐态钉住文案差异。
//
// 【判据】
//   V1 面板真空诊断块真读 render.snapshotState（同源，不自己推状态）。
//   V2 五态各有独立「下一步」文案，且两两不相等（塌成一句即判红）。
//   V3 未知态有兜底文案（不静默留白）。
//   V4 faults 非空时印出坏段名（故障不许被读成真空）。
//   V5 逐台归因走 healthPreflight.yieldAttrib（同源读数，不重算）。
//   V6 纯只读：渲染前后 store 深比较相等。
// 负面：N1 把 no-facts 文案改成与 no-session 相同 ⇒ V2 判红；
//       N2 抹掉 faults 输出 ⇒ V4 判红。
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const PANEL = path.join(__dirname, '../ui/panel.js');
// 从 ui/panel.js 抽出真空诊断块的真实源码并跑它，而不是复刻一份逻辑
function blockSource(src) {
  const s = src.indexOf('    const vacuum = (function () {');
  const e = src.indexOf('    return `', s);
  if (s < 0 || e < s) throw Error('真空诊断块边界找不到');
  return src.slice(s, e).replace('const vacuum =', 'return');
}
function render(src, WA) {
  const fn = new Function('WA', 'esc', blockSource(src) + ';');
  const esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  return fn(WA, esc);
}
function stub(state, faults) {
  return {
    render: { snapshotState: function () { return { state: state, faults: faults || [] }; } },
    healthPreflight: { yieldAttrib: function () { return { ok: true, rows: [{ key: 'demoEngine', why: 'buildBlock 返回空串' }] }; } }
  };
}
const STATES = ['no-session', 'no-facts', 'fault', 'off', 'live'];
function runAll(a) {
  const src = fs.readFileSync(PANEL, 'utf8');
  a(src.indexOf('WA.render.snapshotState') >= 0, 'v11vac: [V1] 看板真读 render.snapshotState（状态单一真源）');
  const out = {};
  STATES.forEach(function (st) { out[st] = render(src, stub(st)); });
  // V2 五态文案两两不同
  const nexts = {};
  STATES.forEach(function (st) {
    const m = out[st].match(/下一步：([^<]*)</);
    nexts[st] = m ? m[1] : null;
  });
  const missing = STATES.filter(function (st) { return !nexts[st]; });
  a(missing.length === 0, 'v11vac: [V2] 五态各有「下一步」文案（缺：' + (missing.join(',') || '无') + '）');
  const dup = [];
  STATES.forEach(function (x, i) {
    STATES.slice(i + 1).forEach(function (y) { if (nexts[x] === nexts[y]) dup.push(x + '==' + y); });
  });
  a(missing.length === 0 && dup.length === 0,
    'v11vac: [V2] 五态文案两两不同（重复：' + (dup.join(',') || '无') + '）—— 塌成一句就分不出该去哪');
  // V3 未知态兜底
  const unk = render(src, stub('weird-state'));
  a(unk.indexOf('未知态') >= 0, 'v11vac: [V3] 未知态有兜底文案（不静默留白）');
  // V4 faults 印出
  const f = render(src, stub('fault', ['clock', 'people']));
  a(f.indexOf('clock') >= 0 && f.indexOf('people') >= 0 && f.indexOf('取数失败段') >= 0,
    'v11vac: [V4] faults 段名印出（故障不被读成真空）');
  // V5 逐台归因同源
  a(src.indexOf('WA.healthPreflight.yieldAttrib') >= 0, 'v11vac: [V5] 逐台归因走 healthPreflight.yieldAttrib（同源不重算）');
  const withRows = out['no-facts'];
  a(withRows.indexOf('demoEngine') >= 0, 'v11vac: [V5] 归因行真的渲染出引擎名');
  // V6 纯只读
  const W = gate.fresh().WA;
  const before = JSON.stringify(W.store.get());
  render(src, W);
  a(before === JSON.stringify(W.store.get()), 'v11vac: [V6] 纯只读（渲染前后 store 深比较相等）');
}
function runNegative(a) {
  const src = fs.readFileSync(PANEL, 'utf8');
  // N1 把 no-facts 文案改成与 no-session 相同 ⇒ V2 必须判红
  const broken = src.replace("'no-facts': '开了但没事实：写口台（🎛）录目标/日程/羁绊/名册，或注入页看六源开关'",
    "'no-facts': '没开局：去开局页（🌱）一键立骨架，或写口台手动喂第一批事实'");
  a(broken !== src, 'v11vac: [N1] 破坏副本已生成（文案塌陷可注入）');
  let red = false;
  try {
    const n1 = render(broken, stub('no-facts')).match(/下一步：([^<]*)</)[1];
    const n2 = render(broken, stub('no-session')).match(/下一步：([^<]*)</)[1];
    red = n1 === n2;
  } catch (e) { red = true; }
  a(red, 'v11vac: [N1] 两态文案塌成一句时判据现形（V2 非恒真）');
  // N2 抹掉 faults 输出 ⇒ V4 必须判红
  const broken2 = src.split("if (R.faults && R.faults.length) h += '<div class=\"wa-log-warn\">取数失败段：' + esc(R.faults.join('、')) + '</div>';").join('');
  a(broken2 !== src, 'v11vac: [N2] 破坏副本已生成（faults 输出可摘除）');
  let red2 = false;
  try { red2 = render(broken2, stub('fault', ['clock'])).indexOf('clock') < 0; } catch (e) { red2 = true; }
  a(red2, 'v11vac: [N2] 摘掉 faults 输出 ⇒ 段名消失（V4 非恒真）');
}
module.exports = { runAll, runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
  runAll(a); runNegative(a);
  console.log('v11-vacuum-board: ' + pass + ' pass / ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}