#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b3-n8-v2224.js (v2.224.0) — N8 分支语义比较与选择性移植专锁(四段齐备)
//
// 【计划原文逐条对照】(双九项计划 · 项目 N8)
// 计划原文:「基于 checkpoints 谱系、branch-tree 与快照,从顶层键/摘要差异升级为
//   **实体 / 关系 / 义务 / 事件差异**;**有共同基点才做三方比较**。只移植**明确支持**的
//   实体配置与改动,**历史付款、揭密、已结算因果默认不可重放**。基点缺失报不可比,原分支不改。」
//
// 【本版对三处字面的**如实处理**(不遮掩)】
//   1 「原分支不改」的**实现方式**是「这个模块里没有写路径」:三个口全部 readOnly,
//     模块内**零 store.transact**;面板那块**也不给任何落地按钮**。
//     判据 A3 / A3b / B11 / C5 都咬这一点(不是靠一句声明)。
//   2 三方比较的「共同基点」取**槽位 root**(checkpoints 把父链存进槽位,正是为了让
//     「我从哪来」能独立复述)。三方 root 不全相同 ⇒ no-basis,并把三个 root 一并带回。
//   3 历史项的「默认不可重放」落在**两类**上:`replay:'ledger'` 的账本面,
//     以及**行上带结算标记**的义务(freight 的 delivered / causal 的 settled 键)。
//     打开 includeHistory 后逐行标 history:true,由调用方自负 —— 本模块不替它说「这笔过去没发生」。
//
// 【本轮探针实测到的三处**真缺陷**(都在写锁之前修掉了,写进判据当基线)】
//   D1 **多字段 id 顺序敏感**:bonds 的 key+a+b 全拼进 id ⇒ A(key,a=甲,b=乙) 与
//      B(key,a=乙,b=甲) 得到两个不同 id,一对「同一行」被读成「两边各有一行」(凭空造差异)。
//      修法:配对键(ids[0])决定配对,同批校验字段(ids[1..])**排序后**拼接 ⇒ 顺序无关。
//   D2 **no-change 混入 allowed**:两边逐字相同的行没有可移植内容,却计入「可移植 N 笔」
//      ⇒ 读数从吹报的 allowed=7 落回 allowed=2。修法:单列 unchanged 一栏。
//   D3 **历史判定先于 no-change**:逐字相同的账本行(如 causal.settled 里那笔)因 history
//      被拦成 blocked ⇒「本来没变化」被说成「被规则挡住」。修法:先判 no-change,
//      历史判定只作用于**真要动**的行。
//   ⇒ 判据 B3d / B4e / B4f / B9c 逐条钉住这三处(破坏其任一,对应判据必现形)。
//
// 【本轮实测到的**第二处真缺陷 D4**(面板端到端探针抓到,已修)】
//   绑定块落进了 `if (currentPage === 'tools')` 分支,而控件**渲染**在 branchdiff 页
//   ⇒ branchdiff 页上五枚按钮的 onclick 全是 undefined(探针读数:NO-HANDLER)。
//   修法:整块移到 `if (currentPage === 'branchdiff')` 守卫里。
//   ⇒ 判据 A8 / A8b / B10 / B10f / N3 咬这一点:「绑定页必须等于渲染页」。
//
// 【本轮实测到的**真源不完整**(如实留账)】
//   `world-snapshot` 导出的 IDENTITY_REFS **丢了 fields 数组**(只 map 出 face/at/field/domain)。
//   后果:多字段行(bonds 的 key+a+b)从真源取不全。本模块退到声明表兜底并把 idSource
//   **如实标成 declared**,绝不假称「这是从真源拿到的」。修导出面属另一件事(会动
//   export-contract 的冻结串),故本轮不改它。判据 A6 / B6b 咬这一点。
//
// 【锚点为什么由生成器读出(一条工具链教训)】
//   本项目在终端侧用脚本改产品文件时反复踩到:某些编辑通道会把脚本里的 ASCII
//   `:` `(` `)` 归一化成全角,于是「在锁里手写一条产品源码字面量」会在多轮编辑后
//   **静默失配** —— 要么 A12 报红,要么更糟:锚点悄悄变成 0 命中、破坏段整段哑掉。
//   故本文件里凡是要与产品源码**逐字对上**的字符串,全部由 tools 侧生成器从源码读出
//   (见本文件 ANCHOR 表上方的注释);本文件只留 `ANCHOR.<名字>` 的引用。
//   A12 判据因此**真的在验**:它验的是「生成器读出来的东西,在盘上仍恰 1 次」。
//
// 四段结构(与 Y7/Y8/Y9/N3/N4/N7 同规格):
//   A 段 静态契约(段切片 / 控件三件齐 / 锚点纯度 / 单一真源 / 导出面收口 / 跨文件见证 / 页守卫)
//   B 段 运行时与四件套(B1 导出面 ~ B12 面板端到端 + 写入路径)
//   C 段 零泄漏不变式(live / localStorage 两条各判一次,且都是**实测差**)
//   N 段 真源码破坏 + 两向自证(含 N0 静态面)
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const ENG_REL = 'engines/branch-diff.js';
const SELF_REL = 'tests/s3-b3-n8-v2224.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 把「设置态」按各引擎**自己的**默认值显式写回(装置件、模块级 —— 理由与 Y6~Y9/N7 同)。 */
function resetSettings(WA) {
  // 先清偏好键:gate.fresh() 只复位宿主窗口与设置登记表,**不清 localStorage** ——
  //   不清的话 N 段前一脚(破坏版)写下的东西会漏进后一脚(原版)。
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  try { if (WA.checkpoints) WA.checkpoints.setSettings({ enabled: false, autoEvery: 0 }); } catch (e) {}
  try { if (WA.branchDiff) WA.branchDiff.setSettings({ enabled: false, includeHistory: false, maxRows: 200 }); } catch (e) {}
}
// ── 破坏锚点(**由 tools 侧生成器从产品源码逐字读出**;各恰 1 次,A12 逐键核)──
//   ⚠ 为什么不在这里手写:见本文件头注「锚点为什么由生成器读出」。
const ANCHOR = {
  facesDecl: '\n  const FACES = [',
  classes: '\n  const CLASSES = [\'entity\', \'relation\', \'obligation\', \'event\'];',
  idSpec: '\n  function idSpec(face) {',
  declaredFallback: '\n    const own = (face.ids ? face.ids.slice() : []);',
  rowsOf: '\n  function rowsOf(st, face) {',
  joinedId: '\n      const id = keyVals.length ? (String(keyVals[0]) + (extraVals.length ? (\'|\' + extraVals.join(\'|\')) : \'\')) : \'\';',
  semanticDiff: '\n  function semanticDiff(aId, bId, opts) {',
  boundFn: '\n  function bound(arr, cap) {',
  triDiff: '\n  function triDiff(baseId, aId, bId, opts) {',
  noBasis: '\n    if (!rB || rB !== rA || rB !== rB2) {',
  transplant: '\n  function transplant(srcId, dstId, opts) {',
  roMouth: '\n    return { ok: true, readOnly: true, a: { id: A.slot.id, name: A.slot.name, root: rootOf(A.slot) },',
  unchangedFirst: '\n        if (ok && reason === \'no-change\') {',
  noChangeDetect: '\n        else if (drow && sig(srow) === sig(drow)) { kind = \'unchanged\'; ok = true; reason = \'no-change\'; }',
  sortExtra: '\n        .map(String).sort();',
  historyGate: '\n        const history = (face.replay === \'ledger\') || settled;',
  historyBlock: '\n        if (ok && history && !allowHistory) { ok = false; reason = \'history\' + (settled ? \'/settled\' : \'\'); }',
  allowedCount: '\n    let allowed = 0, blocked = 0, unchanged = 0;',
  catalog: '\n  function catalog() {',
  statFn: '\n  function stat_() {',
  exportsFace: '\n    semanticDiff: semanticDiff, triDiff: triDiff, transplant: transplant,',
  register: '\n  if (typeof WA.registerModule === \'function\') WA.registerModule(\'engines/branch-diff.js\', { kind: \'engine\', ver: \'2.224.0\' });',
  settingsReg: '\n  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);',
  diagMod: '\n    \'engines/branch-diff.js\': \'branchDiff\',',
  guardIds: '\n      \'wa-bd-base\', \'wa-bd-tri\', \'wa-bd-cat\', \'wa-bd-src\', \'wa-bd-dst\', \'wa-bd-classes\', \'wa-bd-plan\', \'wa-bd-stat\'] },',
  pRenderFn: '\n  function renderBranchDiff() {',
  pRenderer: '\n  const RENDERERS = { overview: renderOverview, world: renderWorld, people: renderPeople, memory: renderMemory, enemies: renderEnemies, parallel: renderParallelWorld, inject: renderInject, sediment: renderSediment, offline: renderOffline, net: renderNet, health: renderHealth, beat: renderBeatCenter, chapter: renderChapterWorkbench, todo: renderTodoCenter, port: renderPortCenter, find: renderFindCenter, graph: renderGraphCenter, travel: renderTravelDesk, supply: renderSupplyChain, evidence: renderEvidenceBoard, events: renderEvents, director: renderDirector, connect: renderConnect, tools: renderTools, branchdiff: renderBranchDiff, logs: renderLogs,',
  pPage: '\n    { id: \'branchdiff\', icon: \'🌿\', label: \'分支比较\' },',
  pBindDiff: '\n      on(\'#wa-bd-diff\', () => {',
  pBindPlan: '\n      on(\'#wa-bd-plan\', () => {',
  pCallDiff: '\n        const r = WA.branchDiff.semanticDiff(A, B, {});',
  pCallPlan: '\n        const r = WA.branchDiff.transplant(wv(\'#wa-bd-src\'), wv(\'#wa-bd-dst\'), cl.length ? { classes: cl } : {});',
  pOut: '\n      <div id="wa-bd-out" class="wa-out"></div>`;',
  segRenderEnd: '\n  function renderTools() {',
  segBindStart: '\n    // ── v2.224.0(N8):分支语义比较与选择性移植(engines/branch-diff.js,7 导出)──',
  segEnd: '\n    // v2.187.0（E6）：统一世界地图与关系视图的面板消费方。',
  segGuard: '\n    if (currentPage === \'branchdiff\') {',
  segGuardTools: '\n    if (currentPage === \'tools\') {',
};
const TGT = {};
Object.keys(ANCHOR).forEach(function (k) { TGT[k] = ENG_REL; });
['diagMod', 'guardIds'].forEach(function (k) { TGT[k] = DIAG_REL; });
['pRenderFn', 'pRenderer', 'pPage', 'pBindDiff', 'pBindPlan', 'pCallDiff', 'pCallPlan', 'pOut', 'segRenderEnd', 'segBindStart', 'segEnd', 'segGuard', 'segGuardTools'].forEach(function (k) { TGT[k] = PANEL_REL; });
/** 四类(结构性事实:面清单是闭合集合,不是跑出来的数字)。 */
const CLASSES = ['entity', 'relation', 'obligation', 'event'];
/** 四类的中文名(与引擎 CLS_LABEL 同值 —— 展示面不许自己编一套叫法)。 */
const LABELS = { entity: '实体', relation: '关系', obligation: '义务', event: '事件' };
/** ledger 档的面(默认不可重放的那一批)。 */
const LEDGER_FACES = ['currents', 'echoes', 'chronicle', 'causal.settled', 'beatLedger.rows'];
/** live 档的面。 */
const LIVE_FACES = ['people', 'evolution.factions', 'inst.orgs', 'people', 'people',
  'fondness.rows', 'bonds.rows', 'freight.shipments', 'causal.chains', 'people'];
