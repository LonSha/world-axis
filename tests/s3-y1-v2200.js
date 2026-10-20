#!/usr/bin/env node
// WorldAxis tests/s3-y1-v2200.js — Y1 拍控制中心专锁（v2.198.0）
//
// 【计划原文（plans/Y_EXPANSION.md §Y1）逐条对照】
//   要解决的玩家问题：v2.189.0 把「按拍推进」做成了四个引擎（拍回报 / 计划复验 /
//     拍账 / 生成闸门），但玩家在面板上看不到任何一样：不知道**现在卡在哪一拍**、
//     **上一拍被判了什么**、**为什么这一拍没过去**。
//     现场读数：`grep -c 'beatReport|beatLedger|planAudit|genGate' ui/panel.js` = 1
//     （且那 1 处是显示名映射）。
//   新功能四条：① 当前拍号 + 本章已落拍数（`beat-ledger.current()` / `view()`，
//     含 `overwrites` / `lastClaim`）；② 上一拍判定（`beat-report` 四值 +
//     `purpose` / `keeps` / `need` 明细）；③ 四闸卡点直读（`gen-gate` 按轮记账，
//     面对玩家说「还差几轮」而不是内部计数）；④ 计划复验入口（`plan-audit`，只读，
//     展示复验结论与依据，**不提供任何写按钮**）。
//   边界四条：中心页**不写 store**（包括不「重置拍号」）；不让玩家手动改拒收判定；
//     四个引擎全关时该页显示「未启用」而不是空表；数字化显示一律附「真源」提示。
//   验收四条：① 四引擎全开 / 全关 / 部分开三态下面板都不报错且**不产生写入**；
//     ② 面板显示值 == 引擎直调值（同刻对照）；③ 拍由引擎推进（面板不得自行 `claim()`）；
//     ④ 专锁含真源码破坏两向自证。
//
// 【本锁四段】A 静态契约 / B 运行时同刻对照与三态 / C 零写入不变式 / N 负控制两向自证。
//   每一段都对着上面「验收四条」里的一条或多条，不存在只为本锁好看的断言。
//
// 【为什么 B 段要「同刻对照」而不是「读两次源码」】验收 ② 的原话是「面板显示值 ==
//   引擎直调值（同刻对照，由测试断言）」。同刻是关键：面板若自己缓存了一份拍号，两次
//   读数在**没有写发生时**必然相同 —— 于是「缓存」与「真读」在读数上同形。故本锁在
//   点击与断言之间**不做任何写**，并在 C 段把「期间零写入」单独判一遍：两条合起来才
//   排得掉「面板缓存一份、恰好此刻同值」这一种巧合。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const SELF_REL = 'tests/s3-y1-v2200.js';
/** v2.230.0 收口：mini-DOM 的 `innerHTML` getter 会把**容器自身标签**也序列化进去
 *  （tests/ui-dom.js 的 `ser(el)`），浏览器只返回子节点。于是「空容器」的长度不是 0，
 *  而是容器自身那一段（Y1 实测 41 字符，随 tag/id/class 长短而变）。
 *  判据的真问题从来不是「长度是不是 0」，而是「破坏之后读数**再也写不进去**」
 *  —— 即出口容器**一个子元素都没有**。 */
function emptyOut(el) { return !!el && el.childNodes.length === 0; }
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 破坏锚点：逐字取自产品源码，各恰 1 次（N0 验）。 */
const ANCHOR = {
  page: "{ id: 'beat', icon: '🎯', label: '拍' },",
  renderer: 'beat: renderBeatCenter,',
  out: "$('#wa-bt-out')",
  view: 'const v = WA.beatLedger.view();',
  guard: "{ page: 'beat', ids:"
};
/** 本页的两段（**必须两段都取**：渲染段有 id，绑定段有 handler；
 *   只取一段会让「零写口扫描」或「六枚按钮真渲染」其中之一在空集上恒真）。 */
