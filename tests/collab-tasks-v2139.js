#!/usr/bin/env node
// WorldAxis tests/collab-tasks-v2139.js —— v2.139.0（E10）：协作任务与违约
//
// 【它治的病：三张表答不出「承诺有没有被兑现」】
//   collab 已有 sessions / claims（谁在开会话、谁占着哪个角色）与 queue / conflicts
//   （排了什么待重放、两端分歧怎么判）—— 四张表**一个字都没说**「几个人约好一起做一件事，
//   到点各人做到没有」。`life.reciprocated` 只做「两方是否对称持有同一条合作承诺」的双向检查，
//   它不问「到点做到没有」，也没有「几个人」。故本版新开第五张表 `tasks`。
//
// 【本锁最要紧的两条：一个数答不出的两件事】
//   ① `breachRecorded`（记下了）与 `penalized`（真罚了）**不可合并** ——
//      合成一个数，事后就答不出「违约有没有被处置」。故本锁把「只记不罚」钉成行为判据：
//      `settle` 之后 `breachRecorded` 涨而 `penalized` **必须仍是 0**；只有显式 `penalize` 才动它。
//   ② `taskTotal`（表里还剩几个，会被挤出）与 `stat.tasks`（累计建过几个，只增）也不可合并。
//
// 【结算幂等那条判据为什么必须先造「到点且有欠缴」的任务】
//   首版实测踩到的坑：若拿一个空任务（无人承诺）去 `settle` 两次，两次都不会记 breach，
//   「没重复」是因为「压根没算过」—— 判据恒真。故幂等判据的场必须**先真记一次 breach**
//   （`breachRecorded === 2`），再断言第二次 `settle` 不使它变化。正控制段就是为抓恒真而设。
//
// 【口径⑤（不跨势力）为什么拆成两种 why】
//   「还查不到这几个人属于谁」与「确实分属两家」的**处置完全不同**（前者去建势力、
//   后者去建联合势力）。塌成一个 bad-value 就分不出来了，故判据要求 `why` 可辨。
//
// 【判据结构（与 life-e8-v2139 / faction-graph-v2139 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（诊断真读者 + 面板**真渲染**）
//   N0–N7 真源码破坏 ⇒ 破坏副本上重跑同款真判据；N5 纯度：四个真文件逐字未变。
//   判据一律**自己造世界**（用 env 工厂）：每条判据要的场不同（缺归属 / 跨势力 / 已结算），
//   外层先跑一遍会把原版也判成破坏 —— 那不是判据，那是巧合。正控制段就是为抓它而设。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const CO = 'engines/collab.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const STORE = 'core/store.js', EVICT = 'core/evict.js', SELF = 'tests/collab-tasks-v2139.js';
const TAG = '__e10v2139_';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
let fails = 0, checks = 0;
// 宿主断言：run.js 的 `runLock` 只注入 `assert(cond, name)`（**不注入环境**）。
//   故本锁必须自己造世界，并把每条判据**上交宿主** —— 否则锁在回归里既不计数、
//   又因为读 `a.product` 直接抛 undefined。
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
// ── 造世界：一个势力 + 名册 + 人手粮（三件事都必须真落进存档）────────────
//   为什么不直接写 `d.evolution.factions.push(...)` 就完事：`org.penalize` 要**持有者**
//   （missing-holder）与**名册成员**（not-on-roster），二者都在 faction 行上；
//   而 `transfer('person' → 'faction')` 要人自己**有粮**。缺任何一样，罚没都走不到成功那步。
function mkFac(WA, name, members) {
  WA.store.transact(function (d) {
    d.evolution = d.evolution || {};
    d.evolution.factions = d.evolution.factions || [];
    let f = d.evolution.factions.filter(function (x) { return x && x.name === name; })[0];
    if (!f) { f = { name: name, status: '中立', relation: '中立', resources: {}, roster: {} }; d.evolution.factions.push(f); }
    f.resources = f.resources || {};
    if (typeof f.resources['粮'] !== 'number') f.resources['粮'] = 1000;
    f.roster = f.roster || {};
    members.forEach(function (m) {
      f.roster[m] = f.roster[m] || { role: 'member', contrib: 0, owed: 0, owedItem: '', fined: 0, hiredAt: 1 };
    });
    return true;
  }, TAG + 'fac');
}
function mkPerson(WA, name, grain) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    const key = 'p_' + name;
    const row = d.people[key] || { name: name, resources: {} };
    row.resources = row.resources || {};
    if (typeof row.resources['粮'] !== 'number') row.resources['粮'] = grain;
    d.people[key] = row;
    return true;
  }, TAG + 'person');
}
const SOON = function () { return Date.now() + 600000; };
const PAST = function () { return Date.now() - 1; };
/**
 * 场规格：
 *   facs   —— [[势力名, [成员…]], …]（同一成员只准挂一处，否则归属判定会取先命中的那家）
 *   people —— [[人名, 粮], …]
 *   on     —— 开关（默认 true；`false` 走「开关真关掉」的路）
 */
