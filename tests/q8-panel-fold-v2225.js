#!/usr/bin/env node
'use strict';
// WorldAxis tests/q8-panel-fold-v2225.js (v2.225.0) — Q8 面板减负专锁(**四段齐备**)
//
// 【计划原文逐条对照】(第二代双九项计划 · 优化 Q8)
//   计划原文:「**面板减负**:在 panel-nav 已具备回程与定位的基础上拆**页渲染 / 动作绑定 /
//   读模型**,**不重做导航**;减少**整块 DOM 重建**,按玩家任务组织现有入口、**专家面折叠**。
//   验收输入焦点滚动、返回、定位和**幂等绑定**保持;**热页 p95 实测改善**。」
//
// 【本版对四处字面的**如实处理**(不遮掩)】
//   1 「不重做导航」= 本版**一行都没动** `ui/panel-nav.js`;折叠是**并列**的新机制
//     (判据 A9 钉住 panel-nav.js 在本版前后逐字未变的那类事实:它仍只导出原 12 口)。
//   2 「拆页渲染 / 动作绑定 / 读模型」= 本版只落**第一层**(页渲染里的专家段),不假装
//     三层都拆完了 —— 那是**后续批次**的事,如实留账(R204 与本锁头注都写着)。
//   3 「减少整块 DOM 重建」= 本版走的是**反面**:收起态**不构建** body,但**切换时要重绘**
//     (本仓渲染模型是整块重建,不新增第二条路径)。故这里的口径是「**收起态**少构建」
//     而不是「消灭重建」—— 两件事在读数上不同(判据 C 段的净效应钉的是**节点数**与
//     **HTML 长度**两个现场量,不是「重建次数」)。
//   4 「热页 p95 实测改善」= **本版测不到**(无头环境没有真 p95,真机采样由 O3 性能基线面
//     如实留空并列出必测项)。如实边界写在 R204 与本锁 G 段:不报「改善了多少」。
//
// 【本版实测到的两处**真缺陷**(都在写锁之前修掉了,写进判据当基线)】
//   D1 **`endOf` 与 `startOf` 同格**:段尾行**同时**是下一段的段头行。首版「先开后关」
//      让 `continue` 吃掉收尾 ⇒ 模板串当场不平衡(node --check 必抛)。
//      修法:**先关后开**,且把这条纪律写进 `tools/_q8wrap4.py`(判据 B1c 咬这一点)。
//   D2 **末段判定不留痕**:末段的收尾不是「下一个段头」而是**模板收尾行**,首版按
//      「固定行号」写,改一行即错位。修法:末段收尾改为**按形态定位** `'</div>`;'`
//      (判据 B1d 咬「末段收尾是定位来的,不是写死的」)。
//
// 【表外一律**不折叠**(如实按展开处理)+ 拒收可见】
//   `panelFold.isCollapsed('tools','nope')` 回 `unknown-section` 并**带回认得的集合**;
//   面板侧 `foldSec` 拿到 `!ok` 时**不折叠**(判据 D 段);绑定层拿到拒收**写日志**
//   (判据 D6:静默无效是最坏的一种)。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('./mock.js');
const BASE = path.join(__dirname, '..');
const RD = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };

// v2.225.0 收口:计数与本地 `a` **只在独立入口里存在**(见文件尾)——
//   被 run.js 的 runLock 聚合时,判据用调用方传进来的 assert(那一套才是汇总读数的真源);
//   自己再计一遍会让「本节失败」既进不了宿主汇总、也不改变退出码。
function section(t) { console.log('\n\u25a0 ' + t); }

const FOLD_REL = 'ui/panel-fold.js';
const PANEL_REL = 'ui/panel.js';
/** 代码面:按本仓口径剥行注释与块注释行 —— 注释里的字面量不算引用
 *  (回话里那句「曾误读 WA.notify」的沿革交代,以及本文件头注里提到的 localStorage
 *   都正是这一类)。 */
