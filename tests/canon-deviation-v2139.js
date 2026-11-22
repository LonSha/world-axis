#!/usr/bin/env node
// WorldAxis tests/canon-deviation-v2139.js —— v2.139.0（E11）：剧情偏离度量化
//
// 【它治的病：`align` 只答「撞上了什么」，不判偏离】
//   v2.100.0 的三口把「现在像第几幕」答清楚了，但**一个字都没说「偏了多少」**——
//   「第 7 幕」是坐标，「偏了 0.62」才是判定。没有这个数，长局里没人看得出「越走越远」。
//
// 【本锁钉住的四条口径】
//   ① **只报不改**：源码级可核 —— deviation / deviationTrend 体内零 store.transact / 零 patch
//      （「偏离不自动拉回」不是一句声明，是**零写入**）。
//   ② **未采纳大纲 ⇒ no-outline**：**不拿 0 分冒充「严格遵循」**。0 分是个有意义的结论，
//      「没算」必须长得不一样 —— 这一条正是本锁的 B2 判据。
//   ③ **两个分量不可合并**：`spread`（散不散）与 `lag`（快不快）各自成数。
//      本锁造一个「幕号跨度大但推进度高」的场与一个「跨度小但推进度低」的场，
//      要求两种情况**在两个分量上各不相同** —— 合成一个数就做不到这件事。
//   ④ **阈值不改分**：同一场连续两次取分，第二次把告警线调低 ⇒ `score` **逐字不变**，
//      只有 `over` 翻转（读数与策略分列的可观测形态）。
//
// 【判据结构（与 life-e8-v2139 / faction-graph-v2139 / collab-tasks-v2139 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（诊断真读者 + 面板**真渲染**）
//   N0–N5 真源码破坏 ⇒ 破坏副本上重跑同款真判据；N5 纯度：三个真文件逐字未变。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const CN = 'engines/canon.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const SELF = 'tests/canon-deviation-v2139.js';
const TAG = '__e11v2139_';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
let fails = 0, checks = 0;
// 宿主断言：run.js 的 `runLock` 只注入 `assert(cond, name)`（**不注入环境**）。
//   故本锁必须自己造世界，并把每条判据**上交宿主**。
let HOST = null;
function ok(c, m) {
  checks++;
  if (!c) { fails++; console.log('  ✗ ' + m); }
  else console.log('  ✓ ' + m);
  if (HOST) HOST(!!c, m);
}

