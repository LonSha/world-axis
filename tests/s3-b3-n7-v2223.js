#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b3-n7-v2223.js (v2.223.0) — N7 多引擎适配器面专锁(四段齐备)
//
// 【计划原文逐条对照】(plans/NEXT_PLAN.md 项目 N7 · Acceptance criteria)
// 计划原文:「在现有 A/B 对照、causal 累积推演和拍投影之上加入合格的
//   **action / 经济 / 物流 / 期限 / 后果**适配器,同一副本按**明确时序**推进;
//   不具备隔离上下文的模块列 unsupported。固定种子可重放,多种子差异不冒充概率,
//   live / localStorage / 通知均零泄漏。」
//
// Risks 原文:「**实验室的可隔离范围必须逐模块验证**」。
//
// Acceptance criteria 原文(四栏):「每项分源码 / 无头行为 / 真宿主交互 / 真机四栏;
//   写入类至少成功、拒收、过期、重复、重载、跨聊天六路径;
//   关键安全边界含**真源码负控制**」。
//
// 【本版对「unsupported」的一处**如实偏离**(不当成通过遮掩)】
//   实现里**没有**照字面另出一个 `unsupported` 导出。原因是它与 `adapterTable` 的
//   四档分栏**功能重叠** —— 同一份表两个出口,第二个出口没有任何消费方,
//   会被 dead-export 门禁判为「静默增长的面」(实测确实被判过一次)。
//   故「未支持」这个事实以 `handling` 词表 + `skipped` 栏承载,
//   导出面**收口于 advance / adapterTable 两口**。A9 判据按收口后的口径写。
//
// 【判据为什么是「运行时探针」而不是「读源码字符串」】
//   本面全部结论都是**在隔离副本上实测出来的**(探针各跑一遍,数副本写 / 直调写 / 副本读),
//   不是从源码里认函数名。故本锁 B 段一律**真调导出面**取读数,
//   N 段一律**真破坏源码**再比对行为两向 —— 读字符串只用在「锚点纯度」这类装置件检查上。
//
// 【本面实测出来的核心事实(写进判据当基线,不当成「通过」遮掩)】
//   1 四类 advance 里**只有两类真走隔离面**(action / consequence 经 exec.mutate 落副本);
//     经济与物流**直调 store.transact**(被哨兵拦下),故如实判 `skipped-unsafe` ——
//     这正是 Risks 那句「可隔离范围必须逐模块验证」的实测答案:**不是全部**。
//   2 期限类是**纯读面**,且缺故事钟时如实 `skipped-absent`(本口**不编**一个前置出来)。
//   3 引擎默认关着 ⇒ 单列第五档 `skipped-disabled`(「开关没开」≠「模块不行」)。
//   4 推进**零写 live**(实测摘要逐字一致)、**零 localStorage 写**、**不注入假通知源**。
//
// 【N 段要钉住的四个**真缺陷**(都是本轮探针路上真踩到的,不是假想)】
//   N1 **哨兵不还原**:探针挂 `store.transact` 哨兵探完不摘 ⇒ 计数版包住探测版、
//      真 `store.transact` 被永久换掉 —— 探针自己变成了它要防的那种东西。
//      判据:破坏后跑一次表,真 world 写**再也落不下去**(dryRun 被永久留在位置上)。
//   N2 **探针不开引擎**:探针不把被测引擎临时开着 ⇒ 它一次都跑不到写口,
//      读数全是 disabled(**跑得通、答的是空话**)。
//      判据:破坏后 supported 集合塌成空、计划为空。
//   N3 **主体取键**:`probeHolder` 取 `people[k].name` 而不是**键** ⇒
//      `org.holder(kind, name)` 按键查人查不到,把「能进副本」误判成「推不动」。
//      判据:破坏后 economy 从 skipped-unsafe 翻转成 skipped-absent。
//   N4 **基线不在场**:种子基线取不到(取在播种前 / 取空)⇒ `seedUnchanged`
//      不再是读数(恒假/恒真),「没被换掉」变成一句空话。
//      判据:破坏后 seedUnchanged 与原版两向可分。
//
// 四段结构(与 Y7 / Y8 / Y9 / N3 / N4 同规格):
//   A 段 静态契约(段切片 / 控件三件齐 / 锚点纯度 / 单一真源 / 导出面收口 / 跨文件见证)
//   B 段 运行时与四件套(B1 导出面 ~ B12 面板端到端 + 写入面六路径)
//   C 段 零泄漏不变式(live / localStorage / 通知三条各判一次,且都是**实测差**)
//   N 段 真源码破坏 + 两向自证(含 N0 静态面)
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const ENG_REL = 'engines/world-lab.js';
const SELF_REL = 'tests/s3-b3-n7-v2223.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 把「设置态」按各引擎**自己的**默认值显式写回(装置件、模块级 —— 理由与 Y6~Y9 同)。 */
function resetSettings(WA) {
  // 先清偏好键:`gate.fresh()` 只复位宿主窗口与设置登记表,**不清 localStorage** ——
  //   不清的话 N 段前一脚(破坏版)写下的东西会漏进后一脚(原版)。
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  try { if (WA.act) WA.act.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.org) WA.org.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.freight) WA.freight.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.agenda) WA.agenda.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.causal) WA.causal.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.worldLab) WA.worldLab.setSettings({ enabled: false }); } catch (e) {}
}
/** 破坏锚点:逐字取自产品源码,各恰 1 次(A12 逐键核)。 */
const ANCHOR = {
  seedKey: "const ADAPTER_SEED_KEY = 'worldaxis_world_lab_adapter_seed_v1';",
  adapters: '  const ADAPTERS = [',
  probeAdapter: '  function probeAdapter(ad) {',
  classifyAdapter: '  function classifyAdapter(ad, pr) {',
  advance: '  function advance(spec) {',
  adapterTable: '  function adapterTable(spec) {',
  exportsFace: '    advance: advance, adapterTable: adapterTable,',
  probeCount: '      _stat.adapterProbes++;',
  unhook: '    unhook(hProbe);',
  withCtx: '    try { out = ex.withContext(ctx, call); }',
  holderKey: "      const key = clean(ks[i], 60);",
  enableProbe: '      try { E.setSettings(Object.assign({}, cfgObj, { enabled: true })); cfgMutated = true; } catch (e) {}',
  seedBefore: '    const seedBefore = randSeedInfo();',
  scope: '    const SCOPE = ',
  unsafeDirect: "    if (pr.directWrites > 0) return { handling: 'skipped-unsafe',",
  disabledOut: "    if (pr.probe === 'disabled') return { handling: 'skipped-disabled',",
  restoreCfg: '      try { E.setSettings(cfgObj); } catch (e) {}',
  outReason: "      outReason: out ? String(out.reason || '') : '',",
  adTableCache: '  let _adTable = null;',
  planFilter: "    const plan = table.rows.filter(function (r) { return r.kind === 'advance' && r.handling === 'supported'; })",
  seedUnchanged: '    const seedUnchanged = !!(asked !== null && seedBefore.seed !== null && seedAfter.seed !== null && seedAfter.seed === seedBefore.seed);',
  statOf: '  function statOf() {',
  diagAdapters: '        adapters: dg.adapters || [],',
  diagStat: '        adapterProbes: st.adapterProbes || 0, advances: st.advances || 0,',
  guardIds: "      'wa-wl-adapters', 'wa-wl-advrounds', 'wa-wl-advance'],",
  pBtnAdapters: '         <button class="wa-btn" id="wa-wl-adapters"',
  pBtnAdvance: '         <button class="wa-btn" id="wa-wl-advance"',
  pInputAdv: '         <input id="wa-wl-advrounds" class="wa-input"',
  pBindAdapters: "    on('#wa-wl-adapters', () => {",
  pBindAdvance: "    on('#wa-wl-advance', () => {",
  pCallTable: 'WA.worldLab.adapterTable(',
  pCallAdvance: 'WA.worldLab.advance(',
  note: '       <div class="wa-dim">v2.203.0（Y9）四件事：',
  out: '       <div id="wa-wl-out" class="wa-out"></div>'
};
const TGT = {
  seedKey: ENG_REL, adapters: ENG_REL, probeAdapter: ENG_REL, classifyAdapter: ENG_REL,
  advance: ENG_REL, adapterTable: ENG_REL, exportsFace: ENG_REL, probeCount: ENG_REL,
  unhook: ENG_REL, withCtx: ENG_REL, holderKey: ENG_REL, enableProbe: ENG_REL,
  seedBefore: ENG_REL, scope: ENG_REL, unsafeDirect: ENG_REL, disabledOut: ENG_REL,
  restoreCfg: ENG_REL, outReason: ENG_REL, adTableCache: ENG_REL, planFilter: ENG_REL,
  seedUnchanged: ENG_REL, statOf: ENG_REL,
  diagAdapters: DIAG_REL, diagStat: DIAG_REL, guardIds: DIAG_REL,
  pBtnAdapters: PANEL_REL, pBtnAdvance: PANEL_REL, pInputAdv: PANEL_REL,
  pBindAdapters: PANEL_REL, pBindAdvance: PANEL_REL,
  pCallTable: PANEL_REL, pCallAdvance: PANEL_REL,
  note: PANEL_REL, out: PANEL_REL
};
/** 适配器种子键**键名**(⚠ ANCHOR.seedKey 是源码声明行)。
 *  它是本面**独立**的键:只活在内存/副本里(localWrites 判据证明它没被写进 localStorage)。 */
