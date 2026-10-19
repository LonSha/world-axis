#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b4-n10-v2228.js (v2.228.0) — N10 历史留存与检索专锁(四段齐备)
//
// 【缝合来源与计划原文逐条对照】(第四代双九项计划 · 拓展 N10)
//   三条独立来源指向同一缺口:
//     ① Canon Engine(TaihouKai/SillyTavern-CanonEngine) `docs/WORLD_STATE_CONTEXT_CONTRACT.md`
//        第 1 节 OR 规则原文 + 第 7 节预算口径;
//     ② st-theater(koichole213-ui/st-theater) `DREAM_MEMORY_V2_SPEC.md` 的 states.history;
//     ③ titania-theater 5.8.0「故事记忆:旧事召回」。
//
// 【四条硬口径(判据逐条咬)】
//   1 **OR 而非 AND**:因果相关 **或** 被提及,任一成立即入候选(不要求同时满足)。判据 B5/B5b。
//   2 **反转不等于没发生**:`active:false` 的旧版本必须可检索,且与当前值**分列**。
//     `upsertFact` 早就在写旧版本,而此前唯一的读口把它 filter 掉了 —— 于是「还了钥匙」
//     抹掉了「偷过钥匙」。判据 B6/B6b/B6c。
//   3 **缺数据≠常态**:查无结果显式标 absent,不得读成「没发生过 / 一切正常」。判据 B7/B7b。
//   4 **有界不静默**:超限先压紧(widths 五档),压不下显式报 capacity **且硬截断进预算** ——
//     「被预算丢掉」与「本来就没有」必须分得开。判据 B9/B9b/B9c/B9d。
//
// 【本轮实测到的**两处真缺陷**(都在写锁之前修掉了,写进判据当基线)】
//   D1 **未定义函数 `chr`**:`const TAG = chr(60) + 'world_axis_history' + chr(62);`
//      `chr` 在全仓并不存在(仓内八处同型标签都是内联字面量)。首版用它是为了绕落盘通道
//      —— 但那是**落盘手段**,不是产品代码该有的形态。为什么没被当场拦住:`node --check`
//      **只查语法、不查运行时引用**,`chr(60)` 语法完全合法,真装载才 ReferenceError。
//      教训:「语法过了」不等于「装载得过」——两者必须分开验。判据 A6b 咬这一点。
//   D2 **死看门 `guards.stale`**:`candidates` 把超窗行过滤掉之后才返回 `rows`,
//      而 `audit` 从 `c.rows` 里数 stale —— 过滤恰恰把 stale 全滤掉了,于是这一类
//      **结构上恒零**:四类看门里有一类永远报不出东西,等于没有这一类(报 0 与报不出是两件事)。
//      修法:`candidates` 在**过滤之前**留一份超窗读数(staleKeys/staleDropped),audit 改读它。
//      判据 B8d 用「造一条超窗事实」实测——原版数 0、修后数 1(两向)。
//
// 【前四处结构错配(首轮按想当然写,全部现场实测纠正)】
//   · `core/store.js:52` 实测:`people: {}, // id -> {...}` 是**对象映射**不是数组。
//     按数组读 ⇒ `Array.isArray` 恒假 ⇒ scene 边永远缺席(contracts 会如实报 no-people,
//     不撒谎,但整条边白挂)。判据 B4b 用「塞一个人进去」实测该边从 false 翻 true。
//   · `engines/chrono.js:410` 实测:chronicle 行字段是 `{at,kind,label,title,text,refs}`,
//     **没有 summary、也没有 id**。按 summary 读 ⇒ 正文永远为空串(命中面被砍掉一半)。
//   · `engines/inject-budget.js` 导出面实测:**没有** `priorityOf`;导出的是 `rankOf(name)`,
//     但它对未登记源返回 `DEFAULT_RANK`(=6),与「已登记为 rank 6」不可区分 ——
//     拿它判「登没登记」必错。唯一能答这个问题的面是 `PRIORITY` 的**键集**本身。
//   · `assemble` 在 capacity 态此前**直接返回超长正文**,违反「有界是硬上界」。
//
// 四段结构(与 N3/N5/N7/N8/N9 同规格):
//   A 段 静态契约(导出面 / 无未定义标识符 / 段切片 / 页守卫 / 三件齐 / 单一真源)
//   B 段 运行时与四件套(三边契约 / OR 规则 / 反转可检索 / 缺数据≠常态 / 有界不静默 / 面板端到端)
//   C 段 零泄漏不变式(live / localStorage 两条各判一次,且都是**实测差**)
//   N 段 真源码破坏 + 两向自证(含 N0 静态面)
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/retrieval.js';
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const SELF_REL = 'tests/s3-b4-n10-v2228.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 把「设置态」按各引擎**自己的**默认值显式写回(装置件、模块级 —— 理由与 N7/N8/N9 同)。 */
function resetSettings(WA) {
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  try { if (WA.retrieval) WA.retrieval.setSettings({ enabled: false, windowMs: 30 * 24 * 60 * 60 * 1000, maxRows: 24, maxChars: 6000 }); } catch (e) {}
}
// ── 破坏锚点(**由 tools 侧生成器从产品源码逐字读出**;各恰 1 次,A12 逐键核)──
const ANCHOR = {
  triggersDecl: "\n  const TRIGGERS = ['causal', 'mentioned', 'scene'];",
  guardsDecl: "\n  const GUARDS = ['absent', 'stale', 'unranked', 'empty-lookup'];",
  sourceName: "\n  const SOURCE_NAME = '历史留存';",
  settingsReg: "\n  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);",
  exportsFace: "\n  WA.retrieval = {",
  register: "\n  if (typeof WA.registerModule === 'function') WA.registerModule('engines/retrieval.js', { kind: 'engine', ver: VERSION });",
  diagMod: "\n    'engines/retrieval.js': 'retrieval',",
  idxLoad: "\n    'engines/retrieval.js',",
  pRenderFn: "\n  function renderRetrieval() {",
  pRenderer: "retrieval: renderRetrieval,",
  pPage: "\n    { id: 'retrieval', icon: '\ud83d\udcdc', label: '留存' },",
  pBind: "\n      on('#wa-rt-contracts', () => {",
  pSegGuard: "\n    if (currentPage === 'retrieval') {",
};
const TGT = {};
Object.keys(ANCHOR).forEach(function (k) { TGT[k] = ENG_REL; });
['diagMod'].forEach(function (k) { TGT[k] = DIAG_REL; });
['idxLoad'].forEach(function (k) { TGT[k] = IDX_REL; });
['pRenderFn', 'pRenderer', 'pPage', 'pBind', 'pSegGuard'].forEach(function (k) { TGT[k] = PANEL_REL; });