/** 导出面 8 口(函数面);静态成员另计(CLASSES / FACES / CLS_LABEL)。 */
const EXPORTS = ['semanticDiff', 'triDiff', 'transplant', 'catalog', 'stat', 'reset',
  'getSettings', 'setSettings'];
/** 新增面板控件(渲染段与守卫表口径一致;两个复选框是 onchange,无 onclick)。 */
const NEW_IDS = ['wa-bd-enabled', 'wa-bd-history', 'wa-bd-a', 'wa-bd-b', 'wa-bd-diff',
  'wa-bd-base', 'wa-bd-tri', 'wa-bd-cat', 'wa-bd-src', 'wa-bd-dst', 'wa-bd-classes',
  'wa-bd-plan', 'wa-bd-stat'];
/** **有 onclick 的**那五枚(其余是输入框与复选框)。 */
const BTN_IDS = ['wa-bd-diff', 'wa-bd-tri', 'wa-bd-cat', 'wa-bd-plan', 'wa-bd-stat'];
/** 拒收词表(引擎侧六态 + 面板侧 bdWhy 的六条对照)。 */
const REASONS = ['disabled', 'module-missing', 'missing-fields', 'missing', 'no-basis', 'lib-unreadable'];
/** 它页控件前缀(段切片蔓延检查用)。 */
const OTHER_PREFIX = ['wa-wl-', 'wa-rp-', 'wa-wg-', 'wa-hs-', 'wa-ck-'];
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
  /**
   * 造 A 快照:甲/乙两人 + 一条好感 + 一条配对 + 一条在途货运 + 一笔已结算因果。
   *   ⚠ bonds 的 a/b **故意是**甲,乙(D1 那条缺陷靠 B 侧的「乙,甲」现形:
   *     顺序敏感的实现会把同一行读成两行)。
   *   ⚠ people 里 p1 的 profile 挂 relations(乙)/ life 挂 commitments(丙):
   *     它们让 relation / obligation 两类各有一个**嵌套面**样本。
   */
  function seed(WA) {
    WA.store.init();
    WA.checkpoints.setSettings({ enabled: true, maxSlots: 12 });
    WA.branchDiff.setSettings({ enabled: true, includeHistory: false, maxRows: 200 });
    WA.store.transact(function (d) {
      d.people = {
        p1: { id: 'p1', name: '甲', profile: { relations: [{ target: '乙', kind: 'friend' }] },
          life: { commitments: [{ target: '丙', duty: '护送' }] } },
        p2: { id: 'p2', name: '乙' }
      };
      d.fondness = { rows: [{ person: '甲', value: 10 }] };
      d.bonds = { rows: [{ key: '甲×乙', a: '甲', b: '乙', tier: 2 }] };
      d.freight = { shipments: [{ id: 'sh1', from: '甲', to: '乙', status: 'transit' }] };
      d.causal = { chains: [{ id: 'cs1', action: '发货' }], settled: [{ id: 'st1', result: '货到了' }] };
    }, 'n8:seedA');
  }
  /** B 快照:多一人丙 / fondness 两条 / bonds 的 a b **互换** / 货运已交付 / 多一笔结算。 */
  function seedB(WA) {
    WA.store.transact(function (d) {
      d.people.p3 = { id: 'p3', name: '丙' };
      d.fondness = { rows: [{ person: '甲', value: 30 }, { person: '丙', value: 5 }] };
      d.bonds = { rows: [{ key: '甲×乙', a: '乙', b: '甲', tier: 3 }] };
      d.freight = { shipments: [{ id: 'sh1', from: '甲', to: '乙', status: 'delivered' }] };
      d.causal.settled.push({ id: 'st2', result: '第二批到了' });
    }, 'n8:seedB');
  }
  /** 造 A / B 两份**不同源**的快照(D 段:它们 root 不同)。 */
  function mk(ov) {
    const env = env0(ov || null);
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    seed(WA);
    const A = WA.checkpoints.save('作者A', {});
    seedB(WA);
    const B = WA.checkpoints.save('作者B', {});
    return { env: env, WA: WA, A: A, B: B };
  }
  /**
   * 造**同 root 的三方样本**(基地 + 两条兄弟档)。
   *   ⚠ 不能用 checkpoints.branch 造兄弟:branch 的实现是「先 restore、后 save」
   *     (见 engines/checkpoints.js 的 branch 全文)—— 它会把**活世界退回存档点**,
   *     于是「分叉出两条线」之后活世界还是 A,两条线内容逐字相同、三方比较恒零。
   *     故兄弟档走 `save(name, { parent: A.id })` —— 与 branch 同一条父链口径
   *     (root 由 lineage 沿 parent 回溯得到),但**不动活世界**。
   */
  function mkTri(ov) {
    const env = env0(ov || null);
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    seed(WA);
    const base = WA.checkpoints.save('基点', {});
    // 兄弟1:与基点逐字相同(只在 base→线1 上什么都不做)
    const s1 = WA.checkpoints.save('线1', { parent: base.id });
    // 兄弟2:改好感 + 加一条配对(b 侧相对基点动过)
    WA.store.transact(function (d) {
      d.fondness.rows[0].value = 99;
      d.bonds.rows.push({ key: '甲×丙', a: '甲', b: '丙', tier: 1 });
    }, 'n8:tri2');
    const s2 = WA.checkpoints.save('线2', { parent: base.id });
    // 兄弟3:与兄弟2**同样的改动** ⇒ 供「同向(bothSame)」样本
    const s3 = WA.checkpoints.save('线3', { parent: base.id });
    // 兄弟4:只动**账本面**(causal.settled 多一笔)**⇒ 供「历史拦(historyBlocked)」样本
    //   ⚠ 这一笔必须落在 ledger 档的面上,否则它会被读成普通的 bChanged,
    //     「一边多记了一笔过去」与「两边改得不一样」就分不开。
    WA.store.transact(function (d) { d.causal.settled.push({ id: 'st2', result: '第二批到了' }); }, 'n8:tri4');
    const s4 = WA.checkpoints.save('线4', { parent: base.id });
    return { env: env, WA: WA, base: base, s1: s1, s2: s2, s3: s3, s4: s4 };
  }
  function gotoPage(env, page) {
    const dom = env.dom, el = dom.getElementById('wa-panel');
    if (!el) throw new Error('面板未注入');
    const tab = el.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) throw new Error('找不到 ' + page + ' 页签');
    tab.click();
    return dom;
  }
  function bdOut(dom) {
    const o = dom.getElementById('wa-bd-out');
    return String(o ? (o.innerHTML || o.textContent || '') : '');
  }
  function setv(dom, id, v) { const e = dom.getElementById(id); if (e) e.value = v; return !!e; }
  function fire(dom, id) {
    const b = dom.getElementById(id);
    if (!b || typeof b.onclick !== 'function') return null;
    b.onclick({ target: b });
    return bdOut(dom);
  }
  // ════ A 段:静态契约 ══════════════════════════════════════
  const segR = P.slice(P.indexOf(ANCHOR.pRenderFn), P.indexOf(ANCHOR.segRenderEnd));
  const segB = P.slice(P.indexOf(ANCHOR.segBindStart), P.indexOf(ANCHOR.segEnd));
  a(P.indexOf(ANCHOR.pRenderFn) >= 0 && P.indexOf(ANCHOR.segRenderEnd) > 0
    && P.indexOf(ANCHOR.segBindStart) >= 0 && P.indexOf(ANCHOR.segEnd) > 0,
    'n8/A1: 渲染段与绑定段的段首段尾锚点都在位(切片有效)');
  a(segR.length > 800 && segB.length > 2000,
    'n8/A1b: 两段切片非空(实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符)'
    + '—— 切片失效会让下面的扫描在空集上恒真');
  (function () {
    const leak = [];
    const r = stripLineComments(segR), b2 = stripLineComments(segB);
    OTHER_PREFIX.forEach(function (p) {
      if (cnt(r, p) > 0) leak.push('渲染段 ' + p + cnt(r, p));
      if (cnt(b2, p) > 0) leak.push('绑定段 ' + p + cnt(b2, p));
    });
    a(leak.length === 0, 'n8/A1c: 两段切片未蔓延(无它页前缀:' + (leak.join('、') || '无声') + ')');
  })();
  // 控件「三件齐」:渲染 1 次 + 绑定段有选择器 + 守卫表登记 1 次(引号形,避开 #wa-bd-b ⊂ #wa-bd-base)
  NEW_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1,
      'n8/A2: ' + id + ' 在渲染段恰渲染 1 次(实 ' + cnt(segR, 'id="' + id + '"') + ')');
    a(segB.indexOf("'#" + id + "'") >= 0,
      'n8/A2b: ' + id + ' 在绑定段里有选择器(实引号形命中 ' + cnt(segB, "'#" + id + "'") + ' 次)');
    a(cnt(D, "'" + id + "'") === 1,
      'n8/A2c: ' + id + ' 在守卫表里恰登记 1 次(实 ' + cnt(D, "'" + id + "'") + ')'
      + '—— 渲染了但没登记 ⟹ G18 逐页点击时它不在盘查名单里');
  });
  BTN_IDS.forEach(function (id) {
    a(cnt(segB, "on('#" + id + "', () => {") === 1,
      'n8/A3: ' + id + ' 的 onclick 绑定恰 1 处(实 ' + cnt(segB, "on('#" + id + "', () => {") + ')');
  });
  a(cnt(segR, 'id="wa-bd-out"') === 1,
    'n8/A3b: 读数出口 wa-bd-out 在渲染段在场恰 1 次(否则五枚 handler 写进空气)');
  // 面板侧零事务 / 零直接 localStorage(与引擎同口径)
  (function () {
    const code = stripLineComments(segR) + '\n' + stripLineComments(segB);
    a(code.indexOf('store.transact(') < 0,
      'n8/A4: 两段**零** store.transact 调用(面板不给落地口 —— 「原分支不改」在 UI 这一侧的实现方式)');
    a(code.indexOf('localStorage.setItem(') < 0 && code.indexOf('localStorage.getItem(') < 0,
      'n8/A4b: 两段零 localStorage 直接读写(偏好键的唯一读写面在引擎里)');
    a(code.indexOf('WA.branchDiff.semanticDiff(') >= 0 && code.indexOf('WA.branchDiff.transplant(') >= 0,
      'n8/A4c: 去注释后两个真读口**带括号**在场(防自我指涉:判据不许把自己删掉)');
  })();
  // 引擎侧承重口径
  a(cnt(E, 'readOnly: true') === 3,
    'n8/A5: 三个口**各自**声明 readOnly(实 ' + cnt(E, 'readOnly: true') + ' 处)'
    + '—— 「原分支不改」在引擎这一侧的实现方式');
  a(cnt(E, 'store.transact') === 0,
    'n8/A5b: 模块内**零 store.transact**(实 ' + cnt(E, 'store.transact') + ' 处)—— 写路径根本不存在');
  a(E.indexOf(ANCHOR.classes) === 0 || cnt(E, ANCHOR.classes) === 1,
    'n8/A5c: 四类清单是**单一真源**(恰 1 处声明,不散落)');
  (function () {
    const faces = (E.match(/\{ cls: '/g) || []).length;
    a(faces === 15, 'n8/A6: 面清单 15 条(实 ' + faces + ')');
    CLASSES.forEach(function (c) {
      a(E.indexOf("cls: '" + c + "'") >= 0, 'n8/A6b: 类 ' + c + ' 在面清单里真被用过(不只是写在 CLASSES 里)');
    });
    const reps = (E.match(/replay: '(live|ledger)'/g) || []);
    a(reps.length === 15, 'n8/A6c: 15 个面各自标了 replay 档(实 ' + reps.length + ')');
    const lg = reps.filter(function (r) { return r.indexOf('ledger') >= 0; }).length;
    a(lg === LEDGER_FACES.length,
      'n8/A6d: ledger 档恰 ' + LEDGER_FACES.length + ' 个(实 ' + lg + ')—— ledger / live 两档逐条对得上');
  })();
  // 单一真源:身份字段取自 world-snapshot 的 IDENTITY_REFS(不另立第二份)
  a(E.indexOf('IDENTITY_REFS') >= 0 && E.indexOf('worldSnapshot') >= 0,
    'n8/A7: 行身份真源指向 worldSnapshot.IDENTITY_REFS(不另立第二份名单)');
  a(E.indexOf("source: 'declared'") >= 0 && E.indexOf("source: 'identity-refs'") >= 0,
    'n8/A7b: 真源与兜底**两种来源各自成词**(不把兜底说成真源 —— 真源导出不完整那笔账)');
  // **页守卫**:绑定页必须等于渲染页(D4)
  //   ⚠ 页是**面板**注册的(PAGES):引擎那侧没有 page 字段 —— 判据不能去引擎里找它
  //     (首轮实跑就栽在这里:判成「PAGES 声明了 branchdiff 页」却指着一个不存在的入口)。
  a(cnt(P, ANCHOR.pRenderer) === 1 && cnt(P, ANCHOR.pPage) === 1,
    'n8/A8: 渲染归属**两处都在**(RENDERERS 键 ' + cnt(P, ANCHOR.pRenderer)
    + ' / PAGES 页 ' + cnt(P, ANCHOR.pPage) + ')—— 少任一处这一页就不存在');
  a(cnt(P, ANCHOR.segGuard) === 1,
    'n8/A8b: 绑定块由**页守卫**包起来恰 1 处(实 ' + cnt(P, ANCHOR.segGuard) + ')');
  (function () {
    const gi = P.indexOf(ANCHOR.segGuard);
    const gj = P.indexOf(ANCHOR.segEnd);
    a(gi > 0 && gj > gi && P.slice(gi, gj).indexOf(ANCHOR.pBindDiff) >= 0,
      'n8/A8c: 该守卫**真的罩住**了绑定块(守卫位置 ' + gi + ' < 段尾 ' + gj
      + ',且段首 handler 在守卫之内)');
    // **D4 的根因层不变式**:守卫里的页名 === PAGES 里那一页的 id。
    //   两处不一致就是 D4 的形状:控件渲染在这一页、处理器装在另一页(按钮照在、点了没反应)。
    const mG = ANCHOR.segGuard.match(/currentPage === '([A-Za-z]+)'/);
    const mP = ANCHOR.pPage.match(/\{ id: '([A-Za-z]+)'/);
    a(!!mG && !!mP && mG[1] === mP[1],
      'n8/A8d: **绑定页 === 渲染页**(守卫里 ' + j(mG && mG[1]) + ' vs PAGES 页 id '
      + j(mP && mP[1]) + ')');
  })();
  // 跨文件见证
  (function () {
    const IDX = rd('index.js'), RUN = rd('tests/run.js');
    a(cnt(IDX, "'engines/branch-diff.js'") === 1,
      'n8/A9: index.js LOAD_ORDER 里恰 1 次(实 ' + cnt(IDX, "'engines/branch-diff.js'") + ')');
    const li = RUN.indexOf('const LOAD = ['), lj = RUN.indexOf('\n];', li);
    a(li > 0 && RUN.slice(li, lj).indexOf("'engines/branch-diff.js'") >= 0,
      'n8/A9b: tests/run.js 的 LOAD 表里在场(缺它 ⟹ 专锁静默失去被测对象)');
    a(cnt(D, ANCHOR.diagMod) === 1, 'n8/A9c: tool-diag 的 MODULE_EXPORTS 登记(缺席 ⟹ inventory 里的未登记黑盒)');
  })();
  // 面板三件齐:渲染函数 + RENDERERS + PAGES(ui-gate 的 RENDERERS↔PAGES 同数不变式)
  a(cnt(P, ANCHOR.pRenderFn) === 1, 'n8/A10: 渲染函数定义恰 1 次(实 ' + cnt(P, ANCHOR.pRenderFn) + ')');
  a(cnt(P, ANCHOR.pRenderer) === 1, 'n8/A10b: RENDERERS 有 branchdiff 键(实 ' + cnt(P, ANCHOR.pRenderer) + ')');
  a(cnt(P, ANCHOR.pPage) === 1, 'n8/A10c: PAGES 有 branchdiff 页(实 ' + cnt(P, ANCHOR.pPage) + ')—— id 须纯小写字母,C11 正则才认');
  (function () {
    //  ⚠ 两处坑,都是首轮踩出来的:
    //     (a) 自己造的 `[a-z]+: render...` 数不到**驼峰键**(parallelWorld),得出假红;
    //     (b) 自己切 `PAGES` 字面量时把收尾写成 `\n];` —— 面板里其实是 `  ];`(带缩进),
    //         于是切片失败、pages = -1。
    //    正解:页清单**问产品自己**(WA.ui.pages()),键集合用 ui-gate 同款正则(不自造第二套数法)。
    const envA = env0();
    const pageIds = (envA.WA.ui && typeof envA.WA.ui.pages === 'function') ? envA.WA.ui.pages() : [];
    const reg = P.match(/const RENDERERS = \{([\s\S]*?)\};/);
    const rk = reg ? Array.from(new Set((reg[1].match(/([A-Za-z_$][\w$]*)\s*:/g) || [])
      .map(function (s) { return s.replace(/\s*:$/, ''); }))) : [];
    const missR = pageIds.filter(function (p) { return rk.indexOf(p) < 0; });
    const missP = rk.filter(function (k) { return pageIds.indexOf(k) < 0; });
    a(!!reg && pageIds.length === rk.length && pageIds.length >= 28
      && missR.length === 0 && missP.length === 0,
      'n8/A10d: PAGES 页数 == RENDERERS 键数(实 ' + pageIds.length + ' vs ' + rk.length
      + ',缺 ' + (missR.join('、') || '无') + ' / 多 ' + (missP.join('、') || '无')
      + ')—— ui-gate 的硬不变式;只加渲染器不加页会红');
    a(rk.indexOf('branchdiff') >= 0 && pageIds.indexOf('branchdiff') >= 0,
      'n8/A10e: 本面那一页在**两边**都登记了(RENDERERS ' + rk.indexOf('branchdiff')
      + ' / PAGES ' + pageIds.indexOf('branchdiff') + ')');
  })();
  // 锚点纯度 + 唯一性
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1,
      'n8/A12: 锚点 ' + k + ' 在目标文件里恰中 1 次(实 ' + cnt(rd(TGT[k]), ANCHOR[k])
      + ';目标 ' + TGT[k] + ')');
    //  ⚠ 这条**不许**拿 `'\n  ' + k + ': '` 去整份 SELF 里数 —— ANCHOR 表里每个键**自己**
    //    就带这一行的字面量,数法会与自己的定义撞车(自指涉,首轮实跑就是全红)。
    //    正解:在**表切片内**数行首声明(A12d 同一把尺子)。
    const reDecl = new RegExp('^  ' + k + ': ', 'm');
    const declHit = !!(anchorDecl.match(reDecl));
    a(declHit,
      'n8/A12b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次(表切片内行首 ' + (declHit ? '在位' : '缺') + ')');
  });
  (function () {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'n8/A12c: 锚点值互不相同(' + uniq.length + ' / ' + vals.length + ')');
    const declN = (anchorDecl.match(/^  [A-Za-z_$][\w$]*: /gm) || []).length;
    a(anchorDecl.indexOf('const ANCHOR = {') === 0 && anchorDecl.indexOf('\n};') < 0
      && declN === Object.keys(ANCHOR).length,
      'n8/A12d: ANCHOR 表切片有效(表头在位 / 未越表尾 / 行首声明 ' + declN
      + ' = 键数 ' + Object.keys(ANCHOR).length + ')');
    //  ⚠ 这条**不许**在判据里引用破坏标记的字面量(那会自指涉:判据自己就带着标记,
    //    于是它永远为假 —— 首轮实跑就是这样)。改为:引擎这个**产品文件**里
    //    「破坏」零命中 —— 负控制全程没碰过真源码。
    a(cnt(E, '破坏') === 0 && cnt(E, 'map(String);') === 0,
      'n8/A12e: 引擎里破坏痕迹零命中(实 破坏 ' + cnt(E, '破坏')
      + ' / map(String); ' + cnt(E, 'map(String);') + ')'
      + '—— 负控制全程没改到真源码,这是**第二重**证据');
  })();
  return runRest(a, { gate: gate, LS: LS, env0: env0, seed: seed, seedB: seedB,
    mkF: mk, mkTriF: mkTri,
    gotoPageF: gotoPage, bdOutF: bdOut, setvF: setv, fireF: fire,
    P: P, D: D, E: E, segR: segR, segB: segB,
    ANCHOR: ANCHOR, TGT: TGT, PANEL_REL: PANEL_REL, DIAG_REL: DIAG_REL, ENG_REL: ENG_REL });
}// ════ B 段:运行时与四件套 ═══════════════════════════════════
/**
 * 判据分十二栏,逐栏对着「计划原文的一句话说」:
 *   B1 导出面收口(B2 四类语义差)(B3 D1 顺序无关)(B4 移植三栏 + D2/D3)
 *   B5 picks / classes 过滤(B6 身份来源与缺身份行)(B7 有界截断)(B8 三方比较与 no-basis)
 *   B9 拒收词表与 reset(B10 面板端到端)(B11 写入面零路径)(B12 读数面)
 */