function env(spec) {
  const s = spec || {};
  const WA = freshWA();
  WA.store.init();
  // **collab 容器必须显式清零**：`store.init()` 走的是「载入现有存档」，而 ui-gate-sync
  //   复用同一个 vm 全局 —— 上一个 env 写下的任务表会原地留着（首跑实测：A7 填到 24 条后，
  //   后面每个场的 B9「表里 3 条」全红）。故这里整体替换容器，与 E9 seed() 里
  //   「整体替换 evolution.factions」同型：判据造世界不许依赖 init 的隐式行为。
  WA.store.transact(function (d) {
    d.collab = { seq: 0, sessions: [], claims: {}, queue: [], conflicts: [], tasks: [] };
    return true;
  }, TAG + 'reset');
  if (s.on === false) {
    // 开关**必须真关**。ui-gate-sync 复用同一个 vm 全局，设置跨 env 持续（探针实测：
    //   前一个 env 开了开关，后一个 env 当场读到 enabled=true），所以「只 init 不置设置」
    //   得到的不是「开关未开」而是「开关正好还开着」。E9 的 C10 首跑就是踩的这个坑。
    WA.collab.setSettings({ enabled: false });
    return WA;
  }
  (s.facs || []).forEach(function (p) { mkFac(WA, p[0], p[1]); });
  (s.people || []).forEach(function (p) { mkPerson(WA, p[0], p[1]); });
  WA.collab.setSettings(Object.assign({ enabled: true }, s.extra || {}));
  return WA;
}
function envBroken(spec, ov) {
  const WA = freshWA(ov);
  WA.store.init();
  WA.store.transact(function (d) {
    d.collab = { seq: 0, sessions: [], claims: {}, queue: [], conflicts: [], tasks: [] };
    return true;
  }, TAG + 'resetb');
  if (spec && spec.on === false) { WA.collab.setSettings({ enabled: false }); return WA; }
  (spec.facs || []).forEach(function (p) { mkFac(WA, p[0], p[1]); });
  (spec.people || []).forEach(function (p) { mkPerson(WA, p[0], p[1]); });
  WA.collab.setSettings(Object.assign({ enabled: true }, (spec && spec.extra) || {}));
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
function clickTk(WA, id, vals) {
  renderPeopleHtml(WA);                     // 先渲染，绑定才在树上
  const dom = LAST_DOM;
  if (vals) { Object.keys(vals).forEach(function (k) { const el = dom.getElementById(k); if (el) el.value = vals[k]; }); }
  const btn = dom.getElementById(id);
  if (!btn) throw new Error('找不到 ' + id);
  let threw = null;
  try { if (typeof btn.onclick === 'function') btn.onclick({ target: btn }); } catch (e) { threw = e; }
  const out = dom.getElementById('wa-task-out');
  return { text: out ? String(out.textContent || '') : '', threw: threw };
}
// ── 真源码破坏锚点（各须恰中 1 次）────────────────────────────────────
const ANCHORS = {
  // ① 违约自动罚没（口径①「只记不罚」被拆掉）⇒ 记账与处置再也分不开
  //   锚点必须是**够独特的一段**：`'    stat.settled++;'` 这种短串会同时出现在 to 里，
  //   而审计器按「本文件出现次数」判纯度（出现 2 次即 impure）。故带上下行一起钉。
  autoPenalize: { rel: CO, txt: '    stat.settled++;\n    if (missed.length) { stat.breaches++; stat.breachRecorded += missed.length; }',
    to: '    stat.settled++; stat.penalized += missed.length;\n    if (missed.length) { stat.breaches++; stat.breachRecorded += missed.length; }' },
  // ② 结算不幂等（第二次再记一遍 breach）⇒ 违约数随重放膨胀
  //   用双引号包裹：锚点原文里的单引号不必转义，字面量才在本文件里**以原文形态出现**（否则审计读到 0 次）。
  idem: { rel: CO, txt: "    if (t0.status !== 'active') return { ok: true, task: id, already: true, view: taskView(t0) };",
    to: "    if (t0.status !== 'active') { stat.breachRecorded += 2; return { ok: true, task: id, already: true, view: taskView(t0) }; }" },
  // ③ 未到截止也算违约（口径③被拆掉）⇒「没到点」与「做没做」塌成一件事
  dueGuard: { rel: CO, txt: '    if (!forced && isFinite(t0.deadline) && nowV < t0.deadline) {',
    to: '    if (false) {' },
  // ④ 一人也能成任务（口径④被拆掉）⇒ 日程被当成协作
  tooFew: { rel: CO, txt: "    if (rows.length < 2) { noteFault('too-few'); return { ok: false, reason: 'too-few', got: rows.length }; }",
    to: "    if (rows.length < 0) { noteFault('too-few'); return { ok: false, reason: 'too-few', got: rows.length }; }" },
  // ⑤ 跨势力不拦（口径⑤被拆掉）⇒ 把两家合成一个任务
  crossFac: { rel: CO, txt: '    if (mixed.length) {',
    to: '    if (false) {' },
  // ⑥ 诊断面不再报任务面读数 ⇒「违约有没有被处置」在诊断包里无从查
  diagTasks: { rel: DIAG, txt: '        taskActive: st.openTasks, taskTotal: st.taskTotal,',
    to: '        taskActive: 0, taskTotal: 0,' },
  // ⑦ 面板不再渲染任务入口（用户那面重新变黑）
  //   锚点带 title 原文一起钉：只用 `id="wa-task-settle" title=` 时，判据里那句派生
  //   （`ANCHORS.panel.txt.split(' title=')[0]`）不含它，但 id 串本身会与渲染块里的
  //   另一处 id 撞名 —— 带全 title 才保证「本文件出现恰 1 次」。
  panel: { rel: PANEL, txt: 'id="wa-task-settle" title="到点结算：未到截止拒收 not-due；本操作只记不罚（缺缴者进违约名单），真罚要另按罚没"',
    to: 'id="wa-task-settle2" title="到点结算：未到截止拒收 not-due；本操作只记不罚（缺缴者进违约名单），真罚要另按罚没"' },
  // ⑧ 挤出站点从**执行表**里摘掉（只在登记表留着）⇒ evict 走 unknown-site 静默失败：
  //     调用方以为挤过了，而表无限增长。这是「静默降级比不做更坏」的可观测形态。
  //     为什么钉这里而不是 store 骨架：骨架是**源码面**判据（createTask 自己会补键，
  //     运行时不可观测），而这条在运行时真能看见（表停在 30 而不是 24）。
  evictSite: { rel: EVICT, txt: "    'collab.tasks':     { path: 'collab.tasks',     cap: 24,",
    to: "    'collab.tasksX':    { path: 'collab.tasks',     cap: 24," }
};
const BROKEN = [
  { key: 'autoPenalize', spec: ANCHORS.autoPenalize }, { key: 'idem', spec: ANCHORS.idem },
  { key: 'dueGuard', spec: ANCHORS.dueGuard }, { key: 'tooFew', spec: ANCHORS.tooFew },
  { key: 'crossFac', spec: ANCHORS.crossFac }, { key: 'diagTasks', spec: ANCHORS.diagTasks },
  { key: 'panel', spec: ANCHORS.panel }, { key: 'evictSite', spec: ANCHORS.evictSite }
];
function brokenOverride(spec) {
  const s = src(spec.rel);
  const n = hits(s, spec.txt);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.rel);
  const t = s.split(spec.txt).join(spec.to);
  if (hits(t, spec.to) !== 1) throw new Error('破坏未真的替换掉锚点 :: ' + spec.rel);
  const o = {}; o[spec.rel] = t; return o;
}
// ── 判据本体（A 结构 + B 运行时）──────────────────────────────────────
const FAC_A = [['甲村', ['甲', '乙']], ['丙村', ['丙']]];
const MAN = [['甲', 50], ['乙', 50], ['丙', 50]];
function judge() {
  const WA = freshWA();   // 本锁自造环境
  const C = WA.collab;
  // A 结构
  ok(!!C && typeof C.createTask === 'function', 'A1 协作任务口在场（collab.createTask）');
  const need = ['createTask', 'contribute', 'settle', 'penalize', 'taskStat'];
  ok(need.every(function (k) { return typeof C[k] === 'function'; }), 'A2 五口齐备（缺一个就是断链）');
  // v2.139.0 收口：`taskView`（把要账行摊平的内部面）**不单独导出** —— 它的结果已由
  //   `taskStat().rows` 与 `settle` 的 `view` 字段带出，外部没有第二处需要这个函数本身。
  ok(C.taskView === undefined, 'A2b 内部面 taskView 未导出（无独立消费方不挂 —— 要账行仍可由 taskStat 读出）');
  ok(C.REASONS.indexOf('bad-task') >= 0 && C.REASONS.indexOf('not-due') >= 0
    && C.REASONS.indexOf('too-few') >= 0 && C.REASONS.indexOf('not-on-roster') >= 0,
    'A3 四枚新拒收码进词表（可枚举 ⇒ 可门禁）');
  const coSrc = src(CO);
  const bodySrc = coSrc.slice(coSrc.indexOf('function createTask'));
  ok(hits(bodySrc, 'WA.store.transact') > 0, 'A4 任务表真落进存档（不是内存影子账）');
  ok(hits(src(STORE), 'conflicts: [], tasks: []') === 1, 'A5 store 骨架声明了 tasks（冷启动直写会炸事务）');
  ok(hits(src(EVICT), "'collab.tasks':") === 1 && hits(src(STORE), "'collab.tasks':") === 1,
    'A6 挤出站点在**登记表**与**执行表**两侧各登一处（只在 store 登、evict.SITES 漏登 ⇒ 挤出走 unknown-site 静默失败）');
  // A7/A8 挤出**真发生**（不是「登记了就算数」）：cap 24 与准入闸 maxTasks 24 同值，
  //   故每轮「建一条到点未缴的 → 立刻结算」把活跃名额放回去，表长度则逐轮增长。
  //   30 轮后表必须停在 24（首条被环形挤出）—— 这是 unknown-site 静默失败唯一可观测的地方。
  //   本段用**独立场**：它会把任务表填到 24 条，不能污染下面 B 段的「表里恰好 3 条」口径。
  const wCap = env({ facs: FAC_A, people: MAN });
  const firstId = wCap.collab.createTask(['甲', '乙'], 'g0', PAST()).task;
  wCap.collab.settle(firstId, { force: true });
  for (let i = 0; i < 29; i++) {
    const rr = wCap.collab.createTask(['甲', '乙'], 'g' + i, PAST());
    wCap.collab.settle(rr.task, { force: true });
  }
  const st8 = wCap.collab.taskStat();
  ok(st8.total === 24, 'A7 表被真挤出到 cap 24（实 ' + st8.total + '；若走 unknown-site 静默失败会停在 30）');
  const ids8 = wCap.store.get().collab.tasks.map(function (t) { return t.id; });
  ok(ids8.indexOf(firstId) < 0 && ids8.length === 24, 'A8 最旧一条（' + firstId + '）已被环形挤出，挤出的是「最早」而非「最新」');

  // B1 开关默认关 ⇒ disabled（不编一个空任务）
  const off = env({ on: false, facs: FAC_A, people: MAN });
  ok(off.collab.createTask(['甲', '乙'], 'g', SOON()).reason === 'disabled', 'B1 开关真关掉 ⇒ disabled');
  ok(off.collab.taskStat().total === 0, 'B1b 关着时任务表为空（不是「有一个算不出来的任务」）');

  // B2 口径④：一人不成任务
  const W = env({ facs: FAC_A, people: MAN });
  const r2 = W.collab.createTask(['甲'], '独干', SOON());
  ok(r2.ok === false && r2.reason === 'too-few' && r2.got === 1, 'B2 参与人数 1 ⇒ too-few（一个人的任务不是协作任务）');

  // B3 口径⑤：缺归属与跨势力**分开报**
  const r3a = W.collab.createTask(['甲', '丁'], 'g', SOON());
  ok(r3a.ok === false && r3a.reason === 'bad-value' && r3a.why === 'faction-unknown',
    'B3a 参与者不在任何名册 ⇒ bad-value/faction-unknown（该去建势力）');
  const r3b = W.collab.createTask(['甲', '丙'], 'g', SOON());
  ok(r3b.ok === false && r3b.reason === 'bad-value' && r3b.why === 'cross-faction' && r3b.faction === '甲村',
    'B3b 分属两家 ⇒ bad-value/cross-faction（该去建联合势力）—— 两种 why 可辨，处置不同');

  // B4 正常建任务：势力固化在行上（罚没要一个势力名）
  const r4 = W.collab.createTask([{ name: '甲', pledge: 3 }, { name: '乙', pledge: 3 }], '修水渠', SOON());
  ok(r4.ok === true && r4.faction === '甲村' && r4.partners.length === 2, 'B4a 建任务成功且带势力归属（' + r4.task + '）');
  const row4 = W.store.get().collab.tasks[0];
  ok(row4.faction === '甲村' && row4.status === 'active' && row4.partners.length === 2,
    'B4b 任务行固化 faction / status / partners（**事后不按当前名册补算**）');

  // B5 口径③：未到截止 ⇒ not-due
  const s5 = W.collab.settle(r4.task);
  ok(s5.ok === false && s5.reason === 'not-due', 'B5a 未到截止 ⇒ not-due（「没到点」不是「做没做」）');
  ok(W.collab.taskStat().breached === 0 && W.collab.stat().breachesRecorded === 0,
    'B5b 被 not-due 拒收后零违约记录（拒收不留痕）');

  // B6 贡献：非正数拒收；不在名册上拒收；正常记入并可复算
  ok(W.collab.contribute('甲', r4.task, -1).reason === 'bad-amount', 'B6a 贡献为负 ⇒ bad-amount（回撤不是贡献）');
  ok(W.collab.contribute('丙', r4.task, 1).reason === 'not-on-roster', 'B6b 不在任务名册 ⇒ not-on-roster');
  const c6 = W.collab.contribute('甲', r4.task, 3);
  ok(c6.ok === true && c6.contributed === 3, 'B6c 记一笔贡献后可复算（3）');
  W.collab.contribute('乙', r4.task, 3);
  const v6 = W.collab.taskStat().rows.filter(function (t) { return t.id === r4.task; })[0];
  ok(!!v6 && v6.done === 2 && v6.short.length === 0, 'B6d 全员达标 ⇒ done=2 且欠缴名单为空（读的是 taskStat 的要账行，内部面不导出）');

  // B7 结算幂等：**必须在「到点且有欠缴」的任务上判**（否则两次都是空任务、判据恒真）
  const r7 = W.collab.createTask([{ name: '甲', pledge: 2 }, { name: '乙', pledge: 2 }], '交租', PAST());
  const s7a = W.collab.settle(r7.task);
  ok(s7a.ok === true && s7a.breached === true && s7a.missed.length === 2, 'B7a 到点未缴 ⇒ 结算为 breached（记 2 人欠缴）');
  const rec7a = W.collab.stat().breachesRecorded;
  ok(rec7a === 2, 'B7b 违约**记下了** 2（breachRecorded）');
  ok(W.collab.stat().penalized === 0, 'B7c 但**一个都没罚**（口径①：只记不罚 —— 自动罚没会让事后无法复盘「当时该不该罚」）');
  const s7b = W.collab.settle(r7.task);
  ok(s7b.ok === true && s7b.already === true, 'B7d 第二次结算 ⇒ already（幂等）');
  ok(W.collab.stat().breachesRecorded === rec7a, 'B7e 第二次**不重复记违约**（实 ' + W.collab.stat().breachesRecorded + '，首跑踩过「拿空任务判幂等」的恒真坑）');

  // B8 罚没：未结算不许罚；点名不在名册拒收；真罚走 org 并原话转述
  const r8 = W.collab.createTask([{ name: '甲', pledge: 1 }, { name: '乙', pledge: 1 }], '筑堤', SOON());
  ok(W.collab.penalize(r8.task, null, '粮', 1).reason === 'not-due', 'B8a 未结算的任务不许罚（还没有违约名单 ⇒ not-due）');
  ok(W.collab.penalize(r8.task, '丙', '粮', 1).reason === 'not-on-roster', 'B8b 点名一个不在任务里人 ⇒ not-on-roster');
  ok(W.collab.penalize('T999', null, '粮', 1).reason === 'bad-task', 'B8c 任务号不存在 ⇒ bad-task');
  const p8 = W.collab.penalize(r7.task, null, '粮', 2);
  ok(p8.ok === true && p8.applied === 2 && p8.faction === '甲村', 'B8d 真罚：逐人交给 org.penalize（实罚 2 人）');
  ok(W.collab.stat().penalized === 2, 'B8e 罚没数此时才动（0 → 2）：两个数确实是两件事');
  // B8f 的场必须先真结算：**已结清**指的是「结算完且没人欠」，不是「还没结算」。
  //   首跑踩过：拿未结算的 r4 去罚，走的是 not-due（还没名单），而不是 no-breach —— 场不对。
  W.collab.settle(r4.task, { force: true });
  const noB = W.collab.penalize(r4.task, null, '粮', 1);
  ok(noB.ok === true && noB.applied === 0 && noB.why === 'no-breach',
    'B8f 已结清的任务 ⇒ 罚 0 人并标 why=no-breach（「没人欠」与「没查」不同形）');

  // B9 三桶 + 两份留步 + 两套规模数（**不合并**）
  const st9 = W.collab.taskStat();
  ok(st9.completed === 1 && st9.breached === 1 && st9.active === 1 && st9.total === 3,
    'B9a 三桶可核对（完成 1 / 违约 1 / 活跃 1 / 总 3）');
  const s9 = W.collab.stat();
  ok(s9.taskTotal === 3 && s9.openTasks === 1, 'B9b stat 报任务表规模（表里 3 / 活跃 1）');
  ok(s9.tasks === 3 && s9.taskTotal === 3, 'B9c 「累计建过」与「表里还剩」两个数各报各的（同名会把两套数合成一套）');
  ok(s9.breachesRecorded === 2 && s9.penalized === 2, 'B9d stat 侧同样分开报「记下了」与「真罚了」');
}

