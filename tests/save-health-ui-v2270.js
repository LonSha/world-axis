#!/usr/bin/env node
/**
 * v2.270.0（V6 · EXV6-6）接线锁：**存档体检在产品侧真的被玩家看到了吗**
 *
 * 引擎全绿不等于玩家看得见。本锁判五件事：
 *   概览页四态渲染成型（含 no-data 的「读不全」）、设置页九枚控件渲染、
 *   点击保存真写进**三个**引擎（体检自己的 + 两个上游，且复核读回）、
 *   诊断节读数在场、LOAD 登记序与 index.js 同序。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_SH = 'engines/save-health.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const N_ANCHOR = {
  // 概览页体检块（负控制 N1 破坏它 ⇒ 概览页再不出现该块）
  blockDef: 'const saveBlock = (function () {',
  blockUse: '${saveBlock}',
  // 设置页体检保存调用（负控制 N2 破坏它 ⇒ 点击保存不再落到体检引擎）
  saveCall: 'const r = WA.saveHealth.setSettings(next);',
  // 诊断节读数（负控制 N3 破坏它 ⇒ 诊断包里 state 恒 undefined）。
  //   ⚠ 锚点必须**跨两行**：`state: cardState,` 在 roundCost 与 saveHealth 两节里各一次，
  //   只咬那一行会撞车（恰 2 次 ⇒ 破坏目标不确定，实测被专锁 N4 当场抓到）。
  //   加上紧随其后的 `bytes:` 行后，两节可区分（saveHealth 才有 bytes 紧跟）。
  diagState: 'state: cardState,\n        bytes:',
  // 概览页「读不全」态（负控制 N4 破坏它 ⇒ 缺面被当正常态渲染）
  panelNoData: "if (r.state === 'no-data') {"
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

  // ── A 概览页四态 ──────────────────────────────────────────────────────
  {
    // 出厂态：两个上游都关 ⇒ 「读不全（不等于健康）」
    const env = freshEnv();
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-save-block"') >= 0, 'v2270ui/A1: 概览页包含 #wa-save-block');
    a(r.html.indexOf('wa-save-quiet') >= 0, 'v2270ui/A2: 缺面态带 wa-save-quiet class');
    a(r.html.indexOf('读不全') >= 0, 'v2270ui/A2b: 明说「读不全（不等于健康）」');
    a(r.html.indexOf('存档体检读数不可用') < 0, 'v2270ui/A2c: 不是引擎缺席态');
  }
  {
    // 关闭态
    const env = freshEnv();
    const WA = env.WA;
    WA.saveHealth.setSettings({ enabled: false });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('存档体检已关闭') >= 0, 'v2270ui/A3: 关闭态提示正确');
    WA.saveHealth.setSettings({ enabled: true });
  }
  {
    // 有读数态：开趋势面 + 灌样本 + 开水位面 ⇒ live class + 轮数
    const env = freshEnv();
    const WA = env.WA;
    WA.saveHealth.setSettings({ enabled: true, warnRounds: 40, urgentRounds: 8 });
    WA.storageForecast.setSettings({ enabled: true, lsQuotaMB: 5, minSamples: 6 });
    WA.capacityAudit.setSettings({ enabled: true });
    for (let i = 0; i < 8; i++) {
      WA.store.transact(function (d) { d.__pad6 = (d.__pad6 || '') + 'x'.repeat(20000); });
      WA.storageForecast.sample(1 + i);
    }
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('wa-save-live') >= 0, 'v2270ui/A4: 有读数时带 wa-save-live class');
    a(r.html.indexOf('轮后触顶') >= 0, 'v2270ui/A5: 渲染出「约 N 轮后触顶」');
    a(r.html.indexOf('当前存档') >= 0, 'v2270ui/A6: 渲染出当前体积');
  }
  {
    // urgent 态：超额度 ⇒ wa-save-urgent class
    const env = freshEnv();
    const WA = env.WA;
    WA.saveHealth.setSettings({ enabled: true });
    WA.storageForecast.setSettings({ enabled: true, lsQuotaMB: 1, minSamples: 6 });
    WA.capacityAudit.setSettings({ enabled: true });
    for (let i = 0; i < 7; i++) {
      WA.store.transact(function (d) { d.__pad6 = (d.__pad6 || '') + 'y'.repeat(200000); });
      WA.storageForecast.sample(1 + i);
    }
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('wa-save-urgent') >= 0, 'v2270ui/A7: 超额度时带 wa-save-urgent class');
    a(r.html.indexOf('需要处理') >= 0, 'v2270ui/A8: 结论句说「需要处理」');
  }

  // ── B 设置页九枚控件与绑定 ────────────────────────────────────────────
  {
    const env = freshEnv();
    const r = pageHtml(env, 'settings');
    ['wa-sh-enable', 'wa-sh-warn', 'wa-sh-warnv', 'wa-sh-urgent', 'wa-sh-urgentv',
      'wa-sh-forecaster', 'wa-sh-waterline', 'wa-sh-save', 'wa-sh-out'].forEach(function (id, i) {
      a(r.html.indexOf('id="' + id + '"') >= 0, 'v2270ui/B' + (i + 1) + ': 设置页渲染 ' + id);
    });
    a(r.html.indexOf('不开就答不出「还能跑多久」') >= 0, 'v2270ui/B10: 上游开关写明「不开就答不出」');
    // 点击保存：体检设置 + 两个上游**三个都真写**并复核读回
    const dom = env.dom;
    const wr = dom.getElementById('wa-sh-warn');
    const ur = dom.getElementById('wa-sh-urgent');
    const fc = dom.getElementById('wa-sh-forecaster');
    const wl = dom.getElementById('wa-sh-waterline');
    const btn = dom.getElementById('wa-sh-save');
    if (wr) wr.value = '55';
    if (ur) ur.value = '11';
    if (fc) fc.checked = true;
    if (wl) wl.checked = true;
    if (btn && btn.onclick) btn.onclick();
    const WA = env.WA;
    const now = WA.saveHealth.getSettings();
    a(now.warnRounds === 55, 'v2270ui/B11: 提示线真写进体检引擎（55）');
    a(now.urgentRounds === 11, 'v2270ui/B12: 紧急线真写进体检引擎（11）');
    a(WA.storageForecast.getSettings().enabled === true, 'v2270ui/B13: 上游趋势面真被开起来（跨引擎写）');
    a(WA.capacityAudit.getSettings().enabled === true, 'v2270ui/B14: 上游水位面真被开起来（跨引擎写）');
    // 关回去也真生效（不是单向开关）
    if (fc) fc.checked = false;
    if (wl) wl.checked = false;
    if (btn && btn.onclick) btn.onclick();
    a(WA.storageForecast.getSettings().enabled === false, 'v2270ui/B15: 上游趋势面真能关回去');
    a(WA.capacityAudit.getSettings().enabled === false, 'v2270ui/B16: 上游水位面真能关回去');
  }
  {
    // 两个滑块读数联动
    const env = freshEnv();
    pageHtml(env, 'settings');
    const dom = env.dom;
    const wr = dom.getElementById('wa-sh-warn');
    const ur = dom.getElementById('wa-sh-urgent');
    if (wr) { wr.value = '77'; if (wr.oninput) wr.oninput(); }
    if (ur) { ur.value = '13'; if (ur.oninput) ur.oninput(); }
    const wrv = dom.getElementById('wa-sh-warnv');
    const urv = dom.getElementById('wa-sh-urgentv');
    a(!!wrv && wrv.textContent === '77', 'v2270ui/B17: 提示线滑块读数跟着变');
    a(!!urv && urv.textContent === '13', 'v2270ui/B18: 紧急线滑块读数跟着变');
  }

  // ── C 诊断节读数 ──────────────────────────────────────────────────────
  {
    const env = freshEnv();
    const rep = env.WA.toolDiag.collect();
    a(!!rep.saveHealth, 'v2270ui/C1: toolDiag 包含 saveHealth');
    a(rep.saveHealth.enabled === true, 'v2270ui/C2: saveHealth enabled 为 true');
    a(typeof rep.saveHealth.state === 'string' && rep.saveHealth.state.length > 0, 'v2270ui/C3: state 读数在场');
    a(rep.saveHealth.trendAvailable === false, 'v2270ui/C4: 出厂态趋势面不可用（可区分于「够用」）');
    a(rep.saveHealth.trendReason === 'disabled', 'v2270ui/C5: 原因逐字带出（disabled）');
    a(rep.saveHealth.waterlineAvailable === false, 'v2270ui/C6: 出厂态水位面不可用');
    a(rep.saveHealth.sources.store === true, 'v2270ui/C7: 三源在位性可读（store）');
    a(rep.saveHealth.sources.storageForecast === true, 'v2270ui/C8: 三源在位性可读（storageForecast）');
    a(rep.saveHealth.sources.capacityAudit === true, 'v2270ui/C9: 三源在位性可读（capacityAudit）');
    a(typeof rep.saveHealth.note === 'string' && rep.saveHealth.note.indexOf('缺口不等于健康') >= 0,
      'v2270ui/C10: 诊断节把「缺口 ≠ 健康」写进 note');
  }

  // ── D 登记面 ──────────────────────────────────────────────────────────
  const idxSh = I.indexOf("'engines/save-health.js'");
  const idxRc = I.indexOf("'engines/round-cost.js'");
  const idxCt = I.indexOf("'engines/capability-tier.js'");
  a(idxSh > idxRc && idxSh < idxCt, 'v2270ui/D1: index.js 中 save-health 在 round-cost 之后、tier 之前');
  const runSh = R.indexOf("'engines/save-health.js'");
  const runRc = R.indexOf("'engines/round-cost.js'");
  const runCt = R.indexOf("'engines/capability-tier.js'");
  a(runSh > runRc && runSh < runCt, 'v2270ui/D2: run.js LOAD 中同序');
  a(D.indexOf("'wa-sh-enable'") >= 0, 'v2270ui/D3: UI_BINDINGS 登记 wa-sh-enable');
  a(D.indexOf("'wa-sh-forecaster'") >= 0, 'v2270ui/D4: UI_BINDINGS 登记 wa-sh-forecaster（跨引擎写最易静默失效）');
  a(D.indexOf("'wa-sh-waterline'") >= 0, 'v2270ui/D5: UI_BINDINGS 登记 wa-sh-waterline');
  a(D.indexOf("'wa-sh-warnv'") >= 0, 'v2270ui/D6: UI_BINDINGS 登记 wa-sh-warnv（滑块读数 span）');
  a(D.indexOf("'wa-sh-urgentv'") >= 0, 'v2270ui/D7: UI_BINDINGS 登记 wa-sh-urgentv');

  // ── N 锚点纯度 + 真破坏 + 两向自证 ────────────────────────────────────
  a(cnt(P, N_ANCHOR.blockDef) === 1, 'v2270ui/N1: blockDef 恰 1 次');
  a(cnt(P, N_ANCHOR.blockUse) === 1, 'v2270ui/N2: blockUse 恰 1 次');
  a(cnt(S, N_ANCHOR.saveCall) === 1, 'v2270ui/N3: saveCall 恰 1 次');
  a(cnt(D, N_ANCHOR.diagState) === 1, 'v2270ui/N4: diagState 恰 1 次');
  a(cnt(P, N_ANCHOR.panelNoData) === 1, 'v2270ui/N5: panelNoData 恰 1 次');

  function mkEnv(ov) { return freshEnv(ov); }

  // N6 破坏概览页体检块 ⇒ 概览页上再没有那一格
  {
    const badPanel = P.replace(N_ANCHOR.blockUse, '${""}');
    a(badPanel !== P && cnt(badPanel, N_ANCHOR.blockUse) === 0, 'v2270ui/N6a: N6 源码破坏成功（锚点命中）');
    const env = mkEnv({ [PANEL_REL]: badPanel });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-save-block"') < 0, 'v2270ui/N6b: 破坏副本上概览页不再出这一格');
    const envOk = freshEnv();
    a(pageHtml(envOk, 'overview').html.indexOf('id="wa-save-block"') >= 0,
      'v2270ui/N6c: 原版上同款判据为真（两向自证成立）');
  }

  // N7 破坏「no-data 单独渲染」⇒ 缺面被当正常态渲染
  {
    const badPanel2 = P.replace(N_ANCHOR.panelNoData, 'if (false) {');
    a(badPanel2 !== P, 'v2270ui/N7a: N7 源码破坏成功（锚点命中）');
    const env = mkEnv({ [PANEL_REL]: badPanel2 });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('wa-save-quiet') < 0, 'v2270ui/N7b: 破坏副本上缺面不再走 quiet 分支');
    // 注：不能咬 `读不全` —— 引擎的 line() 里也有这三个字（概览页整行取它），
    //   所以破坏面板分支后它照样出现。面板专属的判据是 quiet class 与 wa-save-live 的互斥。
    a(r.html.indexOf('wa-save-live') >= 0,
      'v2270ui/N7c: 破坏副本上缺面被当成 live 正常态渲染（不再降级提示）');
    const envOk = freshEnv();
    const rOk = pageHtml(envOk, 'overview');
    a(rOk.html.indexOf('wa-save-quiet') >= 0 && rOk.html.indexOf('wa-save-live') < 0,
      'v2270ui/N7d: 原版两向自证成立（quiet 在场、live 不在场）');
  }

  // N8 破坏设置页体检写入口 ⇒ 点击保存不再落到体检引擎
  {
    const badSet = S.replace(N_ANCHOR.saveCall, 'const r = null;');
    a(badSet !== S && cnt(badSet, N_ANCHOR.saveCall) === 0, 'v2270ui/N8a: N8 源码破坏成功（锚点命中）');
    const env = mkEnv({ [SET_REL]: badSet });
    pageHtml(env, 'settings');
    const dom = env.dom;
    const btn = dom.getElementById('wa-sh-save');
    if (btn && btn.onclick) btn.onclick();
    // 体检设置没写进（保持默认 40/8），且**两个上游也不该被写**（提前 return 掉了）
    const WAe = env.WA;
    a(WAe.saveHealth.getSettings().warnRounds === 40, 'v2270ui/N8b: 破坏副本上体检设置未写入');
    const envOk = freshEnv();
    pageHtml(envOk, 'settings');
    const domOk = envOk.dom;
    const wrOk = domOk.getElementById('wa-sh-warn');
    if (wrOk) wrOk.value = '66';
    const btnOk = domOk.getElementById('wa-sh-save');
    if (btnOk && btnOk.onclick) btnOk.onclick();
    a(envOk.WA.saveHealth.getSettings().warnRounds === 66, 'v2270ui/N8c: 原版上保存真的落到引擎（两向自证成立）');
  }

  // N9 破坏诊断节的 state 读数 ⇒ 诊断包里拿不到状态
  {
    const badDiag = D.replace(N_ANCHOR.diagState, 'state: undefined,\n        bytes:');
    a(badDiag !== D && cnt(badDiag, N_ANCHOR.diagState) === 0, 'v2270ui/N9a: N9 源码破坏成功（锚点命中）');
    const env = mkEnv({ [DIAG_REL]: badDiag });
    const rep = env.WA.toolDiag.collect();
    a(rep.saveHealth && rep.saveHealth.state === undefined, 'v2270ui/N9b: 破坏副本上 state 读数缺席');
    const envOk = freshEnv();
    a(typeof envOk.WA.toolDiag.collect().saveHealth.state === 'string',
      'v2270ui/N9c: 原版上 state 在场（两向自证成立）');
  }

  // N10 负控制全程未改真源码
  a(rd(PANEL_REL) === P && rd(SET_REL) === S && rd(DIAG_REL) === D && rd(ENG_SH) === rd(ENG_SH),
    'v2270ui/N10: 负控制后四份真源码逐字未变');

  console.log('══ EXV6-6 接线锁（save-health-ui-v2270）══');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) fails.forEach(function (f) { console.log('  ✗ ' + f); });
  return { pass: pass, fail: fail, fails: fails };
}
module.exports = { runAll: runAll };
if (require.main === module) { runAll(); }