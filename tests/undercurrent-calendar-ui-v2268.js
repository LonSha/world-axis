#!/usr/bin/env node
/**
 * v2.268.0（V6 · EXV6-4）接线锁：**暗流日历在产品侧真的被玩家看到了吗**
 *
 * 同 v2.267.0 关系温度计接线锁的规格：概览页渲染成型 / 设置页控件与绑定 /
 * 诊断节读数 / 登记面（index.js LOAD_ORDER 与 run.js LOAD 同序 + UI_BINDINGS）/ 负控制锚点。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/undercurrent-calendar.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
const SELF_REL = 'tests/undercurrent-calendar-ui-v2268.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const N_ANCHOR = {
  blockDef: 'const calBlock = (function () {',
  blockUse: '${calBlock}',
  saveCall: 'const r = WA.undercurrentCalendar.setSettings(next);',
  diagBuilds: 'itemsProjected: st.itemsProjected || 0,',
  diagShielded: 'hiddenShielded: st.hiddenShielded || 0,'
};
function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  function pageHtml(env, page) {
    const WA = env.WA, dom = env.dom;
    const panel = dom.getElementById('wa-panel');
    if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open();
    if (WA.ui && typeof WA.ui.goPage === 'function') WA.ui.goPage(page);
    const body = panel.querySelector('.wa-body');
    return { html: String((body && body.innerHTML) || ''), body: body, panel: panel };
  }
  function freshEnv(ov) {
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    const env = gate.fresh(ov ? { srcOverride: ov } : {});
    const WA = env.WA;
    WA.store.init();
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    return env;
  }
  const P = rd(PANEL_REL);
  const S = rd(SET_REL);
  const D = rd(DIAG_REL);
  const I = rd(IDX_REL);
  const R = rd(RUN_REL);
  // ── A 概览页渲染成型 ──────────────────────────────────────────────────
  {
    const env = freshEnv();
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-cal-block"') >= 0, 'v2268ui/A1: 概览页包含 #wa-cal-block');
    a(r.html.indexOf('wa-cal-quiet') >= 0, 'v2268ui/A2: 空态带有 wa-cal-quiet class');
    a(r.html.indexOf('暗流日历读数不可用') < 0, 'v2268ui/A2b: 不是引擎缺席态');
  }
  {
    const env = freshEnv();
    const WA = env.WA;
    const s = WA.store.get();
    s.clock = { label: '第2日·清晨', dayIndex: 1, source: 'test' };
    s.currents = [
      { id: 'cu_a', title: '漕运亏空', summary: '账目对不上', stage: '激化', visibility: 'public', createdAt: 1 },
      { id: 'cu_b', title: '山道劫案', summary: '商队被劫', stage: '高潮', visibility: 'public', createdAt: 2 }
    ];
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('wa-cal-live') >= 0, 'v2268ui/A3: 有暗流时带有 wa-cal-live class');
    a(r.html.indexOf('山道劫案') >= 0, 'v2268ui/A4: 渲染出暗流标题');
    a(r.html.indexOf('临界爆发') >= 0, 'v2268ui/A5: 渲染出紧迫度等级名');
    a(r.html.indexOf('今日·临界爆发') >= 0, 'v2268ui/A6: 渲染出日期与紧迫度组合');
  }
  {
    const env = freshEnv();
    const WA = env.WA;
    const s = WA.store.get();
    s.clock = { label: '第2日·清晨', dayIndex: 1, source: 'test' };
    s.currents = [
      { id: 'cu_x', title: '密探入城', summary: '不明人物', stage: '发展', visibility: 'hidden', public_trace: '城门口多了几个生面孔', createdAt: 3 }
    ];
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('[异动]') >= 0, 'v2268ui/A7: 隐秘暗流以「异动」脱敏展示');
    a(r.html.indexOf('密探入城') < 0, 'v2268ui/A8: 隐秘暗流真名未泄露');
    a(r.html.indexOf('隐秘异动保护') >= 0, 'v2268ui/A9: 渲染出隐秘保护提示');
  }
  {
    const env = freshEnv();
    const WA = env.WA;
    WA.undercurrentCalendar.setSettings({ enabled: false });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('暗流日历已关闭') >= 0, 'v2268ui/A10: 关闭态提示正确');
  }
  // ── B 设置页控件与绑定 ────────────────────────────────────────────────
  {
    const env = freshEnv();
    const r = pageHtml(env, 'settings');
    ['wa-uc-enable', 'wa-uc-hz', 'wa-uc-hzv', 'wa-uc-max', 'wa-uc-maxv', 'wa-uc-hidden', 'wa-uc-save', 'wa-uc-out']
      .forEach(function (id, i) {
        a(r.html.indexOf('id="' + id + '"') >= 0, 'v2268ui/B' + (i + 1) + ': 设置页渲染 ' + id);
      });
    // 点击保存链路
    const dom = env.dom;
    const btn = dom.getElementById('wa-uc-save');
    const hz = dom.getElementById('wa-uc-hz');
    const mx = dom.getElementById('wa-uc-max');
    if (hz) hz.value = '5';
    if (mx) mx.value = '9';
    if (btn && btn.onclick) btn.onclick();
    const now = env.WA.undercurrentCalendar.getSettings();
    a(now.horizonDays === 5, 'v2268ui/B9: 点击保存真正写进引擎（horizonDays=5）');
    a(now.maxItems === 9, 'v2268ui/B10: 点击保存真正写进引擎（maxItems=9）');
  }
  // ── C 诊断节读数 ──────────────────────────────────────────────────────
  {
    const env = freshEnv();
    const rep = env.WA.toolDiag.collect();
    a(!!rep.undercurrentCalendar, 'v2268ui/C1: toolDiag 包含 undercurrentCalendar');
    a(rep.undercurrentCalendar.enabled === true, 'v2268ui/C2: undercurrentCalendar enabled 为 true');
    a(rep.undercurrentCalendar.horizonDays === 3, 'v2268ui/C3: 默认视界为 3 天');
    a(rep.undercurrentCalendar.showHidden === false, 'v2268ui/C4: 默认不透视隐秘暗流');
  }
  // ── D 登记面 ──────────────────────────────────────────────────────────
  const idxUc = I.indexOf("'engines/undercurrent-calendar.js'");
  const idxRt = I.indexOf("'engines/relation-temp.js'");
  const idxCt = I.indexOf("'engines/capability-tier.js'");
  a(idxUc > idxRt && idxUc < idxCt, 'v2268ui/D1: index.js LOAD_ORDER 中 undercurrent-calendar 在 relation-temp 之后、tier 之前');
  const runUc = R.indexOf("'engines/undercurrent-calendar.js'");
  const runRt = R.indexOf("'engines/relation-temp.js'");
  const runCt = R.indexOf("'engines/capability-tier.js'");
  a(runUc > runRt && runUc < runCt, 'v2268ui/D2: run.js LOAD 中 undercurrent-calendar 在 relation-temp 之后、tier 之前');
  a(D.indexOf("'wa-uc-enable'") >= 0, 'v2268ui/D3: UI_BINDINGS 登记 wa-uc-enable');
  a(D.indexOf("'wa-uc-save'") >= 0, 'v2268ui/D4: UI_BINDINGS 登记 wa-uc-save');
  a(D.indexOf("'wa-uc-hidden'") >= 0, 'v2268ui/D5: UI_BINDINGS 登记 wa-uc-hidden');
  // ── N 负控制锚点核验 ──────────────────────────────────────────────────
  a(cnt(P, N_ANCHOR.blockDef) === 1, 'v2268ui/N1: blockDef 恰 1 次');
  a(cnt(P, N_ANCHOR.blockUse) === 1, 'v2268ui/N2: blockUse 恰 1 次');
  a(cnt(S, N_ANCHOR.saveCall) === 1, 'v2268ui/N3: saveCall 恰 1 次');
  a(cnt(D, N_ANCHOR.diagBuilds) === 1, 'v2268ui/N4: diagBuilds 恰 1 次');
  a(cnt(D, N_ANCHOR.diagShielded) === 1, 'v2268ui/N5: diagShielded 恰 1 次');
  return { pass: pass, fail: fail, fails: fails };
}
if (require.main === module) {
  const r = runAll();
  console.log('══ EXV6-4 接线锁（undercurrent-calendar-ui-v2268）══');
  console.log('通过 ' + r.pass + ' / 失败 ' + r.fail);
  if (r.fail) { r.fails.forEach(function (f) { console.log('  ✗ ' + f); }); process.exit(1); }
}
module.exports = { runAll: runAll };