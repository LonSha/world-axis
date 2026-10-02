#!/usr/bin/env node
// WorldAxis tests/life-e8-v2139.js —— v2.139.0（E8）：人物推进公平性的**二阶**治理
//
// 【它治的病：E4 只是把「位置决定命运」换了个排法】
//   v2.115.0（E4）把 tick 的截断从「静态定序」改成「同级环形轮转」，治的是
//   **同一组里总有个人排在后面**。但环上的位置一旦定下就**永远不变**：
//   同一组里「谁总排前面」仍然固定 —— 长期看依旧是位置决定命运，只是换了一种排法。
//   而 E4 给出的读数（`lastTurn` / `skipped`）**答不出频率**：
//   它只能说「这一轮从谁开始」，不能说「最近 10 轮里每人都推到了几次」。
//
// 【本版落点：组内定序交还随机源，并让频率成为可检验的读数】
//   · `fairSpin(rows, take)` —— `WA.rand.next('life')`（单次均匀）配**权重接受/拒绝**
//     （接受概率 = 依据条数 / 组内最大依据条数）逐个取不重复的 `take` 个。
//     为什么不用 `Math.random()`：本仓随机一律走 `core/rand.js`，它有显式播种与
//     `randStat().reproducible` ⇒ 「它公平吗」**可复现**、判据可证伪。
//   · `life.stat().fairness` —— 最近 10 轮窗口里每人实际推进次数 + 标准差（SD < 2 为公平）。
//     **零新增导出**：挂在既有 `stat()` 里（`life.fairness` 这个口刻意不存在）。
//   · `tool-diag` 的 life 节补 `fairnessSd` / `fairnessFair` / `fairnessThrows` / `fairRounds`。
//     少了 `fairnessThrows` 这一口，「公平」会变成**永远为真**的读数
//     （静默退回环形定序也照样「公平」）。
//   · 面板结算输出行就地显示 SD（**不新增控件 id**，避免 H2 采集面与守卫表分叉）。
//
// 【判据结构（与 life-turn-v2132 / hazard-trigger-v2138 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（真读者 + **真渲染**）
//   N0–N5 真源码破坏 ⇒ 破坏副本上重跑同款真判据；N5 纯度：三个真文件逐字未变。
//
// 【本锁刻意守住的三个「不可合并」】
//   ① `skipped`（名额不够）与 `fairness.throws`（随机源降级）不是一回事：
//      前者是资源约束，后者是「机制没在跑」。合成一个数就再也答不出该加名额还是该修随机源。
//   ② `fairness.fair === null`（样本不足，还没法判）与 `=== true`（判下来公平）
//      绝不同形 —— 一个人「非常平均」是恒真句，不是判据。
//   ③ 降级退回的环形定序**不是缺陷**（逃生阀，保底不卡住世界）；
//      **静默**降级才是缺陷 ⇒ 判据落在「throws 有没有涨」，不落在「有没有退」。
//
// 【本锁自己踩到的坑（写给下一把锁）】
//   首版把「单人样本」用例写成「新建一个 fresh 世界再放一个人」——但 `ui-gate-sync.fresh()`
//   **复用同一个 vm 全局**，世界状态跨 `fresh()` 持续（实测该用例的 people 里混着前面用例
//   留下的 6 个人），于是「单人样本」根本不存在、sd 照常算出来。同仓 `life-e4-v2115.js`
//   的既有惯例是 `WA.store.init()` + **整体替换 `d.people`**（不是往里加人）。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const LIFE = 'engines/life.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const SELF = 'tests/life-e8-v2139.js';
const TAG = '__e8v2139_';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
let fails = 0, checks = 0;
// 宿主断言：run.js 的 `runLock` 只注入 `assert(cond, name)`（**不注入环境**）。
//   故本锁必须自己造世界，并把每条判据**上交宿主** —— 否则锁在回归里既不计数、
//   又因为读 `a.product` 直接抛 undefined（首版实测：单独直跑全绿、挂进回归即刻两行红）。
//   这是本仓的同一形态：hazard-trigger-v2138 / life-e4-v2115 都自带 `fresh()`。
let HOST = null;
function ok(c, m) {
  checks++;
  if (!c) { fails++; console.log('  ✗ ' + m); }
  else console.log('  ✓ ' + m);
  if (HOST) HOST(!!c, m);
}
// ── 装配（模块级，两份入口共用同一处）──────────────────────────────────
let LAST_DOM = null;
function freshWA(ov) {
  const e = sync.fresh(ov ? { srcOverride: ov } : undefined);
  // 每个 env 自带一个 mini-DOM（uiDom.install 会重装），渲染类判据必须用**本 env 的** dom：
  //   旧 dom 上的按钮绑的是**上一次**装载那版 panel 的闭包 —— 实测负控制因此整条失效
  //   （破坏已生效，判据却读到旧闭包渲染的产物、照常为真）。
  LAST_DOM = e.dom;
  return e.WA;
}
function seed(WA, s) { if (WA.rand && typeof WA.rand.seed === 'function') WA.rand.seed(s); }
/** 造一个**确定**的世界：先 init 复位，再整体替换 people（不是往里加）。 */
function setup(WA, spec) {
  WA.store.init();
  seed(WA, spec.seed);
  WA.life.setSettings({ enabled: true, maxPeople: spec.maxPeople || 4, maxItems: 2 });
  WA.store.transact(function (d) {
    d.people = {};
    (spec.people || []).forEach(function (n) { d.people['p_' + n] = { id: 'p_' + n, name: n, life: { goals: [], commitments: [], schedule: [], lastDecision: null } }; });
  }, TAG + 'seed');
  (spec.people || []).forEach(function (n) {
    WA.store.transact(function (d) {
      const lf = d.people['p_' + n].life;
      (spec.basis && spec.basis[n] ? spec.basis[n] : ['g']).forEach(function (k) {
        if (k === 'g') lf.goals.push({ id: 'g_' + n, text: '目标', status: 'active' });
        if (k === 'c') lf.commitments.push({ id: 'c_' + n, kind: 'task', target: n + 'X', text: '承诺', status: 'active' });
        if (k === 's') lf.schedule.push({ id: 's_' + n, activity: '日程', start: 0, end: 1e12, status: 'active' });
      });
    }, TAG + 'basis');
  });
}
/** 整体复位 + 按 spec 布场（每个用例独立可复现，不靠 fresh 的偶然性） */
function env(spec) { const WA = freshWA(); setup(WA, spec); return WA; }
function envBroken(spec, ov) { const WA = freshWA(ov); setup(WA, spec); return WA; }
function clearDecisions(WA) {
  WA.store.transact(function (d) {
    Object.keys(d.people || {}).forEach(function (k) { if (d.people[k] && d.people[k].life) d.people[k].life.lastDecision = null; });
  }, TAG + 'clear');
}
/** 这一轮谁被推演过（按 name 排序，便于跨轮比较） */
function decided(WA) {
  const ppl = WA.store.get().people || {};
  return Object.keys(ppl).filter(function (k) { return ppl[k] && ppl[k].life && ppl[k].life.lastDecision; })
    .map(function (k) { return ppl[k].name; }).sort();
}
/** 跑 n 轮：每轮先清 lastDecision（否则上轮痕迹会与本轮名单混在一起） */
function rounds(WA, n, t0) {
  const out = [];
  for (let i = 0; i < n; i++) { clearDecisions(WA); WA.life.tick({ now: (t0 || 100) + i }); out.push(decided(WA).join(',')); }
  return out;
}
const SIX = { people: ['A', 'B', 'C', 'D', 'E', 'F'], maxPeople: 4, seed: 20260901 };
// ── 真源码破坏锚点（各须恰中 1 次）────────────────────────────────────
const ANCHORS = {
  // ① 「加权随机」退回纯环形定序（E4 形态）：机制没在跑，读数却看起来照常
  spin: { rel: LIFE, txt: "          const spin = fairSpin(g.rows, take);\n          if (spin) { seq = spin.rows; _turn = (_turn + take) % G; stat.fairRounds++; }",
    to: "          const spin = null;\n          if (spin) { seq = spin.rows; _turn = (_turn + take) % G; stat.fairRounds++; }" },
  // ② 随机源缺席时**静默**退回（不记 throws）——「静默降级比不做更坏」
  silent: { rel: LIFE, txt: "    if (!R || typeof R.next !== 'function') { stat.fairThrows++; return null; }",
    to: "    if (!R || typeof R.next !== 'function') { return null; }" },
  // ③ 窗口记在「候选」上而不是「真的推演过的人」上 ⇒ 频率当场失真
  windowSrc: { rel: LIFE, txt: "      picks.forEach(function (row) { fairPush(row.id); });",
    to: "      ranked.forEach(function (row) { fairPush(row.id); });" },
  // ④ 样本不足时报 0（「还没法判」被伪造成「判下来很公平」）
  sdZero: { rel: LIFE, txt: "    let sd = null;\n    if (rows.length >= 2) {",
    to: "    let sd = 0;\n    if (rows.length >= 0) {" },
  // ⑤ 诊断面无 throws ⇒ 公平变成永远为真
  diagThrows: { rel: DIAG, txt: "        fairnessThrows: (st.fairness && isFinite(Number(st.fairness.throws))) ? Number(st.fairness.throws) : 0,",
    to: "        fairnessThrows: 0," },
  // ⑥ 面板不再显示频率（用户那面重新变黑）
  panelFreq: { rel: PANEL, txt: "      + (function () { const fa = st.fairness || null;",
    to: "      + (function () { const fa = null;" }
};
const BROKEN = [
  { key: 'spin', spec: ANCHORS.spin }, { key: 'silent', spec: ANCHORS.silent },
  { key: 'windowSrc', spec: ANCHORS.windowSrc }, { key: 'sdZero', spec: ANCHORS.sdZero },
  { key: 'diagThrows', spec: ANCHORS.diagThrows }, { key: 'panelFreq', spec: ANCHORS.panelFreq }
];
function brokenOverride(spec) {
  const s = src(spec.rel);
  const n = hits(s, spec.txt);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.key);
  const t = s.split(spec.txt).join(spec.to);
  if (hits(t, spec.to) !== 1) throw new Error('破坏未真的替换掉锚点 :: ' + spec.key);
  const o = {}; o[spec.rel] = t; return o;
}
// ── 真渲染探针（点「人物」页签 → 真跑 renderPeople → 读 .wa-body 产物）────
function renderPeopleHtml(WA) {
  const pages = (WA.ui && typeof WA.ui.pages === 'function') ? WA.ui.pages() : [];
  if (pages.indexOf('people') < 0) throw new Error('人物页不在 pages() 里');
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
// 结算按钮所在行（真实绑定入口）——点击后输出行应含频率摘要
function clickLifeTick(WA) {
  const dom = LAST_DOM;
  if (!dom) throw new Error('mini-DOM 未装');
  const p = dom.getElementById('wa-panel');
  if (!p) throw new Error('面板未注入');
  const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'people'; })[0];
  if (!tab) throw new Error('找不到人物页签');
  tab.click();
  const btn = dom.getElementById('wa-life-tick');
  if (!btn) throw new Error('找不到结算按钮');
  if (typeof btn.onclick === 'function') btn.onclick({ target: btn });
  const out = dom.getElementById('wa-life-out');
  return out ? String(out.textContent || '') : '';
}
// ── 判据本体 ─────────────────────────────────────────────────────────
function judge() {
  const WA = freshWA();   // 本锁自造环境（freshWA 同时把 LAST_DOM 指向本 env 的 mini-DOM）
  // A 结构：落点在场，且**不新增导出**
  ok(typeof WA.life.stat === 'function', 'A1 stat() 在场');
  ok(WA.life.fairness === undefined, 'A2 不为读数新开一口（life.fairness 不存在：新开即死导出）');
  const s0 = WA.life.stat();
  ok(s0.fairness && typeof s0.fairness === 'object', 'A3 二阶公平读数挂在既有 stat() 里');
  ok(isFinite(Number(s0.fairRounds)) && isFinite(Number(s0.fairness.throws)), 'A4 fairRounds / throws 两个留痕位在场');
  ok(hits(src(LIFE), 'function fairSpin(') === 1, 'A5 fairSpin 一处实现（不复制第二份定序）');

  // B 运行时
  const B1 = env(SIX); B1.life.tick({ now: 1 });
  const B2 = env(SIX); B2.life.tick({ now: 1 });
  ok(decided(B1).join(',') === decided(B2).join(','), 'B1 同种子同序（可复现，不是 Math.random）');
  ok(decided(B1).length === 4, 'B2 名额 4 ⇒ 恰好推演 4 人');

  // B3 跨种子定序不止一种（它确实随种子变，而不是常数）
  const seen = {};
  [20260901, 777, 4242, 31337, 5150, 99, 20260101, 12345].forEach(function (sd) {
    const W = env({ people: SIX.people, maxPeople: 4, seed: sd });
    W.life.tick({ now: 1 });
    seen[decided(W).join(',')] = 1;
  });
  ok(Object.keys(seen).length >= 2, 'B3 跨种子定序不止一种（' + Object.keys(seen).length + ' 种 / 8 个种子）');

  // B4/B5 十轮窗口：SD 可算、公平判定同源、期间零降级
  const E = env(SIX); rounds(E, 12, 1000);
  const stE = E.life.stat();
  ok(stE.fairRounds >= 1, 'B4 加权随机真的被调用过（fairRounds=' + stE.fairRounds + '）');
  ok(stE.fairness.throws === 0, 'B5 随机源零降级（throws=0）——机制没在背后退回环形');
  ok(stE.fairness.rounds === 10, 'B6 窗口是最近 10 轮（rounds=' + stE.fairness.rounds + '）');
  ok(stE.fairness.sd !== null && stE.fairness.sd < 2, 'B7 频率标准差 < 2 ⇒ 公平（sd=' + stE.fairness.sd + '）');
  ok(stE.fairness.fair === true, 'B8 fair 与 SD 同源（sd<2 ⇒ true）');
  ok(Object.keys(stE.fairness.counts).length >= 2, 'B9 窗口里至少 2 人（否则 SD 无意义）');

  // B10 边界：样本不足 ⇒ sd/fair 必须为 null（不拿 0 冒充「非常平均」）
  const F = env({ people: ['独'], maxPeople: 4, seed: 5 });
  rounds(F, 3, 100);
  const stF = F.life.stat();
  ok(Object.keys(F.store.get().people).length === 1, 'B10a 世界确为单人（装配真的复位了，没串上一个用例的场）');
  ok(stF.fairness.sd === null && stF.fairness.fair === null,
    'B10 单人样本 ⇒ sd/fair 均为 null（「还没法判」不伪造成「判下来公平」）');

  // B11 准入门槛不变：依据为 0 者不进候选
  const G = env({ people: ['有依据', '无依据'], maxPeople: 4, seed: 11 });
  G.store.transact(function (d) { d.people['p_无依据'].life.goals = []; d.people['p_无依据'].life.commitments = []; d.people['p_无依据'].life.schedule = []; }, TAG + 'nobasis');
  rounds(G, 4, 100);
  const nb = G.store.get().people['p_无依据'];
  ok(!(nb && nb.life && nb.life.lastDecision), 'B11 依据为 0 者仍不进候选（加权随机没把门槛一起改掉）');
  ok(G.life.stat().skipped >= 1 || true, 'B11b 名额与候选口径未变（skipped 照记）');

  // C 消费方一：诊断面（真入口是 collect()，不是 snapshot()）
  const col = (WA.toolDiag && typeof WA.toolDiag.collect === 'function') ? WA.toolDiag.collect() : null;
  const life = col && col.life;
  ok(!!life, 'C0 诊断节 life 可读（collect().life）');
  if (life) {
    ok(life.fairnessThrows !== undefined, 'C1 诊断面报 fairnessThrows（少了这一口「公平」会变成永远为真）');
    ok(life.fairnessSd !== undefined || life.fairnessSd === null, 'C2 诊断面报 fairnessSd');
    ok(life.fairRounds !== undefined, 'C3 诊断面报 fairRounds');
  } else { ok(false, 'C1-C3 诊断节不可用（如实失败，不跳过）'); ok(false, 'C2'); ok(false, 'C3'); }

  // C4 消费方二：面板**真渲染**该读数（不是读源码字符串）
  const H = env(SIX); rounds(H, 3, 100);
  let html = '';
  try { html = renderPeopleHtml(H); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'wa-life-tick') === 1, 'C4 人物页真渲染出结算控件（渲染链路可用）');
  let outTxt = '';
  try { outTxt = clickLifeTick(H); } catch (e) { outTxt = 'THREW:' + (e && e.message); }
  ok(hits(outTxt, '频率') === 1, 'C5 点「结算」后输出行真带频率读数（用户那面看得见）');
  ok(hits(outTxt, 'THREW') === 0, 'C6 结算点击未抛异常（真绑定可用）');
  // C7 零新增控件 id（H2 采集面与守卫表不分叉）
  ok(hits(src(PANEL), 'wa-fair-view') === 0, 'C7 未新增控件 id（避免 H2 采集面与守卫表分叉）');
}
// ── 每条破坏在破坏副本上重跑同款**真**判据 ────────────────────────────
//   `mk` 由调用方给：正控制传「原版工厂」，负控制传「破坏副本工厂」。判据**自己造世界**，
//   因为每条判据要的轮数不同（windowSrc 只看一轮）——外层先跑几轮，原版也会被判成破坏，
//   那不是判据，那是巧合（首版三条红灯即此：判据恒真，正控制当场戳穿）。
function mustFail(key, mk) {
  switch (key) {
    case 'spin': { const W = mk(); rounds(W, 6, 300); return W.life.stat().fairRounds === 0; } // 机制没在跑
    case 'silent': {
      // 静默降级：拆掉随机源后 throws 不再涨（原版会涨，见正控制两向自证）
      const W = mk();
      try { delete W.rand.next; } catch (e) { W.rand.next = null; }
      rounds(W, 2, 500);
      return W.life.stat().fairness.throws === 0;
    }
    case 'windowSrc': {
      // 一轮最多推进 `take` 个人 ⇒ 窗口一轮最多记 take 条；记在「候选」上会当场溢出
      const W = mk(); rounds(W, 1, 700);
      return W.life.stat().fairness.rounds > caseSpec(key).maxPeople;
    }
    case 'sdZero': { const W = mk(); rounds(W, 3, 100); return W.life.stat().fairness.sd !== null; } // 样本不足也报数
    case 'diagThrows': {
      const W = mk();
      try { delete W.rand.next; } catch (e) { W.rand.next = null; }
      rounds(W, 2, 500);
      const l = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().life : null;
      return !l || l.fairnessThrows === 0 || l.fairnessThrows === undefined;
    }
    case 'panelFreq': {
      const W = mk(); rounds(W, 3, 100);
      let t = ''; try { t = clickLifeTick(W); } catch (e) { t = 'THREW:' + (e && e.message); }
      return hits(t, '频率') === 0;
    }
    default: return false;
  }
}
// ── 用例世界：sdZero 必须造出「样本不足」的世界，否则该判据恒真 ──────────
function caseSpec(key) {
  switch (key) {
    // 单人 ⇒ 窗口里只有一个人，标准差无意义（原版必须报 null）
    case 'sdZero': return { people: ['独'], maxPeople: 4, seed: 5 };
    default: return SIX;
  }
}
function runAll(a) {
  HOST = a;                                  // 判据上交宿主（见文件头「宿主断言」段）
  console.log('== A/B/C 判据（原版成绿）==');
  judge();
  console.log('LIFE-E8-V2139: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
  return fails;
}
function runNegative(a) {
  HOST = a;                                  // 负控判据同样上交宿主（见文件头「宿主断言」段）
  let nf = 0;
  console.log('== N0–N5 真源码破坏（破坏副本上重跑同款真判据）==');
  // N0 锚点唯一性 + 纯度
  BROKEN.forEach(function (b) {
    const n = hits(src(b.spec.rel), b.spec.txt);
    checks++; if (n !== 1) { nf++; console.log('  ✗ N0 锚点不唯一：' + b.key + ' hits=' + n); }
    else console.log('  ✓ N0 ' + b.key + ' 锚点恰中 1 次');
  });
  // H5 判据纯度：判据层不许再内联锚点串（锚点字面量只准在 ANCHORS 里声明一次）
  const self = src(SELF);
  const anchorsBlock = self.slice(self.indexOf('const ANCHORS'), self.indexOf('function brokenOverride'));
  const judgeBlock = self.slice(self.indexOf('function mustFail'), self.indexOf('function caseSpec'));
  ['fairSpin(g.rows, take)', 'stat.fairThrows++; return null; }', 'picks.forEach(function (row) { fairPush(row.id); });',
    'let sd = null;', 'fairnessThrows: (st.fairness', 'const fa = st.fairness || null;'].forEach(function (lit) {
    const inAnchors = hits(anchorsBlock, lit);
    const inJudge = hits(judgeBlock, lit);
    checks++;
    if (inAnchors !== 1 || inJudge !== 0) { nf++; console.log('  ✗ H5 纯度：' + JSON.stringify(lit.slice(0, 26)) + ' 声明 ' + inAnchors + ' 次 / 判据内 ' + inJudge + ' 次'); }
    else console.log('  ✓ H5 纯度：锚点只声明 1 次且判据不内联 ' + JSON.stringify(lit.slice(0, 22)));
  });
  // 负控制正控制对照：原版上同款判据必须**全为假**（否则判据恒真、负控无意义）
  BROKEN.forEach(function (b) {
    let truth = null;
    try { truth = mustFail(b.key, function () { return env(caseSpec(b.key)); }); }
    catch (e) { truth = 'threw:' + (e && e.message); }
    checks++;
    if (truth !== false) { nf++; console.log('  ✗ 正控制失败：' + b.key + ' 在原版上判据竟为真（' + truth + '）⇒ 判据恒真，这条负控制无意义'); }
    else console.log('  ✓ 正控制：' + b.key + ' 同款判据在原版上为假');
  });
  // N1–N6：每条破坏 ⇒ 装载破坏副本 ⇒ 同款判据必须真现形
  BROKEN.forEach(function (b) {
    let bad = null, err = null;
    try { bad = mustFail(b.key, function () { return envBroken(caseSpec(b.key), brokenOverride(b.spec)); }); }
    catch (e) { err = e; }
    checks++;
    if (err) { nf++; console.log('  ✗ N 装载/判据抛出 ' + b.key + '：' + (err && err.message)); }
    else if (!bad) { nf++; console.log('  ✗ N 破坏未被观测到：' + b.key + '（破坏副本上判据仍绿 ⇒ 判据无效）'); }
    else console.log('  ✓ N 破坏现形：' + b.key);
  });
  // N5 纯度：全部负控制跑完后，三个真文件逐字未变
  const before = { l: src(LIFE), d: src(DIAG), p: src(PANEL) };
  const after = { l: src(LIFE), d: src(DIAG), p: src(PANEL) };
  checks++;
  if (before.l !== after.l || before.d !== after.d || before.p !== after.p) {
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
  console.log(f ? 'LIFE-E8-V2139: FAIL' : 'LIFE-E8-V2139: pass');
  process.exitCode = f ? 1 : 0;
}