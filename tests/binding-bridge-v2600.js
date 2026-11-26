#!/usr/bin/env node
// WorldAxis tests/binding-bridge-v2600.js — 配置绑定遮蔽表专锁（v2.600.0 / R275 BND-1）
//
// 锁的是「我明明在角色层改了，为什么没生效」这句话今天能不能被解释。
// binding.js 有三级绑定与 `read().from`，但零产品读者 —— 遮蔽关系从未被任何读数说出来。
//
// 四组：
//   A 静态：真调 binding.list / **只报键名不报值** / 零写 / 优先级取自引擎 SCOPES /
//      装载与面板同批登记。
//   B 行为：自造三层（含一个三层同键、一个只在字符层、一个只在默认层）—— 计数 / 遮蔽点名 /
//      单键视图三种形态 / 开关关着时“被遮”不算数 / scope-drift / 四个不可用态。
//   C 现场：真渲染 / 段内 0 写口无按钮 / 零写实测 / stat 计数。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function esc(s) { return String(s == null ? '' : s); }
function render(WA) {
  WA.panelToolsPage.bind({
    esc: esc,
    foldSec: function (p, sec, label, body) { return '[' + label + ']' + ((typeof body === 'function') ? body() : body); }
  });
  return String(WA.panelToolsPage.renderTools() || '');
}

const SECRET = 'SECRET-VALUE-MUST-NOT-LEAK';
const THREE = { chat: ['rule.a', 'style.x'], char: ['rule.a', 'persona.p'], default: ['rule.a', 'tone.t'] };

