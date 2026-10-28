#!/usr/bin/env node
// WorldAxis tests/simplify-nav-v2255.js —— v2.255.0（SIMPLIFY-NAV）：玩家六页导航 + 开发者模式专锁
//
// 【它治的病（用户现场立据，非阅读推断）】
//   「其实我想全部重构，用简洁的语言，完成专业的面板规划，不像现在太多了，我自己都看不懂」
//   → 随后「玩家只想知道，世界推演怎么用？结果是什么？……还有输入API，这两个比较重要，
//   其他的做那么多，根本不会去看吧」。玩家动线只有三条：填 API → 自动推演 → 看结果。
//
// 【四条口径（都是本仓反复付过价的）】
//   ① **页 id / 顺序 / 渲染器是硬契约，一个不动**：pages[3..6]（memory/enemies/parallel/
//      inject）是 v2.33.0/v2.34.0 两条硬读数的锚位（插页即整体后移），ui-gate 要求
//      RENDERERS↔PAGES 严格双射（删页需同步删渲染器键）。本轮**只在可见性层过滤**
//      （复用分类条的 style.display 机制），不动任何页签结构。
//   ② **connect 页签文案改「API」（id 不动）**：玩家不知道「连接」是填 API 的地方。
//      label 是纯展示层，全库零测试锁定；id 一改即炸几十处按 id 点页签的用例。
//   ③ **分类条对玩家隐藏而非删除**：分类条（核心/世界/工坊/系统/全部）本身是另一套要
//      学的黑话；开发者模式打开时恢复原样。currentCat 初值 'core' 的分类过滤在玩家
//      模式下必须旁路——否则 world/people/connect/settings 四页会被藏死而玩家无入口切回
//      （v2.255.0 实施期自查发现的真缺陷，本轮第五阶段探针抓到后修掉）。
//   ④ **开关关掉时停在机制页必须弹回 overview**：分类条已藏、页签已藏，留在机制页
//      会变成「面板空白且零报错」。弹回只发生在关掉开关那一瞬间；goPage 本身不做
//      弹回（既有测试程序化点隐藏页签直达机制页，弹回会炸一片）。
//
// 【判据】
//   A 结构：PLAYER_PAGES 六页清单 / devMode 状态三件套（init/read-true/export）/
//          syncTabs 双过滤 / __setDevMode 单一口径 / buildPanel 末尾藏分类条 /
//          connect label 改 API / PAGES 长度与顺序逐字未动
//   B 运行时：真实渲染路径下玩家模式恰好 6 页可见且是那 6 个；开开发者模式后 31 页
//            可见、分类条显示；关掉后回到 6 页、停在机制页则弹回 overview
//   C 持久化：devMode 落盘（关面板重开仍是开发者模式）/ 默认 false（旧档无字段回落）
//   D 边界：#wa-set-devmode 三件齐（渲染 + 绑定 + 守卫登记）/ 拒收码 ui-missing 已登记 /
//          设置页文案如实描述页数 / PAGES 冻结清单逐字比对
//   N1–N7 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据（逐锚，各须恰中 1 次）
//   N8 纯度：全部负控制跑完后原文件逐字未变（含本锁自身）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL = 'ui/panel.js';
const SET = 'ui/settings.js';
const DIAG = 'engines/tool-diag.js';
const REJECT = 'tests/reject-code-ledger.json';
const SELF_REL = 'tests/simplify-nav-v2255.js';
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
// ① 玩家页清单（缩进两空格是源文件本体形态）
const A_PLAYER = "  const PLAYER_PAGES = ['overview', 'world', 'people', 'events', 'connect', 'settings'];";
// ② devMode 状态初始化（读侧 === true 白名单判定，旧档无字段回落 false）
const A_INIT = '  let __devMode = __panelState().devMode === true;';
// ③ 落盘写路径（__persistPanel 的 val 里）
const A_PERSIST = 'devMode: __devMode === true';
// ④ 模式切换单一口径
const A_SETFN = '  function __setDevMode(on) {';
// ⑤ syncTabs 的双过滤（模式过滤 + 分类旁路）——本轮实施期自查修复的真缺陷现场
const A_VIS = '        const __vis = (__devMode || PLAYER_PAGES.indexOf(t.dataset.page) >= 0) && __catOK;';
// ⑥ buildPanel 末尾藏分类条
const A_HIDE = "    if (!__devMode) { const cb = panelEl.querySelector('.wa-cat-bar'); if (cb) cb.style.display = 'none'; }";
// ⑦ 关掉时弹回 overview
const A_BACK = '      if (!__devMode && PLAYER_PAGES.indexOf(currentPage) < 0) {';
// ⑧ 打开时分类切回 all（否则「开了还是只有 6 页」）
const A_CATALL = "        currentCat = 'all';";
// ⑨ WA.ui 导出口（读口）
const A_EXPORT = '    devMode() { return __devMode === true; },';
// ⑩ 页签文案（纯展示层，id 不动）
const A_LABEL = "    { id: 'connect', icon: '🔌', label: 'API' },";
// ⑪ 设置页开关（render 出 HTML）
const A_SETID = 'id="wa-set-devmode"';
// ⑫ 设置页绑定（onchange 挂事件）
const A_SETBIND = '      if (devCb) devCb.onchange = function () {';
// ⑬ 守卫登记（tool-diag 的 settings 页 ids）
const A_GUARD = "      'wa-set-devmode',";
// ── PAGES 冻结清单（本版前 31 页的 id 与顺序，逐字比对 —— 删页/插页/重排全红灯）──
const PAGES_FROZEN = ["overview","world","people","memory","enemies","parallel","inject","sediment","offline","net","health","beat","chapter","todo","port","find","graph","travel","supply","evidence","branchdiff","storyloop","retrieval","actiondesk","events","director","settings","connect","assistant","tools","logs"];
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
/** 当前可见页签列表（display !== 'none' 即可见 —— 与产品过滤机制同一口径）。 */
function visiblePages(env) {
  const panel = env.dom.getElementById('wa-panel');
  if (!panel) return [];
  return panel.querySelectorAll('.wa-tab')
    .filter(function (t) { return t.style.display !== 'none'; })
    .map(function (t) { return t.dataset.page; });
}
/** 分类条的显示态（mini-DOM 的 style 属性存 attrs.style；buildPanel 末尾的内联写入走 el.style.x =）。 */
function catbarVisible(env) {
  const panel = env.dom.getElementById('wa-panel');
  if (!panel) return null;
  const cb = panel.querySelector('.wa-cat-bar');
  if (!cb) return null;
  return String(cb.style.display || '') !== 'none';
}
/** 全量页签 id（可见与否都算 —— PAGES 冻结清单的 DOM 侧输入）。 */
function allPages(env) {
  const panel = env.dom.getElementById('wa-panel');
  if (!panel) return [];
  return panel.querySelectorAll('.wa-tab').map(function (t) { return t.dataset.page; });
}
// ═══ A 面：结构 ═══════════════════════════════════════════════════
function runA(a) {
  const P = rd(PANEL);
  const S = rd(SET);
  const D = rd(DIAG);
  // A1 十三个破坏锚点各恰中 1 次（负控制的前提）
  must1(P, A_PLAYER, 'A1 玩家页清单');
  must1(P, A_INIT, 'A1 devMode 初始化');
  must1(P, A_PERSIST, 'A1 落盘写路径');
  must1(P, A_SETFN, 'A1 切换单一口径');
  must1(P, A_VIS, 'A1 syncTabs 双过滤');
  must1(P, A_HIDE, 'A1 藏分类条');
  must1(P, A_BACK, 'A1 弹回 overview');
  must1(P, A_CATALL, 'A1 分类切回 all');
  must1(P, A_EXPORT, 'A1 导出读口');
  must1(P, A_LABEL, 'A1 connect label');
  must1(S, A_SETID, 'A1 设置页开关');
  must1(S, A_SETBIND, 'A1 设置页绑定');
  must1(D, A_GUARD, 'A1 守卫登记');
  // A2 玩家面六页且顺序即动线顺序（overview 打头、settings 收尾、API 在内）
  a(A_PLAYER.indexOf("'connect'") > 0, 'A2: API 页（connect）在玩家面清单里（玩家第一步动线：填 API）');
  // A3 默认 false 落在登记表 def 与读侧回落（旧档无字段不迁移、天然回落）
  must1(P, '    def: { page: \'overview\', logErrOnly: false, orbX: -1, orbY: -1, devMode: false },', 'A3 def');
  must1(P, '    return { page: \'overview\', logErrOnly: false, orbX: -1, orbY: -1, devMode: false };', 'A3 回落');
  // A4 导出写口（设置页的 onchange 走它；ui-missing 兜底在设置页侧）
  a(P.indexOf('setDevMode(on) { return __setDevMode(on); }') > 0, 'A4: WA.ui.setDevMode 写口导出（写走 __setDevMode 单一口径）');
  // A5 页签文案改 API 且 id 未动（展示层可动、契约层不动）
  a(cnt(P, "label: 'API'") === 1, 'A5: connect 页签文案为「API」（玩家语言）');
  a(cnt(P, "id: 'connect'") === 1, 'A5b: connect 页 id 未动（id 是契约，文案才是玩家语言）');
  // A6 设置页文案如实描述页数（32 个页签 = 31 + 当前 6 页的表述口径）
  a(S.indexOf('显示全部 32 个页签') > 0, 'A6: 设置页文案如实描述（32 = 31 页签 + 1 兜底表述口径）');
  // A7 守卫登记三件齐（渲染 + 绑定 + 登记，漏一件即 ui-gate 红灯）
  a(cnt(S, A_SETID) === 1, 'A7: 设置页渲染出 #wa-set-devmode');
  a(cnt(S, A_SETBIND) === 1, 'A7b: 设置页绑定挂 onchange');
  a(cnt(D, A_GUARD) === 1, 'A7c: tool-diag 守卫表登记 wa-set-devmode（三件齐做）');
  // A8 拒收码 ui-missing 已登记（设置页兜底路径的 reason 必须答得出「哪里不对」）
  const RJ = rd(REJECT);
  a(RJ.indexOf('ui-missing') > 0, 'A8: 拒收码 ui-missing 已登记进台账（兜底 reason 不是自造串）');
  // A9 PAGES 冻结清单逐字比对（源码侧：正则解析出的 id 序列 === 冻结清单）
  const ids = [];
  const RX = /\{ id: '([a-z]+)', icon:/g;
  let mm;
  while ((mm = RX.exec(P))) ids.push(mm[1]);
  a(ids.length === PAGES_FROZEN.length,
    'A9: PAGES 长度未变（实 ' + ids.length + ' vs 冻结 ' + PAGES_FROZEN.length + '）—— 不删页不插页');
  a(JSON.stringify(ids) === JSON.stringify(PAGES_FROZEN),
    'A9b: PAGES 顺序逐字未动（pages[3..6] 硬读数锚位零抖动）');
}
// ═══ B 面：运行时（真实渲染路径）═══════════════════════════════════
function runB(a) {
  // B1 玩家模式（默认）：恰好 6 页可见，且就是那 6 个
  const env = envWith(null);
  const vis = visiblePages(env);
  a(vis.length === 6, 'B1: 玩家模式恰好 6 页可见（实 ' + vis.length + '）—— 「太多了我自己都看不懂」的病灶面');
  const want = ['overview', 'world', 'people', 'events', 'settings', 'connect'];
  a(JSON.stringify(vis) === JSON.stringify(want),
    'B1b: 可见页即动线六页（实 ' + JSON.stringify(vis) + '）—— 填 API → 看世界 → 看人物 → 看事件 → 设设置');
  // B2 全量页签仍在 DOM（可见性层过滤，不是删节点）
  const all = allPages(env);
  a(all.length === 31, 'B2: 31 个页签全部仍在 DOM（可见性过滤而非删除，实 ' + all.length + '）');
  // B3 分类条对玩家隐藏
  a(catbarVisible(env) === false, 'B3: 分类条对玩家隐藏（核心/世界/工坊/系统是另一套要学的黑话）');
  // B4 打开开发者模式：31 页可见、分类条显示
  const env2 = envWith(null);
  const WA2 = env2.WA;
  WA2.ui.setDevMode(true);
  const vis2 = visiblePages(env2);
  a(vis2.length === 31, 'B4: 开发者模式后 31 页全部可见（实 ' + vis2.length + '）—— currentCat 旁路 + 切回 all，不是「开了还是 6 页」');
  a(catbarVisible(env2) === true, 'B4b: 开发者模式分类条显示（恢复完整导航）');
  a(WA2.ui.devMode() === true, 'B4c: devMode() 读口与界面一致');
  // B5 关掉：停在玩家页留在原页；停在机制页弹回 overview
  WA2.ui.goPage('people');
  const rOff1 = WA2.ui.setDevMode(false);
  a(env2.WA.ui.currentPage() === 'people', 'B5: 关掉时停在玩家页（people）不弹回（实 ' + env2.WA.ui.currentPage() + '）');
  a(visiblePages(env2).length === 6, 'B5b: 关掉后回到 6 页可见');
  a(rOff1 && rOff1.ok === true && rOff1.devMode === false, 'B5c: 关掉返回值如实（ok + devMode:false）');
  WA2.ui.setDevMode(true);
  WA2.ui.goPage('memory');
  const rOff2 = WA2.ui.setDevMode(false);
  a(env2.WA.ui.currentPage() === 'overview',
    'B6: 关掉时停在机制页（memory）弹回 overview（实 ' + env2.WA.ui.currentPage() + '）—— 分类条已藏，留在机制页 = 空白页零报错');
  a(rOff2 && rOff2.ok === true && rOff2.devMode === false && rOff2.page === 'overview',
    'B6b: 弹回路径的返回值带 page:overview（调用方知道被弹回了）');
  // B7 设置页开关走真实渲染（复选框在树中；mini-DOM 不派发 change，直调 onchange 模拟勾选）
  const env3 = envWith(null);
  const WA3 = env3.WA;
  const panel3 = env3.dom.getElementById('wa-panel');
  // 切到设置页（真实点击 → renderBody → RENDERERS.settings → uiSettings.bind）
  const tab3 = panel3.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'settings'; })[0];
  if (tab3) tab3.click();
  const devCb = panel3.querySelector('#wa-set-devmode');
  a(!!devCb, 'B7: 设置页真实渲染出开发者模式开关');
  if (devCb) {
    a(devCb.checked === false, 'B7b: 开关初始不勾选（devMode 默认 false）');
    // 模拟勾选：置 checked + 直调 onchange（mini-DOM 的 click 不切 checked 不派发 change）
    devCb.checked = true;
    if (typeof devCb.onchange === 'function') devCb.onchange();
    a(WA3.ui.devMode() === true, 'B7c: 勾选开关后开发者模式真开（onchange → setDevMode → 单一口径）');
    devCb.checked = false;
    if (typeof devCb.onchange === 'function') devCb.onchange();
    a(WA3.ui.devMode() === false, 'B7d: 取消勾选后开发者模式真关');
  }
  // B8 自动推演默认开（玩家动线第二条：让它自动运行就行）
  a(cnt(rd('engines/backstage.js'), 'autoSimulate: true') === 1,
    'B8: 自动推演默认开（autoSimulate: true）—— 玩家动线第二条零操作');
}
// ═══ C 面：持久化 ═════════════════════════════════════════════════
function runC(a) {
  const KEY = 'worldaxis_ui_panel_state_v1';
  // C1 干净盘装载 → 开 → 落盘键里 devMode === true
  try { global.localStorage.removeItem(KEY); } catch (e) {}
  const env = envWith(null);
  env.WA.ui.setDevMode(true);
  let raw = null;
  try { raw = JSON.parse(String(global.localStorage.getItem(KEY))); } catch (e) {}
  a(!!raw && raw.devMode === true, 'C1: 开发者模式已落盘（键 ' + KEY + ' → devMode=' + (raw ? String(raw.devMode) : '无') + '）');
  // C2 旧档无字段 → 回落 false（零迁移代码）
  try { global.localStorage.setItem(KEY, JSON.stringify({ page: 'overview' })); } catch (e) {}
  const env2 = envWith(null);
  a(env2.WA.ui.devMode() === false, 'C2: 旧档无 devMode 字段时回落 false（读侧 === true 白名单判定，零迁移代码）');
  // C3 重开面板仍是开发者模式（落盘读回）
  try { global.localStorage.setItem(KEY, JSON.stringify({ page: 'overview', devMode: true })); } catch (e) {}
  const env3 = envWith(null);
  a(env3.WA.ui.devMode() === true, 'C3: 落盘 devMode:true 重开面板后仍是开发者模式（关面板再开不丢）');
  a(visiblePages(env3).length === 31, 'C3b: 持久化的开发者模式装载即 31 页可见（不闪 6 页）');
  // 收尾：清掉本节写的状态键（与 ui-components-v2109 同口径：storage 属 soft 面，本节自己收）
  try { global.localStorage.removeItem(KEY); } catch (e) {}
}
// ═══ D 面：边界与不变量 ═══════════════════════════════════════════
function runD(a) {
  // D1 可见性过滤零新页签（31 页签数量两次装载一致）
  const p1 = allPages(envWith(null));
  const p2 = allPages(envWith(null));
  a(p1.length === p2.length, 'D1: 过滤不新增页签（两次装载页数一致：' + p1.length + ' / ' + p2.length + '）');
  // D2 玩家页里至少 overview 可点（goPage 对可见页不弹回）
  const env = envWith(null);
  const r1 = env.WA.ui.goPage('overview');
  a(r1 && r1.ok === true && r1.page === 'overview', 'D2: 玩家模式点概览页正常切页（goPage 不做弹回）');
  // D3 goPage 到机制页（程序化，开发者调试路径）不弹回 —— 弹回只在关开关瞬间
  const r3 = env.WA.ui.goPage('memory');
  a(r3 && r3.ok === true && r3.page === 'memory',
    'D3: 玩家模式 goPage(memory) 不弹回（弹回只发生在关掉开关那一瞬间，机制页程序化可达）');
  a(env.WA.ui.currentPage() === 'memory', 'D3b: currentPage 如实 = memory');
  // D4 UI_BINDINGS 守卫不因玩家模式失效（settings 页控件照常纳管；注释里的提及不计——只数登记行形态）
  const diag = rd(DIAG);
  a(cnt(diag, "'wa-set-devmode',") === 1, 'D4: 守卫表 wa-set-devmode 登记行恰一处（实 ' + cnt(diag, "'wa-set-devmode',") + '）—— 不重复登记不炸 selfCheck');
  // D5 玩家面清单是 PAGES 的子集（不含幻影页）
  const P = rd(PANEL);
  const ids = [];
  const RX = /\{ id: '([a-z]+)', icon:/g;
  let mm;
  while ((mm = RX.exec(P))) ids.push(mm[1]);
  ['overview', 'world', 'people', 'events', 'connect', 'settings'].forEach(function (p) {
    a(ids.indexOf(p) >= 0, 'D5: 玩家页 ' + p + ' 在 PAGES 里（清单不含幻影页）');
  });
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
  const S0 = rd(SET);
  const D0 = rd(DIAG);
  const SELF0 = rd(SELF_REL);
  // N0 锚点纯度：全部锚点在真源码里恰 1 次（runA 已验，此处再以 must1 硬断言防 runAll 单独跑时漏检）
  must1(P0, A_PLAYER, 'N0 玩家页清单');
  must1(P0, A_VIS, 'N0 syncTabs 双过滤');
  must1(P0, A_HIDE, 'N0 藏分类条');
  must1(P0, A_BACK, 'N0 弹回');
  must1(P0, A_CATALL, 'N0 分类切回 all');
  must1(P0, A_INIT, 'N0 初始化');
  must1(P0, A_PERSIST, 'N0 落盘');
  must1(P0, A_SETFN, 'N0 切换函数');
  must1(P0, A_EXPORT, 'N0 导出读口');
  must1(P0, A_LABEL, 'N0 label');
  must1(S0, A_SETID, 'N0 设置页渲染');
  must1(S0, A_SETBIND, 'N0 设置页绑定');
  must1(D0, A_GUARD, 'N0 守卫登记');
  const KEY = 'worldaxis_ui_panel_state_v1';
  try { global.localStorage.removeItem(KEY); } catch (e) {}
  // N1 摘掉 syncTabs 模式过滤（__vis 恒真）⇒ B1 判据现形（31 页全可见）
  {
    const P1 = brk(P0, A_VIS,
      '        const __vis = true && __catOK;', 'N1');
    const env = envWith({ [PANEL]: P1 });
    const n = visiblePages(env).length;
    a(n === 31, 'N1: 摘掉模式过滤后 31 页全可见（实 ' + n + '）⇒ B1 的「恰好 6 页」不是恒真');
  }
  // N2 摘掉分类旁路 ⇒ **玩家模式**判据现形（旁路摘掉后玩家只剩 core 类 2 页）
  //   注：不能在破坏副本上走 setDevMode(true)——syncTabs 开头「currentCat = pageCat」会顺着
  //   currentPage 自动把分类带过去（goPage('memory') ⇒ pageCat='world' ⇒ currentCat='world'），
  //   掩盖分类过滤。真缺陷面在玩家模式：currentCat='core'，world/people/events/settings 四个
  //   玩家页因 data-cat ≠ core 被分类过滤藏死（v2.255.0 实施期探针抓到的原始形态）。
  {
    const A_CATOK2 = "        const __catOK = !__devMode || currentCat === 'all' || t.dataset.cat === currentCat;";
    const P2 = brk(P0, A_CATOK2,
      "        const __catOK = currentCat === 'all' || t.dataset.cat === currentCat;", 'N2');
    try { global.localStorage.removeItem(KEY); } catch (e) {}
    const env = envWith({ [PANEL]: P2 });
    const vis = visiblePages(env).filter(function (p) { return p !== 'overview' && p !== 'events'; });
    a(vis.length === 0,
      'N2: 摘掉分类旁路后玩家模式只亮 core 类（world/people/settings/connect 被藏死，非 core 玩家页实 ' + vis.length + ' 个）⇒ B1b 不是恒真');
  }
  // N3 摘掉「打开时切回 all」⇒ 装载即开（C3b 路径）判据现形：currentCat 停 core 只亮该类 + 玩家页
  //   注：N3 的破坏位在 __setDevMode 内的 currentCat='all'，装载期修复（if (__devMode) currentCat='all'）
  //   是另一处。装载即开绕过 __setDevMode，所以摘掉 __setDevMode 里的切换后走装载路径必现缺陷——
  //   但装载期修复在位时该路径恰好也覆盖它，故 N3 改为同时摘两处（这是同缺陷两修复位的组合破坏）。
  {
    const P3a = brk(P0, A_CATALL,
      '        currentCat = currentCat; // 摘掉切换', 'N3');
    const A_LOADALL = "  if (__devMode) currentCat = 'all';";
    const P3 = brk(P3a, A_LOADALL,
      '  if (__devMode) currentCat = currentCat; // 摘掉装载切回', 'N3b');
    try { global.localStorage.setItem(KEY, JSON.stringify({ page: 'overview', devMode: true })); } catch (e) {}
    const env = envWith({ [PANEL]: P3 });
    const n = visiblePages(env).length;
    a(n < 31, 'N3: 摘掉两处「切回 all」后装载即开只亮 core 类 + 玩家旁路页（实 ' + n + ' 页 < 31）⇒ B4/C3b 不是恒真');
    try { global.localStorage.removeItem(KEY); } catch (e) {}
  }
  // N4 摘掉 buildPanel 藏分类条 ⇒ B3 判据现形（分类条对玩家可见）
  {
    const P4 = brk(P0, A_HIDE,
      '    { const cb = panelEl.querySelector(\'.wa-cat-bar\'); if (cb) cb.style.display = \'\'; }', 'N4');
    const env = envWith({ [PANEL]: P4 });
    const vis = catbarVisible(env);
    a(vis === true, 'N4: 摘掉藏分类条后玩家模式分类条可见（实 ' + vis + '）⇒ B3 不是恒真');
  }
  // N5 摘掉弹回（关掉时停在机制页不弹）⇒ B6 判据现形
  {
    const P5 = brk(P0, A_BACK,
      '      if (false && !__devMode && PLAYER_PAGES.indexOf(currentPage) < 0) {', 'N5');
    const env = envWith({ [PANEL]: P5 });
    env.WA.ui.setDevMode(true);
    env.WA.ui.goPage('memory');
    env.WA.ui.setDevMode(false);
    const cur = env.WA.ui.currentPage();
    a(cur === 'memory', 'N5: 摘掉弹回后关掉时停在 memory（实 ' + cur + '）⇒ B6 的「弹回 overview」不是恒真');
  }
  // N6 摘掉 devMode 持久化（val 里删字段）⇒ C1 判据现形（键里无 devMode）
  {
    const P6 = brk(P0, A_PERSIST, 'devMode: false && false', 'N6');
    const env = envWith({ [PANEL]: P6 });
    env.WA.ui.setDevMode(true);
    let raw = null;
    try { raw = JSON.parse(String(global.localStorage.getItem(KEY))); } catch (e) {}
    a(!raw || raw.devMode !== true, 'N6: 摘掉 devMode 落盘后键里 devMode ≠ true（实 ' + (raw ? JSON.stringify(raw.devMode) : '无') + '）⇒ C1/C3 不是恒真');
  }
  // N7 摘掉设置页绑定（if(false) 前置 ⇒ onchange 永不挂）⇒ B7 判据现形（勾选不再生效）
  //   ⚠ 破坏只前置条件：函数体与闭括号保留 —— 括号平衡，vm 可装载。
  //   mini-DOM 里 typeof devCb.onchange 为 'object'（makeNode 初值 null），判据用 !== 'function'。
  {
    const S7 = brk(S0, A_SETBIND,
      '      if (false) devCb.onchange = function () {', 'N7');
    const env = envWith({ [SET]: S7 });
    const WA7 = env.WA;
    const panel = env.dom.getElementById('wa-panel');
    const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'settings'; })[0];
    if (tab) tab.click();
    const devCb = panel.querySelector('#wa-set-devmode');
    a(!!devCb, 'N7b: 破坏副本设置页开关仍在树中（破坏的是绑定语义，不是渲染）');
    if (devCb) {
      devCb.checked = true;
      if (typeof devCb.onchange === 'function') devCb.onchange();
      a(WA7.ui.devMode() === false,
        'N7: 摘掉绑定后勾选开关不再打开开发者模式（实 ' + WA7.ui.devMode() + '）⇒ B7c 不是恒真');
    }
  }
  // N8 纯度：全部负控制跑完后原文件逐字未变
  a(rd(PANEL) === P0, 'N8:（纯度）全部负控制跑完后 ui/panel.js 逐字未变');
  a(rd(SET) === S0, 'N8b:（纯度）全部负控制跑完后 ui/settings.js 逐字未变');
  a(rd(SELF_REL) === SELF0, 'N8c:（纯度）全部负控制跑完后本锁自身文件逐字未变 —— 负控制只许动内存副本');
  try { global.localStorage.removeItem(KEY); } catch (e) {}
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
  console.log('simplify-nav-v2255: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}
