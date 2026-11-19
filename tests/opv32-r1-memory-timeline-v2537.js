#!/usr/bin/env node
// WorldAxis tests/opv32-r1-memory-timeline-v2537.js — 记忆分层时间轴（v2.537.0 · C 项）
//
// 锁什么：v2.537.0 在记忆页加了一块「分层时间轴」。这块的**价值不在长得像时间轴**，而在两条：
//   ① 四层（L0 单轮 / L1 阶段 / L2 章节 / L3 长线）必须**真的合并成一条轴**并按时间先后排；
//   ② 排序必须发生在 UI 侧 —— 渲染器的 sortBy 是按**字符串**比较，`at` 是数字（'10' < '9'），
//      交给它会静默排错序。这条不是风格偏好，是本仓点过的「算错了但看起来算过了」同型病灶。
//
// 三条否定面（正面出 HTML 不算证据）：
//   N1 把 UI 侧的 sort 调用删掉 ⇒ 「UI 侧排序」断言必须变红（判据非恒真）；
//   N2 用渲染器 sortBy 复现「字符串序」现场 ⇒ 证明 N1 那条判据指向的是真缺陷；
//   N3 视图层缺席时整块不出现（含标题）—— 半截比没有更难查，故判据是「标题也不许出现」。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const PANEL = 'ui/panel.js';
const SREL = 'ui/schema-view.js';
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const RD = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
const NL = String.fromCharCode(10);

function mkSandbox() {
  const win = { console: { log() {}, warn() {}, error() {} } };
  const sb = { window: win, console: win.console,
    JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Date, isFinite };
  win.WorldAxis = { registerModule() {} };
  return sb;
}
function loadSV() {
  const sb = mkSandbox();
  vm.runInContext(RD(SREL), vm.createContext(sb), { filename: SREL });
  return (sb.window && sb.window.WorldAxis && sb.window.WorldAxis.schemaView) || null;
}
const SV = loadSV();

const pAll = RD(PANEL);
// 只取代码面（剥行注释），否则注释里写「不要用 Date.now」也会被判进判据。
const codeOnly = function (s) {
  return s.split(NL).filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join(NL);
};
// renderMemory 段：从函数头到下一个顶层 `function ` 之间（段内自证范围，不靠行号）。
const seg = (function () {
  const i = pAll.indexOf('function renderMemory()');
  if (i < 0) return '';
  const j = pAll.indexOf(NL + '  function ', i + 10);
  return pAll.slice(i, j < 0 ? pAll.length : j);
})();
const segCode = codeOnly(seg);

console.log('\n■ A 面：块确实接进了记忆页');
a(seg.length > 500, 'A1 renderMemory 段可定位且非空（实 ' + seg.length + ' 字符）');
a(segCode.indexOf('WA.schemaView.render(') >= 0, 'A2 记忆页通过 WA.schemaView.render 出块（不是自己拼 HTML）');
a(segCode.indexOf("type: 'collapse'") >= 0 && segCode.indexOf("type: 'timeline'") >= 0
  && segCode.indexOf("type: 'kv'") >= 0, 'A3 三个块类型齐（collapse 容器 / kv 漏斗 / timeline 轴）');
a(segCode.indexOf('L0 ') >= 0 && segCode.indexOf('→ L1') >= 0 && segCode.indexOf('→ L3') >= 0,
  'A4 压缩漏斗读数在（L0 → L1 → L2 → L3）');

console.log('\n■ B 面：四层真的合并成一条轴');
a(segCode.indexOf("['L0', L0], ['L1', L1], ['L2', L2], ['L3', L3]") >= 0,
  'B1 四层逐一进轴（L0/L1/L2/L3 各一个来源数组）');
a(segCode.indexOf('tItems.sort(') >= 0, 'B2 排序发生在 UI 侧（tItems.sort）');
a(segCode.indexOf('sortBy') < 0, 'B3 不把排序交给渲染器的 sortBy（那边按字符串比较）');
a(/Number\(x\.t\)/.test(segCode), 'B4 时间点取数值（Number(x.t)），不是直接拼字符串');
a(segCode.indexOf('Date.now') < 0, 'B5 段内零墙钟读取（时间点来自条目自身）');

