#!/usr/bin/env node
// WorldAxis tests/s3-y7-v2205.js — Y7 地图与关系可视化（视图面）专锁（v2.202.0 第四批）
//
// 【计划原文（plans/Y_EXPANSION.md §Y7）逐条对照】
//   要解决的玩家问题：`engines/atlas.js` 已有地点 / 路线 / 关系三表（面板 8 处消费），
//     但呈现是**平面列表**；`faction-graph` / `bonds` / `opinion` 的关系数据也各自为政。
//   新功能四条：① 关系图（人物—组织—地点三类节点，关系强度/方向可读）；
//     ② 地理视图（路线可达性、未探索区域标记）；③ 时间轴叠加（关系随章节变化的对照）；
//     ④ 图上直接提出「下一次该去哪」的建议来源说明（不代玩家决定）。
//   边界四条：① 图是**视图**，不是新真源（节点与边一律从既有表读）；
//     ② 节点数 / 边数受预算约束（超限降级成截断，不卡死）；
//     ③ 不隐去坏数据（孤边标出而不是丢弃）；④ 视图不产生写入。
//   验收四条：① 图上节点 / 边集合 == 既有表直读；② 大图不阻塞面板；
//     ③ 孤边 / 循环 / 缺节点三类异常可见；④ 视图不产生写入。
//
// 【本锁对计划原文的**如实偏离**（写在最前，不藏）】
//   偏离 1 验收②「大图不阻塞面板」：无头环境采不到真手机样本，本锁**不判耗时数字**，
//     改判「超预算时被截断的面如实报 truncated」（硬闸的可判面是「截断 + 报出」，
//     不是毫秒数）。耗时只要求「是个数、不是 0 冒充」。与 Y6 同一口径。
//   偏离 2 验收④「视图不产生写入」：本锁判**两处** —— 活世界逐字不变（store 快照）
//     + 本模块自己那格偏好键在**只读出口**上逐字不变（设置写口单独取证，且带存活自证）。
//
// 【本锁四段】A 静态契约 / B 运行时与四功能 / C 零写入不变式 / N 真源码破坏 + 两向自证。
//   N 段走**真源码破坏 + 两向跑产品**：每例既判「破坏改变了源码文本」，也在
//   装载破坏副本的 mini-DOM 环境里真跑一次产品、再在原版上跑同款判据
//   （负控制三形与 H5/H6 纪律：真源码破坏 → 加载破坏副本 → 在副本上重跑同款真判据）。
//
// 【N 段的额外职责：本轮三个引擎真缺陷的固化】
//   N14 / N16 / N17 三条分别钉住本版从探针实测里揪出的三个真缺陷（首版已修，
//   此处用真源码破坏把「修之前是什么样」变成可复跑的判据）：
//     · 边类白名单不校验（`graph({edges:['nope']})` 返回 ok:true 零边）
//     · locate 只认 id（id 在界面上从不显示 ⇒ 有出口、无从使用）
//     · suggest 度数按不存在的键统计（每个地点恒 0 分 ⇒ 「按度数排序」等于没有排序）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const ENG_REL = 'engines/world-graph.js';
const SET_REL = 'ui/settings.js';
const SELF_REL = 'tests/s3-y7-v2205.js';
/** v2.230.0 收口：mini-DOM 的 `innerHTML` getter 会把**容器自身标签**也序列化进去
 *  （tests/ui-dom.js 的 `ser(el)`），浏览器只返回子节点。于是「空容器」的长度不是 0，
 *  而是容器自身那一段（Y1 实测 41 字符，随 tag/id/class 长短而变）。
 *  判据的真问题从来不是「长度是不是 0」，而是「破坏之后读数**再也写不进去**」
 *  —— 即出口容器**一个子元素都没有**。 */
function emptyOut(el) { return !!el && el.childNodes.length === 0; }
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/**
 * 把「设置态」按各引擎**自己的**默认值显式写回。
 *
 * ⚠ 这是装置件、不是产品件，故放在**模块级**：`runAll`（A 段）与 `runRest`（B 段）
 *   都要用它；定义在 runAll 里面 B 段就取不到。
 *
 * 现场理由（与 Y6 同）：`core/settings` 走 localStorage，而 `gate.fresh()` **不**清它 ——
 * 上一条用例里改过的开关会活到下一条，于是「默认态读不到」这类现场会凭空消失。
 * 归位方式不猜、也不在这里另拄一份「默认值」：直接调各引擎的 setSettings 写回。
 */
function resetSettings(WA) {
  try { if (WA.chronicleView) WA.chronicleView.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.atlas) WA.atlas.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.diplomacy) WA.diplomacy.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.worldGraph) WA.worldGraph.setSettings({ enabled: true }); } catch (e) {}
}
/** 破坏锚点：逐字取自产品源码，各恰 1 次（N0 验）。 */
const ANCHOR = {
  page: "    { id: 'graph', icon: '🕸', label: '图谱' },",
  renderer: 'find: renderFindCenter, graph: renderGraphCenter,',
  // v2.209.0（优化 6）：同上（出口写完即补绑）。
  //   v2.209.0（优化 6）：出口写完即补绑。锚点随形态更新（`if (o) o.innerHTML = …`，无花括号）。
  // v2.230.0 收口：同 Y6 —— 出口经 stageOut 落地，旧 `o.innerHTML = html` 形态 0 命中。
  out: "const wgOut = function (html) { const o = $('#wa-wg-out'); if (o) stageOut(o, html); bindNavs(o); };",
  outSel: "const wgOut = function (html) { const o = $('#wa-wg-out');",
  cfg: 'try { cfg = (ok && WA.worldGraph.getSettings) ? WA.worldGraph.getSettings() : null; } catch (e) { cfg = null; }',
  guard: "    { page: 'graph', ids: ['wa-wg-kinds', 'wa-wg-edges', 'wa-wg-build',",
  swLine: 'id="wa-sw-worldgraph" data-sw-ns="worldGraph"',
  kinds: "const KINDS = ['people', 'orgs', 'places'];",
  edgeKinds: "const EDGE_KINDS = ['relations', 'faction', 'bonds'];",
  caps: 'const CAPS = Object.freeze({ maxNodes: 240, maxEdges: 480, maxCycleProbe: 400, maxRows: 60 });',
  lskey: "const LS_KEY = 'worldaxis_worldgraph_v1';",
  badKind: "if (badKinds.length) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', kinds: badKinds }; }",
  badEdgeKind: "if (badEdgeKinds.length) { noteFault('bad-edge-kind'); return { ok: false, reason: 'bad-edge-kind', edgeKinds: badEdgeKinds }; }",
  orphanKeep: "if (!basis.length || !e.source) { orphan.push(Object.assign({}, e, { why: !e.source ? 'no-source' : 'no-basis' })); if (!cfg.showOrphans) return; }",
  truncNodes: 'const truncatedNodes = Math.max(0, nodeRows.length - maxNodes);',
  locateLabel: "const same = g.nodes.filter(function (n) { return n.label === key; });",
  zeroNote: 'zeroNote: linked === 0 && items.length',
  factBasis: "if (!fb.length) fb.push('atlas.relations().facts[' + String(f.a) + '×' + String(f.b) + '].state=' + String(f.state || f.stateLabel || 'unknown'));",
  degByLabel: 'deg[e.from] = (deg[e.from] || 0) + 1;',
  exportsFace: '    diagnose: diagnose, stat: statOf',
  swReg: "      'wa-sw-worldgraph',"
};
const TGT = { page: PANEL_REL, renderer: PANEL_REL, out: PANEL_REL, outSel: PANEL_REL, cfg: PANEL_REL,
  guard: DIAG_REL, swLine: SET_REL, swReg: DIAG_REL,
  kinds: ENG_REL, edgeKinds: ENG_REL, caps: ENG_REL, lskey: ENG_REL, badKind: ENG_REL,
  badEdgeKind: ENG_REL, orphanKeep: ENG_REL, truncNodes: ENG_REL, locateLabel: ENG_REL,
  zeroNote: ENG_REL, factBasis: ENG_REL, degByLabel: ENG_REL, exportsFace: ENG_REL };
