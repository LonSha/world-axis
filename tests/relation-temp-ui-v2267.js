#!/usr/bin/env node
/**
 * v2.267.0（V6 · EXV6-3）接线锁：**关系温度计在产品侧真的被玩家看到了吗**
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/relation-temp.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
const SELF_REL = 'tests/relation-temp-ui-v2267.js';

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const N_ANCHOR = {
  blockDef: 'const tempBlock = (function () {',
  blockUse: '${tempBlock}',
  saveCall: 'const r = WA.relationTemp.setSettings(next);',
  diagSources: 'bonds: !!(WA.bonds && typeof WA.bonds.read === \'function\'),',
  diagWarmer: 'warmer: st.warmerCount || 0,'
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
    a(r.html.indexOf('id="wa-temp-block"') >= 0, 'v2267ui/A1: 概览页包含 #wa-temp-block');
    a(r.html.indexOf('wa-temp-quiet') >= 0, 'v2267ui/A2: 空态带有 wa-temp-quiet class');
    a(r.html.indexOf('关系温度读数不可用') < 0, 'v2267ui/A2b: 不是引擎缺席态');
  }

  {
    const env = freshEnv();
    const WA = env.WA;
    WA.bonds.setSettings({ enabled: true });
    WA.fondness.setSettings({ enabled: true });
    WA.bonds.setBond('玩家', '沈砚', ['利益同盟']);
    WA.fondness.apply('沈砚', { delta: 0.5, trust: 60, reason: '雨夜并肩断后' });

    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('wa-temp-live') >= 0, 'v2267ui/A3: 变动后带有 wa-temp-live class');
    a(r.html.indexOf('沈砚') >= 0, 'v2267ui/A4: 渲染出沈砚名字');
    a(r.html.indexOf('雨夜并肩断后') >= 0, 'v2267ui/A5: 渲染出变动原因');
  }

  {
    const env = freshEnv();
    const WA = env.WA;
    WA.bonds.setSettings({ enabled: true });
    WA.fondness.setSettings({ enabled: true });
    WA.fondness.apply('沈砚', { delta: 0.5, trust: 60, reason: '雨夜断后' });
    WA.fondness.apply('阿青', { delta: 0.3, trust: 40, reason: '赠药' });
    WA.fondness.apply('顾临', { delta: 0.1, trust: 30, reason: '借伞' });
    WA.relationTemp.setSettings({ maxPeople: 1 });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('另有 2 人没展开') >= 0, 'v2267ui/A6: 截断提示正确');
  }

  {
    const env = freshEnv();
    const WA = env.WA;
    WA.relationTemp.setSettings({ enabled: false });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('关系温度计已关闭') >= 0, 'v2267ui/A7: 关闭态提示正确');
  }

  // ── B 设置页控件与绑定 ────────────────────────────────────────────────
  {
    const env = freshEnv();
    const r = pageHtml(env, 'settings');
    a(r.html.indexOf('id="wa-rt-enable"') >= 0, 'v2267ui/B1: 设置页渲染 wa-rt-enable');
    a(r.html.indexOf('id="wa-rt-maxp"') >= 0, 'v2267ui/B2: 设置页渲染 wa-rt-maxp');
    a(r.html.indexOf('id="wa-rt-maxpv"') >= 0, 'v2267ui/B3: 设置页渲染 wa-rt-maxpv');
    a(r.html.indexOf('id="wa-rt-types"') >= 0, 'v2267ui/B4: 设置页渲染 wa-rt-types');
    a(r.html.indexOf('id="wa-rt-reason"') >= 0, 'v2267ui/B5: 设置页渲染 wa-rt-reason');
    a(r.html.indexOf('id="wa-rt-save"') >= 0, 'v2267ui/B6: 设置页渲染 wa-rt-save');
    a(r.html.indexOf('id="wa-rt-out"') >= 0, 'v2267ui/B7: 设置页渲染 wa-rt-out');

    // 点击保存链路
    const dom = env.dom;
    const btn = dom.getElementById('wa-rt-save');
    const mp = dom.getElementById('wa-rt-maxp');
    if (mp) mp.value = '8';
    if (btn && btn.onclick) btn.onclick();
    const now = env.WA.relationTemp.getSettings();
    a(now.maxPeople === 8, 'v2267ui/B8: 点击保存真正写进引擎（maxPeople=8）');
  }

  // ── C 诊断节读数 ──────────────────────────────────────────────────────
  {
    const env = freshEnv();
    const rep = env.WA.toolDiag.collect();
    a(!!rep.relationTemp, 'v2267ui/C1: toolDiag 包含 relationTemp');
    a(rep.relationTemp.enabled === true, 'v2267ui/C2: relationTemp enabled 为 true');
    a(rep.relationTemp.sources.bonds === true, 'v2267ui/C3: relationTemp 依赖 bonds 源');
    a(rep.relationTemp.sources.fondness === true, 'v2267ui/C4: relationTemp 依赖 fondness 源');
  }

  // ── D 登记面 ──────────────────────────────────────────────────────────
  const idxRt = I.indexOf("'engines/relation-temp.js'");
  const idxDr = I.indexOf("'engines/day-route.js'");
  const idxCt = I.indexOf("'engines/capability-tier.js'");
  a(idxRt > idxDr && idxRt < idxCt, 'v2267ui/D1: index.js LOAD_ORDER 中 relation-temp 在 day-route 之后、tier 之前');

  const runRt = R.indexOf("'engines/relation-temp.js'");
  const runDr = R.indexOf("'engines/day-route.js'");
  const runCt = R.indexOf("'engines/capability-tier.js'");
  a(runRt > runDr && runRt < runCt, 'v2267ui/D2: run.js LOAD 中 relation-temp 在 day-route 之后、tier 之前');

  a(D.indexOf("'wa-rt-enable'") >= 0, 'v2267ui/D3: UI_BINDINGS 登记 wa-rt-enable');
  a(D.indexOf("'wa-rt-save'") >= 0, 'v2267ui/D4: UI_BINDINGS 登记 wa-rt-save');

  // ── N 负控制锚点核验 ──────────────────────────────────────────────────
  a(cnt(P, N_ANCHOR.blockDef) === 1, 'v2267ui/N1: blockDef 恰 1 次');
  a(cnt(P, N_ANCHOR.blockUse) === 1, 'v2267ui/N2: blockUse 恰 1 次');
  a(cnt(S, N_ANCHOR.saveCall) === 1, 'v2267ui/N3: saveCall 恰 1 次');
  a(cnt(D, N_ANCHOR.diagSources) === 1, 'v2267ui/N4: diagSources 恰 1 次');
  a(cnt(D, N_ANCHOR.diagWarmer) === 1, 'v2267ui/N5: diagWarmer 恰 1 次');

  return { pass: pass, fail: fail, fails: fails };
}

const r = runAll();
console.log('══ EXV6-3 接线锁（relation-temp-ui-v2267）══');
console.log('通过 ' + r.pass + ' / 失败 ' + r.fail);
if (r.fail) { r.fails.forEach(function (f) { console.log('  ✗ ' + f); }); }

module.exports = { runAll: runAll };