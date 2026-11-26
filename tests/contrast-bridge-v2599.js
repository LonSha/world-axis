#!/usr/bin/env node
// WorldAxis tests/contrast-bridge-v2599.js — 配色可读性体检面专锁（v2.599.0 / R274 CNT-1）
//
// 锁的是「这行字在它自己的底色上读不读得出来」这件事**今天能不能回答**。
// 两个事实让本锁值得存在：
//   ① `engines/contrast.js` 有 WCAG 公式却零产品读者；
//   ② `grep -rn getComputedStyle` 全仓 **0 命中** —— 配色从未按“实际渲染成什么色”验证过。
//
// 四组：
//   A 静态：真委托 contrast.contrast / checkOn（不自算 WCAG）/ 阈值取自 MIN_RATIO（不写死 4.5）/
//     不内置 hex 兜底 / 零写 / 装载与面板同批登记。
//   B 行为：stub 一份计算样式 —— 16 对逐对与 contrast 一致 / 低对比被抓 / 阈值跟引擎 /
//     rgba 认不出时单列 unparsed 且 pass=null（既不假绿也不假红）/ 三张画布 12 行。
//   C 缺件：module-missing / no-dom / no-css / no-var，且 no-var 时必须写明“不内置兜底色”。
//   D 现场：真渲染 / 段内 0 写口无按钮无输入框 / 零写实测 / stat 计数。
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

/** 一份“生效配色”：正文色亮、disabled 色暗（后者必然低对比）。 */
const CSS = {
  '--wa-text-primary': '#ececf1',
  '--wa-text-secondary': '#a8b2c1',
  '--wa-text-tertiary': '#7c8798',
  '--wa-text-disabled': '#3a4150',
  '--wa-bg-void': '#0a0e1a',
  '--wa-bg-layer1': '#0f1419',
  '--wa-bg-layer2': '#151b24',
  '--wa-bg-layer3': '#1a212e'
};