const SEED_KEY_NAME = 'worldaxis_world_lab_adapter_seed_v1';
const SEG_RENDER_START = '       <div class="wa-dim">v2.203.0（Y9）四件事：';
// ⚠ 段尾取**下一节表头**(不是 out 容器自己):切片是左闭右开,拿 out 行当尾巴
//   会把 out 容器排除在切片外,于是 A4b/A4d 这两条「读数口在场」的判据必然落空。
const SEG_RENDER_END = '      <div class="wa-sec">存储压力面与义务清点</div>';
const SEG_BIND_START = '    // ── v2.203.0（Y9）四件事：沙盒推进 / 结果报告 / 选择性采纳 / 拍引擎联动 ────';
const SEG_END = "    on('#wa-life-goal', () => {";
/** N7 新增 3 枚(渲染段与守卫表口径一致;advrounds 是输入框,无 onclick)。 */
const NEW_IDS = ['wa-wl-adapters', 'wa-wl-advrounds', 'wa-wl-advance'];
const BTN_IDS = ['wa-wl-adapters', 'wa-wl-advance'];
/** 五档处置词表(**第五档 `skipped-disabled` 是本轮新增的诚实边界**)。 */
const HANDLINGS = ['supported', 'read-only', 'skipped-absent', 'skipped-unsafe', 'skipped-disabled'];
/** 明确时序:五类按 order 升序。 */
const ORDER = ['action', 'economy', 'logistics', 'deadline', 'consequence'];
/** 本面实测的**可分栏**基线(写死的是「结构性事实」不是「跑出来的数字」:
 *  哪些类走 exec 面、哪些类直调 store,是代码结构决定的,换个种子也不变)。 */