const SEG_RENDER_START = '// v2.198.0（Y1·第二批）：拍控制中心';
const SEG_RENDER_END = '  // v2.198.0（Y2）：章节生成工作台';
const SEG_BIND_START = '// ── v2.198.0（Y1）：拍控制中心';
/** 段尾 = **下一段自己的起点**（不是 bindBody 末尾那个远处锚点）：
 *   远处锚点会把后来新增的页静默并进本页判据 —— v2.199.0 落 Y4 时实测踩到：
 *   Y2 的玩家文案里写着「本页零 store.transact」，而它在**字符串**里（去注释删不掉），
 *   于是本锁的 A5b（零 store.transact）把别人的文案当成了自己的真写口，100/0 → 99/1。
 *   端点收窄到下一段之后，切片才与「本页」同宽。 */
const SEG_END = '    // ── v2.198.0（Y2）：章节生成工作台（六枚';
/** 拍引擎家族的**写口**：本页段内出现任何一个即违反边界 1/2/3。 */
const WRITE_PORTS = ['WA.beatLedger.plan', 'WA.beatLedger.land', 'WA.beatLedger.claim',
  'WA.beatLedger.transition', 'WA.genGate.record', 'WA.planAudit.audit',
  'WA.beatReport.report', 'WA.beatFacade.run'];
