#!/usr/bin/env node
// WorldAxis tests/purify-scope-bridge-v2602.js — 净化保护配对表专锁（v2.602.0 / R277 PSC-1）
//
// 锁的是：「状态栏为什么忽然不见了」这句话今天能不能被解释，以及三类「什么都没发生」
// 能不能被分开：从来没跑过 / 跑了但每次无块可保 / 保了没还原。
//
// 三组：
//   A 静态：十五导出 / why 四值 / verdict 八值 / 0 写口 / 不调 protect·restore·applyWith /
//      kinds 现读 / 装载与面板同批登记 / 段内真委托。
//   B 行为：五态逐态造样本（never-run / no-protect / unpaired / broken / ok）/
//      cap 静默截断这条结构事实 / residue 纯函数 / 零跑零写实测。
//   C 现场：真渲染 / 段内 0 写口无按钮 / 五态说明真画出来。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const BASE_STAT = { protects: 0, restored: 0, blocks: 0, charsKept: 0, blocked: 0, lastReason: '', faults: {} };

/** 把 purifyScope 换成本地壳；返回还原函数。 */
function stub(WA, o) {
  const cfg = o || {};
  const prev = { p: WA.purifyScope, s: WA.settingsBus, regs: WA.__settingsRegs };
  const st = Object.assign({}, BASE_STAT, cfg.stat || {});
  if (cfg.stat && cfg.stat.faults) st.faults = Object.assign({}, cfg.stat.faults);
  const pset = Object.assign({ enabled: true, maxBlocks: 64 }, cfg.pset || {});
  const fired = { protect: 0, restore: 0, applyWith: 0, setSettings: 0 };

  if (cfg.withBus === false) { WA.settingsBus = null; }
  else {
    WA.settingsBus = {
      read: function (reg) { return reg && reg.module === 'purifyScope' ? Object.assign({}, pset) : {}; },
      normalize: function (reg, v) { return Object.assign({}, v); },
      save: function () { throw new Error('PSC-1 专锁：体检不该写盘'); },
      saveOrThrow: function () { throw new Error('PSC-1 专锁：体检不该写盘'); }
    };
  }
  WA.__settingsRegs = [{ key: 'worldaxis_purifyscope_settings_v1', def: { enabled: true, maxBlocks: 64 },
    module: 'purifyScope', bounds: { maxBlocks: [1, 256] } }];

  if (cfg.withEngine === false) { WA.purifyScope = null; }
  else {
    WA.purifyScope = {
      getSettings: function () { return Object.assign({}, pset); },
      setSettings: function () { fired.setSettings++; return { ok: true }; },
      protect: function () { fired.protect++; throw new Error('PSC-1 专锁：体检不该调 protect'); },
      restore: function () { fired.restore++; throw new Error('PSC-1 专锁：体检不该调 restore'); },
      applyWith: function () { fired.applyWith++; throw new Error('PSC-1 专锁：体检不该调 applyWith'); },
      kinds: function () { return (cfg.kinds || ['fence', 'comment', 'angle']).slice(); },
      stat: function () { return Object.assign({}, st, { faults: Object.assign({}, st.faults) }); }
    };
  }
  return { fired: fired, restore: function () { WA.purifyScope = prev.p; WA.settingsBus = prev.s; WA.__settingsRegs = prev.regs; } };
}

