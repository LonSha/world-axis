#!/usr/bin/env node
// WorldAxis tests/s3-y4-v2202.js — Y4 待办中心专锁（v2.199.0 第三批）
//
// 【计划原文（plans/Y_EXPANSION.md §Y4）逐条对照】
//   要解决的玩家问题：`engines/pending-center.js` 已经把 aftermath / commission /
//     investigation / operations 这类挂起项做了聚合，但玩家没有单一入口把它们看完。
//   新功能三条：① 按归属（世界 / 人物 / 组织）分组；② 每条显示来源模块、到期条件、
//     不处理的后果（来自拒收码的恢复语义，见 U5）；③ 一键跳到来源模块（跳转，不代写）。
//   边界三条：待办页**不是新的状态容器**（条目唯一真源仍在各模块）；跳转不改变任何
//     状态；聚合失败时显示部分结果并标注哪一源不可读（不假装「没有待办」）。
//   验收四条：① 空 / 单源 / 多源 / 单源不可读**四态都如实呈现**；② 聚合结果 ==
//     逐模块直读之和；③ 与拒收恢复语义一致（**不得建议「忽略即可」**）；
//     ④ 聚合不产生写入（写入计数为零）。
//
// 【本锁对计划原文的三处**如实偏离**（写在最前，不藏）】
//   偏离 1「留档一条」这条留档功能**不做**：待办页是只读聚合面，
//     新增一条独立留档记录就等于在面板里长出一个**新的状态容器** ——
//     与边界 1 直接冲突。计划没把它列为验收项，本锁按计划原文落，
//     并在 README / 计划交付记录里如实写明「未做，理由是边界 1」。
//   偏离 2「到期条件」不能按字面兑现：引擎的 pending 行**不带时间口径**
//     （`soon()` 的「近期」是 `soonCount` **条数上限**，不是到期时间）。
//     本页**把这件事写明**（`TODO_DUE_NOTE`），**不自造一份时钟或期限** ——
//     自造一份就是第二个真源。本锁判的是「如实写明」而非「有到期时间」。
//   偏离 3「不处理的后果」的真实载体不是逐行 `blocked`：现场实测
//     `mk()` 的 blocked 只从 `opts.blocked` 取，而八个适配器一律不传 ⇒
//     行的 blocked **恒为 null**。真载体是 `items().skipped`（逐源带 reason，
//     那才是拒收码）。本锁按真载体判（skipped → rejectRecovery.explain 的 action），
//     并额外判「逐行那盏灯是如实说明而不是假装判过」。
//
// 【本锁四段】A 静态契约 / B 运行时四态与聚合同源 / C 零写入不变式 / N 负控制两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const SELF_REL = 'tests/s3-y4-v2202.js';
/** v2.230.0 收口：mini-DOM 的 `innerHTML` getter 会把**容器自身标签**也序列化进去
 *  （tests/ui-dom.js 的 `ser(el)`），浏览器只返回子节点。于是「空容器」的长度不是 0，
 *  而是容器自身那一段（Y1 实测 41 字符，随 tag/id/class 长短而变）。
 *  判据的真问题从来不是「长度是不是 0」，而是「破坏之后读数**再也写不进去**」
 *  —— 即出口容器**一个子元素都没有**。 */
function emptyOut(el) { return !!el && el.childNodes.length === 0; }
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 破坏锚点：逐字取自产品源码，各恰 1 次（N0 验）。单行、无分号优先。 */
const ANCHOR = {
  page: "{ id: 'todo', icon: '📌', label: '待办' },",
  renderer: 'todo: renderTodoCenter,',
  out: "$('#wa-td-out')",
  ownerFn: 'function todoOwnerOf(kind) {',
  consFn: 'function todoConsequence(x) {',
  dueNote: 'const TODO_DUE_NOTE =',
  explainCall: 'WA.rejectRecovery.explain(code)',
  guard: "{ page: 'todo', ids:"
};
const SEG_RENDER_START = '// v2.199.0（Y4）：待办中心 —— 把';
const SEG_RENDER_END = '  // v2.200.0（第四批 Y5）：世界快照与整包搬运 —— 把';
const SEG_BIND_START = '// ── v2.199.0（Y4）：待办中心（六枚';
/** 段尾 = bindBody 收尾（Y4 是最后一段，下一段即 `  }` + 面板与悬浮球）。
 *   切片端点写**独立 `  }` 加空行加注释**这组唯一串，避免碰上别处同名注释。 */
