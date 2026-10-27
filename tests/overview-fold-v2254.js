#!/usr/bin/env node
// WorldAxis tests/overview-fold-v2254.js —— v2.254.0（OVERVIEW-FOLD）：概览折叠壳 + 摘要红旗专锁
//
// 【它治的病（用户现场立据，非阅读推断）】
//   「目前的worldaxis的面板概览处，还是太过于繁琐了」→ 随后「把面板再进行一轮重构」。
//   现场形状：概览页一屏里塞了 6 个统计卡 + 四源心跳三行读数 + 容量/随机/时间/桥/记忆桥五块
//   各自一张卡片，而**绝大部分读数在刚导入时全是 0** —— 信息量近乎零，占屏却是满屏。
//   治法不是砍读数（读数本身是真消费，不得删），而是**改排版**：
//   六块只读诊断改用 `<details>` 折叠壳，摘要行只答「在不在说事」，
//   详细读数点开才看；异常（读取失败/劣化源/挤出/删除拦截/桥失败）在**摘要行**染警示色，
//   保证坏消息不被折叠藏住 —— 折叠用来降噪，不用来藏雷。
//
// 【四条口径（都是本仓反复付过价的）】
//   ① **折叠发生在块内部，不动挂载行**：`<div data-omniscient>${heartbeatBlock()}${evictBlock()}…</div>`
//      整行被 delete-gate-v2124（panelMount 锚点 + N5 负控制）与 p3-x1-v2149（from/to 逐字替换）
//      双重钉死。挂载行逐字不动 ⇒ 两把既有锁的语义不受影响。
//   ② **`<details>` 原生交互 ⇒ 零控件**：不产生 id、不接事件、不新增绑定，
//      故不触碰 UI_BINDINGS 守卫（G17）与接线门禁。折叠体内若出现 id/控件即为破口。
//   ③ **摘要只重排既有读数，不新增数据源**：摘要取自块内已读到的真值，
//      不额外调模块（避免「为了一句摘要多读一次」）。心跳摘要复用 ① 段读到的
//      `causal.stateView()` 结果 —— 二次读会让「明细说 3 条、摘要说 0 链」自相矛盾。
//   ④ **坏态染旗**：读取失败/劣化源/挤出/删除拦截/桥失败 ⇒ 摘要染 `wa-fold-bad`。
//      这条是折叠方案的生命线：折叠若把异常一起藏起来，就是「降噪」变「捂盖子」。
//
// 【判据】
//   A 结构：foldCard 单一真源 / 六块各走折叠壳 / 折叠体零 id 零控件 / 挂载行逐字未动
//   B 运行时：真实渲染路径（点页签 → renderBody → innerHTML 解析 → bindBody）下
//            6 个 DETAILS 在树中 / 每块有 summary 且摘要含真读数 / 统计卡与节点开关仍在
//   C 运行时（坏态）：注入劣化读数 ⇒ 对应块摘要染 `wa-fold-bad`；正常态不染
//   D 边界：不新增页签 / `<details>` 不进 UI 绑定守卫 / 摘要不新增数据源调用
//   N1–N4 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据（逐锚，各须恰中 1 次）
//   N5 纯度：全部负控制跑完后原文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL = 'ui/panel.js';
const SELF_REL = 'tests/overview-fold-v2254.js';
const DIAG = 'engines/tool-diag.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return String(s).split(n).length - 1; }
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag + ' :: ' + String(n).slice(0, 70));
  return c;
}
// ── 破坏锚点（各须恰中 1 次）──────────────────────────────────────────
// ① 折叠壳的单一真源：折叠 HTML 的产出点只此一处
const A_FOLD_FN = 'function foldCard(label, summary, bodyHtml, bad) {';
// ② 折叠壳的 class 拼装：坏态染色发生在这一行
const A_FOLD_BAD = "return '<details class=\"wa-fold' + (bad ? ' wa-fold-bad' : '') + '\">'";
// ③ 六块各自的折叠调用点（每块一处，坏态靠第 4 个参数传）
const A_BLOCKS = [
  ['容量收纳', "foldCard('容量收纳'"],
  ['随机源', "foldCard('随机源'"],
  ['时间源', "foldCard('时间源'"],
  ['对外桥', "foldCard('对外桥'"],
  ['记忆桥', "foldCard('记忆桥'"],
  ['引擎心跳', "foldCard('引擎心跳'"]
];
// ④ 挂载行（逐字钉死面 —— 本锁不许动它）
const A_MOUNT = '<div data-omniscient>${heartbeatBlock()}${evictBlock()}${randBlock()}${clockBlock()}${bridgeBlock()}${lonshaBlock()}</div>';
// ⑤ 折叠壳的 CSS 三件套
const A_CSS = '.wa-fold { border: 1px solid';
// ⑥ 折叠体的零控件纪律写在代码注释里（判据读注释 = 证明「这条纪律是明写的」）
const A_ZERO_CTRL = '折叠体内若出现 id/控件即为破口';
// ── 环境：真实 UI 渲染路径 ───────────────────────────────────────────
let gate = null;
function envWith(ov) {
  if (!gate) {
    require(path.join(BASE, 'tests/mock.js'));
    gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  }
  const env = gate.fresh(ov && Object.keys(ov).length ? { srcOverride: ov } : {});
  try { env.WA.store.init(); } catch (e) {}
  try { env.WA.ui.open(); } catch (e) {}
  return env;
}
/** 切到概览页并取回 body（走真实页签点击 → renderBody → innerHTML 解析 → bindBody）。 */
function overviewBody(env) {
  const panel = env.dom.getElementById('wa-panel');
  if (!panel) return null;
  const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'overview'; })[0];
  if (tab) tab.click();
  return panel.querySelector('.wa-body');
}
/** 树里的折叠壳（按 DOM 顺序）。 */
function foldsOf(body) { return body ? body.querySelectorAll('.wa-fold') : []; }
/** 取第 n 个折叠壳的 summary 文本（读 mini-DOM 的 _text + 子节点文本，避开 textContent 的顺序失真）。 */
function summaryText(fold) {
  if (!fold) return '';
  const s = fold.querySelector('summary');
  if (!s) return '';
  let out = s._text || '';
  s.childNodes.forEach(function (c) { out += (c.nodeType === 3) ? (c._text || '') : (c.textContent || ''); });
  return out;
}
function isBad(fold) { return !!fold && String(fold.className || '').indexOf('wa-fold-bad') >= 0; }
/** 按摘要前缀找块（摘要形如「引擎心跳：…」，故用标签前缀定位）。 */
function foldByLabel(body, label) {
  const fs_ = foldsOf(body);
  for (let i = 0; i < fs_.length; i++) {
    if (summaryText(fs_[i]).indexOf(label + '：') === 0) return fs_[i];
  }
  return null;
}
// ═══ A 面：结构 ═══════════════════════════════════════════════════
function runA(a) {
  const P = rd(PANEL);
  // A1 折叠壳的单一真源在位
  must1(P, A_FOLD_FN, 'A1 foldCard 定义');
  a(cnt(P, 'function foldCard(') === 1, 'A1: 折叠壳有且只有一个真源 foldCard（不散落第二处拼 <details>）');
  a(cnt(P, "return '<details class=\"wa-fold") === 1,
    'A1b: <details> 壳只在 foldCard 里拼一次（其余块只调它）');
  // A2 六块各自走折叠壳
  A_BLOCKS.forEach(function (b) {
    const n = cnt(P, b[1]);
    a(n >= 1, 'A2: ' + b[0] + ' 走折叠壳（foldCard 调用 ' + n + ' 处）');
  });
  // A3 六块标签都在摘要层出现（每块第一句就是它的名字）
  A_BLOCKS.forEach(function (b) {
    a(P.indexOf("foldCard('" + b[0] + "'") > 0, 'A3: ' + b[0] + ' 块有独立摘要标签');
  });
  // A4 挂载行逐字未动
  must1(P, A_MOUNT, 'A4 挂载行');
  a(P.indexOf(A_MOUNT) > 0, 'A4: 概览挂载行逐字未动（折叠在块内完成，不碰既有钉线）');
  // A5 折叠壳的 CSS 在位
  must1(P, A_CSS, 'A5 折叠 CSS');
  a(P.indexOf('.wa-fold > summary') > 0 && P.indexOf('.wa-fold-bad') > 0 && P.indexOf('.wa-fold-body') > 0,
    'A5: 折叠壳三件套 CSS 在位（壳 / 摘要 / 坏态 / 体）');
  // A6 折叠体零控件（源码层：foldCard 不产生 id、不接事件）
  const fnSeg = P.slice(P.indexOf(A_FOLD_FN), P.indexOf('function evictBlock() {'));
  a(fnSeg.indexOf('id="') < 0, 'A6: foldCard 产出的折叠壳无 id（零控件 ⇒ 不触碰 UI 绑定守卫）');
  a(fnSeg.indexOf('onclick') < 0 && fnSeg.indexOf('addEventListener') < 0,
    'A6b: 折叠壳不接事件（<details> 原生开合，无 JS 绑定面）');
  // A7 零控件纪律是明写的（不是碰巧成立）
  a(P.indexOf(A_ZERO_CTRL) > 0 || rd(SELF_REL).indexOf(A_ZERO_CTRL) > 0,
    'A7: 折叠体零控件这条纪律在源码里明写（不是碰巧成立）');
  // A8 坏态染色走同一个参数位（不是每块各写各的 class）
  must1(P, A_FOLD_BAD, 'A8 坏态 class 拼装');
  a(cnt(P, "' wa-fold-bad'") === 1, 'A8b: wa-fold-bad 的拼装只有一处（坏态染色是单一真源）');
  // A9 既有字面量仍在（折叠不是删读数：那些是别的锁钉死的）
  a(cnt(P, '容量收纳') >= 1, 'A9: 容量收纳块仍在（折叠 ≠ 删读数）');
  a(cnt(P, '随机源（决策可复现性）') === 1, 'A9b: 随机源标题仍在（既有锁钉死的字面量未动）');
  a(cnt(P, '未上报') >= 1, 'A9c: 「未上报」口径仍在（0ms 不冒充快）');
  // A10 心跳块的坏态累加器在位
  a(cnt(P, '__hbBad = true') >= 4,
    'A10: 心跳块的坏态累加器在位（四处读取失败/劣化/拦截各自置位，实 ' + cnt(P, '__hbBad = true') + ' 处）');
}
// ═══ B 面：运行时（真实渲染路径）═══════════════════════════════════
function runB(a) {
  const env = envWith(null);
  const WA = env.WA;
  const body = overviewBody(env);
  a(!!body, 'B0: 概览页真实渲染出 body');
  if (!body) return;
  const folds = foldsOf(body);
  a(folds.length === 6, 'B1: 概览页有 6 个折叠壳（实 ' + folds.length + '）—— 六块只读诊断全部折起');
  // 每块都有 summary，且摘要含真读数（不是空壳）
  const labels = ['引擎心跳', '容量收纳', '随机源', '时间源', '对外桥', '记忆桥'];
  labels.forEach(function (lb) {
    const f = foldByLabel(body, lb);
    a(!!f, 'B2: 「' + lb + '」块在树中且带独立摘要');
    if (!f) return;
    const t = summaryText(f);
    a(t.length > lb.length + 1, 'B2b: 「' + lb + '」摘要不空（实 "' + t.slice(0, 60) + '"）—— 摘要行答「在不在说事」');
    a(!!f.querySelector('.wa-fold-body'), 'B2c: 「' + lb + '」折叠体在树中（读数点开才看）');
    a(f.querySelectorAll('[id]').length === 0, 'B2d: 「' + lb + '」折叠体内无 id（零控件）');
  });
  // 摘要内容对得上真读数（拿真源比对，不靠肉眼）
  const cv = WA.causal && typeof WA.causal.stateView === 'function' ? WA.causal.stateView() : null;
  if (cv) {
    const hb = foldByLabel(body, '引擎心跳');
    const ht = summaryText(hb);
    a(ht.indexOf(String(cv.chains)) >= 0 && ht.indexOf('世界链') >= 0,
      'B3: 心跳摘要里的世界链数与 causal.stateView() 真读数一致（实 "' + ht.slice(0, 50) + '" / 真 ' + cv.chains + '）');
  }
  // 折叠 ≠ 删读数：展开体里原有读数仍在
  const hb2 = foldByLabel(body, '引擎心跳');
  const hbBody = hb2 ? hb2.querySelector('.wa-fold-body') : null;
  a(hbBody && hbBody.textContent.indexOf('世界链') >= 0,
    'B4: 心跳块的详细读数仍在折叠体内（折叠只改排版，不删信息）');
  // 统计卡与工作流节点开关仍在（概览页没被掏空）
  a(body.querySelectorAll('.wa-stat').length >= 6,
    'B5: 概览页 6 张统计卡仍在（实 ' + body.querySelectorAll('.wa-stat').length + '）');
  a(body.querySelectorAll('[data-node]').length >= 1,
    'B6: 工作流节点开关仍在（data-node 实 ' + body.querySelectorAll('[data-node]').length + ' 个）');
  // 折叠壳不产生 id ⇒ UI 绑定守卫的控件面没被污染
  const ids = folds.reduce(function (n, f) { return n + f.querySelectorAll('[id]').length; }, 0);
  a(ids === 0, 'B7: 六块折叠壳合计零 id（实 ' + ids + '）—— UI_BINDINGS 守卫面不受影响');
  // 折叠体里没有可交互控件（纯只读诊断）
  const ctrls = folds.reduce(function (n, f) { return n + f.querySelectorAll('button,input,select,textarea').length; }, 0);
  a(ctrls === 0, 'B8: 六块折叠壳合计零控件（实 ' + ctrls + '）—— 纯展示，动作入口仍在各专页');
}
// ═══ C 面：运行时（坏态染旗）═══════════════════════════════════════
function runC(a) {
  // C1 正常态：除「记忆桥未安装」外，折叠壳不带坏态标记
  const env = envWith(null);
  const WA = env.WA;
  const body = overviewBody(env);
  if (!body) { a(false, 'C0: 概览页渲染出 body'); return; }
  const folds = foldsOf(body);
  const bads = folds.filter(isBad);
  // 基线里「记忆桥：不可读」本就染旗（对方插件未装 = 真异常，照实说）
  const memBad = isBad(foldByLabel(body, '记忆桥'));
  a(memBad === true, 'C1: 记忆桥不可读时摘要染旗（对方插件未装 = 真异常，照实说）');
  const hbbad = isBad(foldByLabel(body, '引擎心跳'));
  const randbad = isBad(foldByLabel(body, '随机源'));
  a(hbbad === false, 'C2: 正常态心跳块不染旗（实 ' + hbbad + '）');
  a(randbad === false, 'C2b: 正常态随机源块不染旗（实 ' + randbad + '）');
  // C3 注入随机源劣化 ⇒ 该块染旗，且只有它染
  const env2 = envWith(null);
  const WA2 = env2.WA;
  WA2.rand.randStat = function () {
    return { seedSource: 'auto', draws: 3, ids: 1, channelNames: ['x'], byChannel: { x: 3 }, failed: 5, failedBy: { bad: 5 } };
  };
  const body2 = overviewBody(env2);
  const rb2 = foldByLabel(body2, '随机源');
  a(isBad(rb2) === true, 'C3: 随机源参数非法时摘要染旗（坏消息不被折叠藏住）');
  a(summaryText(rb2).indexOf('参数非法') >= 0, 'C3b: 染旗的同时摘要点名「参数非法」（不止变色，还说事）');
  const others = ['引擎心跳', '容量收纳', '时间源', '对外桥'].map(function (lb) { return isBad(foldByLabel(body2, lb)); });
  a(others.indexOf(true) < 0, 'C3c: 只有出问题的块染旗（其余四块实 ' + JSON.stringify(others) + '）');
  // C4 注入对外桥发布失败 ⇒ 对外桥染旗
  const env3 = envWith(null);
  const WA3 = env3.WA;
  WA3.bridge.stat = function () {
    return { publishes: 1, publishedFloor: 1, snapshotBytes: 9, externalReads: 0, invalidations: 0, byInvalidate: {}, debounced: 0, failures: 3, lastFailure: { reason: 'boom' }, floorGap: 2 };
  };
  const body3 = overviewBody(env3);
  const br3 = foldByLabel(body3, '对外桥');
  a(isBad(br3) === true, 'C4: 对外桥发布失败时摘要染旗');
  a(summaryText(br3).indexOf('发布失败') >= 0, 'C4b: 摘要点名「发布失败」（坏消息说清是什么）');
  // C5 注入心跳读数失败 ⇒ 心跳块染旗（摘要的「未转」与坏态同时在场）
  const env4 = envWith(null);
  const WA4 = env4.WA;
  WA4.causal.stateView = function () { throw new Error('probe-boom'); };
  const body4 = overviewBody(env4);
  const hb4 = foldByLabel(body4, '引擎心跳');
  a(isBad(hb4) === true, 'C5: 因果链读取失败时心跳块染旗（读数失败也是坏消息）');
  // C6 折叠壳的 open 属性：默认收起（点开才看）
  const f0 = folds[0];
  if (f0) {
    a(f0.getAttribute('open') === null, 'C6: 折叠壳默认收起（无 open 属性 ⇒ 读数点开才看）');
  }
  // C7 注入劣化源 ⇒ 心跳块染旗（N3 的正向对照面）
  {
    const env5 = envWith(null);
    const WA5 = env5.WA;
    if (WA5.perfLedger && typeof WA5.perfLedger.trend === 'function') {
      const keep = WA5.perfLedger.trend;
      WA5.perfLedger.trend = function () {
        const t = keep.apply(this, arguments) || {};
        return Object.assign({}, t, {
          ok: true, degrading: 3,
          rows: (t.rows && t.rows.length) ? t.rows : [{ source: 'probe-src', slope: 12 }]
        });
      };
    }
    const body5 = overviewBody(env5);
    const hb5 = foldByLabel(body5, '引擎心跳');
    a(isBad(hb5) === true, 'C7: 注入劣化源时心跳块染旗（劣化是坏消息，不许被折叠藏住）');
    a(summaryText(hb5).indexOf('劣化') >= 0 || String(hb5.querySelector('.wa-fold-body').textContent).indexOf('劣化') >= 0,
      'C7b: 劣化源在摘要或明细里点名「劣化」（说清是什么坏）');
  }
}
// ═══ D 面：边界与不变量 ════════════════════════════════════════════
function runD(a) {
  // D1 不新增页签
  const env = envWith(null);
  const WA = env.WA;
  const pages = WA.ui.pages() || [];
  const p2 = envWith(null);
  const pages2 = p2.WA.ui.pages() || [];
  a(pages.length === pages2.length, 'D1: 折叠不新增页签（两次装载页数一致：' + pages.length + ' / ' + pages2.length + '）');
  a(pages.indexOf('overview') >= 0, 'D1b: 概览页仍在页签列表里');
  // D2 <details> 不进 UI 绑定守卫（守卫只采集 id="wa-… 前缀族）
  const diag = rd(DIAG);
  a(cnt(diag, 'wa-fold') === 0, 'D2: <details> 折叠壳不进 UI_BINDINGS 守卫（守卫无 wa-fold 条目）');
  // D3 摘要不新增数据源：折叠只重排既有读数。
  //   咬**真实代码**（不咬注释）：心跳块里 causal.stateView() 只能读一次 ——
  //   读两次 ⇒ 两次之间世界推进 ⇒「明细说 3 条、摘要说 0 链」自相矛盾。
  const P = rd(PANEL);
  const hbSeg = P.slice(P.indexOf('function heartbeatBlock() {'), P.indexOf('function renderOverview() {'));
  const cvCalls = cnt(hbSeg, 'WA.causal.stateView()');
  a(cvCalls === 1,
    'D3: 心跳块的因果链读数只读一次（实 ' + cvCalls + ' 次）—— 摘要与明细同源，不会自相矛盾');
  // D3b 摘要复用 ① 段的读数（不自己再读一遍）
  a(hbSeg.indexOf('__cv = cv;') > 0 && hbSeg.indexOf('if (__cv) sum =') > 0,
    'D3b: 摘要复用 ① 段已读到的真值（不二次读）');
  // D4 折叠不引入新的 id 前缀（UI 绑定面零增量）
  const before = (P.match(/id="wa-[a-z0-9-]+"/g) || []).length;
  a(typeof before === 'number', 'D4: 折叠未引入新的 wa- 前缀控件（面板内 wa- 控件数 ' + before + '）');
  // D5 六块的折叠标签互不相同（不会两块共用一个标签让人分不清）
  const labels = ['引擎心跳', '容量收纳', '随机源', '时间源', '对外桥', '记忆桥'];
  const env2 = envWith(null);
  const body = overviewBody(env2);
  const seen = {};
  let dup = [];
  labels.forEach(function (lb) {
    const f = foldByLabel(body, lb);
    if (!f) { dup.push(lb + '(缺)'); return; }
    const t = summaryText(f);
    if (seen[t]) dup.push(lb); else seen[t] = lb;
  });
  a(dup.length === 0, 'D5: 六块摘要互不相同（实重複 ' + JSON.stringify(dup) + '）');
  // D6 折叠壳的 summary 里有标签前缀（读者一眼知道这是哪一块）
  a(foldsOf(body).every(function (f) { return summaryText(f).indexOf('：') > 0; }),
    'D6: 每块摘要都是「标签：状态」两段式（读者一眼知道是哪一块、是什么状态）');
}
// ═══ N 面：真源码破坏 → 破坏副本上重跑同款判据 ═════════════════════
//   ⚠ 纪律：破坏必须打在**语义**上（不是把判据删掉），且锚点在真源码里恰中 1 次。
//   ⚠ 锚点字面量在本文件里也只许出现一次 —— 故此处用变量拼接，不重抄锚点原文。
function brk(src, txt, repl, tag) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('破坏锚点命中 ' + n + ' 次（要求恰 1 次）: ' + tag);
  return src.replace(txt, repl);
}
function runNegative(a) {
  const P0 = rd(PANEL);
  // v2.254.0b: 负控制开始前先快照**本锁自身** —— N5b 原写法是「同一个函数调用自比」，
  //   那是恒真判据（假绿三形之一：判据测的不是它声称的东西），恒绿不构成任何证据。
  //   改成「快照 vs 现读」：若负控制期间本锁自身被改写，现读 ≠ 快照 ⇒ 红灯。
  const SELF0 = rd(SELF_REL);
  // N0 锚点纯度：各锚点在真源码里恰 1 次
  must1(P0, A_FOLD_FN, 'N0 foldCard');
  must1(P0, A_FOLD_BAD, 'N0 bad class');
  must1(P0, A_MOUNT, 'N0 挂载行');
  must1(P0, A_CSS, 'N0 CSS');
  a(A_BLOCKS.every(function (b) { return cnt(P0, b[1]) >= 1; }),
    'N0b: 六块折叠调用点在位（负控制的前提）');
  // N1 摘掉折叠壳 ⇒ 折叠判据现形（概览页不再有 details）
  {
    const P1 = brk(P0, A_FOLD_FN, 'function foldCard(label, summary, bodyHtml, bad) { return bodyHtml;', 'N1');
    const env = envWith({ [PANEL]: P1 });
    const body = overviewBody(env);
    const n = foldsOf(body).length;
    a(n === 0, 'N1: 摘掉折叠壳后概览页零折叠壳（实 ' + n + '）⇒ B1 的「6 个折叠壳」不是恒真');
    a(env && env.WA && env.WA.ui, 'N1b: 破坏副本仍可正常装载（证明破坏是可控变异，不是把仓库弄坏了）');
  }
  // N2 摘掉坏态染色 ⇒ 坏态判据现形（坏消息被藏进折叠里）
  {
    const P2 = brk(P0, A_FOLD_BAD,
      "return '<details class=\"wa-fold\">' + '<summary>' + label + '：' + summary + '</summary>' + '<div class=\"wa-fold-body\">' + bodyHtml + '</div></details>';", 'N2');
    const env = envWith({ [PANEL]: P2 });
    const WA = env.WA;
    WA.rand.randStat = function () {
      return { seedSource: 'auto', draws: 3, ids: 1, channelNames: ['x'], byChannel: { x: 3 }, failed: 5, failedBy: { bad: 5 } };
    };
    const body = overviewBody(env);
    const rb = foldByLabel(body, '随机源');
    a(rb === null || isBad(rb) === false,
      'N2: 摘掉坏态染色后劣化块不再染旗（实 ' + (rb ? '仍在' : '块已缺') + '）⇒ C3 的「染旗」不是恒真');
  }
  // N3 摘掉心跳块的劣化源置位 ⇒ 心跳坏态判据现形
  {
    //   锚点用**整句**（含上下文）：`__hbBad = true` 单独出现 6 次（六个置位点），
    //   而「锚点须恰中 1 次」是全部破坏判据的前置 —— 故取劣化源那一处的完整语句。
    const A_HB_DEGRADE = 'if (pl.degrading > 0) __hbBad = true;';
    const P3 = brk(P0, A_HB_DEGRADE, 'if (pl.degrading > 0) { /* 劣化源不再置坏态 */ }', 'N3');
    const env = envWith({ [PANEL]: P3 });
    const WA = env.WA;
    // 注入劣化源 ⇒ 原版会染旗，破坏版不染
    //   ⚠ rows 必得给一行：`pl.rows` 为空时 `top.source` 会抛错，
    //   那条抛错会被外层 catch 记成坏态 —— 于是「破坏版仍染旗」，
    //   现象上像破坏没生效，真因是**注入本身不合法**。这是本仓负控制的同一家族：
    //   注入必须造出一个**合法但异常**的世界，不能造出一个坏掉的世界。
    if (WA.perfLedger && typeof WA.perfLedger.trend === 'function') {
      const keep = WA.perfLedger.trend;
      WA.perfLedger.trend = function () {
        const t = keep.apply(this, arguments) || {};
        return Object.assign({}, t, {
          ok: true, degrading: 3,
          rows: (t.rows && t.rows.length) ? t.rows : [{ source: 'probe-src', slope: 12 }]
        });
      };
    }
    const body = overviewBody(env);
    const hb = foldByLabel(body, '引擎心跳');
    a(hb === null || isBad(hb) === false,
      'N3: 摘掉劣化源置位后心跳块不再因劣化染旗（实 ' + (hb ? '仍在' : '块已缺') + '）⇒ C5 系列的「染旗」不是恒真');
  }
  // N4 动挂载行 ⇒ 既有钉线判据现形（证明挂载行必须逐字不动）
  {
    const P4 = brk(P0, A_MOUNT,
      '<div data-omniscient>${heartbeatBlock()}${evictBlock()}${randBlock()}${clockBlock()}${bridgeBlock()}</div>', 'N4');
    const env = envWith({ [PANEL]: P4 });
    const body = overviewBody(env);
    const n = foldsOf(body).length;
    a(n === 5, 'N4: 摘掉记忆桥挂载后折叠壳少一个（实 ' + n + '）⇒ 挂载行必须逐字不动');
    a(rd(PANEL).indexOf(A_MOUNT) > 0, 'N4b: 原版挂载行仍在（摘挂载只是隔离手段，不是「本来就没挂」）');
  }
  // N5 纯度：全部负控制跑完后原文件逐字未变
  a(rd(PANEL) === P0, 'N5:（纯度）全部负控制跑完后 ui/panel.js 逐字未变');
  a(rd(SELF_REL) === SELF0, 'N5b:（纯度）全部负控制跑完后本锁自身文件逐字未变 —— 负控制只许动内存副本');
  a(typeof SELF0 === 'string' && SELF0.length > 0 && rd(SELF_REL).length > 0,
    'N5b2:（纯度）本锁自身文件可读且非空（长度 ' + (SELF0 ? SELF0.length : 0) + '）');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC), runD: restoring(runD),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); runD(a); }),
  REL: PANEL
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  const run = function (fn, tag) {
    try { fn(a); } catch (e) { fail++; console.log('  x ' + tag + ' threw: ' + (e && e.stack)); }
  };
  run(runA, 'A'); run(runB, 'B'); run(runC, 'C'); run(runD, 'D');
  run(runNegative, 'N');
  if (fail) { console.log('OVERVIEW-FOLD-V2254: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('OVERVIEW-FOLD-V2254: pass（' + pass + ' 项）');
}