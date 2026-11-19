#!/usr/bin/env node
// WorldAxis tests/opv29-z1-08-v2529.js — V29 优化线 Z1（OPV29-08）专锁
//
// 治的病
//   计划原文：「`action-desk` 拆段：按动作域拆，路由表与拒收码不变」，验收
//   「14 动作全在；拒收码三面差额 0」。拆前 engines/action-desk.js 4123 行，
//   其中第 65–2561 行是**1328 个动作闭包**组成的路由表（966 条键）：一层 if +
//   一句 WA.xxx 转发，本该一眼看全，却被夹在几千行推演代码中间。
//
// 本锁钉住「路由表已出闸、路由一条不少、拒收码面没漂、缺表不许静默退化」：
//   A 现场：引擎瘦身 + 表体量 + 表零具名函数 + 路由键数 + 拒收码声明面 +
//           引擎里已无 ROUTES 字面量 + 取工厂守卫 + 双登记同序 + 两向自证 + 工厂参数齐。
//   B 负控制：只装引擎必抛 · 工厂缺参必抛 · 先表后引擎必成（966 条都在）。
//   C 真跑：三条不同形态的路由真调（本地函数转发 / WA 转发 / 未知前缀拒收）+
//           **拒收码三面差额 0**（逐 966 条真调，吐出的码必须都在声明面里）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  console.log('  ✗ ' + line); return false;
}
const RD = function (rel) {
  return fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8');
};
const lines = function (rel) { return RD(rel).split('\n').length - 1; };
const ENG = 'engines/action-desk.js';
const TAB = 'engines/action-desk-routes.js';
const engSrc = RD(ENG), tabSrc = RD(TAB);

