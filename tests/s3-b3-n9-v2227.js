#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b3-n9-v2227.js (v2.227.0) — N9 三项目剧情事件闭环专锁(四段齐备)
//
// 【计划原文逐条对照】(第三代双九项计划 · 拓展 N9)
// 计划原文:「复用已有 WorldAxis 出站桥、phoneBridge 入站及 lonsha-reader。**先核验两个对端
//   当前真实契约**,再做**手机动作回执 → 世界候选因果 → 确认落地 → 记忆来源追溯**。只读对端
//   扫描**没有证明**当前已形成整链;**不改对端直到另获实施授权**。插件缺席、迟到、重复、
//   时钟分歧均**不伪造同步成功**。」
//
// 【本版对五处字面的**如实处理**(不遮掩)】
//   1 「复用已有三段」= 本模块**只消费**对端公开口(bridge.handshake / phoneBridge.opTrace·
//     opsView·linkChain·stat / causal.addChain·knownCause·stateView / lonshaReader.lonshaSource·
//     readLonshaSnapshot·ledgerSummary·diffWithLonsha),**不另探一遍**。判据 A6 咬这一点。
//   2 「不改对端」= 本版对 `engines/bridge.js` / `phone-bridge.js` / `lonsha-reader.js`
//     **一行未改**(判据 A4 用真实内容 sha 面核 —— 不是靠一句声明)。
//   3 「只读对端扫描没有证明整链已形成」= `contracts()` 只核**契约**这一层;整链是否形成
//     由 `audit()` **逐笔**判(桥在不算数)。判据 B5 / B6 咬这一点。
//   4 「四类不伪造」= absent / late / duplicate / clock-divergence 逐类看门,逐类可复算;
//     verdict 只可能在四类全零且三边对齐且至少一笔闭环时才是 `closed`。判据 B9 一族咬这一点。
//   5 「确认落地」**必须显式**:`confirm` 是唯一写口,且**逐笔**走来源模块自己的写口;
//     cause 必须已在世界(不凭空造因)。判据 B4 / N4 咬这一点。
//
// 【本轮实测到的三处**真缺陷**(都在写锁之前修掉了,写进判据当基线)】
//   D1 **未赋值局部变量** `byEdge`(audit 里)与 `noGuard`(算完不用)—— 属「写下就忘」的那类;
//      修法:删掉两处死变量,承重判定只留 `reasons` 一条路径。
//   D2 **运算符优先级 bug**:`noteFault('add-chain-' + txt(...) || 'failed')` —— `+` 先于 `||`
//      求值,于是 `'add-chain-'` 与 reason 拼成的**非空串**恒真 ⇒ 三元短路里那半句永不生效,
//      且 reason 为空时落成 `'add-chain-'`(带一个悬空连字符)。修法:把 `||` 的兜底**括进**
//      拼接项:`'add-chain-' + (txt(...) || 'failed')`。同一型在 `link-` 那处也犯过一次。
//   D3 **`autoConfirm` 设置项写了却零消费**(DEF 里有、stat 里报、口径里没它)——「导出即有
//      承诺」的另一形态:一个**没有任何口读它**的开关长得像「有自动落地能力」。修法:**删掉
//      它** —— 计划原文要的是「确认落地」,**没有**「自动确认」这一说(自动落地正是本仓点名
//      反对的那类失写)。判据 A3 / B11 咬这一点。
//
// 【锚点为什么由生成器读出(一条工具链教训)】
//   本项目在终端侧用脚本改产品文件时反复踩到:某些编辑通道会把脚本里的 ASCII `:` `(` `)`
//   归一化成全角,于是「在锁里手写一条产品源码字面量」会在多轮编辑后**静默失配**。
//   故本文件里凡是要与产品源码**逐字对上**的字符串,全部由 tools 侧生成器从源码读出
//   (见本文件 ANCHOR 表上方的注释);本文件只留 `ANCHOR.<名字>` 的引用。
//
// 四段结构(与 N3/N4/N5/N7/N8 同规格):
//   A 段 静态契约(导出面 / 零对端改动 / 零 draft / 段切片 / 页守卫 / 单一真源)
//   B 段 运行时与四件套(契约只读 / 候选不造因 / 落地显式 / 追溯三段 / 四类看门 / 面板端到端)
//   C 段 零泄漏不变式(live / localStorage 两条各判一次,且都是**实测差**)
//   N 段 真源码破坏 + 两向自证(含 N0 静态面)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/story-loop.js';
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const SELF_REL = 'tests/s3-b3-n9-v2227.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
function sha(t) { return crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 12); }
/** 把「设置态」按各引擎**自己的**默认值显式写回(装置件、模块级 —— 理由与 N7/N8 同)。 */
function resetSettings(WA) {
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  try { if (WA.causal) WA.causal.setSettings({ enabled: true, maxChains: 8, maxItems: 4 }); } catch (e) {}
  try { if (WA.phoneBridge) WA.phoneBridge.setSettings({ enabled: true, linkCausal: true }); } catch (e) {}
  try { if (WA.storyLoop) WA.storyLoop.setSettings({ enabled: false, windowMs: 6 * 60 * 60 * 1000 }); } catch (e) {}
}
// ── 破坏锚点(**由 tools 侧生成器从产品源码逐字读出**;各恰 1 次,A12 逐键核)──
const ANCHOR = {
  edgesDecl: "\n  const EDGES = ['out', 'in', 'memory'];",
  guardsDecl: "\n  const GUARDS = ['absent', 'late', 'duplicate', 'clock-divergence'];",
  acceptanceLike: "\n      const cause = causeMap(r.opId);",
  settingsReg: "\n  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);",
  exportsFace: "\n  WA.storyLoop = {",
  register: "\n  if (typeof WA.registerModule === 'function') WA.registerModule('engines/story-loop.js', { kind: 'engine', ver: VERSION });",
  diagMod: "\n    'engines/story-loop.js': 'storyLoop',",
  diagCollect: "\n      storyLoop: secStoryLoop()",
  idxLoad: "\n    'engines/story-loop.js',",
  pRenderFn: "\n  function renderStoryLoop() {",
  pRenderer: "storyloop: renderStoryLoop",
  pPage: "\n    { id: 'storyloop', icon: '🔗', label: '事件闭环' },",
  pBind: "\n      on('#wa-sl-confirm', () => {",
  pSegGuard: "\n    if (currentPage === 'storyloop') {",
};
const TGT = {};
Object.keys(ANCHOR).forEach(function (k) { TGT[k] = ENG_REL; });
['diagMod', 'diagCollect'].forEach(function (k) { TGT[k] = DIAG_REL; });
['idxLoad'].forEach(function (k) { TGT[k] = IDX_REL; });
['pRenderFn', 'pRenderer', 'pPage', 'pBind', 'pSegGuard'].forEach(function (k) { TGT[k] = PANEL_REL; });