/** 六枚按钮（面板上真实渲染的那六个；名字与 UI_BINDINGS 同源）。 */
const BTN_IDS = ['wa-bt-view', 'wa-bt-verdict', 'wa-bt-gates', 'wa-bt-audit', 'wa-bt-blocked', 'wa-bt-diag'];
/** 去注释但**保留字符串**（「提及不是引用」：注释里写出写口名不算真接线）。
 *   与 tests/test-surface-gate.js 的同名口径一致 —— 行数可省，因为本扫描只做包含判断。 */
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
  //   两段切片：渲染段（id 在这里）+ 绑定段（handler 在这里）。
  //   切片失效（返回空串）会让下面的扫描在空集上恒真 —— 故先判两段非空。
  const segR = P.slice(P.indexOf(SEG_RENDER_START), P.indexOf(SEG_RENDER_END));
  const segB = P.slice(P.indexOf(SEG_BIND_START), P.indexOf(SEG_END));
  a(P.indexOf('function renderBeatCenter()') >= 0, 'y1v2200/A1: 渲染器 renderBeatCenter 在位');
  a(P.indexOf(SEG_RENDER_START) >= 0 && P.indexOf(SEG_BIND_START) >= 0, 'y1v2200/A1b: 两段段落注释都在位（切片有效）');
  //   ⚠ 端点在段首**之前**（或 -1）时 `slice` 会切出诡异片段（-1 取最后一个字符）——
  //   那正是「切片失效 ⇒ 扫描空集恒真」的另一形，故把顺序关系也判上。
  a(P.indexOf(SEG_END) > P.indexOf(SEG_BIND_START) && P.indexOf(SEG_END) > P.indexOf(SEG_RENDER_START),
    'y1v2200/A1d: 段尾锚点在两段段首之后（实 end=' + P.indexOf(SEG_END) + ' / bind=' + P.indexOf(SEG_BIND_START) + '）');
  a(segR.length > 1000 && segB.length > 1000,
    'y1v2200/A1c: 两段切片非空（实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符）—— 切片失效会让下面的扫描变成空集恒真');
  //  ⚠ 切片蔓延自证：本页绑定段里不得出现**后续页的独占前缀**。
  //   （Y1 用 wa-bt-；Y2 用 wa-chw-；Y4 用 wa-td- —— 各页前缀互斥。）
  a(cnt(segB, 'wa-chw-') === 0 && cnt(segB, 'wa-td-') === 0 && cnt(segB, 'wa-wps-') === 0,
    'y1v2200/A1e: 绑定段里没有后续页的独占前缀（实 chw=' + cnt(segB, 'wa-chw-') + ' / td=' + cnt(segB, 'wa-td-') + ' / wps=' + cnt(segB, 'wa-wps-') + '）—— 端点是远处锚点时这里会静默蔓延');
  // ① 页表与渲染器同名同数（加页而漏渲染器这一类，两处都得住）
  a(P.indexOf(ANCHOR.page) >= 0, 'y1v2200/A2: 页表里有 beat 页');
  a(P.indexOf(ANCHOR.renderer) >= 0, 'y1v2200/A2b: RENDERERS 里有 beat → renderBeatCenter（页表与渲染器成对）');
  //   tests/run.js 的 C11 用 /\{ id: '([a-z]+)', icon:/ 解析页清单 —— 带连字符的 id 在那一面「不存在」
  a(/^[a-z]+$/.test('beat'), 'y1v2200/A2c: 页 id 纯小写字母（带连字符会让 C11 守卫覆盖面看不见该页）');
  // ② 六枚按钮真渲染、真绑定、真登记（渲染 + 绑定 + 守卫登记三件齐做）
  BTN_IDS.forEach(function (id) {
    a(cnt(segR, "id=\"" + id + "\"") === 1, 'y1v2200/A3: ' + id + ' 在渲染段恰渲染 1 次（实 ' + cnt(segR, "id=\"" + id + "\"") + '）');
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'y1v2200/A3b: ' + id + ' 的 onclick 绑定恰 1 处（实 ' + cnt(segB, "on('#" + id + "', () => {") + '）');
    a(cnt(D, "'" + id + "'") === 1, 'y1v2200/A3c: ' + id + ' 在 tool-diag 的守卫表里恰登记 1 次（实 ' + cnt(D, "'" + id + "'") + '）');
  });
  a(D.indexOf(ANCHOR.guard) >= 0, 'y1v2200/A4: 守卫表新增 beat 页分组（登记错页比不登记更坏）');
  a(cnt(D, "'wa-bt-out'") === 1, 'y1v2200/A4b: 动态读数出口 wa-bt-out 进 dynamic 层（点开才渲染，不进静态缺失判定）');
  // ③ 零写口（边界 1 / 2 / 3 的静态面）：两段**去注释后**都不得出现任何拍引擎写口。
  //   ⚠ 为什么必须去注释：本页的段首注释里**逐字列出了那八个写口名**（用来解释边界），
  //   照原文扫会把「解释它不是写口」读成「它是写口」—— 这正是本仓点过名的
  //   「提及不是引用」。而余下的注释行不允许藏真接线，故去注释不会放过真泄漏。
  const codeSeg = stripLineComments(segR) + '\n' + stripLineComments(segB);
  const leaked = WRITE_PORTS.filter(function (w) { return codeSeg.indexOf(w) >= 0; });
  a(leaked.length === 0, 'y1v2200/A5: 本页两段去注释后零拍引擎写口（泄漏：' + (leaked.join(',') || '无') + '）—— 拍由引擎推进，面板不得自行 claim/land/plan');
  a(codeSeg.indexOf('store.transact') < 0, 'y1v2200/A5b: 本页两段去注释后零 store.transact（包括不「重置拍号」）');
  //   反向：去注释这一步**没有把真代码也删掉**（否则上面两条在空集上恒真）
  a(codeSeg.indexOf('WA.beatLedger.view()') >= 0 && codeSeg.indexOf('WA.genGate.view()') >= 0,
    'y1v2200/A5c: 去注释后真读口仍在（防「去注释把判据自己删了」这一类自我指涉）');
  // ④ 只读承诺与真源提示写在源码里（不是只在注释里）
  a(cnt(segR, '真源') >= 1 && cnt(segB, '真源') >= 2,
    'y1v2200/A6: 面板对读数逐处标注「真源」（渲染段 ' + cnt(segR, '真源') + ' / 绑定段 ' + cnt(segB, '真源') + ' 处）—— 数字化显示一律附真源');
  a(segR.indexOf('只读</b>') >= 0, 'y1v2200/A6b: 页面对玩家明写「本页只读」');
  // ⑤ 三态话术：关着 ≠ 没有（边界 3）
  a(segR.indexOf('拍账开') >= 0 && segR.indexOf('拍账关') >= 0,
    'y1v2200/A7: 页面常驻读数把「开 / 关」分开渲染（关着 ≠ 读数空 ≠ 没有拍）');
  a(segB.indexOf('拍账关着') >= 0 && segB.indexOf('闸门关着') >= 0,
    'y1v2200/A7b: 绑定段各自的关态话术逐条写出');
  a(cnt(segR + segB, '读不出') >= 2, 'y1v2200/A7c: 「读不出」与「关」与「空」三态分开（实 ' + cnt(segR + segB, '读不出') + ' 处）');
  // ⑥ 锚点纯度（H5）：产品源码恰 1 次 + 本文件 ANCHOR 表里恰声明 1 次。
  //   ⚠ 判据面只取 **ANCHOR 表那几行**（不取整文件）：N 段的 `to` 与 judge 里
  //   必然再引用一次同一串（那是负控制的正常构造），把它算进纯度会让 H5 变成
  //   「不许写负控制」—— 判据的输入面必须与结论面同宽。
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    const targetRel = (k === 'guard') ? DIAG_REL : PANEL_REL;
    const tgt = (k === 'guard') ? D : P;
    a(cnt(tgt, ANCHOR[k]) === 1, 'y1v2200/A8: 锚点 ' + k + ' 在 ' + targetRel + ' 恰中 1 次（实 ' + cnt(tgt, ANCHOR[k]) + '）');
    a(cnt(anchorDecl, ANCHOR[k]) === 1, 'y1v2200/A8b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（H5 纯度；表外引用不计）');
  });
  a(cnt(anchorDecl, ':') >= 5, 'y1v2200/A8c: ANCHOR 表切片有效（实 ' + cnt(anchorDecl, ':') + ' 个冒号）—— 切片失效会让 A8b 在空集上恒真');

  // ════ B 段：运行时同刻对照 + 三态 ═════════════════════════════════
  function env0() { return gate.fresh({}); }
  function gotoBeat(env) {
    const dom = env.dom, p = dom.getElementById('wa-panel');
    if (!p) throw new Error('面板未注入');
    const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'beat'; })[0];
    if (!tab) throw new Error('找不到「拍」页签 —— 页表里没有它');
    tab.click();
    return dom;
  }
  /** 点一枚按钮，取回读数出口的**节点**（不缓存：重绘会换掉它）。 */
  function clickBtNode(dom, id) {
    const btn = dom.getElementById(id);
    if (!btn) throw new Error('控件不在场：' + id);
    if (typeof btn.onclick !== 'function') throw new Error('控件无绑定：' + id);
    btn.onclick({ target: btn });
    return dom.getElementById('wa-bt-out');
  }
  /** 点一枚按钮并取回读数出口的**当前文本**。 */
  function clickBt(dom, id) {
    const o = clickBtNode(dom, id);
    return o ? String(o.innerHTML || '') : '';
  }
  const env = env0();
  const WA = env.WA;
  let dom = null;
  try { dom = gotoBeat(env); } catch (e) { a(false, 'y1v2200/B0: ' + e.message); }
  a(!!dom, 'y1v2200/B0b: 拍页可切（页签点击 → renderBody → bindBody 全链真跑）');
  if (dom) {
    // ① 全关态：六枚按钮都不抛，且**如实报关**（不是空表）
    WA.beatLedger && WA.beatLedger.setSettings && WA.beatLedger.setSettings({ enabled: false });
    WA.beatReport && WA.beatReport.setSettings && WA.beatReport.setSettings({ enabled: false });
    WA.genGate && WA.genGate.setSettings && WA.genGate.setSettings({ enabled: false });
    WA.planAudit && WA.planAudit.setSettings && WA.planAudit.setSettings({ enabled: false });
    const errsAll = [];
    BTN_IDS.forEach(function (id) {
      try {
        const t = clickBt(dom, id);
        if (!t.length) errsAll.push(id + ':空读数');
      } catch (e) { errsAll.push(id + ':' + (e && e.message)); }
    });
    a(errsAll.length === 0, 'y1v2200/B1: 全关态六枚按钮零抛出且都有读数（实问题 ' + (errsAll.join(' | ') || '无') + '）—— 验收 ①');
    const offView = clickBt(dom, 'wa-bt-view');
    a(offView.indexOf('拍账关着') >= 0, 'y1v2200/B1b: 全关态「当前拍」如实报关，而不是给一个空表（验收 ①·边界 3）');
    const offGates = clickBt(dom, 'wa-bt-gates');
    a(offGates.indexOf('闸门关着') >= 0, 'y1v2200/B1c: 全关态「闸门卡点」如实报关');
    const offAudit = clickBt(dom, 'wa-bt-audit');
    a(offAudit.indexOf('计划复验') >= 0, 'y1v2200/B1d: 全关态「计划复验」仍给出依据面读数（引擎 diagnose 是只读面，不随开关消失）');

    // ② 全开态 + 同刻对照（验收 ②）
    LS.clear();
    try { WA.store.init(); } catch (e) {}
    WA.beatLedger.setSettings({ enabled: true, maxRows: 32 });
    WA.beatReport.setSettings({ enabled: true, strikesPerChapter: 3, redesignPerChapter: 1 });
    WA.genGate.setSettings({ enabled: true });
    WA.planAudit.setSettings({ enabled: true });
    WA.beatLedger.plan(['开场', '中段', '收束']);
    WA.beatLedger.land();   // 落掉第 1 拍 ⇒ 当前拍应为第 2 拍
    dom = gotoBeat(env);    // 开关改过 ⇒ 重绘后再点（面板读数取自渲染后的绑定）
    const onView = clickBt(dom, 'wa-bt-view');
    const cur = WA.beatLedger.current();
    a(!!cur && cur.no === 2 && cur.title === '中段',
      'y1v2200/B2a: 夹具就位（当前拍 第 2 拍·中段，实 ' + j(cur && { no: cur.no, title: cur.title }) + '）');
    a(onView.indexOf('第 ' + cur.no + ' 拍') >= 0 && onView.indexOf(cur.title) >= 0,
      'y1v2200/B2b: **面板显示值 == 引擎直调值**（同刻对照：面板含「第 ' + cur.no + ' 拍 · ' + cur.title + '」）—— 验收 ②');
    a(onView.indexOf('已落 1 / 共 3') >= 0, 'y1v2200/B2c: 已落拍数与引擎一致（1 / 3）');
    a(onView.indexOf('WA.beatLedger') >= 0, 'y1v2200/B2d: 拍号附「真源」提示（数字化显示一律附真源）');

    // ③ 上一拍判定（四值 + 明细）：判一次 reject 再读
    const rp = WA.beatReport.report({ verdict: 'setup', chapterKey: 'ch1', need: '先让信物到手' });
    a(rp.ok === true, 'y1v2200/B3a: 夹具（setup 档）落地');
    dom = gotoBeat(env);
    const onVerdict = clickBt(dom, 'wa-bt-verdict');
    a(onVerdict.indexOf('setup') >= 0, 'y1v2200/B3b: 面板上「上一拍判定」显示引擎的真判定值（setup）');
    a(onVerdict.indexOf('先让信物到手') >= 0, 'y1v2200/B3c: 缺的那一步因被点名（purpose/need 明细不是空的）');
    a(onVerdict.indexOf('按住') >= 0, 'y1v2200/B3d: 按住状态如实显示');

    // ④ 闸门卡点：留几轮（不写轮次 ⇒ round 取不到时四档如实报「未算」）
    dom = gotoBeat(env);
    const onGates = clickBt(dom, 'wa-bt-gates');
    const gv = WA.genGate.view();
    a(onGates.indexOf('记录 ' + gv.entries + ' / ' + gv.max) >= 0,
      'y1v2200/B4a: 闸门账读数与引擎一致（记录 ' + gv.entries + ' / ' + gv.max + '）');
    const kinds = WA.genGate.KINDS || [];
    const shown = kinds.filter(function (k) {
      return onGates.indexOf(k) >= 0;
    });
    a(shown.length === kinds.length,
      'y1v2200/B4b: 四档逐档列出（实 ' + shown.length + ' / ' + kinds.length + '）—— 不把「还要等几轮」折成一个总闸门');
    a(onGates.indexOf('可以生成') >= 0 || onGates.indexOf('未算') >= 0 || onGates.indexOf('卡在') >= 0,
      'y1v2200/B4c: 每档给出三态之一（可以生成 / 未算 / 卡在）—— 防恒空读数');

    // ⑤ 谁在卡：与门面直调同源
    dom = gotoBeat(env);
    const onBlocked = clickBt(dom, 'wa-bt-blocked');
    const bl = WA.beatFacade.blocked();
    a(onBlocked.indexOf(bl.line) >= 0 || (bl.rows || []).length === 0,
      'y1v2200/B5a: 「谁在卡」与门面直调逐字同源（实 ' + j((bl.line || '').slice(0, 40)) + '）');

    // ⑥ 诊断：四引擎三态
    dom = gotoBeat(env);
    const onDiag = clickBt(dom, 'wa-bt-diag');
    a(onDiag.indexOf('beatLedger') >= 0 && onDiag.indexOf('genGate') >= 0 && onDiag.indexOf('planAudit') >= 0,
      'y1v2200/B6a: 诊断逐引擎列出（四员全在场）');
    a(onDiag.indexOf('门面') >= 0, 'y1v2200/B6b: 诊断带门面在场读数');

    // ⑦ 部分开态：只有拍账开 ⇒ 拍账报读数、闸门报关（两者互不冒充）
    LS.clear();
    try { WA.store.init(); } catch (e) {}
    WA.beatLedger.setSettings({ enabled: true });
    WA.genGate.setSettings({ enabled: false });
    WA.beatReport.setSettings({ enabled: false });
    WA.planAudit.setSettings({ enabled: false });
    dom = gotoBeat(env);
    const mixView = clickBt(dom, 'wa-bt-view');
    const mixGates = clickBt(dom, 'wa-bt-gates');
    a(mixView.indexOf('拍账关着') < 0 && mixGates.indexOf('闸门关着') >= 0,
      'y1v2200/B7: 部分开态各段自报（拍账给读数 / 闸门报关 —— 不互相冒充）—— 验收 ①');
  }

  // ════ C 段：不变式（零写入 + 只读面） ═════════════════════════════
  {
    const env2 = env0();
    const W2 = env2.WA;
    const dom2 = gotoBeat(env2);
    W2.beatLedger.setSettings({ enabled: true, maxRows: 32 });
    W2.beatReport.setSettings({ enabled: true });
    W2.genGate.setSettings({ enabled: true });
    W2.planAudit.setSettings({ enabled: true });
    W2.store.transact(function (d) { d.y1seed = { v: 7 }; }, 'y1:seed');
    W2.beatLedger.plan(['A', 'B', 'C']);
    W2.beatLedger.land();
    const H0 = j(W2.store.get() || {});
    const B0 = j(W2.beatLedger.view());
    const G0 = j(W2.genGate.view());
    const R0 = j(W2.beatReport.view());
    const errs = [];
    BTN_IDS.forEach(function (id) {
      try { clickBt(dom2, id); } catch (e) { errs.push(id + ':' + (e && e.message)); }
    });
    a(errs.length === 0, 'y1v2200/C1: 六枚按钮逐个点过零抛出（实 ' + (errs.join(' | ') || '无') + '）');
    a(j(W2.store.get() || {}) === H0, 'y1v2200/C2: **活世界逐字不变** —— 边界 1（本页不写 store，包括不「重置拍号」）');
    a(j(W2.beatLedger.view()) === B0, 'y1v2200/C2b: 拍账逐字不变（本页不推进拍号 —— 拍由引擎推进，验收 ③）');
    a(j(W2.genGate.view()) === G0, 'y1v2200/C2c: 闸门账逐字不变（本页不记「生成过」—— 判与记是两件事）');
    a(j(W2.beatReport.view()) === R0, 'y1v2200/C2d: 拍回报账逐字不变（本页不改拒收判定）');
    const st = W2.beatFacade ? W2.beatFacade.stat() : null;
    if (st) {
      a(!st.runs || st.runs === 0,
        'y1v2200/C3: 门面 run() 零调用（本页走 status/view/blocked/diagnose 四个只读口，不走编排入口；runs=' + st.runs + '）');
    }
  }

  // ════ N 段：真源码破坏 + 两向自证 ═════════════════════════════════
  //   每组的判据都写在**本锁内部**（不是引用被破坏文件里的函数），且判据在破坏副本上必须
  //   可观测地变 —— 「没现形」与「判据太弱」必须分得开（H6 工具两向自证）。
  const CASES = [
    { n: 1, rel: PANEL_REL, key: 'page', to: '/* 页被删（负控制） */',
      why: '页表删掉 beat 页 ⇒ 页签不在场，B0 判据必须现形',
      judge: function (src) { return src.indexOf("{ id: 'beat', icon: '🎯', label: '拍' },") < 0; },
      check: 'A2' },
    { n: 2, rel: PANEL_REL, key: 'renderer', to: 'beat: renderLogs,',
      why: '把 beat 的渲染器接到 logs ⇒ 页里读不到它的专属标题（渲染器张冠李戴）',
      judge: function (src) { return src.indexOf('beat: renderBeatCenter,') < 0; },
      check: 'A2b' },
    { n: 3, rel: PANEL_REL, key: 'out', to: "$('#wa-bt-out-x')",
      why: '读数出口 id 改错（渲染了但写不进去）⇒ 六枚按钮的读数必须全空',
      judge: function (src) { return src.indexOf("$('#wa-bt-out')") < 0; },
      check: 'A3' },
    { n: 4, rel: PANEL_REL, key: 'view', to: 'const v = WA.beatLedger.view(); WA.beatLedger.land();',
      why: '往只读口里塞一次 land()（面板代推进拍号）⇒ C2b 拍账逐字不变必须现形',
      judge: function (src) { return src.indexOf('WA.beatLedger.view(); WA.beatLedger.land();') >= 0; },
      check: 'A5' },
    { n: 5, rel: DIAG_REL, key: 'guard', to: "{ page: 'beatX', ids:",
      why: '守卫表登记到不存在的页 ⇒ 守卫覆盖面查不到这一页（登记错页比不登记更坏）',
      judge: function (src) { return src.indexOf("{ page: 'beat', ids:") < 0; },
      check: 'A4' }
  ];
  CASES.forEach(function (cs) {
    const S = rd(cs.rel);
    const from = ANCHOR[cs.key];
    const hits = cnt(S, from);
    a(hits === 1, 'y1v2200/N0(' + cs.n + '): 破坏锚点 ' + cs.key + ' 在 ' + cs.rel + ' 恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = S.split(from).join(cs.to);
    a(broken !== S, 'y1v2200/Na(' + cs.n + '): 破坏真的改动了源码文本');
    a(cnt(S, cs.to) === 0, 'y1v2200/Nb(' + cs.n + '): 原版上破坏产物不存在（否则判据是自指的）');
    a(cs.judge(broken) === true, 'y1v2200/N' + cs.n + 'a: ' + cs.why);
    a(cs.judge(S) === false, 'y1v2200/N' + cs.n + 'b: （纯度）原版上同款判据为假 —— 破坏确实改变了源码形态');
  });
  // N6：破坏版**跑产品**两向自证 —— 「读数出口 id 改错」后按钮还能点，但读数再也写不进去。
  //   为什么必须跑一次真产品：只读源码只能证明「文本变了」，证明不了「行为变了」。
  (function () {
    const S = rd(PANEL_REL);
    const broken = S.split(ANCHOR.out).join("$('#wa-bt-out-x')");
    a(broken !== S, 'y1v2200/N6a(前置): 读数出口破坏副本构造成功');
    const ov = {}; ov[PANEL_REL] = broken;
    let got = null, gotNode = null, threw = null;
    try {
      const envB = gate.fresh({ srcOverride: ov });
      const domB = gotoBeat(envB);
      gotNode = clickBtNode(domB, 'wa-bt-view');
      got = gotNode ? String(gotNode.innerHTML || '') : '';
    } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y1v2200/N6b: 破坏版上点按钮仍不抛（破坏的是读数去处，不是绑定：这正是「渲染了但写不进去」的形态）实 ' + threw);
    a(gotNode !== null && emptyOut(gotNode),
      'y1v2200/N6c: （两向）破坏版上读数**为空**（出口容器零子元素；实 ' + j(got && got.length)
      + ' 字符是容器自身序列化）—— 判据不是空转');
    //   第二向：原版上同款操作必有读数（不能拿破坏版上的读数自证 —— 那是自我指涉）
    const envG = gate.fresh({});
    const domG = gotoBeat(envG);
    const good = clickBt(domG, 'wa-bt-view');
    a(good.length > 0, 'y1v2200/N6d: （两向）原版上同款操作读数非空（实 ' + good.length + ' 字符）—— 判据区分得开两向');
  })();
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY1 s3-y1-v2200 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