function esc(s) { return String(s == null ? '' : s); }
function render(WA) {
  WA.panelToolsPage.bind({
    esc: esc,
    foldSec: function (p, sec, label, body) { return '[' + label + ']' + ((typeof body === 'function') ? body() : body); }
  });
  return String(WA.panelToolsPage.renderTools() || '');
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const B = WA.purifyScopeBridge;
  a(!!B, 'A0b: WA.purifyScopeBridge 在位');
  a(!!WA.purifyScope, 'A0c: 被读方 WA.purifyScope 在位');
  if (!B) return { exports: 0 };
  if (typeof B.__reset === 'function') B.__reset();

  // ── A 静态 ────────────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'engines/purify-scope-bridge.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  a(B.version === '2.602.0', 'A1: 版本 2.602.0（实 ' + B.version + '）');
  const EX = Object.keys(B).sort().join(',');
  a(EX === 'EXPECT,VERDICT,WHY,__reset,audit,budget,diagnose,faults,kinds,lineOf,pairing,residue,stat,summaryText,version',
    'A2: 恰好十五导出（实 ' + EX + '）');
  a(B.WHY.join(',') === 'ok,module-missing,no-settings,drift', 'A3: why 四值（实 ' + B.WHY.join(',') + '）');
  a(B.VERDICT.length === 8 && B.VERDICT[0] === 'module-missing' && B.VERDICT[7] === 'ok',
    'A4: verdict 八值且两端在（实 ' + B.VERDICT.length + '）');
  a(B.EXPECT.join(',') === 'fence,comment,angle', 'A5: 三类图案的顺序也是判据（实 ' + B.EXPECT.join('/') + '）');
  a(code.indexOf('setSettings') < 0 && code.indexOf('saveOrThrow') < 0 && code.indexOf('save(') < 0
    && code.indexOf('transact(') < 0 && code.indexOf('setItem(') < 0, 'A6: 源码 0 处写口');
  a(code.indexOf('.protect(') < 0 && code.indexOf('.restore(') < 0 && code.indexOf('.applyWith(') < 0,
    'A7: 源码不调 protect / restore / applyWith（它们会改 stat 的六个计数）');
  a(code.indexOf('.kinds(') >= 0, 'A8: 图案现读 P.kinds()（不自带副本）');
  a(code.indexOf('__settingsRegs') >= 0, 'A8b: 登记项取自自注册清单（不硬编码 LS key）');
  a(code.indexOf('MA-PS-') >= 0 || code.indexOf('MARK_HEAD') >= 0, 'A8c: 残留判定用引擎同一份占位符前缀');

  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const REL = "'engines/purify-scope-bridge.js'";
  a(idxSrc.split(REL).length - 1 === 1, 'A9: index.js 装载表里恰好一条');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf("'engines/purify-scope.js'"), 'A9b: 排在 purify-scope 之后');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf('const LAZY_ORDER'), 'A9c: 登记在惰性档');
  a(runSrc.split(REL).length - 1 === 1, 'A10: tests/run.js 的 LOAD 面恰好一条');
  a(runSrc.split("'./purify-scope-bridge-v2602.js'").length - 1 === 1, 'A10b: run.js 里挂了一次本专锁');
  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const segStart = toolsSrc.indexOf("foldSec('tools', 'purifyscope'");
  a(segStart > 0, 'A11: 工具页有 purifyscope 段');
  const segEnd = toolsSrc.indexOf("foldSec('tools', 'refine'", segStart);
  const seg = toolsSrc.slice(segStart, segEnd > segStart ? segEnd : segStart + 4000);
  a(seg.indexOf('psc.audit(') >= 0 && seg.indexOf('psc.summaryText(') >= 0 && seg.indexOf('psc.lineOf(') >= 0,
    'A11b: 段内真委托 audit + summaryText + lineOf');
  const foldSrc = fs.readFileSync(path.join(ROOT, 'ui/panel-fold.js'), 'utf8');
  a(foldSrc.indexOf("id: 'purifyscope'") >= 0, 'A12: 面板折叠表**同批登记**');
  const diagSrc = fs.readFileSync(path.join(ROOT, 'engines/tool-diag-tables.js'), 'utf8');
  a(diagSrc.indexOf("'engines/purify-scope-bridge.js': 'purifyScopeBridge'") >= 0, 'A13: tool-diag 登记了');

  // ── B 行为：五态逐态 ────────────────────────
  let st = stub(WA, {});
  try {
    const K = B.kinds();
    a(K.ok === true && K.list.join(',') === 'fence,comment,angle', 'B1: 三类图案原样报出');
    const BG = B.budget();
    a(BG.enabled === true && BG.maxBlocks === 64, 'B2: 开关与 cap 原样报出');
    a(BG.bound.join(',') === '1,256', 'B2b: 边界取自引擎登记项（不从本表旁听）');
    a(BG.capSilent.indexOf('不会报错') > 0 && BG.capSilent.indexOf('不说') > 0, 'B2c: cap 静默截断这条结构事实写出来了');
    const A0 = B.audit({});
    a(A0.verdict === 'never-run', 'B3: 零计数 ⇒ never-run（实 ' + A0.verdict + '）');
    a(A0.line.indexOf('全文级') > 0 && A0.line.indexOf('状态栏') > 0, 'B3b: 读数把后果说清（全文级 / 状态栏）');
    a(A0.ok === false, 'B3c: never-run 不是 ok —— 它是「没保护」，不是「保护得很好」');
    a(A0.neverRun === true, 'B3d: neverRun 标记为真');
  } finally { st.restore(); }

  st = stub(WA, { stat: { protects: 5, restored: 5, blocks: 0, charsKept: 0 } });
  try {
    const A1 = B.audit({});
    a(A1.verdict === 'no-protect', 'B4: 跑过但无块可保 ⇒ no-protect（实 ' + A1.verdict + '）');
    a(A1.line.indexOf('对不上') > 0, 'B4b: 读数把「图案与正文形态对不上」这条说出来');
  } finally { st.restore(); }

  st = stub(WA, { stat: { protects: 5, restored: 3, blocks: 12, charsKept: 800 } });
  try {
    const A2 = B.audit({});
    a(A2.verdict === 'unpaired', 'B5: 保 5 还 3 ⇒ unpaired（实 ' + A2.verdict + '）');
    a(A2.pairing.gap === 2, 'B5b: 差值是 2（实 ' + A2.pairing.gap + '）');
    a(A2.line.indexOf('回不来') > 0, 'B5c: 读数用「回不来」这个词');
  } finally { st.restore(); }

  st = stub(WA, { stat: { protects: 5, restored: 5, blocks: 12, charsKept: 800, faults: { 'not-found': 1 } } });
  try {
    const A3 = B.audit({});
    a(A3.verdict === 'broken', 'B6: 有 not-found 故障 ⇒ broken 优先于 ok（实 ' + A3.verdict + '）');
    a(A3.lost === 1, 'B6b: 故障次数原样报出（实 ' + A3.lost + '）');
    // 该分支的读数**以「实锤」开头**（位置 0）—— 用 >= 0，别用 > 0。
    a(A3.line.indexOf('实锤') >= 0, 'B6c: 读数说「实锤」而不是「可能」');
  } finally { st.restore(); }

  st = stub(WA, { stat: { protects: 5, restored: 5, blocks: 12, charsKept: 800 } });
  try {
    const A4 = B.audit({});
    a(A4.verdict === 'ok' && A4.ok === true, 'B7: 配对且无故障 ⇒ ok（实 ' + A4.verdict + '）');
    a(A4.line.indexOf('12 块') > 0, 'B7b: 读数报出共保几块');
  } finally { st.restore(); }

  // B8：图案漂移
  st = stub(WA, { kinds: ['fence', 'comment'] });
  try {
    const A5 = B.audit({});
    a(A5.verdict === 'drift' && A5.drift.join(',') === 'missing:angle', 'B8: 少了 angle ⇒ drift 且点名（实 ' + A5.drift.join('/') + '）');
    a(B.lineOf(A5).indexOf('拒绝硬算') > 0, 'B8b: 读数说清为何不硬算');
  } finally { st.restore(); }
  st = stub(WA, { kinds: ['fence', 'comment', 'angle', 'xml'] });
  try {
    const A6 = B.audit({});
    a(A6.drift.join(',') === 'extra:xml', 'B8c: 多了 xml ⇒ drift 且点名（实 ' + A6.drift.join('/') + '）');
  } finally { st.restore(); }
  st = stub(WA, { kinds: ['comment', 'fence', 'angle'] });
  try {
    const A7 = B.audit({});
    a(A7.verdict === 'drift' && A7.drift[0].indexOf('order:') === 0, 'B8d: 顺序变了也报 drift（顺序是判据一部分）');
  } finally { st.restore(); }

  // B9：两个装载缺失态
  st = stub(WA, { withEngine: false });
  try {
    a(B.audit({}).why === 'module-missing', 'B9: 引擎不在 ⇒ module-missing');
    a(B.lineOf(B.audit({})).indexOf('配对无从判断') > 0, 'B9b: 读数如实说无从判断');
  } finally { st.restore(); }
  st = stub(WA, { withBus: false });
  try {
    const A8 = B.audit({});
    a(A8.why === 'no-settings' && A8.verdict === 'no-settings', 'B10: settingsBus 不在 ⇒ no-settings');
    a(B.lineOf(A8).indexOf('不是“关着”') > 0, 'B10b: 读数把「测不出」与「关着」分开');
  } finally { st.restore(); }

  // B11：residue 纯函数
  st = stub(WA, {});
  try {
    const mk = String.fromCharCode(1) + 'WA-PS-';
    a(B.residue('hello').n === 0, 'B11: 干净文本残留 0');
    a(B.residue('前' + mk + '0-PS-WA' + String.fromCharCode(1) + '后').n === 1, 'B11b: 一个占位符计 1');
    a(B.residue(mk + '1' + mk + '2').n === 2, 'B11c: 两个计 2');
    a(B.residue('').n === 0 && B.residue(null).n === 0, 'B11d: 空/非字符串不炸（计 0）');
    const r = B.residue('秘密正文' + mk + '0');
    a(JSON.stringify(r).indexOf('秘密') < 0, 'B11e: 不回显正文（只报个数）');
  } finally { st.restore(); }

  // B12：零跑零写实测
  st = stub(WA, { stat: { protects: 2, restored: 1, blocks: 4, charsKept: 100, faults: { 'not-found': 1 } } });
  try {
    const before = JSON.stringify(WA.purifyScope.stat());
    const h = B.audit({});
    B.kinds(); B.budget(); B.pairing(); B.faults(); B.residue('x'); B.diagnose({}); B.summaryText(h); B.lineOf(h);
    const after = JSON.stringify(WA.purifyScope.stat());
    a(before === after, 'B12: 零跑 —— 调用前后 purifyScope.stat() 逐字相等（含 faults 字典）');
    a(st.fired.protect === 0 && st.fired.restore === 0 && st.fired.applyWith === 0,
      'B12b: protect / restore / applyWith 全 0（探针计数）');
    a(st.fired.setSettings === 0, 'B12c: 零写 —— setSettings 探针 0');
  } finally { st.restore(); }

  // B13：本面账
  st = stub(WA, {});
  try {
    B.__reset();
    B.audit({}); B.audit({});
    const s1 = B.stat();
    a(s1.audits === 2, 'B13: 本面账记到跑过两次（实 ' + s1.audits + '）');
    a(s1.last && s1.last.verdict === 'never-run', 'B13b: 末次体检记下了 verdict');
    B.__reset();
    a(B.stat().audits === 0 && B.stat().last.verdict === '', 'B14: __reset 清本面计数');
  } finally { st.restore(); }

  // B15：诊断单
  st = stub(WA, { stat: { protects: 1, restored: 1, blocks: 2, charsKept: 30 } });
  try {
    const dg = B.diagnose({});
    a(dg.counts.kinds === 3, 'B15: 诊断报三类图案（实 ' + dg.counts.kinds + '）');
    a(dg.counts.faults === 0, 'B15b: 未跑过的现场失败码 0 类');
    a(dg.budget.maxBlocks === 64, 'B15c: 诊断带上预算面');
  } finally { st.restore(); }

  // ── C 现场 ────────────────────────────────────
  st = stub(WA, {});
  let html = '';
  try {
    B.__reset();
    html = render(WA);
    a(html.indexOf('wa-psc-line') > 0, 'C0: 段内读数容器在真渲染里出现');
    a((html.match(/id="wa-psc-line"/g) || []).length === 1, 'C0b: wa-psc-line 全页只一次');
    a(html.indexOf('保护 / 还原') > 0, 'C0c: 配对四数真画出来了');
    a(html.indexOf('受保护面图案') > 0, 'C0d: 图案行真画出来了');
    const bi = html.indexOf('净化保护配对');
    const be = html.indexOf('本面只量', bi);
    const btn = html.indexOf('<button', bi);
    a(be > bi, 'C1: 段有收尾声明（用它当段边界）');
    a(be > bi && (btn < 0 || btn > be), 'C2: 段内没有按钮');
    a(html.indexOf('不回显正文') > 0, 'C3: 段内自己写明不回显正文');
  } finally { st.restore(); }

  const toolsSrc2 = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const s2i = toolsSrc2.indexOf("foldSec('tools', 'purifyscope'");
  const s2e = toolsSrc2.indexOf("foldSec('tools', 'refine'", s2i);
  const segSrc = toolsSrc2.slice(s2i, s2e > s2i ? s2e : s2i + 4000);
  a(segSrc.indexOf('.setSettings(') < 0 && segSrc.indexOf('transact(') < 0
    && segSrc.indexOf('setItem(') < 0, 'C4: 段内 0 写口');
  a(segSrc.indexOf('.protect(') < 0 && segSrc.indexOf('.applyWith(') < 0, 'C4b: 段内不调 protect / applyWith');
  a(segSrc.indexOf('__pscEnsureFail') >= 0, 'C5: 段内有装载失败记忆');

  const st2 = B.stat();
  a(st2.audits > 0, 'C6: 本面账记到真渲染跑过（audits ' + st2.audits + '）');

  return { exports: Object.keys(B).length, verdicts: B.VERDICT.length };
}

module.exports = { runAll: runAll };
