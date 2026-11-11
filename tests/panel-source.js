'use strict';
/**
 * tests/panel-source.js — 面板源码面的**单一真源**（v2.400.0 · V22 OPV22-4）
 *
 * ── 它治什么（缺口，先用现场说清）────────────────────────────────
 *   OPV22-4 把 `ui/panel.js` 的一段（原 517–851 行，335 行 / 7 个函数：foldCard +
 *   容量收纳 / 随机源 / 时间源 / 对外桥 / 记忆桥 / 引擎心跳）搬到了
 *   `ui/pages/overview-blocks.js`。搬完 panel.js 从 17420 行降到 17115 行，语法通过，
 *   ui-gate 55/0 全绿 —— 但**三把既有专锁当场红了**：
 *     · overview-fold-v2254  17 项红（A1b / A2×6 / A3×6 / A8 / D3 / D3b / N0）
 *     · delete-gate-v2124     3 项红（C 面三条：dryRun 档位结构 / gateStat / 「未上报」）
 *     · ui-wire-audit         直接 ENOENT 崩溃（另有独立缺陷，见下）
 *   红的原因不是产品坏了，而是**它们的输入面变窄了**：这三把锁读的是
 *   `ui/panel.js` 单文件，而它们要断言的语义（六块各走折叠壳、挂载行逐字未动、
 *   心跳块只读一次因果链、宿主耗时无上报时照实写「未上报」）现在散在两个文件里。
 *
 *   本仓对这一族已有八次裁决，措辞一致：**判据的输入面比事实窄，结论就会稳定地错**。
 *   治法不是逐条去改那三把锁的断言（那等于把判据一条条打哑，把红改成绿），
 *   而是给「面板源码」这个面立一份单一真源：**按原位置重组拼接**，
 *   于是全部文本锚点在重组面上逐字可见，三把锁的断言**一条都不用改**。
 *
 * ── 重组怎么做（为什么能逐字还原）────────────────────────────────
 *   `ui/panel.js` 在拆走的位置留了一段被标记包裹的转发块：
 *       // <<<OPV22-4 OVERVIEW-BLOCKS BEGIN>>>
 *       function __ob() { ... }
 *       function foldCard(...) { return __ob().foldCard(...); }
 *       ... 共 7 个一行转发 ...
 *       // <<<OPV22-4 OVERVIEW-BLOCKS END>>>
 *   `overviewBlocksBody()` 从 `ui/pages/overview-blocks.js` 里切出段体
 *   （两条 `══ 段体开始/结束 ══` 标记之间、去掉两端各一行标记）；
 *   `panelSource()` 把 panel.js 里**标记之间的行**整段换成段体。
 *
 *   拆的时候落盘脚本已经做过一次 round-trip 校验（重组面 === 拆前面，逐字相等），
 *   本文件把这个校验**变成常驻判据**（见 tests/segment-extract-v2400.js 的 D 段）：
 *   任何人改动标记、改动转发形态、或改动段体首尾，重组面就会与
 *   `tests/panel-source-baseline.txt` 里冻结的拆前面不符，当场红。
 *
 * ── 三条口径（每条都是「换个写法就会出错」的那种）──────────────────
 *   1 **按行拼接，不按字符下标**。拆的时候真踩过：标记写成 `  // <<<...BEGIN>>>`
 *      （两个空格缩进），用 `index()` 找到的是 `//` 的位置，于是 `p2[:bs]` 末尾
 *      残留那两个空格，拼上段体首行 `  function foldCard(` 就变成四个空格 ——
 *      差两个空格，肉眼极难发现，round-trip 红但指不出原因。
 *   2 **标记必须恰 1 对、且 BEGIN 在 END 之前**。多一对就会拼出两份段体，
 *      于是「foldCard 定义恰 1 处」这类计数断言会读成 2；少一对则整体失败。
 *      这里不猜「第一个/最后一个」，而是要求恰 1 对 —— 与既有锁的 must1 同规。
 *   3 **段体标记缺失即抛**，不返回「尽力而为」的半成品。返回一份不完整的源码，
 *      会让读它的锁读到一个「看起来能跑」的面，而错误结论会比崩溃更难查。
 *
 * ── 为什么 ui-wire-audit 是另一件事（顺带记在这里）──────────────────
 *   它崩溃的原因是**自己的**遍历器（tests/ui-wire-audit.js 的 uiFiles()）是
 *   非递归的：`fs.readdirSync('ui')` 拿到 `pages` 这个目录名，当成文件拼成
 *   `ui/overview-blocks.js` 去 readFileSync ⇒ ENOENT。这与 v2.42.0/v2.43.0
 *   治过的「四处各写一份遍历器」是同一家族（本仓第九次）。它的修法是把
 *   `tests/product-files.js` 的 `discoverUIFiles()` 转出来用，而不是在这里
 *   给它做特殊照顾 —— 见该文件本版改动。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const BLOCKS_REL = 'ui/pages/overview-blocks.js';
const MARK_BEGIN = '// <<<OPV22-4 OVERVIEW-BLOCKS BEGIN>>>';
const MARK_END = '// <<<OPV22-4 OVERVIEW-BLOCKS END>>>';
// 段体在新文件里的起止标记（各占一行，且**不含**在段体内）
const BODY_OPEN = '  // ══ 段体开始（原 ui/panel.js 517–851 行，逐字搬迁，一个字符未改）══';
const BODY_CLOSE = '  // ══ 段体结束 ══';

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/**
 * 从 ui/pages/overview-blocks.js 切出**段体**（不含起止标记行）。
 *   为什么要有起止标记而不是「从第一个 function 到文件尾」：
 *   新文件尾部还有 API 汇总与 registerModule，那些**不是**原段体的一部分；
 *   靠「第一个 function 起」会把它们一并切进来，于是重组面上多出一段拆前没有的
 *   代码 —— round-trip 会红，而且红得莫名其妙。标记把边界变成显式事实。
 */