/** 三条检索边(闭合集合)。 */
const TRIGGERS = ['causal', 'mentioned', 'scene'];
/** 四类看门(闭合集合)。 */
const GUARDS = ['absent', 'stale', 'unranked', 'empty-lookup'];
/** 导出面 16 口(运行时实 16 键;另有两个对象常量 TRIGGER_DUTY / GUARD_LABEL)。 */
const EXPORTS = ['VERSION', 'TRIGGERS', 'TRIGGER_DUTY', 'GUARDS', 'GUARD_LABEL', 'SOURCE_NAME',
  'getSettings', 'setSettings', 'contracts', 'candidates', 'historyOf', 'assemble', 'audit',
  'buildBlock', 'stat', 'reset'];
/** 新增面板控件(渲染段与守卫表口径一致;一个复选框是 onchange,六枚按钮有 onclick)。 */
const NEW_IDS = ['wa-rt-enabled', 'wa-rt-contracts', 'wa-rt-audit', 'wa-rt-stat', 'wa-rt-reset',
  'wa-rt-text', 'wa-rt-cand', 'wa-rt-key', 'wa-rt-history'];
const BTN_IDS = ['wa-rt-contracts', 'wa-rt-audit', 'wa-rt-stat', 'wa-rt-reset', 'wa-rt-cand', 'wa-rt-history'];
/** 拒收词表(引擎侧两态;面板侧 rtWhy 逐条对照)。 */
const REASONS = ['disabled', 'missing-key'];
/** 三处上游来源(**计划原文点名**;判据 A14 咬字面)。 */
const SOURCES_UPSTREAM = ['CanonEngine', 'WORLD_STATE_CONTEXT_CONTRACT', 'DREAM_MEMORY_V2_SPEC', 'titania'];

