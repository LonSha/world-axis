#!/usr/bin/env node
// WorldAxis tests/s3-y2-v2201.js — Y2 章节生成工作台专锁（v2.198.0 第二批）
//
// 【计划原文（plans/Y_EXPANSION.md §Y2）逐条对照】
//   要解决的玩家问题：`engines/chapters.js` 面板消费只有 3 处，章节事实上是个
//     「后台概念」：玩家写了半天不知道第几章、本章目标是什么、还欠哪几个待补的因。
//   新功能四条：① 开章（目标 / 已定伏笔 / 本章约束）；② 逐拍推进（每拍显示「按住哪一拍
//     + 待补的因」，来自 `beat-report.buildBlock()` 的**同一真源**）；③ 收章检查
//     （未落的拍、未补的因、未回收的伏笔）；④ 章节与编年史联动（收章即入
//     `chronicle-view`）。
//   边界四条：工作台是**章节流程的界面**，不新增一套并行拍状态（单一真源 = `beat-ledger`）；
//     不跨章合并判定；收章**不得自动清理玩家数据**；与 Y1 共享数据**不得双写**。
//   验收四条：① 开章→推进→收章全链在面板可完成，且每步有重载后仍成立的读数；
//     ② 中段拒绝（闸门卡、拍号不符）能显示原因与下一步；③ 与 Y1 数值同源
//     （同一拍在两页必须相同）；④ 无头测试 + 至少一组真实宿主路径。
//
// 【本锁对计划原文的**两处如实偏离**（写在最前，不藏）】
//   偏离 1「开章」不做成表单、不做成写按钮。计划 ① 的三个输入（目标 / 已定伏笔 /
//     本章约束）里，`script` / `notes` 两栏**在产品里没有任何写口**
//     （`WA.chapters.start(title, opts)` 只在战役页被调，且只传 title）——
//     本页要做表单就必须新增一个写口。首版决定**不做**：本页给「开章前该看」的读数，
//     写口留在战役页（单一写口，避免两条需要同步的写路径）。这条**列为未兑现项**，
//     由 `README` / 计划交付记录如实写明，不由本锁冒充已兑现。
//   偏离 2「收章即入 chronicle-view」不是本页新增的行为：收章写口仍在战役页，
//     联动是引擎既有链。本锁只判本页**读得到**编年史面（`WA.chronicleView.entries`），
//     不判「入链」—— 那需要一次真收章（会写数据），与本页「只读」的边界冲突。
//
// 【本锁四段】A 静态契约 / B 运行时同刻对照与三态 / C 零写入不变式 / N 负控制两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const SELF_REL = 'tests/s3-y2-v2201.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

/** 破坏锚点：逐字取自产品源码，各恰 1 次（N0 验）。 */
const ANCHOR = {
  page: "{ id: 'chapter', icon: '📖', label: '章节' },",
  renderer: 'chapter: renderChapterWorkbench,',
  out: "$('#wa-chw-out')",
  view: 'const v = WA.beatLedger.view() || {};',
  //   锚点一律取**单行、无分号**的片段：ANCHOR 表的切片终点是行首 `\n};`，
  //   含分号的长串（如 try/catch 整行）会让切片边界与纯度计数互相干扰（实测过）。
  buildBlock: "String(WA.beatReport.buildBlock() || '')",
  guard: "{ page: 'chapter', ids:"
};
// 说明（H5 纯度口径）：本锁的 ANCHOR 表与上面这段说明里，**没有**任何锚点串的第二份
//   字面量；下面 N 段的 `to` 与 judge 会再引用一次同一串，那是负控制的正常构造，
//   故 A8b 的判据面只取 `const ANCHOR = {` 到首个 `};` 的表切片。
const SEG_RENDER_START = '// v2.198.0（Y2）：章节生成工作台 —— 把';
const SEG_RENDER_END = '  // v2.199.0（Y4）：待办中心 —— 把';
const SEG_BIND_START = '// ── v2.198.0（Y2）：章节生成工作台（六枚';
/** 段尾同 Y1 口径：**下一段自己的起点**（Y4 的绑定段头），不是 bindBody 末尾。
 *   远处锚点会让本页判据把 Y4 的段并进来（Y1 锁在 Y4 落盘时实测踩到，100/0 → 99/1）。 */