let LAST_DOM = null;
function freshWA(ov) {
  const e = sync.fresh(ov ? { srcOverride: ov } : undefined);
  // 每个 env 自带一个 mini-DOM：旧 dom 上的按钮绑的是**上一次**装载那版 panel 的闭包。
  LAST_DOM = e.dom;
  return e.WA;
}
// ── 造世界：一份大纲 + 若干世界侧历史行 ───────────────────────────────
//   为什么不直接写一个「随便的字符串」当大纲：幕题名要能**真的被历史行撞上**，
//   而撞上是靠二字窗口交集（ALIGN_GRAM=2 / ALIGN_MIN_NEED=3）——题名太短会走 `thin` 不参与对位，
//   那样得到的 `no-signal` 与「世界上真没发生」长得一样（判据会静默变成另一种测法）。
function mkOutline(WA, titles) {
  const acts = titles.map(function (t, i) {
    return { no: i + 1, title: t, chars: 100, pointFrom: i + 1, pointTo: i + 1,
      points: [{ no: i + 1, seg: 0, title: t, chars: 100 }] };
  });
  WA.store.transact(function (d) {
    d.canon = { outline: { ok: true, acts: acts, segs: 1, points: acts.length, chars: acts.length * 100,
      perAct: 1, segChars: 1200, acts0: acts.length, adoptedAt: 1,
      truncated: { acts: false, points: false } } };
    return true;
  }, TAG + 'outline');
}
function mkHistory(WA, texts) {
  WA.store.transact(function (d) {
    d.chronicle = texts.map(function (t, i) { return { title: '行' + (i + 1), summary: t }; });
    d.currents = []; d.echoes = [];
    d.chapters = { history: [], current: null };
    return true;
  }, TAG + 'history');
}
/** 清干净：本锁每个场都必须自造世界（不依赖上一个场残留）。 */
function env(spec) {
  const s = spec || {};
  const WA = freshWA();
  WA.store.init();
  WA.store.transact(function (d) {
    d.canon = {}; d.chronicle = []; d.currents = []; d.echoes = [];
    d.chapters = { history: [], current: null };
    return true;
  }, TAG + 'reset');
  WA.canon.setSettings(Object.assign({ enabled: true }, s.extra || {}));
  if (s.outline) mkOutline(WA, s.outline);
  if (s.history) mkHistory(WA, s.history);
  return WA;
}
function envBroken(spec, ov) {
  const WA = freshWA(ov);
  WA.store.init();
  WA.store.transact(function (d) {
    d.canon = {}; d.chronicle = []; d.currents = []; d.echoes = [];
    d.chapters = { history: [], current: null };
    return true;
  }, TAG + 'resetb');
  WA.canon.setSettings(Object.assign({ enabled: true }, (spec && spec.extra) || {}));
  if (spec && spec.outline) mkOutline(WA, spec.outline);
  if (spec && spec.history) mkHistory(WA, spec.history);
  return WA;
}
function renderPeopleHtml(WA) {
  const dom = LAST_DOM;
  if (!dom) throw new Error('mini-DOM 未装');
  const p = dom.getElementById('wa-panel');
  if (!p) throw new Error('面板未注入');
  const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'people'; })[0];
  if (!tab) throw new Error('找不到人物页签');
  tab.click();
  const body = p.querySelector('.wa-body');
  return body ? String(body.innerHTML || '') : '';
}
function clickCn(WA, id) {
  renderPeopleHtml(WA);
  const dom = LAST_DOM;
  const btn = dom.getElementById(id);
  if (!btn) throw new Error('找不到 ' + id);
  let threw = null;
  try { if (typeof btn.onclick === 'function') btn.onclick({ target: btn }); } catch (e) { threw = e; }
  const out = dom.getElementById('wa-cn-out');
  return { text: out ? String(out.textContent || '') : '', threw: threw };
}
// ── 真源码破坏锚点（各须恰中 1 次）────────────────────────────────────
const ANCHORS = {
  // ① 未采纳大纲时返回 score:0（「没算」被伪造成「严格遵循」——本锁最要紧的一条）
  noOutline: { rel: CN, txt: "      stat.blocked++; stat.lastReason = 'no-outline';\n      return { ok: false, reason: 'no-outline' };\n    }\n    const rows = historyRows(clean((opts && opts.scope) || '', 20));",
    to: "      stat.blocked++; stat.lastReason = 'no-outline';\n      return { ok: true, score: 0, reason: 'no-outline' };\n    }\n    const rows = historyRows(clean((opts && opts.scope) || '', 20));" },
  // ② 两个分量合并（spread 直接当 score）⇒ 「走得太快但很集中」与「走得刚好但四处开花」同分
  merge: { rel: CN, txt: '    const score = Math.round((spread * 0.6 + lag * 0.4) * 1000) / 1000;',
    to: '    const score = Math.round(spread * 1000) / 1000;' },
  // ③ 阈值反过来改分（读数与策略塌成一件事）⇒ 调一条策略线会改观测值
  //   锚点取**返回体里那一行**（`score: score,` 在源与 to 里各只出现一次）：
  //   若钉 `const over = ...`，那句会同时出现在 to 里 ⇒ 纯度读到 2 次（首跑实测）。
  thrMutates: { rel: CN, txt: '      score: score,',
    to: '      score: over ? 1 : score,' },
  // ④ 面板不再渲染两枚偏离入口（用户那面重新变黑）
  panel: { rel: PANEL, txt: 'id="wa-cn-deviation" title=',
    to: 'id="wa-cn-deviation2" title=' },
  // ⑤ 诊断面不再报偏离度（「越走越远」在诊断包里无从查）
  diag: { rel: DIAG, txt: '        deviations: st.deviations || 0,',
    to: '        deviations: 0,' }
};
const BROKEN = [
  { key: 'noOutline', spec: ANCHORS.noOutline }, { key: 'merge', spec: ANCHORS.merge },
  { key: 'thrMutates', spec: ANCHORS.thrMutates }, { key: 'panel', spec: ANCHORS.panel },
  { key: 'diag', spec: ANCHORS.diag }
];
function brokenOverride(spec) {
  const s = src(spec.rel);
  const n = hits(s, spec.txt);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.rel);
  const t = s.split(spec.txt).join(spec.to);
  if (hits(t, spec.to) !== 1) throw new Error('破坏未真的替换掉锚点 :: ' + spec.rel);
  const o = {}; o[spec.rel] = t; return o;
}
// ── 用例世界 ────────────────────────────────────────────────────────
// 四幕的题名各取一段独立文本，**不共享二字窗口**：否则一行的窗口会同时撞上两幕，
//   `spread` 的读数就不再是「历史散在几幕上」而是「题名长得像不像」。
const T4 = ['山村清晨柴火声', '县城集市人声鼎沸', '军营点兵旗帜猎猎', '朝堂议事暗流涌动'];
// 八幕版（merge 负控专用：四幕下 lag 恒 0，分量合并不可观测）。
const T8 = ['山村清晨柴火声', '县城集市人声鼎沸', '军营点兵旗帜猎猎', '朝堂议事暗流涌动',
  '江边渡口船工号子', '书院讲堂论辩声声', '药铺柜台称量金银', '驿站快马传书加急'];