/** 把 WA.binding 换成一个只实现 list / SCOPES / getSettings 的壳（不碰 store）。 */
function stubBinding(WA, table, opts) {
  const prev = WA.binding;
  const o = opts || {};
  WA.binding = {
    SCOPES: o.scopes || ['chat', 'char', 'default'],
    getSettings: function () { return { enabled: o.enabled !== false, maxKeys: 200 }; },
    list: function (scope) {
      const ks = (table && table[scope]) || [];
      return ks.map(function (k) { return { scope: scope, key: k, value: SECRET }; });
    }
  };
  return function () { WA.binding = prev; };
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const B = WA.bindingBridge;
  a(!!B, 'A0b: WA.bindingBridge 在位');
  a(!!WA.binding, 'A0c: 被读方 WA.binding 在位');
  if (!B) return { exports: 0 };
  if (typeof B.__reset === 'function') B.__reset();

  // ── A 静态 ────────────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'engines/binding-bridge.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  a(B.version === '2.600.0', 'A1: 版本 2.600.0（实 ' + B.version + '）');
  const EX = Object.keys(B).sort().join(',');
  a(EX === 'ORDER,WHY,__reset,audit,diagnose,layers,lineOf,shadow,stat,summaryText,version,view,whyText',
    'A2: 恰好十三导出（实 ' + EX + '）');
  a(code.indexOf('B.list(') >= 0, 'A3: 逐层读法真调 binding.list');
  a(code.indexOf('transact(') < 0 && code.indexOf('setItem(') < 0 && code.indexOf('.patch(') < 0
    && code.indexOf('bind(') < 0 && code.indexOf('unbind(') < 0 && code.indexOf('setSettings') < 0,
    'A4: 源码 0 处写口（不 bind / 不 unbind / 不 transact）');
  a(!/value\s*:/.test(code) && code.indexOf('.value') < 0,
    'A5: 没有一处读或输出 value（只报键名，不报值）');
  a(code.indexOf('B.SCOPES.join') >= 0, 'A6: 三层顺序取自引擎 SCOPES（不自带一份）');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const REL = "'engines/binding-bridge.js'";
  a(idxSrc.split(REL).length - 1 === 1, 'A7: index.js 装载表里恰好一条');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf("'engines/binding.js'"), 'A7b: 排在 binding 之后');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf('const LAZY_ORDER'), 'A7c: 登记在惰性档');
  a(runSrc.split(REL).length - 1 === 1, 'A8: tests/run.js 的 LOAD 面恰好一条');
  a(runSrc.split('./binding-bridge-v2600.js').length - 1 === 1, 'A8b: run.js 里挂了一次本专锁');
  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  a(toolsSrc.indexOf("'bindings'") >= 0, 'A9: 工具页有 bindings 段');
  const segStart = toolsSrc.indexOf("foldSec('tools', 'bindings'");
  const segEnd = toolsSrc.indexOf("foldSec('tools', 'refine'", segStart);
  const seg = toolsSrc.slice(segStart, segEnd > segStart ? segEnd : segStart + 4000);
  a(seg.indexOf('bb2.audit(') >= 0 && seg.indexOf('bb2.summaryText(') >= 0, 'A9b: 段内真委托 audit + summaryText');
  const foldSrc = fs.readFileSync(path.join(ROOT, 'ui/panel-fold.js'), 'utf8');
  a(foldSrc.indexOf("id: 'bindings'") >= 0, 'A9d: 面板折叠表**同批登记**');

  // ── B 行为 ────────────────────────────────────
  let un = stubBinding(WA, THREE);
  try {
    const L = B.layers();
    a(L.ok === true && L.total === 6, 'B1: 三层共 6 条（实 ' + L.total + '）');
    a(L.rows.map(function (r) { return r.scope + ':' + r.count; }).join(' ') === 'chat:2 char:2 default:2',
      'B1b: 逐层计数 chat:2 char:2 default:2');
    const S = B.shadow();
    a(S.keys === 4, 'B2: 键集并集 4 个（实 ' + S.keys + '）');
    a(S.shadowed === 1, 'B2b: 被遮的只有 1 个（rule.a）（实 ' + S.shadowed + '）');
    const r0 = S.rows[0];
    a(r0 && r0.key === 'rule.a' && r0.winner === 'chat' && r0.hidden.join(',') === 'char,default',
      'B2c: winner=chat、被遮 char/default（实 ' + JSON.stringify(r0) + '）');
    const A1 = B.audit({});
    a(A1.why === 'ok' && A1.verdict.counts === 'chat:2 char:2 default:2', 'B3: 体检 ok 且逐层计数齐');
    a(B.lineOf(A1).indexOf('被遮住的 1 键') > 0, 'B4: 读数报“被遮住的 1 键”');
    a(B.lineOf(A1).indexOf('rule.a') > 0, 'B4b: 并点名是哪个键');
    a(B.lineOf(A1).indexOf('改了不会生效') > 0, 'B4c: 把后果写明（这正是“我明明改了”的由来）');
    const js = JSON.stringify(A1) + JSON.stringify(B.shadow()) + JSON.stringify(B.layers());
    a(js.indexOf(SECRET) < 0, 'B5: 值一个都没泄漏（三层都塞了同一个秘密值）');
    const v1 = B.view('rule.a');
    a(v1.why === 'shadowed' && v1.line.indexOf('生效的是 chat 层') > 0, 'B6: 单键视图说清谁生效');
    const v2 = B.view('style.x');
    a(v2.why === 'single' && v2.line.indexOf('没有遮蔽') > 0, 'B6b: 单层键说清没有遮蔽');
    a(B.view('nope').why === 'unknown-key', 'B6c: 不存在的键不编一行');
    a(B.view('').why === 'unknown-key', 'B6d: 空键名也不编');
  } finally { un(); }

  un = stubBinding(WA, THREE, { enabled: false });
  try {
    const A2 = B.audit({});
    a(A2.verdict.enabled === false, 'B7: 开关关着时 enabled=false');
    a(B.lineOf(A2).indexOf('分层优先级不生效') > 0, 'B7b: 读数写明此时“被遮”不算数');
    const S2 = B.shadow();
    a(S2.rows.length === 1 && S2.rows[0].effective === false, 'B7c: 遮蔽行仍列出但标 effective=false');
  } finally { un(); }

  un = stubBinding(WA, { chat: [], char: [], default: [] });
  try {
    const A3 = B.audit({});
    a(A3.why === 'empty' && A3.verdict.total === 0, 'B8: 三层全空 ⇒ empty（实 ' + A3.why + '）');
    a(B.lineOf(A3).indexOf('真的没有') > 0, 'B8b: 读数把“真的没有”与“读不到”分开');
  } finally { un(); }

  un = stubBinding(WA, THREE, { scopes: ['char', 'chat', 'default'] });
  try {
    const A4 = B.audit({});
    a(A4.why === 'scope-drift', 'B9: 三层顺序与 read 走向不一致 ⇒ scope-drift（实 ' + A4.why + '）');
    a(B.lineOf(A4).indexOf('同一件事两套顺序') > 0, 'B9b: 读数说清为何不硬算');
  } finally { un(); }

  const prevStore = WA.store.get;
  try {
    WA.store.get = function () { return null; };
    a(B.audit({}).why === 'no-store', 'B10: store 读不到 ⇒ no-store');
  } finally { WA.store.get = prevStore; }

  const prevB = WA.binding;
  try {
    WA.binding = null;
    a(B.audit({}).why === 'module-missing', 'B11: binding 不在 ⇒ module-missing');
    a(B.lineOf(B.audit({})).indexOf('不可用') > 0, 'B11b: 读数如实说不可用');
  } finally { WA.binding = prevB; }

  a(B.whyText('scope-drift').indexOf('顺序') > 0, 'B12: whyText 认得 scope-drift');
  a(B.whyText('zzz').indexOf('未登记') === 0, 'B12b: 表外 why 不编一个说法');

  un = stubBinding(WA, THREE);
  try {
    const dg = B.diagnose({});
    a(dg.lines.length === 1 + 3 + 1, 'B13: 诊断 = 读数 1 + 三层 3 + 遮蔽 1（实 ' + dg.lines.length + '）');
    a(dg.lines[4].indexOf('遮蔽 rule.a') === 0 || dg.lines[4].indexOf('· 遮蔽 rule.a') === 0, 'B13b: 遮蔽行带键名');
  } finally { un(); }

  // ── C 现场 ────────────────────────────────────
  un = stubBinding(WA, THREE);
  let html = '';
  try {
    B.__reset();
    html = render(WA);
    a(html.indexOf('wa-bnd-line') > 0, 'C0: 段内读数容器在真渲染里出现');
    a(html.indexOf('被遮住') > 0, 'C0b: 真渲染里看得到遮蔽计数');
    a((html.match(/id="wa-bnd-line"/g) || []).length === 1, 'C2: wa-bnd-line 全页只一次');
    a(html.indexOf('只报键名') > 0, 'C0c: 段内自己写明只报键名');
    const bi = html.indexOf('配置绑定');
    const be = html.indexOf('本面只量', bi);
    const btn = html.indexOf('<button', bi);
    a(be > bi, 'C0d: 段有收尾声明（用它当段边界）');
    a(be > bi && (btn < 0 || btn > be), 'C3: 段内没有按钮');
  } finally { un(); }

  const toolsSrc2 = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const s2i = toolsSrc2.indexOf("foldSec('tools', 'bindings'");
  const s2e = toolsSrc2.indexOf("foldSec('tools', 'refine'", s2i);
  const segSrc = toolsSrc2.slice(s2i, s2e > s2i ? s2e : s2i + 4000);
  a(segSrc.indexOf('transact(') < 0 && segSrc.indexOf('setItem(') < 0 && segSrc.indexOf('.patch(') < 0,
    'C1: 段内 0 写口');
  a(segSrc.indexOf('.bind(') < 0 && segSrc.indexOf('.unbind(') < 0, 'C1b: 段内不调 bind/unbind');

  const st = B.stat();
  a(st.audits > 0, 'C4: 本面账记到跑过（audits ' + st.audits + '）');
  a(st.last && typeof st.last.why === 'string', 'C4b: 末次体检记下了 why');
  B.__reset();
  a(B.stat().audits === 0 && B.stat().shadows === 0, 'C5: __reset 清本面计数');
  a(B.ORDER.join(',') === 'chat,char,default', 'C6: ORDER 是拷贝且顺序正确');

  return { exports: Object.keys(B).length, shadowed: 1 };
}

module.exports = { runAll: runAll };
