#!/usr/bin/env node
/**
 * v2.273.0（V6 · EXV6-9）接线锁：**一键交班在产品侧真的被玩家用上了吗**
 *
 * 判四件事：设置页九枚控件渲染且三钮各司其职（保存/打包/复原互不冒充）、
 * 缺块在界面上看得见、诊断节的缺块分列可读、LOAD 登记序与 index.js 同序。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_HP = 'engines/handoff-pack.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const N_ANCHOR = {
  // 保存钮的真写调用（负控制：破坏它 ⇒ 设置没写进去但按钮照旧响应）
  saveCall: 'const r = WA.handoffPack.setSettings({',
  // 打包钮的真调用（负控制：破坏它 ⇒ 点「打包」不出包）
  packCall: 'const p = WA.handoffPack.pack();',
  // 缺块在界面上的渲染（负控制：破坏它 ⇒ 缺块静默、界面只说「齐全」）
  missRows: 'const missRows = (snap && snap.missing && snap.missing.length)',
  // 诊断节把缺块分列（负控制：破坏它 ⇒ 缺块塌成空表）。
  //   锚点取整段缺块映射（含尾部）—— 只咬首行会让破坏串语法不完整。
  diagMissing: 'missing: (p && Array.isArray(p.missing)) ? p.missing.map(function (m) {\n'
    + '          return { id: m.id, label: m.label, why: m.why };\n'
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
  const S = rd(SET_REL);
  const D = rd(DIAG_REL);
  const I = rd(IDX_REL);
  const R = rd(RUN_REL);

  // ── A 设置页九枚控件 + 缺块可见 ────────────────────────────────────────
  {
    const env = freshEnv();
    // 出厂态：规则包关着、蓝图空 ⇒ 界面必须把缺块写出来
    env.WA.rulePack.setSettings({ enabled: false });
    const r = pageHtml(env, 'settings');
    ['wa-hp-enable', 'wa-hp-bp', 'wa-hp-rules', 'wa-hp-tier', 'wa-hp-theme',
      'wa-hp-save', 'wa-hp-pack', 'wa-hp-restore', 'wa-hp-out'].forEach(function (id, i) {
      a(r.html.indexOf('id="' + id + '"') >= 0, 'v2273ui/A' + (i + 1) + ': 设置页渲染 ' + id);
    });
    a(r.html.indexOf('缺块') >= 0 || r.html.indexOf('四块齐全') >= 0, 'v2273ui/A10: 界面写明「当前可取的块 / 缺块」');
    a(r.html.indexOf('复不出完整的一局') >= 0, 'v2273ui/A11: 写明缺块的后果（不静默）');
  }
  {
    // 缺块真的渲染出来（把规则包关着 + 蓝图空 ⇒ 至少一条缺块行）
    const env = freshEnv();
    env.WA.rulePack.setSettings({ enabled: false });
    const r = pageHtml(env, 'settings');
    a(r.html.indexOf('disabled') >= 0 || r.html.indexOf('empty-blueprint') >= 0,
      'v2273ui/A12: 缺块原因逐字渲染给玩家（不是只说「缺」）');
  }

  // ── B 三钮各司其职 ────────────────────────────────────────────────────
  {
    const env = freshEnv();
    pageHtml(env, 'settings');
    const dom = env.dom, WA = env.WA;
    const en = dom.getElementById('wa-hp-enable');
    const bp = dom.getElementById('wa-hp-bp');
    const save = dom.getElementById('wa-hp-save');
    // 关掉一块 + 关掉总开关，再存 ⇒ 设置里必须真反映
    if (en) en.checked = false;
    if (bp) bp.checked = false;
    if (save && save.onclick) save.onclick();
    const cfg = WA.handoffPack.getSettings();
    a(cfg.enabled === false, 'v2273ui/B1: 保存钮真写进引擎（enabled=false）');
    a(cfg.includeBlueprint === false, 'v2273ui/B2: include 开关真写进引擎（blueprint=false）');
    // 开回去，再测打包钮
    if (en) en.checked = true;
    if (bp) bp.checked = true;
    if (save && save.onclick) save.onclick();
    a(WA.handoffPack.getSettings().enabled === true, 'v2273ui/B3: 再存一次真开回来');
    const pack = dom.getElementById('wa-hp-pack');
    const out = dom.getElementById('wa-hp-out');
    if (pack && pack.onclick) pack.onclick();
    a(!!out && String(out.textContent).indexOf('打包完成') >= 0,
      'v2273ui/B4: 打包钮真出结果（实 ' + j(out && String(out.textContent).slice(0, 60)) + '）');
    a(!!out && (String(out.textContent).indexOf('缺：') >= 0 || String(out.textContent).indexOf('齐全') >= 0),
      'v2273ui/B5: 打包结果里缺块可见');
    // 复原钮：没有包时拒绝（不许凭空造）
    const res = dom.getElementById('wa-hp-restore');
    a(!!res && typeof res.onclick === 'function', 'v2273ui/B6: 复原钮绑上了处理器');
  }
  {
    // 复原钮真的把「没包」与「有包」分开说
    const env = freshEnv();
    pageHtml(env, 'settings');
    const dom = env.dom;
    const res = dom.getElementById('wa-hp-restore');
    // 先点打包（拿到包），再复原 ⇒ 应出「已复原 / 部分成功」
    const pack = dom.getElementById('wa-hp-pack');
    if (pack && pack.onclick) pack.onclick();
    if (res && res.onclick) res.onclick();
    const out = dom.getElementById('wa-hp-out');
    a(!!out && /已复原|部分成功|不可用/.test(String(out.textContent)),
      'v2273ui/B7: 复原钮给出可归因结论（实 ' + j(out && String(out.textContent).slice(0, 80)) + '）');
  }
  {
    // 没点打包就点复原 ⇒ 拒绝并说明（不许替玩家凭空造包）
    const env = freshEnv();
    pageHtml(env, 'settings');
    const dom = env.dom;
    const res = dom.getElementById('wa-hp-restore');
    if (res && res.onclick) res.onclick();
    const out = dom.getElementById('wa-hp-out');
    a(!!out && String(out.textContent).indexOf('先点') >= 0,
      'v2273ui/B8: 无包时复原被拒并指明先做什么（实 ' + j(out && String(out.textContent).slice(0, 60)) + '）');
  }

  // ── C 诊断节读数 ──────────────────────────────────────────────────────
  {
    const env = freshEnv();
    env.WA.rulePack.setSettings({ enabled: false });
    const rep = env.WA.toolDiag.collect();
    a(!!rep.handoffPack, 'v2273ui/C1: toolDiag 包含 handoffPack');
    a(rep.handoffPack.enabled === true, 'v2273ui/C2: handoffPack enabled 为 true');
    a(Array.isArray(rep.handoffPack.missing), 'v2273ui/C3: 缺块列表可读');
    a(rep.handoffPack.missing.length >= 1, 'v2273ui/C4: 出厂态确有缺块（实 ' + rep.handoffPack.missing.length + '）');
    a(rep.handoffPack.missing.every(function (m) { return m.id && m.label && m.why; }),
      'v2273ui/C5: 每条缺块都带 id / label / why');
    a(typeof rep.handoffPack.verdict === 'string', 'v2273ui/C6: 可复原性判决可读');
    a(rep.handoffPack.sources.worldBlueprint === true, 'v2273ui/C7: 四源在位性可读（worldBlueprint）');
    a(rep.handoffPack.sources.rulePack === true, 'v2273ui/C8: 四源在位性可读（rulePack）');
    a(typeof rep.handoffPack.note === 'string' && rep.handoffPack.note.indexOf('缺块不等于没有包') >= 0,
      'v2273ui/C9: note 明说「缺块不等于没有包」');
  }

  // ── D 登记面 ──────────────────────────────────────────────────────────
  const idxHp = I.indexOf("'engines/handoff-pack.js'");
  const idxFr = I.indexOf("'engines/first-run.js'");
  const idxCt = I.indexOf("'engines/capability-tier.js'");
  a(idxHp > idxFr && idxHp < idxCt, 'v2273ui/D1: index.js 中 handoff-pack 在 first-run 之后、tier 之前');
  const runHp = R.indexOf("'engines/handoff-pack.js'");
  const runFr = R.indexOf("'engines/first-run.js'");
  const runCt = R.indexOf("'engines/capability-tier.js'");
  a(runHp > runFr && runHp < runCt, 'v2273ui/D2: run.js LOAD 中同序');
  a(D.indexOf("'wa-hp-enable'") >= 0, 'v2273ui/D3: UI_BINDINGS 登记 wa-hp-enable');
  a(D.indexOf("'wa-hp-pack'") >= 0, 'v2273ui/D4: UI_BINDINGS 登记 wa-hp-pack');
  a(D.indexOf("'wa-hp-restore'") >= 0, 'v2273ui/D5: UI_BINDINGS 登记 wa-hp-restore');

  // ── N 锚点纯度 + 真破坏 + 两向自证 ────────────────────────────────────
  a(cnt(S, N_ANCHOR.saveCall) === 1, 'v2273ui/N1: saveCall 恰 1 次');
  a(cnt(S, N_ANCHOR.packCall) === 1, 'v2273ui/N2: packCall 恰 1 次');
  a(cnt(S, N_ANCHOR.missRows) === 1, 'v2273ui/N3: missRows 恰 1 次');
  a(cnt(D, N_ANCHOR.diagMissing) === 1, 'v2273ui/N4: diagMissing 恰 1 次');

  // N5 破坏「保存钮的真写」⇒ 点了保存但设置没变
  {
    const bad = S.replace(N_ANCHOR.saveCall, 'const r = {}; void ({');
    a(bad !== S, 'v2273ui/N5a: N5 源码破坏成功（锚点命中）');
    const env = freshEnv({ [SET_REL]: bad });
    pageHtml(env, 'settings');
    const dom = env.dom;
    const en = dom.getElementById('wa-hp-enable');
    if (en) en.checked = false;
    const save = dom.getElementById('wa-hp-save');
    if (save && save.onclick) save.onclick();
    a(env.WA.handoffPack.getSettings().enabled === true, 'v2273ui/N5b: 破坏副本上设置未写入（仍 true）');
    const envOk = freshEnv();
    pageHtml(envOk, 'settings');
    const domOk = envOk.dom;
    const enOk = domOk.getElementById('wa-hp-enable');
    if (enOk) enOk.checked = false;
    const saveOk = domOk.getElementById('wa-hp-save');
    if (saveOk && saveOk.onclick) saveOk.onclick();
    a(envOk.WA.handoffPack.getSettings().enabled === false, 'v2273ui/N5c: 原版上保存真的写进去（两向自证成立）');
  }

  // N6 破坏「缺块在界面上渲染」⇒ 界面只剩「齐全」一句话（缺块静默）
  {
    const bad = S.replace(N_ANCHOR.missRows, 'const missRows = false');
    a(bad !== S, 'v2273ui/N6a: N6 源码破坏成功（锚点命中）');
    const env = freshEnv({ [SET_REL]: bad });
    env.WA.rulePack.setSettings({ enabled: false });
    const r = pageHtml(env, 'settings');
    a(r.html.indexOf('empty-blueprint') < 0 && r.html.indexOf('disabled') < 0,
      'v2273ui/N6b: 破坏副本上缺块原因不再渲染');
    const envOk = freshEnv();
    envOk.WA.rulePack.setSettings({ enabled: false });
    const rOk = pageHtml(envOk, 'settings');
    a(rOk.html.indexOf('empty-blueprint') >= 0 || rOk.html.indexOf('disabled') >= 0,
      'v2273ui/N6c: 原版上缺块原因可见（两向自证成立）');
  }

  // N7 破坏诊断节的缺块分列 ⇒ 缺块塌成空表
  {
    const bad = D.replace(N_ANCHOR.diagMissing, 'missing: [],');
    a(bad !== D, 'v2273ui/N7a: N7 源码破坏成功（锚点命中）');
    const env = freshEnv({ [DIAG_REL]: bad });
    env.WA.rulePack.setSettings({ enabled: false });
    const rep = env.WA.toolDiag.collect();
    a(rep.handoffPack.missing.length === 0, 'v2273ui/N7b: 破坏副本上缺块列表塌空');
    const envOk = freshEnv();
    envOk.WA.rulePack.setSettings({ enabled: false });
    a(envOk.WA.toolDiag.collect().handoffPack.missing.length >= 1,
      'v2273ui/N7c: 原版上缺块列表非空（两向自证成立）');
  }

  // N8 负控制全程未改真源码
  a(rd(SET_REL) === S && rd(DIAG_REL) === D && rd(ENG_HP) === rd(ENG_HP),
    'v2273ui/N8: 负控制后真源码逐字未变');

  console.log('══ EXV6-9 接线锁（handoff-pack-ui-v2273）══');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) fails.forEach(function (f) { console.log('  ✗ ' + f); });
  return { pass: pass, fail: fail, fails: fails };
}
module.exports = { runAll: runAll };
if (require.main === module) { runAll(); }