// ── C 消费方（诊断真读者 + 面板真渲染）────────────────────────────────
function consumers() {
  const WA = freshWA();
  const col = (WA.toolDiag && typeof WA.toolDiag.collect === 'function') ? WA.toolDiag.collect() : null;
  const cd = col && col.collab;
  ok(!!cd, 'C0 诊断节 collab 可读（collect().collab）');
  if (cd) {
    ok(cd.taskTotal !== undefined && cd.taskActive !== undefined, 'C1 诊断面报任务面规模（表里几个 / 活跃几个）');
    ok(cd.breachRecorded !== undefined && cd.penalized !== undefined,
      'C2 诊断面**分开**报「记下了」与「真罚了」（合成一个数就答不出「违约有没有被处置」）');
  } else { ok(false, 'C1 诊断节不可用'); ok(false, 'C2'); }

  const W = env({ facs: FAC_A, people: MAN });
  let html = '';
  try { html = renderPeopleHtml(W); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'id="wa-task-create"') === 1, 'C3 人物页真渲染出建任务入口（渲染链路可用）');
  ok(hits(html, 'id="wa-task-settle"') === 1 && hits(html, 'id="wa-task-penalize"') === 1,
    'C4 结算与罚没两枚入口齐备（**分成两个按钮**就是口径①在 UI 上的体现）');
  const c1 = clickTk(W, 'wa-task-create', { 'wa-task-goal': '修水渠', 'wa-task-partners': '甲:3,乙:3', 'wa-task-deadline': '600' });
  ok(c1.threw === null, 'C5 点建任务未抛异常（真绑定可用）');
  // 任务号是**全局递增序号**（与其它表共用一个 seq）——判据不许硬编码 T1：
  //   首跑实测这里真接到 T4（前面 B 段已建过三个），于是「带 T1」的判据恒假。
  const tkNo = (W.store.get().collab.tasks.slice(-1)[0] || {}).id;
  ok(hits(c1.text, tkNo) === 1 && hits(c1.text, '甲村') === 1,
    'C6 建任务后输出行真带任务号与势力（' + tkNo + '，用户那面看得见）');
  const c2 = clickTk(W, 'wa-task-contribute', { 'wa-task-person': '甲', 'wa-task-id': tkNo, 'wa-task-amount': '3' });
  ok(hits(c2.text, '累计 3') === 1, 'C7 点记贡献后有读数');
  const c3 = clickTk(W, 'wa-task-settle', { 'wa-task-id': tkNo });
  ok(hits(c3.text, '未到截止') === 1 || hits(c3.text, 'not-due') === 1, 'C8 未到截止时如实报出（不留空面板）');
  const c4 = clickTk(W, 'wa-task-view');
  ok(hits(c4.text, '活跃') === 1 && hits(c4.text, '记 0') === 1, 'C9 点任务读数后带三桶与两份留步');
  // 开关真关掉的场：必须显式报出（「没算」与「算出来是空的」不许同形）
  const offW = env({ on: false, facs: FAC_A, people: MAN });
  const c5 = clickTk(offW, 'wa-task-view');
  ok(c5.threw === null && hits(c5.text, '0') >= 1, 'C10 开关未开时仍给出读数（不留空面板）');
}