/** 本模块偏好键**键名**（⚠ ANCHOR.lskey 是源码声明行、不是键名 —— 判 LS 面必须用它）。 */
const LSKEY = 'worldaxis_worldgraph_v1';
const SEG_RENDER_START = '  // v2.202.0（第四批 Y7）：地图与关系可视化 —— 节点 / 边 / 异常三类在**同一幅画面**里。';
const SEG_RENDER_END = '  function renderBody() {';
const SEG_BIND_START = '    // ── v2.202.0（Y7）：地图与关系可视化（五枚只读 + 一枚写口也没有）────────────────';
// v2.230.0 收口：段尾原为**远处**的 `// ── 面板与悬浮球 ──` —— 那会让本段把后来
//   新增的整页绑定（v2.210.0 行动与行程、evidenceBoard 等）静默并进来。
//   实测：旧锚点下 segB 长 37663 字符，里面含 `WA.evidenceBoard.setSettings(...)`；
//   于是「本页连一个写口都没有」这条边界判据被判成假红 —— 判据口径比事实宽。
//   按本仓既有口径（Y6 / Y8 / Y9 同规）收窄到**本段的下一段起点**。
const SEG_END = '    // ── v2.210.0（拓展 8）：行动与行程工作台';
/** 本页控件（11 枚静态 + 1 枚动态出口；渲染段与守卫表口径一致）。 */
const STATIC_IDS = ['wa-wg-kinds', 'wa-wg-edges', 'wa-wg-build', 'wa-wg-from',
  'wa-wg-geo', 'wa-wg-time', 'wa-wg-suggest', 'wa-wg-anom',
  'wa-wg-locate', 'wa-wg-locate-go', 'wa-wg-diag'];
/** 带 onclick 的那七枚。 */
const BTN_IDS = ['wa-wg-build', 'wa-wg-geo', 'wa-wg-time', 'wa-wg-suggest',
  'wa-wg-anom', 'wa-wg-locate-go', 'wa-wg-diag'];
