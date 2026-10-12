#!/usr/bin/env node
// WorldAxis tests/ev6-panel-nav-v2209.js — 面板导航协议与精确定位专锁（v2.209.0 优化 6）
//
// 【计划原文（plans/O_OPTIMIZATION.md §优化 6）逐条对照】
//   病灶（原文）：面板 24 页共用一个 `renderBody()`，跳转有三处写法 ——
//     ① 检索页 `#wa-hs-jumpface` 走 `tab.click()`：**只跳到页**，到了之后停在哪一条没人管；
//     ② 待办页只给路由字符串（「去哪看 / 看哪条 / 哪个设置键」），点不动；
//     ③ 图谱页连行清单都不渲染。
//     三处各自手写「切页 + 同步页签 + 落盘 + 重绘」，新增一处跳转就得把这四件事再抄一遍。
//   验收（原文）：检索 / 待办 / 图谱点击后**直接定位对应记录**；切页**不重复绑定**、
//     **不丢编辑内容**；**新增页面无需修改多个不相关的长代码段**。
//
// 【本锁四段】A 静态契约（协议与接线面）/ B 协议运行时（parse / attr / locate 的判据形态）
//   / C 端到端真点击（三处现场各点一次，判「真到了 + 真停在那一条」）
//   / D 编辑内容不丢（跨页往返）
//   / N 真源码破坏 + 两向自证（负控制三形与 H5/H6：真源码破坏 → 加载破坏副本 → 在副本上重跑同款真判据）
//
// 【本锁对计划原文的**如实偏离**（写在最前，不藏）】
//   偏离 1 验收「点击后直接定位」中的**滚动**：mini-DOM 的替身没有布局引擎（`offsetTop`
//     恒 undefined、`scrollTop` 是普通属性）。故本锁判「标上了命中类 + 落在唯一一处」，
//     不判「视口真的滚到了那一行」—— 后者属于真实宿主，本仓已有先例口径
//     （ui/ 改动须另走冒烟/实机核验）。滚动赋值本身有断言（值被写进去），但不声称它是像素级正确。
//   偏离 2 验收「新增页面无需修改多个不相关的长代码段」：本锁判的是**结构**（三页共用一处
//     `data-nav` 绑定 + 一处 `WA.ui.goPage()` 入口 + 页表单一真源），不判「新增一页时人不再犯」。
//     可判的那一面是「跳转流程只有一份实现」—— 用 N 段破坏它，看判据是否现形。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const NAV_REL = 'ui/panel-nav.js';
const PANEL_REL = 'ui/panel.js';
const IDX_REL = 'index.js';
const DIAG_REL = 'engines/tool-diag.js';
const SELF_REL = 'tests/ev6-panel-nav-v2209.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 破坏锚点：逐字取自产品源码，各恰 1 次（A8 验）。 */
const ANCHOR = {
  exportCount: "  var EXPORT_COUNT = 10;",
  recAttr: "  const REC_ATTR = 'data-rec';",
  hitClass: "  const HIT_CLASS = 'wa-hit';",
  ambiguous: "    if (hits.length > 1) return { ok: false, reason: 'rec-ambiguous', rec: key, n: hits.length };",
  notRendered: "    if (!hits.length) return { ok: false, reason: 'rec-not-rendered', rec: key, scanned: all.length };",
  pageTable: "    try { return (WA.ui && typeof WA.ui.pages === 'function') ? (WA.ui.pages() || []) : []; } catch (e) { return []; }",
  snapshotByPage: '    if (snap && snap.ok && cur) snaps[cur] = snap;',
  restoreTarget: '    const rs = restore(snaps[t.page], { keepScroll: !!t.rec });',
  singleEntry: "    const r = (WA.ui && typeof WA.ui.goPage === 'function')\n      ? WA.ui.goPage(t.page) : { ok: false, reason: 'ui-module-missing' };",
  goPageDecl: "    goPage(id, opt) {",
  badPage: "      if (known.indexOf(want) < 0) return { ok: false, reason: 'bad-page', page: want, known: known };",
  genericBind: "      (root || panelEl).querySelectorAll('[data-nav]').forEach(function (el) { if (bindNav(el)) n++; });",
  navBtnDecl: "  function navBtn(label, page, rec, filter, title) {",
  navAttrDecl: "  function navAttr(page, rec, filter) {",
  loadOrder: "    'ui/panel-nav.js',",
  modExports: "    'ui/panel-nav.js': 'panelNav',",
  optionalExports: "  const OPTIONAL_EXPORTS = ['ui', 'uiSettings', 'assistant', 'compat', 'renderPerf', 'panelNav',",
  uiNs: "    const UI_NS2800 = ['ui', 'uiSettings', 'assistant', 'renderPerf',\n      // v2.209.0（优化 6）：ui/panel-nav.js 是**第五个 UI 层模块**。本名单与\n      //   tests/export-contract.js 的 OPTIONAL 有互相比较的判据（两处口径必须一致），\n      //   故两边同批加同一项。\n      'panelNav',",
  // 三处目标页锚点（定位能落地的另一半）
  memRec: "'chronicle:' + x.ref",
  worldRec: "'places:' + r.name",
  graphRec: "String(n.kind) + ':' + String(n.id)",
  // 跳转按钮渲染期出口
  hsBtn: "navBtn('去看这条', (x.route || {}).page, rk, '',",
  tdBtn: "navBtn('去处理', page, rk, '',",
  graphBtn: "navBtn('看这条', wgPageOf(n.kind), rec, '',"
};
const TGT = {};
Object.keys(ANCHOR).forEach(function (k) { TGT[k] = NAV_REL; });
['goPageDecl', 'badPage', 'genericBind', 'navBtnDecl', 'navAttrDecl',
  'memRec', 'worldRec', 'graphRec', 'hsBtn', 'tdBtn', 'graphBtn'].forEach(function (k) { TGT[k] = PANEL_REL; });
TGT.loadOrder = IDX_REL;
['modExports', 'optionalExports'].forEach(function (k) { TGT[k] = DIAG_REL; });
TGT.uiNs = 'tests/run.js';
/** 协议导出面（逐字，跟实现走）。 */
const EXPORTS = ['parse', 'attr', 'fromAttr', 'go', 'backTo', 'locate', 'grab', 'restore', 'stat', 'diagnose'];
/** 拒收码（协议自己的现场清单）。 */
const REJECT_CODES = ['empty-target', 'no-page', 'no-page-table', 'bad-page', 'no-body', 'no-snapshot',
  'empty-rec', 'no-back', 'rec-not-rendered', 'rec-ambiguous', 'ui-module-missing'];