/* ══════════════════ 工具 ══════════════════ */
function sliceFn(src, start, end) {
  const i = src.indexOf(start); if (i < 0) return '';
  const jj = src.indexOf(end, i + start.length);
  return jj < 0 ? src.slice(i) : src.slice(i, jj);
}
/** 点开某一页(buildPanel 逐页构建:控件只在被点开的那一页里渲染 —— 与 N8/N9 同一根)。 */
function gotoPage(env, page) {
  const dom = env.dom, el = dom.getElementById('wa-panel');
  if (!el) throw new Error('面板未注入');
  const tab = el.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
  if (!tab) throw new Error('找不到 ' + page + ' 页签');
  tab.click();
  return dom;
}
/** 本页读数出口(六个 handler 都往 wa-rt-out 写)。 */
function rtOut(dom) {
  const o = dom.getElementById('wa-rt-out');
  return String(o ? (o.innerHTML || o.textContent || '') : '');
}
function setv(dom, id, v) { const e = dom.getElementById(id); if (e) e.value = v; return !!e; }
function fire(dom, id) {
  const b = dom.getElementById(id);
  if (!b || typeof b.onclick !== 'function') return null;
  b.onclick({ target: b });
  return rtOut(dom);
}
/** 造一条事实链(同一 key 两个版本:旧值 active:false / 当前值 active:true)。 */
function seedFact(WA, key, oldV, newV, at) {
  WA.store.transact(function (d) {
    d.memory = d.memory || {};
    d.memory.facts = d.memory.facts || [];
    d.memory.facts.push({ key: key, value: oldV, version: 1, active: false, reason: 'replaced', at: at - 1000 });
    d.memory.facts.push({ key: key, value: newV, version: 2, active: true, reason: 'change', at: at });
  }, 'n10:fact');
}
function seedPerson(WA, id, name, at) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people[id] = { id: id, name: name, updatedAt: at };
  }, 'n10:person');
}
function runAll(a) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const E = rd(ENG_REL), P = rd(PANEL_REL), D = rd(DIAG_REL), I = rd(IDX_REL), SELF = rd(SELF_REL);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }

  /* ══════════════════ A 静态契约 ══════════════════ */
  console.log('\n\u25a0 A 静态契约:导出面 / 无未定义标识符 / 段切片 / 页守卫 / 三件齐 / 单一真源');
  a(fs.existsSync(path.join(BASE, ENG_REL)), 'A1: 引擎落到仓库里');
  // A2 导出面
  const missing = EXPORTS.filter(function (k) {
    return E.indexOf('    ' + k + ':') < 0 && E.indexOf(k + ':') < 0 && E.indexOf(k + ',') < 0;
  });
  a(missing.length === 0, 'A2: 导出面齐备(缺:' + (missing.join(',') || '无') + ')');
  // A3 无自动落地开关:本模块**零写路径**(它是读侧模块,唯一产品出口是 buildBlock)
  a(E.indexOf('store.transact') < 0 && !/\bdraft\.[a-zA-Z]/.test(E),
    'A3: 零世界写路径(无 store.transact / 无 draft 赋值 —— 本模块只读,不落地)');
  // A4 默认休眠(这是**口径**:默认关 ⇒ 不占预算、不改现有行为)
  a(/const DEF = \{ enabled: false,/.test(E), 'A4: DEF.enabled === false(默认休眠,不占预算)');
  // A5 关闭时返回空串(不产空壳、不占预算)
  a(E.indexOf("if (!cfg.enabled) return '';") >= 0,
    'A5: buildBlock 关闭时返回空串(不产空壳、不占预算)');
  // A6 **无未定义标识符**(D1 修法的静态面):`chr` 这种全仓不存在的名字不许出现
  //   ⚠ 为什么单列一条:`node --check` **只查语法**,
  //     `chr(60) + 'x'` 语法完全合法 —— 真装载才 ReferenceError。
  //     本锁自己也要跑一次「语法过 ≠ 装载过」的两向(判据 B1b)。
  // ⚠ 判据只看**非注释行**:本模块的注释里正好**记录了**这条缺陷的原文(chr(60)/chr(62))。
  //   拿整份源码去数会把「如实留账」本身当成违规(假红)。
  const codeLines = E.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); });
  a(codeLines.filter(function (l) { return l.indexOf('chr(') >= 0; }).length === 0,
    'A6: 代码行里零 chr( 调用(chr 全仓不存在 —— 首版 D1 真缺陷;注释行不计)')
  a(E.indexOf("const TAG = '<world_axis_history>';") >= 0
    && E.indexOf("const TAG_END = '</world_axis_history>';") >= 0,
    'A6b: 注入块标签是内联字面量单真源(与仓内八处同型标签同一写法)');
  // A7 标签由 TAG 常量拼出(不是散落的字面量)
  a(E.indexOf("const WRAP = TAG + '") >= 0 && E.indexOf('WRAP2 = ') >= 0,
    'A7: assemble 的包裹串由 TAG / TAG_END 常量拼出(单一真源,不散落字面量)');
  // A8 段切片 / 页守卫
  a(cnt(P, ANCHOR.pRenderFn) === 1, 'A8: 渲染函数恰 1 处');
  a(cnt(P, ANCHOR.pSegGuard) === 1, 'A8b: 绑定页守卫恰 1 处(绑定页 = 渲染页)');
  const seg = sliceFn(P, ANCHOR.pSegGuard, '\n    // \u2500\u2500 v2.224.0(N8)');
  const bdMissing = BTN_IDS.filter(function (id) { return seg.indexOf("'#" + id + "'") < 0; });
  a(bdMissing.length === 0, 'A8c: 六枚按钮的 on() 全在 retrieval 守卫段里(缺:' + (bdMissing.join(',') || '无') + ')');
  a(seg.indexOf("'#wa-rt-out'") >= 0, 'A8d: 读数出口也在守卫段里(handler 往它写)');
  // A9 三边 / 四类看门都是**封闭集合**常量
  a(E.indexOf("const TRIGGERS = ['causal', 'mentioned', 'scene']") >= 0
    && E.indexOf("const GUARDS = ['absent', 'stale', 'unranked', 'empty-lookup']") >= 0,
    'A9: 三条检索边 / 四类看门都是**封闭集合**常量');
  // A9b 逐边建(不是硬写三段):contracts 走 TRIGGERS.filter(...).map(...)
  a(E.indexOf('TRIGGERS.filter(function (k) { return typeof BUILD[k]') >= 0,
    'A9b: contracts 按 TRIGGERS **逐边建**(常量不是装饰 —— 砍边必须能被读数看见)');
  // A9c 四类看门逐类报(不合并成一态)
  a(E.indexOf('GUARDS.forEach(function (g) { guardCounts[g] =') >= 0,
    'A9c: audit 按 GUARDS **逐类**出数(不合并成一句「正常」)');
  // A10 装载次序:retrieval 晚于它消费的源
  //   ⚠ 判据必须取 LOAD_ORDER 数组内的下标,不是整份 index.js 的 indexOf ——
  //   后者是「字面首次出现位置」,与装载顺序无关(retrieval 字面在 index.js 里出现在 history-search 之前,
  //   但在 LOAD_ORDER 里排在它之后)。
  const LO = (function () {
    const i = I.indexOf('const LOAD_ORDER = [');
    const j2 = I.indexOf('];', i);
    return (i >= 0 && j2 > i) ? (I.slice(i, j2).match(/'engines\/[A-Za-z0-9_\-]+\.js'/g) || []) : [];
  })();
  const posOf = function (rel) { return LO.indexOf("'" + rel + "'"); };
  const iRT = posOf('engines/retrieval.js');
  const iCA = posOf('engines/causal.js');
  const iCH = posOf('engines/chrono.js');
  const iHS = posOf('engines/history-search.js');
  a(LO.length > 180, 'A10a: LOAD_ORDER 切片有效(实 ' + LO.length + ' 项 engines/*.js)');
  a(iRT > 0 && iRT > iCA && iRT > iCH,
    'A10: 装载次序 —— retrieval(LOAD_ORDER #' + iRT + ')晚于 causal(#' + iCA + ')/ chrono(#' + iCH + ')');
  // A10b 如实留账:history-search 在 LOAD_ORDER 里排在 retrieval 之后
  //   (它是 mentioned 边的可选源,缺席计 absent 不报错;但装载序上消费方早于被消费方是真缺陷)
  a(iHS > iRT, 'A10b: 如实留账 —— history-search(#' + iHS + ')在 LOAD_ORDER 排在 retrieval(#' + iRT + ')之后(可选源,非硬依赖)');
  // A11 诊断/面板各自单点
  a(cnt(D, ANCHOR.diagMod) === 1, 'A11: tool-diag 文件面映射恰 1 处');
  a(cnt(P, ANCHOR.pRenderer) === 1, 'A11b: RENDERERS 映射恰 1 处');
  a(cnt(P, ANCHOR.pPage) === 1, 'A11c: PAGES 登记恰 1 处');
  // A11d **三件齐**(D4 家族):渲染 + 绑定 + **守卫表登记**。
  //   渲染了不登记 ⇒ G18 逐页点击盘查只盘登记过的 id ⇒ 这一页九枚在**全部自动化里
  //   永不可见而门禁全绿**(N7/N8/N9 三轮各自踩过同一形态)。
  (function () {
    const m = D.match(/page: 'retrieval', ids: \[([\s\S]*?)\]/);
    const s2 = m ? m[1] : '';
    const miss = NEW_IDS.filter(function (id) { return s2.indexOf("'" + id + "'") < 0; });
    a(!!m && miss.length === 0, 'A11d: 守卫表登记了 retrieval 页的控件(缺:' + (miss.join(',') || '无') + ')');
    a(!!m && s2.indexOf("'wa-rt-out'") < 0 && D.indexOf("dynamic: ['wa-rt-out'") >= 0,
      'A11d2: 读数出口列在 dynamic(不混进静态 ids —— 出口与控件在盘查里是两件事)');
    a(D.indexOf("dynamic: ['wa-rt-out', 'wa-rt-edges']") >= 0,
      'A11d3: 两个动态面(读数出口 + 边契约行容器)都在 dynamic 里');
  })();
  // A11e 结果出口进 NAV_OUT_SELS(出口写完即补绑 / 切页后补绑)
  a(P.indexOf("'#wa-rt-out']") >= 0, 'A11e: wa-rt-out 登记进 NAV_OUT_SELS(否则切页后按钮静默失效)');
  // A12 锚点纯度(**由生成器读出**;逐键核恰 1 次)
  const badA = Object.keys(ANCHOR).filter(function (k) {
    const t = rd(TGT[k]);
    return cnt(t, ANCHOR[k]) !== 1;
  });
  a(badA.length === 0, 'A12: 破坏锚点在各自目标文件里恰中 1 次(纯度;不合 ' + badA.length + ' 个:'
    + badA.join(',') + ')');
  // A12b 锚点表自洽(H5/N8 同一把尺子)
  //   ⚠ 不许拿真换行去数整份文件(表里存的是**转义形**);正解:在**表切片内**数行首声明
  //     (判据不许引用自己的字面量)。
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
  // A14 三处上游来源如实登记(计划原文点名 —— 缝合来源必须可核)
  (function () {
    const missS = SOURCES_UPSTREAM.filter(function (k) { return E.indexOf(k) < 0; });
    a(missS.length === 0, 'A14: 三处上游来源逐条写在文件头(缺:' + (missS.join(',') || '无') + ')');
  })();
  // A15 设置注册面(与其余引擎同规格)
  a(cnt(E, ANCHOR.settingsReg) === 1, 'A15: 设置注册进 __settingsRegs 恰 1 处');
  a(E.indexOf("const LS_KEY = 'worldaxis_retrieval_v1';") >= 0, 'A15b: LS_KEY 与 inject 侧同源字面量');
  a(cnt(E, ANCHOR.register) === 1, 'A15c: registerModule 登记恰 1 处');

  /* ══════════════════ B 运行时 ══════════════════ */
  console.log('\n\u25a0 B 运行时:三边契约 / OR 规则 / 反转可检索 / 缺数据≠常态 / 有界不静默 / 面板端到端');
  const env = env0(null);
  const WA = env.WA;
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  resetSettings(WA);
  WA.store.init();
  a(!!WA.retrieval, 'B1: 引擎在运行时装载');
  a(WA.retrieval.VERSION === '2.228.0', 'B1b: 版本号与本次交付一致(实 ' + WA.retrieval.VERSION + ')');
  // B2 导出面 16 口 + 两常量
  const missRT = EXPORTS.filter(function (k) { return typeof WA.retrieval[k] === 'undefined'; });
  a(missRT.length === 0, 'B2: 运行时导出面齐备(缺:' + (missRT.join(',') || '无') + ')');
  a(Array.isArray(WA.retrieval.TRIGGERS) && WA.retrieval.TRIGGERS.length === 3, 'B2b: TRIGGERS 三值');
  a(Array.isArray(WA.retrieval.GUARDS) && WA.retrieval.GUARDS.length === 4, 'B2c: GUARDS 四值');
  a(WA.retrieval.SOURCE_NAME === '历史留存', 'B2d: SOURCE_NAME 与 inject-budget 登记同名');
  // B3 默认关:唯一产品出口返回空串
  WA.retrieval.setSettings({ enabled: false });
  a(WA.retrieval.buildBlock({ text: '钥匙' }) === '', 'B3: 关着时 buildBlock 返回空串');
  a(WA.retrieval.historyOf('').reason === 'missing-key', 'B3b: 空键拒收 missing-key(不猜一个键)');
  // B4 三边契约(**只核契约这一层**;源在 ≠ 已检索到东西)
  WA.retrieval.setSettings({ enabled: true });
  const cs = WA.retrieval.contracts();
  a(cs && cs.ok === true && cs.edges.length === 3, 'B4: contracts 返三边');
  a(cs.edges.every(function (e) { return typeof e.present === 'boolean' && typeof e.why === 'string'; }),
    'B4b: 每边都带 present / why(不合并成一句「接上了」)');
  a(cs.presentCount === cs.edges.filter(function (e) { return e.present; }).length
    && cs.total === cs.edges.length,
    'B4c: presentCount / total 与逐边读数同源(不自算一份)');
  a(cs.note.indexOf('源在') >= 0, 'B4d: contracts 自述「源在 ≠ 已检索到东西」');
  // B4e **scene 边真读 people**(D 家族结构错配的实测面):塞一个人进去,该边从 false 翻 true
  (function () {
    const before = WA.retrieval.contracts().edges.filter(function (e) { return e.edge === 'scene'; })[0];
    seedPerson(WA, 'p_n10', '甲', Date.now());
    const after = WA.retrieval.contracts().edges.filter(function (e) { return e.edge === 'scene'; })[0];
    a(before.present === false && after.present === true,
      'B4e: scene 边真读 `store.people`(塞一个人进去 ⇒ 该边 false\u2192true;实 '
      + before.present + '\u2192' + after.present + ')。按数组读会恒假 —— 这条就是那次错配的哨兵');
  })();
  // B5 **OR 而非 AND**(承重口径):只给「被提及」的 token、不给任何 cause ⇒ 仍须出候选
  (function () {
    seedFact(WA, '钥匙', '在甲手里', '已还给乙', Date.now());
    const c = WA.retrieval.candidates({ text: '钥匙' });
    a(c.ok === true && c.total >= 1, 'B5: OR 规则 —— 只有提及、零 cause,仍出候选(实 total ' + c.total + ')');
    a(c.counts.mentioned >= 1 && c.counts.causal === 0,
      'B5b: 命中落在 mentioned 边、causal 边为零(逐边分列,不合并成一句「有相关」)');
    a(c.rows.some(function (r) { return r.trigger === 'mentioned'; }), 'B5c: 候选行带 trigger 标签');
    a(c.note.indexOf('OR 规则') >= 0 || c.note.indexOf('任一') >= 0, 'B5d: 读数自述 OR 规则');
  })();
  // B6 **反转不等于没发生**(本版核心口径):旧值 active:false 必须可检索、且与当前值**分列**
  (function () {
    const h = WA.retrieval.historyOf('钥匙');
    a(h.ok === true && h.chainLength === 2, 'B6: historyOf 给出**全版本链**(实 ' + h.chainLength + ' 版)');
    a(h.reverted === true && h.replaced === 1, 'B6b: 曾被替换如实报(reverted / replaced)');
    a(h.versions.some(function (v) { return v.active === false; })
      && h.versions.some(function (v) { return v.active === true; }),
      'B6c: **当前值与失效旧值分列**(不是只给当前值 —— 那正是「还了钥匙抹掉偷过钥匙」)')
    a(h.current && h.current.active === true && h.current.value === '已还给乙',
      'B6d: current 指向 active 版本(与链尾不混)');
    a(h.note.indexOf('不替代') >= 0 || h.note.indexOf('旧值') >= 0, 'B6e: 读数自述「当前值不替代历史」');
    const h2 = WA.retrieval.historyOf('钥匙', { includeInactive: false });
    a(h2.chainLength === 2 && h2.versions.length === 1,
      'B6f: includeInactive:false 只影响**返回行数**,chainLength 仍如实报全链长度(不谎报链长)');
  })();
  // B7 **缺数据≠常态**:查无结果显式标 absent
  (function () {
    const h = WA.retrieval.historyOf('__n10_no_such_key__');
    a(h.ok === true && h.absent === true && h.chainLength === 0, 'B7: 查无此键显式标 absent(不是 ok:false,也不当成「没有」)')
    a(h.note.indexOf('不是') >= 0, 'B7b: 读数自述「账上没有 ≠ 从未发生」');
    const c = WA.retrieval.candidates({ text: '__n10_no_such_text__' });
    a(c.ok === true && c.empty === true && c.total === 0, 'B7c: 无命中显式成 empty 态');
    a(c.note.indexOf('没发生过') >= 0, 'B7d: 读数自述「没检索到 ≠ 没发生过」');
  })();
  // B8 四类看门逐类可复算
  const au = WA.retrieval.audit({ text: '钥匙' });
  a(au.guardCounts && GUARDS.every(function (g) { return typeof au.guardCounts[g] === 'number'; }),
    'B8: 四类看门逐类出数(不合并)');
  a(au.verdict !== 'ready' || au.reasons.length === 0,
    'B8b: verdict=ready 当且仅当 reasons 为空(实 ' + j(au.reasons) + ')');
  a(Array.isArray(au.guards.absent) && Array.isArray(au.guards.stale)
    && Array.isArray(au.guards.unranked) && Array.isArray(au.guards['empty-lookup']),
    'B8c: 四类看门各自出列表(不是一个总数)');
  // B8d **死看门哨兵**(D2 真缺陷):造一条**超窗**事实 ⇒ stale 必须报出来
  //   ⚠ 首版从 `c.rows` 里数 stale,而 rows 是**过滤后**的(超窗已被滤掉)⇒ 恒零。
  //     这一条在原版上数 0、在修后数 1 —— 两向都记在判据里。
  (function () {
    const OLD = Date.now() - 400 * 24 * 3600 * 1000;
    WA.store.transact(function (d) {
      d.memory.facts.push({ key: '旧事', value: '很久以前', version: 1, active: true, reason: 'old', at: OLD });
    }, 'n10:old');
    const au2 = WA.retrieval.audit({ text: '旧事' });
    a(au2.guardCounts.stale >= 1,
      'B8d: **超窗事实必须被 stale 看门数到**(实 ' + au2.guardCounts.stale + ')。恒零 = 四类里有一类形同不存在');
    a(au2.guards.stale.indexOf('fact:旧事') >= 0, 'B8e: stale 列表给出具体键(不是只给个数)');
    const c2 = WA.retrieval.candidates({ text: '旧事' });
    a(c2.staleDropped === 1 && c2.staleKeys.indexOf('fact:旧事') >= 0,
      'B8f: candidates 在**过滤前**留超窗读数(staleDropped/staleKeys —— 看门数的就是这批)');
    const c3 = WA.retrieval.candidates({ text: '旧事' }, { includeStale: true });
    a(c3.total === 1 && c3.rows[0].stale === true,
      'B8g: includeStale:true 时超窗行**仍可取出**(被滤掉 ≠ 不存在)');
  })();
  // B9 **有界不静默**(口径 4)
  (function () {
    const many = [];
    for (let i = 0; i < 60; i++) many.push({ trigger: 'mentioned', key: 'k' + i, text: '第' + i + '条' + '很长很长'.repeat(20) });
    const a1 = WA.retrieval.assemble({ rows: many }, { maxRows: 60, maxChars: 600 });
    a(a1.ok === true, 'B9: assemble 出包');
    a(a1.capacity === true && a1.mode === 'capacity', 'B9b: 压不下时**显式报** capacity(不静默丢)');
    a(a1.chars <= 600, 'B9c: capacity 态仍**硬截断进预算**(实 ' + a1.chars + ' \u2264 600)—— 「有界」是硬上界,不是许可证');
    a(a1.note.indexOf('容量') >= 0 || a1.note.indexOf('预算') >= 0, 'B9d: 读数自述「被预算丢掉 ≠ 本来就没有」');
    // 装得下时:逐级压紧(先全文,再 compact)
    const few = many.slice(0, 3).map(function (x) { return { trigger: x.trigger, key: x.key, text: '短' }; });
    const a2 = WA.retrieval.assemble({ rows: few }, { maxRows: 10, maxChars: 600 });
    a(a2.capacity === false && a2.mode === 'full', 'B9e: 装得下 ⇒ mode full、capacity false');
    const mid = many.slice(0, 12);
    const a3 = WA.retrieval.assemble({ rows: mid }, { maxRows: 20, maxChars: 900 });
    a(a3.capacity === false && a3.mode === 'compact', 'B9f: 需压紧才装下 ⇒ mode compact(压紧保留事实,只压缩表述)');
    a(a3.rowsOut === 12, 'B9g: 压紧不丢行(行数照给,丢的只是字数)');
    // 行数上限:超出如实计入 dropped
    const a4 = WA.retrieval.assemble({ rows: many }, { maxRows: 5, maxChars: 60000 });
    a(a4.rowsOut === 5 && a4.dropped === 55, 'B9h: 超行数上限如实计入 dropped(实 ' + a4.rowsOut + ' / dropped ' + a4.dropped + ')');
  })();
  // B10 unranked 看门:真判据是 **PRIORITY 键集**(不是 rankOf —— 它对未登记源返回 DEFAULT_RANK)
  (function () {
    a(!!WA.injectBudget && !!WA.injectBudget.PRIORITY, 'B10: inject-budget 的 PRIORITY 面在场');
    a(WA.injectBudget.PRIORITY['历史留存'] !== undefined,
      'B10b: 本模块的注入源已登记进 PRIORITY(与 SOURCE_NAME 逐字同键)');
    a(typeof WA.injectBudget.priorityOf === 'undefined',
      'B10c: 如实留账 —— `priorityOf` 在全仓**不存在**(首版按想当然引它);判据是 PRIORITY 键集');
    const au3 = WA.retrieval.audit({ text: '钥匙' });
    a(au3.guardCounts.unranked === 0, 'B10d: 已登记 ⇒ unranked 看门为零(实 ' + au3.guardCounts.unranked + ')');
  })();
  // B11 注入块(唯一产品出口):开+有命中 ⇒ 出块;且标签是 TAG 常量
  (function () {
    const bb = WA.retrieval.buildBlock({ text: '钥匙' });
    a(typeof bb === 'string' && bb.length > 0, 'B11: 开+有命中 ⇒ buildBlock 出块(实 ' + bb.length + ' 字符)');
    a(bb.indexOf('<world_axis_history>') === 0 && bb.indexOf('</world_axis_history>') > 0,
      'B11b: 块以 TAG 常量包裹(首尾各一次)');
    a(cnt(bb, '<world_axis_history>') === 1 && cnt(bb, '</world_axis_history>') === 1,
      'B11c: 标签不重复(嵌套会破宿主解析)');
    a(bb.indexOf('钥匙') >= 0, 'B11d: 命中内容真进块(不是空壳)');
    a(WA.retrieval.buildBlock({ text: '__n10_no_such_text__' }) === '',
      'B11e: 无命中 ⇒ 返回空串(不产空壳、不占预算)');
  })();
  // B12 stat / reset
  (function () {
    const st = WA.retrieval.stat();
    a(st.enabled === true && st.triggers === 3 && st.guards === 4, 'B12: stat 报开关与两个封闭集合的长度');
    a(typeof st.calls === 'number' && st.calls > 0, 'B12b: stat 计数非零(真在数)');
    const r = WA.retrieval.reset();
    a(r.ok === true && WA.retrieval.stat().calls === 0, 'B12c: reset 清零计数');
    a(WA.retrieval.stat().enabled === true, 'B12d: reset **不动设置**(清的是计数,不是配置)');
  })();
  // B13 面板端到端:retrieval 页控件渲染 + 绑定在场
  const pg = (WA.ui && WA.ui.pages) ? WA.ui.pages() : [];
  a(pg.indexOf('retrieval') >= 0, 'B13: retrieval 页在页面清单里');
  const chk = gate.checkPages(env, function (doc) { return doc; });
  const sfail = (chk.failures || []).filter(function (x) { return x.indexOf('retrieval') >= 0; });
  a(sfail.length === 0, 'B13b: retrieval 页渲染无失败(实 ' + sfail.length + ': ' + sfail.join(' | ') + ')');
  const dom = env.dom;
  //  ⚠ 控件只在本页**被点开**时才渲染(buildPanel 逐页构建):不点页签就 getElementById
  //    必然九枚全缺。这与 N8/N9 同一根:**绑定页必须等于渲染页**。
  gotoPage(env, 'retrieval');
  const missDom = NEW_IDS.filter(function (id) { return !dom.getElementById(id); });
  a(missDom.length === 0, 'B13c: 九个新控件都在场(缺:' + (missDom.join(',') || '无') + ')');
  const noHandler = BTN_IDS.filter(function (id) {
    const el = dom.getElementById(id);
    return !el || typeof el.onclick !== 'function';
  });
  a(noHandler.length === 0, 'B13d: 六枚按钮的 onclick 都装上(无:' + (noHandler.join(',') || '无') + ')');
  // B13e 端到端真点一次:核契约
  (function () {
    const out = fire(dom, 'wa-rt-contracts');
    a(out !== null && out.length > 0, 'B13e: 点「核契约」有读数回显(实 ' + (out ? out.length : 0) + ' 字符)');
    a(out && (out.indexOf('边在场') >= 0 || out.indexOf('\u5728\u573a') >= 0), 'B13f: 回显含逐边在场读数');
    const out2 = fire(dom, 'wa-rt-audit');
    a(out2 !== null && out2.length > 0, 'B13g: 点「看门审计」有读数回显');
    const out3 = fire(dom, 'wa-rt-stat');
    a(out3 !== null && out3.length > 0, 'B13h: 点「诊断」有读数回显');
    const out4 = fire(dom, 'wa-rt-reset');
    a(out4 !== null && out4.length > 0, 'B13i: 点「清零计数」有读数回显');
    setv(dom, 'wa-rt-key', '钥匙');
    const out5 = fire(dom, 'wa-rt-history');
    a(out5 !== null && out5.length > 0, 'B13j: 点「查历史链」有读数回显');
    a(out5 && (out5.indexOf('替换') >= 0 || out5.indexOf('版本') >= 0), 'B13k: 回显含全版本链读数');
    setv(dom, 'wa-rt-text', '钥匙');
    const out6 = fire(dom, 'wa-rt-cand');
    a(out6 !== null && out6.length > 0, 'B13l: 点「列候选」有读数回显');
  })();

  /* ══════════════════ C 零泄漏不变式 ══════════════════ */
  console.log('\n\u25a0 C 零泄漏不变式:live 存档与 localStorage 都是**实测差**');
  const snapOf = function () { return JSON.stringify(WA.store.get()); };
  const before = snapOf();
  WA.retrieval.contracts(); WA.retrieval.candidates({ text: '钥匙' });
  WA.retrieval.historyOf('钥匙'); WA.retrieval.audit({ text: '钥匙' });
  WA.retrieval.assemble({ rows: [] }, {}); WA.retrieval.stat(); WA.retrieval.buildBlock({ text: '钥匙' });
  a(snapOf() === before, 'C1: 七个口跑一遍 ⇒ live 存档逐字未变(实测差,不是声明)');
  const b2 = snapOf();
  WA.retrieval.candidates({}); WA.retrieval.contracts(); WA.retrieval.audit({});
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
  WA.retrieval.contracts(); WA.retrieval.candidates({}); WA.retrieval.historyOf('钥匙');
  WA.retrieval.audit({}); WA.retrieval.buildBlock({ text: '钥匙' });
  const lk1 = lsKeys();
  a(JSON.stringify(lk0) === JSON.stringify(lk1), 'C2: 只读口不改 localStorage 任何键(实测差)');
  // C2b 设置**该写**(那是配置,不是世界):写一次必须真落盘
  WA.retrieval.setSettings({ maxRows: 12 });
  a(WA.retrieval.getSettings().maxRows === 12, 'C2b: 设置项真落盘(配置写是该写的 —— 与 C1 的「世界零写」是两件事)');
  a(lsKeys()['worldaxis_retrieval_v1'] !== undefined, 'C2c: 设置落在自己的 LS_KEY 下(不串到别的模块)');
  // C3 本模块零自有世界键
  const topKeys = Object.keys(WA.store.get());
  a(topKeys.indexOf('retrieval') < 0, 'C3: 本模块不新增世界顶层键(零自有世界状态)');

  /* ══════════════════ N 负控制 ══════════════════ */
  console.log('\n\u25a0 N 负控制:真源码破坏 → 装载破坏副本 → 重跑同款判据');
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
  a(cnt(E, ANCHOR.triggersDecl) === 1 && cnt(E, ANCHOR.guardsDecl) === 1,
    'N0: 边集合 / 看门集合锚点各恰 1 次(纯度)');
  // N1 破坏:把「三边」砍成两边 ⇒ B4 的三边判据必现形
  (function () {
    const E2 = E.replace(ANCHOR.triggersDecl, "\n  const TRIGGERS = ['causal', 'mentioned'];");
    a(E2 !== E, 'N1a: 破坏可落地');
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA);
    const cs = WA.retrieval.contracts();
    a(cs.edges.length === 2, 'N1b: 破坏版上 contracts 只出 2 边(原版为 3,两向自证)');
    a(cs.edges.length !== 3, 'N1c: 同款判据在原版为真、破坏版为假(两向)');
  })();
  // N2 破坏:把「四类看门」砍成三类 ⇒ B8 的逐类判据必现形
  (function () {
    const E2 = E.replace(ANCHOR.guardsDecl, "\n  const GUARDS = ['absent', 'stale', 'unranked'];");
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA);
    const au = WA.retrieval.audit({ text: '钥匙' });
    a(!au.guardCounts['empty-lookup'] && typeof au.guardCounts['empty-lookup'] !== 'number',
      'N2: 破坏版上 empty-lookup 看门消失(原版四类齐 ⇒ 两向)');
  })();
  // N3 破坏:把注入源显示名改掉 ⇒ 与 inject-budget 的登记键失配,unranked 看门必现形
  (function () {
    const E2 = E.replace(ANCHOR.sourceName, "\n  const SOURCE_NAME = '\u5386\u53f2\u7559\u5b58X';").replace('\n  const SOURCE_NAME = ', '\n  const SOURCE_NAME = ', 1);
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA);
    const au = WA.retrieval.audit({ text: '钥匙' });
    a(au.guardCounts.unranked >= 1,
      'N3: 破坏版上「注入源名与 PRIORITY 键失配」被 unranked 看门数到(原版为 0 ⇒ 两向)');
  })();
  // N4 破坏:去掉「关着时返回空串」守卫 ⇒ 关闭态判据必现形
  (function () {
    const A = "      if (!cfg.enabled) return '';\n";
    a(cnt(E, A) === 1, 'N4a: disabled 守卫锚点恰 1 次');
    const E2 = E.replace(A, '');
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA);
    WA.retrieval.setSettings({ enabled: false });
    WA.store.transact(function (d) {
      d.memory = d.memory || {}; d.memory.facts = d.memory.facts || [];
      d.memory.facts.push({ key: '钥匙', value: '在甲手里', version: 1, active: true, reason: 'x', at: Date.now() });
    }, 'n10:neg4');
    const bb = WA.retrieval.buildBlock({ text: '钥匙' });
    a(bb !== '', 'N4: 破坏版上关着也照出块(原版必返空串 ⇒ 两向)');
  })();
  // N5 破坏:把 stale 看门改回「从过滤后的 rows 里数」⇒ B8d 死看门哨兵必现形
  (function () {
    const A = "    guards.stale = (c.staleKeys || []).slice();";
    a(cnt(E, A) === 1, 'N5a: stale 看门锚点恰 1 次');
    const E2 = E.replace(A, "    guards.stale = c.rows.filter(function (r) { return r.stale; }).map(function (r) { return r.key; });");
    const env = negEnv(E2); const WA = env.WA;
    resetSettings(WA);
    WA.retrieval.setSettings({ enabled: true });
    WA.store.transact(function (d) {
      d.memory = d.memory || {}; d.memory.facts = d.memory.facts || [];
      d.memory.facts.push({ key: '旧事', value: '很久以前', version: 1, active: true, reason: 'old', at: Date.now() - 400 * 24 * 3600 * 1000 });
    }, 'n10:neg5');
    const au = WA.retrieval.audit({ text: '旧事' });
    a(au.guardCounts.stale === 0,
      'N5: 破坏版上 stale 看门回到恒零(原版数到 1 ⇒ 两向自证「死看门」真的被修掉了)');
  })();
  // N6 工具两向自证:锚点不存在 / 不唯一都抛
  let threw = false;
  try { brk('THIS-DOES-NOT-EXIST-N10'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N6: 锚点不存在必须抛(不静默 0 命中)');
  threw = false;
  try { brk('ed'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N6b: 锚点不唯一必须抛');
  // N7 真源码逐字未变(破坏只发生在内存副本上)
  a(rd(ENG_REL) === E, 'N7: 被破坏过的引擎真源码逐字未变');
  a(rd(ENG_REL).indexOf('>> CUT <<') < 0, 'N7b: 引擎真源码里没有 CUT 标记');
  a(rd(PANEL_REL).indexOf('>> CUT <<') < 0, 'N7c: 面板真源码里没有 CUT 标记');
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
  console.log('\nS3-B4-N10-V2228: ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