/** 本页不得出现的其它页独占前缀（切片蔓延的现场判据）。 */
const OTHER_PREFIX = ['wa-hs-', 'wa-wps-', 'wa-bt-', 'wa-chw-', 'wa-td-'];
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
  const P = rd(PANEL_REL), D = rd(DIAG_REL), E = rd(ENG_REL), T = rd(SET_REL), SELF = rd(SELF_REL);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }
  function seed(WA, fn) { WA.store.init(); return WA.store.transact(fn, 'y7:seed'); }
  /**
   * 取一个「干净世界」的宿主。
   *
   * ⚠ 必须归位两样现场态（否则用例之间会串，与 Y6 同）：
   *   ① `core/settings` 走 localStorage，而 gate.fresh() **不**清它；
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
  function clickOut(dom, id) {
    const b = dom.getElementById(id);
    if (!b) return null;
    if (typeof b.onclick !== 'function') return null;
    b.onclick({ target: b });
    const o = dom.getElementById('wa-wg-out');
    return String(o ? o.innerHTML : '');
  }
  /** 给定位框填词（mini-DOM 的 input 有 .value）。 */
  function typeLoc(dom, v) { const i = dom.getElementById('wa-wg-locate'); if (i) i.value = v; }
  // ════ A 段：静态契约 ══════════════════════════════════════
  const segR = P.slice(P.indexOf(SEG_RENDER_START), P.indexOf(SEG_RENDER_END));
  const segB = P.slice(P.indexOf(SEG_BIND_START), P.indexOf(SEG_END));
  a(P.indexOf('function renderGraphCenter() {') >= 0, 'y7v2205/A1: 渲染器 renderGraphCenter 在位');
  a(P.indexOf(SEG_RENDER_START) >= 0 && P.indexOf(SEG_BIND_START) >= 0 && P.indexOf(SEG_END) > 0,
    'y7v2205/A1b: 两段段首与段尾锚点都在位（切片有效）');
  a(segR.length > 1000 && segB.length > 1000,
    'y7v2205/A1c: 两段切片非空（实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符）—— 切片失效会让下面的扫描在空集上恒真');
  a(cnt(segR, 'function renderGraphCenter() {') === 1 && cnt(P, 'function renderGraphCenter() {') === 1,
    'y7v2205/A1d: 渲染器定义恰一处（实渲染段 ' + cnt(segR, 'function renderGraphCenter() {') + '）');
  (function () {
    // ⚠ 先去掉行注释再扫：注释里写「不与 find（wa-hs-）共用」是**说明**，不是蔓延。
    const segRc = stripLineComments(segR), segBc = stripLineComments(segB);
    const leak = [];
    OTHER_PREFIX.forEach(function (p) {
      if (cnt(segRc, p) > 0) leak.push('渲染段 ' + p + cnt(segRc, p));
      if (cnt(segBc, p) > 0) leak.push('绑定段 ' + p + cnt(segBc, p));
    });
    a(leak.length === 0, 'y7v2205/A1e: 两段切片未蔓延（无它页前缀：' + (leak.join('、') || '无声') + '）');
  })();
  a(P.indexOf(ANCHOR.page) >= 0, 'y7v2205/A2: 页表里有 graph 页');
  a(/^[a-z]+$/.test('graph'), 'y7v2205/A2b: 页 id 纯小写字母（C11 页清单解析器只认 [a-z]+）');
  // 页序：graph 紧跟在 find 之后、events 之前 —— 「搬运 → 检索 → 图谱」是第四批的批次语义。
  //   防的是后来者把新页随手插在末尾（页序是叙事，不是容器）。
  (function () {
    const iF = P.indexOf("{ id: 'find', icon:'🔍', label: '检索' },".replace("icon:", "icon: "));
    const iG = P.indexOf(ANCHOR.page);
    const iE = P.indexOf("{ id: 'events', icon: '⚡', label: '事件' },");
    a(iF > 0 && iG > iF && iE > iG, 'y7v2205/A2f: 页序为 find → graph → events（实 ' + iF + ' / ' + iG + ' / ' + iE + '）');
  })();
  a(P.indexOf(ANCHOR.renderer) >= 0, 'y7v2205/A2c: RENDERERS 里有 graph → renderGraphCenter（页表与渲染器成对）');
  a(D.indexOf(ANCHOR.guard) >= 0, 'y7v2205/A2d: 守卫表新增 graph 页分组（渲染 + 绑定 + 守卫登记三件齐做）');
  a(cnt(P, "'#wa-wg-") >= 7, 'y7v2205/A2e: 本页绑定用独占前缀 wa-wg-（实 ' + cnt(P, "'#wa-wg-") + ' 处）');
  STATIC_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1, 'y7v2205/A3: ' + id + ' 在渲染段恰渲染 1 次（实 ' + cnt(segR, 'id="' + id + '"') + '）');
    a(cnt(D, "'" + id + "'") === 1, 'y7v2205/A3c: ' + id + ' 在守卫表里恰登记 1 次（实 ' + cnt(D, "'" + id + "'") + '）');
  });
  BTN_IDS.forEach(function (id) {
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'y7v2205/A3b: ' + id + ' 的 onclick 绑定恰 1 处（实 ' + cnt(segB, "on('#" + id + "', () => {") + '）');
  });
  a(cnt(D, "'wa-wg-out'") === 1, 'y7v2205/A4: 动态读数出口 wa-wg-out 进 dynamic 层');
  a(cnt(segR, 'id="wa-wg-out"') === 1, 'y7v2205/A4b: 输出容器在渲染段在场（否则七枚 handler 写进空气）');
  const codeSeg = stripLineComments(segR) + '\n' + stripLineComments(segB);
  a(codeSeg.indexOf('store.transact(') < 0,
    'y7v2205/A5: 两段零 store.transact 调用（视图是只读面 —— 边界 ①）');
  a(codeSeg.indexOf('localStorage.setItem(') < 0 && codeSeg.indexOf('localStorage.getItem(') < 0,
    'y7v2205/A5b: 两段零 localStorage 直接读写（偏好键的唯一读写面在引擎里）');
  a(codeSeg.indexOf('WA.worldGraph.graph(') >= 0 && codeSeg.indexOf('WA.worldGraph.locate(') >= 0,
    'y7v2205/A5c: 去注释后真读口**带括号**在场（防自我指涉：判据不许把自己删掉）');
  // v2.230.0 收口：`setSettings(` 在本页的**唯一**出现处是按钮 title 的说明文案
  //   （「…给设置页，本页不碰 —— 这是边界 ④ …」），那是写给玩家看的散文，不是调用。
  //   旧判据按裸串扫，把文案算成了写口 —— 判据口径比事实宽。改为按**调用形态**判：
  //   只有 `WA.<ns>.setSettings(` 才算写口（与 A5c「读口带括号在场」同规）。
  a(!/WA\.[A-Za-z]+\.[A-Za-z]*[Ss]etSettings\s*\(/.test(codeSeg),
    'y7v2205/A5d: 本页**连一个写口都没有**（对比 find 页的「记进最近查询 / 清空」）—— 边界 ④ 的结构保证');
  a(cnt(segR, '真源') >= 1 && cnt(segB, '真源') >= 3,
    'y7v2205/A6: 读数逐处标注「真源」（渲染段 ' + cnt(segR, '真源') + ' / 绑定段 ' + cnt(segB, '真源') + ' 处）');
  a(segR.indexOf('视图') >= 0 && segR.indexOf('只标不删') >= 0 && segR.indexOf('零写入') >= 0,
    'y7v2205/A6b: 页面对玩家明写四条边界（视图不是新真源 / 降级不丢 / 只标不删 / 零写入）');
  a(segB.indexOf('与「本来就没有」是两件事') >= 0,
    'y7v2205/A7: 「读不到」与「本来就没有」在结果上面单列（边界 ③ 的界面实现）');
  a(segB.indexOf('不在本次节点集里') >= 0,
    'y7v2205/A7b: 定位失败时如实说「不在本次节点集里不等于不存在」（不把预算截断报成失踪）');
  a(cnt(E, '不为了让数字好看') >= 1 && segB.indexOf('zeroNote') >= 0,
    'y7v2205/A7c: 建议面不编边（引擎如实说那是「数据源的形状」，界面把它原样摆出来 —— 实文案 '
    + cnt(E, '不为了让数字好看') + ' 处 / 界面引用 ' + cnt(segB, 'zeroNote') + ' 处）');
  // 导出面：三件过度导出已摘、真读口仍在（两处口径同源的可核证据）
  a(cnt(E, '    nodes: function (kind) { return nodesOf(kind); },') === 0
    && cnt(E, '    edges: function (kind) { return edgesOf(kind); },') === 0
    && cnt(E, '    cycles: cycles, diagnose: diagnose, stat: statOf') === 0,
    'y7v2205/A9: nodes / edges / cycles 三个内部面**不导出**（已被 graph() 覆盖；另开口即绕开「一律从既有表读」）');
  a(E.indexOf(ANCHOR.exportsFace) > 0, 'y7v2205/A9b: 导出面以 diagnose / stat 收口（页面真走的口）');
  a(T.indexOf(ANCHOR.swLine) > 0, 'y7v2205/A10: 设置页有本模块总开关（接线面：setSettings 的真消费方）');
  a(D.indexOf(ANCHOR.swReg) > 0, 'y7v2205/A10b: 该控件已进守卫表（渲染了不登记 ⇒ 守卫永远查不到 —— H2 双红）');
  // 见证当面：三码的见证住在 reject-v2780.js（另一个文件）。若只在自己文件里断言，
  //   删掉见证时本锁不知道 —— 跨文件判据在这里补上。
  a(cnt(rd('tests/reject-v2780.js'), "want('bad-edge-kind'") === 1
    && cnt(rd('tests/reject-v2780.js'), "want('source-absent'") === 1
    && cnt(rd('tests/reject-v2780.js'), "want('ambiguous-label'") === 1,
    'y7v2205/A11: 三码的可执行见证在 reject-v2780.js 里各声明 1 次（新码不进基线）');
  // 锚点纯度（H5）：表切片取到行首 `};`
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1, 'y7v2205/A8: 锚点 ' + k + ' 在目标文件里恰中 1 次（实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + '）');
    // ⚠ 按**键名**定位声明处，不用 cnt(anchorDecl, ANCHOR[k]) 数值串：
    //   `outSel` 的值是 `out` 值的**前缀子串**（out = outSel + 尾巴），
    //   按值串计数会把 outSel 表内数成 2 —— 那是「锚点两两无包含关系」这个
    //   **隐含假设**不成立（布局事实），不是「被表外引用」。
    a(cnt(anchorDecl, '\n  ' + k + ': ') === 1,
      'y7v2205/A8b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（实 ' + cnt(anchorDecl, '\n  ' + k + ': ') + '）');
  });
  a(cnt(anchorDecl, ':') >= 20, 'y7v2205/A8c: ANCHOR 表切片有效（实 ' + cnt(anchorDecl, ':') + ' 个冒号）');
  (function () {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length,
      'y7v2205/A8d: 锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
  })();
  return runRest(a, { gate: gate, LS: LS, env0: env0, seed: seed,
    gotoPageF: gotoPage, clickOutF: clickOut, typeLocF: typeLoc,
    P: P, D: D, E: E, T: T, segR: segR, segB: segB,
    ANCHOR: ANCHOR, TGT: TGT, PANEL_REL: PANEL_REL, DIAG_REL: DIAG_REL, ENG_REL: ENG_REL });
}
// ════ B 段：运行时与四功能 ═════════════════════════════════
//   四功能在场性 / 验收①（图上集合 == 既有表直读）/ 白名单整条拒收 /
//   三类异常可见且只标不删 / 预算截断 / 地理视图 / 时间轴 / 建议来源 / 定位两向。
function runRest(a, C) {
  const gate = C.gate, env0 = C.env0, LS = C.LS;
  const gotoPage = C.gotoPageF, clickOut = C.clickOutF, typeLoc = C.typeLocF;
  function mkEnv(o) {
    const env = env0();
    const WA = env.WA;
    WA.store.init();
    WA.store.transact(function (d) {
      d.people = { A: { name: '老周' }, B: { name: '茶楼老板' } };
      d.region = { places: [{ name: '扁担巷', distanceDays: 2 }, { name: '南街', distanceDays: 1 },
        { name: '北关', distanceDays: 9 }], events: [] };
      d.evolution = { factions: [{ name: '义顺堂', relation: '盟友', status: '稳固', scope: '城南' },
        { name: '清河帮', relation: '敌对', status: '鼎盛', scope: '城北' }] };
      d.bonds = { rows: [{ key: '老周×茶楼老板', a: '老周', b: '茶楼老板', types: ['friend'], at: 1700000000000 }] };
      d.economy = { goods: [], orders: [], routes: [] };
      d.freight = { shipments: [] };
      d.diplomacy = { pairs: { f1: { id: 'f1', first: '义顺堂', second: '清河帮', state: 'hostile',
        att: { first: 2, second: 5 }, terms: [], updatedAt: 1 } }, proposals: {}, seq: 1 };
    }, 'y7:seed');
    resetSettings(WA);
    if (o && o.all) {
      WA.atlas.setSettings({ enabled: true });
      WA.diplomacy.setSettings({ enabled: true });
      // factionGraph 的 enabled 默认 false —— 不显式打开，组织节点恒 0，
      //   则「三类节点各有 >0 条」与 B2d 的相等断言都会在空集上假绿。
      if (WA.factionGraph) WA.factionGraph.setSettings({ enabled: true });
    }
    return env;
  }
  // ① 四功能在场：graph / geo / timeline / suggest / locate 都是函数（静态面不代替在场性）
  {
    const env = mkEnv({ all: true }); const G = env.WA.worldGraph;
    ['graph', 'geo', 'timeline', 'suggest', 'locate', 'diagnose', 'stat',
      'getSettings', 'setSettings'].forEach(function (k) {
      a(typeof G[k] === 'function', 'y7v2205/B1: 导出面有 ' + k + '（函数）');
    });
    ['KINDS', 'EDGE_KINDS', 'CAPS'].forEach(function (k) {
      a(G[k] !== undefined && G[k] !== null, 'y7v2205/B1b: 导出面有常量 ' + k);
    });
    a(G.KINDS.join(',') === 'people,orgs,places' && G.EDGE_KINDS.join(',') === 'relations,faction,bonds',
      'y7v2205/B1c: 三类节点 / 三条边的名单是**显式表**（不是靠前缀猜）');
  }
  // ② 验收①：图上节点集合 == 既有表直读（逐类各比）
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    const g = G.graph({});
    a(g.ok === true, 'y7v2205/B2: 全开关下建图成功');
    const peopleN = Object.keys(WA.store.get().people || {}).length;
    a(g.counts.byKind.people === peopleN,
      'y7v2205/B2b: 人物节点数 === store.people 的键数（实 ' + g.counts.byKind.people + ' vs ' + peopleN + '）—— 验收①');
    const placeN = (WA.atlas.places().places || []).length;
    a(g.counts.byKind.places === placeN,
      'y7v2205/B2c: 地点节点数 === atlas.places() 直读条数（实 ' + g.counts.byKind.places + ' vs ' + placeN + '）');
    const orgN = (WA.factionGraph.buildGraph().nodes || []).length;
    a(g.counts.byKind.orgs === orgN,
      'y7v2205/B2d: 组织节点数 === factionGraph.buildGraph().nodes 直读条数（实 ' + g.counts.byKind.orgs + ' vs ' + orgN + '）');
    const bondN = (WA.store.get().bonds.rows || []).length;
    a(g.counts.byEdgeKind.bonds === bondN,
      'y7v2205/B2e: bonds 边数 === store.bonds.rows 直读行数（实 ' + g.counts.byEdgeKind.bonds + ' vs ' + bondN + '）');
    // 反空转：夹具下三类节点各有 >0 条（否则上面几条在空集上恒真）
    a(g.counts.byKind.people > 0 && g.counts.byKind.places > 0 && g.counts.byKind.orgs > 0,
      'y7v2205/B2f: 夹具下三类节点各有 >0 条（实 ' + j(g.counts.byKind) + '）—— 上面几条不是空转');
    a(g.counts.edges > 0, 'y7v2205/B2g: 夹具下有边（实 ' + g.counts.edges + '）—— 不是一张空图');
    // 每条节点自报来源口（可追溯）
    const noSrc = g.nodes.filter(function (n) { return !n.source; });
    a(noSrc.length === 0, 'y7v2205/B2h: 每个节点都带 source（实缺 ' + noSrc.length + '）—— 图上没有无法追溯的节点');
  }
  // ③ 白名单是判据面：节点类与边类**同一口径**整条拒收
  {
    const env = mkEnv({ all: true }); const G = env.WA.worldGraph;
    const rk = G.graph({ kinds: ['nope'] });
    a(rk.ok === false && rk.reason === 'bad-kind' && rk.kinds.join() === 'nope',
      'y7v2205/B3: 未知节点类 ⇒ 整条拒收并带回名单（实 ' + j(rk.reason) + '）');
    const re = G.graph({ edges: ['nope'] });
    a(re.ok === false && re.reason === 'bad-edge-kind' && re.edgeKinds.join() === 'nope',
      'y7v2205/B3b: 未知边类 ⇒ **同样**整条拒收并带回名单（实 ' + j(re.reason) + '）—— 两侧同宽');
    // 存活自证：合法名单照旧能过（拒收不是「一律不开门」）
    a(G.graph({ kinds: ['people'], edges: ['bonds'] }).ok === true,
      'y7v2205/B3c: 合法名单照旧能过（前置自证：白名单不是「一律不开门」）');
    // 三类节点名 / 三条边名逐个试一遍，一个都不许静默
    ['people', 'orgs', 'places'].forEach(function (k) {
      a(G.graph({ kinds: [k], edges: [] }).ok === true, 'y7v2205/B3d: 合法节点类 ' + k + ' 可读');
    });
    ['relations', 'faction', 'bonds'].forEach(function (k) {
      a(G.graph({ kinds: [], edges: [k] }).ok === true, 'y7v2205/B3e: 合法边类 ' + k + ' 可读');
    });
  }
  // ④ 边界③：三类异常都看得见，且**只标不删**
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    // 造一条悬空边（端点不在节点集）：bonds 写一个不在 people 里的名字
    WA.store.transact(function (d) {
      d.bonds.rows = (d.bonds.rows || []).concat([{ key: '查无此人×老周', a: '查无此人', b: '老周', types: ['kin'], at: 1 }]);
    }, 'y7:anom');
    const g = G.graph({ edges: ['bonds'] });
    a(g.anomalies.dangling.length >= 1,
      'y7v2205/B4: 端点不在节点集的边被标 dangling（实 ' + g.anomalies.dangling.length + '）');
    a(g.anomalies.dangling[0].missingSide === 'from',
      'y7v2205/B4b: 如实报是哪一侧缺（实 ' + j(g.anomalies.dangling[0] && g.anomalies.dangling[0].missingSide) + '）');
    // 「只标不删」：被标悬空的边**不在** kept 里（因为端点对不上就无法连），
    //   但它也没有被默默吃掉 —— 它在 anomalies 里看得见。这就是本模块与「丢掉」的区别。
    a(g.edges.filter(function (e) { return e.from === '查无此人'; }).length === 0,
      'y7v2205/B4c: 悬空边不入正式边集（图上连不上就不假装连上）');
    a(g.counts.byEdgeKind.bonds === 1,
      'y7v2205/B4d: 可连的那 1 条 bonds 仍在（异常不影响正常边，实 ' + g.counts.byEdgeKind.bonds + '）');
    // 孤儿边：无 basis 且无 source 的边
    const g2 = G.graph({});
    a(Array.isArray(g2.anomalies.orphan) && Array.isArray(g2.anomalies.cyclic),
      'y7v2205/B4e: 三份异常名单都在返回里（孤儿 ' + g2.anomalies.orphan.length + ' / 绕圈 ' + g2.anomalies.cyclic.length + '）');
    // 绕圈：造一个二节点环（bonds 双向）真跑一次环探测
    const env2 = mkEnv({ all: true }); const WA2 = env2.WA;
    WA2.store.transact(function (d) {
      d.bonds.rows = [{ key: 'a×b', a: '甲', b: '乙', types: ['x'], at: 1 },
        { key: 'b×a', a: '乙', b: '甲', types: ['x'], at: 2 }];
      d.people = { '甲': { name: '甲' }, '乙': { name: '乙' } };
    }, 'y7:cycle');
    const g3 = WA2.worldGraph.graph({ kinds: ['people'], edges: ['bonds'] });
    a(g3.anomalies.cyclic.length >= 1,
      'y7v2205/B4f: 真造一个二节点环 ⇒ 环探测真报出（实 ' + g3.anomalies.cyclic.length + '）—— 不是永远 0');
    a(g3.anomalies.cyclic[0].length === 3 && g3.anomalies.cyclic[0][0] === g3.anomalies.cyclic[0][g3.anomalies.cyclic[0].length - 1],
      'y7v2205/B4g: 环以「首尾同点」形式报出（实 ' + j(g3.anomalies.cyclic[0]) + '）');
  }
  // ⑤ 边界②：预算超限降级成截断（不是卡死、不是静默丢）
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    const big = {};
    for (let i = 0; i < 30; i++) big['p' + i] = { name: '人' + i };
    WA.store.transact(function (d) { d.people = big; }, 'y7:big');
    const g = G.graph({ kinds: ['people'], maxNodes: 5, edges: [] });
    a(g.ok === true, 'y7v2205/B5: 超预算时仍返回一张图（不是拒收、不是卡死）');
    a(g.counts.nodes <= 5, 'y7v2205/B5b: 节点数被预算压住（实 ' + g.counts.nodes + ' ≤ 5）');
    a(g.truncated.nodes === 30 - 5,
      'y7v2205/B5c: 被截掉的条数**如实报出**（实 ' + g.truncated.nodes + ' = 30 - 5）—— 降级不是丢数据');
    // 边在截断后按已留下的节点集过滤（先截节点、再判边）
    const g2 = G.graph({ kinds: ['people'], maxNodes: 1, edges: ['bonds'] });
    a(g2.ok === true && g2.truncated.nodes === 29, 'y7v2205/B5d: 极端预算下同样如实（实截 ' + g2.truncated.nodes + '）');
  }
  // ⑥ 功能②：地理视图 —— 可达（只报一跳）/ 未探索 / 非通行三类分列
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    WA.economy.setSettings({ enabled: true });
    WA.economy.route('r1', { lane: 'road', from: '扁担巷', to: '南街', cost: 5 });
    WA.economy.route('r2', { lane: 'road', from: '扁担巷', to: '城外', cost: 7 });
    WA.economy.markRoute('r1', false);
    const r = G.geo({ from: '扁担巷' });
    a(r.ok === true && r.roads === 2, 'y7v2205/B6: 地理视图读到两条路（实 ' + r.roads + '）');
    a(r.reach && r.reach.length === 2, 'y7v2205/B6b: 起点一跳可达读到两条（实 ' + j(r.reach && r.reach.map(function (x) { return x.to; })) + '）');
    a(r.reachNote.indexOf('只报一跳') >= 0, 'y7v2205/B6c: 可达**只报一跳**并写明白（加权最短路是布局算法，不是本页判据）');
    a(r.blocked.length === 1 && r.blocked[0].status === 'stuck',
      'y7v2205/B6d: 非通行路单独列出并带状态（实 ' + j(r.blocked && r.blocked[0] && r.blocked[0].status) + '）');
    a(r.untouched.length === 1 && r.untouched[0].side === 'to',
      'y7v2205/B6e: 端点在别处（未探索一侧）如实标**是哪一侧**（实 ' + j(r.untouched && r.untouched[0] && r.untouched[0].side) + '）');
    // 空与盲的分野：不给起点 ⇒ reach 为 null 且如实说，不是「可达为空集」
    const r0 = G.geo({});
    a(r0.ok === true && r0.reach === null && r0.reachNote.indexOf('不猜可达') >= 0,
      'y7v2205/B6f: 未给起点时 reach 如实为 null（不把「没告诉我起点」当成「哪儿都去不了」）');
    a(r0.roads === r.roads, 'y7v2205/B6g: 未给起点仍报全图读数（读数不因缺一个参数而整条消失）');
  }
  // ⑦ 功能③：时间轴 —— 带时间戳的按时序 / 不带时间戳的**单列**，不互相冒充
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    WA.store.transact(function (d) {
      d.bonds = { rows: [{ key: 'k2', a: '老周', b: '茶楼老板', types: ['friend'], at: 200 },
        { key: 'k1', a: '老周', b: '茶楼老板', types: ['kin'], at: 100 }] };
    }, 'y7:tl');
    const r = G.timeline({});
    a(r.ok === true && r.datedCount === 2, 'y7v2205/B7: 带时间戳的关系全在（实 ' + r.datedCount + '）');
    a(r.dated[0].at === 100 && r.dated[1].at === 200,
      'y7v2205/B7b: 按时序升序排（实 ' + j(r.dated.map(function (x) { return x.at; })) + '）—— 排序真跑过');
    a(r.undated.length === 2 && r.undated.map(function (x) { return x.kind; }).join() === 'relations,faction',
      'y7v2205/B7c: 不带时间戳的两条来源**单列**在 undated（实 ' + j(r.undated.map(function (x) { return x.kind; })) + '）');
    a(r.undated.every(function (x) { return String(x.why).indexOf('不带时间戳') >= 0; }),
      'y7v2205/B7d: 每条 undated 都说清**为什么**没有时间戳（不拿登记时刻冒充关系变化的时刻）');
    a(r.chapter === null, 'y7v2205/B7e: 没有当前章时如实 null（不拿 0 冒充「第 0 章」）');
    WA.store.transact(function (d) { d.chapters = { history: [], seq: 1, current: { no: 2, title: '第二章', startedAt: 5 } }; }, 'y7:chap');
    const r2 = G.timeline({});
    a(r2.chapter && r2.chapter.no === 2 && r2.chapter.title === '第二章',
      'y7v2205/B7f: 有当前章时读出章号与题名（实 ' + j(r2.chapter) + '）');
    // 空面自证：一条带时间戳的都没有时，note 说清是「还没有」而不是「读不到」
    WA.store.transact(function (d) { d.bonds = { rows: [] }; delete d.chapters; }, 'y7:tl0');
    const r3 = G.timeline({});
    a(r3.ok === true && r3.datedCount === 0 && String(r3.note).indexOf('尚无') >= 0,
      'y7v2205/B7g: 一条都没有时如实说「尚无带时间戳的关系登记」（实 ' + j(r3.note) + '）—— 空与盲仍分列');
  }
  // ⑧ 功能④：建议来源（**不代玩家决定**）+ 零度如实说「那是数据源的形状」
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    const r = G.suggest({});
    a(r.ok === true && r.places === 3 && r.items.length === 3,
      'y7v2205/B8: 建议按地点出（实 ' + r.places + ' 个地点）');
    a(r.linked === 0 && r.items.every(function (x) { return x.degree === 0; }),
      'y7v2205/B8b: 本夹具的地点度数全 0（没有端点是地点名的边 —— 实 linked ' + r.linked + '）');
    a(r.zeroNote !== null && r.zeroNote.indexOf('数据源的形状') >= 0,
      'y7v2205/B8c: 零度时如实说清那是**数据源的形状**（relations/faction 端点是势力名、bonds 端点是人物名）');
    a(String(r.note).indexOf('不是「你应该去哪」') >= 0,
      'y7v2205/B8d: 建议是**来源说明**不是指令（决定权在玩家 —— 功能④ 的边界）');
    a(r.items.every(function (x) { return Array.isArray(x.basis) && x.basis.length >= 4; }),
      'y7v2205/B8e: 每条建议带 basis（逐项写明这个数是**算出来的还是标出来的**）');
    // 反空转：端点是地名时度数真涨 —— 上面那条「排序不是恒 0」才立得住
    WA.store.transact(function (d) {
      d.bonds = { rows: [{ key: 'k', a: '扁担巷', b: '南街', types: ['x'], at: 1 }] };
    }, 'y7:placebond');
    const r2 = G.suggest({});
    a(r2.linked === 2 && r2.zeroNote === null,
      'y7v2205/B8f: 端点是地名时度数真涨（实 linked ' + r2.linked + '）—— 上面那条不是空转');
    a(r2.items.filter(function (x) { return x.degree === 1; }).length === 2
      && r2.items.filter(function (x) { return x.degree === 0; }).length === 1,
      'y7v2205/B8g: 度数按**节点标签**统计（边两端写的就是名字，本模块不擅自映射 id —— 实 '
      + j(r2.items.map(function (x) { return x.place + ':' + x.degree; })) + '）');
    a(r2.items[0].degree >= r2.items[r2.items.length - 1].degree,
      'y7v2205/B8h: 按度数降序排（同度按名字定序）—— 排序真跑过，不是「读数恒为 0 的空排」');
  }
  // ⑨ 定位：id 面 / label 面 / 重名**不猜** / 查无 / 空输入
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    const byId = G.locate('A');
    a(byId.ok === true && byId.matchedBy === 'id', 'y7v2205/B9: id 面精确命中（实 ' + j(byId.matchedBy) + '）');
    const byLabel = G.locate('老周');
    a(byLabel.ok === true && byLabel.matchedBy === 'label' && byLabel.node.id === 'A',
      'y7v2205/B9b: label 面命中（玩家从画面上读到的是 label —— 只认 id 等于「有出口、无从使用」）');
    a(G.locate('').reason === 'missing-id', 'y7v2205/B9c: 空输入 ⇒ missing-id（本页不猜）');
    a(G.locate('查无此人').reason === 'not-found', 'y7v2205/B9d: 查无 ⇒ not-found（与 ambiguous 分列）');
    WA.store.transact(function (d) { d.people = { p_1: { name: '同名者' }, p_2: { name: '同名者' } }; }, 'y7:dup');
    const dup = G.locate('同名者');
    a(dup.ok === false && dup.reason === 'ambiguous-label' && dup.candidates.length === 2,
      'y7v2205/B9e: 重名 ⇒ **不猜**：ambiguous-label 并列出候选（实 ' + dup.candidates.length + ' 条）');
    a(dup.candidates.every(function (c) { return c.id && c.kind && c.label; }),
      'y7v2205/B9f: 候选带 id / kind / label（让人自己选，不是随机给一个）');
    a(dup.candidates.map(function (c) { return c.id; }).join() === 'p_1,p_2',
      'y7v2205/B9g: 候选按节点集原序排出（可复现，不是乱序）');
  }
  // ⑩ 关闭态：三面**统一**如实报 disabled，诊断说清为什么没有读数
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    G.setSettings({ enabled: false });
    a(G.graph({}).reason === 'disabled' && G.geo({}).reason === 'disabled' && G.suggest({}).reason === 'disabled',
      'y7v2205/B10: 关闭时三面**统一**报 disabled（不是一面拒收另两面装正常）');
    const d = G.diagnose();
    a(d.enabled === false && d.live.reason === 'disabled',
      'y7v2205/B10b: 诊断如实反映关闭态（live 说清为什么没有读数，实 ' + j(d.live) + '）');
    // 关闭态下界面**不装死**：面板仍渲染、读数如实报「开关 关」
    const dom = gotoPage(env, 'graph');
    const out = String(clickOut(dom, 'wa-wg-build') || '');
    a(out.indexOf('disabled') >= 0, 'y7v2205/B10c: 关闭态下建图在界面上如实报 disabled（实 ' + j(out.slice(0, 60)) + '）');
    const dg = String(clickOut(dom, 'wa-wg-diag') || '');
    a(dg.indexOf('开关 关') >= 0, 'y7v2205/B10d: 诊断读数写明「开关 关」（关不是静默）');
    G.setSettings({ enabled: true });
    a(G.graph({}).ok === true, 'y7v2205/B10e: 前置自证：打开后同一调用能过（拒收不是「一律不开门」）');
  }
  // ⑪ 上游缺席 / 空表 / 模块缺席 —— 三种「没有」必须分得开（边界③）
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    WA.store.transact(function (d) { delete d.people; }, 'y7:delpeople');
    const gA = G.graph({ kinds: ['people'], edges: [] });
    a(gA.ok === true && gA.counts.nodes === 0, 'y7v2205/B11: 整类缺席时仍返回一张空图（不是拒收 —— 实 ' + gA.counts.nodes + '）');
    a(gA.absent.nodeKinds.length === 1 && gA.absent.nodeKinds[0].reason === 'source-absent',
      'y7v2205/B11b: 缺席**单列**在 absent 并带原因（实 ' + j(gA.absent.nodeKinds) + '）——「读不到」与「真的没有」是两件事');
    WA.store.transact(function (d) { d.people = {}; }, 'y7:emptypeople');
    const gB = G.graph({ kinds: ['people'], edges: [] });
    a(gB.ok === true && gB.counts.nodes === 0, 'y7v2205/B11c: 空表照旧 ok（实 ' + gB.counts.nodes + ' 个节点）');
    a(gB.absent.nodeKinds.length === 0,
      'y7v2205/B11d: 空表**不进** absent（空表是「真的没有」：这一格是 0 条，不是读不了）');
    WA.store.transact(function (d) { d.people = { A: { name: '老周' } }; }, 'y7:back');
    const keep = WA.atlas; delete WA.atlas;
    const gC = G.graph({ kinds: ['places'], edges: [] });
    a(gC.ok === true && gC.absent.nodeKinds.length === 1 && gC.absent.nodeKinds[0].reason === 'module-missing',
      'y7v2205/B11e: 上游模块整个缺席 ⇒ 如实报 module-missing（实 ' + j(gC.absent.nodeKinds) + '）—— 不是空集、也不抛');
    WA.atlas = keep;
    a(G.graph({ kinds: ['places'], edges: [] }).ok === true, 'y7v2205/B11f: 前置自证：装回上游后同一调用能过');
  }
  // ⑫ 面板真点：七枚按钮逐个走一遍，读数非空且逐处标「真源」
  {
    const env = mkEnv({ all: true }); const WA = env.WA;
    // 夹具补一条「另一端不在既有地点表里」的商路 —— 否则「未探索一侧」这一面
    //   在界面上根本不出现，判据会在空文案上假绿。
    WA.economy.setSettings({ enabled: true });
    WA.economy.route('r1', { lane: 'road', from: '扁担巷', to: '城外', cost: 7 });
    const dom = gotoPage(env, 'graph');
    typeLoc(dom, '老周');
    const f = dom.getElementById('wa-wg-from'); if (f) f.value = '扁担巷';
    const errs = []; const texts = {};
    BTN_IDS.forEach(function (id) {
      let t = '';
      try { t = String(clickOut(dom, id) || ''); } catch (e) { errs.push(id + ':' + (e && e.message)); }
      texts[id] = t;
    });
    a(errs.length === 0, 'y7v2205/B12: 七枚按钮逐个真点零抛出（实 ' + (errs.join(' | ') || '无') + '）');
    a(BTN_IDS.every(function (id) { return texts[id].length > 60; }),
      'y7v2205/B12b: 七枚读数都**非空**（实长度 ' + j(BTN_IDS.map(function (id) { return texts[id].length; })) + '）—— 渲染了且写得出，不是写进空气');
    a(BTN_IDS.every(function (id) { return texts[id].indexOf('真源') >= 0; }),
      'y7v2205/B12c: 每处读数都标「真源 WA.worldGraph.*」（视图不冒充新真源 —— 边界①）');
    a(texts['wa-wg-locate-go'].indexOf('matchedBy') >= 0 || texts['wa-wg-locate-go'].indexOf('按 label 匹配') >= 0,
      'y7v2205/B12d: 定位读数把 matchedBy 写出来（实 ' + j(texts['wa-wg-locate-go'].slice(0, 90)) + '）——「我按什么找到的」界面上可读');
    a(texts['wa-wg-anom'].indexOf('只标不删') >= 0, 'y7v2205/B12e: 异常面写明**只标不删**（边界③ 的界面实现）');
    a(texts['wa-wg-geo'].indexOf('未探索') >= 0 || texts['wa-wg-geo'].indexOf('端点在别处') >= 0,
      'y7v2205/B12f: 地理视图把「未探索一侧」画出来（功能② 的界面实现）');
    a(texts['wa-wg-time'].indexOf('不带时间戳') >= 0 || texts['wa-wg-time'].indexOf('尚无') >= 0,
      'y7v2205/B12g: 时间轴把无时间戳的来源与「尚无」都摆出来（功能③ 的界面实现）');
    a(texts['wa-wg-suggest'].indexOf('决定权在玩家') >= 0 || texts['wa-wg-suggest'].indexOf('来源说明') >= 0,
      'y7v2205/B12h: 建议面写明这是来源说明（功能④ 的界面实现）');
  }
  // ⑬ 预算：节点先截、边按已留节点集过滤，两处截断数都如实报（边界②）
  {
    const env = mkEnv({ all: true }); const WA = env.WA, G = WA.worldGraph;
    WA.store.transact(function (d) {
      const rows = [];
      for (let i = 0; i < 5; i++) rows.push({ key: 'k' + i, a: '老周', b: '茶楼老板', types: ['friend'], at: i + 1 });
      d.bonds = { rows: rows };
    }, 'y7:edges');
    const g = G.graph({ kinds: ['people'], edges: ['bonds'], maxEdges: 2 });
    a(g.ok === true && g.counts.edges === 2, 'y7v2205/B13: 边数被预算压住（实 ' + g.counts.edges + ' ≤ 2）');
    a(g.truncated.edges === 3, 'y7v2205/B13b: 被截掉的边数**如实报出**（实 ' + g.truncated.edges + ' = 5 - 2）—— 降级不是丢数据');
    const g2 = G.graph({ kinds: ['people'], edges: ['bonds'], maxNodes: 1, maxEdges: 10 });
    a(g2.truncated.nodes === 1, 'y7v2205/B13c: 节点被截 1 条（实 ' + g2.truncated.nodes + '）');
    a(g2.counts.edges === 0 && g2.anomalies.dangling.length === 5,
      'y7v2205/B13d: 节点先截 ⇒ 只剩一个端点时边连不上：五条全进悬空（实边 ' + g2.counts.edges
      + ' / 悬空 ' + g2.anomalies.dangling.length + '）—— 连不上就说连不上，不假装连上');
  }
  // ⑭ 导出面运行时收口：三个内部面**运行时也不在**（不是靠注释声明不导出）
  {
    const env = mkEnv({ all: true }); const G = env.WA.worldGraph;
    a(typeof G.nodes === 'undefined' && typeof G.edges === 'undefined' && typeof G.cycles === 'undefined',
      'y7v2205/B14: nodes / edges / cycles 运行时也不在导出面上（摘除真的是摘除）');
    a(typeof G.graph === 'function' && typeof G.diagnose === 'function' && typeof G.stat === 'function',
      'y7v2205/B14b: 真读口与自证面都在导出面上（接口面只留页面真走的口）');
    G.graph({ kinds: ['people'], edges: [] });
    const st = G.stat();
    a(st.builds >= 1 && typeof st.nodes === 'number',
      'y7v2205/B14c: stat 是**本进程读数**（实 builds ' + st.builds + ' / nodes ' + st.nodes + '）');
    const d = G.diagnose();
    a(String(d.source).indexOf('四张既有表') >= 0,
      'y7v2205/B14d: 诊断写明真源是那四张既有表（实 ' + j(d.source) + '）');
  }
  // ════ C 段：不变式（零写入） ═══════════════════════════════════
  {
    const env = mkEnv({ all: true }); const WA = env.WA;
    const dom = gotoPage(env, 'graph');
    typeLoc(dom, '老周');
    const f = dom.getElementById('wa-wg-from'); if (f) f.value = '扁担巷';
    LS.clear();
    const S0 = JSON.stringify(WA.store.get());
    const L0 = JSON.stringify(LS.getItem(LSKEY));
    // 先落一格偏好（让「只读出口不动偏好键」这条**有东西可动** —— 否则它在 null 上恒真）
    // ⚠ 写一个**与当前值不同**的值：写成同一个数时若上游做了去重，
    //   「键确实变了」这条会退化成空转（在旧值上恒真）。
    const curWg = WA.worldGraph.getSettings().maxNodes;
    const nextWg = (curWg === 60) ? 61 : 60;
    WA.worldGraph.setSettings({ maxNodes: nextWg });
    const L1 = JSON.stringify(LS.getItem(LSKEY));
    a(L1 !== L0 && WA.worldGraph.getSettings().maxNodes === nextWg,
      'y7v2205/C0: 反面前置自证：写口**真能写**偏好键（读回 ' + WA.worldGraph.getSettings().maxNodes
      + ' / 键 ' + j(L1 && L1.slice(0, 60)) + '）—— 下面那条不是空转');
    const S1 = JSON.stringify(WA.store.get());
    a(S1 === S0, 'y7v2205/C0b: 写偏好键**一格世界状态都没动**（偏好与存档是两本账）');
    // 七枚按钮逐个真点（含建图 / 建议 / 定位 / 诊断）—— 世界与偏好键逐字不变
    const errs = [];
    BTN_IDS.forEach(function (id) {
      try { const b = dom.getElementById(id); if (b && typeof b.onclick === 'function') b.onclick({ target: b }); }
      catch (e) { errs.push(id + ':' + (e && e.message)); }
    });
    a(errs.length === 0, 'y7v2205/C1: 七枚出口逐个点过零抛出（实 ' + (errs.join(' | ') || '无') + '）');
    a(JSON.stringify(WA.store.get()) === S1, 'y7v2205/C2: **活世界逐字不变**（验收④：视图不产生写入 —— 七枚全点过）');
    a(JSON.stringify(LS.getItem(LSKEY)) === L1,
      'y7v2205/C2b: 本模块偏好键在**只读出口**上逐字不变（实 ' + j(LS.getItem(LSKEY)) + '）');
    // 引擎五个只读口直调也不动世界（不是只有界面路径干净）
    const S2 = JSON.stringify(WA.store.get()); const L2 = JSON.stringify(LS.getItem(LSKEY));
    WA.worldGraph.graph({});
    WA.worldGraph.geo({ from: '扁担巷' });
    WA.worldGraph.timeline({});
    WA.worldGraph.suggest({});
    WA.worldGraph.locate('老周');
    a(JSON.stringify(WA.store.get()) === S2, 'y7v2205/C3: 五个引擎只读口直调同样不动世界（实 ' + (JSON.stringify(WA.store.get()) === S2) + '）');
    a(JSON.stringify(LS.getItem(LSKEY)) === L2, 'y7v2205/C3b: 五个引擎只读口不动偏好键');
    // 写口存活自证：setSettings 是**唯一**的写口，它只动偏好键
    const S3 = JSON.stringify(WA.store.get());
    const cur2 = WA.worldGraph.getSettings().maxNodes;
    const next2 = (cur2 === 80) ? 81 : 80;
    WA.worldGraph.setSettings({ maxNodes: next2 });
    a(WA.worldGraph.getSettings().maxNodes === next2,
      'y7v2205/C4: 写口能写且读回一致（实 ' + WA.worldGraph.getSettings().maxNodes + ' / 期望 ' + next2 + '）');
    a(JSON.stringify(WA.store.get()) === S3, 'y7v2205/C4b: 写口**不动世界**（视图面唯一写口只落偏好键）');
    a(JSON.stringify(LS.getItem(LSKEY)) !== L2, 'y7v2205/C4c: 反面前置自证：偏好键确实变了（实 ' + j(LS.getItem(LSKEY)) + '）');
    // 越界预算被夹住、且**不落越界值**（写口也不撒谎）
    WA.worldGraph.setSettings({ maxNodes: 99999 });
    const gs = WA.worldGraph.getSettings();
    a(gs.maxNodes <= WA.worldGraph.CAPS.maxNodes, 'y7v2205/C4d: 越界预算被夹到上限（实 ' + gs.maxNodes + ' ≤ ' + WA.worldGraph.CAPS.maxNodes + '）');
    // 面板渲染本身（切页）不写世界
    const S4 = JSON.stringify(WA.store.get());
    gotoPage(env, 'find'); gotoPage(env, 'graph');
    a(JSON.stringify(WA.store.get()) === S4, 'y7v2205/C5: 切页渲染本身不写世界（渲染 ≠ 落盘）');
  }
  // ════ N 段：真源码破坏 + 两向自证 ══════════════════════════════
  const CASES = [
    { n: 1, k: 'page', to: '/* graph 页被删 */', check: 'A2',
      why: '页表删掉 graph ⇒ 页签不在场，A2 必须现形',
      judge: function (s) { return s.indexOf("    { id: 'graph', icon: '🕸', label: '图谱' },") < 0; } },
    { n: 2, k: 'renderer', to: 'graph: renderEvents,', check: 'A2c',
      why: '把 graph 的渲染器接到别处 ⇒ 页里读不到图谱专属标题',
      judge: function (s) { return s.indexOf('find: renderFindCenter, graph: renderGraphCenter,') < 0; } },
    { n: 3, k: 'outSel', to: "const wgOut = function (html) { const o = $('#wa-wg-out-x');", check: 'A4b',
      why: '读数出口选择器改坏（渲染了但写不进去）⇒ 七枚读数必须全空',
      // ⚠ 破坏**只动选择器那一半**（保留 `const wgOut =` 声明本身）。
      //   锚点若取整句、替换成裸表达式，连函数声明一起被摘掉，后续 `wgOut(...)`
      //   全变 ReferenceError —— 那破坏的是**绑定**，不是读数去处。
      judge: function (s) { return s.indexOf("const wgOut = function (html) { const o = $('#wa-wg-out');") < 0; } },
    { n: 4, k: 'guard', to: "    { page: 'graphX', ids: ['wa-wg-kinds', 'wa-wg-edges', 'wa-wg-build',", check: 'A2d',
      why: '守卫表登记到不存在的页 ⇒ 守卫覆盖面查不到这一页',
      judge: function (s) { return s.indexOf("    { page: 'graph', ids:") < 0; } },
    { n: 5, k: 'swLine', to: 'id="wa-sw-worldgraph-x" data-sw-ns="worldGraph"', check: 'A10',
      why: '设置页总开关 id 改坏 ⇒ 接线面断（setSettings 的真消费方从守卫面上消失）',
      judge: function (s) { return s.indexOf('id="wa-sw-worldgraph" data-sw-ns="worldGraph"') < 0; } },
    { n: 6, k: 'swReg', to: "      'wa-sw-worldgraph-x',", check: 'A10b',
      why: '守卫表里控件名改坏 ⇒ H2 双红（渲染的控件不在守卫表里）',
      judge: function (s) { return s.indexOf("      'wa-sw-worldgraph',") < 0; } },
    { n: 7, k: 'kinds', to: "const KINDS = ['people', 'orgs'];", check: 'B1c',
      why: '节点白名单少一类 ⇒ 地点再也建不进图（整类静默消失）',
      judge: function (s) { return s.indexOf("const KINDS = ['people', 'orgs', 'places'];") < 0; } },
    { n: 8, k: 'edgeKinds', to: "const EDGE_KINDS = ['relations', 'faction'];", check: 'B1c',
      why: '边白名单少一条 ⇒ 关系六型登记再也进不来（边静默少一类）',
      judge: function (s) { return s.indexOf("const EDGE_KINDS = ['relations', 'faction', 'bonds'];") < 0; } },
    { n: 9, k: 'lskey', to: "const LS_KEY = 'worldaxis_worldgraph_v2';", check: 'C2b',
      why: '偏好键换名 ⇒ 旧键读不到开关与预算（读数与落盘脱节）',
      judge: function (s) { return s.indexOf("const LS_KEY = 'worldaxis_worldgraph_v1';") < 0; } },
    { n: 10, k: 'badKind', to: "if (false) return { ok: false, reason: 'bad-kind', kinds: badKinds };", check: 'B3',
      why: '节点类白名单判据被短路 ⇒ 未知节点类静默忽略（白名单不再是判据面）',
      judge: function (s) { return s.indexOf("if (badKinds.length) { noteFault('bad-kind');") < 0; } },
    { n: 11, k: 'badEdgeKind', to: "if (false) return { ok: false, reason: 'bad-edge-kind', edgeKinds: badEdgeKinds };", check: 'B3b',
      why: '边类白名单判据被短路 ⇒ 未知边类静默吞掉（两侧不再同宽）',
      judge: function (s) { return s.indexOf("if (badEdgeKinds.length) { noteFault('bad-edge-kind');") < 0; } },
    { n: 12, k: 'degByLabel', to: "deg[e.from + '//never'] = (deg[e.from + '//never'] || 0) + 1;", check: 'B8f',
      why: '度数按一个不存在的键统计 ⇒ 每个地点恒 0 分（「按度数排序」等于没有排序）',
      judge: function (s) { return s.indexOf('deg[e.from] = (deg[e.from] || 0) + 1;') < 0; } }
  ];
  CASES.forEach(function (cs) {
    const rel = C.TGT ? C.TGT[cs.k] : null;
    const S = rd(rel);
    const from = C.ANCHOR[cs.k];
    const hits = cnt(S, from);
    a(hits === 1, 'y7v2205/N0(' + cs.n + '): 破坏锚点 ' + cs.k + ' 在 ' + rel + ' 恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = S.split(from).join(cs.to);
    a(broken !== S, 'y7v2205/Na(' + cs.n + '): 破坏真的改动了源码文本');
    a(cnt(S, cs.to) === 0, 'y7v2205/Nb(' + cs.n + '): 原版上破坏产物不存在（否则判据是自指的）');
    a(cs.judge(broken) === true, 'y7v2205/N' + cs.n + 'a: ' + cs.why);
    a(cs.judge(S) === false, 'y7v2205/N' + cs.n + 'b: （纯度）原版上同款判据为假 —— 破坏确实改变了源码形态');
  });
  // ── 两向自证用的夹具：与 B 段同源，但**不依赖 mkEnv**（它不接受源码覆盖）──
  function seedN(d) {
    d.people = { A: { name: '老周' }, B: { name: '茶楼老板' } };
    d.region = { places: [{ name: '扁担巷', distanceDays: 2 }, { name: '南街', distanceDays: 1 }], events: [] };
    d.evolution = { factions: [{ name: '义顺堂', relation: '盟友', status: '稳固', scope: '城南' }] };
    d.bonds = { rows: [{ key: '老周×茶楼老板', a: '老周', b: '茶楼老板', types: ['friend'], at: 1700000000000 }] };
    d.economy = { goods: [], orders: [], routes: [] };
    d.freight = { shipments: [] };
  }
  /** 在**破坏副本**（ov）或原版（null）上装载产品并跑一段探针。 */
  function mkRun(ov, fn) {
    const env = C.env0(ov || null);
    const WA = env.WA;
    C.seed(WA, seedN);
    resetSettings(WA);
    if (WA.atlas && WA.atlas.setSettings) WA.atlas.setSettings({ enabled: true });
    if (WA.diplomacy && WA.diplomacy.setSettings) WA.diplomacy.setSettings({ enabled: true });
    if (WA.economy && WA.economy.setSettings) WA.economy.setSettings({ enabled: true });
    return fn(env, WA);
  }
  // N13：破坏版**跑产品**两向自证 —— 读数出口 id 改坏后按钮还能点，但读数再也写不进去
  (function () {
    const S = rd(C.PANEL_REL);
    const from = C.ANCHOR.outSel;
    if (cnt(S, from) !== 1) { a(false, 'y7v2205/N13a: 读数出口选择器锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("const wgOut = function (html) { const o = $('#wa-wg-out-x');");
    const ov = {}; ov[C.PANEL_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env) {
        const dom = C.gotoPageF(env, 'graph');
        let threw = null;
        try { C.clickOutF(dom, 'wa-wg-build'); } catch (e) { threw = String((e && e.message) || e); }
        const o = dom.getElementById('wa-wg-out');
        // v2.230.0 收口：「读数为空」的判据面是**容器子元素数**（mini-DOM 的 innerHTML
        //   getter 会把容器自身标签序列化进去 ⇒ 空容器也不是 0 长度）。
        return { threw: threw, len: String(o ? o.innerHTML : '').length,
          empty: !!(o && o.childNodes.length === 0) };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y7v2205/N13b: 两版都不抛到探针外（实 ' + j(threw) + '）');
    a(bad && bad.threw === null && bad.empty === true,
      'y7v2205/N13c: （两向）破坏版上点按钮**不抛**但读数**为空**（出口容器零子元素；实 ' + j(bad && bad.len) + ' 字符是容器自身序列化）—— 破坏的是读数去处，不是绑定');
    a(good && good.len > 0, 'y7v2205/N13d: （两向）原版上同款操作读数非空（实 ' + j(good && good.len) + '）—— 判据区分得开两向');
  })();
  // N14：破坏版跑产品 —— **边类白名单判据被短路**后，未知边类**真的**被静默吞掉（两向）。
  //   这一条钉住本版从探针实测里揪出的真缺陷之一：首版只校验了 `o.kinds`，
  //   `o.edges: ['不存在的边类']` 被 `EDGE_KINDS.filter` 静默吞掉、返回 ok:true 零边 ——
  //   而**只跑节点类那条判据的一条都照不出来**（声明与实现在同一处各说一遍的同族）。
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.badEdgeKind;
    if (cnt(S, from) !== 1) { a(false, 'y7v2205/N14a: 边类白名单判据锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("if (false) return { ok: false, reason: 'bad-edge-kind', edgeKinds: badEdgeKinds };");
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        const r = WA.worldGraph.graph({ edges: ['nope'] });
        return { ok: r.ok, reason: r.reason, edges: r.counts ? r.counts.edges : null };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y7v2205/N14b: 两版都不抛（实 ' + j(threw) + '）');
    a(bad && bad.ok === true && bad.edges === 0,
      'y7v2205/N14c: （两向）判据被摘掉后未知边类**真的**被静默吞掉：ok:true 且零边（实 ' + j(bad) + '）—— 白名单是判据面，不是装饰');
    a(good && good.ok === false && good.reason === 'bad-edge-kind',
      'y7v2205/N14d: （两向）原版上同款调用整条拒收并带回名单（实 ' + j(good) + '）—— 两向区分得开');
  })();
  // N15：破坏版跑产品 —— 导出面**摘错口**后，面板诊断按钮**真的**变成「读不到」（两向）。
  //   口径与死导出门禁同源：接口面只留页面真走的口；摘掉的若是真走的那一口，
  //   面板会整面瞎 —— 这是「接线优先于摘除，但只接真正该在这里的线」的反面证据。
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.exportsFace;
    if (cnt(S, from) !== 1) { a(false, 'y7v2205/N15a: 导出面收口锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join('    diagnose: undefined, stat: statOf');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        const isFn = typeof WA.worldGraph.diagnose === 'function';
        const dom = C.gotoPageF(env, 'graph');
        const txt = String(C.clickOutF(dom, 'wa-wg-diag') || '');
        return { isFn: isFn, txt: txt };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y7v2205/N15b: 两版都不抛到探针外（实 ' + j(threw) + '）');
    a(bad && bad.isFn === false && bad.txt.indexOf('diagnose 口') >= 0,
      'y7v2205/N15c: （两向）诊断口被摘后**真的**不是函数、面板如实报「图谱面（diagnose 口）」读不到（实 ' + j(bad && bad.txt.slice(0, 50)) + '）');
    a(good && good.isFn === true && good.txt.indexOf('真源') >= 0,
      'y7v2205/N15d: （两向）原版上诊断口在、面板出读数（实 ' + j(good && good.txt.slice(0, 40)) + '）—— 两向区分得开');
  })();
  // N16：破坏版跑产品 —— **locate 只认 id** 后，玩家从画面上读到的名字**真的**定位不到（两向）。
  //   真缺陷之二：`id` 在界面上从不显示，玩家读到的是 label —— 只按 id 匹配
  //   等于「输入一个你不可能知道的值」：功能在场、通向它的路不在场。
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.locateLabel;
    if (cnt(S, from) !== 1) { a(false, 'y7v2205/N16a: label 面匹配锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join('const same = [];');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        const r = WA.worldGraph.locate('老周');
        return { ok: r.ok, reason: r.reason, by: r.matchedBy };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y7v2205/N16b: 两版都不抛（实 ' + j(threw) + '）');
    a(bad && bad.ok === false && bad.reason === 'not-found',
      'y7v2205/N16c: （两向）label 面被摘后**真的**查不到玩家读到的那个名字（实 ' + j(bad) + '）—— 有出口、无从使用');
    a(good && good.ok === true && good.by === 'label',
      'y7v2205/N16d: （两向）原版上同款输入按 label 命中（实 ' + j(good && good.by) + '）—— 两向区分得开');
  })();
  // N17：破坏版跑产品 —— **度数按不存在的键统计**后，每个地点**真的**恒 0 分（两向）。
  //   真缺陷之三：「读数恒为 0 的排序 = 没有排序」—— 功能④ 对玩家而言是一条
  //   永远说「全是 0 分」的建议，而它看起来像在排序。
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.degByLabel;
    if (cnt(S, from) !== 1) { a(false, 'y7v2205/N17a: 度数按标签统计锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("deg[e.from + '//never'] = (deg[e.from + '//never'] || 0) + 1;");
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        // 夹具：让**地名**当边端点（原版下这两条地点度数各 1）—— 用 bonds 走登记面
        WA.store.transact(function (d) {
          d.bonds = { rows: [{ key: 'k', a: '扁担巷', b: '南街', types: ['x'], at: 1 }] };
        }, 'y7:n17');
        const r = WA.worldGraph.suggest({});
        const it = (r.items || []).filter(function (x) { return x.place === '扁担巷'; })[0];
        return { linked: r.linked, fromDeg: it ? it.degree : null,
          degs: (r.items || []).map(function (x) { return x.degree; }) };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y7v2205/N17b: 两版都不抛（实 ' + j(threw) + '）');
    // ⚠ 度数有两行（from 侧 / to 侧），锚点只摘得掉 from 那一行 —— 故判据必须判
    //   **被摘的那一侧**（作为 from 端的「扁担巷」），不能笼统要求「全为 0」。
    a(bad && bad.fromDeg === 0 && bad.linked < good.linked,
      'y7v2205/N17c: （两向）键写错后作为 from 端的那一格**真的**统计不到（扁担巷 实 '
      + j(bad && bad.fromDeg) + ' / linked ' + j(bad && bad.linked) + '）—— 读数整体塌下去，排序成了空排');
    a(good && good.linked === 2 && good.fromDeg === 1,
      'y7v2205/N17d: （两向）原版上同款夹具度数真涨（扁担巷 ' + j(good && good.fromDeg)
      + ' / linked ' + j(good && good.linked) + '）—— 两向区分得开');
  })();
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY7 s3-y7-v2205 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