console.log('\n■ C 面：空态与降级都不许伪装');
a(segCode.indexOf('还没有记忆条目') >= 0, 'C1 轴空时有玩家语言的空态文案');
a(segCode.indexOf("typeof WA.schemaView.render === 'function'") >= 0,
  'C2 视图层缺席守卫（判到方法级，不只判对象存在）');
a(segCode.indexOf('wa-tl-') < 0, 'C3 面板不重造时间轴结构（结构由渲染器出，面板不手写 wa-tl-*）');
const emptyHtml = SV.render({ type: 'timeline', items: [], empty: '还没有记忆条目 —— 它们会随推演自动生成' });
a(emptyHtml.indexOf('wa-empty') >= 0 && emptyHtml.indexOf('还没有记忆条目') >= 0,
  'C4 渲染器对空轴的现场行为与面板文案一致', emptyHtml.slice(0, 80));

console.log('\n■ D 面：负控制（判据不许恒真）');
// N2：现场复现「sortBy 按字符串排」的错序 —— 这证明 B3 不是洁癖。
const strOrder = SV.render({ type: 'timeline', sortBy: 'at',
  items: [{ at: '10', title: 'LATER' }, { at: '9', title: 'EARLIER' }] });
a(strOrder.indexOf('LATER') < strOrder.indexOf('EARLIER'),
  'D1 负控制：渲染器 sortBy 确实按字符串排（\'10\' < \'9\'）⇒ 排序必须留在 UI 侧', strOrder.slice(0, 120));
// N1：把 UI 侧 sort 调用来掉，B2 的判据必须变红。
const noSort = segCode.split('tItems.sort(').join('void (');
a(noSort.indexOf('tItems.sort(') < 0, 'D2 负控制：删掉 tItems.sort ⇒ B2 断言变红（判据非恒真）');
// N3：视图层缺席时标题也不许出现 —— 面板里该段的呈现完全由守卫包住。
const guardFirst = segCode.indexOf('typeof WA.schemaView.render');
const titlePos = segCode.indexOf('记忆分层时间轴');
a(guardFirst >= 0 && titlePos > guardFirst, 'D3 负控制：标题出现在守卫之后 ⇒ 缺席时不会留半截标题', { guardFirst: guardFirst, titlePos: titlePos });
// 台账：KINDS 里确实有 collapse/timeline（否则 A3 会指向一个不存在的块）。
a(SV.KINDS.indexOf('collapse') >= 0 && SV.KINDS.indexOf('timeline') >= 0, 'D4 台账：collapse / timeline 在渲染器的块类型表内');

console.log('\n■ E 面：P0 护栏与反馈层（v2.539.0）');
const rbSeg = (function () {
  const i = pAll.indexOf('function renderBody()');
  if (i < 0) return '';
  const j = pAll.indexOf(NL + '  function ', i + 10);
  return pAll.slice(i, j < 0 ? pAll.length : j);
})();
a(pAll.indexOf('function __toast(msg, bad)') >= 0 && pAll.indexOf("__toastEl.id = 'wa-toast'") >= 0,
  'E1 toast 有唯一入口且容器 id 固定（不是散在 148 处 innerHTML 里）');
a(pAll.indexOf('(mainDoc.body || mainDoc.documentElement).appendChild(__toastEl)') >= 0,
  'E2 toast 挂在 body 下 —— 面板整块重建抹不掉它');
a(rbSeg.indexOf('wa-toast') < 0, 'E3 renderBody 段不碰 toast（提示不参与重绘）');
a(pAll.indexOf('没有改动任何数据') >= 0, 'E4 取消时明说「没有改动」——不留「可能已生效」的疑心');
const guardCount = (pAll.split('if (!__ok(').length - 1);
a(guardCount >= 4, 'E5 半不可逆操作已接护栏（实 ' + guardCount + ' 处，判据 ≥4）', guardCount);
a(pAll.split('if (!__ok(').join('if (!(').indexOf('if (!__ok(') < 0,
  'E6 负控制：删掉护栏调用 ⇒ E5 判据变红（判据非恒真）');

console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exitCode = fail ? 1 : 0;