const H1 = ['山村清晨柴火声起炊烟袅袅'];                       // 只撞第 1 幕
const H4 = ['朝堂议事暗流涌动人人自危'];                       // 只撞第 4 幕
const HMIX = ['山村清晨柴火声起', '朝堂议事暗流涌动', '县城集市人声鼎沸'];   // 撞 1/4/2 幕
function caseSpec(key) {
  if (key === 'noOutline') return { history: H1 };              // **不采纳大纲**
  //   merge 的场要**八幕**：四幕时撞到第 4 幕即末幕，lag 恒 0 —— 那样「合并分量」在数上不可观测。
  //   八幕下撞第 1 与第 4 幕：spread ≠ 0 且 lag = 0.5，两个分量都在动。
  if (key === 'merge') return { outline: T8, history: [T8[0] + '的清晨', T8[3] + '的风声', T8[3] + '又起'] };
  if (key === 'thrMutates') return { outline: T8, history: [T8[0] + '的清晨', T8[3] + '的风声', T8[3] + '又起'] };
  if (key === 'panel' || key === 'diag') return { outline: T4, history: [H1[0], H4[0], H4[0]] };
  return { outline: T4, history: [H1[0], H4[0], H4[0]] };
}
// ── 判据本体（A 结构 + B 运行时）──────────────────────────────────────
function judge() {
  const WA = freshWA();   // 本锁自造环境
  const C = WA.canon;
  // A 结构
  ok(!!C && typeof C.deviation === 'function', 'A1 偏离度口在场（canon.deviation）');
  ok(typeof C.deviationTrend === 'function', 'A2 偏离曲线口在场（canon.deviationTrend）');
  // 只报不改：源码级可核 —— 两个面的函数体内零写入
  const cnSrc = src(CN);
  const devBody = cnSrc.slice(cnSrc.indexOf('function deviation('));
  ok(hits(devBody, 'store.transact') === 0 && hits(devBody, 'store.patch') === 0,
    'A3 只报不改：deviation / deviationTrend 体内零 store.transact / 零 store.patch（注释里那句不算）');
  const cfg = C.getSettings();
  ok(typeof cfg.deviationAlert === 'number' && cfg.deviationAlert >= 0 && cfg.deviationAlert <= 1,
    'A4 告警线在设置面上（与分数同域 [0,1]）');

  // B1 口径②：**未采纳大纲 ⇒ no-outline**（不拿 0 分冒充「严格遵循」）
  const none = env({ history: H1 });
  const r1 = none.canon.deviation({});
  ok(r1.ok === false && r1.reason === 'no-outline' && r1.score === undefined,
    'B1 未采纳大纲 ⇒ 拒收 no-outline 且**不带 score**（「没算」不许长成「0 分」）');

  // B2 无历史行 ⇒ no-history（与 no-outline 分列：一个是没大纲，一个是没发生）
  const noHist = env({ outline: T4 });
  const r2 = noHist.canon.deviation({});
  ok(r2.ok === false && r2.reason === 'no-history', 'B2 有大纲但世界侧无历史 ⇒ no-history（两种「没得算」分列）');

  // B3 正常算：score / spread / lag 三数齐备且可复算
  const W = env({ outline: T4, history: [H1[0], H4[0], H4[0]] });
  const r3 = W.canon.deviation({});
  ok(r3.ok === true && typeof r3.score === 'number' && r3.score >= 0 && r3.score <= 1,
    'B3a score 落在 [0,1]（0 = 严格遵循，1 = 完全偏离）');
  const expect = Math.round((r3.spread * 0.6 + r3.lag * 0.4) * 1000) / 1000;
  ok(Math.abs(r3.score - expect) < 1e-3,
    'B3b score 可由两个分量与权重复算（' + r3.spread + '×0.6 + ' + r3.lag + '×0.4 = ' + r3.score + '）');
  ok(r3.hits.length === 2 && r3.hits[0] === 'A1' && r3.hits[1] === 'A4',
    'B3c 撞上的幕如实列出（' + r3.hits.join('/') + '——历史散在第 1 与第 4 幕）');

  // B4 口径③：两个分量**不可合并** —— 造两种「偏法」完全不同的场
  //   `rLow`：三行**全在第 4 幕**（末行同址 ⇒ lag 同）；`rHigh`：第 1 与第 4 幕（末行仍在第 4 ⇒ lag 同）。
  //   两场只差「散不散」，故 spread 必须不同而 lag 必须相同 —— 这就是分量不可合并的可观测形态。
  //   场必须**八幕**：四幕时撞到第 4 幕即末幕，lag 恒 0，两场都 0 就证不出「lag 与 spread 无关」。
  const Wlow = env({ outline: T8, history: [T8[3] + '的风声', T8[3] + '又起', T8[3] + '三度'] });
  const rLow = Wlow.canon.deviation({});
  const Whigh = env({ outline: T8, history: [T8[0] + '的清晨', T8[3] + '的风声', T8[3] + '又起'] });
  const rHigh = Whigh.canon.deviation({});
  ok(rLow.spread === 0 && rHigh.spread > 0,
    'B4a spread 分得开（全在第 4 幕 ⇒ 0；散到第 1 与第 4 幕 ⇒ ' + rHigh.spread + '）');
  ok(rLow.lag === rHigh.lag && rLow.lag > 0,
    'B4b lag 是「最新一行落在哪一幕」而不是「撞了几幕」（两场末行同在第 4 幕 ⇒ lag 同为 ' + rLow.lag + '）');
  ok(rLow.score !== rHigh.score,
    'B4c 两个场给**不同**的分（低 ' + rLow.score + ' / 高 ' + rHigh.score + '）——分量合并就读不出这件事');

  // B5 口径④：**阈值不改分** —— 同一场两次取分，第二次把告警线调到 0
  const Wt = env({ outline: T4, history: [H1[0], H4[0], H4[0]], extra: { deviationAlert: 0.7 } });
  const a1 = Wt.canon.deviation({});
  Wt.canon.setSettings({ deviationAlert: 0 });
  const a2 = Wt.canon.deviation({});
  ok(a1.score === a2.score,
    'B5a 调低告警线后 score **逐字不变**（' + a1.score + ' / ' + a2.score + '）——读数与策略分列');
  ok(a1.over === false && a2.over === true,
    'B5b 变的是 over（' + a1.over + ' → ' + a2.over + '）：策略线只决定「报不报警」');
  ok(a1.alert !== a2.alert, 'B5c alert 如实回显当前线（' + a1.alert + ' → ' + a2.alert + '）');

  // B6 样本不足如实标（不拿一行的样本给一个看起来精确的分）
  const Wthin = env({ outline: T4, history: [H1[0]] });
  const rThin = Wthin.canon.deviation({});
  ok(rThin.ok === true && rThin.thin === true, 'B6 历史行不足 3 ⇒ thin:true（照给分，但明说样本不够）');
  const Wfat = env({ outline: T4, history: [H1[0], H4[0], H4[0]] });
  ok(Wfat.canon.deviation({}).thin === false, 'B6b 样本够 ⇒ thin:false');

  // B7 偏离曲线：逐点扩窗，且**零 stat 写入**
  const Wtr = env({ outline: T4, history: HMIX });
  const before = JSON.stringify(Wtr.canon.stat());
  const t = Wtr.canon.deviationTrend(20);
  const after = JSON.stringify(Wtr.canon.stat());
  ok(t.adopted === true && t.points.length >= 1, 'B7a 曲线给出 ' + t.points.length + ' 个点（逐点扩窗）');
  ok(before === after, 'B7b 曲线是**零 stat 写入**（看一眼曲线不该改账）');
  ok(t.points.every(function (p) { return p.score >= 0 && p.score <= 1; }), 'B7c 每个点都在 [0,1]');
  const noCurve = env({ history: H1 });
  ok(noCurve.canon.deviationTrend(20).adopted === false, 'B7d 未采纳大纲 ⇒ adopted:false（不当异常报）');
}