function stripComments(s) {
  //   行注释 `//` 与块注释 `/* … */` 都要剥。为什么块注释不能漏：协议文件头的沿革注释里
  //   写着「本模块不调时钟、不裸调 Date.now()」这类**句子**，只剥 `//` 时那句话会被当成
  //   真代码扫到 —— A2b 首跑的红就是这么来的（装置缺陷，不是产品真的读了时钟）。
  //   用状态机而不是正则：块注释跨行，正则要多行匹配且容易连字符串一起吃掉。
  let out = '', inBlock = false;
  for (let k = 0; k < s.length; k++) {
    if (!inBlock && s[k] === '/' && s[k + 1] === '*') { inBlock = true; k++; continue; }
    if (inBlock && s[k] === '*' && s[k + 1] === '/') { inBlock = false; k++; continue; }
    if (inBlock) continue;
    if (s[k] === '/' && s[k + 1] === '/') { while (k < s.length && s[k] !== '\n') k++; out += '\n'; continue; }
    out += s[k];
  }
  return out;
}
function runAll(a) {
  // 宿主基础桩由 tests/ui-gate-sync.js 在装载期装好（第 15 行 require('./mock.js')）——
  //   锁里不再装第二遍：本锁不自己拼环境，装载面单一真源。
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const NAV = rd(NAV_REL), P = rd(PANEL_REL), IDX = rd(IDX_REL), D = rd(DIAG_REL), SELF = rd(SELF_REL);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }
  function seed(WA, fn) { WA.store.init(); return WA.store.transact(fn, 'ev6:seed'); }
  // ════ A 段：静态契约 ════════════════════════════════════════════════
  a(NAV.indexOf('WA.panelNav = {') >= 0, 'ev6v2209/A1: 协议模块在位（ui/panel-nav.js 落到仓库里）');
  a(EXPORTS.every(function (m) { return NAV.indexOf(m + ': ' + m) >= 0; }),
    'ev6v2209/A1b: 导出面逐字齐（' + EXPORTS.length + ' 个：parse/attr/fromAttr/go/backTo/locate/grab/restore/stat/diagnose）');
  a(cnt(NAV, 'WA.panelNav = {') === 1, 'ev6v2209/A1c: 导出面只在一处装配（不散落）');
  a(NAV.indexOf("if (_exported !== EXPORT_COUNT) { throw new Error('panelNav: export count mismatch") >= 0,
    'ev6v2209/A1d: 导出计数自证在位（多一个少一个当场抛，不静默）');
  a(NAV.indexOf("WA.registerModule('ui/panel-nav.js', { kind: 'ui', ver: '2.209.0' })") >= 0,
    'ev6v2209/A1e: 协议自报模块身份与版本（2.209.0）');
  // 边界（全部否定式，逐条在源码里有实体）
  const code = stripComments(NAV);
  a(code.indexOf('store.transact(') < 0 && code.indexOf('localStorage.setItem(') < 0
    && code.indexOf('localStorage.getItem(') < 0,
    'ev6v2209/A2: 协议零 store 写、零 localStorage 直接读写（回程栈与留档都是进程态）');
  a(code.indexOf('Date.now(') < 0 && code.indexOf('performance.now(') < 0,
    'ev6v2209/A2b: 协议零时钟读取（剥掉行注释与块注释后仍零命中 —— 沿革注释里那句「不裸调 Date.now()」不算代码）');
  a(NAV.indexOf("(WA.ui && typeof WA.ui.pages === 'function')") >= 0,
    'ev6v2209/A2c: 页白名单取运行时 WA.ui.pages()（不自带第二份页表）');
  a(NAV.indexOf('不造第二份页表') >= 0 && NAV.indexOf('不落盘') >= 0 && NAV.indexOf('不替页面渲染') >= 0,
    'ev6v2209/A2d: 边界逐条写在源码里（不造页表 / 不落盘 / 不替渲染 / 定位零写入）');
  a(NAV.indexOf("return { ok: false, reason: 'rec-ambiguous'") >= 0
    && NAV.indexOf("return { ok: false, reason: 'rec-not-rendered'") >= 0,
    'ev6v2209/A2e: 定位判据是「命中 1 处才算成功」＋「0 处与 >1 处各自报码」（不猜）');
  // 接线面：装载顺序 + 登记面四处（缺一处就有一盏灯不亮）
  const io = IDX.indexOf("'ui/panel.js',"), in2 = IDX.indexOf("'ui/panel-nav.js',");
  a(io >= 0 && in2 > io, 'ev6v2209/A3: 协议排在 ui/panel.js **之后**装载（页表真源先就位）');
  a(IDX.indexOf("'ui/cyberpunk-theme.js',") > in2, 'ev6v2209/A3b: 协议插在 panel 与赛博朋克层之间（页序与装载序都读得出依赖）');
  a(cnt(D, "'ui/panel-nav.js': 'panelNav'") === 1, 'ev6v2209/A3c: 诊断清单覆盖新模块（全树盘查：漏登记即红灯）');
  a(D.indexOf("'panelNav',") >= 0, 'ev6v2209/A3d: 可选导出名单同步（无头环境缺席是「可选缺席」）');
  a(cnt(rd('tests/run.js'), "'panelNav',") >= 1 && cnt(rd('tests/export-contract.js'), "'panelNav',") >= 1,
    'ev6v2209/A3e: 冻结契约两处口径同步（UI_NS2800 与 export-contract 的 OPTIONAL）');
  // 面板侧：切页单一入口 + 通用绑定 + 渲染期出口
  a(P.indexOf('goPage(id, opt) {') >= 0, 'ev6v2209/A4: 面板有切页**单一入口** WA.ui.goPage（跳转只有一种写法）');
  a(cnt(P, 'currentPage = want;') === 1 && cnt(P, 'currentPage = __pageOr') === 1,
    'ev6v2209/A4b: `currentPage` 的写入点恰两处（初始化 + goPage 入口），别处不得直接改');
  a(P.indexOf('syncTabs(); renderBody(); __persistPanel();') >= 0,
    'ev6v2209/A4c: 三件套（同步页签 / 重绘 / 落盘）收在入口里 —— 新增跳转不必再抄一遍');
  //   判据要的是「全库只剩这一处在查 `[data-nav]`」，不是「这一行长成首版那样」。
  //   v2.209.0 收口后绑定进了 bindNavs()，选择器那一行必然带 `(root || panelEl)` 前缀
  //   （渲染期 / 出口补绑 / 切页补绑三处共用同一个根参数）。
  a(cnt(P, "querySelectorAll('[data-nav]')") === 1
    && P.indexOf("(root || panelEl).querySelectorAll('[data-nav]')") >= 0
    && P.indexOf('function bindNavs(root)') >= 0,
    'ev6v2209/A4d: data-nav 的绑定**恰一处**（全库只有 bindNavs 里那一行在查 `[data-nav]`，三处补绑共用它）');
  a(cnt(P, 'WA.ui.goPage(') >= 1, 'ev6v2209/A4e: tab 与协议都走 goPage（不自改 currentPage）');
  a(P.indexOf('data-nav="') >= 0 && P.indexOf('navAttr(page, rec, filter)') >= 0,
    'ev6v2209/A5: 面板只渲染协议给的串（navAttr 是渲染期唯一出口，不自己拼 page|rec|filter）');
  a(P.indexOf('#wa-nav-out') >= 0 && P.indexOf('#wa-nav-back') >= 0,
    'ev6v2209/A5b: 跳转读数与返回按钮常驻面板头（切页不把它冲掉）');
  // 三处现场：目标页也要打同一把键 —— 缺了它就只是「跳页」而不是「定位」
  a(P.indexOf("'chronicle:' + x.ref") >= 0, 'ev6v2209/A6: 记忆页编年史行打 chronicle:<ref> 锚点');
  a(P.indexOf("'places:' + r.name") >= 0, 'ev6v2209/A6b: 世界页地点行打 places:<名> 锚点');
  a(P.indexOf("'people:' + peopleIds[i]") >= 0, 'ev6v2209/A6c: 人物页行打 people:<存档键> 锚点');
  a(P.indexOf("kind + ':' + ref") >= 0, 'ev6v2209/A6d: 待办页行打 kind:ref 锚点');
  a(P.indexOf("String(n.kind) + ':' + String(n.id)") >= 0, 'ev6v2209/A6e: 图谱页节点打 kind:id 锚点（此前连行清单都没有）');
  // 同一把键在同一页只准出现一次（协议见到 >1 处会报 rec-ambiguous ⇒ 那条路等于死了）
  (function () {
    const lines = P.split('\n');
    const dup = [];
    lines.forEach(function (l, i) {
      // 同一**行**里同一个模板串出现两次即为重复（如 `<span data-rec="x">…</span><span data-rec="x">`）
      const m = l.match(/data-rec="/g);
      if (m && m.length > 1 && l.indexOf('rec ?') < 0) dup.push((i + 1) + ':' + m.length);
    });
    a(dup.length === 0, 'ev6v2209/A6f: 单行内 data-rec 不重复打（重复 ⇒ 每次定位都 rec-ambiguous，实 ' + j(dup) + '）');
  })();
  // 三处跳转按钮走同一渲染出口（navBtn）
  ['hsBtn', 'tdBtn', 'graphBtn'].forEach(function (k) {
    a(P.indexOf(ANCHOR[k]) >= 0, 'ev6v2209/A7[' + k + ']: 跳转按钮走 navBtn（三处现场同一出口，不是三种写法）');
  });
  a(cnt(P, 'navBtn(') >= 4, 'ev6v2209/A7b: navBtn 至少四处消费（三处现场 + 声明，实 ' + cnt(P, 'navBtn(') + '）');
  // 锚点纯度与唯一性（H5：判据层内锚点字面量只准声明一次；判据不得引用锚点串做自指）
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1,
      'ev6v2209/A8: 锚点 ' + k + ' 在目标文件里恰中 1 次（实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + '）');
    a(cnt(anchorDecl, '\n  ' + k + ': ') === 1,
      'ev6v2209/A8b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（实 ' + cnt(anchorDecl, '\n  ' + k + ': ') + '）');
  });
  (function () {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'ev6v2209/A8c: 锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
  })();
  // 拒收码：协议自报的码不许是「想当然」—— 逐个在源码里有字面量
  REJECT_CODES.forEach(function (c) {
    a(NAV.indexOf("'" + c + "'") >= 0, 'ev6v2209/A9[' + c + ']: 拒收码有实体（不是先写文档后补代码）');
  });
  return runRest(a, { gate: gate, env0: env0, seed: seed, NAV: NAV, P: P,
    ANCHOR: ANCHOR, TGT: TGT, NAV_REL: NAV_REL, PANEL_REL: PANEL_REL });
}
// ════ B/C/D 段：运行时 ═══════════════════════════════════════════
function runRest(a, C) {
  const gate = C.gate, env0 = C.env0, seed = C.seed;
  function mkEnv() {
    const env = env0();
    const WA = env.WA;
    seed(WA, function (d) {
      d.chronicle = [{ id: 'c1', title: '开场', summary: '扁担巷的茶楼老板姓周', at: 3 },
        { id: 'c2', title: '第二章', summary: '无事发生', at: 7 }];
      d.people = { A: { name: '茶楼老板', location: '扁担巷' }, B: { name: '老周', location: '南街' } };
      d.evolution = { factions: [{ name: '义顺堂', kind: 'guild', members: [{ name: '老周' }] }] };
      d.region = { places: [{ name: '扁担巷', distanceDays: 2, lane: '官道' }], events: [] };
    });
    try { if (WA.chronicleView) WA.chronicleView.setSettings({ enabled: true }); } catch (e) {}
    try { if (WA.wbSearch && WA.wbSearch.seedEntries) WA.wbSearch.seedEntries([]); } catch (e) {}
    return env;
  }
  function nav(env) { return env.WA.panelNav; }
  // ① 协议规范化：四种拒收 + 一种放行（判据先在协议自己那一层立住）
  {
    const env = mkEnv(), N = nav(env);
    const r1 = N.parse(null);
    a(r1.ok === false && r1.reason === 'empty-target', 'ev6v2209/B1: 空目标 ⇒ empty-target（实 ' + j(r1 && r1.reason) + '）');
    const r2 = N.parse('');
    a(r2.ok === false && r2.reason === 'no-page', 'ev6v2209/B1b: 只有分隔符 ⇒ no-page（实 ' + j(r2 && r2.reason) + '）');
    const r3 = N.parse('没有这一页');
    a(r3.ok === false && r3.reason === 'bad-page' && r3.known.length > 0,
      'ev6v2209/B1c: 非法页 ⇒ bad-page **且带出认得的集合**（实 known ' + (r3.known || []).length + ' 个）');
    const r4 = N.parse({ page: 'people', rec: 'people:A' });
    a(r4.ok === true && r4.target.page === 'people' && r4.target.rec === 'people:A',
      'ev6v2209/B1d: 正常目标解析出 {page, rec, filter}（实 ' + j(r4 && r4.target) + '）');
    const r5 = N.parse({ page: 'world', rec: '含|竖线与%百分号' });
    const dec = N.fromAttr(N.attr({ page: 'world', rec: '含|竖线与%百分号' }));
    a(r5.ok && dec.ok && dec.target.rec === '含|竖线与%百分号',
      'ev6v2209/B1e: 编码往返逐字相同（含分隔符与转义字符，实 ' + j(dec && dec.target && dec.target.rec) + '）');
    a(N.attr({ page: '没有这一页' }) === '', 'ev6v2209/B1f: 非法目标编码成空串（渲染侧据此**不渲染** data-nav 属性，而不是渲染一个点了会错的跳转）');
    a(cnt(N.attr({ page: 'people', rec: 'people:A' }), '|') === 2, 'ev6v2209/B1g: 三次编码恰两个分隔符（格式只有一份）');
  }
  // ② 定位判据：0 处 / 1 处 / >1 处三态（**不猜**）
  {
    const env = mkEnv(), WA = env.WA, N = nav(env), dom = env.dom;
    function goto(page) {
      const p = dom.getElementById('wa-panel');
      const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
      tab.click();
      return dom;
    }
    goto('people');
    const body = dom.getElementById('wa-panel').querySelector('.wa-body');
    const m1 = N.locate('people:A');
    a(m1.ok === true && m1.marked === true, 'ev6v2209/B2: 目标页真的渲染了这条 ⇒ locate 命中恰 1 处（实 ' + j(m1 && m1.reason || 'ok') + '）');
    const marked = body.querySelectorAll('.wa-hit');
    a(marked.length === 1, 'ev6v2209/B2b: 命中类只标在**一处**（实 ' + marked.length + ' 处）—— 高亮不是「到处都亮」');
    const m0 = N.locate('people:根本不存在的键');
    a(m0.ok === false && m0.reason === 'rec-not-rendered' && m0.scanned > 0,
      'ev6v2209/B2c: 0 处 ⇒ rec-not-rendered 且报出**扫过几处**（实 scanned ' + (m0 && m0.scanned) + '）——「没渲染出来」不许与「定位成功」同形');
    a(body.querySelectorAll('.wa-hit').length === 0, 'ev6v2209/B2d: 一次失败的定位会把上一处高亮摘掉（否则场上有两个「当前」）');
    // >1 处：真造一次重名 —— 往同一页塞两条同键行
    //   前置：下面两条同键探针要**手造节点** —— 迷你 DOM 不支持 createElement 时它们就是空转，
    //   故先把能力面判出来（旧版这里是一条恒真断言，等于什么都没判）。
    a(typeof dom.createElement === 'function' && typeof dom.body.appendChild === 'function',
      'ev6v2209/B2e: （前置）迷你 DOM 支持 createElement/appendChild —— 下面两条同键探针才有意义');
    // 用协议自己的判据造：手写两个带同一 data-rec 的节点插进 body
    const b1 = dom.createElement('div'); b1.setAttribute('data-rec', 'probe:dup');
    const b2 = dom.createElement('div'); b2.setAttribute('data-rec', 'probe:dup');
    body.appendChild(b1); body.appendChild(b2);
    const m2 = N.locate('probe:dup');
    a(m2.ok === false && m2.reason === 'rec-ambiguous' && m2.n === 2,
      'ev6v2209/B2f: >1 处 ⇒ rec-ambiguous 并报出几处（实 ' + (m2 && m2.n) + '）—— 不猜一条出来（猜了用户会以为定位是对的）');
    body.removeChild(b1); body.removeChild(b2);
    const m3 = N.locate('');
    a(m3.ok === false && m3.reason === 'empty-rec', 'ev6v2209/B2g: 空记录键 ⇒ empty-rec（不把「没给键」当成「找到了空键」）');
    a(JSON.stringify(WA.store.get()).indexOf('probe:dup') < 0, 'ev6v2209/B2h: 定位全程零写入（世界状态里没有探针痕迹）');
  }
  // ③ 切页不重复绑定（协议与面板各判一次）
  {
    const env = mkEnv(), WA = env.WA, N = nav(env), dom = env.dom;
    const p = dom.getElementById('wa-panel');
    const pager = function (page) {
      const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
      tab.click();
    };
    pager('find'); pager('people'); pager('find');
    //   检索页的跳转控件是**渲染期之后**才被填进出口的（结果行里的 navBtn）——
    //   首屏当然一个都没有。旧版直接数首屏，等于把「还没查」判成「控件不存在」。
    const q3 = dom.getElementById('wa-hs-q'); if (q3) q3.value = '老周';
    const go3 = dom.getElementById('wa-hs-go'); if (go3 && typeof go3.onclick === 'function') go3.onclick({ target: go3 });
    const btns = p.querySelector('.wa-body').querySelectorAll('[data-nav]');
    a(btns.length > 0, 'ev6v2209/B3: 检索结果渲染出带 data-nav 的控件（实 ' + btns.length + ' 个）');
    let bound = 0;
    btns.forEach(function (b) { if (typeof b.onclick === 'function') bound++; });
    a(bound === btns.length, 'ev6v2209/B3b: 每个 data-nav 控件都绑上了（' + bound + '/' + btns.length + '）—— 通用绑定覆盖全页');
    // 重复切页后控件是新的（整块重建），绑定数不累积。
    //   ⚠ 切页会把 `.wa-body` 整块重建 ⇒ 检索结果出口随 body 一起清空，回来时首屏
    //   必然零控件。故这里要**重跑一次同样的操作**再比：这一条验的是「重复操作不累积」，
    //   不是「出口会被缓存」（后者是错的口径，会得到 2 vs 0 的恒红或 0 vs 0 的恒真）。
    pager('people'); pager('find');
    const q4 = dom.getElementById('wa-hs-q'); if (q4) q4.value = '老周';
    const go4 = dom.getElementById('wa-hs-go'); if (go4 && typeof go4.onclick === 'function') go4.onclick({ target: go4 });
    const btns2 = p.querySelector('.wa-body').querySelectorAll('[data-nav]');
    let bound2 = 0;
    btns2.forEach(function (b) { if (typeof b.onclick === 'function') bound2++; });
    a(btns2.length > 0 && bound2 === btns2.length,
      'ev6v2209/B3c: 来回切页后重跑同一操作，新控件仍然各绑一次（' + bound2 + '/' + btns2.length + '，不累积）');
    a(btns2.length === btns.length, 'ev6v2209/B3d: 同页两次同样操作后控件数相同（实 ' + btns.length + ' vs ' + btns2.length + '）—— 绑定不是把控件也复制一份');
  }
  // ④ 编辑内容不丢：跨页往返（验收原文第三条）
  {
    const env = mkEnv(), WA = env.WA, N = nav(env), dom = env.dom;
    const p = dom.getElementById('wa-panel');
    const pager = function (page) {
      const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
      tab.click();
    };
    pager('world');
    const bg = dom.getElementById('wa-bg');
    a(!!bg, 'ev6v2209/B4: 世界页的背景输入框在场（拿它当「未提交的编辑内容」的载体）');
    bg.value = '探针：尚未保存的世界背景';
    const r = N.go({ page: 'people' });
    a(r.ok === true && r.page === 'people', 'ev6v2209/B4b: 走协议切到人物页（实 ' + j(r && r.page) + '）');
    a(!!r.restored, 'ev6v2209/B4c: 协议返回回填读数（首次进入该页时如实为 no-snapshot，不假称填上了）');
    const back = N.backTo();
    a(back.ok === true && back.page === 'world', 'ev6v2209/B4d: 返回原页（实 ' + j(back && back.page) + '）');
    const bg2 = dom.getElementById('wa-bg');
    a(!!bg2 && bg2.value.indexOf('探针：尚未保存的世界背景') >= 0,
      'ev6v2209/B4e: **回来时输入内容还在**（实 ' + j(String(bg2 && bg2.value).slice(0, 24)) + '，验收原文第三条）');
    // 反向自证：不走协议、直接点页签 —— 面板自己的语义是「切页就是换内容」，那**不**该被算成缺陷
    const bg3 = dom.getElementById('wa-bg');
    bg3.value = '第二段探针';
    pager('people');
    pager('world');
    const bg4 = dom.getElementById('wa-bg');
    a(bg4 && bg4.value.indexOf('第二段探针') < 0,
      'ev6v2209/B4f: （如实边界）**不经协议**的直接切页不保输入（0 除外）—— 隔离件的能力面不许被吹成面板的通性');
  }
  // ⑤ 端到端真点击：检索页 → 人物页并定位到那一行（验收原文第一条）
  {
    const env = mkEnv(), WA = env.WA, dom = env.dom;
    const p = dom.getElementById('wa-panel');
    const pager = function (page) {
      const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
      tab.click();
    };
    pager('find');
    const q = dom.getElementById('wa-hs-q');
    q.value = '老周';
    const goBtn = dom.getElementById('wa-hs-go');
    goBtn.onclick({ target: goBtn });
    const body0 = p.querySelector('.wa-body');
    const navBtns = body0.querySelectorAll('[data-nav]');
    a(navBtns.length > 0, 'ev6v2209/B5: 检索结果里出现跳转控件（实 ' + navBtns.length + ' 个）');
    let clicked = null, err = null;
    try { clicked = navBtns[0]; clicked.onclick({ target: clicked }); } catch (e) { err = String((e && e.message) || e); }
    a(err === null, 'ev6v2209/B5b: 点跳转不抛（实 ' + j(err) + '）');
    a(WA.ui.currentPage() !== 'find', 'ev6v2209/B5c: 真换了页（实 ' + j(WA.ui.currentPage()) + '）');
    const out = dom.getElementById('wa-nav-out');
    const txt = out ? String(out.textContent) : '';
    a(txt.indexOf('已到') >= 0, 'ev6v2209/B5d: 头部读数如实报「已到 <页>」（实 ' + j(txt.slice(0, 40)) + '）—— 跳转结果对人可见');
    a(txt.indexOf('定位') >= 0 && (txt.indexOf('命中 1 处') >= 0 || txt.indexOf('未命中') >= 0),
      'ev6v2209/B5e: 头部读数**把定位单独报出来**（命中 / 未命中各说一句，不合成一句「跳转成功」）');
    a(WA.ui.currentPage() === 'people', 'ev6v2209/B5f: 落到了路由表指定的页 people（实 ' + j(WA.ui.currentPage()) + '）');
    const hit = p.querySelector('.wa-body').querySelectorAll('.wa-hit');
    a(hit.length === 1, 'ev6v2209/B5g: 目标行被标出来（实 ' + hit.length + ' 处）—— 这就是「直接定位对应记录」的可判形态');
    a(hit.length === 1 && hit[0].getAttribute('data-rec') === 'people:B',
      'ev6v2209/B5h: 标的正是那一条（data-rec = ' + j(hit.length ? hit[0].getAttribute('data-rec') : null) + '，期望 people:B）');
  }
  // ⑥ 端到端：待办页 → 来源页并定位（三处现场第二个）
  {
    const env = mkEnv(), WA = env.WA, dom = env.dom;
    try { if (WA.pendingCenter) WA.pendingCenter.setSettings({ enabled: true }); } catch (e) {}
    //   ⚠ 夹具：统一视图开了还不够 —— 来源模块自己默认是关的，不造一条就**没有待办行**，
    //   下面的「跳转 / 定位」两条便在空集上恒真（旧版正是如此，B6c 写着 `>= 0` 也拦不住）。
    try { if (WA.commission) WA.commission.setSettings({ enabled: true }); } catch (e) {}
    let madeOk = false;
    try {
      if (WA.commission && typeof WA.commission.create === 'function') {
        const cr = WA.commission.create({ title: '护送商队', principal: '老周', agent: '义顺堂',
          stages: [{ name: '接洽', need: '一句话' }] });
        madeOk = !!(cr && cr.ok);
      }
    } catch (e) {}
    a(madeOk, 'ev6v2209/B6a: （前置）夹具真造出一条待办（否则下面点到的是空页，判据在空集上恒真）');
    const p = dom.getElementById('wa-panel');
    const pager = function (page) {
      const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
      tab.click();
    };
    pager('todo');
    const all = dom.getElementById('wa-td-all');
    a(!!all && typeof all.onclick === 'function', 'ev6v2209/B6: 待办页「全部待办」控件在场且已绑定');
    if (all) {
      let err = null;
      try { all.onclick({ target: all }); } catch (e) { err = String((e && e.message) || e); }
      a(err === null, 'ev6v2209/B6b: 点「全部待办」不抛（实 ' + j(err) + '）');
      const btns = p.querySelector('.wa-body').querySelectorAll('[data-nav]');
      // 待办页的跳转控件来自行内 navBtn；夹具下可能零条待办 ⇒ 那是「没东西可跳」，不是缺陷
      const recs = p.querySelector('.wa-body').querySelectorAll('[data-rec]');
      a(recs.length >= 1, 'ev6v2209/B6c: 待办行带着记录锚点渲染出来（实 ' + recs.length + ' 行带 data-rec）'
        + ' —— 旧版这里是 `>= 0`，等于「扫完就算过」，空集也能过');
      if (btns.length) {
        const b = btns[0];
        let e2 = null;
        try { b.onclick({ target: b }); } catch (e) { e2 = String((e && e.message) || e); }
        a(e2 === null, 'ev6v2209/B6d: 点待办行的跳转不抛（实 ' + j(e2) + '）');
        const out = dom.getElementById('wa-nav-out');
        a(out && String(out.textContent).indexOf('已到') >= 0,
          'ev6v2209/B6e: 待办跳转会到来源页并留读数（实 ' + j(String(out && out.textContent).slice(0, 40)) + '）');
        //   落点页 ≠ 归属页：`describe().page` 是分组用的归属（commission → people），
        //   而那条记录**渲染在 events 页的五段清单里**。拿归属当落点 ⇒ 每次都
        //   `rec-not-rendered`（页到了、那条不在）。这条正是优化 6 的第二条真缺陷。
        const d = (WA.pendingCenter && typeof WA.pendingCenter.describe === 'function')
          ? (WA.pendingCenter.describe('commission') || null) : null;
        const seePage = (d && d.seePage) || null;
        const owner = (d && d.page) || null;
        a(!!seePage, 'ev6v2209/B6f: 引擎报出落点（describe().seePage，实 ' + j(seePage) + '）—— 归属与落点是两个读数');
        a(seePage === WA.ui.currentPage(),
          'ev6v2209/B6g: 跳转落在**落点页**而不是归属页（现 ' + j(WA.ui.currentPage()) + '，落点 ' + j(seePage)
          + '，归属 ' + j(owner) + '）—— commission 的归属是 people，但它渲染在 events');
      }
    }
  }
  // ⑦ 端到端：图谱页建图 → 节点清单 → 跳转（三处现场第三个：此前连行清单都没有）
  {
    const env = mkEnv(), WA = env.WA, dom = env.dom;
    const p = dom.getElementById('wa-panel');
    const pager = function (page) {
      const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
      tab.click();
    };
    pager('graph');
    const build = dom.getElementById('wa-wg-build');
    a(!!build && typeof build.onclick === 'function', 'ev6v2209/B7: 图谱页「建图」控件在场且已绑定');
    if (build) {
      let err = null;
      try { build.onclick({ target: build }); } catch (e) { err = String((e && e.message) || e); }
      a(err === null, 'ev6v2209/B7b: 建图不抛（**首版现场**：wgNodesHtml 曾未定义，这一点下去就是 ReferenceError）');
      const out = dom.getElementById('wa-wg-out');
      const txt = out ? String(out.textContent) : '';
      a(txt.indexOf('节点清单') >= 0, 'ev6v2209/B7c: 图谱页渲染出节点清单（此前连行清单都没有，实截 ' + j(txt.slice(0, 40)) + '）');
      a(txt.indexOf('建图') >= 0, 'ev6v2209/B7d: 建图读数在场（节点 / 边计数）');
      const recs = p.querySelector('.wa-body').querySelectorAll('[data-rec]');
      a(recs.length > 0, 'ev6v2209/B7e: 节点带记录锚点（实 ' + recs.length + ' 处）—— 图谱也进了「可定位」这张网');
      const one = recs[0];
      const rk = one.getAttribute('data-rec');
      a(/^[a-z]+:/.test(String(rk)), 'ev6v2209/B7f: 节点键形如 kind:id（实 ' + j(rk) + '）');
      const btns = p.querySelector('.wa-body').querySelectorAll('[data-nav]');
      a(btns.length > 0, 'ev6v2209/B7g: 节点行带跳转控件（实 ' + btns.length + ' 个）');
      if (btns.length) {
        let e2 = null;
        try { btns[0].onclick({ target: btns[0] }); } catch (e) { e2 = String((e && e.message) || e); }
        a(e2 === null, 'ev6v2209/B7h: 点节点跳转不抛（实 ' + j(e2) + '）');
      }
    }
  }
  // ⑧ 读数自证：协议在自己的读数上可被核对（且**读数不改变被观测对象**）
  {
    const env = mkEnv(), N = nav(env), dom = env.dom;
    const p = dom.getElementById('wa-panel');
    const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'people'; })[0];
    tab.click();
    N.locate('people:A');
    const before = dom.getElementById('wa-panel').querySelector('.wa-body').querySelectorAll('.wa-hit').length;
    const st = N.stat();
    const after = dom.getElementById('wa-panel').querySelector('.wa-body').querySelectorAll('.wa-hit').length;
    a(before === 1 && after === 1, 'ev6v2209/B8: **读数不改变被观测对象**（调 stat() 前后高亮数不变：' + before + ' → ' + after + '）');
    a(typeof st.goes === 'number' && typeof st.located === 'number' && st.capBack > 0,
      'ev6v2209/B8b: stat() 报计数与栈上限（实 ' + j({ goes: st.goes, located: st.located, capBack: st.capBack }) + '）');
    const d = N.diagnose();
    a(d.ok === true && d.pages > 0 && Array.isArray(d.stack),
      'ev6v2209/B8c: diagnose() 报页数 / 栈 / 命中类（实 pages ' + d.pages + '，栈深 ' + d.stack.length + '）');
    a(typeof d.cachedPages === 'number', 'ev6v2209/B8d: 自证面报「按页留档了几页」（否则这一层状态不可观测）');
    a(N.stat().faults && typeof N.stat().faults === 'object', 'ev6v2209/B8e: 拒收逐码计数进 faults（拒收不是静默）');
  }
  // ⑨ 回程栈有界（无界栈会把「回退」变成记忆负担；也要判它真的限长）
  {
    const env = mkEnv(), N = nav(env);
    const pages = env.WA.ui.pages();
    let guard = 0;
    for (let i = 0; i < 20 && guard < 40; i++) {
      const t = pages[i % pages.length];
      N.go({ page: t });
      guard++;
    }
    const d = N.diagnose();
    a(d.backDepth <= d.capBack, 'ev6v2209/B9: 回程栈有界（实 ' + d.backDepth + ' ≤ ' + d.capBack + '）');
    a(d.capBack === 8, 'ev6v2209/B9b: 栈上限是显式常量 8（实 ' + d.capBack + '）');
    a(d.backDepth > 0, 'ev6v2209/B9c: （反空转）确实推过栈（实 ' + d.backDepth + '）—— 上面那条不是「恒 0 ≤ 8」');
  }
  // ════ N 段：真源码破坏 + 两向自证 ════════════════════════════════
  //   纪律（负控制三形 + H5/H6）：① 破坏发生在**真源码**上（锚点恰中 1 次）；
  //   ② 破坏副本经 srcOverride 装载（零文件改写）；③ 在**副本上重跑同款判据**；
  //   ④ 原版上同判据必须真（反向自证）——否则「破坏现形」可能只是判据恒红。
  function probe(ov, fn) {
    let env = null, err = null, ret = null;
    try { env = gate.fresh({ srcOverride: ov }); ret = fn(env); }
    catch (e) { err = String((e && e.message) || e); }
    return { env: env, err: err, ret: ret };
  }
  function mutated(rel, from, to, label) {
    const src = rd(rel);
    if (cnt(src, from) !== 1) return { ok: false, why: '锚点不唯一(' + label + '): ' + cnt(src, from) };
    return { ok: true, src: src.replace(from, to), rel: rel };
  }
  const CASES = [];
  // N1：定位判据退化成「命中就成功」⇒ >1 处必须被报出来（原版报 ambiguous）
  CASES.push({
    name: 'N1 定位不区分「多处命中」',
    rel: NAV_REL,
    from: ANCHOR.ambiguous,
    to: "    if (hits.length > 1) return { ok: true, rec: key, n: hits.length, degraded: true };",
    drive: function (env) {
      const N = env.WA.panelNav, dom = env.dom;
      const p = dom.getElementById('wa-panel');
      p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'people'; })[0].click();
      const body = p.querySelector('.wa-body');
      const b1 = dom.createElement('div'); b1.setAttribute('data-rec', 'probe:dup');
      const b2 = dom.createElement('div'); b2.setAttribute('data-rec', 'probe:dup');
      body.appendChild(b1); body.appendChild(b2);
      const r = N.locate('probe:dup');
      return !(r && r.ok === false && r.reason === 'rec-ambiguous');
    },
    assertion: 'ev6v2209/N1: 破坏「>1 处不猜」之后，同款判据当场现形（报出了 ambiguous 而不是默认成功）'
  });
  // N2：同一把键打两处 ⇒ 定位致残（这是**真发生过的**缺陷：待办行空 span 那个）
  //   夹具要求（首版就是这里不成立）：① 待办中心 enabled；② **来源模块自己也 enabled**
  //   —— commission 这类引擎默认关，只开统一视图是拿不到行的；③ 真造一条委托。
  //   三条缺一条，recs 就是 0，判据便在空集上恒真（那不是「破坏没现形」，是**夹具没到位**）。
  CASES.push({
    name: 'N2 定位键在同一页重复',
    rel: PANEL_REL,
    from: "      return '　· ' + (rk ? '<span data-rec=\"' + esc(rk) + '\">' : '') + esc(String((x && x.title) || '(未命名)'))\n        + (rk ? '</span>' : '')",
    to: "      return '　· ' + (rk ? '<span data-rec=\"' + esc(rk) + '\">' : '') + esc(String((x && x.title) || '(未命名)'))\n        + (rk ? '</span>' : '') + (rk ? '<span data-rec=\"' + esc(rk) + '\"></span>' : '')",
    drive: function (env) {
      const WA = env.WA, N = WA.panelNav, dom = env.dom, p = dom.getElementById('wa-panel');
      //   ① 统一视图开；② 来源模块自己开；③ 造一条真委托（阶段数 ≥1 才能建）
      try { if (WA.pendingCenter) WA.pendingCenter.setSettings({ enabled: true }); } catch (e) {}
      try { if (WA.commission) WA.commission.setSettings({ enabled: true }); } catch (e) {}
      try {
        if (WA.commission && typeof WA.commission.create === 'function') {
          WA.commission.create({ title: '护送商队', principal: '老周', agent: '义顺堂',
            stages: [{ name: '接洽', need: '一句话' }] });
        }
      } catch (e) {}
      p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'todo'; })[0].click();
      const all = dom.getElementById('wa-td-all');
      if (all && typeof all.onclick === 'function') all.onclick({ target: all });
      const recs = p.querySelector('.wa-body').querySelectorAll('[data-rec]');
      if (!recs.length) return false;   // 夹具下没有待办行 ⇒ 这一例不成立（不许算成「现形」）
      const rk = recs[0].getAttribute('data-rec');
      const r = N.locate(rk);
      //   破坏后：同一把键在**行内**出现两次 ⇒ locate 报 rec-ambiguous ⇒ 判据现形
      return !(r && r.ok === true);
    },
    assertion: 'ev6v2209/N2: 破坏「同一键只打一处」之后，定位当场变 ambiguous（这条缺陷真的来过一次）'
  });
  // N3：切页单一入口被绕开（跳转自己改 currentPage）⇒ 结构判据现形
  CASES.push({
    name: 'N3 跳转绕过单一入口',
    rel: NAV_REL,
    from: ANCHOR.singleEntry,
    to: "      const r = (function () { try { return { ok: true, changed: true }; } catch (e) { return { ok: false, reason: 'go-refused' }; } })();\n      if (!r || r.ok !== true) {\n        note((r && r.reason) || 'go-refused');\n        return { ok: false, reason: (r && r.reason) || 'go-refused', known: (r && r.known) || [] };\n      }",
    drive: function (env) {
      const WA = env.WA, N = WA.panelNav;
      const before = WA.ui.currentPage();
      const r = N.go({ page: 'people' });
      // 绕过入口后：协议自报成功，但**页面根本没换** —— 这正是「看起来成功了」的形态
      return !(r && r.ok === true && WA.ui.currentPage() !== before);
    },
    assertion: 'ev6v2209/N3: 跳转绕过 WA.ui.goPage 之后，同款判据当场现形（报成功但页没换）'
  });
  // N4：页白名单自造副本（不再取 WA.ui.pages()）⇒ 与真实页表脱节
  CASES.push({
    name: 'N4 页白名单自造副本',
    rel: NAV_REL,
    from: ANCHOR.pageTable,
    to: "    try { return ['overview']; } catch (e) { return []; }",
    drive: function (env) {
      const WA = env.WA, N = WA.panelNav;
      //   判据要的是「真页表里有的页不被判非法」：读的是 `N.parse()` 自己的返回值，
      //   不受页表被换掉之后的影响（旧版读 r.target 上的 known —— 那个字段根本不存在，
      //   于是判据恒真、变成一条恒红的假证据）。
      const ok = N.parse({ page: 'people' });
      const bad = N.parse({ page: '根本没有这一页' });
      const known = (bad && bad.known) || [];
      const pages = (WA.ui && typeof WA.ui.pages === 'function') ? (WA.ui.pages() || []) : [];
      if (pages.indexOf('people') < 0) return false;   // 原版页表里就没有这一页 ⇒ 这一例不成立
      // 自造副本后：真实存在的页被判成非法（且带出的「认得集合」缩成副本那一项）
      return !(ok && ok.ok === true && known.indexOf('people') >= 0);
    },
    assertion: 'ev6v2209/N4: 页白名单自造副本之后，真实页被判非法（判据与 WA.ui.pages() 脱节当场现形）'
  });
  // N5：回填拿「刚离开那页」的快照顶替「目标页自己的」⇒ 跨页错配
  CASES.push({
    name: 'N5 回填跨页错配',
    rel: NAV_REL,
    from: ANCHOR.restoreTarget,
    to: '    const rs = restore(snap, { keepScroll: !!t.rec });',
    drive: function (env) {
      const WA = env.WA, N = WA.panelNav, dom = env.dom;
      const p = dom.getElementById('wa-panel');
      const pager = function (pg) { p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === pg; })[0].click(); };
      pager('world');
      const bg = dom.getElementById('wa-bg');
      if (!bg) return false;
      bg.value = '错配探针';
      N.go({ page: 'people' });         // 离开 world（快照存起来）
      const r = N.go({ page: 'world' }); // 回到 world：应回填 world 自己的旧态
      const bg2 = dom.getElementById('wa-bg');
      return !(bg2 && String(bg2.value).indexOf('错配探针') >= 0);
    },
    assertion: 'ev6v2209/N5: 回填改成「拿刚离开那页的快照」之后，跨页往返**丢输入**（这条缺陷被钉住了）'
  });
  // N6：按页留档被摘掉 ⇒ 回来时内容丢
  CASES.push({
    name: 'N6 按页留档缺席',
    rel: NAV_REL,
    from: ANCHOR.snapshotByPage,
    to: '    if (false && snap && snap.ok && cur) snaps[cur] = snap;',
    drive: CASES[CASES.length - 1].drive,
    assertion: 'ev6v2209/N6: 摘掉按页留档之后，返回原页输入同样丢（两处各自都是承重件，只留一处不够）'
  });
  // N7：data-nav 的通用绑定被摘掉 ⇒ 页面上只剩「点了没反应」的控件
  CASES.push({
    name: 'N7 通用绑定缺席',
    rel: PANEL_REL,
    from: ANCHOR.genericBind,
    to: "    panelEl.querySelectorAll('[data-nav]').forEach(el => el.onclick = null);",
    drive: function (env) {
      const WA = env.WA, dom = env.dom, p = dom.getElementById('wa-panel');
      p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'find'; })[0].click();
      const q = dom.getElementById('wa-hs-q'); if (q) q.value = '老周';
      const go = dom.getElementById('wa-hs-go'); if (go) go.onclick({ target: go });
      const btns = p.querySelector('.wa-body').querySelectorAll('[data-nav]');
      if (!btns.length) return false;
      const before = WA.ui.currentPage();
      //   破坏形态是 `onclick = null` ⇒ 点击直接抛 TypeError。**抛也是「点了没反应」**，
      //   而且更坏（异常逃逸到事件循环）。故这里兜住并算作现形，不让它变成
      //   「破坏副本驱动抛异常」那条装置红灯。
      try { btns[0].onclick({ target: btns[0] }); } catch (e) { return true; }
      return !(WA.ui.currentPage() !== before);
    },
    assertion: 'ev6v2209/N7: 摘掉通用绑定之后，跳转控件点了页不动（「点了没反应」这种最坏形态当场现形）'
  });
  // N8：跳转按钮不再走 navBtn 的编码出口（自己拼串）⇒ 编码格式出现第二份
  CASES.push({
    name: 'N8 渲染期出口被绕开',
    rel: PANEL_REL,
    from: ANCHOR.navBtnDecl,
    //   破坏有两条腿，缺一不可：① 分隔符换成 `/`（格式出现第二份）；② **不编码**
    //   （`esc` 不是编码 —— 旧版只把 `|` 换成 `|`，与正版逐字同形，破坏等于没发生）。
    to: "  function navBtn(label, page, rec, filter, title) {\n    const a = String(page) + '/' + String(rec);\n    if (!a) return '';\n    return '<button class=\"wa-btn wa-mini wa-navbtn\" data-nav=\"' + esc(a) + '\"' + (title ? ' title=\"' + esc(title) + '\"' : '') + '>' + esc(label) + '</button>';\n  }\n  function navBtnDead(label, page, rec, filter, title) {",
    drive: function (env) {
      const WA = env.WA, N = WA.panelNav, dom = env.dom;
      const p = dom.getElementById('wa-panel');
      p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'find'; })[0].click();
      const q = dom.getElementById('wa-hs-q'); if (q) q.value = '老周';
      const go = dom.getElementById('wa-hs-go'); if (go) go.onclick({ target: go });
      const btn = p.querySelector('.wa-body').querySelectorAll('[data-nav]')[0];
      if (!btn) return false;
      const attr = String(btn.getAttribute('data-nav'));
      const decoded = N.fromAttr(attr);
      // 自拼串（未编码）在记录键含分隔符/中文时解不出来 —— 判据是「往返逐字」
      return !(decoded && decoded.ok === true && decoded.target.page === 'people');
    },
    assertion: 'ev6v2209/N8: 绕开 navAttr 自己拼串之后，往返解不出目标（「第二份格式」这件事当场现形）'
  });
  // N9：目标页锚点被摘掉 ⇒ 页到了但停不到那一条（「跳页冒充定位」）
  CASES.push({
    name: 'N9 目标页锚点缺席',
    rel: PANEL_REL,
    from: ANCHOR.memRec,
    to: "'chronicleX:' + x.ref",
    drive: function (env) {
      const WA = env.WA, N = WA.panelNav, dom = env.dom;
      const p = dom.getElementById('wa-panel');
      p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'memory'; })[0].click();
      const r = N.locate('chronicle:c1');
      return !(r && r.ok === true);
    },
    assertion: 'ev6v2209/N9: 摘掉目标页锚点之后，定位退化成 rec-not-rendered（「跳页冒充定位」当场现形）'
  });
  // N10：$$ --> goPage 的非法页不拒收 ⇒ 「跳过去了但什么都没发生」
  CASES.push({
    name: 'N10 非法页不拒收',
    rel: PANEL_REL,
    from: ANCHOR.badPage,
    to: "      if (known.indexOf(want) < 0) { currentPage = want; if (panelEl) { syncTabs(); renderBody(); __persistPanel(); } return { ok: true, changed: true, page: want, known: known }; }",
    drive: function (env) {
      const WA = env.WA;
      //   破坏后 goPage 会把这个非法页塞进 currentPage 并立刻重绘 ⇒ `RENDERERS[page]`
      //   是 undefined ⇒ renderBody 抛 TypeError。**抛就是「跳过去了但什么都没发生」**
      //   （比静默更吵，但同样是「页表白名单没起作用」），故兜住并按现形计。
      let r = null;
      try { r = (WA.ui && typeof WA.ui.goPage === 'function') ? WA.ui.goPage('根本没有这一页') : null; }
      catch (e) { return true; }
      return !(r && r.ok === false && r.reason === 'bad-page');
    },
    assertion: 'ev6v2209/N10: 非法页不拒收之后，goPage 报成功而页面渲染成空（最坏形态：静默）'
  });
  let negReal = 0, negSilent = 0;
  CASES.forEach(function (c) {
    const m = mutated(c.rel, c.from, c.to, c.name);
    a(m.ok, 'ev6v2209/H6[' + c.name + ']: 破坏锚点在真源码里恰中 1 次（' + (m.why || 'ok') + '）—— H6 工具两向自证，判据不接受 0 次或多次命中');
    if (!m.ok) { negSilent++; return; }
    // ① 真源码破坏 ⇒ 副本上行为确实变了（否则说明破坏没生效）
    const ov = {}; ov[c.rel] = m.src;
    const pv = probe(ov, function (env) {
      const WA = env.WA;
      // 先判「破坏真的改了行为」：让用例自己驱动一次，驱动返回 true 表示「判据被破坏了」
      return c.drive(env);
    });
    if (pv.err) {
      a(false, 'ev6v2209/N[' + c.name + ']: 破坏副本装载/驱动抛异常（' + pv.err + '）—— 异常逃逸会让后续断言静默漏跑');
      return;
    }
    a(pv.ret === true, c.assertion);
    // ② 反向自证：同一款判据在**原版**上必须为 false（否则判据恒红、上面那条不算证据）
    const pv2 = probe({}, function (env) { return c.drive(env); });
    if (pv2.err) {
      a(false, 'ev6v2209/N_rev[' + c.name + ']: 原版上驱动抛异常（' + pv2.err + '）');
      return;
    }
    a(pv2.ret === false, 'ev6v2209/N_rev[' + c.name + ']: （两向自证）同款判据在原版上**不报**（实 ' + j(pv2.ret) + '）—— 上面那条不是恒红');
    if (pv.ret === true && pv2.ret === false) negReal++;
  });
  a(negReal >= 1 && negSilent === 0,
    'ev6v2209/N0: 负控制全部坐实（真现形 ' + negReal + ' / 静默 ' + negSilent + '）—— 隔离件真的能被证伪');
  return { cases: CASES.length, negReal: negReal };
}
module.exports = { runAll: runAll };
// 自跑段（run.js 走 spawnSync 只认退出码）：锁必须能直跑、自己汇总、自己定成败。
//   没有这一段，`node tests/ev6-...js` 会「不跑任何判据就 exit 0」—— 装置在、判据没跑。
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  try {
    runAll(a);
    console.log('\nev6-panel-nav-v2209 ' + pass + ' / 失败 ' + fail);
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    console.log('FAIL threw: ' + (e && e.stack));
    console.log('\nev6-panel-nav-v2209 ' + pass + ' / 失败 ' + (fail + 1));
    process.exit(1);
  }
}