const SEG_END = '    // ── v2.199.0（Y4）：待办中心（六枚';
/** 章节工作台的**写口**（本页段内出现任何一个即违反边界 1/3/4）。 */
const WRITE_PORTS = ['WA.chapters.start', 'WA.chapters.end', 'WA.beatLedger.plan',
  'WA.beatLedger.land', 'WA.beatLedger.claim', 'WA.genGate.record', 'WA.foreshadow.track',
  'WA.foreshadow.develop', 'WA.foreshadow.resolve', 'WA.foreshadow.recycle',
  'WA.pendingCenter.setSettings', 'WA.planAudit.audit', 'WA.beatFacade.run'];
/** 六枚按钮（面板上真实渲染的那六个；名字与 UI_BINDINGS 同源）。 */
const BTN_IDS = ['wa-chw-open', 'wa-chw-cards', 'wa-chw-close', 'wa-chw-todo', 'wa-chw-history', 'wa-chw-src'];
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
  const segR = P.slice(P.indexOf(SEG_RENDER_START), P.indexOf(SEG_RENDER_END));
  const segB = P.slice(P.indexOf(SEG_BIND_START), P.indexOf(SEG_END));
  a(P.indexOf('function renderChapterWorkbench()') >= 0, 'y2v2201/A1: 渲染器 renderChapterWorkbench 在位');
  a(P.indexOf(SEG_RENDER_START) >= 0 && P.indexOf(SEG_BIND_START) >= 0, 'y2v2201/A1b: 两段段落注释都在位（切片有效）');
  a(P.indexOf(SEG_END) > P.indexOf(SEG_BIND_START) && P.indexOf(SEG_END) > P.indexOf(SEG_RENDER_START),
    'y2v2201/A1d: 段尾锚点在两段段首之后（实 end=' + P.indexOf(SEG_END) + ' / bind=' + P.indexOf(SEG_BIND_START) + '）');
  //  切片蔓延自证：Y2 绑定段里不得出现 Y4 的独占前缀。
  a(cnt(segB, 'wa-td-') === 0 && cnt(segB, 'wa-wps-') === 0,
    'y2v2201/A1e: 绑定段里没有 Y4 的独占前缀（实 td=' + cnt(segB, 'wa-td-') + ' / wps=' + cnt(segB, 'wa-wps-') + '）');
  a(segR.length > 1000 && segB.length > 1000,
    'y2v2201/A1c: 两段切片非空（实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符）—— 切片失效会让下面的扫描在空集上恒真');
  a(P.indexOf(ANCHOR.page) >= 0, 'y2v2201/A2: 页表里有 chapter 页');
  a(P.indexOf(ANCHOR.renderer) >= 0, 'y2v2201/A2b: RENDERERS 里有 chapter → renderChapterWorkbench（页表与渲染器成对）');
  a(D.indexOf(ANCHOR.guard) >= 0, 'y2v2201/A2c: 守卫表新增 chapter 页分组（登记错页比不登记更坏）');
  // ② 页 id 独占：同 id 会让守卫表按页判定各自「通过」，而玩家点到的是另一页的 handler。
  //   现场据此发现过真病：首版用 `wa-cw-*`，与 v2.87.0 因果工作台同 id，
  //   且 `const cwOut` 在同一 bindBody 作用域重复声明（`node --check` 当场报错）。
  a(cnt(P, "'#wa-chw-") >= 6, 'y2v2201/A2d: 本页绑定用独占前缀 wa-chw-（实 ' + cnt(P, "'#wa-chw-") + ' 处）');
  a(cnt(P, 'wa-chw-') > 0 && cnt(P.slice(0, P.indexOf(SEG_RENDER_START)), 'wa-chw-') === 0
    && cnt(P.slice(P.indexOf(SEG_END)), 'wa-chw-') === 0,
    'y2v2201/A2e: wa-chw- 前缀只出现在本页两段切片之间（不污染其它页 —— 过宽替换的现场判据）');
  // ③ 六枚按钮真渲染、真绑定、真登记
  BTN_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1, 'y2v2201/A3: ' + id + ' 在渲染段恰渲染 1 次（实 ' + cnt(segR, 'id="' + id + '"') + '）');
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'y2v2201/A3b: ' + id + ' 的 onclick 绑定恰 1 处（实 ' + cnt(segB, "on('#" + id + "', () => {") + '）');
    a(cnt(D, "'" + id + "'") === 1, 'y2v2201/A3c: ' + id + ' 在 tool-diag 守卫表里恰登记 1 次（实 ' + cnt(D, "'" + id + "'") + '）');
  });
  a(cnt(D, "'wa-chw-out'") === 1, 'y2v2201/A4: 动态读数出口 wa-chw-out 进 dynamic 层');
  // ④ 零写口（边界 1/3/4 的静态面）—— 去注释后扫，且**区分「调用」与「提及」**。
  //   ⚠ 首跑实测（红）：整段包含判断把**玩家可见文案里**的 ``WA.chapters.start``
  //   当成接线 —— 那是「告诉玩家去哪儿写」，正是本仓点名的「提及不是引用」。
  //   故判据分两层：渲染段（纯模板）仍用包含判断；**绑定段用调用形态**
  //   （写口名后紧跟 `(`）：只有真调用会带括号，文案里的名字不会。
  const codeSeg = stripLineComments(segR) + '\n' + stripLineComments(segB);
  //   ⚠ 第二轮实测（又红）：文案里还各有一份**提及** —— 渲染段的
  //   「开章写口在战役页 · ``WA.chapters.start``」与绑定段的
  //   「本页零 ``store.transact```」（那是给玩家看的只读声明）。
  //   故**两段一律用调用形态**判，不再用裸名包含 —— 只有真接线会带左括号。
  const renderCode = stripLineComments(segR);
  const bindCode = stripLineComments(segB);
  const leaked = WRITE_PORTS.filter(function (w) { return renderCode.indexOf(w + '(') >= 0; });
  a(leaked.length === 0, 'y2v2201/A5: 渲染段零写口**调用**（调用形态：名后紧跟左括号；泄漏：' + (leaked.join(',') || '无') + '）');
  const called = WRITE_PORTS.filter(function (w) { return bindCode.indexOf(w + '(') >= 0; });
  a(called.length === 0, 'y2v2201/A5d: 绑定段**零写口调用**（实 ' + (called.join(',') || '无') + '）—— 本页不代落拍、不代收章、不改开关');
  a(renderCode.indexOf('store.transact(') < 0 && bindCode.indexOf('store.transact(') < 0,
    'y2v2201/A5b: 两段零 store.transact**调用**（与 Y1 共享数据不得双写；裸名在文案里出现不算引用）');
  a(codeSeg.indexOf('WA.beatLedger.view()') >= 0 && codeSeg.indexOf('WA.chapters.current()') >= 0,
    'y2v2201/A5c: 去注释后真读口仍在（防自我指涉：判据不许把自己删掉）');
  a(bindCode.indexOf('WA.beatLedger.view()') >= 0 && bindCode.indexOf('WA.chapters.current()') >= 0,
    'y2v2201/A5e: 绑定段真读口**带括号**在场（证明 A5d 不是靠「把所有括号都排除了」蒙过）');
  // ⑤ 单一真源（边界 1）：页面**没有**落拍按钮，且明确指向引擎
  a(codeSeg.indexOf('落拍') >= 0, 'y2v2201/A6: 页面明写「本页不代你落拍」（边界 1 对玩家可见，不是只写在注释里）');
  a(codeSeg.indexOf('WA.beatReport.buildBlock(') >= 0,
    'y2v2201/A6b: 「待补的因」真取 `beatReport.buildBlock()`（计划 ② 点名的**同一真源**，不自己拼一份）');
  a(codeSeg.indexOf('WA.beatLedger.current()') >= 0,
    'y2v2201/A6c: 「按住哪一拍」真取 `beatLedger.current()`（第一行 pending，不按 status 自己猜）');
  // ⑥ 三态话术：关着 ≠ 没有（边界 3 的同族口径）
  a(codeSeg.indexOf('待办中心关着') >= 0, 'y2v2201/A7: 待办面把「关着」与「真的没有」分开写');
  a(codeSeg.indexOf('算不出') >= 0, 'y2v2201/A7b: 本章口径算不出时如实说「算不出」（不拿全书累计冒充本章）');
  a(codeSeg.indexOf('这不代表不欠') >= 0 || codeSeg.indexOf('这一栏') >= 0,
    'y2v2201/A7c: 伏笔面读不出时如实标「这一栏不成立，不代表不欠」');
  a(cnt(codeSeg, '真源') >= 4, 'y2v2201/A7d: 读数逐处标注「真源」（实 ' + cnt(codeSeg, '真源') + ' 处）');
  // ⑦ 锚点纯度（H5）
  //   切片终点必须是**行首**的 `};`：表里 `view` 键的值含 `|| {};`，
  //   用「首个 `};`」会把表尾三个键切在切片之外（首跑实测：view/buildBlock/guard 计 0）。
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'),
    SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    const targetRel = (k === 'guard') ? DIAG_REL : PANEL_REL;
    const tgt = (k === 'guard') ? D : P;
    a(cnt(tgt, ANCHOR[k]) === 1, 'y2v2201/A8: 锚点 ' + k + ' 在 ' + targetRel + ' 恰中 1 次（实 ' + cnt(tgt, ANCHOR[k]) + '）');
    a(cnt(anchorDecl, ANCHOR[k]) === 1, 'y2v2201/A8b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（表外引用不计）');
  });
  a(cnt(anchorDecl, ':') >= 6, 'y2v2201/A8c: ANCHOR 表切片有效（实 ' + cnt(anchorDecl, ':') + ' 个冒号）');
  // ════ B 段：运行时同刻对照 + 三态 ═════════════════════════════════
  function env0() { return gate.fresh({}); }
  function gotoPage(env, page) {
    const dom = env.dom, p = dom.getElementById('wa-panel');
    if (!p) throw new Error('面板未注入');
    const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) throw new Error('找不到「' + page + '」页签 —— 页表里没有它');
    tab.click();
    return dom;
  }
  function clickOut(dom, id, outId) {
    const btn = dom.getElementById(id);
    if (!btn) throw new Error('控件不在场：' + id);
    if (typeof btn.onclick !== 'function') throw new Error('控件无绑定：' + id);
    btn.onclick({ target: btn });
    const out = dom.getElementById(outId);
    return out ? String(out.innerHTML || '') : '';
  }
  const env = env0();
  const WA = env.WA;
  let dom = null;
  try { dom = gotoPage(env, 'chapter'); } catch (e) { a(false, 'y2v2201/B0: ' + e.message); }
  a(!!dom, 'y2v2201/B0b: 章节页可切（页签点击 → renderBody → bindBody 全链真跑）');
  if (dom) {
    // ① 全关态：六枚都不抛，且如实报缺/报关
    WA.beatLedger && WA.beatLedger.setSettings && WA.beatLedger.setSettings({ enabled: false });
    WA.beatReport && WA.beatReport.setSettings && WA.beatReport.setSettings({ enabled: false });
    WA.pendingCenter && WA.pendingCenter.setSettings && WA.pendingCenter.setSettings({ enabled: false });
    dom = gotoPage(env, 'chapter');
    const errsAll = [];
    BTN_IDS.forEach(function (id) {
      try { const t = clickOut(dom, id, 'wa-chw-out'); if (!t.length) errsAll.push(id + ':空读数'); }
      catch (e) { errsAll.push(id + ':' + (e && e.message)); }
    });
    a(errsAll.length === 0, 'y2v2201/B1: 全关态六枚零抛出且都有读数（实问题 ' + (errsAll.join(' | ') || '无') + '）');
    const offTodo = clickOut(dom, 'wa-chw-todo', 'wa-chw-out');
    a(offTodo.indexOf('待办中心关着') >= 0, 'y2v2201/B1b: 关态如实报关，而不是给一个空表（边界 3 同族）');
    // ② 全开 + 同刻对照（验收 ③ 与 Y1 同源）
    LS.clear();
    try { WA.store.init(); } catch (e) {}
    WA.beatLedger.setSettings({ enabled: true, maxRows: 32 });
    WA.beatReport.setSettings({ enabled: true, strikesPerChapter: 3, redesignPerChapter: 1 });
    WA.pendingCenter.setSettings({ enabled: true });
    //   夹具：开一章 → 登记拍序 → 落一拍 → 记一次 setup 判定
    WA.chapters.start('夜航', { script: '让信物到手', notes: '别急着摊牌' });
    WA.beatLedger.plan(['开场', '中段', '收束']);
    WA.beatLedger.land();
    WA.beatReport.report({ verdict: 'setup', chapterKey: '夜航', need: '先让信物到手' });
    dom = gotoPage(env, 'chapter');
    const cur = WA.chapters.current();
    a(!!cur && cur.title === '夜航', 'y2v2201/B2a: 夹具就位（当前章《夜航》，实 ' + j(cur && cur.title) + '）');
    // ② -1 「推进卡点」：按住哪一拍 == 引擎直调值；待补的因 == buildBlock 原文
    const onCards = clickOut(dom, 'wa-chw-cards', 'wa-chw-out');
    const bcur = WA.beatLedger.current();
    a(!!bcur && onCards.indexOf('第 ' + bcur.no + ' 拍') >= 0 && onCards.indexOf(String(bcur.title).slice(0, 16)) >= 0,
      'y2v2201/B2b: **按住这一拍 == 拍账直调值**（同刻对照：面板含「第 ' + bcur.no + ' 拍」与「' + bcur.title + '」）—— 验收 ③');
    const blk = String(WA.beatReport.buildBlock() || '');
    a(blk.length === 0 || onCards.indexOf(blk.slice(0, 60)) >= 0,
      'y2v2201/B2c: **待补的因 == buildBlock() 原文**（同一真源，不自己拼一份）—— 计划 ②');
    // ② -2 与 Y1 数值同源：两页显示的当前拍必须是同一个数
    const beatDom = gotoPage(env, 'beat');
    const onBeat = clickOut(beatDom, 'wa-bt-view', 'wa-bt-out');
    dom = gotoPage(env, 'chapter');
    a(onBeat.indexOf('第 ' + bcur.no + ' 拍') >= 0 && onCards.indexOf('第 ' + bcur.no + ' 拍') >= 0,
      'y2v2201/B2d: 同一拍在两页显示相同（Y1 与 Y2 同源 —— 两页各读一次引擎，不各自缓存）');
    // ② -3 本章口径三态：拍账行不带 chapterKey ⇒ 必须如实说「算不出」
    a(onCards.indexOf('算不出') >= 0,
      'y2v2201/B3a: 本章口径**算不出**时如实说出（拍账行不带章节归属）—— 不拿全书累计冒充本章（边界 2）');
    a(onCards.indexOf('全书累计') >= 0, 'y2v2201/B3b: 同时给全书累计作参考，并标明它不是本章的数');
    // ③ 「开章前该看」：上一章怎么收的 + 本章两栏现场值
    const onOpen = clickOut(dom, 'wa-chw-open', 'wa-chw-out');
    a(onOpen.indexOf('夜航') >= 0, 'y2v2201/B4a: 「开章前该看」报出当前章标题（真源 chapters.current）');
    dom = gotoPage(env, 'chapter');
    // ④ 「收章前欠什么」：未落的拍逐条 + 伏笔停滞（或如实报缺）
    const onClose = clickOut(dom, 'wa-chw-close', 'wa-chw-out');
    a(onClose.indexOf('未落的拍') >= 0, 'y2v2201/B5a: 「收章前欠什么」列出未落的拍');
    a(onClose.indexOf('第 2 拍') >= 0, 'y2v2201/B5b: 未落的拍点名到第 2 拍（引擎真值，不是计数）');
    a(onClose.indexOf('收章按钮') >= 0, 'y2v2201/B5c: 明写本页**不提供收章按钮**（边界 3：收章不得由本页触发）');
    // ⑤ 「本章待办」：开着且读得出 ⇒ 空就是真空（不是「没在读」）
    dom = gotoPage(env, 'chapter');
    const onTodo = clickOut(dom, 'wa-chw-todo', 'wa-chw-out');
    a(onTodo.indexOf('本章待办') >= 0 && onTodo.indexOf('真的没有') + onTodo.indexOf('按归属分组') >= -1,
      'y2v2201/B6a: 待办面在开态下给出结果或明确「真的没有」（两态分得开）');
    // ⑥ 「章节史」：有界说明
    dom = gotoPage(env, 'chapter');
    const onHist = clickOut(dom, 'wa-chw-history', 'wa-chw-out');
    a(onHist.indexOf('第 1 章') >= 0 || onHist.indexOf('当前') >= 0, 'y2v2201/B7a: 章节史给出章节记录');
    a(onHist.indexOf('有界') >= 0, 'y2v2201/B7b: 章节史标明有界上限（「只有这些」与「被裁剪」分得开）');
    // ⑦ 「数据来源」：七个源逐个在场性
    dom = gotoPage(env, 'chapter');
    const onSrc = clickOut(dom, 'wa-chw-src', 'wa-chw-out');
    a(onSrc.indexOf('章节引擎') >= 0 && onSrc.indexOf('拍账') >= 0 && onSrc.indexOf('待办中心') >= 0,
      'y2v2201/B8a: 数据来源逐个列出七个源');
    a(onSrc.indexOf('缺席') >= 0 || onSrc.indexOf('在场') >= 0, 'y2v2201/B8b: 在场/缺席两态显式标出（不拿空表冒充）');
    // ⑧ 编年史面**读得到**（偏离 2 的如实判据：只判读得到，不判「入链」）
    const chronOn = !!(WA.chronicleView && typeof WA.chronicleView.entries === 'function');
    a(chronOn || onSrc.indexOf('编年史') >= 0, 'y2v2201/B9: 编年史视图被本页列为数据来源之一（联动写口不在本页）');
  }
  // ════ C 段：不变式（零写入 + 只读面） ═════════════════════════════
  {
    const env2 = env0();
    const W2 = env2.WA;
    const dom2 = gotoPage(env2, 'chapter');
    W2.beatLedger.setSettings({ enabled: true, maxRows: 32 });
    W2.beatReport.setSettings({ enabled: true });
    W2.pendingCenter.setSettings({ enabled: true });
    W2.chapters.start('第一章', { script: 'x' });
    W2.store.transact(function (d) { d.y2seed = { v: 9 }; }, 'y2:seed');
    W2.beatLedger.plan(['A', 'B', 'C']);
    W2.beatLedger.land();
    const H0 = j(W2.store.get() || {});
    const B0 = j(W2.beatLedger.view());
    const R0 = j(W2.beatReport.view());
    const C0 = j(W2.chapters.current());
    const errs = [];
    BTN_IDS.forEach(function (id) {
      try { clickOut(dom2, id, 'wa-chw-out'); } catch (e) { errs.push(id + ':' + (e && e.message)); }
    });
    a(errs.length === 0, 'y2v2201/C1: 六枚逐个点过零抛出（实 ' + (errs.join(' | ') || '无') + '）');
    a(j(W2.store.get() || {}) === H0, 'y2v2201/C2: **活世界逐字不变**（边界 4：与 Y1 共享数据不得双写）');
    a(j(W2.beatLedger.view()) === B0, 'y2v2201/C2b: 拍账逐字不变（本页不代落拍 —— 单一真源 = beat-ledger）');
    a(j(W2.beatReport.view()) === R0, 'y2v2201/C2c: 拍回报账逐字不变（本页不改判定）');
    a(j(W2.chapters.current()) === C0, 'y2v2201/C2d: 当前章逐字不变（边界 3：本页不代收章、不改章）');
    const st = W2.beatFacade ? W2.beatFacade.stat() : null;
    if (st) {
      a(!st.runs || st.runs === 0, 'y2v2201/C3: 门面 run() 零调用（runs=' + st.runs + '）');
    }
  }

  // ════ N 段：真源码破坏 + 两向自证 ═════════════════════════════════
  const CASES = [
    { n: 1, rel: PANEL_REL, key: 'page', to: '/* 页被删（负控制） */',
      why: '页表删掉 chapter 页 ⇒ 页签不在场，B0 判据必须现形',
      judge: function (src) { return src.indexOf("{ id: 'chapter', icon: '📖', label: '章节' },") < 0; },
      check: 'A2' },
    { n: 2, rel: PANEL_REL, key: 'renderer', to: 'chapter: renderLogs,',
      why: '把 chapter 的渲染器接到 logs ⇒ 页里读不到工作台专属标题',
      judge: function (src) { return src.indexOf('chapter: renderChapterWorkbench,') < 0; },
      check: 'A2b' },
    { n: 3, rel: PANEL_REL, key: 'out', to: "$('#wa-chw-out-x')",
      why: '读数出口 id 改错（渲染了但写不进去）⇒ 六枚按钮的读数必须全空',
      judge: function (src) { return src.indexOf("$('#wa-chw-out')") < 0; },
      check: 'A3' },
    { n: 4, rel: PANEL_REL, key: 'view', to: 'const v = WA.beatLedger.view() || {}; WA.beatLedger.land();',
      why: '往只读口里塞一次 land()（本页代落拍）⇒ C2b 拍账逐字不变必须现形',
      judge: function (src) { return src.indexOf('WA.beatLedger.view() || {}; WA.beatLedger.land();') >= 0; },
      check: 'A5' },
    { n: 5, rel: PANEL_REL, key: 'buildBlock', to: "String(WA.beatReport.diagnose()",
      why: '把「待补的因」改成自拼空串（不再取 buildBlock 同一真源）⇒ A6b 必须现形',
      //   调用形态判：``buildBlock`` 在渲染段的**数据来源文案**里还有一份引用
      //   （那是提及），故「整份源码里没有该串」会在破坏后仍为假（首跑实测 N5a 红）。
      judge: function (src) { return src.indexOf("String(WA.beatReport.buildBlock()") < 0; },
      check: 'A6b' },
    { n: 6, rel: DIAG_REL, key: 'guard', to: "{ page: 'chapterX', ids:",
      why: '守卫表登记到不存在的页 ⇒ 守卫覆盖面查不到这一页',
      judge: function (src) { return src.indexOf("{ page: 'chapter', ids:") < 0; },
      check: 'A2c' }
  ];
  CASES.forEach(function (cs) {
    const S = rd(cs.rel);
    const from = ANCHOR[cs.key];
    const hits = cnt(S, from);
    a(hits === 1, 'y2v2201/N0(' + cs.n + '): 破坏锚点 ' + cs.key + ' 在 ' + cs.rel + ' 恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = S.split(from).join(cs.to);
    a(broken !== S, 'y2v2201/Na(' + cs.n + '): 破坏真的改动了源码文本');
    a(cnt(S, cs.to) === 0, 'y2v2201/Nb(' + cs.n + '): 原版上破坏产物不存在（否则判据是自指的）');
    a(cs.judge(broken) === true, 'y2v2201/N' + cs.n + 'a: ' + cs.why);
    a(cs.judge(S) === false, 'y2v2201/N' + cs.n + 'b: （纯度）原版上同款判据为假 —— 破坏确实改变了源码形态');
  });
  // N7：破坏版**跑产品**两向自证 —— 读数出口 id 改错后按钮还能点，但读数再也写不进去。
  (function () {
    const S = rd(PANEL_REL);
    const from = ANCHOR.out;
    if (cnt(S, from) !== 1) { a(false, 'y2v2201/N7a: 读数出口锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("$('#wa-chw-out-x')");
    const ov = {}; ov[PANEL_REL] = broken;
    let got = null, threw = null;
    try {
      const envB = gate.fresh({ srcOverride: ov });
      const domB = gotoPage(envB, 'chapter');
      got = clickOut(domB, 'wa-chw-cards', 'wa-chw-out');
    } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y2v2201/N7b: 破坏版上点按钮仍不抛（破坏的是读数去处，不是绑定）实 ' + threw);
    a(got !== null && got.length === 0,
      'y2v2201/N7c: （两向）破坏版上读数**为空**（实 ' + j(got && got.length) + ' 字符）—— 判据不是空转');
    const envG = gate.fresh({});
    const domG = gotoPage(envG, 'chapter');
    const good = clickOut(domG, 'wa-chw-cards', 'wa-chw-out');
    a(good.length > 0, 'y2v2201/N7d: （两向）原版上同款操作读数非空（实 ' + good.length + ' 字符）—— 判据区分得开两向');
  })();
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY2 s3-y2-v2201 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