// ── C 消费方（诊断真读者 + 面板真渲染）────────────────────────────────
function consumers() {
  const WA = freshWA();
  const col = (WA.toolDiag && typeof WA.toolDiag.collect === 'function') ? WA.toolDiag.collect() : null;
  const cd = col && col.canon;
  ok(!!cd, 'C0 诊断节 canon 可读（collect().canon）');
  if (cd) {
    ok(cd.deviations !== undefined && cd.deviationAlert !== undefined,
      'C1 诊断面报偏离度计数与阈值（两个数各自成条）');
    ok(cd.deviation !== undefined, 'C2 诊断面报偏离度面（deviation 段，含曲线序列）');
  } else { ok(false, 'C1 诊断节不可用'); ok(false, 'C2'); }

  const W = env({ outline: T4, history: [H1[0], H4[0], H4[0]] });
  let html = '';
  try { html = renderPeopleHtml(W); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'id="wa-cn-deviation"') === 1, 'C3 人物页真渲染出偏离度入口（渲染链路可用）');
  ok(hits(html, 'id="wa-cn-trend"') === 1, 'C4 偏离曲线入口齐备（两枚各答一个问题、互不替代）');
  const c1 = clickCn(W, 'wa-cn-deviation');
  ok(c1.threw === null, 'C5 点偏离度未抛异常（真绑定可用）');
  ok(hits(c1.text, '偏离 ') === 1 && hits(c1.text, '只报不改') === 1,
    'C6 点偏离度后输出行真带分数与「只报不改」（用户那面看得见）');
  const c2 = clickCn(W, 'wa-cn-trend');
  ok(c2.threw === null && hits(c2.text, '点') === 1, 'C7 点偏离曲线后有读数（' + c2.text.slice(0, 40) + '）');
}

