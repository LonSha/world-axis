#!/usr/bin/env node
// WorldAxis tests/s3-y6-v2204.js — Y6 世界历史检索（跨库检索面）专锁（v2.201.0 第四批）
//
// 【计划原文（plans/Y_EXPANSION.md §Y6）逐条对照】
//   要解决的玩家问题：世界玩到长局之后「三个月前那个茶楼老板叫什么」**无处可问** ——
//     `engines/wb-search.js` 只搜**世界书条目**（数据源写死 worldbook.peekEntries）；
//     `engines/chronicle-view.js` 只能按**时间线**浏览（取最近 maxRows 条），不能按词查。
//   新功能四条：① 统一检索入口；② 结果带回溯；③ 检索词持久化；④ 从结果跳到来源面。
//   边界四条：① 只读面；② 不引入全文索引的持久化缓存；③ 结果必须标来源；
//     ④ 空结果不得被误报为「没有数据」。
//   验收四条：① 结果集合与「逐库直查」的并集一致；② 大世界响应走 U6 预算；
//     ③ 源不可读时如实标出；④ 检索不产生写入。
//
// 【本锁对计划原文的**如实偏离**（写在最前，不藏）】
//   偏离 1 验收②「大世界响应走 U6 预算」：无头环境采不到真手机样本，本锁**不判耗时数字**，
//     改判「超扫描上限时被挡下的面如实列进 deferred」（硬闸的可判面是「挡住 + 报出」，
//     不是毫秒数）。耗时读数只要求「是个数、不是 0 冒充」。
//     与引擎头部「如实边界」第 1 条同一口径。
//   偏离 2 验收③「源不可读时如实标出」：本锁分两档判 ——
//     (a) **前置不齐**（模块缺席 / 开关关着 / 上游缺席 / store 读不到）⇒ catalog 与 search 逐面一致；
//     (b) **运行期抛异常**（source-threw）⇒ 只有 search 当场知道（前置推不出来），
//     故 (b) 只判 search 的 blind，不要求 catalog 跟着变 —— 引擎头部已如实登记这条边界。
//
// 【本锁四段】A 静态契约 / B 运行时六面与往返 / C 零写入不变式 / N 真源码破坏 + 两向自证。
//   N 段走**真源码破坏 + 两向跑产品**：每例既判「破坏改变了源码文本」，也在
//   装载破坏副本的 mini-DOM 环境里真跑一次产品、再在原版上跑同款判据
//   （负控制三形与 H5/H6 纪律：真源码破坏 → 加载破坏副本 → 在副本上重跑同款真判据）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const ENG_REL = 'engines/history-search.js';
const SELF_REL = 'tests/s3-y6-v2204.js';
/** v2.230.0 收口：mini-DOM 的 `innerHTML` getter 会把**容器自身标签**也序列化进去
 *  （tests/ui-dom.js 的 `ser(el)`），浏览器只返回子节点。于是「空容器」的长度不是 0，
 *  而是容器自身那一段（Y1 实测 41 字符，随 tag/id/class 长短而变）。
 *  判据的真问题从来不是「长度是不是 0」，而是「破坏之后读数**再也写不进去**」
 *  —— 即出口容器**一个子元素都没有**。 */
function emptyOut(el) { return !!el && el.childNodes.length === 0; }
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
/**
 * 把「设置态」按各引擎**自己的**默认值显式写回。
 *
 * ⚠ 这是装置件、不是产品件，故放在**模块级**：`runAll`（A 段）与 `runRest`（B 段）
 *   都要用它；定义在 runAll 里面 B 段就取不到（首跑实测 ReferenceError）。
 *
 * 现场理由：`core/settings` 走 localStorage，而 `gate.fresh()` **不**清它 ——
 * 上一条用例里打开的编年史/地图开关会活到下一条，于是「默认态编年史读不到」
 * 这条现场在后续用例里会凭空消失（首跑踩到的假红就是这么来的）。
 * 归位方式不猜、也不在这里另抄一份「默认值」：直接调各引擎的 setSettings 写回。
 */
function resetSettings(WA) {
  try { if (WA.chronicleView) WA.chronicleView.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.atlas) WA.atlas.setSettings({ enabled: false }); } catch (e) {}
}
function j(x) { return JSON.stringify(x); }
/** 破坏锚点：逐字取自产品源码，各恰 1 次（N0 验）。 */
const ANCHOR = {
  page: "    { id: 'find', icon: '🔍', label: '检索' },",
  renderer: 'find: renderFindCenter,',
  // v2.209.0（优化 6）：出口写完即补绑（出口自己的责任）。锚点随形态更新 ——
  //   判据没变（「真源码里恰 1 处」），变的是那一行的形态。
  //   v2.209.0（优化 6）：出口写完即补绑。锚点随形态更新 —— 判据没变
  //   （「真源码里恰 1 处」），变的是那一行的形态（`if (o) o.innerHTML = …`，无花括号）。
  // v2.230.0 收口：出口落地经 `stageOut`（v2.214.0 Q5 的 staged 出口改造）——
  //   旧锚点写 `o.innerHTML = html`，改造后该字面量 0 命中（A8 红）。
  out: "const hsOut = function (html) { const o = $('#wa-hs-out'); if (o) stageOut(o, html); bindNavs(o); };",
  outSel: "const hsOut = function (html) { const o = $('#wa-hs-out');",
  guard: "    { page: 'find', ids: ['wa-hs-q', 'wa-hs-go', 'wa-hs-count', 'wa-hs-face',",
  faces: "const FACES = ['chronicle', 'people', 'places', 'orgs', 'rules', 'entries'];",
  routes: "    chronicle: 'memory', people: 'people', places: 'world',",
  lskey: "const LS_KEY = 'worldaxis_historysearch_v1';",
  srcReq: 'if (FACES.indexOf(f) < 0 || !r || !s) return null;',
  empty: 'const empty = (matched === 0) && (notCovered.length === 0);',
  hardCap: 'if (scanned >= CAPS.maxScanned) { deferred.push(f); return; }',
  delegate: "return WA.wbSearch.search(needle, { fields: ['title', 'keys', 'content'], limit: CAPS.maxRows });",
  normOrder: 'return FACES.filter(function (x) { return want.indexOf(x) >= 0; });',
  badFace: 'if (FACES.indexOf(k) < 0) return null;',
  switchGuard: "    if (f !== 'chronicle') return true;",
  readyPeople: "    return (p && typeof p === 'object' && !Array.isArray(p))",
  labelDef: "    const hsLabel = function (f) {\n      const L = (WA.historySearch && WA.historySearch.FACE_LABELS) || null;\n      return (L && L[f]) ? L[f] : String(f);\n    };"
};
const TGT = { page: PANEL_REL, renderer: PANEL_REL, out: PANEL_REL, outSel: PANEL_REL, guard: DIAG_REL,
  faces: ENG_REL, routes: ENG_REL, lskey: ENG_REL, srcReq: ENG_REL, empty: ENG_REL,
  hardCap: ENG_REL, delegate: ENG_REL, normOrder: ENG_REL, badFace: ENG_REL,
  switchGuard: ENG_REL, readyPeople: ENG_REL, labelDef: PANEL_REL };