function runRest(a, C) {
  const j = JSON.stringify;
  const gate = C.gate, env0 = C.env0;
  const gotoPage = C.gotoPageF, bdOut = C.bdOutF, setv = C.setvF, fire = C.fireF;
  const mk = C.mkF, mkTri = C.mkTriF;
  const P = C.P, D = C.D, E = C.E, segB = C.segB, ANCHOR = C.ANCHOR;

  // ── B1 导出面**收口**(8 口 + 3 静态;没有第二出口)──────────────
  (function () {
    const m = mk();
    const BD = m.WA.branchDiff;
    EXPORTS.forEach(function (k) {
      a(typeof BD[k] === 'function', 'n8/B1: 导出面有 ' + k + '(其实 ' + typeof BD[k] + ')');
    });
    const keys = Object.keys(BD).sort();
    a(keys.length === EXPORTS.length + 3,
      'n8/B1b: 导出面恰 ' + (EXPORTS.length + 3) + ' 个键(实 ' + keys.length + ':' + j(keys) + ')'
      + '—— 8 口 + 三个静态成员,不另开第二出口');
    // 「原分支不改」在导出面的形态:**没有**任何一个口叫 apply / commit / restore / 落地
    const banned = ['apply', 'commit', 'restore', 'transplantApply', 'write', 'save', 'plan', 'diff'];
    const hit = banned.filter(function (k) { return Object.prototype.hasOwnProperty.call(BD, k); });
    a(hit.length === 0, 'n8/B1c: 导出面没有任何「落地 / 执行 / 第二比对出口」的键(实 ' + j(hit) + ')'
      + '—— 边界靠「那个口不存在」实现,不靠一句声明');
    a(BD.CLASSES.join() === CLASSES.join() && BD.FACES.length === 15 && Object.keys(BD.CLS_LABEL).length === 4,
      'n8/B1d: 静态成员对得上(CLASSES ' + j(BD.CLASSES) + ' / FACES ' + BD.FACES.length
      + ' 条 / CLS_LABEL ' + Object.keys(BD.CLS_LABEL).length + ' 键)');
  })();

  // ── B2 四类语义差:**各自成栏**、方向词由读数说清 ────────────────
  (function () {
    const m = mk(), WA = m.WA;
    const r = WA.branchDiff.semanticDiff(m.A.id, m.B.id, {});
    a(r.ok === true && r.readOnly === true, 'n8/B2: 语义比较跑通且自报只读(实 ' + j([r.ok, r.readOnly]) + ')');
    a(j(r.classesOrder) === j(CLASSES),
      'n8/B2b: classesOrder 逐字等于四类清单' + j(CLASSES) + '(实 ' + j(r.classesOrder) + ')');
    const cols = ['onlyA', 'onlyB', 'changed', 'same', 'noIdentity'];
    CLASSES.forEach(function (c) {
      const x = r.classes[c];
      a(!!x && LABELS[c] === x.label, 'n8/B2c: 类 ' + c + ' 的中文名取自 CLS_LABEL(实 ' + j(x && x.label) + ')');
      const missing = cols.filter(function (k) { return x[k] === undefined; });
      a(missing.length === 0, 'n8/B2d: 类 ' + c + ' **五栏齐备**(缺 ' + j(missing) + ')'
        + '—— 四类各自成栏,不是一个 else 兜底');
      ['onlyA', 'onlyB', 'changed', 'noIdentity'].forEach(function (k) {
        a(x[k] && typeof x[k].total === 'number' && Array.isArray(x[k].items) && typeof x[k].truncated === 'boolean',
          'n8/B2e: ' + c + '.' + k + ' 是三件齐的读数 {items,total,truncated}(实 ' + j(x[k]) + ')');
      });
    });
    // 逐字基线(种子世界决定了分栏归属;换种子也不该把「多一个人」读成「改了一段关系」)
    a(j(r.cum) === j({ entity: { onlyA: 0, onlyB: 1, changed: 0, same: 2 },
      relation: { onlyA: 0, onlyB: 1, changed: 2, same: 1 },
      obligation: { onlyA: 0, onlyB: 0, changed: 1, same: 2 },
      event: { onlyA: 0, onlyB: 1, changed: 0, same: 1 } }),
      'n8/B2f: 四类计数逐字对上(实 ' + j(r.cum) + ')');
    a(r.classes.entity.onlyB.items[0].face === 'people' && r.classes.entity.onlyB.items[0].id === 'p3',
      'n8/B2g: **多出来的那个人**落在 entity.onlyB 上、且带面与 id(实 '
      + j(r.classes.entity.onlyB.items[0]) + ')—— 这正是「升级成语义差」要回答的那件事');
    a(r.classes.event.onlyB.items[0].face === 'causal.settled' && r.classes.event.onlyB.items[0].id === 'st2',
      'n8/B2h: **多记的那一笔过去**落在 event.onlyB 上(实 ' + j(r.classes.event.onlyB.items[0]) + ')');
    const ch = r.classes.relation.changed.items;
    a(ch.length === 2 && ch[0].face === 'fondness.rows' && j(ch[0].fields) === j(['value']),
      'n8/B2i: 关系的「改」**带字段名**(实 ' + j(ch[0]) + ')—— 答的是「改了哪几个字段」,不是「这一块不同」');
    const fr = r.classes.obligation.changed.items[0];
    a(fr.face === 'freight.shipments' && fr.id === 'sh1' && j(fr.fields) === j(['status']),
      'n8/B2j: 义务的「改」也带字段名(实 ' + j(fr) + ')');
    a(r.classes.relation.changed.items.every(function (d) { return d.replay === 'live'; }),
      'n8/B2k: 每笔改动随带**重放档**(live/ledger)回带 —— 调用方不必另查一份面清单');
    a(r.sameRoot === false && r.identical === false,
      'n8/B2l: 两份**不同源**的快照如实报 sameRoot=false(实 ' + j([r.sameRoot, r.identical]) + ')');
    // 拒收两态 + 计数
    const e1 = WA.branchDiff.semanticDiff('', m.A.id, {});
    const e2 = WA.branchDiff.semanticDiff('nope', m.A.id, {});
    a(e1.ok === false && e1.reason === 'missing-fields',
      'n8/B2m: 空 id 拒收成 missing-fields(实 ' + j(e1) + ')');
    a(e2.ok === false && e2.reason === 'missing' && e2.id === 'nope',
      'n8/B2n: 库里没有的 id 拒收成 missing 并把 id 带回(实 ' + j(e2) + ')');
    const st = WA.branchDiff.stat();
    a(st.diffs === 1, 'n8/B2o: 成功的比较计一次(实 ' + st.diffs + ')'
      + '—— 拒收的两次**不计**进 diffs(计数不许把失败算成成绩)');
    a(st.faults['missing-fields'] === 1 && st.faults.missing === 1 && st.lastReason === 'missing',
      'n8/B2p: 拒收各自进 faults 且 lastReason 是最后一次(实 ' + j([st.faults, st.lastReason]) + ')');
  })();

  // ── B3 D1:多字段行的身份**与字段顺序无关** ────────────────────
  (function () {
    const m = mk(), WA = m.WA;
    const r = WA.branchDiff.semanticDiff(m.A.id, m.B.id, {});
    const rel = r.classes.relation;
    a(rel.onlyA.total === 0,
      'n8/B3: ⚠ **顺序敏感的实现在这里会凭空造出一行**:A 的 bonds(a=甲,b=乙)、B 的 bonds(a=乙,b=甲)'
      + '若各自拼 id,同一行会被读成「A 有一行、B 有一行」。实读数 onlyA=' + rel.onlyA.total + '(须 0)');
    a(rel.onlyB.items.length === 1 && rel.onlyB.items[0].face === 'fondness.rows',
      'n8/B3b: B 侧**真**多出来的只有 fondness 那条(实 ' + j(rel.onlyB.items) + ')—— bonds 那条不在此列');
    const bb = rel.changed.items.filter(function (d) { return d.face === 'bonds.rows'; })[0];
    a(!!bb && bb.id === '甲×乙|乙|甲',
      'n8/B3c: bonds 那条被读成**一行**(id 排序后拼接:甲×乙|乙|甲,实 ' + j(bb && bb.id) + ')'
      + '—— 配对键决定配对、同批校验字段排序后参与拼接');
    a(!!bb && j(bb.fields) === j(['a', 'b', 'tier']),
      'n8/B3d: 该行报出**真变了的字段**(实 ' + j(bb && bb.fields) + ')—— a/b 互换 + tier 2→3,一件不少');
    // 破坏面自证:D1 的锚点在盘上真实存在且恰 1 次
    a(cnt(E, ANCHOR.sortExtra) === 1,
      'n8/B3e: D1 修法锚点 `.map(String).sort();` 在盘上恰 1 次(实 ' + cnt(E, ANCHOR.sortExtra) + ')');
  })();

  // ── B4 移植计划:三栏 + 每笔带原因 + D2/D3 ─────────────────────
  (function () {
    const m = mk(), WA = m.WA;
    const r = WA.branchDiff.transplant(m.A.id, m.B.id, {});
    a(r.ok === true && r.readOnly === true, 'n8/B4: 移植给的是**计划**且自报只读(实 ' + j([r.ok, r.readOnly]) + ')');
    ['allowed', 'blocked', 'unchanged'].forEach(function (k) {
      a(typeof r[k] === 'number', 'n8/B4b: 三栏之一 ' + k + ' 是数字(实 ' + j(r[k]) + ')');
    });
    // **D2**:逐字相同的行不许计进 allowed
    a(r.unchanged === 6 && r.allowed === 2 && r.blocked === 1,
      'n8/B4c: 三栏逐字对上(可移植 ' + r.allowed + ' / 被拦 ' + r.blocked + ' / 无变化 ' + r.unchanged + ')'
      + '—— D2:逐字相同的行落在 **unchanged**,不许计入「可移植 N 笔」(吹报的形态是 allowed=7)');
    const rows = r.plan.items;
    a(rows.every(function (p) {
      return typeof p.face === 'string' && typeof p.id === 'string' && typeof p.kind === 'string'
        && typeof p.allowed === 'boolean' && Array.isArray(p.fields) && typeof p.history === 'boolean';
    }), 'n8/B4d: 每笔都带 face/id/kind/allowed/fields/history 六件(实 9 笔抽查 '
      + j(rows[0]) + ')');
    const noCh = rows.filter(function (p) { return p.kind === 'unchanged'; });
    a(noCh.length === 6 && noCh.every(function (p) { return p.allowed === false && p.reason === 'no-change'; }),
      'n8/B4e: **D2 的正面表述**:无变化那 6 笔各自成词 `no-change`、且 allowed=false(实 '
      + j(noCh.map(function (p) { return [p.face, p.id, p.reason]; })) + ')');
    const ledgerUnch = rows.filter(function (p) { return p.face === 'causal.settled' && p.id === 'st1'; });
    a(ledgerUnch.length === 1 && ledgerUnch[0].reason === 'no-change' && ledgerUnch[0].history === false,
      'n8/B4f: **D3**:账本面那笔逐字相同的行不许被说成「被规则挡住」——它如实报 no-change、'
      + 'history=false(实 ' + j(ledgerUnch[0]) + ')—— 历史判定只作用于**真要动**的行');
    const sh = rows.filter(function (p) { return p.face === 'freight.shipments' && p.id === 'sh1'; })[0];
    a(!!sh && sh.allowed === false && sh.reason === 'history/settled' && sh.history === true,
      'n8/B4g: 已结算的义务被拦、且原因**同时交代**两件事(实 ' + j(sh) + ')'
      + '—— 「它是账本类」与「这一行身上带结算标记」不是同一句');
    const fond = rows.filter(function (p) { return p.face === 'fondness.rows' && p.id === '甲'; })[0];
    a(!!fond && fond.allowed === true && fond.kind === 'update' && j(fond.fields) === j(['value'])
      && typeof fond.dstSig === 'string' && typeof fond.srcSig === 'string',
      'n8/B4h: 明确支持的改动放行、带字段与两端指纹(实 ' + j(fond) + ')');
    a(r.plan.total === 9 && r.plan.truncated === false,
      'n8/B4i: 计划带回总数(实 ' + r.plan.total + ' 笔,截断 ' + r.plan.truncated + ')');
    a(/readOnly|不落地|没有一条写路径/.test(r.note) && r.note.indexOf('写路径') >= 0,
      'n8/B4j: 说明句如实交代**没有写路径**(实 ' + j(r.note.slice(0, 40)) + '…)');
    // includeHistory:放行但逐行标 history
    const rh = WA.branchDiff.transplant(m.A.id, m.B.id, { includeHistory: true });
    a(rh.allowed === 3 && rh.blocked === 0 && rh.unchanged === 6 && rh.includeHistory === true,
      'n8/B4k: 打开 includeHistory ⇒ 已结算那笔放行(实 可移植 ' + rh.allowed + ' / 被拦 ' + rh.blocked
      + ' / 无变化 ' + rh.unchanged + ')');
    const shH = rh.plan.items.filter(function (p) { return p.face === 'freight.shipments'; })[0];
    a(shH.allowed === true && shH.history === true && j(shH.fields) === j(['status']),
      'n8/B4l: 放行**不隐藏代价**:该笔逐行标 history=true(实 ' + j(shH) + ')'
      + '—— 「由调用方自负」落在读数上,不是一句口号');
    const noChH = rh.plan.items.filter(function (p) { return p.kind === 'unchanged'; });
    a(noChH.length === 6 && noChH.every(function (p) { return p.allowed === false; }),
      'n8/B4m: 打开历史放行**不改变**「无变化」那一栏(实仍 ' + noChH.length + ' 笔)'
      + '—— 两件事互不污染(D3 的另一面)');
  })();

  // ── B5 picks / classes 两个过滤口 ─────────────────────────────
  (function () {
    const m = mk(), WA = m.WA;
    const rp = WA.branchDiff.transplant(m.A.id, m.B.id, { picks: [{ face: 'fondness.rows', id: '甲' }] });
    a(rp.allowed === 1 && rp.blocked === 0 && rp.unchanged === 0 && rp.plan.total === 1
      && rp.plan.items[0].face === 'fondness.rows' && rp.plan.items[0].id === '甲',
      'n8/B5: picks 只挑出被点名的那一笔(实 ' + j(rp.plan.items.map(function (p) { return [p.face, p.id]; })) + ')');
    const rc = WA.branchDiff.transplant(m.A.id, m.B.id, { classes: ['relation'] });
    a(j(rc.classes) === j(['relation']) && rc.allowed === 2 && rc.blocked === 0 && rc.unchanged === 1,
      'n8/B5b: classes 过滤只留点名的那一类(实 classes=' + j(rc.classes) + ' / 可移植 ' + rc.allowed
      + ' / 无变化 ' + rc.unchanged + ')');
    a(rc.plan.items.every(function (p) { return p.cls === 'relation'; }),
      'n8/B5c: 过滤后**每一笔**都在点名类里(实 ' + j(rc.plan.items.map(function (p) { return p.cls; })) + ')');
    const rb = WA.branchDiff.transplant(m.A.id, m.B.id, { classes: [] });
    a(rb.allowed === 2 && rb.unchanged === 6 && rb.blocked === 1,
      'n8/B5d: 空 classes 与不传**等价**(四类全跑;实 可移植 ' + rb.allowed + ')—— 空 ≠ 一个都不选');
    const rq = WA.branchDiff.transplant(m.A.id, m.B.id, { picks: [] });
    a(rq.allowed === 2 && rq.unchanged === 6,
      'n8/B5e: 空 picks 与不传**等价**(实 可移植 ' + rq.allowed + ')');
  })();

  // ── B6 身份来源 + 缺身份行 ───────────────────────────────────
  (function () {
    const m = mk(), WA = m.WA;
    WA.store.transact(function (d) { d.fondness.rows.push({ value: 7 }); }, 'n8:noid');
    const Cn = WA.checkpoints.save('无身份', {});
    const r = WA.branchDiff.semanticDiff(m.A.id, Cn.id, {});
    const ni = r.classes.relation.noIdentity;
    a(ni.total === 1 && ni.items[0].face === 'fondness.rows' && ni.items[0].side === 'b',
      'n8/B6: 缺身份键的行落 noIdentity 并**如实标出在哪一侧**(实 ' + j(ni.items) + ')'
      + '—— 绝不按位置配对(那会把「表头插一行」读成「几乎每行都改了」)');
    a(ni.items[0].id === undefined,
      'n8/B6b: 缺身份的行**不编一个 id 出来**(实 ' + j(ni.items[0].id) + ')');
    const cat = WA.branchDiff.catalog();
    a(cat.idSource === 'identity-refs',
      'n8/B6c: 身份来源如实标成 identity-refs(实 ' + j(cat.idSource) + ')—— 真源在场时不许说成 declared');
    const ws = WA.worldSnapshot;
    a(!!ws && ws.IDENTITY_REFS.some(function (r2) { return r2.face === 'people' && r2.field === 'id'; }),
      'n8/B6d: 单一真源 world-snapshot.IDENTITY_REFS 里 people.id 那条在(实 '
      + j((ws.IDENTITY_REFS || []).slice(0, 1)) + ')');
    a(!!ws && ws.IDENTITY_REFS.every(function (r2) { return r2.fields === undefined; }),
      'n8/B6e: **如实留账**:导出面**丢了 fields 数组**(实条目键 '
      + j(Object.keys((ws.IDENTITY_REFS || [{}])[0])) + ')—— 多字段行退到声明表兜底,不当成「真源拿到了」');
  })();

  // ── B7 有界化:如实截断并带回总数 ─────────────────────────────
  (function () {
    const env = env0(), WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    WA.store.init();
    WA.checkpoints.setSettings({ enabled: true, maxSlots: 12 });
    WA.branchDiff.setSettings({ enabled: true, maxRows: 10 });
    WA.store.transact(function (d) { d.people = { p1: { id: 'p1', name: '甲' } }; }, 'n8:tr0');
    const T1 = WA.checkpoints.save('甲线', {});
    WA.store.transact(function (d) {
      for (let i = 0; i < 14; i++) d.people['q' + i] = { id: 'q' + i, name: '新' + i };
    }, 'n8:tr1');
    const T2 = WA.checkpoints.save('乙线', {});
    const r = WA.branchDiff.semanticDiff(T1.id, T2.id, {});
    const ob = r.classes.entity.onlyB;
    a(ob.items.length === 10 && ob.total === 14 && ob.truncated === true,
      'n8/B7: 超过上限时如实截断并带回总数(实 items ' + ob.items.length + ' / total ' + ob.total
      + ' / truncated ' + ob.truncated + ')—— 不静默丢');
    a(r.cum.entity.onlyB === 14 && r.classes.entity.same === 1,
      'n8/B7b: 摘要栏用**总数**、不是「截断后的条数」(实 ' + j(r.cum.entity) + ')'
      + '—— 两处读数不一致会让用户以为只多了一个人');
    WA.branchDiff.setSettings({ maxRows: 5 });
    a(WA.branchDiff.getSettings().maxRows === 10,
      'n8/B7c: 上限**夹到下限** 10(实设 5 ⇒ ' + WA.branchDiff.getSettings().maxRows + ')');
    WA.branchDiff.setSettings({ maxRows: 99999 });
    a(WA.branchDiff.getSettings().maxRows === 1000,
      'n8/B7d: 上限**夹到上限** 1000(实设 99999 ⇒ ' + WA.branchDiff.getSettings().maxRows + ')');
    WA.branchDiff.setSettings({ maxRows: 200 });
  })();

  // ── B8 三方比较:共同基点 + 分道 + 同向 + 历史拦 ───────────────
  (function () {
    const m = mkTri(), WA = m.WA;
    a(m.base.root === '基点' && m.s1.root === '基点' && m.s2.root === '基点' && m.s4.root === '基点',
      'n8/B8: 兄弟档的 root 沿父链回到基点(实 ' + j([m.base.root, m.s1.root, m.s2.root, m.s4.root]) + ')'
      + '—— 这就是「共同基点」取槽位 root 的凭据');
    const r = WA.branchDiff.triDiff(m.base.id, m.s1.id, m.s2.id, {});
    a(r.ok === true && r.readOnly === true, 'n8/B8b: 三方比较跑通且只读(实 ' + j([r.ok, r.readOnly]) + ')');
    a(r.base.name === '基点' && r.base.root === '基点',
      'n8/B8c: 返回里带**基点身份**(实 ' + j(r.base) + ')—— 不比一个「世界现在的样子」');
    a(j(r.cum.relation) === j({ a: 0, b: 2, both: 0, diverge: 0, history: 0 }),
      'n8/B8d: 只有 B 侧动过 ⇒ 全落 bChanged(实 ' + j(r.cum.relation) + ')');
    const bc = r.classes.relation.bChanged.items;
    a(bc.length === 2 && bc[0].face === 'fondness.rows' && j(bc[0].fields) === j(['value']),
      'n8/B8e: bChanged 逐笔带字段(实 ' + j(bc) + ')');
    const r2 = WA.branchDiff.triDiff(m.base.id, m.s2.id, m.s3.id, {});
    a(j(r2.cum.relation) === j({ a: 0, b: 0, both: 2, diverge: 0, history: 0 }),
      'n8/B8f: 两条线**同向改同一处** ⇒ 落 bothSame 而不是 diverge(实 ' + j(r2.cum.relation) + ')'
      + '—— 「两边都改了」与「两边改得不一样」是两件事,不能并成一栏');
    const r3 = WA.branchDiff.triDiff(m.base.id, m.s1.id, m.s4.id, {});
    a(r3.cum.event.history === 1 && r3.classes.event.bChanged.total === 0,
      'n8/B8g: 一侧**新记了一笔过去**(账本面新行)⇒ 落 historyBlocked、**不混进 bChanged**(实 '
      + j(r3.cum.event) + ')');
    a(r3.classes.event.historyBlocked.items[0].face === 'causal.settled'
      && r3.classes.event.historyBlocked.items[0].id === 'st2',
      'n8/B8h: 被单列的是那笔新账(实 ' + j(r3.classes.event.historyBlocked.items) + ')');
    // no-basis:三方 root 不全相同 ⇒ 拒收并带回三个 root
    const n1 = mk();
    const r4 = n1.WA.branchDiff.triDiff(n1.A.id, n1.B.id, n1.A.id, {});
    a(r4.ok === false && r4.reason === 'no-basis' && r4.base === '作者A' && r4.a === '作者B' && r4.b === '作者A',
      'n8/B8i: 三方 root 不全相同 ⇒ no-basis 并**带回三个 root**(实 ' + j(r4) + ')'
      + '—— 拒绝必须可操作:用户第一件事就是确认自己挑的三个档是不是同源');
    a(/没有意义|不同源/.test(r4.note || ''),
      'n8/B8j: 说明句讲清**为什么不做**(实 ' + j((r4.note || '').slice(0, 30)) + '…)');
    const r5 = n1.WA.branchDiff.triDiff('zzz', n1.A.id, n1.A.id, {});
    a(r5.ok === false && r5.reason === 'no-basis',
      'n8/B8k: **基点槽位读不到**也归 no-basis(实 ' + j(r5) + ')—— 读不到基点就是「不可比」,不是「缺字段」');
    const r6 = n1.WA.branchDiff.triDiff('', n1.A.id, n1.A.id, {});
    a(r6.ok === false && r6.reason === 'missing-fields',
      'n8/B8l: 空基点 id 是 missing-fields(实 ' + j(r6) + ')—— 六态词表各自成词,不混用');
    const st = n1.WA.branchDiff.stat();
    //  ⚠ 这条链最后一脚是**空 id**(missing-fields),故 lastReason 不是 no-basis ——
    //    首轮我把两者写进同一条判据,于是被自己的收尾顺序绊倒。只留 faults 计数。
    a(st.faults['no-basis'] === 1,
      'n8/B8m: no-basis 如实进 faults 且**只计一次**(实 ' + j(st.faults) + ')');
    a(st.tris === 0, 'n8/B8n: 被拒的三方比较**不计** tris(实 ' + st.tris + ')');
  })();

  // ── B9 拒收词表 + reset ──────────────────────────────────────
  (function () {
    const m = mk(), WA = m.WA;
    // 关掉开关:三个口一并拒收(与面板那句「disabled(三个口一并拒收)」同口径)
    WA.branchDiff.setSettings({ enabled: false });
    REASONS.slice(0, 1).forEach(function () {});
    const d1 = WA.branchDiff.semanticDiff(m.A.id, m.B.id, {});
    const d2 = WA.branchDiff.triDiff(m.A.id, m.A.id, m.B.id, {});
    const d3 = WA.branchDiff.transplant(m.A.id, m.B.id, {});
    a(d1.reason === 'disabled' && d2.reason === 'disabled' && d3.reason === 'disabled',
      'n8/B9: 开关关着时**三个口一并拒收** disabled(实 ' + j([d1.reason, d2.reason, d3.reason]) + ')');
    WA.branchDiff.setSettings({ enabled: true });
    a(WA.branchDiff.semanticDiff(m.A.id, m.B.id, {}).ok === true,
      'n8/B9b: 重新打开后照常跑通');
    // 拒收词表:面板的 bdWhy 六条与引擎侧六态**逐一对得上**
    //  ⚠ 不许按「引号形」数:`disabled` 在表里是**裸键**(`disabled:`),其余五个带引号。
    //    首轮我按引号形数,于是只验中一个、另外五个假红。这里改成**解析出键集合**再比。
    const whySeg = segB.slice(segB.indexOf('const bdWhy'), segB.indexOf('return M[reason]'));
    const rawKeys = (whySeg.match(/(?:'([A-Za-z][A-Za-z-]*)'|([A-Za-z][A-Za-z-]*))\s*:/g) || [])
      .map(function (s) { return s.replace(/['\s:]/g, ''); });
    const uniq = rawKeys.filter(function (v, i) { return rawKeys.indexOf(v) === i; }).sort();
    a(j(uniq) === j(REASONS.slice().sort()),
      'n8/B9c: 面板解释表与引擎侧六态**同一张词表**(实 ' + j(uniq) + ' vs ' + j(REASONS) + ')'
      + '—— 六态各自有话说,不落一句「未知错误」');
    REASONS.forEach(function (rs) {
      const n = cnt(whySeg, rs);
      a(n >= 1 && (uniq.indexOf(rs) >= 0),
        'n8/B9d: 面板解释表里 ' + rs + ' 是**一条独立解释**(实在场 ' + n + ' 次)');
    });
    // reset
    const st0 = WA.branchDiff.stat();
    a(st0.diffs >= 1, 'n8/B9e: reset 前计过数(实 ' + st0.diffs + ')');
    a(WA.branchDiff.reset().ok === true, 'n8/B9f: reset 返回 ok');
    const st1 = WA.branchDiff.stat();
    a(st1.diffs === 0 && st1.tris === 0 && st1.transplants === 0
      && Object.keys(st1.faults).length === 0 && st1.lastReason === '',
      'n8/B9g: reset 把计数与 faults **一并**清零(实 ' + j([st1.diffs, st1.tris, st1.transplants, st1.faults, st1.lastReason]) + ')');
    a(st1.enabled === true && st1.faces === 15 && st1.classes === 4,
      'n8/B9h: reset **只清计数**,不动设置与面清单(实 ' + j(st1) + ')');
  })();

  // ── B10 面板端到端(控件齐 / 按钮活 / 文案对 / 开关真写)─────────
  (function () {
    const m = mk(), env = m.env, WA = m.WA, dom = env.dom;
    gotoPage(env, 'branchdiff');
    NEW_IDS.forEach(function (id) {
      a(!!dom.getElementById(id), 'n8/B10: 控件 ' + id + ' 真渲染在 branchdiff 页');
    });
    // 六件套:两个复选框是 onchange、五枚按钮是 onclick —— **handler 全是函数**(D4 的核心)
    a(typeof dom.getElementById('wa-bd-enabled').onchange === 'function'
      && typeof dom.getElementById('wa-bd-history').onchange === 'function',
      'n8/B10b: 两个复选框挂的是 onchange 且 handler 在场');
    BTN_IDS.forEach(function (id) {
      const b = dom.getElementById(id);
      a(!!b && typeof b.onclick === 'function',
        'n8/B10c: ' + id + ' 的 onclick 是函数(实 ' + (b ? typeof b.onclick : 'NO-EL') + ')'
        + '—— **绑定页必须等于渲染页**(D4:挂在 tools 页时这里全是 undefined)');
    });
    // 真读数:语义比较的文案逐字可读
    const chk = dom.getElementById('wa-bd-enabled');
    chk.checked = true; chk.onchange({ target: chk });
    a(WA.branchDiff.getSettings().enabled === true,
      'n8/B10d: 勾上开关**真写了设置**(实 ' + j(WA.branchDiff.getSettings()) + ')—— 面板是消费方不是摆设');
    setv(dom, 'wa-bd-a', m.A.id); setv(dom, 'wa-bd-b', m.B.id);
    const o1 = fire(dom, 'wa-bd-diff');
    a(o1.indexOf('作者A') >= 0 && o1.indexOf('作者B') >= 0 && o1.indexOf('不同根') >= 0,
      'n8/B10e: 语义比较文案含两端名与同根判定(实 ' + j(o1.slice(0, 90)) + '…)');
    a(o1.indexOf('多出:people#p3') >= 0 && o1.indexOf('多出:causal.settled#st2') >= 0,
      'n8/B10f: 文案把「多出谁」「多记哪笔」**逐条印出来**(实含 '
      + j([o1.indexOf('people#p3') >= 0, o1.indexOf('causal.settled#st2') >= 0]) + ')');
    // 三方:不同源时在 UI 上如实报 no-basis 并把三个 root 印出来
    setv(dom, 'wa-bd-base', m.A.id); setv(dom, 'wa-bd-a', m.B.id); setv(dom, 'wa-bd-b', m.A.id);
    const o2 = fire(dom, 'wa-bd-tri');
    a(o2.indexOf('三方 root 不全相同') >= 0 && o2.indexOf('基点 root 作者A') >= 0,
      'n8/B10g: UI 上 no-basis 如实报且**带回三个 root**(实 ' + j(o2.slice(0, 110)) + '…)');
    // 移植计划文案:三栏 + 逐笔原因
    setv(dom, 'wa-bd-src', m.A.id); setv(dom, 'wa-bd-dst', m.B.id);
    const o3 = fire(dom, 'wa-bd-plan');
    a(o3.indexOf('从 作者A → 作者B:可移植 2 / 被拦 1 / 无变化 6') >= 0,
      'n8/B10h: 计划文案三栏逐字可读(实 ' + j(o3.slice(0, 60)) + '…)');
    a(o3.indexOf('拦因 history/settled') >= 0 && o3.indexOf('只给计划、不落地') >= 0,
      'n8/B10i: 每笔带拦因,且如实印「只给计划、不落地」(实含 '
      + j([o3.indexOf('拦因 history/settled') >= 0, o3.indexOf('只给计划、不落地') >= 0]) + ')');
    // 历史放行:开关真写 + 文案随动
    const hchk = dom.getElementById('wa-bd-history');
    hchk.checked = true; hchk.onchange({ target: hchk });
    a(WA.branchDiff.getSettings().includeHistory === true,
      'n8/B10j: 历史放行开关**真写了设置**(实 ' + j(WA.branchDiff.getSettings().includeHistory) + ')');
    const o4 = fire(dom, 'wa-bd-plan');
    a(o4.indexOf('可移植 3 / 被拦 0') >= 0 && o4.indexOf('(历史已放行)') >= 0,
      'n8/B10k: 放行后计划随动且文案标出代价(实 ' + j(o4.slice(0, 60)) + '…)');
    // 面清单 / 诊断两枚按钮
    const o5 = fire(dom, 'wa-bd-cat');
    a(o5.indexOf('四类各自的面(15个)') >= 0 && o5.indexOf('重放档 ledger') >= 0
      && o5.indexOf('身份字段 key+a+b') >= 0,
      'n8/B10l: 面清单文案含 15 面 / 两档 / 多字段身份(实含 '
      + j([o5.indexOf('(15个)') >= 0, o5.indexOf('ledger') >= 0, o5.indexOf('key+a+b') >= 0]) + ')');
    const o6 = fire(dom, 'wa-bd-stat');
    a(o6.indexOf('面 15 个 / 类 4 类') >= 0 && o6.indexOf('开关 开') >= 0,
      'n8/B10m: 诊断文案含面/类/开关(实 ' + j(o6.slice(0, 70)) + '…)');
    // 空输入走拒收**解释句**,不是空白
    setv(dom, 'wa-bd-a', ''); setv(dom, 'wa-bd-b', '');
    const o7 = fire(dom, 'wa-bd-diff');
    a(o7.indexOf('缺必填字段') >= 0,
      'n8/B10n: 空输入给出**人话解释**(实 ' + j(o7.slice(0, 80)) + '…)—— 不落一片空白');
    // **页归属**:控件只在 branchdiff 页
    gotoPage(env, 'tools');
    a(!dom.getElementById('wa-bd-diff'),
      'n8/B10o: 切到 tools 页后 N8 控件**不在场**(实 ' + j(!!dom.getElementById('wa-bd-diff')) + ')'
      + '—— 控件的家是 branchdiff 页,绑定也必须在那一页');
  })();

  // ── B11 写入面**零路径**(三重证据)───────────────────────────
  (function () {
    const m = mk(), WA = m.WA;
    const r1 = WA.branchDiff.semanticDiff(m.A.id, m.B.id, {});
    const r2 = WA.branchDiff.triDiff(m.A.id, m.A.id, m.A.id, {});
    const r3 = WA.branchDiff.transplant(m.A.id, m.B.id, {});
    a(r1.readOnly === true && r2.readOnly === true && r3.readOnly === true,
      'n8/B11: 第一重 —— 三个口**各自**声明 readOnly(实 ' + j([r1.readOnly, r2.readOnly, r3.readOnly]) + ')');
    a(cnt(E, 'store.transact') === 0 && cnt(E, 'store.set') === 0,
      'n8/B11b: 第二重 —— 引擎代码面**零写调用**(实 store.transact ' + cnt(E, 'store.transact')
      + ' / store.set ' + cnt(E, 'store.set') + ')—— 「原分支不改」的实现方式是「这里没有写口」');
    const codeB = stripLineComments(segB);
    a(codeB.indexOf('store.transact') < 0 && codeB.indexOf('.commit(') < 0
      && codeB.indexOf('.apply(') < 0 && codeB.indexOf('restore(') < 0,
      'n8/B11c: 第三重 —— 面板绑定段**零落地调用**(实 '
      + j([cnt(codeB, 'store.transact'), cnt(codeB, '.commit('), cnt(codeB, '.apply('), cnt(codeB, 'restore(')]) + ')');
    // 面向任务的证据:移植计划跑完之后,被移植两端**逐字未变**
    //  ⚠ `checkpoints.save()` 的返回**不含 state**(只有 id/name/scope/keys/...),
    //    首轮我拿 `m.A.state` 当基线,得到 `undefined`,两边必然不等。真身在
    //    `checkpoints.read(id).slot.state` 里(实测两份 8615 字符逐字一致)。
    const b1 = j(WA.checkpoints.read(m.A.id).slot.state);
    const d1 = j(WA.checkpoints.read(m.B.id).slot.state);
    WA.branchDiff.transplant(m.A.id, m.B.id, { includeHistory: true });
    WA.branchDiff.semanticDiff(m.A.id, m.B.id, {});
    WA.branchDiff.triDiff(m.A.id, m.A.id, m.B.id, {});
    const A2 = WA.checkpoints.read(m.A.id), B2 = WA.checkpoints.read(m.B.id);
    a(j(A2.slot.state) === b1 && j(B2.slot.state) === d1,
      'n8/B11d: 跑完三口之后**两端槽位逐字未变**(实源 ' + (j(A2.slot.state) === b1)
      + ' / 目标 ' + (j(B2.slot.state) === d1) + ')—— 这是「原分支不改」的**实测**形态,不是自报');
  })();

  // ── B12 读数面(catalog / stat / 设置)────────────────────────
  (function () {
    const m = mk(), WA = m.WA;
    const c = WA.branchDiff.catalog();
    a(j(c.classes) === j(CLASSES) && j(c.labels) === j({ entity: '实体', relation: '关系', obligation: '义务', event: '事件' }),
      'n8/B12: catalog 的四类与中文名对得上(实 ' + j(c.classes) + ')');
    a(c.faces.length === 15, 'n8/B12b: catalog 列全 15 个面(实 ' + c.faces.length + ')');
    a(c.faces.every(function (f) { return typeof f.cls === 'string' && typeof f.path === 'string'
      && typeof f.replay === 'string' && Array.isArray(f.idFields) && f.idFields.length >= 1; }),
      'n8/B12c: 每一面都带 cls/path/replay/idFields(实抽查 ' + j(c.faces[6]) + ')');
    a(c.faces.filter(function (f) { return f.replay === 'ledger'; }).length === LEDGER_FACES.length,
      'n8/B12d: ledger 档面数与真源一致(实 '
      + c.faces.filter(function (f) { return f.replay === 'ledger'; }).length + ' vs ' + LEDGER_FACES.length + ')');
    const lg = c.faces.filter(function (f) { return f.replay === 'ledger'; }).map(function (f) { return f.path; });
    a(LEDGER_FACES.every(function (p) { return lg.indexOf(p) >= 0; }),
      'n8/B12e: ledger 档**逐条**对得上(实 ' + j(lg) + ')');
    a(c.faces.filter(function (f) { return f.replay === 'live'; }).length === LIVE_FACES.length,
      'n8/B12f: live 档面数与面清单一致(实 '
      + c.faces.filter(function (f) { return f.replay === 'live'; }).length + ')');
    a(j(c.settled.keys) === j(['settled', 'paidAt', 'deliveredAt', 'revealedAt']),
      'n8/B12g: 结算标记键逐字对(实 ' + j(c.settled.keys) + ')');
    a(j(c.settled.status) === j(['settled', 'delivered', 'paid', 'revealed', 'done', 'closed']),
      'n8/B12h: 结算状态词逐字对(实 ' + j(c.settled.status) + ')');
    a(c.caps.maxRows === 200, 'n8/B12i: catalog 回带当前上限(实 ' + c.caps.maxRows + ')');
    const st = WA.branchDiff.stat();
    a(st.faces === 15 && st.classes === 4, 'n8/B12j: stat 回带面/类数(实 ' + j([st.faces, st.classes]) + ')');
    a(typeof st.lastReason === 'string' && 'faults' in st && typeof st.faults === 'object',
      'n8/B12k: stat 回带 faults 与 lastReason(实 ' + j([st.faults, st.lastReason]) + ')');
    a(j(WA.branchDiff.getSettings()) === j({ enabled: true, includeHistory: false, maxRows: 200 }),
      'n8/B12l: 设置面三件(实 ' + j(WA.branchDiff.getSettings()) + ')');
  })();
  return runC(a, C);
}// ════ C 段:零泄漏不变式 ══════════════════════════════════════
/**
 * 「原分支不改」这句话在本模块上有**三条可测的形态**,逐条判一次,且都是**实测差**:
 *   C1 live 零泄漏 —— 三口全跑一遍,活世界存档**逐字**一致(直接比 JSON,不信自报)
 *   C2 localStorage 零泄漏 —— **按净效应**判(写次数不是判据:设置面本来就会写盘)
 *   C3 引擎侧代码面 —— 零写口 / 零直接 localStorage / 零自造第二份身份名单
 *   另加 C4 一条**反面**判据:不能把「没读到 store」说成「读到了一个空的 store」
 *     (两个说法在读数上必须分得开 —— 本仓对「缺席 ≠ 空」的裁决同源)。
 */
function runC(a, C) {
  const j = JSON.stringify;
  function mkEnv() {
    const env = C.env0();
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    C.seed(WA);
    return { env: env, WA: WA };
  }
  // 1 live 零泄漏:三口全跑,存档摘要逐字一致
  {
    const t = mkEnv(), WA = t.WA;
    const A = WA.checkpoints.save('作者A', {});
    C.seedB(WA);
    const B = WA.checkpoints.save('作者B', {});
    const b1 = j(WA.store.get());
    const r1 = WA.branchDiff.semanticDiff(A.id, B.id, {});
    const r2 = WA.branchDiff.triDiff(A.id, B.id, A.id, {});
    const r3 = WA.branchDiff.transplant(A.id, B.id, { includeHistory: true });
    const r4 = WA.branchDiff.catalog();
    const r5 = WA.branchDiff.stat();
    const b2 = j(WA.store.get());
    a(b1 === b2, 'n8/C1: 三口 + catalog + stat 全跑一遍,活世界存档**逐字一致**(实 '
      + b1.length + ' → ' + b2.length + ' 字符)—— 零写 live');
    a(r1.ok === true && r3.ok === true && r4.ok === true && r5.faces === 15,
      'n8/C1b: 上面那一遍**真跑通了**(不是靠整段抛错跳过去的;实 '
      + j([r1.ok, r3.ok, r4.ok, r5.faces]) + ')—— 空跑的「零泄漏」没有意义');
    a(r2.ok === false && r2.reason === 'no-basis',
      'n8/C1c: 那一遍里的三方比较**如实被拒**(实 ' + j([r2.ok, r2.reason]) + ')—— 拒收也走了完整路径');
  }
  // 2 live 零泄漏的**独立第二重**:被比对的两端槽位逐字未变
  {
    const t = mkEnv(), WA = t.WA;
    const A = WA.checkpoints.save('作者A', {});
    C.seedB(WA);
    const B = WA.checkpoints.save('作者B', {});
    //  ⚠ `save()` 的返回**不含** state;槽位世界在 `checkpoints.read(id).slot.state`。
    //    首轮 C2 报「实 11 字符」正是 `j(undefined)` === 'undefined' 的 9 字符 + 括号。
    const s0 = j([WA.checkpoints.read(A.id).slot.state, WA.checkpoints.read(B.id).slot.state]);
    WA.branchDiff.transplant(A.id, B.id, { includeHistory: true });
    WA.branchDiff.semanticDiff(A.id, B.id, {});
    const A2 = WA.checkpoints.read(A.id), B2 = WA.checkpoints.read(B.id);
    a(j([A2.slot.state, B2.slot.state]) === s0,
      'n8/C2: 移植 + 比较跑完,**两个槽位的世界逐字未变**(实 ' + s0.length + ' 字符)'
      + '—— 「原分支不改」在这里是实测,不是 readOnly 那句自报');
  }
  // 3 localStorage 零泄漏:按净效应判
  {
    const t = mkEnv(), WA = t.WA, LS = C.LS || global.localStorage;
    function snap() {
      const out = {};
      try { for (let i = 0; i < LS.length; i++) { const k = LS.key(i); out[k] = LS.getItem(k); } } catch (e) {}
      return out;
    }
    const A = WA.checkpoints.save('作者A', {});
    C.seedB(WA);
    const B = WA.checkpoints.save('作者B', {});
    const s0 = snap();
    WA.branchDiff.semanticDiff(A.id, B.id, {});
    WA.branchDiff.triDiff(A.id, B.id, A.id, {});
    WA.branchDiff.transplant(A.id, B.id, { includeHistory: true });
    WA.branchDiff.catalog(); WA.branchDiff.stat();
    const s1 = snap();
    const changed = [];
    Object.keys(Object.assign({}, s0, s1)).forEach(function (k) {
      if (s0[k] !== s1[k]) changed.push(k);
    });
    a(changed.length === 0,
      'n8/C3: 三个口全跑一遍,localStorage **逐键逐值一致**(实变了 ' + changed.length + ' 键:'
      + (changed.join('、') || '无') + ')—— 按净效应判,不按写次数判'
      + '(设置面本来就会写盘,「零泄漏」说的是**世界数据**)');
    // 反面:模块**自己**的偏好键在只读口上**不许**被写
    let raw0 = null, raw1 = null;
    try { raw0 = LS.getItem('worldaxis_branch_diff_v1'); } catch (e) { raw0 = 'threw'; }
    WA.branchDiff.getSettings();
    try { raw1 = LS.getItem('worldaxis_branch_diff_v1'); } catch (e) { raw1 = 'threw'; }
    a(raw0 === raw1, 'n8/C3b: 只**读**设置( getSettings )不写盘(实 ' + j(raw0) + ' → ' + j(raw1) + ')');
  }
  // 4 反面判据:缺席 ≠ 空 —— 「读不到 store」不许被说成「读到空的 store」
  {
    const t = mkEnv(), WA = t.WA;
    //  ⚠ 本模块**不读活世界**(store),它只读槽位。故这里验的是:
    //    模块在**没有活世界**的情况下照样能给读数(不依赖 store)。
    const keep = WA.store;
    let r = null, threw = null;
    try {
      WA.store = null;
      r = WA.branchDiff.catalog();
    } catch (e) { threw = String((e && e.message) || e); }
    finally { WA.store = keep; }
    a(threw === null, 'n8/C4: 活世界**不可用时也不抛**(实 ' + j(threw) + ')—— 本模块不读 store');
    a(r && r.ok === true && r.faces.length === 15,
      'n8/C4b: 于是读数仍**完整**(实 ' + j(r && r.faces && r.faces.length) + ')'
      + '—— 「不读活世界」不是「读到空世界」:两个说法在读数上必须分得开');
    a(cnt(C.E, 'WA.store') === 0,
      'n8/C4c: **代码面**实证:引擎里 `WA.store` 零命中(实 ' + cnt(C.E, 'WA.store') + ')'
      + '—— 上面那条不是碰巧,是模块根本没这条读路径');
  }
  // 5 引擎侧代码面:零写口 / 零直接 localStorage / 零第二份身份名单
  {
    const E = C.E, code = stripLineComments(E);
    a(cnt(code, 'store.transact') === 0 && cnt(code, 'localStorage.setItem') === 0
      && cnt(code, 'localStorage.getItem') === 0,
      'n8/C5: 代码面零写口(实 ' + j([cnt(code, 'store.transact'), cnt(code, 'localStorage.setItem'),
        cnt(code, 'localStorage.getItem')]) + ')—— 唯一读写面是 settingsBus');
    a(cnt(code, 'readOnly: true') === 3,
      'n8/C5b: 三个口**各自**声明 readOnly(实 ' + cnt(code, 'readOnly: true') + ')'
      + '—— 不是模块级一句「本模块只读」覆盖三口');
    //  ⚠ 不许按 `IDENTITY_REFS` / `worldSnapshot` 的**词频**判 —— 注释里也在提它们
    //    (实跑 8 / 5,不是 1)。按**三态来源词**判:真源 / 声明表兜底 / 连声明都没有,
    //    三个说法必须各自成词,不许混成一句。
    a(cnt(code, "source: 'identity-refs'") === 1 && cnt(code, "source: 'declared'") === 1
      && cnt(code, "source: 'absent'") === 1,
      'n8/C5c: 身份来源**三态各自成词**(实 '
      + j([cnt(code, "source: 'identity-refs'"), cnt(code, "source: 'declared'"),
        cnt(code, "source: 'absent'")]) + ')'
      + '—— 「真源拿到的」「声明表兜底」「连声明都没给」不许混成一句');
    a(cnt(E, 'SETTLED_KEYS') >= 1 && cnt(E, 'SETTLED_STATUS') >= 1,
      'n8/C5d: 结算标记是**一份**声明(实 ' + j([cnt(E, 'SETTLED_KEYS'), cnt(E, 'SETTLED_STATUS')]) + ')');
    // 死件不许复活:模块里没有「声明了却零调用」的读口
    a(cnt(E, 'function state()') === 0 && cnt(E, '\\.refused') === 0,
      'n8/C5e: 两处**零调用死件**不复活(function state() ' + cnt(E, 'function state()')
      + ' / stat.refused ' + cnt(E, '\\.refused') + ')'
      + '—— 本仓 v2.11.0 起的尺子:没人调用的口坏了也没人知道');
  }
  return runN(a, C);
}

// ════ N 段:真源码破坏 + 两向自证 ═══════════════════════════
/**
 * 每一脚都从**同一块空盘**起步(gate.fresh() 不复位 localStorage —— 自己先清),
 *   并且**两侧都跑同一份种子**。四脚破坏各咬一处**实测差**:
 *   N1 D1 顺序敏感 —— 同一行被读成两行(凭空造差异)
 *   N2 D2 no-change 混入 allowed —— 计数吹报(7 而非 2)
 *   N3 D3 历史判定先于 no-change —— 「本来没变化」被说成「被规则挡住」
 *   N4 D4 绑定页 ≠ 渲染页 —— 按钮 onclick 全是 undefined(换面板源文件,已实证有效)
 */
function runN(a, C) {
  const j = JSON.stringify;
  function mkRun(ov, fn) {
    const env = C.env0(ov || null);
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    C.seed(WA);
    const A = WA.checkpoints.save('作者A', {});
    C.seedB(WA);
    const B = WA.checkpoints.save('作者B', {});
    return fn(env, WA, A, B);
  }
  /** 破一件:锚点必须**恰中 1 次**(否则前置失效,如实报红)。 */
  function broke(key, repl, rel) {
    rel = rel || C.ENG_REL;
    const S = rd(rel);
    const from = C.ANCHOR[key];
    //  ⚠ 锚点自带**行首换行**(见生成器 jstr 的说明:那才是「整行」的真身)。
    //    替换串必须同形带上它 —— 否则 split/join 会把**上一行与替换串焊接成一行**,
    //    副本变成语法坏文件(首轮 N4 报 "Unexpected token 'function'" 就是这个,
    //    它不是判据错,是破坏副本自己坏了)。
    if (from && from.charAt(0) === '\n' && repl.charAt(0) !== '\n') repl = '\n' + repl;
    if (from === undefined) { a(false, 'n8/Npre: 锚点 ' + key + ' 在 ANCHOR 表里不存在'); return null; }
    const n = cnt(S, from);
    if (n !== 1) { a(false, 'n8/Npre: 锚点 ' + key + ' 恰中 1 次(前置失效,实 ' + n + ')'); return null; }
    const b = S.split(from).join(repl);
    if (b === S) { a(false, 'n8/Npre: 锚点 ' + key + ' 破坏后源码**确实变了**(否则两向是同一份)'); return null; }
    const ov = {}; ov[rel] = b;
    return ov;
  }
  // N0 静态面:不引可执行脚本
  a(cnt(C.E, 'eval(') === 0 && cnt(C.E, 'new Function') === 0,
    'n8/N0: 分支比较面不引入可执行脚本(实 eval ' + cnt(C.E, 'eval(')
    + ' / new Function ' + cnt(C.E, 'new Function') + ')');
  // ── N1 D1 顺序敏感 ──
  {
    const ov = broke('sortExtra', '.map(String);');
    if (ov) {
      function once(o) {
        return mkRun(o, function (env, WA, A, B) {
          const r = WA.branchDiff.semanticDiff(A.id, B.id, {});
          return { onlyA: r.classes.relation.onlyA.total, onlyB: r.classes.relation.onlyB.total,
            changed: r.classes.relation.changed.total,
            onlyAitems: r.classes.relation.onlyA.items.map(function (x) { return x.id; }) };
        });
      }
      let bad = null, good = null, threw = null;
      try { bad = once(ov); good = once(null); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'n8/N1a: 两版都不抛(实 ' + j(threw) + ')');
      a(good && good.onlyA === 0 && good.changed === 2,
        'n8/N1b: (两向)原版上 bonds 那对**被读成同一行**(实 onlyA ' + (good && good.onlyA)
        + ' / changed ' + (good && good.changed) + ')');
      a(bad && bad.onlyA === 1 && bad.onlyB === 2 && bad.changed === 1,
        'n8/N1c: (两向)去掉排序 ⇒ **凭空造出一行**(A 侧多一条 bonds,实 ' + j(bad) + ')'
        + '—— 「同一行」被读成「两边各有一行」,这是 D1 的形态');
      a(bad && bad.onlyAitems.length === 1 && bad.onlyAitems[0] === '甲×乙|甲|乙',
        'n8/N1d: (两向)造出来的那条**正是顺序敏感拼出来的 id**(实 ' + j(bad && bad.onlyAitems) + ')'
        + '—— 原版里这个 id 根本不存在');
    }
  }
  // ── N2 D2 no-change 混入 allowed ──
  {
    const ov = broke('noChangeDetect', '        else if (false) { kind = \'unchanged\'; ok = true; reason = \'no-change\'; }');
    if (ov) {
      function once(o) {
        return mkRun(o, function (env, WA, A, B) {
          const r = WA.branchDiff.transplant(A.id, B.id, {});
          return { allowed: r.allowed, blocked: r.blocked, unchanged: r.unchanged };
        });
      }
      let bad = null, good = null, threw = null;
      try { bad = once(ov); good = once(null); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'n8/N2a: 两版都不抛(实 ' + j(threw) + ')');
      a(good && good.allowed === 2 && good.unchanged === 6,
        'n8/N2b: (两向)原版三栏分开算(实 可移植 ' + (good && good.allowed)
        + ' / 无变化 ' + (good && good.unchanged) + ')');
      a(bad && bad.allowed === 7 && bad.unchanged === 0,
        'n8/N2c: (两向)不判 no-change ⇒ 逐字相同的行**混进「可移植」**(实 ' + j(bad) + ')'
        + '—— 计数从吹报的 7 落回 2,这就是 D2 的形态');
    }
  }
  // ── N3 D3 历史判定先于 no-change ──
  {
    const ov = broke('unchangedFirst', '        if (ok && reason === \'no-change\' && face.replay !== \'ledger\') {');
    if (ov) {
      function once(o) {
        return mkRun(o, function (env, WA, A, B) {
          const r = WA.branchDiff.transplant(A.id, B.id, {});
          const st1 = r.plan.items.filter(function (p) { return p.face === 'causal.settled'; })[0];
          return { unchanged: r.unchanged, blocked: r.blocked,
            st1reason: st1 && st1.reason, st1hist: st1 && st1.history, st1kind: st1 && st1.kind };
        });
      }
      let bad = null, good = null, threw = null;
      try { bad = once(ov); good = once(null); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'n8/N3a: 两版都不抛(实 ' + j(threw) + ')');
      a(good && good.st1reason === 'no-change' && good.st1hist === false && good.unchanged === 6,
        'n8/N3b: (两向)原版上账本面那笔**如实报「本来就没变化」**(实 ' + j(good) + ')');
      a(bad && bad.st1reason === 'history' && bad.st1hist === true && bad.unchanged === 5,
        'n8/N3c: (两向)账本行不早退 ⇒ **「没变化」被说成「被规则挡住」**(实 '
        + j([bad && bad.st1reason, bad && bad.st1hist, bad && bad.unchanged]) + ')—— 这就是 D3 的形态');
      a(bad && bad.blocked === good.blocked + 1,
        'n8/N3d: (两向)被拦数**凭空多一**(实 ' + (bad && bad.blocked) + ' vs ' + (good && good.blocked) + ')'
        + '—— 错不在「多拦了一笔真事」,而在「把无事发生说成被拦」');
    }
  }
  // ── N4 D4 绑定页 ≠ 渲染页 ──
  {
    const GUARD = C.ANCHOR.segGuard;
    const ov = broke('segGuard', "    if (currentPage === 'tools') {", C.PANEL_REL);
    //  ⚠ 这一脚的锚点是**页守卫那一行**,不是 N8 段首注释 —— 因为前者才是
    //     「绑定块挂在哪一页」的唯一判据(段首注释挪了也不等于守卫变了)。
    a(cnt(rd(C.PANEL_REL), GUARD) === 1,
      'n8/N4pre: 面板页守卫锚点恰中 1 次(实 ' + cnt(rd(C.PANEL_REL), GUARD) + ')');
    if (ov) {
      function once(o) {
        return mkRun(o, function (env) {
          const dom = env.dom, el = dom.getElementById('wa-panel');
          const tabs = el.querySelectorAll('.wa-tab');
          const t = tabs.filter(function (x) { return x.dataset.page === 'branchdiff'; })[0];
          if (!t) return { err: 'no-tab' };
          t.click();
          const out = {};
          BTN_IDS.forEach(function (id) {
            const b = dom.getElementById(id);
            out[id] = b ? (typeof b.onclick === 'function' ? 'ok' : 'NO-HANDLER') : 'NO-EL';
          });
          return out;
        });
      }
      let bad = null, good = null, threw = null;
      try { bad = once(ov); good = once(null); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'n8/N4a: 两版都不抛(实 ' + j(threw) + ')');
      a(good && good['wa-bd-diff'] === 'ok' && BTN_IDS.every(function (id) { return good[id] === 'ok'; }),
        'n8/N4b: (两向)原版上五枚按钮**全活**(实 ' + j(good) + ')');
      a(bad && BTN_IDS.every(function (id) { return bad[id] === 'NO-HANDLER'; }),
        'n8/N4c: (两向)把守卫改回 tools 页 ⇒ **五枚全成 NO-HANDLER**(实 ' + j(bad) + ')'
        + '—— 按钮照在、点了没反应,这就是 D4 的形态');
      //  ⚠ 断言**消息**里也不许裸写 `Object.keys(bad)` —— bad 为 null 时消息自己抛错,
      //    会把整段拖崩(首轮就是这样:EX + 三条连带红,真因被埋掉)。
      const nInField = bad ? Object.keys(bad).length : -1;
      a(bad && nInField === BTN_IDS.length,
        'n8/N4d: (两向)它们**不是消失了**、只是没绑上(实 ' + nInField + ' 枚仍在场)'
        + '—— 「控件在但没人管」与「控件没渲染」在读数上分得开');
    }
  }
  // 收尾复核:负控制全程**没有**改到真源码
  {
    const S = rd(C.ENG_REL), PP = rd(C.PANEL_REL);
    //  ⚠ 与 A12e 同理:判据里不许出现破坏标记的字面量(自指涉)。改为数**引擎这个
    //    产品文件**里的残留痕迹 —— 破坏只在 srcOverride 的副本上发生。
    a(cnt(S, '破坏') === 0 && cnt(S, '.map(String);') === 0,
      'n8/N5: 负控制全程未改真源码(引擎里 破坏 ' + cnt(S, '破坏')
      + ' / 破坏后才有的 .map(String); ' + cnt(S, '.map(String);') + ' 命中)');
    a(cnt(S, C.ANCHOR.sortExtra) === 1 && cnt(S, C.ANCHOR.noChangeDetect) === 1
      && cnt(S, C.ANCHOR.unchangedFirst) === 1 && cnt(PP, C.ANCHOR.segGuard) === 1,
      'n8/N5b: 四枚被破坏的锚点在盘上**各自仍是 1 次**(实 '
      + j([cnt(S, C.ANCHOR.sortExtra), cnt(S, C.ANCHOR.noChangeDetect),
        cnt(S, C.ANCHOR.unchangedFirst), cnt(PP, C.ANCHOR.segGuard)]) + ')');
    a(cnt(PP, "if (currentPage === 'tools') {") === 1
      && cnt(PP, "if (currentPage === 'branchdiff') {") === 1,
      'n8/N5c: 两个页守卫**各自恰 1 处**(实 tools ' + cnt(PP, "if (currentPage === 'tools') {")
      + ' / branchdiff ' + cnt(PP, "if (currentPage === 'branchdiff') {") + ')'
      + '—— 上面那条 N4c 说的正是「把 branchdiff 那处换成 tools」的形状');
  }
}module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  try {
    runAll(a);
  } catch (e) {
    fail++;
    console.log('FAIL n8/EX: 专锁**整段抛出**(实 ' + String((e && e.stack) || e).slice(0, 400) + ')');
  }
  console.log('\nN8 s3-b3-n8-v2224 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}