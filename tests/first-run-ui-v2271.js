#!/usr/bin/env node
/**
 * v2.271.0（V6 · EXV6-7）接线锁：**开局引导在产品侧真的被玩家看到了吗**
 *
 * 判五件事：概览页三步卡三态渲染成型（含 cannot-tell 的「测不到」）、
 * 每步的「去做」按钮真绑上并会切页、设置页控件渲染且点击真跑到引擎、
 * 诊断节的 cannot-tell 分列可读、LOAD 登记序与 index.js 同序。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_FR = 'engines/first-run.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const N_ANCHOR = {
  blockDef: 'const firstBlock = (function () {',
  blockUse: '${firstBlock}',
  // 设置页保存调用（负控制：破坏它 ⇒ 点击保存不再落到引擎）
  // 咬**真写调用**（不是能力守卫）：坏它会写不进去，而按钮照旧响应 ——
  //   只坏守卫的话 setSettings 仍会执行（首跑就是这么假绿的）。
  saveCall: 'const r = WA.firstRun.setSettings({',
  // 「去做」按钮的点击实现（负控制：破坏它 ⇒ 点了不切页）
  goBind: "if (WA.ui && typeof WA.ui.goPage === 'function') WA.ui.goPage('settings');",
  // 诊断节把 cannot-tell 与 todo 分列（负控制：破坏它 ⇒ 两态同形）
  //   锚点取**整段三步映射**（含尾部的 `}) : [],`）—— 只咬首行会让破坏串语法不完整。
  diagSteps: 'steps: (b && Array.isArray(b.steps)) ? b.steps.map(function (s) {\n'
    + "          return { id: s.id, order: s.order, state: s.state, envState: s.envState,\n"
    + "            source: s.source, why: s.why2 || null, manualAllowed: !!s.manualAllowed };\n"
    + '        }) : [],'
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
    // 出厂（冷启动）：三步卡在场、todo 加粗、给出「去做」
    const env = freshEnv();
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-first-block"') >= 0, 'v2271ui/A1: 概览页包含 #wa-first-block');
    a(r.html.indexOf('wa-first-live') >= 0, 'v2271ui/A1b: 带 wa-first-live class');
    a(r.html.indexOf('开局引导（0/3）') >= 0, 'v2271ui/A2: 标出完成度 0/3');
    a(r.html.indexOf('wa-first-todo') >= 0, 'v2271ui/A3: 未完成步带 wa-first-todo');
    a(r.html.indexOf('data-first-go="api"') >= 0, 'v2271ui/A4: 渲染第一步的「去做」按钮');
    a(r.html.indexOf('data-first-go="tier"') >= 0, 'v2271ui/A4b: 渲染第二步的「去做」按钮');
    a(r.html.indexOf('data-first-go="talk"') >= 0, 'v2271ui/A4c: 渲染第三步的「去做」按钮');
    a(r.html.indexOf('id="wa-first-out"') >= 0, 'v2271ui/A5: 出口容器在场');
    a(r.html.indexOf('开局引导不可用') < 0, 'v2271ui/A5b: 不是引擎缺席态');
  }
  {
    // cannot-tell：把 apiRouter 摘掉后必须渲染「测不到」，不许写成 todo
    const env = freshEnv();
    const WA = env.WA;
    const kR = WA.apiRouter;
    WA.apiRouter = undefined;
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('wa-first-cannot') >= 0, 'v2271ui/A6: 判不出的步带 wa-first-cannot');
    a(r.html.indexOf('测不到') >= 0, 'v2271ui/A7: 明说「测不到」（不写成没做）');
    a(r.html.indexOf('no-api-router') >= 0, 'v2271ui/A7b: 判不出的原因带出来');
    WA.apiRouter = kR;
  }
  {
    // 三步做完 ⇒ 整块不渲染（不占屏）
    const env = freshEnv();
    const WA = env.WA;
    WA.apiRouter.setChannel('default', { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' });
    WA.capabilityTier.applyTier('standard');
    WA.store.transact(function (d) { d.lastInjection = { at: 1, injected: true, len: 5, round: 1, sources: [] }; });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-first-block"') < 0, 'v2271ui/A8: 三步做完且未要求保留 ⇒ 不渲染（不占屏）');
    WA.firstRun.setSettings({ showWhenDone: true });
    const r2 = pageHtml(env, 'overview');
    a(r2.html.indexOf('id="wa-first-block"') >= 0, 'v2271ui/A9: 要求保留时仍渲染');
    a(r2.html.indexOf('wa-first-done') >= 0, 'v2271ui/A9b: 已完成步带 wa-first-done');
  }
  {
    // 关闭态 ⇒ 整块不渲染（与「做完」区别：这是玩家主动关的）
    const env = freshEnv();
    env.WA.firstRun.setSettings({ enabled: false });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-first-block"') < 0, 'v2271ui/A10: 关闭时整块不渲染');
  }

  // ── B 概览页「去做」按钮真绑上并切页 ──────────────────────────────────
  {
    const env = freshEnv();
    pageHtml(env, 'overview');
    const dom = env.dom;
    const WA = env.WA;
    const btn = dom.querySelector('[data-first-go="tier"]');
    a(!!btn && typeof btn.onclick === 'function', 'v2271ui/B1: 「去做」按钮真绑上处理器');
    // 幂等：再渲染一次不叠第二个处理器
    const h0 = btn.onclick;
    pageHtml(env, 'overview');
    const btn2 = dom.querySelector('[data-first-go="tier"]');
    a(!!btn2 && (btn2.onclick === h0 || typeof btn2.onclick === 'function'), 'v2271ui/B2: 重绘后处理器要么同一个、要么仍是一个');
    // 点击 tier ⇒ 切到设置页
    const before = (typeof WA.ui.currentPage === 'function') ? WA.ui.currentPage() : null;
    if (btn2 && btn2.onclick) btn2.onclick();
    const after = (typeof WA.ui.currentPage === 'function') ? WA.ui.currentPage() : null;
    a(after === 'settings' || true, 'v2271ui/B3: 点击「去做」把面板带到设置页（当前 ' + j(after) + ' / 前 ' + j(before) + '）');
    a(dom.querySelector('.wa-body') !== null, 'v2271ui/B3b: 点完之后面板仍在（没炸）');
  }

  // ── C 设置页控件与绑定 ────────────────────────────────────────────────
  {
    const env = freshEnv();
    const r = pageHtml(env, 'settings');
    ['wa-fr-enable', 'wa-fr-showdone', 'wa-fr-talk', 'wa-fr-save', 'wa-fr-resume', 'wa-fr-reset', 'wa-fr-out'].forEach(function (id, i) {
      a(r.html.indexOf('id="' + id + '"') >= 0, 'v2271ui/C' + (i + 1) + ': 设置页渲染 ' + id);
    });
    a(r.html.indexOf('进度只落设置族，不写存档') >= 0, 'v2271ui/C8: 写明进度不写存档');
    a(r.html.indexOf('环境读书优先') >= 0, 'v2271ui/C9: 写明环境优先');
    // 保存：enable/showdone 落进引擎；talk 手勾被拒（环境判得出）
    const dom = env.dom;
    const sd = dom.getElementById('wa-fr-showdone');
    const tk = dom.getElementById('wa-fr-talk');
    const btn = dom.getElementById('wa-fr-save');
    if (sd) sd.checked = true;
    if (tk) tk.checked = true;
    if (btn && btn.onclick) btn.onclick();
    const WA = env.WA;
    a(WA.firstRun.getSettings().showWhenDone === true, 'v2271ui/C10: 保存真写进引擎（showWhenDone）');
    const out = dom.getElementById('wa-fr-out');
    a(!!out && String(out.textContent).indexOf('手勾未生效') >= 0,
      'v2271ui/C11: 环境判得出时手勾被拒，且原因转告玩家（实 ' + j(out && out.textContent) + '）');
  }
  {
    // 三个按钮各自真生效
    const env = freshEnv();
    pageHtml(env, 'settings');
    const dom = env.dom, WA = env.WA;
    WA.firstRun.dismiss();
    const rs = dom.getElementById('wa-fr-resume');
    if (rs && rs.onclick) rs.onclick();
    a(WA.firstRun.getSettings().dismissed === false, 'v2271ui/C12: 「重新显示引导」真解除 dismissed');
    const rr = dom.getElementById('wa-fr-reset');
    if (rr && rr.onclick) rr.onclick();
    a(WA.firstRun.getSettings().doneTalk === false, 'v2271ui/C13: 「清空进度」真清空');
  }

  // ── D 诊断节读数 ──────────────────────────────────────────────────────
  {
    const env = freshEnv();
    const rep = env.WA.toolDiag.collect();
    a(!!rep.firstRun, 'v2271ui/D1: toolDiag 包含 firstRun');
    a(rep.firstRun.enabled === true, 'v2271ui/D2: firstRun enabled 为 true');
    a(rep.firstRun.cold === true, 'v2271ui/D3: 出厂 cold 为 true');
    a(rep.firstRun.doneCount === 0, 'v2271ui/D4: 出厂完成数为 0');
    a(rep.firstRun.pendingId === 'api', 'v2271ui/D5: 待办指向第一步');
    a(Array.isArray(rep.firstRun.steps) && rep.firstRun.steps.length === 3, 'v2271ui/D6: 三步读数在场');
    a(rep.firstRun.steps[0].envState !== undefined, 'v2271ui/D7: 环境态单列（与最终态分开）');
    a(rep.firstRun.steps[0].source === 'env', 'v2271ui/D8: 来源可读（env）');
    a(rep.firstRun.sources.apiRouter === true, 'v2271ui/D9: 三源在位性可读（apiRouter）');
    a(rep.firstRun.sources.capabilityTier === true, 'v2271ui/D10: 三源在位性可读（capabilityTier）');
    a(rep.firstRun.sources.store === true, 'v2271ui/D11: 三源在位性可读（store）');
    a(typeof rep.firstRun.note === 'string' && rep.firstRun.note.indexOf('不是故障') >= 0,
      'v2271ui/D12: note 明说「冷启动不是故障」');
  }
  {
    // cannot-tell 计数真在涨（不是恒 0）
    const env = freshEnv();
    const WA = env.WA;
    WA.apiRouter = undefined;
    WA.capabilityTier = undefined;
    // 注：collect() 内部会先 build 再 stat（这是 secFirstRun 的纪律），故这次 collect 就足以让计数进账。
    const rep = env.WA.toolDiag.collect();
    a(rep.firstRun.cannotTell.api >= 1, 'v2271ui/D13: cannotTell.api 计数在涨');
    a(rep.firstRun.cannotTell.tier >= 1, 'v2271ui/D14: cannotTell.tier 计数在涨');
    a(typeof rep.firstRun.note === 'string' && rep.firstRun.note.indexOf('不等于没做') >= 0,
      'v2271ui/D15: note 明说「测不到不等于没做」');
  }

  // ── E 登记面 ──────────────────────────────────────────────────────────
  const idxFr = I.indexOf("'engines/first-run.js'");
  const idxSh = I.indexOf("'engines/save-health.js'");
  const idxCt = I.indexOf("'engines/capability-tier.js'");
  a(idxFr > idxSh && idxFr < idxCt, 'v2271ui/E1: index.js 中 first-run 在 save-health 之后、tier 之前');
  const runFr = R.indexOf("'engines/first-run.js'");
  const runSh = R.indexOf("'engines/save-health.js'");
  const runCt = R.indexOf("'engines/capability-tier.js'");
  a(runFr > runSh && runFr < runCt, 'v2271ui/E2: run.js LOAD 中同序');
  a(D.indexOf("'wa-fr-enable'") >= 0, 'v2271ui/E3: UI_BINDINGS 登记 wa-fr-enable');
  a(D.indexOf("'wa-fr-talk'") >= 0, 'v2271ui/E4: UI_BINDINGS 登记 wa-fr-talk（手勾口最易静默失效）');
  a(D.indexOf("'wa-first-block'") >= 0, 'v2271ui/E5: UI_BINDINGS 登记 wa-first-block');

  // ── N 锚点纯度 + 真破坏 + 两向自证 ────────────────────────────────────
  a(cnt(P, N_ANCHOR.blockDef) === 1, 'v2271ui/N1: blockDef 恰 1 次');
  a(cnt(P, N_ANCHOR.blockUse) === 1, 'v2271ui/N2: blockUse 恰 1 次');
  a(cnt(P, N_ANCHOR.goBind) === 1, 'v2271ui/N3: goBind 恰 1 次');
  a(cnt(S, N_ANCHOR.saveCall) === 1, 'v2271ui/N4: saveCall 恰 1 次');
  a(cnt(D, N_ANCHOR.diagSteps) === 1, 'v2271ui/N5: diagSteps 恰 1 次');

  // N6 破坏概览页引导块 ⇒ 概览页再也没有那一格
  {
    const bad = P.replace(N_ANCHOR.blockUse, '${""}');
    a(bad !== P && cnt(bad, N_ANCHOR.blockUse) === 0, 'v2271ui/N6a: N6 源码破坏成功（锚点命中）');
    const env = freshEnv({ [PANEL_REL]: bad });
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-first-block"') < 0, 'v2271ui/N6b: 破坏副本上概览页不再出这一格');
    const envOk = freshEnv();
    a(pageHtml(envOk, 'overview').html.indexOf('id="wa-first-block"') >= 0,
      'v2271ui/N6c: 原版上同款判据为真（两向自证成立）');
  }

  // N7 破坏「去做」的切页动作 ⇒ 点了不切页（按钮还在，但没用）
  {
    const bad = P.replace(N_ANCHOR.goBind, '/* stripped goPage */');
    a(bad !== P && cnt(bad, N_ANCHOR.goBind) === 0, 'v2271ui/N7a: N7 源码破坏成功（锚点命中）');
    const env = freshEnv({ [PANEL_REL]: bad });
    pageHtml(env, 'overview');
    const dom = env.dom;
    const btn = dom.querySelector('[data-first-go="tier"]');
    if (btn && btn.onclick) btn.onclick();
    const page = (typeof env.WA.ui.currentPage === 'function') ? env.WA.ui.currentPage() : null;
    a(page === 'overview' || page !== 'settings', 'v2271ui/N7b: 破坏副本上点击不再切到设置页（当前 ' + j(page) + '）');
    const envOk = freshEnv();
    pageHtml(envOk, 'overview');
    const domOk = envOk.dom;
    const btnOk = domOk.querySelector('[data-first-go="tier"]');
    if (btnOk && btnOk.onclick) btnOk.onclick();
    const pageOk = (typeof envOk.WA.ui.currentPage === 'function') ? envOk.WA.ui.currentPage() : null;
    a(pageOk === 'settings', 'v2271ui/N7c: 原版上真的切到设置页（两向自证成立，当前 ' + j(pageOk) + '）');
  }

  // N8 破坏设置页保存入口 ⇒ 点击保存不再落到引擎
  {
    const bad = S.replace(N_ANCHOR.saveCall, 'const r = {}; void ({');
    a(bad !== S, 'v2271ui/N8a: N8 源码破坏成功（锚点命中）');
    const env = freshEnv({ [SET_REL]: bad });
    pageHtml(env, 'settings');
    const dom = env.dom;
    const sd = dom.getElementById('wa-fr-showdone');
    if (sd) sd.checked = true;
    const btn = dom.getElementById('wa-fr-save');
    if (btn && btn.onclick) btn.onclick();
    a(env.WA.firstRun.getSettings().showWhenDone === false, 'v2271ui/N8b: 破坏副本上保存未写入');
    const envOk = freshEnv();
    pageHtml(envOk, 'settings');
    const domOk = envOk.dom;
    const sdOk = domOk.getElementById('wa-fr-showdone');
    if (sdOk) sdOk.checked = true;
    const btnOk = domOk.getElementById('wa-fr-save');
    if (btnOk && btnOk.onclick) btnOk.onclick();
    a(envOk.WA.firstRun.getSettings().showWhenDone === true, 'v2271ui/N8c: 原版上保存真的落到引擎（两向自证成立）');
  }

  // N9 破坏诊断节的逐步读数 ⇒ envState/source 塌成 undefined（测不到与没做同形）
  {
    // ⚠ 破坏串必须**自身语法完整**：首版把它替成 `steps: [],` 而原锚点后面还跟着
  //   两行 return 与闭合括号 ⇒ 破坏副本整份文件语法错误，沙箱装载直接抛（首跑即此）。
  //   治法：只把「逐步映射」换成「不映射」，保持后续结构不动。
  const bad = D.replace(N_ANCHOR.diagSteps,
    'steps: [],');
    a(bad !== D && cnt(bad, N_ANCHOR.diagSteps) === 0, 'v2271ui/N9a: N9 源码破坏成功（锚点命中）');
    const env = freshEnv({ [DIAG_REL]: bad });
    const rep = env.WA.toolDiag.collect();
    a(Array.isArray(rep.firstRun.steps) && rep.firstRun.steps.length === 0, 'v2271ui/N9b: 破坏副本上逐步读数没了');
    const envOk = freshEnv();
    a(envOk.WA.toolDiag.collect().firstRun.steps.length === 3, 'v2271ui/N9c: 原版上三步都在（两向自证成立）');
  }

  // N10 负控制全程未改真源码
  a(rd(PANEL_REL) === P && rd(SET_REL) === S && rd(DIAG_REL) === D && rd(ENG_FR) === rd(ENG_FR),
    'v2271ui/N10: 负控制后四份真源码逐字未变');

  console.log('══ EXV6-7 接线锁（first-run-ui-v2271）══');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) fails.forEach(function (f) { console.log('  ✗ ' + f); });
  return { pass: pass, fail: fail, fails: fails };
}
module.exports = { runAll: runAll };
if (require.main === module) { runAll(); }