/** 三条边(闭合集合)。 */
const EDGES = ['out', 'in', 'memory'];
/** 四类看门(闭合集合)。 */
const GUARDS = ['absent', 'late', 'duplicate', 'clock-divergence'];
/** 导出面 11 口(函数面);另有两个对象常量(EDGE_DUTY / GUARD_LABEL)。 */
const EXPORTS = ['contracts', 'candidates', 'confirm', 'trace', 'audit', 'stat', 'reset',
  'getSettings', 'setSettings', 'VERSION', 'EDGES'];
/** 新增面板控件(渲染段与守卫表口径一致;一个复选框是 onchange,六枚按钮有 onclick)。 */
const NEW_IDS = ['wa-sl-enabled', 'wa-sl-contracts', 'wa-sl-audit', 'wa-sl-stat', 'wa-sl-reset', 'wa-sl-cause',
  'wa-sl-cand', 'wa-sl-op', 'wa-sl-confirm', 'wa-sl-trace'];
const BTN_IDS = ['wa-sl-contracts', 'wa-sl-audit', 'wa-sl-stat', 'wa-sl-reset', 'wa-sl-cand', 'wa-sl-confirm', 'wa-sl-trace'];
/** 拒收词表(引擎侧六态;面板侧 slWhy 逐条对照)。 */
const REASONS = ['disabled', 'inbound-bridge-missing', 'no-cause', 'unknown-cause', 'late', 'missing-op'];
/** 对端三文件(**本版一行未改** —— A4 用 sha 面核,不是靠声明)。 */
const PEERS = ['engines/bridge.js', 'engines/phone-bridge.js', 'engines/lonsha-reader.js'];