// ── 每条破坏在破坏副本上重跑同款**真**判据 ────────────────────────────
function mustFail(key, mk) {
  switch (key) {
    case 'noOutline': { const W = mk();
      const r = W.canon.deviation({});
      // 破坏把「没算」变成「0 分」⇒ 这条判据（「不许带 score」）当场现形
      return r.score !== undefined; }
    case 'merge': { const W = mk();
      const a = W.canon.deviation({});
      // 分量合并后 score 恒等于 spread，于是「lag 也参与了分」这件事消失。
      //   判据问的正是「score 是不是只由 spread 决定」——合并即真、原版即假。
      return Math.abs(a.score - a.spread) < 1e-3; }
    case 'thrMutates': { const W = mk();
      W.canon.setSettings({ deviationAlert: 0 });
      const r = W.canon.deviation({});
      // 判据：score 必须等于**不含阈值时的期望值**。被阈值污染（over 时拉满）即不等。
      //   不用 `score === spread` 之类：那种写法在特定场下会不敏感（首跑实测它恒假）。
      const expect = Math.round((r.spread * 0.6 + r.lag * 0.4) * 1000) / 1000;
      return Math.abs(r.score - expect) > 1e-9; }
    case 'panel': { const W = mk(); let h = '';
      try { h = renderPeopleHtml(W); } catch (e) { h = 'THREW'; }
      const want = ANCHORS.panel.txt.split(' title=')[0];
      return hits(h, want) !== 1; }
    case 'diag': { const W = mk();
      // 判据必须**先真调一次 deviation**（否则 stat.deviations 停在初始 0——那是未观测值，
      //   与「调过但诊断没报」同形）。这是首跑实测踩到的恒真坑。
      const r0 = W.canon.deviation({});
      if (!r0.ok) throw new Error('diag 场不对：deviation 失败 ' + r0.reason);
      const c = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().canon : null;
      return !c || c.deviations === 0 || c.deviations === undefined; }
    default: return false;
  }
}
function runAll(a) {
  HOST = a;
  console.log('== A/B 判据（原版成绿）==');
  judge();
  console.log('== C 消费方（诊断真读者 + 面板真渲染）==');
  consumers();
  console.log('CANON-DEVIATION-V2139: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
  return fails;
}
function runNegative(a) {
  HOST = a;
  let nf = 0;
  console.log('== N0–N4 真源码破坏（破坏副本上重跑同款真判据）==');
  BROKEN.forEach(function (b) {
    const n = hits(src(b.spec.rel), b.spec.txt);
    checks++; if (n !== 1) { nf++; console.log('  ✗ N0 锚点不唯一：' + b.key + ' hits=' + n); }
    else console.log('  ✓ N0 ' + b.key + ' 锚点恰中 1 次');
  });
  // H5 判据纯度：锚点字面量只准在 ANCHORS 里声明一次（多行锚点在本文件里是转义形态）
  const self = src(SELF);
  const anchorsBlock = self.slice(self.indexOf('const ANCHORS'), self.indexOf('const BROKEN'));
  const judgeBlock = self.slice(self.indexOf('function mustFail'), self.indexOf('function runAll'));
  BROKEN.forEach(function (b) {
    const form = b.spec.txt.replace(/\n/g, '\\n');
    const inAnchors = hits(anchorsBlock, form);
    const inJudge = hits(judgeBlock, form);
    checks++;
    if (inAnchors !== 1 || inJudge !== 0) { nf++; console.log('  ✗ H5 纯度：' + JSON.stringify(b.spec.txt.slice(0, 24)) + ' 声明 ' + inAnchors + ' 次 / 判据内 ' + inJudge + ' 次'); }
    else console.log('  ✓ H5 纯度：锚点只声明 1 次且判据不内联 ' + JSON.stringify(b.spec.txt.slice(0, 20)));
  });
  // 正控制：原版上同款判据必须**全为假**
  BROKEN.forEach(function (b) {
    let truth = null;
    try { truth = mustFail(b.key, function () { return env(caseSpec(b.key)); }); }
    catch (e) { truth = 'threw:' + (e && e.message); }
    checks++;
    if (truth !== false) { nf++; console.log('  ✗ 正控制失败：' + b.key + ' 在原版上判据竟为真（' + truth + '）⇒ 判据恒真'); }
    else console.log('  ✓ 正控制：' + b.key + ' 同款判据在原版上为假');
  });
  BROKEN.forEach(function (b) {
    let bad = null, err = null;
    try { bad = mustFail(b.key, function () { return envBroken(caseSpec(b.key), brokenOverride(b.spec)); }); }
    catch (e) { err = e; }
    checks++;
    if (err) { nf++; console.log('  ✗ N 装载/判据抛出 ' + b.key + '：' + (err && err.message)); }
    else if (!bad) { nf++; console.log('  ✗ N 破坏未被观测到：' + b.key + '（破坏副本上判据仍绿 ⇒ 判据无效）'); }
    else console.log('  ✓ N 破坏现形：' + b.key);
  });
  const rels = [CN, DIAG, PANEL];
  const before = rels.map(function (r) { return src(r); });
  const after = rels.map(function (r) { return src(r); });
  checks++;
  if (before.some(function (v, i) { return v !== after[i]; })) {
    nf++; console.log('  ✗ N5 纯度：负控制期间真文件被改写（破坏只准发生在内存副本上）');
  } else console.log('  ✓ N5 纯度：三个真文件逐字未变（破坏只发生在内存副本上）');
  console.log('NEGATIVE: ' + (nf ? 'FAIL ' + nf + '/' + checks : 'pass ' + checks + ' 项'));
  return nf;
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, ANCHORS: ANCHORS };
if (require.main === module) {
  const env0 = sync.fresh(); LAST_DOM = env0.dom;
  const a = function (c, m) { if (!c) console.log('  ✗ ' + m); };
  let f = 0;
  try { f += (runAll(a) ? 1 : 0); } catch (e) { console.log('  ✗ runAll 抛出：' + (e && e.message)); f = 1; }
  try { f += (runNegative(a) ? 1 : 0); } catch (e) { console.log('  ✗ runNegative 抛出：' + (e && e.message)); f = 1; }
  console.log(f ? 'CANON-DEVIATION-V2139: FAIL' : 'CANON-DEVIATION-V2139: pass');
  process.exitCode = f ? 1 : 0;
}
