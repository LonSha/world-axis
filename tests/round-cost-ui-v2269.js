#!/usr/bin/env node
/**
 * v2.269.0（V6 · EXV6-5）接线锁：**单轮成本卡在产品侧真的被玩家看到了吗**
 *
 * 引擎全绿不等于玩家看得见 —— 本仓「功能级失效」裁决的正是这一格。
 * 判四件事：概览页渲染成型（三态各带稳定 class）、设置页控件渲染且点击真跑到引擎、
 * 诊断节读数在场、LOAD 登记序与 index.js 同序。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_RC = 'engines/round-cost.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
const SELF_REL = 'tests/round-cost-ui-v2269.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const N_ANCHOR = {
  // 概览页成本卡块（负控制 N1 破坏它 ⇒ 概览页再不出现该块）
  blockDef: 'const costBlock = (function () {',
  blockUse: '${costBlock}',
  // 设置页保存调用（负控制 N2 破坏它 ⇒ 点击保存不再落到引擎）
  saveCall: 'const r = WA.roundCost.setSettings(next);',
  // 诊断节读数（负控制 N3 破坏它 ⇒ 诊断包里 state 恒 undefined）
  //   锚点取 `state: cardState,`（本版为治「拿旧判决描述本次状态」而引入的中间变量）——
  //   直接锚 `card.state` 会命中两处（中间变量定义 + 使用点），锚点必须唯一。
  //   v2.275.0：**又撞了一次同名**。v2.270.0 的 secSaveHealth() 也写了
  //   `const cardState = (card && card.state) || 'unknown';` + `state: cardState,` ——
  //   于是这条锚点从「唯一」变成命中 2 处，N4/N7a/N7b 三条一起红。
  //   修法不是放宽（「命中 ≥1 就算」会让 N7 的破坏可能打在**别的节**上：诊断包里
  //   roundCost.state 缺席而 saveHealth.state 被改坏，判据照样绿 —— 那是假绿）。
  //   故把锚点扩到**跨行唯一**：`state: cardState,` 紧跟 `used: …` 那一段只有 roundCost 有
  //   （saveHealth 紧跟的是 bytes/usedPct 那一组，没有裸的 `used:`）。
  diagState: '        state: cardState,\n        used: (card && card.used !== undefined) ? card.used : null,',
  // 「读不到 ≠ 零成本」在面板上的落地：空态必须说这一句
  panelNoReading: 'costBlock'
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

  // ── A 概览页三态 ──────────────────────────────────────────────────────
  {
    const env = freshEnv();
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-cost-block"') >= 0, 'v2269ui/A1: 概览页包含 #wa-cost-block');
    a(r.html.indexOf('不是「零成本」') >= 0, 'v2269ui/A2: 出厂态明说「还不是零成本」');
    a(r.html.indexOf('单轮成本读数不可用') < 0, 'v2269ui/A2b: 不是引擎缺席态');
  }
  {
    // 关闭态：控件在设置页，概览页必须如实说「关着」
    const env = freshEnv();
    const WA = env.WA;
    WA.roundCost.setSettings({ enabled: false });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('单轮成本卡已关闭') >= 0, 'v2269ui/A3: 关闭态提示正确');
    WA.roundCost.setSettings({ enabled: true });
  }
  {
    // 有读数态：造一轮完整快照 ⇒ 概览页出现 live class 与 token 用量
    const env = freshEnv();
    const WA = env.WA;
    WA.roundCost.setSettings({ enabled: true, topN: 4, showTiming: true });
    WA.store.transact(function (d) {
      d.lastInjection = {
        at: 1, injected: true, len: 640, round: 7, sources: ['晨报', '夜报'], mainCount: 2,
        budget: {
          used: 512, cap: 2400, source: 'default', contextSize: null, remain: 1888,
          budgetMode: 'auto-noctx', overBudget: false,
          headroom: { remain: 1888, usedPct: 21.3, freePct: 78.7, saturated: false, avgKeptTokens: 256, spareSources: 7, note: '' },
          cost: { measured: 12, totalMs: 31.4, slowest: { source: '晨报', ms: 12.1 }, unmeasuredCount: 0 },
          keptCount: 2, folded: [], dropped: []
        }
      };
    });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('wa-cost-live') >= 0, 'v2269ui/A4: 有读数时带 wa-cost-live class');
    a(r.html.indexOf('512/2400t') >= 0, 'v2269ui/A5: 渲染出 token 用量');
    a(r.html.indexOf('本轮成本卡（第 7 轮）') >= 0, 'v2269ui/A6: 标出轮次坐标');
    a(r.html.indexOf('量不到上下文窗口') >= 0, 'v2269ui/A7: 额度档位人话带出（复用 budgetView）');
  }
  {
    // 无预算裁决态：quiet class + 明说这一档
    const env = freshEnv();
    const WA = env.WA;
    WA.roundCost.setSettings({ enabled: true });
    WA.store.transact(function (d) { d.lastInjection = { at: 2, injected: true, len: 40, round: 3, sources: ['回声'] }; });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('wa-cost-quiet') >= 0, 'v2269ui/A8: 无裁决态带 wa-cost-quiet class');
    a(r.html.indexOf('没有可裁的注入项') >= 0, 'v2269ui/A9: 明说该轮没可裁项');
  }

  // ── B 设置页控件与绑定 ────────────────────────────────────────────────
  {
    const env = freshEnv();
    const r = pageHtml(env, 'settings');
    a(r.html.indexOf('id="wa-rc-enable"') >= 0, 'v2269ui/B1: 设置页渲染 wa-rc-enable');
    a(r.html.indexOf('id="wa-rc-topn"') >= 0, 'v2269ui/B2: 设置页渲染 wa-rc-topn');
    a(r.html.indexOf('id="wa-rc-topnv"') >= 0, 'v2269ui/B3: 设置页渲染 wa-rc-topnv');
    a(r.html.indexOf('id="wa-rc-timing"') >= 0, 'v2269ui/B4: 设置页渲染 wa-rc-timing');
    a(r.html.indexOf('id="wa-rc-longtrend"') >= 0, 'v2269ui/B5: 设置页渲染 wa-rc-longtrend');
    a(r.html.indexOf('id="wa-rc-save"') >= 0, 'v2269ui/B6: 设置页渲染 wa-rc-save');
    a(r.html.indexOf('id="wa-rc-out"') >= 0, 'v2269ui/B7: 设置页渲染 wa-rc-out');
    a(r.html.indexOf('不是本轮读数') >= 0, 'v2269ui/B8: 长期趋势一项在界面上写明它不是本轮读数');
    // 点击保存链路：滑块 + 两个复选框 ⇒ 真写进引擎
    const dom = env.dom;
    const tn = dom.getElementById('wa-rc-topn');
    const lt = dom.getElementById('wa-rc-longtrend');
    const btn = dom.getElementById('wa-rc-save');
    if (tn) tn.value = '9';
    if (lt) lt.checked = true;
    if (btn && btn.onclick) btn.onclick();
    const now = env.WA.roundCost.getSettings();
    a(now.topN === 9, 'v2269ui/B9: 点击保存真正写进引擎（topN=9）');
    a(now.showLongTrend === true, 'v2269ui/B10: 长期趋势开关真的落进引擎');
  }
  {
    // 滑块读数联动（id 写错时拖了没反应）
    const env = freshEnv();
    const dom = env.dom;
    const r0 = pageHtml(env, 'settings');
    const tn = dom.getElementById('wa-rc-topn');
    const pv = dom.getElementById('wa-rc-topnv');
    if (tn) { tn.value = '7'; if (tn.oninput) tn.oninput(); }
    const pv2 = dom.getElementById('wa-rc-topnv');
    a(!!pv2 && pv2.textContent === '7',
      'v2269ui/B11: 拖动滑块读数跟着变（实得 ' + j(pv2 && pv2.textContent) + ' / 节点 ' + !!pv + '）');
  }

  // ── C 诊断节读数 ──────────────────────────────────────────────────────
  {
    const env = freshEnv();
    const rep = env.WA.toolDiag.collect();
    a(!!rep.roundCost, 'v2269ui/C1: toolDiag 包含 roundCost');
    a(rep.roundCost.enabled === true, 'v2269ui/C2: roundCost enabled 为 true');
    a(rep.roundCost.state === 'no-reading', 'v2269ui/C3: 出厂态 state 为 no-reading（不是 live/0）');
    a(rep.roundCost.used === null, 'v2269ui/C4: 出厂态 used 为 null（读不到 ≠ 0）');
    a(rep.roundCost.sources.injectBudget === true, 'v2269ui/C5: 三源在位性可读（injectBudget）');
    a(rep.roundCost.sources.injectValue === true, 'v2269ui/C6: 三源在位性可读（injectValue）');
    a(typeof rep.roundCost.note === 'string' && rep.roundCost.note.indexOf('读不到') >= 0,
      'v2269ui/C7: 诊断节把「读不到 ≠ 没花钱」写进 note');
  }

  // ── D 登记面 ──────────────────────────────────────────────────────────
  const idxRc = I.indexOf("'engines/round-cost.js'");
  const idxUc = I.indexOf("'engines/undercurrent-calendar.js'");
  const idxCt = I.indexOf("'engines/capability-tier.js'");
  a(idxRc > idxUc && idxRc < idxCt, 'v2269ui/D1: index.js 中 round-cost 在 undercurrent-calendar 之后、tier 之前');
  const runRc = R.indexOf("'engines/round-cost.js'");
  const runUc = R.indexOf("'engines/undercurrent-calendar.js'");
  const runCt = R.indexOf("'engines/capability-tier.js'");
  a(runRc > runUc && runRc < runCt, 'v2269ui/D2: run.js LOAD 中同序');
  a(D.indexOf("'wa-rc-enable'") >= 0, 'v2269ui/D3: UI_BINDINGS 登记 wa-rc-enable');
  a(D.indexOf("'wa-rc-save'") >= 0, 'v2269ui/D4: UI_BINDINGS 登记 wa-rc-save');
  a(D.indexOf("'wa-rc-longtrend'") >= 0, 'v2269ui/D5: UI_BINDINGS 登记 wa-rc-longtrend（默认关着的项最易静默失效）');
  a(D.indexOf("'wa-rc-topnv'") >= 0, 'v2269ui/D6: UI_BINDINGS 登记 wa-rc-topnv（滑块读数 span）');

  // ── N 负控制锚点核验 ──────────────────────────────────────────────────
  a(cnt(P, N_ANCHOR.blockDef) === 1, 'v2269ui/N1: blockDef 恰 1 次');
  a(cnt(P, N_ANCHOR.blockUse) === 1, 'v2269ui/N2: blockUse 恰 1 次');
  a(cnt(S, N_ANCHOR.saveCall) === 1, 'v2269ui/N3: saveCall 恰 1 次');
  a(cnt(D, N_ANCHOR.diagState) === 1, 'v2269ui/N4: diagState 恰 1 次');

  // ── N5~N7 真破坏 + 两向自证（破坏副本只装在 gate.fresh 的内存沙箱里，不写回真源码）──
  //   负控制三形之戒：① 断言原文件（破坏没发生也绿）；② 破坏写死成常量（判据没被调用）；
  //   ③ 破坏把判据自己删了（自我指涉）。故每条都走「真源码锚点替换 → 加载破坏副本 →
  //   在副本上重跑**同款渲染判据**」，并配「原版上同款判据必须真」的正向半边。

  // N5 破坏概览页成本卡块 ⇒ 概览页上再没有那一格
  const badPanel = P.replace(N_ANCHOR.blockUse, '${""}');
  a(badPanel !== P && cnt(badPanel, N_ANCHOR.blockUse) === 0, 'v2269ui/N5a: N5 源码破坏成功（锚点命中）');
  {
    const env = freshEnv({ [PANEL_REL]: badPanel });
    env.WA.store.transact(function (d) { d.lastInjection = { at: 1, injected: true, len: 640, round: 4, sources: ['甲'], budget: { used: 200, cap: 2400, budgetMode: 'manual' } }; });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-cost-block"') < 0, 'v2269ui/N5b: 破坏副本上概览页不再出这一格');
    const envOk = freshEnv();
    envOk.WA.store.transact(function (d) { d.lastInjection = { at: 1, injected: true, len: 640, round: 4, sources: ['甲'], budget: { used: 200, cap: 2400, budgetMode: 'manual' } }; });
    a(pageHtml(envOk, 'overview').html.indexOf('id="wa-cost-block"') >= 0,
      'v2269ui/N5c: 原版上同款判据为真（两向自证成立）');
  }

  // N6 破坏设置页写入口 ⇒ 点击保存不再落到引擎
  const badSet = S.replace(N_ANCHOR.saveCall, 'const r = null;');
  a(badSet !== S && cnt(badSet, N_ANCHOR.saveCall) === 0, 'v2269ui/N6a: N6 源码破坏成功（锚点命中）');
  {
    const env = freshEnv({ [SET_REL]: badSet });
    pageHtml(env, 'settings');
    const dom = env.dom;
    const tn = dom.getElementById('wa-rc-topn');
    const btn = dom.getElementById('wa-rc-save');
    if (tn) tn.value = '11';
    if (btn && btn.onclick) btn.onclick();
    a(env.WA.roundCost.getSettings().topN !== 11, 'v2269ui/N6b: 破坏副本上点击保存不再写进引擎');
    const envOk = freshEnv();
    pageHtml(envOk, 'settings');
    const domOk = envOk.dom;
    const tnOk = domOk.getElementById('wa-rc-topn');
    const btnOk = domOk.getElementById('wa-rc-save');
    if (tnOk) tnOk.value = '11';
    if (btnOk && btnOk.onclick) btnOk.onclick();
    a(envOk.WA.roundCost.getSettings().topN === 11, 'v2269ui/N6c: 原版上保存真的落到引擎（两向自证成立）');
  }

  // N7 破坏诊断节的 state 读数 ⇒ 诊断包里拿不到状态（与控制面的判决脱钩）
  const badDiag = D.replace(N_ANCHOR.diagState, 'state: undefined,');
  a(badDiag !== D && cnt(badDiag, N_ANCHOR.diagState) === 0, 'v2269ui/N7a: N7 源码破坏成功（锚点命中）');
  {
    const env = freshEnv({ [DIAG_REL]: badDiag });
    const rep = env.WA.toolDiag.collect();
    a(rep.roundCost && rep.roundCost.state === undefined, 'v2269ui/N7b: 破坏副本上 state 读数缺席');
    const envOk = freshEnv();
    a(envOk.WA.toolDiag.collect().roundCost.state === 'no-reading',
      'v2269ui/N7c: 原版上 state 为 no-reading（两向自证成立）');
  }

  // N8 负控制全程未改真源码（逐字未变）
  a(rd(PANEL_REL) === P && rd(SET_REL) === S && rd(DIAG_REL) === D && rd(ENG_RC) === rd(ENG_RC),
    'v2269ui/N8: 负控制后四份真源码逐字未变');

  console.log('══ EXV6-5 接线锁（round-cost-ui-v2269）══');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) fails.forEach(function (f) { console.log('  ✗ ' + f); });
  return { pass: pass, fail: fail, fails: fails };
}
module.exports = { runAll: runAll };
if (require.main === module) { runAll(); }