function overviewBlocksBody() {
  const src = rd(BLOCKS_REL);
  const lines = src.split('\n');
  const open = lines.findIndex(function (l) { return l === BODY_OPEN; });
  const close = lines.findIndex(function (l) { return l === BODY_CLOSE; });
  if (open < 0) throw new Error('panel-source: ' + BLOCKS_REL + ' 缺少段体起始标记（OPV22-4 的边界被改动过）');
  if (close < 0) throw new Error('panel-source: ' + BLOCKS_REL + ' 缺少段体结束标记（OPV22-4 的边界被改动过）');
  if (close <= open) throw new Error('panel-source: 段体标记顺序颠倒（open L' + (open + 1) + ' / close L' + (close + 1) + '）');
  return lines.slice(open + 1, close).join('\n');
}

/**
 * 面板源码面 = panel.js 里标记之间的转发块，整段换成段体。
 *
 *   返回值与「拆段之前的 ui/panel.js」**逐字相等**（这一点由 segment-extract-v2400
 *   的 D 段用冻结基线钉住）。三把既有专锁只需把 `fs.readFileSync('ui/panel.js')`
 *   换成 `panelSource()`，断言一条都不用改。
 */
function panelSource() {
  const src = rd(PANEL_REL);
  const lines = src.split('\n');
  const begins = [];
  const ends = [];
  lines.forEach(function (l, i) {
    if (l.indexOf(MARK_BEGIN) >= 0) begins.push(i);
    if (l.indexOf(MARK_END) >= 0) ends.push(i);
  });
  if (begins.length !== 1) throw new Error('panel-source: ' + PANEL_REL + ' 的 BEGIN 标记应恰 1 处，实 ' + begins.length + ' 处');
  if (ends.length !== 1) throw new Error('panel-source: ' + PANEL_REL + ' 的 END 标记应恰 1 处，实 ' + ends.length + ' 处');
  if (ends[0] <= begins[0]) throw new Error('panel-source: 标记顺序颠倒（BEGIN L' + (begins[0] + 1) + ' / END L' + (ends[0] + 1) + '）');
  const body = overviewBlocksBody().split('\n');
  //   按行拼接：见文件头口径 1。此处若改成字符下标拼接，会静默多出两个空格。
  return lines.slice(0, begins[0]).concat(body, lines.slice(ends[0] + 1)).join('\n');
}

/** 面板源码面的行数（拆段前 17420 行；用于「面没塌」的粗读数）。 */
function panelSourceLines() { return panelSource().split('\n').length; }

/** 拆段之后 panel.js 自己的行数（不含重组）。 */
function panelFileLines() { return rd(PANEL_REL).split('\n').length; }

module.exports = {
  BASE: BASE,
  PANEL_REL: PANEL_REL,
  BLOCKS_REL: BLOCKS_REL,
  MARK_BEGIN: MARK_BEGIN,
  MARK_END: MARK_END,
  BODY_OPEN: BODY_OPEN,
  BODY_CLOSE: BODY_CLOSE,
  overviewBlocksBody: overviewBlocksBody,
  panelSource: panelSource,
  panelSourceLines: panelSourceLines,
  panelFileLines: panelFileLines
};