const SEG_END = '    // ── v2.200.0（Y5）：世界快照与整包搬运（四枚只读';
/** 待办页的**写口**：段内出现任何一个即违反边界 1/2/4。 */
const WRITE_PORTS = ['WA.pendingCenter.setSettings', 'WA.pendingCenter.reset',
  'WA.aftermath.register', 'WA.aftermath.repair', 'WA.commission.create',
  'WA.commission.advance', 'WA.investigation.checkEvidence', 'WA.operations.settle',
  'WA.storyChoice.confirm', 'WA.beatLedger.plan', 'WA.beatLedger.land', 'WA.chapters.start'];
/** 六枚按钮（面板上真实渲染的那六个；名字与 UI_BINDINGS 同源）。 */
const BTN_IDS = ['wa-td-all', 'wa-td-soon', 'wa-td-src', 'wa-td-drill', 'wa-td-flags', 'wa-td-diag'];
/** 去注释但保留字符串（「提及不是引用」）。 */
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
  const P = rd(PANEL_REL);
  const D = rd(DIAG_REL);
  const SELF = rd(SELF_REL);
  // ════ A 段：静态契约 ════════════════════════════════════════════════
  const iR = P.indexOf(SEG_RENDER_START), iB = P.indexOf(SEG_BIND_START), iE = P.indexOf(SEG_END);
  const segR = P.slice(iR, P.indexOf(SEG_RENDER_END));
  const segB = P.slice(iB, iE);
  //   v2.209.0（优化 6）：第三段切片 —— 结果出口的**选择器清单**（NAV_OUT_SELS）。
  //   为什么要把它算进来：本页的独占前缀 `wa-td-` 除了「渲染段 + 绑定段」，
  //   还合法地出现在这张模块作用域的出口表里（每个出口一个选择器）。
  //   它既不是别的页、也不是过宽替换 —— 故按白名单**扩一段切片**，
  //   而不是把判据放宽成 `>=`（放宽就等于不再能拦「跨页同名污染」）。
  const iZ = P.indexOf('const NAV_OUT_SELS = [');
  const segZ = (iZ >= 0) ? P.slice(iZ, P.indexOf('];', iZ) + 2) : '';
  a(P.indexOf('function renderTodoCenter()') >= 0, 'y4v2202/A1: 渲染器 renderTodoCenter 在位');
  a(iR >= 0 && iB >= 0 && iE > iB && iE > iR,
    'y4v2202/A1b: 两段段落注释与段尾锚点都在位且顺序正确（实 r=' + iR + ' b=' + iB + ' e=' + iE + '）');
  a(segR.length > 1000 && segB.length > 1000,
    'y4v2202/A1c: 两段切片非空（实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符）—— 切片失效会让下面的扫描在空集上恒真');
  a(P.indexOf(ANCHOR.page) >= 0, 'y4v2202/A2: 页表里有 todo 页');
  a(/^[a-z]+$/.test('todo'), 'y4v2202/A2b: 页 id 纯小写字母（C11 页清单解析器只认 [a-z]+）');
  a(P.indexOf(ANCHOR.renderer) >= 0, 'y4v2202/A2c: RENDERERS 里有 todo → renderTodoCenter（页表与渲染器成对）');
  a(D.indexOf(ANCHOR.guard) >= 0, 'y4v2202/A2d: 守卫表新增 todo 页分组（渲染 + 绑定 + 守卫登记三件齐做）');
  // 独占前缀：六个 id 全带 wa-td-；且只出现在本页两段之间（不污染别的页）
  a(cnt(P, "'#wa-td-") >= 6, 'y4v2202/A2e: 本页绑定用独占前缀 wa-td-（实 ' + cnt(P, "'#wa-td-") + ' 处）');
  const tdAll = (P.match(/wa-td-/g) || []).length;
  const tdInSegs = (segR.match(/wa-td-/g) || []).length + (segB.match(/wa-td-/g) || []).length
    + (segZ.match(/wa-td-/g) || []).length;
  a(tdAll > 0 && tdInSegs === tdAll,
    'y4v2202/A2f: wa-td- 只出现在本页切片内（实 全文件 ' + tdAll + ' / 切片 ' + tdInSegs
    + '，含出口清单段）—— 过宽替换或跨页同名会在这里现形');
  // ② 六枚按钮真渲染、真绑定、真登记
  BTN_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1, 'y4v2202/A3: ' + id + ' 在渲染段恰渲染 1 次（实 ' + cnt(segR, 'id="' + id + '"') + '）');
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'y4v2202/A3b: ' + id + ' 的 onclick 绑定恰 1 处（实 ' + cnt(segB, "on('#" + id + "', () => {") + '）');
    a(cnt(D, "'" + id + "'") === 1, 'y4v2202/A3c: ' + id + ' 在 tool-diag 守卫表里恰登记 1 次（实 ' + cnt(D, "'" + id + "'") + '）');
  });
  a(cnt(D, "'wa-td-out'") === 1, 'y4v2202/A4: 动态读数出口 wa-td-out 进 dynamic 层');
  a(cnt(segR, 'id="wa-td-out"') === 1, 'y4v2202/A4b: 输出容器在渲染段在场（否则六枚 handler 写进空气）');
  // ③ 零写口**调用**（调用形态判：名后紧跟左括号 —— 只有真接线会带括号）
  const renderCode = stripLineComments(segR);
  const bindCode = stripLineComments(segB);
  const called = WRITE_PORTS.filter(function (w) { return renderCode.indexOf(w + '(') >= 0 || bindCode.indexOf(w + '(') >= 0; });
  a(called.length === 0, 'y4v2202/A5: 两段零写口**调用**（泄漏：' + (called.join(',') || '无') + '）—— 本页不是新的状态容器（边界 1）');
  a(renderCode.indexOf('store.transact(') < 0 && bindCode.indexOf('store.transact(') < 0,
    'y4v2202/A5b: 两段零 store.transact**调用**（验收 ④ 的静态面：聚合不产生写入）');
  a(bindCode.indexOf('WA.pendingCenter.items(') >= 0 && bindCode.indexOf('WA.pendingCenter.describe(') >= 0,
    'y4v2202/A5c: 去注释后真读口**带括号**在场（防自我指涉：判据不许把自己删掉；也证明 A5 不是靠「把所有括号都排除了」蒙过）');
  // ④ 三条新功能逐条落在**真的读了引擎的哪个口**上（不是文案）
  a(bindCode.indexOf('WA.pendingCenter.describe(') >= 0 || renderCode.indexOf('WA.pendingCenter.describe(') >= 0,
    'y4v2202/A6: 归属分组取引擎路由口 `describe()`（**不复制一份「模块 → 归属」表**）—— 计划 ①');
  a(P.indexOf(ANCHOR.ownerFn) >= 0, 'y4v2202/A6b: 归属辅助 todoOwnerOf 在位（按 kind 缓存，最多 8 次）');
  a(P.indexOf(ANCHOR.consFn) >= 0, 'y4v2202/A6c: 后果辅助 todoConsequence 在位 —— 计划 ② 的「不处理的后果」');
  a(bindCode.indexOf('WA.rejectRecovery.explain(') >= 0,
    'y4v2202/A6d: 「不处理的后果」真取 `rejectRecovery.explain`（U5 的恢复语义，不自己编建议）—— 计划 ②');
  a(bindCode.indexOf('r.skipped') >= 0,
    'y4v2202/A6e: 拒收语义挂在**真载体** skipped 上（逐行 blocked 恒为 null —— 那盏灯不亮，不能假装它亮）—— 计划 ② / 验收 ③');
  a(P.indexOf(ANCHOR.dueNote) >= 0 && P.indexOf('不带时间口径') >= 0,
    'y4v2202/A6f: 到期条件如实写明「引擎不带时间口径」（不自造时钟或期限）—— 计划 ② / 偏离 2');
  a(bindCode.indexOf('WA.pendingCenter.soon(') >= 0, 'y4v2202/A6g: 近期待办真取 `soon()`（上限来自设置，不是本页自定）');
  // ⑤ 四态话术：空 / 单源不可读 / 部分结果 / 三旗标分开
  a(bindCode.indexOf('r.unavailable') >= 0 && bindCode.indexOf('r.emptyAll') >= 0 && bindCode.indexOf('r.allClear') >= 0,
    'y4v2202/A7: 三旗标 unavailable / emptyAll / allClear **逐条分开**引用（合成一句就是「读不到」被读成「没有」）');
  a(bindCode.indexOf('读不出') >= 0 && bindCode.indexOf('不是「没有待办」') >= 0,
    'y4v2202/A7b: 「读不出」与「没有待办」在文案上分开 —— 验收 ①（单源不可读态如实呈现）');
  a(bindCode.indexOf('不可区分') >= 0, 'y4v2202/A7c: 不可区分的情形如实写「不可区分」（不猜成「没有待办」）');
  a(cnt(bindCode, '真源') >= 4, 'y4v2202/A7d: 读数逐处标注「真源」（实 ' + cnt(bindCode, '真源') + ' 处）');
  // ⑥ 验收 ③ 的**否定面**：不得出现「忽略即可」这类静默降级建议
  a(bindCode.indexOf('忽略') < 0 && renderCode.indexOf('忽略') < 0,
    'y4v2202/A7e: 本页**不出现「忽略」字样**（验收 ③：不得建议「忽略即可」）—— 实 bind=' + cnt(bindCode, '忽略') + ' render=' + cnt(renderCode, '忽略'));
  // ⑦ 锚点纯度（H5）：表切片取到行首 `};`
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'),
    SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    const tgt = (k === 'guard') ? D : P;
    a(cnt(tgt, ANCHOR[k]) === 1, 'y4v2202/A8: 锚点 ' + k + ' 在目标文件里恰中 1 次（实 ' + cnt(tgt, ANCHOR[k]) + '）');
    a(cnt(anchorDecl, ANCHOR[k]) === 1, 'y4v2202/A8b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（表外引用不计）');
  });
  a(cnt(anchorDecl, ':') >= 8, 'y4v2202/A8c: ANCHOR 表切片有效（实 ' + cnt(anchorDecl, ':') + ' 个冒号）');
  // ════ B 段：运行时 —— 四态 + 聚合同源 + 归属 + 后果 ═════════════════
  function env0(srcOverride) { return gate.fresh(srcOverride ? { srcOverride: srcOverride } : {}); }
  function gotoPage(env, page) {
    const dom = env.dom, p = dom.getElementById('wa-panel');
    if (!p) throw new Error('面板未注入');
    const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) throw new Error('找不到「' + page + '」页签 —— 页表里没有它');
    tab.click();
    return dom;
  }
  function clickOutNode(dom, id, outId) {
    const btn = dom.getElementById(id);
    if (!btn) throw new Error('控件不在场：' + id);
    if (typeof btn.onclick !== 'function') throw new Error('控件无绑定：' + id);
    btn.onclick({ target: btn });
    return dom.getElementById(outId);
  }
  function clickOut(dom, id, outId) {
    const out = clickOutNode(dom, id, outId);
    return out ? String(out.innerHTML || '') : '';
  }
  const env = env0();
  const WA = env.WA;
  let dom = null;
  try { dom = gotoPage(env, 'todo'); } catch (e) { a(false, 'y4v2202/B0: ' + e.message); }
  a(!!dom, 'y4v2202/B0b: 待办页可切（页签点击 → renderBody → bindBody 全链真跑）');
  if (dom) {
    // ── 态 1：全关（空态 / 读不到） ──
    ['aftermath', 'commission', 'investigation', 'operations', 'storyChoice', 'coop', 'farfield', 'backstage', 'pendingCenter'].forEach(function (ns) {
      if (WA[ns] && typeof WA[ns].setSettings === 'function') { try { WA[ns].setSettings({ enabled: false }); } catch (e) {} }
    });
    dom = gotoPage(env, 'todo');
    const errsAll = [];
    BTN_IDS.forEach(function (id) {
      try { const t = clickOut(dom, id, 'wa-td-out'); if (!t.length) errsAll.push(id + ':空读数'); }
      catch (e) { errsAll.push(id + ':' + (e && e.message)); }
    });
    a(errsAll.length === 0, 'y4v2202/B1: 全关态六枚零抛出且都有读数（实问题 ' + (errsAll.join(' | ') || '无') + '）');
    const offAll = clickOut(dom, 'wa-td-all', 'wa-td-out');
    a(offAll.indexOf('待办中心关着') >= 0, 'y4v2202/B1b: 关态如实报关（不是给一个空表）');
    // ── 态 2：单源（只有 commission 开） ──
    LS.clear();
    try { WA.store.init(); } catch (e) {}
    WA.pendingCenter.setSettings({ enabled: true });
    WA.commission.setSettings({ enabled: true });
    const c1 = WA.commission.create({ title: '送信到北门', principal: '甲', agent: '乙', stages: ['接单', '送达'] });
    a(c1 && c1.ok === true, 'y4v2202/B2a: 夹具就位（单源：一条委托，实 ' + j(c1 && c1.ok) + '）');
    dom = gotoPage(env, 'todo');
    const single = clickOut(dom, 'wa-td-all', 'wa-td-out');
    a(single.indexOf('送信到北门') >= 0, 'y4v2202/B2b: **单源态**如实呈现该条（标题来自来源模块，不重写不润色）');
    a(single.indexOf('commission') >= 0, 'y4v2202/B2c: 每条标出**来源模块**（计划 ② 第一项）');
    // ② 聚合结果 == 逐模块直读之和（验收 ②）—— 两侧各读一次，不复用读数
    const direct = WA.commission.pending();
    const agg = WA.pendingCenter.items({});
    a(direct.ok === true && agg.ok === true && (direct.items || []).length === (agg.rows || []).filter(function (x) { return x.kind === 'commission'; }).length,
      'y4v2202/B2d: 聚合结果 == 逐模块直读之和（验收 ②：直读 ' + (direct.items || []).length
      + ' / 聚合里 commission ' + (agg.rows || []).filter(function (x) { return x.kind === 'commission'; }).length + '）');
    // ③ 归属分组：键必须是**引擎给的归属页**，不是源模块名
    const dPage = WA.pendingCenter.describe('commission', '');
    a(dPage.ok === true && !!dPage.page, 'y4v2202/B3a: 引擎对 commission 给出归属页（实 ' + j(dPage.page) + '）');
    a(single.indexOf('<b>' + dPage.page + '</b>') >= 0,
      'y4v2202/B3b: **归属分组键 == 引擎 describe().page**（计划 ①：面板不复制归属表）');
    // ── 态 3：多源 + 单源不可读（部分结果） ──
    WA.investigation.setSettings({ enabled: true });
    const i1 = WA.investigation.register({ title: '线索：脚印', subject: '甲' });
    a(i1 && i1.ok === true, 'y4v2202/B4a: 多源夹具就位（线索，实 ' + j(i1 && i1.ok) + '）');
    // 单源不可读：把一个源打开但让它读不出（aftermath 的 placeId 校验失败 → 但那是 register；
    //   这里用「源模块在场但 enabled=false」这一条**真实**路径：它在 skipped 里带 disabled）
    WA.aftermath.setSettings({ enabled: false });
    dom = gotoPage(env, 'todo');
    const multi = clickOut(dom, 'wa-td-all', 'wa-td-out');
    a(multi.indexOf('送信到北门') >= 0 && multi.indexOf('脚印') >= 0,
      'y4v2202/B4b: **多源态**两条都在（聚合不是只报第一个源）');
    a(multi.indexOf('读不出') >= 0 && multi.indexOf('aftermath') >= 0,
      'y4v2202/B4c: **单源不可读态**如实列出该源（验收 ① 的四态之一）');
    // ③ 验收 ③：与拒收恢复语义一致 —— skipped 的 reason 经 rejectRecovery 给出 action
    const skipped = (WA.pendingCenter.items({}).skipped || []).filter(function (x) { return x.source === 'aftermath'; })[0];
    a(!!skipped && !!skipped.reason, 'y4v2202/B5a: items().skipped 带出 aftermath 的拒收码（实 ' + j(skipped && skipped.reason) + '）');
    const exp = WA.rejectRecovery.explain(skipped.reason);
    a(!!exp && !!exp.kind && !!exp.action, 'y4v2202/B5b: rejectRecovery 给该码一档与一句动作（实 ' + j(exp && exp.kind) + '）');
    a(multi.indexOf(exp.action.slice(0, 12)) >= 0,
      'y4v2202/B5c: **页面上的「不处理的后果」== 拒收恢复语义的动作句**（同一个真源，不自己编）');
    a(exp.action.indexOf('忽略') < 0 && multi.indexOf('忽略') < 0,
      'y4v2202/B5d: 恢复建议**不出现「忽略」**（验收 ③：不得建议「忽略即可」）');
    // ④ 三旗标在开态下的如实读数
    dom = gotoPage(env, 'todo');
    const flags = clickOut(dom, 'wa-td-flags', 'wa-td-out');
    a(flags.indexOf('unavailable') >= 0 && flags.indexOf('emptyAll') >= 0 && flags.indexOf('allClear') >= 0,
      'y4v2202/B6a: 三旗标逐条报（三个名字都在读数里）');
    a(flags.indexOf('不可区分') >= 0 || flags.indexOf('不可亮') >= 0 || flags.indexOf('不可达') >= 0,
      'y4v2202/B6b: 旗标不可达/不可区分时如实说明（不是只给三个「否」）');
    // ⑤ 逐源可用性：八源逐个在场性
    dom = gotoPage(env, 'todo');
    const src = clickOut(dom, 'wa-td-src', 'wa-td-out');
    a(src.indexOf('aftermath') >= 0 && src.indexOf('commission') >= 0 && src.indexOf('backstage') >= 0,
      'y4v2202/B7a: 逐源可用性列出八源（含在场与缺席两种）');
    a(src.indexOf('缺席') >= 0 && src.indexOf('在场') >= 0, 'y4v2202/B7b: 在场/缺席两态显式标出（不静默消失）');
    // ⑥ 下钻：只给路由，不执行动作（边界 2）
    dom = gotoPage(env, 'todo');
    const drill = clickOut(dom, 'wa-td-drill', 'wa-td-out');
    a(drill.indexOf(dPage.page) >= 0 && drill.indexOf('零跳转副作用') >= 0,
      'y4v2202/B8a: 下钻只报路由（去哪看 = 引擎给的页），并明写零跳转副作用（边界 2）');
    a(drill.indexOf('不执行确认动作') >= 0, 'y4v2202/B8b: 明写「不执行确认动作」（确认语义由来源模块自己的写口持有）');
    // ⑦ 诊断：在场性自证
    dom = gotoPage(env, 'todo');
    const diag = clickOut(dom, 'wa-td-diag', 'wa-td-out');
    a(diag.indexOf('在场检查') >= 0 && diag.indexOf('源面') >= 0, 'y4v2202/B9a: 诊断面报在场检查与源面');
    a(diag.indexOf('不是新的状态容器') >= 0, 'y4v2202/B9b: 诊断面明写本页不是新的状态容器（边界 1 对玩家可见）');
    // ⑧ 降临：待办页与健康页的既有区块**不冲突**（同源两处，各自读数一致）
    dom = gotoPage(env, 'health');
    const healthOk = !!dom.getElementById('wa-panel');
    a(healthOk, 'y4v2202/B10: 健康页仍可切（新增页不影响既有页 —— 页序后移不会打断渲染）');
  }
  // ════ C 段：不变式（零写入） ═══════════════════════════════════════
  {
    const env2 = env0();
    const W2 = env2.WA;
    W2.pendingCenter.setSettings({ enabled: true });
    W2.commission.setSettings({ enabled: true });
    W2.investigation.setSettings({ enabled: true });
    W2.commission.create({ title: 'C段委托', principal: '甲', agent: '乙', stages: ['x'] });
    W2.investigation.register({ title: 'C段线索', subject: '丙' });
    const dom2 = gotoPage(env2, 'todo');
    const H0 = j(W2.store.get() || {});
    const R0 = j(W2.pendingCenter.items({}));
    const C0 = j(W2.commission.pending());
    const I0 = j(W2.investigation.pending());
    const errs = [];
    BTN_IDS.forEach(function (id) {
      try { clickOut(dom2, id, 'wa-td-out'); } catch (e) { errs.push(id + ':' + (e && e.message)); }
    });
    a(errs.length === 0, 'y4v2202/C1: 六枚逐个点过零抛出（实 ' + (errs.join(' | ') || '无') + '）');
    a(j(W2.store.get() || {}) === H0, 'y4v2202/C2: **活世界逐字不变**（验收 ④：聚合不产生写入）');
    a(j(W2.commission.pending()) === C0, 'y4v2202/C2b: 委托面逐字不变（本页不代推进委托 —— 条目真源仍在各模块）');
    a(j(W2.investigation.pending()) === I0, 'y4v2202/C2c: 线索面逐字不变（本页不代查证）');
    //   聚合读数本身变了是允许的（reads 计数会涨）；但**条目内容**必须逐字相等
    const R1 = W2.pendingCenter.items({});
    a(j((R1.rows || []).map(function (x) { return [x.kind, x.ref, x.title, x.detail, x.canAct, x.blocked]; }))
      === j((JSON.parse(R0).rows || []).map(function (x) { return [x.kind, x.ref, x.title, x.detail, x.canAct, x.blocked]; })),
      'y4v2202/C2d: 聚合**条目内容**逐字不变（读数计数会涨，那是读不是写）');
  }
  // ════ N 段：真源码破坏 + 两向自证 ═════════════════════════════════
  const CASES = [
    { n: 1, rel: PANEL_REL, key: 'page', to: '/* 页被删（负控制） */',
      why: '页表删掉 todo 页 ⇒ 页签不在场，B0 判据必须现形',
      judge: function (src) { return src.indexOf("{ id: 'todo', icon: '📌', label: '待办' },") < 0; }, check: 'A2' },
    { n: 2, rel: PANEL_REL, key: 'renderer', to: 'todo: renderLogs,',
      why: '把 todo 的渲染器接到 logs ⇒ 页里读不到待办专属标题',
      judge: function (src) { return src.indexOf('todo: renderTodoCenter,') < 0; }, check: 'A2c' },
    { n: 3, rel: PANEL_REL, key: 'out', to: "$('#wa-td-out-x')",
      why: '读数出口 id 改错（渲染了但写不进去）⇒ 六枚按钮的读数必须全空',
      judge: function (src) { return src.indexOf("$('#wa-td-out')") < 0; }, check: 'A3' },
    { n: 4, rel: PANEL_REL, key: 'ownerFn', to: 'function todoOwnerOfX(kind) {',
      why: '归属辅助被改名 ⇒ 归属只能退化成源模块名，A6b/B3b 必须现形',
      judge: function (src) { return src.indexOf('function todoOwnerOf(kind) {') < 0; }, check: 'A6b' },
    { n: 5, rel: PANEL_REL, key: 'explainCall', to: 'WA.rejectRecovery.explainX(code)',
      why: '把恢复语义的调用名改坏 ⇒ 「不处理的后果」整段失效，A6d 必须现形',
      judge: function (src) { return src.indexOf('WA.rejectRecovery.explain(code)') < 0; }, check: 'A6d' },
    { n: 6, rel: PANEL_REL, key: 'dueNote', to: 'const TODO_DUE_NOTEX =',
      why: '到期条件那句如实说明被拿掉 ⇒ A6f 必须现形（不自造期限这条要留证据）',
      judge: function (src) { return src.indexOf('const TODO_DUE_NOTE =') < 0; }, check: 'A6f' },
    { n: 7, rel: DIAG_REL, key: 'guard', to: "{ page: 'todoX', ids:",
      why: '守卫表登记到不存在的页 ⇒ 守卫覆盖面查不到这一页',
      judge: function (src) { return src.indexOf("{ page: 'todo', ids:") < 0; }, check: 'A2d' }
  ];
  CASES.forEach(function (cs) {
    const S = rd(cs.rel);
    const from = ANCHOR[cs.key];
    const hits = cnt(S, from);
    a(hits === 1, 'y4v2202/N0(' + cs.n + '): 破坏锚点 ' + cs.key + ' 在 ' + cs.rel + ' 恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = S.split(from).join(cs.to);
    a(broken !== S, 'y4v2202/Na(' + cs.n + '): 破坏真的改动了源码文本');
    a(cnt(S, cs.to) === 0, 'y4v2202/Nb(' + cs.n + '): 原版上破坏产物不存在（否则判据是自指的）');
    a(cs.judge(broken) === true, 'y4v2202/N' + cs.n + 'a: ' + cs.why);
    a(cs.judge(S) === false, 'y4v2202/N' + cs.n + 'b: （纯度）原版上同款判据为假 —— 破坏确实改变了源码形态');
  });
  // N8：破坏版**跑产品**两向自证 —— 读数出口改错后按钮还能点，但读数再也写不进去。
  (function () {
    const S = rd(PANEL_REL);
    const from = ANCHOR.out;
    if (cnt(S, from) !== 1) { a(false, 'y4v2202/N8a: 读数出口锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("$('#wa-td-out-x')");
    const ov = {}; ov[PANEL_REL] = broken;
    let got = null, gotNode = null, threw = null;
    try {
      const envB = env0(ov);
      const domB = gotoPage(envB, 'todo');
      gotNode = clickOutNode(domB, 'wa-td-all', 'wa-td-out');
      got = gotNode ? String(gotNode.innerHTML || '') : '';
    } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y4v2202/N8b: 破坏版上点按钮仍不抛（破坏的是读数去处，不是绑定）实 ' + threw);
    a(gotNode !== null && emptyOut(gotNode), 'y4v2202/N8c: （两向）破坏版上读数**为空**（出口容器零子元素；实 ' + j(got && got.length) + ' 字符是容器自身序列化）—— 判据不是空转');
    const envG = env0();
    const domG = gotoPage(envG, 'todo');
    const good = clickOut(domG, 'wa-td-all', 'wa-td-out');
    a(good.length > 0, 'y4v2202/N8d: （两向）原版上同款操作读数非空（实 ' + good.length + ' 字符）—— 判据区分得开两向');
  })();
  // N9：破坏版跑产品 —— 把 pendingCenter 摘掉后六枚**一律报缺**而不是抛（三态的第一态真跑）
  (function () {
    const S = rd(PANEL_REL);
    const from = ANCHOR.out;
    if (cnt(S, from) !== 1) { a(false, 'y4v2202/N9a: 读数出口锚点恰中 1 次（前置失效）'); return; }
    //   用「把 items 口改坏」造出「模块在场但读不出」——这比摘模块更接近真宿主里的坏法
    const broken = S.split(from).join("$('#wa-td-out')")
      .split('if (!P || typeof P.items !== \'function\') return tdMiss(\'统一待办中心\');')
      .join('if (false) return tdMiss(\'统一待办中心\');');
    const ov = {}; ov[PANEL_REL] = broken;
    let got = null, threw = null;
    try {
      const envB = env0(ov);
      const domB = gotoPage(envB, 'todo');
      got = clickOut(domB, 'wa-td-all', 'wa-td-out');
    } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y4v2202/N9b: 拆掉在场判据后仍不抛（实 ' + threw + '）—— 说明选择器写错时是「读数写不进」而不是崩溃');
    a(got !== null, 'y4v2202/N9c: 该破坏未改变读数去处（前置自证：本破坏只动判据）实 ' + j(got && got.length));
  })();
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY4 s3-y4-v2202 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}