// ── A. 现场 ───────────────────────────────────────────
a(lines(ENG) <= 1700, 'A1 引擎已瘦身（实 ' + lines(ENG) + ' 行 ≤ 1700；拆前 4123）', lines(ENG));
a(lines(TAB) === 2530, 'A2 路由表体量（实 ' + lines(TAB) + ' 行 = 2530）', lines(TAB));
const namedFns = (tabSrc.match(/function\s+[A-Za-z_$]/g) || []).length;
a(namedFns === 0, 'A3 表零具名函数（实 ' + namedFns + ' 个）');
const hCalls = (tabSrc.match(/H\.[A-Za-z_$][\w$]*\(/g) || []).length;
a(hCalls === 19, 'A4 表内 19 处本地函数调用改为 H.*（实 ' + hCalls + '）', hCalls);

// 拒收码声明面（两面：路由表 + 引擎）
function codes(src) {
  const set = new Set();
  (src.match(/refusal: '([^']+)'/g) || []).forEach(function (m) { set.add(m.slice(10, -1)); });
  (src.match(/reason: '([^']+)'/g) || []).forEach(function (m) { set.add(m.slice(9, -1)); });
  return set;
}
const tabCodes = codes(tabSrc), engOnly = codes(engSrc);
const declared = new Set([...tabCodes, ...engOnly]);
a(tabCodes.size === 171, 'A5a 路由表声明的拒收码 171 个（实 ' + tabCodes.size + '）', tabCodes.size);
a(declared.size >= 190 && declared.size <= 210, 'A5b 两面合并的声明码 ' + declared.size + ' 个（须 190–210）');

a(engSrc.indexOf('const ROUTES = {') < 0, 'A6 引擎里已无 ROUTES 字面量');
a(/=\s*WA\.actionDeskRoutes\s*;/.test(engSrc) && /必须先于/.test(engSrc),
  'A7 求值期先取工厂（守卫 + 「必须先于」提示都在场）');

// 双登记同序
const IDX = RD('index.js'), RUN = RD('tests/run.js');
function orderOk(idx, run, tabRel, engRel) {
  const t1 = "'" + tabRel + "'", e1 = "'" + engRel + "'";
  return idx.indexOf(t1) > 0 && idx.indexOf(e1) > idx.indexOf(t1)
    && run.indexOf(t1) > 0 && run.indexOf(e1) > run.indexOf(t1);
}
a(orderOk(IDX, RUN, TAB, ENG), 'A8 两份装载表同序：' + TAB + ' 在 ' + ENG + ' 之前');
const PH = '\u0000TAB\u0000';
const swapped = IDX.split("'" + TAB + "'").join(PH)
  .split("'" + ENG + "'").join("'" + TAB + "'").split(PH).join("'" + ENG + "'");
a(!orderOk(swapped, RUN, TAB, ENG), 'A9 次序判据两向自证：互换位置 ⇒ 判假');

// 工厂参数齐：表里调用的 19 个名字，引擎必须都传
const used = new Set((tabSrc.match(/H\.([A-Za-z_$][\w$]*)\(/g) || []).map(function (m) { return m.slice(2, -1); }));
// 只扫工厂调用那一段（引擎里「一行三个键」的写法，逐行正则拿不全）
const callAt = engSrc.indexOf('const ROUTES = __AR({');
const callEnd = engSrc.indexOf('});', callAt);
const callSrc = (callAt >= 0 && callEnd > callAt) ? engSrc.slice(callAt, callEnd) : '';
const passed = new Set();
(callSrc.match(/([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$]*/g) || []).forEach(function (m) {
  passed.add(m.split(':')[0].trim());
});
const notPassed = [...used].filter(function (k) { return !passed.has(k); });
a(notPassed.length === 0, 'A10 工厂参数齐（表要 ' + used.size + ' 个，引擎缺 ' + notPassed.length + ' 个）', notPassed);

// 关键路由逐字点名（键数抓不到「某一条被改名/顶替」）
const NAMED = ['chapter.open', 'market.transferCargo', 'recycle.enforce', 'actionDesk.preview',
  'research.supply', 'market.settleDefault', 'epistemic.weigh', 'theme.apply'];
const lostKeys = NAMED.filter(function (k) { return tabSrc.indexOf("'" + k + "': function") < 0; });
a(lostKeys.length === 0, 'A11 关键路由逐字点名 8 条全在（缺 ' + lostKeys.length + ' 条）', lostKeys);

// ── B. 负控制（真起隔离装载）─────────────────────────
function load(parts) {
  const ctx = { console: { log: function () {}, warn: function () {}, error: function () {} }, window: {} };
  ctx.window.WorldAxis = { log: function () {}, registerModule: function () {},
    settingsBus: { read: function () { return null; }, normalize: function (_r, d) { return d; } } };
  ctx.global = ctx;
  vm.createContext(ctx);
  parts.forEach(function (p) { vm.runInContext(RD(p), ctx, { filename: p }); });
  return ctx.window.WorldAxis;
}
const r1 = (function () { try { load([ENG]); return { threw: false, msg: '' }; } catch (e) { return { threw: true, msg: String(e.message) }; } })();
a(r1.threw && /路由表未装载/.test(r1.msg), 'B1 只装引擎（不装路由表）⇒ 抛「路由表未装载」', r1.msg);
const r2 = (function () {
  try { load([TAB]); const f = vm.runInNewContext('null'); void f; return { threw: false, msg: '' }; }
  catch (e) { return { threw: true, msg: String(e.message) }; }
})();
a(r2.threw === false, 'B2a 只装表（工厂就位，不抛）');
const WA2 = load([TAB]);
const r3 = (function () {
  try { WA2.actionDeskRoutes({}); return { threw: false, msg: '' }; }
  catch (e) { return { threw: true, msg: String(e.message) }; }
})();
a(r3.threw && /缺少本地函数/.test(r3.msg), 'B2b 工厂缺参（H 空）⇒ 当场抛「缺少本地函数」', r3.msg);
const WA3 = load([TAB, ENG]);
a(!!WA3.actionDesk && typeof WA3.actionDesk.plan === 'function', 'B3 先表后引擎 ⇒ 引擎装载成功');
a(WA3.actionDesk.ROUTES && Object.keys(WA3.actionDesk.ROUTES).length === 966,
  'B3b 966 条路由都在（实 ' + (WA3.actionDesk.ROUTES ? Object.keys(WA3.actionDesk.ROUTES).length : 'null') + '）');

// ── C. 真跑（真宿主装载路径）────────────────────────────
const gate = require('../tests/ui-gate-sync.js');
const W = gate.fresh().WA;
const desk = W.actionDesk;
a(!!desk && Object.keys(desk).length === 17, 'C1 导出面 17 项不变（实 ' + Object.keys(desk).length + '）');

// ① 本地函数转发（路由表调引擎内 chapterOpen）
{
  const r = desk.plan('chapter.open', {});
  a(r && r.ok === true && r.chapter && r.chapter.no === 1,
    'C2 本地函数转发路由真跑（chapter.open ⇒ 第1章）');
}
// ② WA 转发（路由表调外部引擎）
{
  const r = desk.plan('market.transferCargo', {});
  a(r && r.ok === false && r.refusal === 'invalid-cargo-spec',
    'C3 WA 转发路由真跑（market.transferCargo ⇒ 原样带出 owner 的拒收码）', r && r.refusal);
}
// ③ 未知前缀拒收（引擎侧守卫，不是路由表）
{
  const r = desk.plan('world.setEverything', {});
  a(r && r.ok === false && r.reason === 'unknown-action', 'C4 未知前缀拒收（unknown-action）', r && r.reason);
}
// ④ 拒收码三面差额 0：逐 966 条真调，吐出的码必须都在声明面里
{
  const keys = Object.keys(desk.ROUTES);
  const emitted = new Set();
  keys.forEach(function (k) {
    try {
      const r = desk.plan(k, {});
      if (r && (r.reason || r.refusal)) emitted.add(String(r.reason || r.refusal));
    } catch (e) { emitted.add('throw:' + String(e.message)); }
  });
  const und = [...emitted].filter(function (c) { return !declared.has(c); });
  a(und.length === 0, 'C5 拒收码三面差额 0（真吐 ' + emitted.size + ' 种码，未声明 ' + und.length + ' 种）', und.slice(0, 5));
}
// ⑤ 路由数不变 + 计数面随真跑增长
{
  const before = desk.stat().planned;
  desk.plan('actionDesk.preview', { actionId: 'x' });
  a(desk.stat().planned === before + 1, 'C6 stat().planned 随真跑 +1（记账面仍在引擎侧）');
}

console.log('OPV29-Z1-08-V2529: ' + (fail === 0 ? 'pass (' + pass + ')' : 'FAIL ' + fail + '/' + (pass + fail)));
process.exit(fail === 0 ? 0 : 1);