function stubCss(WA, map, mode) {
  const prevWin = WA.mainWin, prevDoc = WA.mainDoc;
  const win = {};
  win.getComputedStyle = function () {
    if (mode === 'throw') throw new Error('css boom');
    return { getPropertyValue: function (n) { return (map && Object.prototype.hasOwnProperty.call(map, n)) ? map[n] : ''; } };
  };
  if (mode !== 'no-dom') { WA.mainWin = win; WA.mainDoc = { documentElement: {} }; }
  else { WA.mainWin = {}; WA.mainDoc = {}; }
  return function () { WA.mainWin = prevWin; WA.mainDoc = prevDoc; };
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const B = WA.contrastBridge;
  a(!!B, 'A0b: WA.contrastBridge 在位（惰性档：本锁由 run.js 的 LOAD 面保证已装）');
  a(!!WA.contrast, 'A0c: 被委托方 WA.contrast 在位（全部比值的真源）');
  if (!B) return { exports: 0 };
  if (typeof B.__reset === 'function') B.__reset();

  // ── A 静态契约 ───────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'engines/contrast-bridge.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  a(B.version === '2.599.0', 'A1: 版本 2.599.0（实 ' + B.version + '）');
  const EX = Object.keys(B).sort().join(',');
  a(EX === 'BG_VARS,TEXT_VARS,WHY,__reset,audit,canvases,diagnose,lineOf,matrix,palette,readVar,stat,summaryText,version,whyText',
    'A2: 恰好十五导出（实 ' + EX + '）');
  a(code.indexOf('C.contrast(') >= 0 && code.indexOf('C.checkOn(') >= 0,
    'A3: 比值真委托 contrast.contrast 与 checkOn');
  a(code.indexOf('0.2126') < 0 && code.indexOf('0.03928') < 0 && code.indexOf('Math.pow') < 0,
    'A4: 源码没有 WCAG 公式痕迹（不自算一份）');
  a(code.indexOf('C.MIN_RATIO') >= 0 && !/4\.5/.test(code),
    'A5: 阈值取自 contrast.MIN_RATIO，源码里没有写死的 4.5');
  a(code.indexOf('transact(') < 0 && code.indexOf('setItem(') < 0 && code.indexOf('.patch(') < 0
    && code.indexOf('style.') < 0, 'A6: 源码 0 处写口（连 style 都不碰）');
  a(!/#[0-9a-f]{6}/i.test(code), 'A7: 源码里没有任何 hex 色值兜底（读不到就是读不到）');
  a(code.indexOf('getComputedStyle(') >= 0, 'A8: 走运行时计算样式（不是读源码字面量）');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const REL = "'engines/contrast-bridge.js'";
  a(idxSrc.split(REL).length - 1 === 1, 'A9: index.js 装载表里恰好一条');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf("'engines/contrast.js'"), 'A9b: 排在 contrast 之后（被委托方先装）');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf('const LAZY_ORDER'), 'A9c: 登记在惰性档');
  a(runSrc.split(REL).length - 1 === 1, 'A10: tests/run.js 的 LOAD 面恰好一条');
  a(runSrc.split('./contrast-bridge-v2599.js').length - 1 === 1, 'A10b: run.js 里挂了一次本专锁');
  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  a(toolsSrc.indexOf("'contrast'") >= 0, 'A11: 工具页有 contrast 段');
  const segStart = toolsSrc.indexOf("foldSec('tools', 'contrast'");
  const segEnd = toolsSrc.indexOf("foldSec('tools', 'refine'", segStart);
  const seg = toolsSrc.slice(segStart, segEnd > segStart ? segEnd : segStart + 4000);
  a(seg.indexOf('cb.audit(') >= 0 && seg.indexOf('cb.summaryText(') >= 0, 'A11b: 段内真委托 audit + summaryText');
  a(seg.indexOf('装载失败') >= 0 && seg.indexOf('装载中') >= 0, 'A11c: 三档各自写明');
  const foldSrc = fs.readFileSync(path.join(ROOT, 'ui/panel-fold.js'), 'utf8');
  a(foldSrc.indexOf("id: 'contrast'") >= 0, 'A11d: 面板折叠表**同批登记**');
  const diagSrc = fs.readFileSync(path.join(ROOT, 'engines/tool-diag-tables.js'), 'utf8');
  a(diagSrc.indexOf("'engines/contrast-bridge.js': 'contrastBridge'") >= 0, 'A12: tool-diag 表已登记');

  // ── B 行为 ───────────────────────────────────
  const C = WA.contrast;
  let un = stubCss(WA, CSS);
  try {
    const p = B.palette();
    a(p.ok === true && p.why === 'ok', 'B0: 八个变量全读得到（实 ' + p.why + '）');
    a(p.texts.length === 4 && p.bgs.length === 4, 'B0b: 4 字色 + 4 底色');
    const m = B.matrix();
    a(m.ok === true && m.pairs === 16, 'B1: 16 对（实 ' + m.pairs + '）');
    a(m.minRatio === C.MIN_RATIO, 'B1b: 阈值 === contrast.MIN_RATIO（实 ' + m.minRatio + '）');
    const r0 = m.rows.filter(function (r) { return r.text === '--wa-text-primary' && r.bg === '--wa-bg-void'; })[0];
    const want = Math.round(C.contrast(CSS['--wa-text-primary'], CSS['--wa-bg-void']) * 100) / 100;
    a(r0 && r0.ratio === want && r0.pass === true, 'B2: 正文色/最深底色逐字与 contrast 一致（' + want + '）');
    const bad = m.rows.filter(function (r) { return r.pass === false; });
    a(bad.length > 0, 'B3: disabled 色（#3a4150）被抓成不达标（' + bad.length + ' 对）');
    a(m.fail === bad.length, 'B3b: fail 计数与 pass=false 的行数一致（' + m.fail + '）');
    a(m.worst && m.worst.ratio === Math.min.apply(null, m.rows.filter(function (r) { return r.pass !== null; }).map(function (r) { return r.ratio; })),
      'B4: worst 就是全场最小比值（' + (m.worst && m.worst.ratio) + '）');
    const cv = B.canvases();
    a(cv.ok === true && cv.rows.length === 12, 'B5: 4 字色 × 3 画布 = 12 行（实 ' + cv.rows.length + '）');
    a(cv.rows.every(function (r) { return r.pass === null || typeof r.pass === 'boolean'; }), 'B5b: 每行 pass 是三态之一');
    a(cv.fail === cv.rows.filter(function (r) { return r.pass === false; }).length, 'B5c: 画布面 fail 计数自洽');
    a(B.lineOf(B.audit({})).indexOf('按不透明算') > 0, 'B6: 读数写明“按不透明算”（叠加与背景图不在结论里）');
  } finally { un(); }

  // rgba：认不出 ⇒ unparsed，且不参与 pass/fail
  const half = Object.assign({}, CSS, { '--wa-text-tertiary': 'rgba(255,255,255,0.5)' });
  un = stubCss(WA, half);
  try {
    const m2 = B.matrix();
    a(m2.unparsed === 4, 'B7: 认不出的那个字色 × 4 底色 = 4 对 unparsed（实 ' + m2.unparsed + '）');
    const up = m2.rows.filter(function (r) { return r.why === 'unparsed'; });
    a(up.length === 4 && up.every(function (r) { return r.pass === null; }),
      'B7b: unparsed 的 pass 是 null —— 既不假绿也不假红');
    a(m2.pairs === 16 && m2.fail + m2.pass + m2.unparsed === 16, 'B7c: 三类加起来 = 总对数（没有第四类）');
    a(B.lineOf(B.audit({})).indexOf('未参与结论') > 0, 'B7d: 读数点明“认不出颜色的未参与结论”');
  } finally { un(); }

  // ── C 缺件 ────────────────────────────────────
  un = stubCss(WA, CSS, 'no-dom');
  try {
    const c1 = B.audit({});
    a(c1.why === 'no-dom', 'C1: 没有宿主窗口/文档 ⇒ no-dom（实 ' + c1.why + '）');
    a(B.lineOf(c1).indexOf('配色不猜') > 0, 'C1b: 读数说清为何不猜');
  } finally { un(); }

  un = stubCss(WA, CSS, 'throw');
  try {
    a(B.audit({}).why === 'no-css', 'C2: 取计算样式抛错 ⇒ no-css');
  } finally { un(); }

  un = stubCss(WA, {});
  try {
    const c3 = B.audit({});
    a(c3.why === 'no-var', 'C3: 变量全空 ⇒ no-var（实 ' + c3.why + '）');
    a(B.lineOf(c3).indexOf('不内置兜底色') > 0, 'C3b: 读数明写“不内置兜底色”');
    a(c3.verdict.pairs === 0, 'C3c: 一对都没有 —— 不拿 0 对冒充“全达标”');
  } finally { un(); }

  const prevC = WA.contrast;
  try {
    WA.contrast = null;
    const c4 = B.audit({});
    a(c4.why === 'module-missing', 'C4: contrast 不在 ⇒ module-missing（实 ' + c4.why + '）');
    a(B.lineOf(c4).indexOf('不自带一份') > 0, 'C4b: 读数说清为何不自带公式');
  } finally { WA.contrast = prevC; }

  a(B.whyText('no-var').indexOf('读不到') > 0, 'C5: whyText 认得 no-var');
  a(B.whyText('zzz').indexOf('未登记') === 0, 'C5b: 表外 why 不编一个说法');

  // ── D 现场 ────────────────────────────────────
  un = stubCss(WA, CSS);
  let html = '';
  try {
    B.__reset();
    html = render(WA);
    a(html.indexOf('wa-cnt-line') > 0, 'D0: 段内读数容器在真渲染里出现');
    a(html.indexOf('低于 ') > 0, 'D0b: 真渲染里有“低于 4.5:1 的 N 对”这一类读数');
    a((html.match(/id="wa-cnt-line"/g) || []).length === 1, 'D2: wa-cnt-line 全页只一次');
    a(html.indexOf('按不透明算') > 0, 'D5: 段内自己写明按不透明算');
    const bi = html.indexOf('配色可读性');
    const be = html.indexOf('本面只量', bi);
    const btn = html.indexOf('<button', bi);
    const inp = html.indexOf('<input', bi);
    a(be > bi, 'D0c: 段有收尾声明（用它当段边界）');
    a(be > bi && (btn < 0 || btn > be), 'D4: 段内没有按钮');
    a(be > bi && (inp < 0 || inp > be), 'D4b: 段内没有输入框');
  } finally { un(); }

  const toolsSrc2 = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const s2i = toolsSrc2.indexOf("foldSec('tools', 'contrast'");
  const s2e = toolsSrc2.indexOf("foldSec('tools', 'refine'", s2i);
  const segSrc = toolsSrc2.slice(s2i, s2e > s2i ? s2e : s2i + 4000);
  a(segSrc.indexOf('transact(') < 0 && segSrc.indexOf('setItem(') < 0 && segSrc.indexOf('.patch(') < 0,
    'D3: 段内 0 写口');

  // 零写实测：stub 的“配色表”逐字未变
  const snapshot = JSON.stringify(CSS);
  un = stubCss(WA, CSS);
  try {
    B.audit({}); B.matrix(); B.canvases(); B.diagnose({});
    a(JSON.stringify(CSS) === snapshot, 'D1: 跑完全部路径后色值表逐字未变（零写）');
  } finally { un(); }

  const st = B.stat();
  a(st.reads > 0 && st.matrices > 0, 'D6: 本面账记到跑过（reads ' + st.reads + ' / matrices ' + st.matrices + '）');
  a(st.last && typeof st.last.why === 'string', 'D6b: 末次体检记下了 why（实 ' + (st.last && st.last.why) + '）');
  B.__reset();
  a(B.stat().reads === 0 && B.stat().matrices === 0, 'D7: __reset 清本面计数');
  a(B.TEXT_VARS.length === 4 && B.BG_VARS.length === 4, 'D8: 两张清单是拷的且各 4 项');

  return { exports: Object.keys(B).length, pairs: 16 };
}

module.exports = { runAll: runAll };