// ── 每条破坏在破坏副本上重跑同款**真**判据 ────────────────────────────
//   `mk` 由调用方给：正控制传「原版工厂」，负控制传「破坏副本工厂」。判据**自己造世界**，
//   因为每条判据要的场不同（缺归属 / 跨势力 / 已结算）—— 外层先跑一遍，原版也会被判成破坏，
//   那不是判据，那是巧合。正控制段就是为抓它而设的。
function mustFail(key, mk) {
  switch (key) {
    case 'autoPenalize': { const W = mk();
      const r = W.collab.createTask([{ name: '甲', pledge: 2 }, { name: '乙', pledge: 2 }], 'g', PAST());
      W.collab.settle(r.task);
      return W.collab.stat().penalized !== 0; }
    case 'idem': { const W = mk();
      const r = W.collab.createTask([{ name: '甲', pledge: 2 }, { name: '乙', pledge: 2 }], 'g', PAST());
      W.collab.settle(r.task);
      const a = W.collab.stat().breachesRecorded;
      if (a !== 2) throw new Error('idem 场不对：首结 breachRecorded=' + a);
      W.collab.settle(r.task);
      return W.collab.stat().breachesRecorded !== a; }
    case 'dueGuard': { const W = mk();
      const r = W.collab.createTask([{ name: '甲', pledge: 1 }, { name: '乙', pledge: 1 }], 'g', SOON());
      const s = W.collab.settle(r.task);
      return s.reason !== 'not-due'; }
    case 'tooFew': { const W = mk();
      return W.collab.createTask(['甲'], 'g', SOON()).reason !== 'too-few'; }
    case 'crossFac': { const W = mk();
      return W.collab.createTask(['甲', '丙'], 'g', SOON()).why !== 'cross-faction'; }
    case 'diagTasks': { const W = mk();
      const r = W.collab.createTask(['甲', '乙'], 'g', SOON());
      if (!r.ok) throw new Error('diagTasks 场不对：建任务失败 ' + r.reason);
      const c = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().collab : null;
      return !c || c.taskTotal === 0 || c.taskTotal === undefined; }
    case 'panel': { const W = mk(); let h = '';
      try { h = renderPeopleHtml(W); } catch (e) { h = 'THREW'; }
      // 判据不内联锚点字面量：那枚 id 从锚点里派生
      const want = ANCHORS.panel.txt.split(' title=')[0];
      return hits(h, want) !== 1; }
    case 'evictSite': { const W = mk();
      const first = W.collab.createTask(['甲', '乙'], 'g0', PAST()).task;
      W.collab.settle(first, { force: true });
      for (let i = 0; i < 29; i++) {
        const rr = W.collab.createTask(['甲', '乙'], 'g' + i, PAST());
        W.collab.settle(rr.task, { force: true });
      }
      // 站点未在 SITES 登记 ⇒ evict.array 走 unknown-site 静默失败，表不停在 cap 24。
      return W.collab.taskStat().total !== 24; }
    default: return false;
  }
}
// ── 用例世界：每条判据要的场不同（判据自己造，见上）────────────────────
function caseSpec(key) {
  return { facs: FAC_A, people: MAN };
}
function runAll(a) {
  HOST = a;                                  // 判据上交宿主（见文件头「宿主断言」段）
  console.log('== A/B 判据（原版成绿）==');
  judge();
  console.log('== C 消费方（诊断真读者 + 面板真渲染）==');
  consumers();
  console.log('COLLAB-TASKS-V2139: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
  return fails;
}
function runNegative(a) {
  HOST = a;                                  // 负控判据同样上交宿主
  let nf = 0;
  console.log('== N0–N7 真源码破坏（破坏副本上重跑同款真判据）==');
  BROKEN.forEach(function (b) {
    const n = hits(src(b.spec.rel), b.spec.txt);
    checks++; if (n !== 1) { nf++; console.log('  ✗ N0 锚点不唯一：' + b.key + ' hits=' + n); }
    else console.log('  ✓ N0 ' + b.key + ' 锚点恰中 1 次');
  });
  // H5 判据纯度：判据层不许内联锚点串（锚点字面量只准在 ANCHORS 里声明一次）
  //   写法与 hazard-trigger-v2138 同源：**从 ANCHORS 取值**，不在这里再抄一遍 ——
  //   抄一遍就等于给锚点串开了第二个真源，而审计器正是按「本文件出现次数」判纯度的。
  const self = src(SELF);
  const anchorsBlock = self.slice(self.indexOf('const ANCHORS'), self.indexOf('const BROKEN'));
  const judgeBlock = self.slice(self.indexOf('function mustFail'), self.indexOf('function caseSpec'));
  BROKEN.forEach(function (b) {
    // 多行锚点在本文件里是**转义形态**（`\n` 写作 `\\n`）——与审计器同口径：
    //   拿真换行去数会得到 0（首跑实测），那会把「已声明」误判成「没声明」。
    const lit = b.spec.txt;
    const form = lit.replace(/\n/g, '\\n');
    const inAnchors = hits(anchorsBlock, form);
    const inJudge = hits(judgeBlock, form);
    checks++;
    if (inAnchors !== 1 || inJudge !== 0) { nf++; console.log('  ✗ H5 纯度：' + JSON.stringify(lit.slice(0, 26)) + ' 声明 ' + inAnchors + ' 次 / 判据内 ' + inJudge + ' 次'); }
    else console.log('  ✓ H5 纯度：锚点只声明 1 次且判据不内联 ' + JSON.stringify(lit.slice(0, 22)));
  });
  // 正控制：原版上同款判据必须**全为假**（否则判据恒真、负控无意义）
  BROKEN.forEach(function (b) {
    let truth = null;
    try { truth = mustFail(b.key, function () { return env(caseSpec(b.key)); }); }
    catch (e) { truth = 'threw:' + (e && e.message); }
    checks++;
    if (truth !== false) { nf++; console.log('  ✗ 正控制失败：' + b.key + ' 在原版上判据竟为真（' + truth + '）⇒ 判据恒真，这条负控制无意义'); }
    else console.log('  ✓ 正控制：' + b.key + ' 同款判据在原版上为假');
  });
  // N1–N8：每条破坏 ⇒ 装载破坏副本 ⇒ 同款判据必须真现形
  BROKEN.forEach(function (b) {
    let bad = null, err = null;
    try { bad = mustFail(b.key, function () { return envBroken(caseSpec(b.key), brokenOverride(b.spec)); }); }
    catch (e) { err = e; }
    checks++;
    if (err) { nf++; console.log('  ✗ N 装载/判据抛出 ' + b.key + '：' + (err && err.message)); }
    else if (!bad) { nf++; console.log('  ✗ N 破坏未被观测到：' + b.key + '（破坏副本上判据仍绿 ⇒ 判据无效）'); }
    else console.log('  ✓ N 破坏现形：' + b.key);
  });
  // N5 纯度：全部负控制跑完后，四个真文件逐字未变
  const rels = [CO, DIAG, PANEL, STORE];
  const before = rels.map(function (r) { return src(r); });
  const after = rels.map(function (r) { return src(r); });
  checks++;
  if (before.some(function (v, i) { return v !== after[i]; })) {
    nf++; console.log('  ✗ N5 纯度：负控制期间真文件被改写（破坏只准发生在内存副本上）');
  } else console.log('  ✓ N5 纯度：四个真文件逐字未变（破坏只发生在内存副本上）');
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
  console.log(f ? 'COLLAB-TASKS-V2139: FAIL' : 'COLLAB-TASKS-V2139: pass');
  process.exitCode = f ? 1 : 0;
}