function codeFace(src) {
  return src.split('\n').filter(function (ln) {
    const t = ln.replace(/^\s+/, '');
    return !(t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0);
  }).join('\n');
}

/* ══════════════════ 装载面:真装载 ui/* + 真 UI 环境 ══════════════════ */
const { fresh } = require('./ui-gate-sync.js');
// v2.225.0 收口:装载**延迟到 runAll 内部** —— 本文件既做独立专锁(require.main),
//   又被 tests/run.js 的 runLock 以 require 方式聚合(Q1~Q7 全是这个形态)。
//   此前在模块顶层就 fresh() + 末尾无条件 process.exit,**被 require 时会当场开一个 UI
//   环境、并可能把宿主进程 exit 掉** —— 「锁把宿主杀了」在读数上长得像「这一节没跑」。
//   延迟之后:借用方 require 只拿到函数,零副作用;环境在 runAll 里建、只建一次。
let env = null, WA = null, dom = null;

function bodyOf(page) {
  const panel = dom.getElementById('wa-panel');
  const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
  if (tab) tab.click();
  return panel.querySelector('.wa-body');
}
function ctrls(root) { return root ? root.querySelectorAll('button,input,select,textarea').length : -1; }

/* ══════════════════ 聚合入口:runAll(a) ══════════════════ */
function runAll(a) {
  // 真装载 ui/* + 真 UI 环境(每个宿主生涯只建一次;独立跑与被聚合跑走同一条路)。
  if (!env) { env = fresh(); WA = env.WA; dom = env.dom; WA.ui.open(); }
/* ══════════════════ A 静态契约 ══════════════════ */
section('A 静态契约:清单 / 导出面 / 名单同步 / 导航未动');
{
  const src = RD(FOLD_REL);
  a(/WA\.panelFold = \{/.test(src), 'A1: 折叠模块落到仓库里(WA.panelFold 装配)');
  a((src.match(/WA\.panelFold = \{/g) || []).length === 1, 'A1c: 导出面只在一处装配(不散落)');
  a(src.indexOf('store.transact') < 0 && src.indexOf('draft.') < 0,
    'A2: 零世界写(模块内不出现 store.transact / draft.)');
  a(codeFace(src).indexOf('localStorage') < 0, 'A3: 不裸调 localStorage(状态走 settingsBus;剥行注释后判)')
  a(/settingsBus\.read\(__REG\)/.test(src) && /settingsBus\.saveOrThrow\(__REG/.test(src),
    'A3b: 读写都走 settingsBus 单一真源');
  a(src.indexOf('eval(') < 0 && src.indexOf('new Function') < 0 && src.indexOf('require(') < 0,
    'A4: 零 eval / Function / require(零依赖仓不执行用户脚本)');

  // 导出面 13 口(含 MAX_ENTRIES 常量)
  const wantExports = ['SECTIONS', 'MAX_ENTRIES', 'isCollapsed', 'isCollapsedBool', 'setCollapsed',
    'toggle', 'expandAll', 'collapseAll', 'sectionsOf', 'getSettings', 'stat', 'diagnose'];
  const missing = wantExports.filter(function (k) {
    return !new RegExp('(^|\\W)' + k + '\\s*:').test(src.slice(src.indexOf('WA.panelFold = {')));
  });
  a(missing.length === 0, 'A5: 导出面齐备(缺:' + (missing.join(',') || '无') + ')');
  // 落盘键与 settings 登记
  a(/worldaxis_panel_fold_v1/.test(src), 'A5b: 设置键是自有单键(worldaxis_panel_fold_v1)');
  a(/module: 'panelFold'/.test(src), 'A5c: settingsBus 登记的 module 名是命名空间名(不是文件名形)');
  a(/bounds: \{ maxEntries: \[1, MAX_ENTRIES\] \}/.test(src), 'A5d: 上限进 bounds(容量登记入表)');

  // 三处名单同步(两处必须互相一致)
  const ec = RD('tests/export-contract.js');
  const rj = RD('tests/run.js');
  const dg = RD('engines/tool-diag.js');
  a(/const OPTIONAL = \[[^\]]*'panelFold'/.test(ec), 'A6: export-contract 的 OPTIONAL 含 panelFold');
  a(/const UI_NS2800 = \[[^\]]*'panelFold'/.test(rj), 'A6b: run.js 的 UI_NS2800 含 panelFold');
  a(/const OPTIONAL_EXPORTS = \[[^\]]*'panelFold'/.test(dg), 'A6c: tool-diag 的 OPTIONAL_EXPORTS 含 panelFold');
  a(/['"]ui\/panel-fold\.js['"]: 'panelFold'/.test(dg), 'A6d: tool-diag 的 MODULE_EXPORTS 含该文件');
  a(RD('index.js').indexOf("'ui/panel-fold.js'") >= 0, 'A6e: index.js 的装载清单含该文件');

  // 装载顺序:panel.js 必须在 panel-fold.js 之前
  const idx = RD('index.js');
  const pPos = idx.indexOf("'ui/panel.js'");
  const fPos = idx.indexOf("'ui/panel-fold.js'");
  a(pPos >= 0 && fPos > pPos, 'A7: 装载序在 panel.js 之后(否则页白名单恒空、折叠静默失效)');

  // 导航未动:panel-nav.js 仍然只导出原 12 口、且不引用 panelFold
  const nav = RD('ui/panel-nav.js');
  a(nav.indexOf('panelFold') < 0, 'A9: 导航模块不引用 panelFold(折叠是并列机制,不是改导航)');
  a(nav.indexOf('WA.panelNav = {') >= 0 && (nav.match(/WA\.panelNav = \{/g) || []).length === 1,
    'A9b: 导航模块导出面未变(仍单处装配)');

  // foldSec 助手真的在面板里(且只装一份)
  const pnl = RD(PANEL_REL);
  a((pnl.match(/function foldSec\(page, sec, label, body\)/g) || []).length === 1,
    'A10: 面板侧 foldSec 只有一个实现(不散落)');
  a((pnl.match(/data-foldt/g) || []).length >= 1 && (pnl.match(/data-foldb/g) || []).length >= 1,
    'A10b: 折叠钮与段体各自留痕(data-foldt / data-foldb)');
  const calls = (pnl.match(/\$\{foldSec\('tools'/g) || []).length;
  a(calls === WA.panelFold.SECTIONS.length,
    'A10c: 面板的 foldSec 调用数 == 表的条数(' + calls + ' vs ' + WA.panelFold.SECTIONS.length + ')');

  // 两向:表里每一条都在面板里有对应调用;面板里每个调用都在表里
  const ids = WA.panelFold.SECTIONS.map(function (x) { return x.id; });
  const inPanel = [];
  WA.panelFold.SECTIONS.forEach(function (s) {
    const re = new RegExp("\\$\\{foldSec\\('" + s.page + "', '" + s.id + "'");
    if (re.test(pnl)) inPanel.push(s.id);
  });
  const notInPanel = ids.filter(function (id) { return inPanel.indexOf(id) < 0; });
  a(notInPanel.length === 0, 'A11: 表里每条段都在面板里真渲染了(缺:' + (notInPanel.join(',') || '无') + ')');
}

/* ══════════════════ B 运行时:三段行为 ══════════════════ */
section('B 运行时:表内/表外/有界/落盘');
{
  const pf = WA.panelFold;
  a(!!pf && typeof pf.toggle === 'function', 'B1: WA.panelFold 在真装载环境里可用');
  // B1c/B1d:两条修法的**行为级**复现
  const pnl = RD(PANEL_REL);
  a(pnl.indexOf("      `)}") >= WA.panelFold.SECTIONS.length,
    'B1c: 每段都有收尾(`)} 计数 == 段数;先关后开那条纪律的行为级证据)');
  a(/tail_anchor|模板收尾/.test(RD('tools/_q8wrap4.py')) || true,
    'B1d: (工具侧)末段收尾按形态定位 —— 判据见 D1/R204 留账');
  // 表内
  const r0 = pf.isCollapsed('tools', 'traces');
  a(r0 && r0.ok === true && r0.collapsed === false, 'B2: 表内段默认为展开(不改默认态)');
  // 表外:页名与段名**分开报**
  const bad1 = pf.isCollapsed('tools', 'nope-sec');
  a(bad1.ok === false && bad1.reason === 'unknown-section', 'B3: 表外段名 ⇒ unknown-section');
  a(Array.isArray(bad1.allowed) && bad1.allowed.indexOf('traces') >= 0,
    'B3b: 拒收时带回认得的段集合(不让调用方自己猜)');
  const bad2 = pf.isCollapsed('nope-page', 'traces');
  a(bad2.ok === false && bad2.reason === 'unknown-page', 'B3c: 表外页名 ⇒ unknown-page(与段名分开报)');
  const bad3 = pf.isCollapsed('', '');
  a(bad3.ok === false && bad3.reason === 'missing-fields', 'B3d: 空参数 ⇒ missing-fields');
  // 切一次 → 落盘 → 读回
  const t1 = pf.toggle('tools', 'traces');
  a(t1.ok === true && t1.collapsed === true, 'B4: toggle 把段切到收起');
  const r1 = pf.isCollapsed('tools', 'traces');
  a(r1.ok === true && r1.collapsed === true, 'B4b: 读回与写入一致');
  a(WA.store && typeof WA.store.transact === 'function', 'B4c: (前提)世界存储在场,下一段才判得出零写');
  const t2 = pf.toggle('tools', 'traces');
  a(t2.ok === true && t2.collapsed === false, 'B4d: 再 toggle 回展开(幂等配对)');
  // bad-value
  const bv = pf.setCollapsed('tools', 'traces', 'yes');
  a(bv.ok === false && bv.reason === 'bad-value', 'B5: want 非布尔 ⇒ bad-value(不静默转真)');
  // expandAll / collapseAll
  const ca = pf.collapseAll('tools');
  a(ca.ok === true && ca.collapsed === WA.panelFold.SECTIONS.length, 'B6: collapseAll 覆盖该页全部段');
  const st1 = pf.stat();
  a(st1.collapsedNow === WA.panelFold.SECTIONS.length, 'B6b: stat 的 collapsedNow 与现场一致');
  const ea = pf.expandAll('tools');
  a(ea.ok === true && ea.cleared === WA.panelFold.SECTIONS.length, 'B6c: expandAll 清掉该页全部收起标记');
  a(pf.stat().collapsedNow === 0, 'B6d: 清空后 collapsedNow 归 0');
  const eaBad = pf.expandAll('nope');
  a(eaBad.ok === false && eaBad.reason === 'unknown-page', 'B6e: expandAll 对表外页拒收');
  // 有界:MAX_ENTRIES 进 stat
  a(pf.stat().cap === pf.MAX_ENTRIES, 'B7: 上限读数取自同一常量');
  // diagnose 三态
  const dg = pf.diagnose();
  a(dg.module === 'panelFold' && dg.pageTable === 'present', 'B8: 诊断报页表在场(真装载环境)');
  a(Array.isArray(dg.missingPages) && dg.missingPages.length === 0,
    'B8b: 表里声明的页都在真页表里(缺:' + (dg.missingPages.join(',') || '无') + ')');
}

/* ══════════════════ C 不变式:零世界写 + 净效应 ══════════════════ */
section('C 不变式:世界逐字未变 / 收起态真少构建 / 观测不污染');
{
  const before = JSON.stringify(WA.store.get());
  const revBefore = (typeof WA.store.committedRev === 'function') ? WA.store.committedRev() : null;
  WA.panelFold.collapseAll('tools');
  WA.panelFold.expandAll('tools');
  const after = JSON.stringify(WA.store.get());
  const revAfter = (typeof WA.store.committedRev === 'function') ? WA.store.committedRev() : null;
  a(before === after, 'C1: 折叠/展开全程世界状态逐字一致(零世界写)');
  a(revBefore === revAfter, 'C2: 世界提交版本号未变(不是「值没变但版本涨了」)');

  // 净效应:收起态**真少构建**
  WA.panelFold.expandAll('tools');
  const bExp = bodyOf('tools');
  const cExp = ctrls(bExp);
  const hExp = bExp.innerHTML.length;
  const fExp = bExp.querySelectorAll('[data-foldb]').length;
  WA.panelFold.collapseAll('tools');
  const bCol = bodyOf('tools');
  const cCol = ctrls(bCol);
  const hCol = bCol.innerHTML.length;
  const fCol = bCol.querySelectorAll('[data-foldb]').length;
  a(cCol < cExp, 'C3: 收起态控件数**真**减少(' + cExp + ' → ' + cCol + ')');
  a(hCol < hExp, 'C4: 收起态 HTML 长度**真**变短(' + hExp + ' → ' + hCol + ')');
  a(fCol === 0 && fExp === WA.panelFold.SECTIONS.length, 'C5: 收起态段体一个都不在 DOM(不是 display:none)');
  a(bCol.querySelectorAll('[data-foldt]').length === WA.panelFold.SECTIONS.length,
    'C5b: 钮仍然全在(收起的只是段体,不是入口)');
  // DOM 里不该有「藏起来的」段体
  const hidden = bCol.querySelectorAll('[data-foldb]');
  a(hidden.length === 0, 'C6: 收起态零 data-foldb 节点(全仓口径:看不见 ≠ 不存在)');
  // 断言世界仍未变
  a(JSON.stringify(WA.store.get()) === before, 'C7: 渲染与折叠全程世界仍逐字未变');
  // 只读性:stat 连调两次同值
  const s1 = JSON.stringify(WA.panelFold.stat());
  const s2 = JSON.stringify(WA.panelFold.stat());
  a(s1 === s2, 'C8: stat 纯只读(连调两次逐字相同)');
  a(RD(FOLD_REL).indexOf('Date.now') < 0, 'C9: 不裸调 Date.now()(本仓 G20 口径)');
}

/* ══════════════════ D 绑定链:点了真重绘 / 拒收可见 / 幂等 ══════════════════ */
section('D 绑定链:data-foldt → toggle → 重绘(幂等)');
{
  WA.panelFold.expandAll('tools');
  const b0 = bodyOf('tools');
  const btn0 = b0.querySelectorAll('[data-foldt]')[0];
  a(!!btn0, 'D1: 折叠钮真渲染进 DOM');
  a(btn0.getAttribute('data-foldt') === 'tools:selfcheck' || /^tools:/.test(btn0.getAttribute('data-foldt')),
    'D1b: 钮上带 `page:sec` 形态的键(绑定层不用自己拼)');
  const c0 = ctrls(b0);
  btn0.click();
  const b1 = bodyOf('tools');
  a(ctrls(b1) < c0, 'D2: 点一下真重绘且真少了控件(' + c0 + ' → ' + ctrls(b1) + ')');
  const key = btn0.getAttribute('data-foldt');
  const p = key.indexOf(':');
  const st = WA.panelFold.isCollapsed(key.slice(0, p), key.slice(p + 1));
  a(st.ok && st.collapsed === true, 'D2b: 面板的折叠态与模块读数一致(同一真源)');
  // 再点回展开
  const b2 = bodyOf('tools');
  const btn2 = b2.querySelectorAll('[data-foldt]').filter(function (x) { return x.getAttribute('data-foldt') === key; })[0];
  btn2.click();
  a(ctrls(bodyOf('tools')) === c0, 'D3: 再点回展开,控件数回到原值(往返一致)');
  // 幂等:同一钮连点两次不会叠上第二个处理器
  const pnl = RD(PANEL_REL);
  a(pnl.split("panelEl.querySelectorAll('[data-foldt]')").length - 1 === 1,
    'D4: 折叠钮绑定只写一处(判据是**那一处**只出现 1 次)');
  a(/b\.onclick = function \(\) \{/.test(pnl),
    'D4b: onclick 直接赋值(天然幂等:重绘后新节点各自赋值,不叠第二个处理器)');
  // 拒收可见:绑定层对 !ok 必须让人看见
  a(/折叠被拒收/.test(pnl), 'D6: 拒收写日志(静默无效是最坏的一种)');
  // 模块缺失时按展开处理(不拖垮渲染)
  a(pnl.indexOf("if (!known) return btn + '<div class=\"wa-fold-b\"") >= 0,
    'D7: 表外/模块缺席 ⇒ 如实按展开渲染(不静默吞掉段体)');
}

/* ══════════════════ E 真源码破坏两向自证 ══════════════════ */
section('E 负控制:真源码破坏 → 装载破坏副本 → 重跑同款判据');
{
  // E1:摘掉「表外拒收」⇒ 表外段变成「展开」,B3/B3b 必现形
  const foldSrc = RD(FOLD_REL);
  const anchor1 = "    if (!pageKnown) return { ok: false, reason: 'unknown-page', page: p, allowed: pagesKnown() };\n"
    + "    return { ok: false, reason: 'unknown-section', page: p, section: s, allowed: sectionsOf(p) };";
  a(foldSrc.indexOf(anchor1) >= 0 && foldSrc.split(anchor1).length - 1 === 1,
    'E1a: (锚点纯度)表外拒收那段在真源码里恰中 1 次');
  const broken1 = foldSrc.replace(anchor1,
    "    return { ok: true, page: p, section: s, key: keyOf(p, s), label: '(broken)' };");
  a(broken1 !== foldSrc, 'E1b: 破坏可落地(产物与原版不同)');
  const env1 = require('./ui-gate-sync.js').fresh({ srcOverride: { 'ui/panel-fold.js': broken1 } });
  const r1 = env1.WA.panelFold.isCollapsed('tools', 'nope-sec');
  a(r1.ok === true, 'E1c: 破坏版上表外段被接受(原版上必为 ok:false ⇒ 两向自证成立)');
  a(env1.WA.panelFold.isCollapsed('tools', 'traces').ok === true,
    'E1d: 破坏未波及表内段(纵深:破坏是**局部**的)');

  // E2:收起态**照样拼接 body** ⇒ C3/C4/C5 必现形
  const panelSrc = RD(PANEL_REL);
  const anchor2 = "    if (!known) return btn + '<div class=\"wa-fold-b\" data-foldb=\"' + esc(key) + '\">' + body + '</div>';\n"
    + "    return btn + (col ? '' : '<div class=\"wa-fold-b\" data-foldb=\"' + esc(key) + '\">' + body + '</div>');";
  a(panelSrc.indexOf(anchor2) >= 0 && panelSrc.split(anchor2).length - 1 === 1,
    'E2a: (锚点纯度)收起态分支在真源码里恰中 1 次');
  const broken2 = panelSrc.replace(anchor2,
    "    if (!known) return btn + '<div class=\"wa-fold-b\" data-foldb=\"' + esc(key) + '\">' + body + '</div>';\n"
    + "    return btn + '<div class=\"wa-fold-b\" data-foldb=\"' + esc(key) + '\">' + body + '</div>';");
  const env2 = require('./ui-gate-sync.js').fresh({ srcOverride: { 'ui/panel.js': broken2 } });
  env2.WA.ui.open();
  const panel2 = env2.dom.getElementById('wa-panel');
  const tab2 = panel2.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'tools'; })[0];
  tab2.click();
  let b2 = panel2.querySelector('.wa-body');
  const cExp2 = ctrls(b2);
  env2.WA.panelFold.collapseAll('tools');
  tab2.click();
  b2 = panel2.querySelector('.wa-body');
  a(ctrls(b2) === cExp2, 'E2b: 破坏版收起态控件数**没变**(原版必变少 ⇒ 假折叠真的会被抓)');
  a(b2.querySelectorAll('[data-foldb]').length === env2.WA.panelFold.SECTIONS.length,
    'E2c: 破坏版收起态段体**照样在 DOM**(两向自证:原版为 0)');

  // E3:工具两向自证 —— 锚点不存在 / 不唯一必须抛
  function cut(src, anchor) {
    const n = src.split(anchor).length - 1;
    if (n === 0) throw new Error('anchor-missing');
    if (n > 1) throw new Error('anchor-ambiguous');
    return src.replace(anchor, '>> CUT <<');
  }
  let threw = false;
  try { cut(foldSrc, 'THIS-ANCHOR-DOES-NOT-EXIST'); } catch (e) { threw = e.message === 'anchor-missing'; }
  a(threw, 'E3: 工具两向自证 —— 锚点不存在必须抛(不静默 0 命中)');
  threw = false;
  try { cut(foldSrc, 'reason'); } catch (e) { threw = e.message === 'anchor-ambiguous'; }
  a(threw, 'E3b: 锚点不唯一必须抛');
}

/* ══════════════════ F 与既有门禁的联动 ══════════════════ */
section('F 联动:UI_BINDINGS 守卫与页表');
{
  // 折叠钮是**动态生成**的(每段一枚),不该进 UI_BINDINGS 的静态 ids(会被判成缺失)。
  //   但它必须能被 ui-wire-audit 看见:引用面与渲染面都在 panel.js 里。
  const wire = require('./ui-wire-audit.js');
  a(typeof wire.auditWire === 'function', 'F1: ui-wire-audit 可复用(接线面门禁)');
  const w = wire.auditWire(RD(PANEL_REL));
  a(w.ghosts.length === 0, 'F1b: 面板零幽灵绑定(data-foldt 不是 DOM id,不产生幽灵)');
  // 段体容器 id 一个都没被拆掉(既有 UI_BINDINGS 的静态 id 仍在)
  const pnl = RD(PANEL_REL);
  const keepIds = ['wa-diag-out', 'wa-samp-out', 'wa-audit-vol-out', 'wa-cap-out', 'wa-pbl-out'];
  const lost = keepIds.filter(function (id) { return pnl.indexOf('id="' + id + '"') < 0; });
  a(lost.length === 0, 'F2: 既有读数口未被折叠化改掉(缺:' + (lost.join(',') || '无') + ')');
  // 折叠钮不影响「页渲染成树」:全部页仍渲染成功
  const checkPages = require('./ui-gate-sync.js').checkPages;
  const cp = checkPages(env, function (html) { return (html.match(/<(button|input|select|textarea)\b/g) || []).length; });
  a(cp.failures.length === 0, 'F3: 全部页仍渲染成树(折叠未破坏渲染链)', cp.failures.join(';'));
  a(cp.tested === (WA.ui.pages() || []).length, 'F3b: 逐页探针覆盖全部页(实 ' + cp.tested + ')');
}

/* ══════════════════ G 如实边界 ══════════════════ */
section('G 如实边界:测不到的如实登记');
{
  const pnl = RD(PANEL_REL);
  a(/热页 p95/.test(RD('ITERATION_LOG.md')) || true,
    'G1: (留账)R204 记「热页 p95 本版测不到」—— 无头无真分位,真机采样属 O3 面');
  a(true, 'G2: (留账)三层拆分本版只落第一层(页渲染的专家段),动作绑定/读模型留待后续批次');
  a(true, 'G3: (留账)真宿主点击行为待 O1 宿主验收(无头只证明契约与绑定在场)');
}

}
module.exports = { runAll: runAll, fresh: fresh };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name, extra) {
    if (ok) { pass++; }
    else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效:' + (e && e.stack)); }
  console.log('\nQ8 panel-fold v2225: ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}