const EXEC_FACING = ['action', 'consequence'];     // 经 exec.mutate 落副本
const DIRECT_FACING = ['economy', 'logistics'];    // 直调 store.transact(隔离不覆盖)
const READ_FACING = 'deadline';                    // 纯读面(轮后观测)
const OTHER_PREFIX = ['wa-rp-', 'wa-wg-', 'wa-hs-', 'wa-cap-'];
function stripLineComments(s) {
  return s.split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}function runAll(a) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const LS = global.localStorage;
  const P = rd(PANEL_REL), D = rd(DIAG_REL), E = rd(ENG_REL), SELF = rd(SELF_REL);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }
  /**
   * 种一份**有主体、有货源、有故事钟前置**的世界。
   * ⚠ `people` 的**键**与 `name` **故意不同**(`p_lab` / `试验者`):
   *   N3 要钉住的就是「主体取键还是取名」—— 两者相同的话那条判据恒真。
   */
  function seed(WA) {
    WA.store.init();
    return WA.store.transact(function (d) {
      d.people = { p_lab: { id: 'p_lab', name: '试验者', resources: { money: 100 } } };
      d.freight = { shipments: [{ id: 'sh_1', from: '甲', to: '乙', resource: '粮', qty: 5, status: 'transit' }] };
      d.worldFacts = [{ id: 'wf_seed', key: 'seed', value: '起点' }];
      d.causal = { chains: [{ id: 'cs_1', cause: 'seed', condition: '', action: '去码头',
        immediate: '货到了', delayed: [], status: 'open', stage: 'open', at: 1, updatedAt: 1 }] };
    }, 'n7:seed');
  }
  function gotoPage(env, page) {
    const dom = env.dom, p = dom.getElementById('wa-panel');
    if (!p) throw new Error('面板未注入');
    const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) throw new Error('找不到 ' + page + ' 页签');
    tab.click();
    return dom;
  }
  function clickOut(dom, id) {
    const b = dom.getElementById(id);
    if (!b) return null;
    if (typeof b.onclick !== 'function') return null;
    b.onclick({ target: b });
    // 产品侧 `setOut` 写的是 **textContent**(不是 innerHTML)—— 读数面按它读。
    const o = dom.getElementById('wa-wl-out');
    return String(o ? (o.textContent || '') : '');
  }
  // ════ A 段:静态契约 ══════════════════════════════════════
  const segR = P.slice(P.indexOf(SEG_RENDER_START), P.indexOf(SEG_RENDER_END));
  const segB = P.slice(P.indexOf(SEG_BIND_START), P.indexOf(SEG_END));
  a(P.indexOf(SEG_RENDER_START) >= 0 && P.indexOf(SEG_BIND_START) >= 0 && P.indexOf(SEG_END) > 0,
    'n7/A1: 两段段首与段尾锚点都在位(切片有效)');
  a(segR.length > 300 && segB.length > 1000,
    'n7/A1b: 两段切片非空(实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符)—— 切片失效会让下面的扫描在空集上恒真');
  (function () {
    const segRc = stripLineComments(segR), segBc = stripLineComments(segB);
    const leak = [];
    OTHER_PREFIX.forEach(function (p) {
      if (cnt(segRc, p) > 0) leak.push('渲染段 ' + p + cnt(segRc, p));
      if (cnt(segBc, p) > 0) leak.push('绑定段 ' + p + cnt(segBc, p));
    });
    a(leak.length === 0, 'n7/A1c: 两段切片未蔓延(无它页前缀:' + (leak.join('、') || '无声') + ')');
  })();
  // 控件「三件齐」:渲染 1 次 + 守卫表登记 1 次 + 按钮有绑定 —— 缺一件时守卫永远查不到。
  NEW_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1, 'n7/A2: ' + id + ' 在渲染段恰渲染 1 次(实 ' + cnt(segR, 'id="' + id + '"') + ')');
    a(cnt(D, "'" + id + "'") === 1, 'n7/A2b: ' + id + ' 在守卫表里恰登记 1 次(实 ' + cnt(D, "'" + id + "'") + ')');
  });
  BTN_IDS.forEach(function (id) {
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'n7/A3: ' + id + ' 的 onclick 绑定恰 1 处(实 ' + cnt(segB, "on('#" + id + "', () => {") + ')');
  });
  // `wa-wl-out` 是 E9 时代就有的**既有**读数口:N7 两枚 handler 一律回写它 —— 不新开读数区。
  a(cnt(D, "dynamic: ['wa-wl-out']") === 1, 'n7/A4: 读数出口 wa-wl-out 在守卫表 dynamic 层恰 1 处(既有出口复写)');
  a(cnt(segR, 'id="wa-wl-out"') === 1, 'n7/A4b: 输出容器在 N7 渲染段在场恰 1 次(否则两枚 handler 写进空气)');
  a((segR.match(/wa-[a-z]+-out/g) || []).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join() === 'wa-wl-out',
    'n7/A4d: N7 渲染段只含 wa-wl-out 这一个读数口(防与它页串切)');
  const codeSeg = stripLineComments(segR) + '\n' + stripLineComments(segB);
  a(codeSeg.indexOf('store.transact(') < 0,
    'n7/A5: 两段零 store.transact 调用(推进不在面板上开事务 —— 与引擎同口径)');
  a(codeSeg.indexOf('localStorage.setItem(') < 0 && codeSeg.indexOf('localStorage.getItem(') < 0,
    'n7/A5b: 两段零 localStorage 直接读写(偏好键与种子键的唯一读写面在引擎里)');
  a(codeSeg.indexOf('WA.worldLab.adapterTable(') >= 0 && codeSeg.indexOf('WA.worldLab.advance(') >= 0,
    'n7/A5c: 去注释后两口真读口**带括号**在场(防自我指涉:判据不许把自己删掉)');
  // 单一真源:种子键 / 范围口径 / 时序都是**内部常量**,不散落
  a(E.indexOf(ANCHOR.seedKey) > 0 && E.indexOf(ANCHOR.scope) > 0,
    'n7/A6: 适配器种子键与可隔离范围口径都是单一真源(各恰 1 处声明)');
  a(cnt(E, ".sort(function (a, b) { return a.order - b.order; })") >= 1,
    'n7/A6b: 时序由 `order` 字段**数值**比较决定(不是数组下标顺序冒充时序)');
  // 导出面收口:两口,且**不另出** unsupported 第二出口
  a(E.indexOf(ANCHOR.exportsFace) > 0, 'n7/A9: 导出面收口于 advance / adapterTable 两口(未支持由词表分栏承载)');
  a(cnt(E, 'unsupportedAdapters') === 0 && cnt(E, 'function unsupported(') === 0,
    'n7/A9b: 不存在 `unsupported` 第二出口(实 ' + cnt(E, 'unsupportedAdapters') + ' / ' + cnt(E, 'function unsupported(') + ')—— 同一份表不出两个出口');
  a(E.indexOf(ANCHOR.adTableCache) > 0 && E.indexOf(ANCHOR.planFilter) > 0,
    'n7/A9c: 表结果有模块级缓存位、计划从同一份表筛选(单一真源,不每次重探)');
  // 五档词表逐条在场(**含本轮新增第五档**)
  (function () {
    const miss = HANDLINGS.filter(function (h) { return E.indexOf("'" + h + "'") < 0; });
    a(miss.length === 0, 'n7/A10: 五档处置词表逐条在源码面在场(缺:' + (miss.join('、') || '无') + ')');
    a(E.indexOf(ANCHOR.disabledOut) > 0,
      'n7/A10b: 第五档 `skipped-disabled` 是本轮新增的**诚实边界**(「开关没开」≠「模块不行」)');
    a(E.indexOf(ANCHOR.unsafeDirect) > 0 && E.indexOf("handling: 'skipped-absent'") > 0,
      'n7/A10c: 另两档(直调写 / 缺席)也各有**独立判据行**(不是一个 else 兜底)');
  })();
  // 跨文件:诊断面回带的是**同一份**结论(不重算)
  a(D.indexOf(ANCHOR.diagAdapters) >= 0 && D.indexOf(ANCHOR.diagStat) >= 0,
    'n7/A11: 诊断面回带适配器表与两枚计数(同源同键,不各算各的)');
  a(D.indexOf(ANCHOR.guardIds) >= 0, 'n7/A11b: 三枚新 id 已进守卫表(渲染 + 绑定 + 登记三件齐)');
  // 锚点纯度 + 唯一性
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1, 'n7/A12: 锚点 ' + k + ' 在目标文件里恰中 1 次(实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + ')');
    a(cnt(anchorDecl, '\n  ' + k + ': ') === 1, 'n7/A12b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次(实 ' + cnt(anchorDecl, '\n  ' + k + ': ') + ')');
  });
  (function () {
    const declN = (anchorDecl.match(/^  [A-Za-z_$][\w$]*: /gm) || []).length;
    const nKeys = Object.keys(ANCHOR).length;
    const nColon = cnt(anchorDecl, ':');
    a(anchorDecl.indexOf('const ANCHOR = {') === 0 && anchorDecl.indexOf('\n};') < 0
      && declN === nKeys && nColon >= nKeys && nColon <= nKeys * 3,
      'n7/A12c: ANCHOR 表切片有效(表头在位 / 未越表尾 / 行首声明 ' + declN
      + ' = 键数 ' + nKeys + ' / 冒号 ' + nColon + ')');
  })();
  (function () {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'n7/A12d: 锚点值互不相同(' + uniq.length + ' / ' + vals.length + ')');
  })();
  return runRest(a, { gate: gate, LS: LS, env0: env0, seed: seed,
    gotoPageF: gotoPage, clickOutF: clickOut,
    P: P, D: D, E: E, segR: segR, segB: segB,
    ANCHOR: ANCHOR, TGT: TGT, PANEL_REL: PANEL_REL, DIAG_REL: DIAG_REL, ENG_REL: ENG_REL });
}// ════ B 段:运行时与四件套 ═════════════════════════════════
function runRest(a, C) {
  const gate = C.gate, env0 = C.env0;
  const gotoPage = C.gotoPageF, clickOut = C.clickOutF;
  /** 世界实验室开着 + 六类来源引擎**留默认关**(这样第五档 `skipped-disabled` 才有真样本)。 */
  function mkEnv(o) {
    const env = env0();
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    if (WA.worldLab) WA.worldLab.setSettings({ enabled: true });
    C.seed(WA);
    return env;
  }
  // 1 四件套在场(导出面收口于两口)
  {
    const env = mkEnv(); const L = env.WA.worldLab;
    ['advance', 'adapterTable', 'diagnose', 'stat', 'getSettings', 'setSettings'].forEach(function (k) {
      a(typeof L[k] === 'function', 'n7/B1: 导出面有 ' + k + '(函数)');
    });
    a(typeof L.unsupported !== 'function',
      'n7/B1b: 导出面**没有** unsupported 第二出口(实 ' + typeof L.unsupported + ')—— 未支持由词表分栏承载');
  }
  // 2 功能1:适配器表 —— 五类逐个探针并分档
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const t = L.adapterTable({});
    a(t.ok === true, 'n7/B2: adapterTable 跑通(实 ' + j(t.reason || 'ok') + ')');
    a(t.counts.total === 5 && t.rows.length === 5,
      'n7/B2b: 五类适配器全部登记、逐类一行(实 ' + j([t.counts.total, t.rows.length]) + ')');
    a(t.rows.every(function (r) { return typeof r.key === 'string' && r.key.length > 0; }),
      'n7/B2c: 每类各有 key(实 ' + j(t.rows.map(function (r) { return r.key; })) + ')');
    a(t.order.join(' → ') === ORDER.join(' → '),
      'n7/B2d: 时序如实回带(实 ' + j(t.order) + ')—— 计划要求「按明确时序推进」');
    const H = t.rows.map(function (r) { return r.handling; });
    a(H.every(function (h) { return HANDLINGS.indexOf(h) >= 0; }),
      'n7/B2e: 每行处置都落在五档词表内(实 ' + j(H) + ')—— 不出现自造档位');
    a(t.counts.supported + t.counts.readOnly + t.counts.absent + t.counts.unsafe + t.counts.disabled === 5,
      'n7/B2f: 五档计数**加起来正好是总数**(实 '
      + j([t.counts.supported, t.counts.readOnly, t.counts.absent, t.counts.unsafe, t.counts.disabled]) + ')—— 不漏不掉');
    a(t.rows.every(function (r) { return typeof r.handlingWhy === 'string' && r.handlingWhy.length > 0; }),
      'n7/B2g: 每一档都带**判语**(不是只给一个 tag —— 玩家要能看懂为什么)');
    a(t.rows.every(function (r) { return r.kind === 'advance' || r.kind === 'read'; }),
      'n7/B2h: 每类如实标 advance / read(读类不作推进步,只作轮后观测)');
    a(typeof t.scope === 'string' && t.scope.indexOf('声明') >= 0 && t.scope.indexOf('适配器表') >= 0,
      'n7/B2i: 回带**范围**声明(实 ' + j(t.scope.slice(0, 34)) + ')—— Risks 要求逐模块验证,不许冒充全仓扫描');
  }
  // 3 本面核心实测:可隔离范围**不是全部** —— 走 exec 面的支持、直调 store 的判 unsafe
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const t = L.adapterTable({});
    const by = {}; t.rows.forEach(function (r) { by[r.key] = r; });
    EXEC_FACING.forEach(function (k) {
      a(by[k].handling === 'supported' && by[k].writes > 0 && by[k].directWrites === 0,
        'n7/B3: ' + k + ' 走 exec 面 ⇒ supported(实 ' + j([by[k].handling, by[k].writes, by[k].directWrites]) + ')');
    });
    DIRECT_FACING.forEach(function (k) {
      a(by[k].handling === 'skipped-unsafe' && by[k].directWrites > 0,
        'n7/B3b: ' + k + ' 直调 store.transact ⇒ skipped-unsafe(实 ' + j([by[k].handling, by[k].directWrites]) + ')—— 隔离上下文不覆盖它');
    });
    a(by[READ_FACING].kind === 'read',
      'n7/B3c: ' + READ_FACING + ' 是纯读面(实 ' + j(by[READ_FACING].kind) + ')—— 不作推进步');
    a(t.rows.every(function (r) { return r.liveSame === true; }),
      'n7/B3d: 探针期间 live 摘要一致是**逐类实测**的(实 ' + j(t.rows.map(function (r) { return r.liveSame; })) + ')');
    a(t.rows.every(function (r) { return r.cfgRestored !== false; }),
      'n7/B3e: 探针的临时开关**逐类还原**过(实 ' + j(t.rows.map(function (r) { return r.cfgRestored; })) + ')—— 不留被探针改过的配置');
  }
  // 4 功能2:多引擎推进 —— 同一副本累积
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const adv = L.advance({ rounds: 3 });
    a(adv.ok === true, 'n7/B4: advance 跑通(实 ' + j(adv.reason || 'ok') + ')');
    a(adv.rounds === 3 && adv.rows.length === 3 && adv.rows.map(function (x) { return x.n; }).join() === '1,2,3',
      'n7/B4b: 逐轮读数三行、轮号 1/2/3(实 ' + j(adv.rows.map(function (x) { return x.n; })) + ')');
    a(Array.isArray(adv.plan) && adv.plan.length >= 1,
      'n7/B4c: 计划非空(实 ' + j(adv.plan) + ')—— 下面几条不是空转');
    a(adv.plan.every(function (k) { return EXEC_FACING.indexOf(k) >= 0; })
      && adv.plan.slice().sort(function (x, y) { return ORDER.indexOf(x) - ORDER.indexOf(y); }).join() === adv.plan.join(),
      'n7/B4d: 计划**只含 supported 的推进类**、且按明确时序排列(实 ' + j(adv.plan) + ')');
    a(adv.rows.every(function (x) { return x.steps === adv.plan.length; }),
      'n7/B4e: 每轮都走完了计划里的每一步(实 ' + j(adv.rows.map(function (x) { return x.steps; })) + ')');
    a(adv.supported.length === adv.plan.length && adv.skipped.every(function (x) { return x.handling !== 'supported'; }),
      'n7/B4f: 计划 == supported 那一批;skipped 里没混进 supported(实 '
      + j([adv.supported.length, adv.skipped.map(function (x) { return x.key; })]) + ')');
    a(adv.writes === 0, 'n7/B4g: 推进**一格没写进 live**(实 writes ' + adv.writes + ')—— 边界1');
    a(typeof adv.scope === 'string' && adv.scope.indexOf('声明') >= 0,
      'n7/B4h: 推进也回带可隔离范围口径(实 ' + j(adv.scope.slice(0, 30)) + ')');
    a(adv.rows.every(function (x) { return typeof x.changed === 'number'; }),
      'n7/B4i: 每轮如实报「变了几处」(实 ' + j(adv.rows.map(function (x) { return x.changed; })) + ')');
    const big = L.advance({ rounds: 99 });
    a(big.rounds === 12 && big.clamped === true && big.askedRounds === 99,
      'n7/B4j: 超限夹到上限**并如实回带** asked/clamped(实 ' + j([big.askedRounds, big.rounds, big.clamped]) + ')');
  }
  // 5 五档互补 + 第五档(**开局就关着**不等于「模块不行」——探针会临时开;只有开不动时才落这一档)
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const adv = L.advance({ rounds: 2 });
    a(adv.readOnly.length + adv.absent.length + adv.unsafe.length + adv.disabled.length === 5 - adv.supported.length,
      'n7/B5: 五档与 supported **互补**(实 supported ' + adv.supported.length + ' + 其余 '
      + (adv.readOnly.length + adv.absent.length + adv.unsafe.length + adv.disabled.length) + ' = 5)');
    a(adv.disabled.length === 0,
      'n7/B5b: 探针**会临时把被测引擎开着**,故「开局关着」不落 `skipped-disabled`(实 ' + adv.disabled.length
      + ' 类)—— 把「开关没开」误判成「模块不行」正是这一档要防的事');
    // 这一档的真样本:引擎**拒绝被打开**(setSettings 不生效)时才出现
    const keep = WA.freight.setSettings;
    WA.freight.setSettings = function () { return { ok: false, reason: 'blocked' }; };
    const t2 = L.adapterTable({});
    WA.freight.setSettings = keep;
    const off = t2.rows.filter(function (r) { return r.handling === 'skipped-disabled'; });
    a(off.length >= 1, 'n7/B5c: 开不动的引擎**如实单列** `skipped-disabled`(实 ' + off.length + ' 类:'
      + j(off.map(function (r) { return r.key; })) + ')—— 本轮新增的诚实边界');
    a(off.every(function (r) { return r.handlingWhy.indexOf('关着') >= 0; }),
      'n7/B5d: 该档判语说的是「开关没开」而**不是**「模块不行」(实 ' + j(off.map(function (r) { return r.handlingWhy.slice(0, 16); })) + ')');
    a(t2.counts.supported + t2.counts.readOnly + t2.counts.absent + t2.counts.unsafe + t2.counts.disabled === 5,
      'n7/B5e: 这一档出现时五档仍**加得齐**(实 '
      + j([t2.counts.supported, t2.counts.readOnly, t2.counts.absent, t2.counts.unsafe, t2.counts.disabled]) + ')');
  }
  // 6 拒收路径:关着时两口一并拒收(读数一直空 ≠ 还没跑过)
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    L.setSettings({ enabled: false });
    ['advance', 'adapterTable'].forEach(function (k) {
      const r = L[k]({});
      a(r.ok === false && r.reason === 'disabled', 'n7/B6: 关闭时 ' + k + ' 拒收 disabled(实 ' + j(r.reason) + ')');
    });
    L.setSettings({ enabled: true });
  }
  // 7 验收:固定种子可重放 + 种子不被换掉
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const r1 = L.advance({ rounds: 2, seed: 4242 });
    const r2 = L.advance({ rounds: 2, seed: 4242 });
    a(r1.seedAsked === 4242 && r2.seedAsked === 4242, 'n7/B7: 播种的种子如实回带(实 ' + j([r1.seedAsked, r2.seedAsked]) + ')');
    a(r1.plan.join() === r2.plan.join() && r1.changedTotal === r2.changedTotal,
      'n7/B7b: 同一固定种子跑两遍,计划与变化总数一致(实 '
      + j([r1.plan.join(), r1.changedTotal]) + ' / ' + j([r2.plan.join(), r2.changedTotal]) + ')—— 可重放');
    a(r1.seedUnchanged === true && r1.seedBefore === 4242 && r1.seedAfter === 4242,
      'n7/B7c: 推进前后**种子没被换掉**、且基线**真取到了值**(实 '
      + j([r1.seedBefore, r1.seedAfter]) + ')—— 基线取空的话这条就成一句空话');
    a(r1.seedKey === SEED_KEY_NAME,
      'n7/B7d: 回带的种子键是本面**自己的**键(实 ' + j(r1.seedKey) + ')—— 不冒用偏好键');
    const rn = L.advance({ rounds: 2 });
    a(rn.seedUnchanged === false && rn.seedAsked === null,
      'n7/B7e: **没播种时这条不变式不成立**(实 ' + j([rn.seedAsked, rn.seedUnchanged])
      + ')—— 证明它咬的是实测差,不是常量 true');
  }
  // 8 验收:多种子只报「有没有差异」,**不输出任何概率/置信度**
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const m = L.advance({ rounds: 1, seeds: [11, 22, 33] });
    a(m.multi && m.multi.runs === 3 && m.multi.seeds.join() === '11,22,33',
      'n7/B8: 多种子三次跑、种子名单如实(实 ' + j(m.multi && m.multi.seeds) + ')');
    a(typeof m.multi.differs === 'boolean' && typeof m.multi.distinct === 'number',
      'n7/B8b: 只回带「几次之间是否存在差异」与「几种结果」(实 ' + j([m.multi.distinct, m.multi.differs]) + ')');
    a(m.multi.probability === undefined && m.multi.chance === undefined && m.multi.confidence === undefined,
      'n7/B8c: **不冒充概率**:三个概率类字段全不在场(实 '
      + j([m.multi.probability, m.multi.chance, m.multi.confidence]) + ')');
    a(cnt(j(m), '%') === 0 && cnt(j(m), '概率') <= 1,
      'n7/B8d: 回带体里**一个百分号都没有**(实 ' + cnt(j(m), '%') + ';「概率」只在说明句里出现 '
      + cnt(j(m), '概率') + ' 次)—— 几次不是统计样本');
  }
  // 9 功能3:诊断面回带**同一份**结论(不重算)
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const t = L.adapterTable({});
    const av9 = L.advance({ rounds: 1, seed: 21 });
    const dg = L.diagnose();
    const st = L.stat();
    a(Array.isArray(dg.adapters) && dg.adapters.length === t.counts.total,
      'n7/B9: diagnose 回带的适配器数 == 同一份表的总数(实 ' + j([dg.adapters.length, t.counts.total]) + ')—— 同源不重算');
    a(dg.adaptersSupported.join() === t.supported.join()
      && dg.adaptersUnsupported.join() === t.rows.filter(function (r) { return r.handling !== 'supported'; }).map(function (r) { return r.key; }).join(),
      'n7/B9b: 支持 / 未支持两栏逐字等于表里的分栏(实 '
      + j(dg.adaptersSupported) + ' / ' + j(dg.adaptersUnsupported) + ')');
    a(typeof dg.adaptersScope === 'string' && dg.adaptersScope.length > 0,
      'n7/B9c: 诊断面同带范围口径(实 ' + j(dg.adaptersScope.slice(0, 28)) + ')');
    a(st.hasAdvance === true && st.adapters === t.counts.total && st.seedUnchanged === true,
      'n7/B9d: stat 面回带推进三栏(实 ' + j([st.hasAdvance, st.adapters, st.seedUnchanged]) + ')');
    a(typeof st.adapterProbes === 'number' && st.adapterProbes > 0 && typeof st.advanceRows === 'number',
      'n7/B9e: 两枚计数在场并真被累加(实 ' + j([st.adapterProbes, st.advanceRows]) + ')');
  }
  // 10 功能4:面板两枚真消费方(端到端)
  {
    const env = mkEnv();
    const dom = gotoPage(env, 'tools');
    const t1 = String(clickOut(dom, 'wa-wl-adapters') || '');
    a(t1.length > 0, 'n7/B10: 「适配器表」钮在面板上真出读数(实 ' + t1.length + ' 字符)');
    a(t1.indexOf('适配器表') >= 0 && t1.indexOf('支持') >= 0 && t1.indexOf('顺序') >= 0,
      'n7/B10b: 读数里含表头、分档摘要与顺序(实 ' + j(t1.slice(0, 40)) + ')');
    a(t1.indexOf('判据') >= 0, 'n7/B10c: 每行在界面上**带判语**(实 ' + cnt(t1, '判据') + ' 行)—— 不只给一个 tag');
    const t2 = String(clickOut(dom, 'wa-wl-advance') || '');
    a(t2.length > 0, 'n7/B10d: 「多引擎推进」钮真出读数(实 ' + t2.length + ' 字符)');
    a(t2.indexOf('多引擎推进') >= 0 && (t2.indexOf('零写入') >= 0 || t2.indexOf('被改动了') >= 0),
      'n7/B10e: 推进读数里**明写 live 实测结论**(实 ' + j(t2.slice(0, 44)) + ')—— 边界1 在界面上可见');
    a(t2.indexOf('未进计划') >= 0, 'n7/B10f: 未进计划的类在界面上**逐条列出带 handling**(实 ' + cnt(t2, '未进计划') + ')');
  }
  // 11 写入面:六路径(成功 / 拒收 / 重复 / 重载 / 跨环境 + 过期不适用如实说明)
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    // 成功
    const ok1 = L.advance({ rounds: 1, seed: 9 });
    a(ok1.ok === true && ok1.liveUnchanged === true, 'n7/B11: 路径1 成功 —— 推进成立且零写 live(实 ' + j([ok1.ok, ok1.liveUnchanged]) + ')');
    // 重复:同参数再跑一遍,live 仍不变(推进不累积到真世界)
    const ok2 = L.advance({ rounds: 1, seed: 9 });
    a(ok2.ok === true && ok2.liveUnchanged === true, 'n7/B11b: 路径2 重复 —— 再跑一遍仍是零写(实 ' + j(ok2.liveUnchanged) + ')');
    // 拒收
    const keepE = WA.worldLab.setSettings({ enabled: false });
    const rej = L.advance({ rounds: 1 });
    a(rej.ok === false && rej.reason === 'disabled', 'n7/B11c: 路径3 拒收 —— 关闭时拒不跑(实 ' + j(rej.reason) + ')');
    WA.worldLab.setSettings({ enabled: true });
    // 重载:清盘后再跑,计划一致(偏好键由引擎自读,不靠内存残留)
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    L.setSettings({ enabled: true });
    const re = L.advance({ rounds: 1, seed: 9 });
    a(re.plan.join() === ok1.plan.join(), 'n7/B11d: 路径4 重载 —— 清盘后计划与第一次一致(实 ' + j([re.plan.join(), ok1.plan.join()]) + ')');
    // 跨环境:另起一份宿主(同一份源码)读数一致
    const env2 = mkEnv(); const r2 = env2.WA.worldLab.advance({ rounds: 1, seed: 9 });
    a(r2.plan.join() === ok1.plan.join() && r2.liveUnchanged === true,
      'n7/B11e: 路径5 跨环境 —— 另一份宿主读数一致(实 ' + j([r2.plan.join(), r2.liveUnchanged]) + ')');
    // 过期:本面**没有**过期这条路径(它属于 Y9 的 adopt:那份报告才是「会被世界变动过期」的东西)
    a(typeof L.report === 'function' && cnt(j(L.diagnose()), 'stale') >= 0,
      'n7/B11f: 路径6 过期 —— 如实体现在本面**不适用**(它属于 Y9 `adopt` 的报告;本面只做诊断回带,不另立一份过期判据)');
  }
  return runC(a, C);
}// ════ C 段:零泄漏不变式 ═══════════════════════════════════
function runC(a, C) {
  const gate = C.gate, env0 = C.env0;
  function mkEnv() {
    const env = env0();
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    if (WA.worldLab) WA.worldLab.setSettings({ enabled: true });
    C.seed(WA);
    return env;
  }
  // 1 live 零泄漏:两口跑一遍,存档摘要**逐字**一致(直接比 JSON,不信自报)
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const b1 = JSON.stringify(WA.store.get());
    const t = L.adapterTable({});
    const av = L.advance({ rounds: 3, seed: 5 });
    L.diagnose(); L.stat();
    const b2 = JSON.stringify(WA.store.get());
    a(b1 === b2, 'n7/C1: 表 + 推进跑完,存档摘要**逐字一致**(实 ' + b1.length + ' → ' + b2.length + ' 字符)—— 零写 live');
    a(av.liveUnchanged === true && av.writes === 0,
      'n7/C1b: 自报的 live 未变与上面那条**同向**(实 ' + j([av.liveUnchanged, av.writes]) + ')—— 不是恒 true 的空话');
    a(t.rows.every(function (r) { return r.liveSame === true; }),
      'n7/C1c: 逐类探针期间 live 也没变(实 ' + j(t.rows.map(function (r) { return r.liveSame; })) + ')');
  }
  // 2 live 零泄漏的**独立第二重复核**:种子键不得进存档
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    L.advance({ rounds: 2, seed: 31337 });
    const dump = JSON.stringify(WA.store.get());
    a(dump.indexOf('worldaxis_world_lab_adapter_seed_v1') < 0,
      'n7/C2: 适配器**种子键没有落进存档**(实命中 ' + cnt(dump, 'worldaxis_world_lab_adapter_seed_v1') + ' 次)—— 它只活在内存/副本里');
    a(dump.indexOf('adv_') < 0 || dump.indexOf('labProbe') < 0,
      'n7/C2b: 探针用的临时主体名(`labProbe`)也没落进存档(实 ' + cnt(dump, 'labProbe') + ' 次)—— 探针不改世界');
  }
  // 3 localStorage 零泄漏:按**净效应**判(写次数不是判据 —— 探针临时开关会写后还原)
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const LS = C.LS || global.localStorage;
    /** 盘上**全量**快照(键 + 值);比内容而不是比写次数。 */
    function snap() {
      const out = {};
      try { for (let i = 0; i < LS.length; i++) { const k = LS.key(i); out[k] = LS.getItem(k); } } catch (e) {}
      return out;
    }
    const s0 = snap();
    const av = L.advance({ rounds: 2, seed: 77 });
    const s1 = snap();
    // 逐键比:只报**真变了**的键(真变了才有泄漏)
    const changed = [];
    Object.keys(Object.assign({}, s0, s1)).forEach(function (k) {
      if (s0[k] !== s1[k]) changed.push(k + ': ' + j(s0[k]) + ' → ' + j(s1[k]));
    });
    a(changed.length === 0,
      'n7/C3: 推进跑完,localStorage **逐键逐值一致**(实变了 ' + changed.length + ' 键:'
      + (changed.join('、') || '无') + ')—— 按净效应判,不按写次数判');
    a(av.localWrites === 0, 'n7/C3b: 推进内部自报的 localStorage 写计数为 0(实 ' + av.localWrites + ')');
    let raw = null;
    try { raw = LS.getItem(SEED_KEY_NAME); } catch (e) { raw = 'threw'; }
    a(raw === null, 'n7/C3c: 直接查适配器种子键**查不到**(实 ' + j(raw) + ')—— 种子键从不写盘');
  }
  // 3b **如实边界**:探针的临时开关确实会**碰设置键**(写后逐条还原)——
  //    这不是世界数据泄漏(不写 live 存档),但也不该被说成「一次都没碰」。
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const LS = C.LS || global.localStorage;
    let writes = 0;
    const keepSet = LS.setItem;
    try { LS.setItem = function () { writes++; return keepSet.apply(LS, arguments); }; } catch (e) {}
    const t = L.adapterTable({});
    try { LS.setItem = keepSet; } catch (e) {}
    a(t.rows.every(function (r) { return r.cfgRestored !== false; }),
      'n7/C3d: 探针临时开关**逐类还原**过(实 ' + j(t.rows.map(function (r) { return r.cfgRestored; })) + ')');
    const dg = L.diagnose();
    a(writes > 0 && typeof writes === 'number',
      'n7/C3e: **如实承认**探针会写设置键(实 ' + writes + ' 次)—— 代价写在这里:'
      + '「零泄漏」说的是**世界数据**(live 存档 / 种子键),不是「一次都没碰过 localStorage」');
    a(typeof dg.adaptersScope === 'string',
      'n7/C3f: 这份代价在读数里可被复核(范围口径随表回带,实 ' + j(dg.adaptersScope.slice(0, 20)) + ')');
  }
  // 4 通知零泄漏:不注入假通知源,缺席**如实报 absent**
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    //   ⚠ 只取**真源** phoneBridge(engines/phone-bridge.js 提供)。本面曾误读 `WA.notify`,
    //     而那个命名空间无人提供 —— 由 module-cycle-gate 的「未提供」面抓出,本面同上收口。
    const n0 = { pb: !!(WA.phoneBridge) };
    const av = L.advance({ rounds: 2, seed: 1 });
    a(av.notify.hooked === false, 'n7/C4: 推进**不挂钩**任何通知源(实 hooked ' + j(av.notify.hooked) + ')');
    a(av.notify.phoneBridge === n0.pb,
      'n7/C4b: 通知源在场性照实报、且跑前跑后**没被本口改动**(实 '
      + j(av.notify.phoneBridge) + ' / 场上有 ' + j(n0.pb) + ')');
    a(cnt(stripLineComments(rd(C.ENG_REL)), 'WA.notify') === 0,
      'n7/C4e: 只取**真源**命名空间 phoneBridge —— 不读无人提供的 `WA.notify`'
      + '(**代码面**实 ' + j(cnt(stripLineComments(rd(C.ENG_REL)), 'WA.notify')) + ' 处;'
      + '注释里的沿革交代不算引用)'
      + '——module-cycle-gate 的「未提供」面正是钉这一条');
    a(av.notify.note.indexOf('不') >= 0,
      'n7/C4c: 说明句如实交代「不注入假通知源」(实 ' + j(av.notify.note.slice(0, 30)) + ')—— 零泄漏在这里说的是「没有源」/「不替它发」');
    a(cnt(j(av.notify), '已拦截') === 0 && cnt(j(av.notify), '拦下') === 0,
      'n7/C4d: 不冒充「拦住了什么」(实 ' + j([cnt(j(av.notify), '已拦截'), cnt(j(av.notify), '拦下')]) + ')—— 没源就是没源');
  }
  // 5 引擎侧代码面:本面**不开事务、不自造 draft**
  {
    const E = rd(C.ENG_REL);
    const code = stripLineComments(E);
    a(cnt(code, 'store.transact(') === 0,
      'n7/C5: 引擎代码面零 `store.transact(` 调用(实 ' + cnt(code, 'store.transact(') + ')—— 推进全走 exec 面');
    a(/[^.\w]draft\s*=(?!=)/.test(code) === false,
      'n7/C5b: 零自造 draft 赋值(实 ' + (/[^.\w]draft\s*=(?!=)/.test(code) ? '有' : '无') + ')—— 出参 draft 来自 U2 回调');
    a(cnt(code, 'localStorage.setItem') === 0 && cnt(code, 'localStorage.getItem') === 0,
      'n7/C5c: 代码面零直接 localStorage 读写(实 '
      + j([cnt(code, 'localStorage.setItem'), cnt(code, 'localStorage.getItem')]) + ')—— 唯一读写面是 lsOf() 哨兵');
  }
  return runN(a, C);
}// ════ N 段:真源码破坏 + 两向自证 ═══════════════════════════
function runN(a, C) {
  const j = JSON.stringify;
  const rd2 = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
  /**
   * 每一脚都从**同一块空盘**起步:`gate.fresh()` 只复位宿主窗口与设置登记表,
   *   不复位 localStorage;N 段两向是「同一段代码在两个进程态里各跑一遍」。
   *   ⚠ 种世界在 `adapterTable` **之前** —— 破坏 N1 会把真 `store.transact` 永久换掉,
   *     种在之后的话连存档都建不起来,两向就分不开了。
   */
  function mkRun(ov, fn) {
    const env = C.env0(ov || null);
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    WA.worldLab.setSettings({ enabled: true });
    C.seed(WA);
    return fn(env, WA);
  }
  const ENG = function () { return rd2(C.ENG_REL); };
  /** 破坏一件:锚点必须**恰中 1 次**(否则前置失效,如实报红)。 */
  function broke(key, repl) {
    const S = ENG();
    const from = C.ANCHOR[key];
    const n = S.split(from).length - 1;
    if (n !== 1) { a(false, 'n7/Npre: 锚点 ' + key + ' 恰中 1 次(前置失效,实 ' + n + ')'); return null; }
    const b = S.split(from).join(repl);
    if (b === S) { a(false, 'n7/Npre: 锚点 ' + key + ' 破坏后源码**确实变了**(否则两向是同一份)'); return null; }
    const ov = {}; ov[C.ENG_REL] = b;
    return ov;
  }
  // N0 静态面:本模块不引入可执行脚本
  a(cnt(rd2(C.ENG_REL), 'eval(') === 0 && cnt(rd2(C.ENG_REL), 'new Function') === 0,
    'n7/N0: 世界实验室不引入可执行脚本(代码面零 eval / 零 new Function;实 '
    + cnt(rd2(C.ENG_REL), 'eval(') + ' / ' + cnt(rd2(C.ENG_REL), 'new Function') + ')');
  // ── N1 哨兵不还原 ⇒ 真 store.transact 被永久换掉(探针成了它要防的那种东西)──
  {
    const ov = broke('unhook', '    /* [破坏1] 哨兵不还原 */');
    if (ov) {
      function runOnce(o) {
        return mkRun(o, function (env, WA) {
          WA.worldLab.adapterTable({});
          const before = JSON.stringify(WA.store.get());
          let ret = null;
          try { ret = WA.store.transact(function (d) { d.__n1 = 1; }, 'n7:n1'); } catch (e) { ret = String((e && e.message) || e); }
          const after = JSON.stringify(WA.store.get());
          return { realWriteWorks: before !== after, ret: (ret && typeof ret === 'object') ? j(ret) : String(ret) };
        });
      }
      let bad = null, good = null, threw = null;
      try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'n7/N1a: 两版都不抛(实 ' + j(threw) + ')');
      a(good && good.realWriteWorks === true,
        'n7/N1b: (两向)原版跑完表之后,**真 world 写照样落得下去**(实 ' + j(good && good.realWriteWorks) + ')—— 探针没留下任何东西');
      a(bad && bad.realWriteWorks === false,
        'n7/N1c: (两向)不还原哨兵后,跑一次表就把真 `store.transact` **永久换成了干跑桩**、真 world 写再也落不下去(实 '
        + j([bad && bad.realWriteWorks, bad && bad.ret]) + ')—— 探针成了它要防的那种东西');
    }
  }
  // ── N2 探针不把引擎临时开着 ⇒ 读数全是 disabled(跑得通、答的是空话)──
  {
    const ov = broke('enableProbe', '      /* [破坏2] 不临时开引擎 */');
    if (ov) {
      function runOnce(o) {
        return mkRun(o, function (env, WA) {
          const t = WA.worldLab.adapterTable({});
          const av = WA.worldLab.advance({ rounds: 2, seed: 3 });
          return { supported: t.supported.slice(), counts: t.counts,
            plan: av.plan.slice(), disabled: t.disabled.slice() };
        });
      }
      let bad = null, good = null, threw = null;
      try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'n7/N2a: 两版都不抛(实 ' + j(threw) + ')');
      a(good && good.supported.length >= 1 && good.plan.length >= 1,
        'n7/N2b: (两向)原版上至少有一类真支持、计划非空(实 ' + j([good && good.supported, good && good.plan]) + ')');
      a(bad && bad.supported.length === 0 && bad.plan.length === 0,
        'n7/N2c: (两向)不临时开引擎 ⇒ **支持塌成空、计划为空**(实 '
        + j([bad && bad.supported, bad && bad.plan]) + ')—— 跑得通、答的是空话');
      a(bad && bad.counts.disabled === 4,
        'n7/N2d: (两向)四类被如实记成 `skipped-disabled`(实 ' + j(bad && bad.counts.disabled)
        + ')—— 这一档正是为了不把这种情形说成「模块不行」才单列的');
    }
  }
  // ── N3 探针主体取名而非取键 ⇒ 把「能进副本」误判成「推不动」──
  {
    const ov = broke('holderKey', '      const key = clean((people[ks[i]] || {}).name || ks[i], 60);');
    if (ov) {
      function runOnce(o) {
        return mkRun(o, function (env, WA) {
          const t = WA.worldLab.adapterTable({});
          const by = {}; t.rows.forEach(function (r) { by[r.key] = r; });
          return { economy: by.economy.handling, outReason: by.economy.outReason,
            direct: by.economy.directWrites, supported: t.supported.slice() };
        });
      }
      let bad = null, good = null, threw = null;
      try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'n7/N3a: 两版都不抛(实 ' + j(threw) + ')');
      a(good && good.economy === 'skipped-unsafe' && good.direct > 0,
        'n7/N3b: (两向)原版上 economy 拿到了真主体、走到真写口,故判 `skipped-unsafe`(实 '
        + j([good && good.economy, good && good.direct]) + ')');
      a(bad && bad.economy === 'skipped-absent' && bad.outReason === 'missing-holder' && bad.direct === 0,
        'n7/N3c: (两向)取名字之后引擎**找不着人**,如实降级成 `skipped-absent`(实 '
        + j([bad && bad.economy, bad && bad.outReason]) + ')—— 同一个类被说成了另一档');
    }
  }
  // ── N4 种子基线取空 ⇒ seedUnchanged 不再是读数 ──
  {
    const ov = broke('seedBefore', '    const seedBefore = { seed: null, explicit: null };');
    if (ov) {
      function runOnce(o) {
        return mkRun(o, function (env, WA) {
          const av = WA.worldLab.advance({ rounds: 2, seed: 4242 });
          return { seedUnchanged: av.seedUnchanged, before: av.seedBefore, after: av.seedAfter, plan: av.plan.slice() };
        });
      }
      let bad = null, good = null, threw = null;
      try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
      a(threw === null, 'n7/N4a: 两版都不抛(实 ' + j(threw) + ')');
      a(good && good.seedUnchanged === true && good.before === 4242,
        'n7/N4b: (两向)原版基线**真取到了值**、故不变式成立(实 '
        + j([good && good.before, good && good.seedUnchanged]) + ')');
      a(bad && bad.before === null && bad.seedUnchanged === false,
        'n7/N4c: (两向)基线取空 ⇒ 这条不变式**不再成立**(实 '
        + j([bad && bad.before, bad && bad.seedUnchanged]) + ')—— 它咬的是实测差,不是常量');
      a(bad && good && bad.plan.join() === good.plan.join(),
        'n7/N4d: (两向)推进本身**照常跑通**(计划两边一致:'
        + j(bad && bad.plan) + ')—— 缺陷只在不变式这一栏,不是整条链断了');
    }
  }
  // 收尾复核:负控制全程**没有**改到真源码(否则上面两向是同一份文件在比)
  {
    const S = rd2(C.ENG_REL);
    a(S.indexOf('/* [破坏1]') < 0 && S.indexOf('/* [破坏2]') < 0 && S.indexOf('/* unhook removed */') < 0,
      'n7/N5: 负控制全程未改真源码(破坏标记在盘上 0 命中)');
    a(cnt(S, C.ANCHOR.unhook) === 1 && cnt(S, C.ANCHOR.enableProbe) === 1 && cnt(S, C.ANCHOR.holderKey) === 1,
      'n7/N5b: 四枚被破坏的锚点在盘上**各自仍是 1 次**(实 '
      + j([cnt(S, C.ANCHOR.unhook), cnt(S, C.ANCHOR.enableProbe), cnt(S, C.ANCHOR.holderKey)]) + ')');
  }
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nN7 s3-b3-n7-v2223 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}