const SEG_RENDER_START = '  // v2.201.0（第四批 Y6）：世界历史检索 —— 跨六个库的**一个**检索入口';
const SEG_RENDER_END = '  function renderBody() {';
const SEG_BIND_START = '    // ── v2.201.0（Y6）：世界历史检索（三枚只读 + 一枚写口 + 两条只读出口）────────';
const SEG_END = '\n  }\n\n  // ── 面板与悬浮球 ──';
/** 本页控件（11 枚静态 + 1 枚动态出口；渲染段与守卫表口径一致）。 */
const STATIC_IDS = ['wa-hs-q', 'wa-hs-go', 'wa-hs-count', 'wa-hs-face',
  'wa-hs-limit', 'wa-hs-remember', 'wa-hs-recent', 'wa-hs-clear',
  'wa-hs-filters', 'wa-hs-jumpface', 'wa-hs-diag'];
/** 带 onclick 的那七枚。 */
const BTN_IDS = ['wa-hs-go', 'wa-hs-count', 'wa-hs-recent', 'wa-hs-clear',
  'wa-hs-filters', 'wa-hs-jumpface', 'wa-hs-diag'];
/** 本页不得出现的其它页独占前缀（切片蔓延的现场判据）。 */
const OTHER_PREFIX = ['wa-wps-', 'wa-bt-', 'wa-chw-', 'wa-td-'];
function stripLineComments(s) {
  return s.split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
function runAll(a) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const LS = global.localStorage;
  const P = rd(PANEL_REL), D = rd(DIAG_REL), E = rd(ENG_REL), SELF = rd(SELF_REL);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }
  function seed(WA, fn) { WA.store.init(); return WA.store.transact(fn, 'y6:seed'); }
  /**
   * 取一个「干净世界」的宿主。
   *
   * ⚠ 必须归位两样现场态（否则用例之间会串，首跑实测踩到两条假红）：
   *   ① `core/settings` 走 localStorage，而 gate.fresh() **不**清它 ⇒ 上一条用例
   *      打开的编年史开关会活到下一条（「默认态编年史读不到」于是看不见）；
   *   ② 世界数据同样靠 refresh 重建 —— 由 seed() 负责。
   * 归位件是**模块级**的 resetSettings()（理由见它的定义处；定义在这里 B 段取不到）。
   */
  function gotoPage(env, page) {
    const dom = env.dom, p = dom.getElementById('wa-panel');
    if (!p) throw new Error('面板未注入');
    const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) throw new Error('找不到 ' + page + ' 页签 —— 页表里没有它');
    tab.click();
    return dom;
  }