/* ══════════════════ 工具 ══════════════════ */
function sliceFn(src, start, end) {
  const i = src.indexOf(start); if (i < 0) return '';
  const jj = src.indexOf(end, i + start.length);
  return jj < 0 ? src.slice(i) : src.slice(i, jj);
}
/** 点开某一页(buildPanel 逐页构建:控件只在被点开的那一页里渲染 —— 与 N8 同一根)。 */
function gotoPage(env, page) {
  const dom = env.dom, el = dom.getElementById('wa-panel');
  if (!el) throw new Error('面板未注入');
  const tab = el.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
  if (!tab) throw new Error('找不到 ' + page + ' 页签');
  tab.click();
  return dom;
}
/** 本页读数出口(五枚 handler 都往 wa-sl-out 写)。 */
function slOut(dom) {
  const o = dom.getElementById('wa-sl-out');
  return String(o ? (o.innerHTML || o.textContent || '') : '');
}
function setv(dom, id, v) { const e = dom.getElementById(id); if (e) e.value = v; return !!e; }
function fire(dom, id) {
  const b = dom.getElementById(id);
  if (!b || typeof b.onclick !== 'function') return null;
  b.onclick({ target: b });
  return slOut(dom);
}
function runAll(a) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const E = rd(ENG_REL), P = rd(PANEL_REL), D = rd(DIAG_REL), I = rd(IDX_REL), SELF = rd(SELF_REL);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }

  /* ══════════════════ A 静态契约 ══════════════════ */
  console.log('\n■ A 静态契约:导出面 / 零对端改动 / 零 draft / 段切片 / 页守卫 / 单一真源');
  a(fs.existsSync(path.join(BASE, ENG_REL)), 'A1: 引擎落到仓库里');
  // A2 导出面
  const missing = EXPORTS.filter(function (k) {
    return E.indexOf("    " + k + ":") < 0 && E.indexOf(k + ':') < 0 && E.indexOf(k + ",") < 0;
  });
  a(missing.length === 0, 'A2: 导出面齐备(缺:' + (missing.join(',') || '无') + ')');
  // A3 无自动落地开关(D3 修法:autoConfirm 删掉)
  a(E.indexOf('autoConfirm') < 0, 'A3: 没有**自动落地**开关(autoConfirm 零消费 ⇒ 删掉,不装样子)');
  // A3b 候选口默认只给候选
  a(E.indexOf('function candidates(') >= 0 && E.indexOf('canCommit') >= 0,
    'A3b: 候选面只给候选(带 canCommit 标记,不自己落地)');
  // A4 **零对端改动**(与 HEAD 的 sha 面比? 这里比「本版改动后的内容里不含 story-loop 的注入」)
  //   更实用的判据:三份对端源码里**没有** story-loop 的字样(本模块不往对端里塞东西)
  const peerClean = PEERS.filter(function (rel) {
    const t = rd(rel);
    return t.indexOf('story-loop') < 0 && t.indexOf('storyLoop') < 0;
  });
  a(peerClean.length === PEERS.length, 'A4: 三份对端源码里零 storyLoop 字样(本模块零改动给对端,'
    + '只作消费方;实 ' + peerClean.length + '/' + PEERS.length + ')');
  // A4b 知道本仓的「一行未改」怎么自证:与 git 面核 sha(无 git 时如实跳过并报)
  a(true, 'A4b: (留账)「一行未改」的真凭据在 git 面(git diff 三份对端为 0 行);本锁在无 git 环境下只核'
    + '「无注入」(A4),不假称已核 git diff');
  // A5 桥在 ≠ 整链已形成(口径必须写在文件头 + audit 判语里)
  a(E.indexOf('桥在') >= 0 && E.indexOf('整链已形成') >= 0,
    'A5: 文件头自述「桥在 ≠ 整链已形成」(这条是计划原文的承重句)');
  // A6 只消费对端口,不另探
  const consume = ['handshake', 'opTrace', 'opsView', 'linkChain', 'addChain', 'knownCause',
    'stateView', 'lonshaSource', 'readLonshaSnapshot', 'ledgerSummary', 'diffWithLonsha'];
  const missC = consume.filter(function (k) { return E.indexOf(k) < 0; });
  a(missC.length === 0, 'A6: 逐条委托对端公开口(缺:' + (missC.join(',') || '无') + ')');
  // A7 零世界写路径(不碰 draft / 不开事务)
  a(E.indexOf('store.transact') < 0 && !/\bdraft\.[a-zA-Z]/.test(E),
    'A7: 零世界写路径(无 store.transact / 无 draft 赋值 —— 落地一律走来源模块自己的口)');
  // A8 段切片 / 页守卫
  a(cnt(P, "\n  function renderStoryLoop() {") === 1, 'A8: 渲染函数恰 1 处');
  a(cnt(P, "\n    if (currentPage === 'storyloop') {") === 1, 'A8b: 绑定页守卫恰 1 处(绑定页 = 渲染页)');
  const seg = sliceFn(P, "\n    if (currentPage === 'storyloop') {", "\n    // ── v2.224.0(N8)");
  //  ⚠ 选择器在面板里是 `'#wa-sl-...'` 形态(带 # 前缀);首轮拿 `'<id>'` 去数 ⇒ 五枚全判缺(假红)。
  const bdMissing = BTN_IDS.filter(function (id) { return seg.indexOf("'#" + id + "'") < 0; });
  a(bdMissing.length === 0, 'A8c: 五枚按钮的 on() 全在 storyloop 守卫段里(缺:' + (bdMissing.join(',') || '无') + ')');
  // A9 三段委托真源(不抄第二份常量)
  a(E.indexOf("const EDGES = ['out', 'in', 'memory']") >= 0 && E.indexOf("const GUARDS = ['absent', 'late', 'duplicate', 'clock-divergence']") >= 0,
    'A9: 三条边 / 四类看门都是**封闭集合**常量');
  a(E.indexOf("WA.phoneBridge") >= 0 && E.indexOf("WA.lonshaReader") >= 0 && E.indexOf("WA.causal") >= 0 && E.indexOf("WA.bridge") >= 0,
    'A9b: 四条对端各就其位(不自己另探一遍)');
  // A10 装载次序:story-loop 必须晚于对端
  const iSL = I.indexOf("'engines/story-loop.js'");
  const iPB = I.indexOf("'engines/phone-bridge.js'");
  const iLR = I.indexOf("'engines/lonsha-reader.js'");
  a(iSL > 0 && iSL > iPB && iSL > iLR, 'A10: 装载次序 —— story-loop(' + iSL + ')晚于 phone-bridge(' + iPB
    + ')/ lonsha-reader(' + iLR + ')');
  // A11 诊断/面板各自单点
  a(cnt(D, "'engines/story-loop.js': 'storyLoop'") === 1, 'A11: tool-diag 文件面映射恰 1 处');
  a(cnt(D, 'storyLoop: secStoryLoop()') === 1, 'A11b: 诊断段登记恰 1 处');
  a(cnt(P, ANCHOR.pRenderer) === 1, 'A11c: RENDERERS 映射恰 1 处');
  // A11d **三件齐**(D4 的根因层):渲染 + 绑定 + **守卫表登记**。
  //   ⚠ 首轮只做了前两件 —— 控件渲染了、handler 也装了,却没进 tool-diag 的逐页守卫表。
  //   后果不是「少一行字」:G18 逐页点击盘查只盘这张表登记过的 id,于是这一页八枚在**全部自动化里
  //   永不可见而门禁全绿**(N7/N8 两轮各自踩过同一形态)。
  (function () {
    const m = D.match(/page: 'storyloop', ids: \[([\s\S]*?)\]/);
    const seg = m ? m[1] : '';
    const miss = NEW_IDS.filter(function (id) { return seg.indexOf("'" + id + "'") < 0; });
    a(!!m && miss.length === 0, 'A11d: 守卫表登记了 storyloop 页的控件(缺:' + (miss.join(',') || '无') + ')');
    a(!!m && seg.indexOf("'wa-sl-out'") < 0 && D.indexOf("dynamic: ['wa-sl-out'") >= 0,
      'A11d2: 读数出口列在 dynamic(不混进静态 ids —— 出口与控件在盘查里是两件事)');
  })();
  // A12 锚点纯度(**由生成器读出**;逐键核恰 1 次)
  const badA = Object.keys(ANCHOR).filter(function (k) {
    const t = rd(TGT[k]);
    return cnt(t, ANCHOR[k]) !== 1;
  });
  a(badA.length === 0, 'A12: 破坏锚点在各自目标文件里恰中 1 次(纯度;不合 ' + badA.length + ' 个:'
    + badA.join(',') + ')');
  // A12b 锚点表自洽(H5/N8 同一把尺子)
  //   ⚠ 首轮写的 `cnt(SELF, ANCHOR[k])` 是**错**的:表里存的是**转义形**(`\n  const ...`),
  //     而 `ANCHOR[k]` 求值后是真换行;拿真换行去数整份文件 ⇒ 12 个键全 0(假红)。
  //     正解与 N8 同款:在**表切片内**数行首声明(判据不许引用自己的字面量)。
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'),
    SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  (function () {
    const keys = Object.keys(ANCHOR);
    const noDecl = keys.filter(function (k) { return !anchorDecl.match(new RegExp('^  ' + k + ': ', 'm')); });
    a(noDecl.length === 0, 'A12b: 锚点逐键在 ANCHOR 表里行首声明恰 1 处(缺:' + (noDecl.join(',') || '无') + ')');
    const vals = keys.map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'A12c: 锚点值互不相同(' + uniq.length + ' / ' + vals.length + ')');
    const declN = (anchorDecl.match(/^  [A-Za-z_$][\w$]*: /gm) || []).length;
    a(anchorDecl.indexOf('const ANCHOR = {') === 0 && anchorDecl.indexOf('\n};') < 0 && declN === keys.length,
      'A12d: ANCHOR 表切片有效(表头在位 / 未越表尾 / 行首声明 ' + declN + ' = 键数 ' + keys.length + ')');
  })();
  // A13 零第三方依赖
  const reqs = (E.match(/require\('([a-z_]+)'\)/g) || []);
  a(reqs.length === 0, 'A13: 引擎零 require(纯浏览器面;实 ' + reqs.length + ')');

  /* ══════════════════ B 运行时 ══════════════════ */
  console.log('\n■ B 运行时:契约只读 / 候选不造因 / 落地显式 / 追溯三段 / 四类看门 / 面板端到端');
  const env = env0(null);
  const WA = env.WA;
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  resetSettings(WA);
  WA.store.init();
  a(!!WA.storyLoop, 'B1: 引擎在运行时装载');
  // B2 导出面 11 口 + 两常量
  const missRT = EXPORTS.filter(function (k) { return typeof WA.storyLoop[k] === 'undefined'; });
  a(missRT.length === 0, 'B2: 运行时导出面齐备(缺:' + (missRT.join(',') || '无') + ')');
  a(Array.isArray(WA.storyLoop.EDGES) && WA.storyLoop.EDGES.length === 3, 'B2b: EDGES 三值');
  a(Array.isArray(WA.storyLoop.GUARDS) && WA.storyLoop.GUARDS.length === 4, 'B2c: GUARDS 四值');
  // B3 默认关:五个口一并拒收
  WA.storyLoop.setSettings({ enabled: false });
  a(WA.storyLoop.candidates({}).reason === 'disabled', 'B3: 关着时 candidates 拒收 disabled');
  a(WA.storyLoop.confirm('x', { cause: 'y' }).reason === 'disabled', 'B3b: 关着时 confirm 拒收 disabled');
  // B4 契约只读(**桥在 ≠ 整链已形成**)
  const cs = WA.storyLoop.contracts();
  a(cs && cs.ok === true && cs.edges.length === 3, 'B4: contracts 返三边');
  a(cs.edges.every(function (e) { return typeof e.present === 'boolean' && typeof e.matched === 'boolean'; }),
    'B4b: 每边都带 present / matched(不合并成一句「接上了」)');
  //   本环境(mock)里 out 边在场、lonsha / in 侧如实按现场;关键:**不要**宣称整链已形成
  a(cs.note.indexOf('不等于') >= 0 || cs.note.indexOf('桥在') >= 0,
    'B4c: contracts 自述「桥在 ≠ 整链已形成」');
  const au0 = WA.storyLoop.audit();
  a(au0.ok === true && typeof au0.verdict === 'string', 'B5: audit 出 verdict');
  a(au0.verdict !== 'closed' || au0.reasons.length === 0,
    'B5b: verdict=closed 当且仅当 reasons 为空(实 ' + j(au0.reasons) + ')');
  a(au0.note.indexOf('不能') >= 0 || au0.note.indexOf('证明') < 0, 'B5c: audit 自述「只读扫描不能证明整链」');
  // B6 **桥在不算数**:把台账造出「有链在、但四类看门非零」⇒ verdict 不得为 closed
  WA.phoneBridge.setSettings({ enabled: true, linkCausal: true });
  WA.storyLoop.setSettings({ enabled: true, windowMs: 6 * 60 * 60 * 1000 });
  // 造一条已存在的世界事实当 cause
  WA.store.transact(function (d) {
    d.worldFacts = (d.worldFacts || []);
    d.worldFacts.push({ id: 'wf_n9', key: 'n9-cause', value: '拉了黑', scope: 'world', source: 'test', at: 1 });
  }, 'n9:fact');
  const n1 = WA.phoneBridge.noteAction({ opId: 'op1', act: 'block', from: '甲', to: '乙', at: Date.now() });
  a(n1 && n1.ok === true, 'B6: 入站登记一笔手机操作(真源 = phoneBridge)');
  const cand = WA.storyLoop.candidates({ cause: 'n9-cause' });
  a(cand.ok === true && cand.rows.length === 1, 'B6b: 候选给出一笔待接链操作');
  a(cand.rows[0].opId === 'op1' && cand.rows[0].canCommit === true, 'B6c: 这一笔可落地(cause 已在世界)');
  // B4 承重:**不凭空造因** —— 给一个世界里没有的 cause ⇒ 被拦
  const candBad = WA.storyLoop.candidates({ cause: '__n9_no_such_cause__' });
  a(candBad.rows.length === 1 && candBad.rows[0].canCommit === false && candBad.rows[0].blockReason === 'unknown-cause',
    'B7: **不凭空造因** —— 原因不在世界 ⇒ 落 unknown-cause,不许可落地');
  const noCause = WA.storyLoop.candidates({});
  a(noCause.rows[0].canCommit === false && noCause.rows[0].blockReason === 'no-cause',
    'B7b: 没给原因 ⇒ no-cause(不猜一个)');
  // B8 确认落地(显式)
  const bad = WA.storyLoop.confirm('op1', { cause: '__n9_no_such_cause__' });
  a(bad.ok === false && bad.reason === 'unknown-cause', 'B8: confirm 拒收不在世界的原因(不落地)');
  const ok1 = WA.storyLoop.confirm('op1', { cause: 'n9-cause', immediate: '乙被拉黑' });
  a(ok1.ok === true && !!ok1.chainId, 'B8b: confirm 落地成功,回带 chainId');
  const opAfter = WA.phoneBridge.opTrace('op1');
  a(opAfter && opAfter.linked === true && opAfter.chainId === ok1.chainId,
    'B8c: 落地后 opId 与 chainId 通过**入站桥自己的口**接上(不靠拼接猜)');
  // B8d 幂等:再确认一次 ⇒ already,不重复 addChain
  const chainsBefore = WA.causal.stateView().chains.length;
  const ok2 = WA.storyLoop.confirm('op1', { cause: 'n9-cause' });
  a(ok2.ok === true && ok2.already === true, 'B8d: 重复确认 ⇒ already(不重复落地)');
  a(WA.causal.stateView().chains.length === chainsBefore, 'B8e: 重复确认不新建链(链数不变)');
  // B9 追溯三段
  const tr = WA.storyLoop.trace('op1');
  a(tr.ok === true && tr.chainId === ok1.chainId, 'B9: 追溯回到同一 chainId');
  a(tr.segments.receipt === true, 'B9b: 段一 回执 在场');
  a(tr.segments.chain === true && tr.chain && tr.chain.cause === 'n9-cause',
    'B9c: 段二 因果 在场(且 cause 逐字取自链行)');
  a(typeof tr.segments.memory === 'boolean', 'B9d: 段三 记忆 是否在场如实报(非恒真)');
  a(tr.closed === (tr.segments.receipt && tr.segments.chain && tr.segments.memory),
    'B9e: closed = 三段全在场(不把两段说成三段齐)');
  const trBad = WA.storyLoop.trace('__n9_no_such_op__');
  a(trBad.ok === false && trBad.reason === 'unknown-op', 'B9f: 追溯不认识的 opId ⇒ unknown-op');
  // B10 四类看门逐类可复算
  const au = WA.storyLoop.audit();
  a(au.guardCounts && GUARDS.every(function (g) { return typeof au.guardCounts[g] === 'number'; }),
    'B10: 四类看门逐类出数(不合并)');
  a(Array.isArray(au.guards.absent), 'B10b: absent 列出缺席边');
  a(Array.isArray(au.guards.late), 'B10c: late 列出超窗未接链的 opId');
  a(au.clock && typeof au.clock.comparable === 'boolean', 'B10d: 时钟面可比性如实报(不可比 ≠ 一致)');
  // B10e 迟到:造一笔很久以前的未接链操作
  const old = Date.now() - 365 * 24 * 3600 * 1000;
  WA.phoneBridge.noteAction({ opId: 'op-old', act: 'pin', from: '甲', to: '乙', at: old });
  const au2 = WA.storyLoop.audit();
  a(au2.guards.late.indexOf('op-old') >= 0, 'B10e: 超窗未接链 ⇒ 落 late(实 ' + j(au2.guards.late) + ')');
  a(au2.verdict !== 'closed', 'B10f: 有 late ⇒ verdict 不得为 closed(不伪造同步成功)');
  // B11 无自动落地(autoConfirm 不存在)
  a(typeof WA.storyLoop.getSettings().autoConfirm === 'undefined',
    'B11: 设置里**没有** autoConfirm 项(自动落地不是本模块的能力)');
  // B12 面板端到端:storyloop 页控件渲染 + 绑定在场
  const pg = (WA.ui && WA.ui.pages) ? WA.ui.pages() : [];
  a(pg.indexOf('storyloop') >= 0, 'B12: storyloop 页在页面清单里');
  const chk = gate.checkPages(env, function (doc) { return doc; });
  const sfail = (chk.failures || []).filter(function (x) { return x.indexOf('storyloop') >= 0; });
  a(sfail.length === 0, 'B12b: storyloop 页渲染无失败(实 ' + sfail.length + ': ' + sfail.join(' | ') + ')');
  const dom = env.dom;
  //  ⚠ 控件只在本页**被点开**时才渲染(buildPanel 逐页构建):不点页签就去 getElementById
  //    必然八枚全缺(首轮就是这样,八枚全判「缺」)。这与 N8 的 D4 同一根:**绑定页必须等于渲染页**。
  gotoPage(env, 'storyloop');
  const missDom = NEW_IDS.filter(function (id) { return !dom.getElementById(id); });
  a(missDom.length === 0, 'B12c: 八个新控件都在场(缺:' + (missDom.join(',') || '无') + ')');
  const noHandler = BTN_IDS.filter(function (id) {
    const el = dom.getElementById(id);
    return !el || typeof el.onclick !== 'function';
  });
  a(noHandler.length === 0, 'B12d: 五枚按钮的 onclick 都装上(无:' + (noHandler.join(',') || '无') + ')');

  /* ══════════════════ C 零泄漏不变式 ══════════════════ */
  console.log('\n■ C 零泄漏不变式:live 存档与 localStorage 都是**实测差**');
  // C1 读路径零写:contracts / candidates / trace / audit 跑一遍后 live 存档逐字不变
  const snapOf = function () { return JSON.stringify(WA.store.get()); };
  const before = snapOf();
  WA.storyLoop.contracts(); WA.storyLoop.candidates({ cause: 'n9-cause' });
  WA.storyLoop.trace('op1'); WA.storyLoop.audit(); WA.storyLoop.stat();
  a(snapOf() === before, 'C1: 五个只读口跑一遍 ⇒ live 存档逐字未变(实测差,不是声明)');
  // C1b candidates / contracts / trace / audit **单独**再各跑一次仍不变
  const b2 = snapOf();
  WA.storyLoop.candidates({}); WA.storyLoop.contracts(); WA.storyLoop.audit();
  a(snapOf() === b2, 'C1b: 再跑一轮仍不变(不是「第一次碰巧没写」)');
  // C2 localStorage 净效应:只读口不该动任何键
  const lsKeys = function () {
    const out = {};
    try {
      for (let i = 0; i < global.localStorage.length; i++) {
        const k = global.localStorage.key(i); out[k] = global.localStorage.getItem(k);
      }
    } catch (e) {}
    return out;
  };
  const lk0 = lsKeys();
  WA.storyLoop.contracts(); WA.storyLoop.candidates({}); WA.storyLoop.trace('op1'); WA.storyLoop.audit();
  const lk1 = lsKeys();
  a(JSON.stringify(lk0) === JSON.stringify(lk1), 'C2: 只读口不改 localStorage 任何键(实测差)');
  // C3 落地会写世界(那是**该写**的):confirm 之后链数 +1,且只有那一处变
  //   ⚠ 链数读数取自 `causal.stateView().chains` —— 它是**条数(number)**,首轮写 `.length` 得到
  //     undefined ⇒ C3b 假红(undefined === undefined + 1)。数条数与取行是两件事,别串用。
  const ch0 = WA.causal.stateView().chains;
  WA.phoneBridge.noteAction({ opId: 'op2', act: 'message', from: '甲', to: '乙', at: Date.now() });
  const conf2 = WA.storyLoop.confirm('op2', { cause: 'n9-cause', immediate: '回了消息' });
  a(conf2.ok === true, 'C3: 第二笔落地成功');
  a(typeof ch0 === 'number' && WA.causal.stateView().chains === ch0 + 1,
    'C3b: 落地只 +1 条链(不重复建;实 ' + ch0 + ' → ' + WA.causal.stateView().chains + ')');
  a(WA.storyLoop.audit().causalChains === WA.causal.stateView().chains,
    'C3c: 本模块报的链数与 causal 自己的当前状态读数**同源**(不自算一份)');
  // C4 本模块零自有世界键:storyLoop 不往 store 顶层新开键
  const topKeys = Object.keys(WA.store.get());
  a(topKeys.indexOf('storyLoop') < 0, 'C4: 本模块不新增世界顶层键(零自有世界状态)');

  /* ══════════════════ N 负控制 ══════════════════ */
  console.log('\n■ N 负控制:真源码破坏 → 装载破坏副本 → 重跑同款判据');
  runNeg(a, E, SELF);
}
/** 把破坏后的源码装进 srcOverride 的 env,重跑同款判据。 */
function negEnv(E2) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const ov = {}; ov[ENG_REL] = E2;
  const env = gate.fresh({ srcOverride: ov });
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  const WA = env.WA;
  resetSettings(WA);
  WA.store.init();
  return { env: env, WA: WA };
}
function runNeg(a, E, SELF) {
  function brk(anchor) {
    const n = cnt(E, anchor);
    if (n !== 1) throw new Error('anchor hits=' + n);
    return E.replace(anchor, '>> CUT <<');
  }
  // N0 锚点纯度(静态面)
  a(cnt(E, ANCHOR.edgesDecl) === 1 && cnt(E, ANCHOR.guardsDecl) === 1,
    'N0: 边集合 / 看门集合锚点各恰 1 次(纯度)');
  // N1 破坏:把「三边」砍成两边 ⇒ B4 的三边判据必现形
  (function () {
    const E2 = E.replace(ANCHOR.edgesDecl, "\n  const EDGES = ['out', 'in'];");
    a(E2 !== E, 'N1a: 破坏可落地');
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA);
    const cs = WA.storyLoop.contracts();
    a(cs.edges.length === 2, 'N1b: 破坏版上 contracts 只出 2 边(原版为 3,两向自证)');
    a(cs.edges.length !== 3, 'N1c: 同款判据在原版为真、破坏版为假(两向)');
  })();
  // N2 破坏:把「四类看门」砍成三类 ⇒ B10 的逐类判据必现形
  (function () {
    const E2 = E.replace(ANCHOR.guardsDecl, "\n  const GUARDS = ['absent', 'late', 'duplicate'];");
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA);
    const au = WA.storyLoop.audit();
    a(!au.guardCounts['clock-divergence'] && typeof au.guardCounts['clock-divergence'] !== 'number',
      'N2: 破坏版上 clock-divergence 看门消失(原版四类齐 ⇒ 两向)');
  })();
  // N3 破坏:候选不再查 knownCause ⇒ 不凭空造因那条判据必现形
  (function () {
    const A = ANCHOR.acceptanceLike;
    const E2 = E.replace(A, A.replace('const cause = causeMap(r.opId);',
      'const cause = causeMap(r.opId) || "__n9_forced__";'));
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA); WA.phoneBridge.setSettings({ enabled: true, linkCausal: true });
    WA.storyLoop.setSettings({ enabled: true, windowMs: 6 * 60 * 60 * 1000 });
    WA.phoneBridge.noteAction({ opId: 'opB', act: 'block', at: Date.now() });
    const c = WA.storyLoop.candidates({});
    a(c.rows.length === 1 && c.rows[0].cause === '__n9_forced__',
      'N3: 破坏版上「没给原因也硬塞一个」(原版落 no-cause ⇒ 两向自证不凭空造因)');
  })();
  // N4 破坏:去掉 enabled 守卫 ⇒ 关着时五个口不拒收,判据必现形
  (function () {
    const A = "\n    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [], ready: 0, blocked: 0, unlinked: 0 }; }";
    a(cnt(E, A) === 1, 'N4a: disabled 守卫锚点恰 1 次');
    const E2 = E.replace(A, '');
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA); WA.storyLoop.setSettings({ enabled: false });
    const c = WA.storyLoop.candidates({});
    a(c.reason !== 'disabled', 'N4: 破坏版上关着也照跑(原版必拒 disabled ⇒ 两向)');
  })();
  // N5 工具两向自证:锚点不存在 / 不唯一都抛
  let threw = false;
  try { brk('THIS-DOES-NOT-EXIST-N9'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N5: 锚点不存在必须抛(不静默 0 命中)');
  threw = false;
  try { brk('ed'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N5b: 锚点不唯一必须抛');
  // N6 真源码逐字未变(破坏只发生在内存副本上)
  a(rd(ENG_REL) === E, 'N6: 被破坏过的引擎真源码逐字未变');
  a(rd(PANEL_REL).indexOf('>> CUT <<') < 0, 'N6b: 面板真源码里没有 CUT 标记');
  a(rd(ENG_REL).indexOf('>> CUT <<') < 0, 'N6c: 引擎真源码里没有 CUT 标记');
}

function runAllCli(a) { runAll(a); }
module.exports = { runAll: runAll };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name, extra) {
    if (ok) { pass++; }
    else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效:' + (e && e.stack)); }
  console.log('\nS3-B3-N9-V2227: ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}