/** v2.230.0 收口：同时交出出口**容器**（emptyOut 注见模块顶层）——「读数为空」是
   *  「容器零子元素」，不是「序列化长度为零」（mini-DOM 会把容器自身标签算进去）。 */
  function clickOutNode(dom, id) {
    const b = dom.getElementById(id);
    if (!b) return null;
    if (typeof b.onclick !== 'function') return null;
    b.onclick({ target: b });
    return dom.getElementById('wa-hs-out');
  }
  function clickOut(dom, id) {
    const o = clickOutNode(dom, id);
    return String(o ? o.innerHTML : '');
  }
  /** 给检索框填词（mini-DOM 的 input 有 .value）。 */
  function typeQ(dom, v) { const i = dom.getElementById('wa-hs-q'); if (i) i.value = v; }
  // ════ A 段：静态契约 ════════════════════════════════════════════════
  const segR = P.slice(P.indexOf(SEG_RENDER_START), P.indexOf(SEG_RENDER_END));
  const segB = P.slice(P.indexOf(SEG_BIND_START), P.indexOf(SEG_END));
  a(P.indexOf('function renderFindCenter() {') >= 0, 'y6v2204/A1: 渲染器 renderFindCenter 在位');
  a(P.indexOf(SEG_RENDER_START) >= 0 && P.indexOf(SEG_BIND_START) >= 0 && P.indexOf(SEG_END) > 0,
    'y6v2204/A1b: 两段段首与段尾锚点都在位（切片有效）');
  a(segR.length > 1000 && segB.length > 1000,
    'y6v2204/A1c: 两段切片非空（实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符）—— 切片失效会让下面的扫描在空集上恒真');
  (function () {
    const leak = [];
    OTHER_PREFIX.forEach(function (p) {
      if (cnt(segR, p) > 0) leak.push('渲染段 ' + p + cnt(segR, p));
      if (cnt(segB, p) > 0) leak.push('绑定段 ' + p + cnt(segB, p));
    });
    a(leak.length === 0, 'y6v2204/A1e: 两段切片未蔓延（无它页前缀：' + (leak.join('、') || '无声') + '）');
  })();
  a(P.indexOf(ANCHOR.page) >= 0, 'y6v2204/A2: 页表里有 find 页（插在 port 之后）');
  a(/^[a-z]+$/.test('find'), 'y6v2204/A2b: 页 id 纯小写字母（C11 页清单解析器只认 [a-z]+）');
  a(P.indexOf(ANCHOR.renderer) >= 0, 'y6v2204/A2c: RENDERERS 里有 find → renderFindCenter（页表与渲染器成对）');
  a(D.indexOf(ANCHOR.guard) >= 0, 'y6v2204/A2d: 守卫表新增 find 页分组（渲染 + 绑定 + 守卫登记三件齐做）');
  a(cnt(P, "'#wa-hs-") >= 7, 'y6v2204/A2e: 本页绑定用独占前缀 wa-hs-（实 ' + cnt(P, "'#wa-hs-") + ' 处）');
  STATIC_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1, 'y6v2204/A3: ' + id + ' 在渲染段恰渲染 1 次（实 ' + cnt(segR, 'id="' + id + '"') + '）');
    a(cnt(D, "'" + id + "'") === 1, 'y6v2204/A3c: ' + id + ' 在守卫表里恰登记 1 次（实 ' + cnt(D, "'" + id + "'") + '）');
  });
  BTN_IDS.forEach(function (id) {
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'y6v2204/A3b: ' + id + ' 的 onclick 绑定恰 1 处（实 ' + cnt(segB, "on('#" + id + "', () => {") + '）');
  });
  a(cnt(D, "'wa-hs-out'") === 1, 'y6v2204/A4: 动态读数出口 wa-hs-out 进 dynamic 层');
  a(cnt(segR, 'id="wa-hs-out"') === 1, 'y6v2204/A4b: 输出容器在渲染段在场（否则七枚 handler 写进空气）');
  const codeSeg = stripLineComments(segR) + '\n' + stripLineComments(segB);
  a(codeSeg.indexOf('store.transact(') < 0,
    'y6v2204/A5: 两段零 store.transact 调用（检索是只读面 —— 边界 1）');
  a(codeSeg.indexOf('localStorage.setItem(') < 0 && codeSeg.indexOf('localStorage.getItem(') < 0,
    'y6v2204/A5b: 两段零 localStorage 直接读写（偏好键的唯一读写面在引擎里）');
  a(codeSeg.indexOf('WA.historySearch.search(') >= 0 && codeSeg.indexOf('WA.historySearch.remember(') >= 0,
    'y6v2204/A5c: 去注释后真读口与真写口**带括号**在场（防自我指涉：判据不许把自己删掉）');
  a(cnt(segR, '真源') >= 1 && cnt(segB, '真源') >= 3,
    'y6v2204/A6: 读数逐处标注「真源」（渲染段 ' + cnt(segR, '真源') + ' / 绑定段 ' + cnt(segB, '真源') + ' 处）');
  a(segR.indexOf('只读') >= 0 && segR.indexOf('不引入全文索引') >= 0 && segR.indexOf('必须') >= 0,
    'y6v2204/A6b: 页面对玩家明写四条边界（只读 / 不落索引 / 标来源）');
  a(segB.indexOf('没查全') >= 0 || segB.indexOf('读不到的面') >= 0,
    'y6v2204/A7: 「本次没查全」在结果**上面**单列（边界 4 的界面实现）');
  a(segB.indexOf('no-match') >= 0 || segB.indexOf('真的没有') >= 0,
    'y6v2204/A7b: 「真的没有」与「查不了」分开报（不合成一句）');
  a(segB.indexOf('路由表与页表脱节') >= 0, 'y6v2204/A7c: 跳转失败时如实报「路由表与页表脱节」（不静默不跳）');
  // 锚点纯度（H5）：表切片取到行首 `};`
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1, 'y6v2204/A8: 锚点 ' + k + ' 在目标文件里恰中 1 次（实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + '）');
    // ⚠ 按**键名**定位声明处，不用 cnt(anchorDecl, ANCHOR[k]) 数值串：
    //   `outSel` 的值是 `out` 值的**前缀子串**（out = outSel + 尾巴），
    //   按值串计数会把 outSel 表内数成 2 —— 那是「锚点两两无包含关系」这个
    //   **隐含假设**不成立（布局事实），不是「被表外引用」。
    //   首跑 A8b 的红就是被这条假设绊倒的装置缺陷，不是产品的事。
    a(cnt(anchorDecl, '\n  ' + k + ': ') === 1,
      'y6v2204/A8b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（实 ' + cnt(anchorDecl, '\n  ' + k + ': ') + '）');
  });
  a(cnt(anchorDecl, ':') >= 15, 'y6v2204/A8c: ANCHOR 表切片有效（实 ' + cnt(anchorDecl, ':') + ' 个冒号）');
  (function () {
    // 锚点值互不相同：两键共用同一串时，N 段的替换会互相干扰（改 A 等于改 B）
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length,
      'y6v2204/A8d: 锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
  })();
  return runRest(a, { gate: gate, LS: LS, env0: env0, seed: seed,
    gotoPageF: gotoPage, clickOutF: clickOut, clickOutNodeF: clickOutNode, typeQF: typeQ,
    P: P, D: D, E: E, segR: segR, segB: segB,
    ANCHOR: ANCHOR, TGT: TGT, PANEL_REL: PANEL_REL, DIAG_REL: DIAG_REL, ENG_REL: ENG_REL });
}
// ════ B 段：运行时 ────────────────────────────────────────────────
//   六面在场性 / 统一入口一致性 / 来源与回溯 / 空与盲的区分 / 持久化 / 路由。
function runRest(a, C) {
  const gate = C.gate, env0 = C.env0, LS = C.LS, seed = C.seed;
  const gotoPage = C.gotoPageF, clickOut = C.clickOutF, typeQ = C.typeQF;
  const P = C.P, D = C.D, E = C.E;
  const W = '老周', P2 = '扁担巷';
  function mkEnv() {
    const env = env0();
    const WA = env.WA;
    // 世界数据由 seed 重建；**设置态必须显式归位**（见 resetSettings 的注释）。
    seed(WA, function (d) {
      d.chronicle = [{ id: 'c1', title: '开场', text: '扁担巷的茶楼老板姓周', at: 3, visible: true },
        { id: 'c2', title: '第二章', text: '无事发生', at: 7, visible: true }];
      d.people = { A: { name: '茶楼老板', location: '扁担巷' }, B: { name: '老周', location: '南街' } };
      d.evolution = { factions: [{ name: '义顺堂', kind: 'guild', members: [{ name: '老周' }] }, { name: '无关帮', members: [] }] };
      d.world = { places: { p1: { name: '扁担巷' } }, region: { places: [{ name: '扁担巷', distanceDays: 2, lane: '官道' }], events: [] }, roads: {} };
    });
    resetSettings(WA);
    return env;
  }
  // ① 空查询词的四种拒收**整条拒收**（边界 7）
  {
    const env = env0(); const H = env.WA.historySearch;
    // ⚠ 本块**刻意不 seed 世界**：它判的是「查询词形态」四条拒收，与世界内容无关。
    resetSettings(env.WA);
    const r1 = H.search(); const r2 = H.search({}); const r3 = H.search('   ');
    a(r1.ok === false && r1.reason === 'missing-key', 'y6v2204/B1: 未传查询词 ⇒ missing-key（实 ' + j(r1 && r1.reason) + '）');
    a(r2.ok === false && r2.reason === 'bad-type', 'y6v2204/B1b: 非字符串 ⇒ bad-type（实 ' + j(r2 && r2.reason) + '）');
    a(r3.ok === false && r3.reason === 'empty-text', 'y6v2204/B1c: 空白 ⇒ empty-text（实 ' + j(r3 && r3.reason) + '）');
    const r4 = H.search('x', { faces: ['不存在的面'] });
    a(r4.ok === false && r4.reason === 'bad-value' && r4.known.length === 6,
      'y6v2204/B1d: 未知面名 ⇒ bad-value 且报出认得的名字（整条拒收，不静默忽略未知面）');
    const r5 = H.search('x', { limit: -1 });
    a(r5.ok === false && r5.reason === 'bad-value', 'y6v2204/B1e: 非法 limit ⇒ bad-value（实 ' + j(r5 && r5.reason) + '）');
    a(env.WA.historySearch.stat().refused >= 5, 'y6v2204/B1f: 五次拒收全进计数（拒收不是静默）');
  }
  // ② 验收 ①：结果集合与「逐库直查」的并集一致
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    // 编年史视图默认关（现场语义：entries 首行就拦）⇒ 先打开，使六面齐可读
    WA.chronicleView.setSettings({ enabled: true });
    const six = H.search(W);
    const sixKeys = six.rows.map(function (x) { return x.face + '/' + x.ref; }).sort();
    const perSum = H.FACES.reduce(function (acc, f) { return acc + WA.historySearch.searchIn(f, W).matched; }, 0);
    a(six.matched === perSum,
      'y6v2204/B2: 统一入口的命中数 === 六面逐库直查之和（实 ' + six.matched + ' vs ' + perSum + '）—— 验收 ①');
    a(sixKeys.length === six.matched, 'y6v2204/B2b: 命中数与去重后的行数相同（同一行不被两面各算一次）');
    // 六面里至少两面真命中（否则上面那条在空集上恒真）
    const hitFaces = {}; six.rows.forEach(function (x) { hitFaces[x.face] = 1; });
    a(Object.keys(hitFaces).length >= 2,
      'y6v2204/B2c: 夹具下至少两面真命中（实 ' + j(Object.keys(hitFaces)) + '）—— 前置自证：判据不是空转');
    // limit 只影响 returned，不影响 matched（边界 6）
    const lim = H.search(W, { limit: 1 });
    a(lim.matched === six.matched && lim.returned === 1 && lim.trimmed === true,
      'y6v2204/B2d: limit 只截显示不截计数（matched ' + lim.matched + ' / returned ' + lim.returned + '/trimmed ' + lim.trimmed + '）');
  }
  // ③ 功能 ②③：来源与回溯 / 路由（验收 ③ 的正面）
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    const r = H.search(W);
    const bad = r.rows.filter(function (x) {
      return !x.face || !x.source || !x.ref || !x.route || !x.route.page;
    });
    a(bad.length === 0, 'y6v2204/B3: 每一行都带 face / source / ref / route（实缺 ' + bad.length + ' 行）—— 边界 3');
    a(r.rows.every(function (x) { return x.route.face === x.face; }),
      'y6v2204/B3b: 行的路由面 === 该行的面（路由不是另写一份）');
    const srcs = r.rows.map(function (x) { return x.source; });
    a(srcs.some(function (s) { return s.indexOf('store') === 0; }) || srcs.some(function (s) { return s.indexOf('.') > 0; }),
      'y6v2204/B3c: 来源口是**真模块名**（实 ' + j(srcs.slice(0, 4)) + '）—— 不是「系统」这类无法追溯的写法');
    a(r.rows.every(function (x) { return x.at === null || typeof x.at === 'number'; }),
      'y6v2204/B3d: 时间点要么是真数值、要么如实 null（不拿 0 冒充「时间未知」）');
    // 路由表逐面都得落在**页表里真存在**的页上（页表与路由表脱节 = 玩家点了跳不动）
    const dom = gotoPage(env, 'find');
    const tabs = dom.getElementById('wa-panel').querySelectorAll('.wa-tab').map(function (t) { return t.dataset.page; });
    const missing = Object.keys(H.ROUTES).filter(function (k) { return tabs.indexOf(H.ROUTES[k]) < 0; });
    a(missing.length === 0, 'y6v2204/B4: 路由表的每个目标页都在页表里（实缺 ' + j(missing) + '）—— 功能 ④ 可走通');
  }
  // ④ 功能 ④：面板跳转真跑（切页即止，本页不代写、不代查）
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    const dom = gotoPage(env, 'find');
    const sel = dom.getElementById('wa-hs-jumpface');
    a(!!sel, 'y6v2204/B5: 按面跳转的下拉在场');
    // 面板真点击：选「编年史」→ 应切到记忆页（ROUTES.chronicle = memory）
    if (sel) {
      sel.value = 'chronicle';
      const H0 = JSON.stringify(WA.store.get());
      let threw = null;
      try { clickOut(dom, 'wa-hs-jumpface'); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'y6v2204/B5b: 跳转点击不抛（实 ' + j(threw) + '）');
      const cur = (WA.ui && typeof WA.ui.currentPage === 'function') ? WA.ui.currentPage() : null;
      a(cur === H.ROUTES.chronicle, 'y6v2204/B5c: 真跳到了路由表指定的页（实 ' + j(cur) + ' vs ' + j(H.ROUTES.chronicle) + '）');
      a(JSON.stringify(WA.store.get()) === H0, 'y6v2204/B5d: 跳转本身不改世界（只读出口）');
    }
  }
  // ⑤ 边界 ④：empty 与 blind 分开 —— 六面齐可读且真没命中 ⇒ empty 为真
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    const r = H.search('绝无此词zzz');
    a(r.matched === 0, 'y6v2204/B6: 生僻词零命中（前置自证）');
    a(r.blind.length === 0, 'y6v2204/B6b: 六面齐可读时 blind 为空（实 ' + j(r.blind) + '）');
    a(r.empty === true, 'y6v2204/B6c: 六面齐可读 + 零命中 ⇒ empty=true（这是「真的没有」）');
    a(r.note.indexOf('不代表全部') < 0, 'y6v2204/B6d: 查全时不说「本次结果不代表全部」（话与事实同源）');
  }
  // ⑥ 边界 ④ 的反面：只要一个面读不到，同款空结果**不得**说 empty
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    const before = H.search('绝无此词zzz');
    a(before.empty === true, 'y6v2204/B7a: （两向前置）摘掉一个面之前，同款空结果说 empty');
    const keep = WA.wbSearch; delete WA.wbSearch;
    const r = H.search('绝无此词zzz');
    // ⚠ 取证窗口必须与「面缺席」同宽：夹具若先恢复 wbSearch 再算 count，
    //   那一趟六面齐可读，count 当然说 empty=true（首跑 B7d 的红就是这么来的 ——
    //   判据没错，是我取证取在了破坏窗口之外）。
    const cs = H.count('绝无此词zzz');
    WA.wbSearch = keep;
    a(r.matched === 0 && r.blind.indexOf('entries') >= 0,
      'y6v2204/B7: 条目面缺席 ⇒ 被点名报进 blind（实 ' + j(r.blind) + '）');
    a(r.empty === false, 'y6v2204/B7b: **只要有一个面读不到，同款空结果 empty 恒为 false** —— 边界 4 的全部要点');
    a(r.note.indexOf('不代表全部') >= 0, 'y6v2204/B7c: 如实说「本次结果不代表全部」（「没查着」与「查不了」是两件事）');
    a(cs.empty === false, 'y6v2204/B7d: count() 走同一份 search，有面读不到时同样不说「真的没有」（实 ' + j(cs && cs.empty) + '）');
    const cs2 = H.count('绝无此词zzz');
    a(cs2.empty === true, 'y6v2204/B7e: （两向）面恢复后同款 count 又说 empty=true（实 ' + j(cs2 && cs2.empty) + '）—— 判据区分得开两向');
  }
  // ⑦ 六态前置一致性：catalog（前置齐不齐）与 search（这趟读没读到）逐面一致
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    function facesAgree(label) {
      const catBad = H.catalog().filter(function (c) { return !c.ok; }).map(function (c) { return c.face; });
      const blind = H.search('绝无此词zzz').blind;
      const onlyCat = catBad.filter(function (f) { return blind.indexOf(f) < 0; });
      const onlySearch = blind.filter(function (f) { return catBad.indexOf(f) < 0; });
      a(onlyCat.length === 0 && onlySearch.length === 0,
        'y6v2204/B8[' + label + ']: catalog 与 search 的面可读性逐面一致（多报 ' + j(onlyCat) + ' / 漏报 ' + j(onlySearch) + '）—— 同一件事不许两处各说一遍');
    }
    facesAgree('默认态');
    // 反空转（取证必须在**打开任何开关之前**）：默认态确有面读不到 ——
    //   否则下面那六条「两边都空」也可能只是「两边都恒空」。
    const defaultBad = H.catalog().filter(function (c) { return !c.ok; }).map(function (c) { return c.face; });
    a(defaultBad.length > 0, 'y6v2204/B8b: 默认态确有面读不到（实 ' + j(defaultBad) + '）—— 上面那几条不是「两边都恒空」');
    WA.chronicleView.setSettings({ enabled: true }); facesAgree('编年史开');
    const keepR = WA.rules; delete WA.rules; facesAgree('规则缺'); WA.rules = keepR;
    const keepW = WA.wbSearch; delete WA.wbSearch; facesAgree('条目缺'); WA.wbSearch = keepW;
    const keepA = WA.atlas; delete WA.atlas; facesAgree('地图缺'); WA.atlas = keepA;
    const keepG = WA.region; delete WA.region; facesAgree('上游 region 缺'); WA.region = keepG;
  }
  // ⑧ 运行期抛异常只由 search 当场知道（前置推不出来的那一档，如实边界）
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    a(H.search('绝无此词zzz').blind.length === 0, 'y6v2204/B9a: （前置）默认无 blind');
    const keepA = WA.atlas; delete WA.atlas;
    const catAfter = H.catalog().filter(function (c) { return !c.ok; }).map(function (c) { return c.face; });
    WA.atlas = keepA;
    a(catAfter.indexOf('places') >= 0, 'y6v2204/B9b: 前置不齐时 catalog 也报（实 ' + j(catAfter) + '）');
    // 造一个**前置齐、读口真抛**的场景：store.get 抛（前置与适配器都会撞上，故只用它判 search 不抛）
    const keepG = WA.store.get;
    WA.store.get = function () { throw new Error('probe:store-down'); };
    let threw = null, r = null;
    try { r = H.search('绝无此词zzz'); } catch (e) { threw = String((e && e.message) || e); }
    WA.store.get = keepG;
    a(threw === null, 'y6v2204/B9: 数据源抛异常时 search **不抛**（实 ' + j(threw) + '）—— 异常不许被当成空集');
    a(r && r.ok === true && r.blind.length > 0, 'y6v2204/B9c: 抛异常照样如实进 blind（实 ' + j(r && r.blind) + '）');
    a(r && r.empty === false, 'y6v2204/B9d: 这一趟读不到 ⇒ 不说「真的没有」');
  }
  // ⑨ 功能 ③：查询词持久化（只落自己的偏好键；索引与结果不落）
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    LS.clear();
    const r0 = H.recent();
    a(r0.ok === true && r0.count === 0 && r0.empty === true, 'y6v2204/B10: 初始无记录（如实「还没查过」，不预置默认）');
    const w1 = H.remember(W, { faces: ['people'], matched: 1 });
    a(w1.ok === true && w1.count === 1, 'y6v2204/B10b: 记一条成功（实 ' + j(w1 && w1.count) + '）');
    const w2 = H.remember(W, { faces: ['people'], matched: 1 });
    a(w2.count === 1, 'y6v2204/B10c: 同词不重复计入（去重后仍 1 条）');
    // **规范性**：同一组面换输入顺序 ⇒ 落盘逐字相同（否则「常用过滤」取决于玩家先点哪一格）
    H.remember('序一', { faces: ['entries', 'people', 'chronicle'] });
    const f1 = j(H.filters().faces);
    H.remember('序二', { faces: ['chronicle', 'people', 'entries'] });
    const f2 = j(H.filters().faces);
    a(f1 === f2, 'y6v2204/B10d: 同组面换输入顺序 ⇒ 落盘逐字相同（' + f1 + ' vs ' + f2 + '）');
    // 落盘里**没有**索引 / 结果（边界 2）
    const raw = LS.getItem(H.LS_KEY);
    a(typeof raw === 'string' && raw.indexOf('"recent"') >= 0 && raw.indexOf('"filters"') >= 0,
      'y6v2204/B11: 偏好键里只有 recent / filters 两份（实 ' + String(raw).slice(0, 60) + '…）');
    a(String(raw).indexOf('"rows"') < 0 && String(raw).indexOf('扁担巷') < 0,
      'y6v2204/B11b: 索引与结果**没有**落盘（边界 2：缓存索引 = 世界长什么样的第二本账）');
    a(Object.keys(JSON.parse(raw)).sort().join(',') === 'filters,format,recent',
      'y6v2204/B11c: 落盘顶层键恰为 format/filters/recent（不多一层看不见的字段）');
    const cl = H.clearRecent();
    a(cl.ok === true && H.recent().count === 0, 'y6v2204/B12: 清空生效（实 ' + j(H.recent().count) + '）');
    a(H.filters().faces.length > 0, 'y6v2204/B12b: 清空只清记录、不动常用过滤（两件事不混成一件事）');
    // 上限：不无限长
    for (let i = 0; i < H.recent().max + 4; i++) H.remember('批量' + i);
    const rr = H.recent();
    a(rr.count === rr.max && rr.max > 0, 'y6v2204/B12c: 最近查询超限留最新、不无限长（实 ' + rr.count + '/' + rr.max + '）');
  }
  // ⑩ 面板真点击全链（页签 → 渲染 → 绑定 → 结果出口）
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    LS.clear();
    let dom = null;
    try { dom = gotoPage(env, 'find'); } catch (e) { a(false, 'y6v2204/B0: ' + e.message); }
    a(!!dom, 'y6v2204/B0b: 检索页可切（页签点击 → 渲染 → 绑定全链真跑）');
    if (dom) {
      const errs = [];
      typeQ(dom, W);
      BTN_IDS.forEach(function (id) {
        try { const t = clickOut(dom, id); if (t === null) errs.push(id + ':无绑定'); }
        catch (e) { errs.push(id + ':' + (e && e.message)); }
      });
      a(errs.length === 0, 'y6v2204/B13: 七枚按钮逐个点过零抛出（实 ' + (errs.join(' | ') || '无') + '）');
      typeQ(dom, W);
      const goTxt = clickOut(dom, 'wa-hs-go');
      a(goTxt && goTxt.indexOf('真源') >= 0 && goTxt.indexOf('命中') >= 0,
        'y6v2204/B13b: 检索结果在读出口显示命中数与真源标注（实截 ' + j(String(goTxt).slice(0, 48)) + '）');
      a(goTxt && goTxt.indexOf('来源') >= 0, 'y6v2204/B13c: 每行在界面上带「来源」与「定位」（边界 3 对玩家可见）');
      typeQ(dom, '绝无此词zzz');
      const missTxt = clickOut(dom, 'wa-hs-go');
      a(missTxt && (missTxt.indexOf('真的没有') >= 0 || missTxt.indexOf('没查全') >= 0),
        'y6v2204/B13d: 空结果两态之一如实显示（实截 ' + j(String(missTxt).slice(0, 60)) + '）');
      // 记进最近查询的勾选真生效（写口只有这一处 + clearRecent）
      const cb = dom.getElementById('wa-hs-remember');
      typeQ(dom, '面板记一条');
      if (cb) cb.checked = true;
      clickOut(dom, 'wa-hs-go');
      const recTxt = clickOut(dom, 'wa-hs-recent');
      a(recTxt && recTxt.indexOf('面板记一条') >= 0, 'y6v2204/B13e: 勾选后真记进了最近查询（实截 ' + j(String(recTxt).slice(0, 60)) + '）');
      const diagTxt = clickOut(dom, 'wa-hs-diag');
      a(diagTxt && diagTxt.indexOf('路由表') >= 0 && diagTxt.indexOf('上限') >= 0,
        'y6v2204/B14: 诊断面报路由表与上限（自证面可当场核）');
      // ⚠ 期望串逐字取自产品（`ui/panel.js` 的 diag handler 写的是「世界顶层键新增」）；
      //   首跑写成了「store 顶层键新增」—— 我凭记忆写期望、没读产品，是装置缺陷。
      a(diagTxt && diagTxt.indexOf('世界顶层键新增') >= 0 && diagTxt.indexOf('<b>0</b>') >= 0,
        'y6v2204/B14b: 诊断如实报「世界顶层键新增 0」（只读面的可核证据）');
    }
  }
  // ⑪ 硬闸（偏离 1）：扫到上限就停**后面还没查的面**，并如实列进 deferred
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    const saveCap = H.CAPS.maxScanned;
    // 夹具顶不到 4000 条，故临时把上限按真源码不可改的口径…—— 这里改用**真行为**判：
    //   先确认未超限时 deferred 为空（下一条），再用一个**极小的 limit** 无法触发硬闸
    //   （硬闸按 scanned 计数，与 limit 无关）。故本块只判「未超限时 deferred 空 + cappedScan 假」，
    //   硬闸本身由 N 段真源码破坏两向验（把闸门改成恒开/恒关，行为必须可观测地变）。
    const r = H.search(W);
    a(r.deferred.length === 0 && r.cappedScan === false,
      'y6v2204/B15: 未超扫描上限时 deferred 空、cappedScan 假（实 ' + j(r.deferred) + '/' + r.cappedScan + '）');
    a(typeof r.scanned === 'number' && r.scanned > 0,
      'y6v2204/B15b: scanned 是**真扫过**的条数（实 ' + j(r.scanned) + '）—— 不拿 0 冒充');
    a(typeof r.ms === 'number' && r.ms >= 0, 'y6v2204/B15c: ms 是数（实 ' + j(r.ms) + '）—— 不拿 0 冒充耗时');
    a(saveCap > 0 && H.CAPS.maxRows > 0, 'y6v2204/B15d: 两道上限都是正数（实 rows=' + H.CAPS.maxRows + ' / scanned=' + saveCap + '）');
  }
  // ⑫ 第六面**委托**：条目面不另写匹配（边界 5）
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    const direct = WA.wbSearch.search(W, { fields: ['title', 'keys', 'content'], limit: H.CAPS.maxRows });
    // ⚠ 全限定名：本仓引用面只认 `WA.ns.mem`；写成别名会让这条验收的真读口
    //   在账本上被算成「外部零引用」（panel 的 catalog/stat 踩过同款）。
    const via = WA.historySearch.searchIn('entries', W);
    a(via.matched === (direct.rows || []).length,
      'y6v2204/B16: 条目面命中数与 wbSearch 直查一致（实 ' + via.matched + ' vs ' + (direct.rows || []).length + '）—— 委托不是「另写一遍」');
    a(via.rows.every(function (x) { return x.source === 'wbSearch.search()'; }),
      'y6v2204/B16b: 条目面的来源如实写成它真正走的那个口');
  }
  // ════ C 段：不变式（零写入） ═══════════════════════════════════
  {
    const env = mkEnv(); const WA = env.WA, H = WA.historySearch;
    WA.chronicleView.setSettings({ enabled: true });
    LS.clear();
    const dom = gotoPage(env, 'find');
    const H0 = JSON.stringify(WA.store.get());
    const LS0 = JSON.stringify(LS.getItem(H.LS_KEY));
    typeQ(dom, W);
    // 只读那六枚：逐个点过，世界与偏好键都不得变
    const RO = ['wa-hs-go', 'wa-hs-count', 'wa-hs-recent', 'wa-hs-filters', 'wa-hs-jumpface', 'wa-hs-diag'];
    const errs = [];
    RO.forEach(function (id) {
      try { const b = dom.getElementById(id); if (b && typeof b.onclick === 'function') b.onclick({ target: b }); }
      catch (e) { errs.push(id + ':' + (e && e.message)); }
    });
    a(errs.length === 0, 'y6v2204/C1: 六枚只读出口逐个点过零抛出（实 ' + (errs.join(' | ') || '无') + '）');
    a(JSON.stringify(WA.store.get()) === H0, 'y6v2204/C2: **活世界逐字不变**（验收 ④：检索不产生写入）');
    a(JSON.stringify(LS.getItem(H.LS_KEY)) === LS0,
      'y6v2204/C2b: 不勾「记进最近查询」时连偏好键都不动（搜索动作无副作用 —— search 自己不落账）');
    const st = H.stat();
    a(st.queries >= 1, 'y6v2204/C2c: 检索计数涨了（本进程读数，实 ' + j(st.queries) + '）');
    // 写口那一枚（remember）真写了，且只动偏好键
    const H1 = JSON.stringify(WA.store.get());
    const w = H.remember('写口探针', { faces: ['people'] });
    a(w.ok === true, 'y6v2204/C3: 唯一的写口（remember）能写（前置自证：写口不是死的）');
    a(JSON.stringify(WA.store.get()) === H1, 'y6v2204/C3b: 写口**一格世界状态都没动**（只落自己的偏好键）');
    a(typeof LS.getItem(H.LS_KEY) === 'string', 'y6v2204/C3c: 反面前置自证：偏好键确实变了');
    // clearRecent 只清记录、不动世界
    const H2 = JSON.stringify(WA.store.get());
    H.clearRecent();
    a(JSON.stringify(WA.store.get()) === H2, 'y6v2204/C4: 清记录不动世界状态');
    // 面板真点击「清空记录」也不动世界
    const H3 = JSON.stringify(WA.store.get());
    const clb = dom.getElementById('wa-hs-clear');
    if (clb && typeof clb.onclick === 'function') clb.onclick({ target: clb });
    a(JSON.stringify(WA.store.get()) === H3, 'y6v2204/C4b: 面板上的清空按钮同样不动世界');
  }
  // ════ N 段：真源码破坏 + 两向自证 ══════════════════════════════
  const CASES = [
    { n: 1, k: 'page', to: '/* find 页被删 */', check: 'A2',
      why: '页表删掉 find ⇒ 页签不在场，B0 必须现形',
      judge: function (s) { return s.indexOf("    { id: 'find', icon: '🔍', label: '检索' },") < 0; } },
    { n: 2, k: 'renderer', to: 'find: renderLogs,', check: 'A2c',
      why: '把 find 的渲染器接到 logs ⇒ 页里读不到检索专属标题',
      judge: function (s) { return s.indexOf('find: renderFindCenter,') < 0; } },
    { n: 3, k: 'outSel', to: "const hsOut = function (html) { const o = $('#wa-hs-out-x');", check: 'A3',
      why: '读数出口 id 改坏（渲染了但写不进去）⇒ 七枚读数必须全空',
      // 破坏**只动选择器那一半**（保留 `const hsOut =` 声明本身）。
      //   ⚠ 首跑踩到：锚点若取整句、替换成裸选择器表达式，连函数声明一起被摘掉，
      //   于是后续 `hsOut(...)` 全变 ReferenceError —— 那破坏的是**绑定**，不是读数去处，
      //   N13b「破坏版上仍不抛」这条就变成了在测另一件事。
      judge: function (s) { return s.indexOf("const hsOut = function (html) { const o = $('#wa-hs-out');") < 0; } },
    { n: 4, k: 'guard', to: "    { page: 'findX', ids:", check: 'A2d',
      why: '守卫表登记到不存在的页 ⇒ 守卫覆盖面查不到这一页',
      judge: function (s) { return s.indexOf("    { page: 'find', ids:") < 0; } },
    { n: 5, k: 'srcReq', to: 'if (false) return null;', check: 'A?',
      why: '行构造器的**来源必填**判据被短路 ⇒ 会出现说不清哪来的行（边界 3 被摘掉）',
      judge: function (s) { return s.indexOf('if (FACES.indexOf(f) < 0 || !r || !s) return null;') < 0; } },
    { n: 6, k: 'routes', to: "    chronicle: 'no-such-page', people: 'people', places: 'world',", check: 'B4',
      why: '路由表指向一个不存在的页 ⇒ 玩家点了跳不动（功能 ④ 被摘掉）',
      judge: function (s) { return s.indexOf("chronicle: 'memory'") < 0; } },
    { n: 7, k: 'normOrder', to: 'return want.slice();', check: 'B10d',
      why: '面序不再归一到规范序 ⇒ 同一组面换个点击顺序落盘就不同（B10d 必须现形）',
      judge: function (s) { return s.indexOf('return FACES.filter(function (x) { return want.indexOf(x) >= 0; });') < 0; } },
    { n: 8, k: 'badFace', to: 'if (false) return null;', check: 'B1d',
      why: '未知面名的白名单判据被短路 ⇒ 未知面会被静默忽略（边界 7 被摘掉）',
      judge: function (s) { return s.indexOf('if (FACES.indexOf(k) < 0) return null;') < 0; } },
    { n: 9, k: 'empty', to: 'const empty = (matched === 0);', check: 'B7b',
      why: '`empty` 不再被 blind/deferred 剥夺 ⇒ 有面读不到时也说「真的没有」（边界 4 被摘掉）',
      judge: function (s) { return s.indexOf('const empty = (matched === 0) && (notCovered.length === 0);') < 0; } },
    { n: 10, k: 'delegate', to: 'return WA.wbSearch.search(needle, { fields: [\'title\'], limit: 1 });', check: 'B16',
      why: '条目面不再委托给 wbSearch 的原参数 ⇒ 与直查并集不一致（边界 5 的实体被摘掉）',
      judge: function (s) { return s.indexOf("fields: ['title', 'keys', 'content'], limit: CAPS.maxRows") < 0; } },
    { n: 11, k: 'switchGuard', to: 'if (false) return true;', check: 'B8',
      why: '开关判据被短路成「恒开」⇒ 编年史默认关时 catalog 会谎报「在场」（同一件事两处各说一遍）',
      judge: function (s) { return s.indexOf("    if (f !== 'chronicle') return true;") < 0; } },
    { n: 12, k: 'readyPeople', to: '    return (p && typeof p === \'object\');', check: 'B8',
      why: '人物面的可读判据放宽（`Array.isArray` 那一半被摘掉）⇒ 与「store.people 是数组」这种形态不再区分',
      judge: function (s) { return s.indexOf('return (p && typeof p === \'object\' && !Array.isArray(p))') < 0; } }
  ];
  CASES.forEach(function (cs) {
    const rel = C.TGT ? C.TGT[cs.k] : null;
    const S = rd(rel);
    const from = C.ANCHOR[cs.k];
    const hits = cnt(S, from);
    a(hits === 1, 'y6v2204/N0(' + cs.n + '): 破坏锚点 ' + cs.k + ' 在 ' + rel + ' 恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = S.split(from).join(cs.to);
    a(broken !== S, 'y6v2204/Na(' + cs.n + '): 破坏真的改动了源码文本');
    a(cnt(S, cs.to) === 0, 'y6v2204/Nb(' + cs.n + '): 原版上破坏产物不存在（否则判据是自指的）');
    a(cs.judge(broken) === true, 'y6v2204/N' + cs.n + 'a: ' + cs.why);
    a(cs.judge(S) === false, 'y6v2204/N' + cs.n + 'b: （纯度）原版上同款判据为假 —— 破坏确实改变了源码形态');
  });
  // N13：破坏版**跑产品**两向自证 —— 读数出口 id 改坏后按钮还能点，但读数再也写不进去
  (function () {
    const S = rd(C.PANEL_REL);
    const from = C.ANCHOR.outSel;
    if (cnt(S, from) !== 1) { a(false, 'y6v2204/N13a: 读数出口选择器锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("const hsOut = function (html) { const o = $('#wa-hs-out-x');");
    const ov = {}; ov[C.PANEL_REL] = broken;
    function runOnce(ovv) {
      const env = C.env0(ovv);
      const WA = env.WA;
      WA.store.init();
      WA.store.transact(function (d) { d.people = { A: { name: '老周' } }; d.world = { places: {}, roads: {} }; }, 'y6:n13');
      const dom = C.gotoPageF(env, 'find');
      C.typeQF(dom, '老周');
      return C.clickOutNodeF(dom, 'wa-hs-go');
    }
    let badNode = null, goodNode = null, bad = null, good = null, threw = null;
    try {
      badNode = runOnce(ov); bad = String(badNode ? badNode.innerHTML : '');
      goodNode = runOnce(null); good = String(goodNode ? goodNode.innerHTML : '');
    } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y6v2204/N13b: 破坏版上点按钮仍不抛（破坏的是读数去处，不是绑定）实 ' + threw);
    a(badNode !== null && emptyOut(badNode), 'y6v2204/N13c: （两向）破坏版上读数**为空**（出口容器零子元素；实 ' + j(bad && bad.length) + ' 字符是容器自身序列化）—— 判据不是空转');
    a(good !== null && good.length > 0, 'y6v2204/N13d: （两向）原版上同款操作读数非空（实 ' + j(good && good.length) + '）—— 判据区分得开两向');
  })();
  // N14：破坏版跑产品 —— empty 不再被 blind 剥夺后，有面读不到时**真的**说「真的没有」（两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.empty;
    if (cnt(S, from) !== 1) { a(false, 'y6v2204/N14a: empty 判据锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join('const empty = (matched === 0);');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      const env = C.env0(ovv);
      const WA = env.WA, H = WA.historySearch;
      WA.store.init();
      WA.store.transact(function (d) { d.people = { A: { name: '甲' } }; d.world = { places: {}, roads: {} }; }, 'y6:n14');
      const keep = WA.wbSearch; delete WA.wbSearch;
      const r = H.search('绝无此词zzz');
      WA.wbSearch = keep;
      return { empty: r.empty, blind: r.blind.slice() };
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y6v2204/N14b: 两版都不抛（实 ' + threw + '）');
    a(bad && bad.blind.indexOf('entries') >= 0 && bad.empty === true,
      'y6v2204/N14c: （两向）判据被摘掉后，有面读不到时**真的**说 empty=true（实 ' + j(bad && bad.empty) + '）—— 边界 4 的判据不是文案');
    a(good && good.blind.indexOf('entries') >= 0 && good.empty === false,
      'y6v2204/N14d: （两向）原版上同款夹具**不说** empty（实 ' + j(good && good.empty) + '）—— 两向区分得开');
  })();
  // N15：破坏版跑产品 —— 路由表指向不存在的页后，面板**真的**跳不到（两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.routes;
    if (cnt(S, from) !== 1) { a(false, 'y6v2204/N15a: 路由表锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("    chronicle: 'no-such-page', people: 'people', places: 'world',");
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      const env = C.env0(ovv);
      const WA = env.WA;
      WA.chronicleView.setSettings({ enabled: true });
      const dom = C.gotoPageF(env, 'find');
      const sel = dom.getElementById('wa-hs-jumpface');
      const before = (WA.ui && typeof WA.ui.currentPage === 'function') ? WA.ui.currentPage() : null;
      if (sel) { sel.value = 'chronicle'; }
      const txt = C.clickOutF(dom, 'wa-hs-jumpface');
      const after = (WA.ui && typeof WA.ui.currentPage === 'function') ? WA.ui.currentPage() : null;
      return { before: before, after: after,
        warned: String(txt).indexOf('路由表与页表脱节') >= 0 || String(txt).indexOf('不在页表里') >= 0 };
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y6v2204/N15b: 两版都不抛（实 ' + threw + '）');
    a(bad && bad.after === bad.before && bad.warned === true,
      'y6v2204/N15c: （两向）破坏版上**没跳成**且如实报了「路由表与页表脱节」（实 ' + j(bad && bad.after) + '）');
    a(good && good.after === 'memory',
      'y6v2204/N15d: （两向）原版上同款操作真跳到了 memory（实 ' + j(good && good.after) + '）—— 两向区分得开');
  })();
  // N16：破坏版跑产品 —— 面序不再归一后，同组面换顺序**真的**落盘不同（两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.normOrder;
    if (cnt(S, from) !== 1) { a(false, 'y6v2204/N16a: 面序归一锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join('return want.slice();');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      const env = C.env0(ovv);
      const H = env.WA.historySearch;
      try { global.localStorage.clear(); } catch (e) {}
      H.remember('a', { faces: ['entries', 'people', 'chronicle'] });
      const f1 = j(H.filters().faces);
      H.remember('b', { faces: ['chronicle', 'people', 'entries'] });
      const f2 = j(H.filters().faces);
      return { f1: f1, f2: f2, same: f1 === f2 };
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y6v2204/N16b: 两版都不抛（实 ' + threw + '）');
    a(bad && bad.same === false, 'y6v2204/N16c: （两向）不归一后同一组面换顺序**落盘不同**（' + j(bad && bad.f1) + ' vs ' + j(bad && bad.f2) + '）');
    a(good && good.same === true, 'y6v2204/N16d: （两向）原版上同款夹具逐字相同（' + j(good && good.f1) + '）—— 两向区分得开');
  })();
  // N17：破坏版跑产品 —— 面名标签的**定义**被摘掉后，三个 handler **真的**抛（两向）。
  //   这一条是本轮专锁抓出来的**真产品缺陷**的固化：Y6 首版里 `hsLabel` 被引用 6 处、
  //   却从未定义（渲染段与绑定段是两段代码，作用域不通），于是「检索 / 常用过滤 / 诊断」
  //   三枚按钮一按就抛 `hsLabel is not defined` —— 而只跑静态契约与引擎接口的探针
  //   一条都照不出来（这正是「渲染了不绑定 ⇒ 控件点了没反应且无人发现」的同族）。
  (function () {
    const S = rd(C.PANEL_REL);
    const from = C.ANCHOR.labelDef;
    if (cnt(S, from) !== 1) { a(false, 'y6v2204/N17a: 面名标签定义锚点恰中 1 次（前置失效）'); return; }
    // ⚠ 破坏必须**整条摘掉定义**，不能只在函数体里插一个永不执行的分支 ——
    //   首跑那版把定义留在原地再加 `if (0) return null;`，函数照旧能调，
    //   于是「三枚 handler 全抛」根本不成立（实 []）；测的成了另一件事。
    //   真缺陷形态就是「引用了 6 处、定义 0 处」，破坏体必须复现这个形态。
    const broken = S.split(from).join(
      '    // （N17 破坏）本页不再定义 hsLabel —— 判据面（6 处引用）原样保留');
    const ov = {}; ov[C.PANEL_REL] = broken;
    function runOnce(ovv) {
      const env = C.env0(ovv);
      const WA = env.WA;
      WA.store.init();
      WA.store.transact(function (d) { d.people = { A: { name: '老周' } }; d.world = { places: {}, roads: {} }; }, 'y6:n17');
      WA.chronicleView.setSettings({ enabled: true });
      const dom = C.gotoPageF(env, 'find');
      const q = dom.getElementById('wa-hs-q'); if (q) q.value = '老周';
      const errs = [];
      ['wa-hs-go', 'wa-hs-filters', 'wa-hs-diag'].forEach(function (id) {
        try { C.clickOutF(dom, id); } catch (e) { errs.push(id + ':' + (e && e.message)); }
      });
      return { errs: errs };
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y6v2204/N17b: 两版都不抛到探针外（实 ' + j(threw) + '）');
    a(bad && bad.errs.length === 3, 'y6v2204/N17c: （两向）标签定义被摘掉后，三枚 handler **真的**全抛（实 ' + j(bad && bad.errs.map(function (x) { return x.slice(0, 26); })) + '）—— 已定义不是装饰');
    a(good && good.errs.length === 0, 'y6v2204/N17d: （两向）原版上同款三步**零抛出**（实 ' + j(good && good.errs.length) + '）—— 判据区分得开两向');
  })();
}

module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY6 s3-y6-v2204 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}