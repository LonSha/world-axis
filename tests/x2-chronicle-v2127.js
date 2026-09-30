#!/usr/bin/env node
// WorldAxis tests/x2-chronicle-v2127.js —— v2.127.0（拓展计划 X2）：世界编年史
//
// 【它治的病】
//   本仓的记忆有 L0–L3 分层（`memory.l3` 记长线主题）、也有归档历史（`store.chronicle`），
//   但**两者从未摆在同一处**，而注入面只看 chronicle 里最近那几条 —— 三章之后模型读到的是
//   「一堆事件行」，答不出「这个世界的走向」，于是每轮重新推断一次基调，长局里基调随最新
//   一条事件漂。
//
// 【本版落点】
//   · `chrono.chronicle(opts)` 只读读数：`rows`（已结算归档，按 `at` 升序）+ `themes`
//     （L3 长线沉淀，切片保序）+ `hidden`（被挡下的，逐条带因）+ 容量如实（`capped`）。
//   · `chrono.buildBlock()` 注入块：消费者是 `render/inject.js` 的新注入源 `chrono`
//     （只报「发生过什么」，不出时间戳、不出主题词、不出 hidden 计数）。
//   · `engines/tool-diag.js` 的 secChrono 是 `chronicle` 读数的真读者（诊断只读口）。
//
// 【本版收回的一处「同一件事两个实现」】
//   首版把**未结算暗流**（`store.currents`）也收进编年史表。而它在库里**早已有一条注入通路**：
//   `currents` 是快照六源之一，每轮逐条进正文。同一个源两条通路 = v2.88.0 O1（同一源两套名字、
//   两本账对不上）与 v2.99.0 各付过一次学费的形态。本版删掉该段，并把两张表按**时间轴**分工：
//   `currents` 答「此刻世界在酝酿什么」（每轮会变），`chronicle` 答「此前发生过什么」（只增不减）。
//   判据 B2 就是这条：往 currents 里塞一条显眼的，编年史表必须**一条都不多**。
//
// 【判据结构（与 delete-gate-v2124 同规格）】
//   A 结构 · B 运行时 · C 消费方（真读者）· N 真源码破坏 ⇒ 破坏副本上重跑同款判据 · 纯度
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const CH = 'engines/chrono.js', INJ = 'render/inject.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
// ── 真源码破坏锚点（各须恰中 1 次）───────────────────────────────────
const ANCHORS = {
  hidden: { rel: CH, txt: "if (txt(c.visibility, 20) === 'hidden') {" },
  sort: { rel: CH, txt: "rows.sort(function (a, b) { return a.at - b.at; });" },
  kept: { rel: CH, txt: "const kept = capped ? rows.slice(-maxRows) : rows;" },
  limit: { rel: CH, txt: "const r = chronicle({ limit: 12 });" },
  exp: { rel: CH, txt: "chronicle: chronicle, buildBlock: buildBlock," },
  injBranch: { rel: INJ, txt: "if (vis.chrono && WA.chrono) { const chb = engineCall('chrono', function () { return WA.chrono.buildBlock(); }); if (chb) items.push({ source: '世界编年史', content: chb }); }" },
  injSrc: { rel: INJ, txt: "'chrono'];" },
  injName: { rel: INJ, txt: "chrono: '世界编年史'," },
  injMod: { rel: INJ, txt: "worldaxis_chrono_settings_v1'," },
  panelName: { rel: PANEL, txt: "chrono: '世界编年史' };" },
  diagRead: { rel: DIAG, txt: "const cr = WA.chrono.chronicle({ limit: 12 });" }
};
const TAG = '__x2_2127_';
function reset(WA, chRows, currents) {
  WA.chrono.setSettings({ enabled: false });
  WA.store.transact(function (d) {
    d.chrono = { entries: [], seq: 0 };
    d.chronicle = chRows || [];
    d.currents = currents || [];
    d.memory = { l0: [], l1: [], l2: [], l3: [] };
  }, TAG + 'reset');
  WA.chrono.setSettings({ enabled: true });
  return WA;
}
const ROWS = [
  { id: 'c2', kind: 'event', title: '第二件事', summary: '二摘要', at: 200 },
  { id: 'c1', kind: 'fact', title: '第一件事', summary: '一摘要', at: 100 },
  { id: 'c3', kind: 'event', title: '第三件事', summary: '三摘要', at: 300, visibility: 'hidden' }
];
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2127/x2: [A] 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const c = src(CH);
  a(c.indexOf('function chronicle(opts) {') > 0 && c.indexOf('function buildBlock() {') > 0,
    'v2127/x2: [A] 两块都在位（chronicle 给读数、buildBlock 给注入段）');
  // 「同一件事两个实现」的收回：未结算暗流整类不进本表
  const fn = c.slice(c.indexOf('function chronicle(opts) {'), c.indexOf('function buildBlock() {'));
  a(fn.indexOf('s.currents') < 0 && fn.indexOf('state().currents') < 0,
    'v2127/x2: [A] 未结算暗流**整类**不进编年史表（它们在库里已有 `currents` 源逐轮进正文 —— '
      + '同一件事两个实现正是 v2.88.0 O1 的形态）');
  a(fn.indexOf('transact') < 0 && fn.indexOf('draft.') < 0 && fn.indexOf('saveSettings') < 0,
    'v2127/x2: [A] chronicle 是**只读**的（不改写、只切分）');
  a(c.indexOf(ANCHORS.exp.txt) > 0,
    'v2127/x2: [A] 两块都在导出面上');
}
// ── B 面：运行时 ────────────────────────────────────────────────────
function runB(a) {
  const WA = reset(fresh(), ROWS);
  const r = WA.chrono.chronicle({});
  a(r.ok === true && r.dryRun === true, 'v2127/x2: [B] 读数带 dryRun（这是只读面，不是一次写入）');
  a(r.count === 2 && r.total === 2 && r.capped === false,
    'v2127/x2: [B1] 只收已结算归档里**非 hidden** 的两条（实 count ' + r.count + '）');
  a(r.rows[0].at === 100 && r.rows[1].at === 200,
    'v2127/x2: [B1] 按 `at` **升序**（乱序输入也必须排；实 ' + r.rows.map(function (x) { return x.at; }).join(',') + '）');
  a(r.hiddenCount === 1 && r.hidden[0].title === '第三件事' && r.hidden[0].why === 'visibility=hidden',
    'v2127/x2: [B1] 显式标 hidden 的行被挡在表外**并如实记因**（不是删掉；实 '
      + JSON.stringify(r.hidden) + '）');
  // B2 本版收回的重复：往 currents 塞一条显眼的，编年史表一条都不许多
  WA.store.transact(function (d) {
    d.currents = [{ id: 'cu1', title: '一条暗流', summary: '暗中酝酿', visibility: 'public', at: 999 }];
  }, TAG + 'cur');
  const r2 = WA.chrono.chronicle({});
  a(r2.count === 2 && r2.rows.filter(function (x) { return x.title === '一条暗流'; }).length === 0,
    'v2127/x2: [B2] 未结算暗流不进这条表（修前它会被收进来 ⇒ 同一个源两条注入通路；实 count '
      + r2.count + '）');
  // B3 容量如实：只保留**最近**若干条 + 如实报 capped
  const many = [];
  for (let i = 0; i < 60; i++) many.push({ id: 'm' + i, title: '事件' + i, summary: 's' + i, at: i });
  reset(fresh(over(CH, src(CH))), many);
  const W3 = reset(fresh(), many);
  const r3 = W3.chrono.chronicle({});
  a(r3.capped === true && r3.count === 48 && r3.rows[0].at === 12 && r3.rows[47].at === 59,
    'v2127/x2: [B3] 超上限只保留**最近**的 48 条并如实报 capped（不静默丢 —— 丢了早期的大事 '
      + '就凭空消失；实 count ' + r3.count + ' / 首条 at ' + (r3.rows[0] || {}).at + '）');
  a(W3.chrono.chronicle({ limit: 5 }).count === 5,
    'v2127/x2: [B3] limit 可收窄（调用方要几条给几条）');
  a(W3.chrono.chronicle({ limit: 99999 }).count === 60,
    'v2127/x2: [B3] limit 有上限但不截断到上限以下（60 条全给 —— 上限只在超 256 时生效）');
  // B4 themes 只出**已有**的 L3 主题，切片保序
  const W4 = reset(fresh(), ROWS);
  W4.store.transact(function (d) {
    d.memory.l3 = [{ t: 30, theme: '动荡年代', worldShift: '旧秩序松动' }, { t: 10, theme: '早先的主题' }];
  }, TAG + 'l3');
  const r4 = W4.chrono.chronicle({});
  a(r4.themes.length === 2 && r4.themes[0].theme === '动荡年代' && r4.themes[1].theme === '早先的主题',
    'v2127/x2: [B4] themes 照 L3 原顺序出（不重排、不合并同义词；实 '
      + JSON.stringify(r4.themes.map(function (x) { return x.theme; })) + '）');
  a(r4.rows.every(function (x) { return x.theme === undefined; }),
    'v2127/x2: [B4] 主题词**不混进** rows（两边排序单位不同，混进去等于替模型定基调）');
  // B5 不做摘要：rows 保留原题名与切片，不压成一句
  a(r.rows[0].title === '第一件事' && r.rows[0].text === '一摘要',
    'v2127/x2: [B5] rows 保留原题名与摘要切片（不压成「世界震荡」那种没有来源的一句话）');
  // B6 buildBlock：只出最近 12 行、无时间戳、无主题词
  const W6 = reset(fresh(), many);
  const blk = W6.chrono.buildBlock();
  const lines = blk.split('\n');
  a(blk.indexOf('【世界编年史】') === 0, 'v2127/x2: [B6] 块以【世界编年史】开头');
  a(lines.filter(function (l) { return l.indexOf('· ') === 0; }).length === 12,
    'v2127/x2: [B6] 只出最近 12 行（实 '
      + lines.filter(function (l) { return l.indexOf('· ') === 0; }).length + '）—— 注入预算有限');
  a(blk.indexOf('· 事件59：s59') > 0 && blk.indexOf('· 事件48：s48') > 0 && blk.indexOf('事件47：') < 0,
    'v2127/x2: [B6] 出的是**最近**的 12 条（实尾行 ' + JSON.stringify(lines[12] || '') + '）');
  a(blk.indexOf('300') < 0 && blk.indexOf('at') < 0,
    'v2127/x2: [B6] 时间戳不进正文（正文的时间口径归 `clock` —— 两处各报一个时间会让「现在是什么时辰」'
      + '出现两个真源）');
  a(blk.indexOf('worldShift') < 0 && blk.indexOf('长线主题') < 0,
    'v2127/x2: [B6] L3 主题词不进注入块（塞进正文等于替模型定了基调）');
  a(blk.indexOf('不要据此推断尚未发生的事') > 0,
    'v2127/x2: [B6] 块尾带约束句（只供理解走向，不得据此提前演出）');
  // B7 关闭 / 无存档 ⇒ 零 token
  W6.chrono.setSettings({ enabled: false });
  a(W6.chrono.buildBlock() === '', 'v2127/x2: [B7] 总开关关闭 ⇒ 空串（零 token）');
  W6.chrono.setSettings({ enabled: true });
  const W8 = reset(fresh(), []);
  a(W8.chrono.buildBlock() === '', 'v2127/x2: [B7] 归档为空 ⇒ 空串（不产出一个只有标题的空块）');
  // B8 只读：读一轮前后存档逐字不变
  const W9 = reset(fresh(), ROWS);
  const snap = JSON.stringify(W9.store.get());
  W9.chrono.chronicle({}); W9.chrono.buildBlock();
  a(JSON.stringify(W9.store.get()) === snap,
    'v2127/x2: [B8] 读一轮（读数 + 注入块）后存档逐字未变');
}
// ── C 面：消费方 ────────────────────────────────────────────────────
function runC(a) {
  // 四处同批登记（v2.56.0 立的规矩）
  const inj = src(INJ), pn = src(PANEL), dg = src(DIAG);
  a(inj.indexOf('\'chrono\'];') > 0 && inj.indexOf('vis.chrono && WA.chrono') > 0,
    'v2127/x2: [C] 源表与注入分支**同批**登记（只加一边 = 声明了没人消费 / 开关点了零效果）');
  a(hits(inj, 'chrono:') >= 2,
    'v2127/x2: [C] 显示名表与模块开关映射都登记了（缺名 ⇒ 失败台账与开关两面裸露英文键）');
  a(pn.indexOf('chrono: \'世界编年史\'') > 0,
    'v2127/x2: [C] 面板 VIS_NAMES 登记（缺名 ⇒ 注入页裸露英文键名）');
  a(dg.indexOf('WA.chrono.chronicle({ limit: 12 })') > 0,
    'v2127/x2: [C] 诊断节真读 chronicle（没有它，chronicle 就是个没人看的死导出）');
  // 运行时：新源真的进注入项（`lastInjection.sources` 是注入项名表 —— 由 `items.push({source})` 汇总）
  const WA = reset(fresh(), ROWS);
  (WA.render.SOURCES || []).forEach(function (k) { WA.render.setVisibility(k, true); });
  WA.render.applyInjections({ injections: [] });
  const li = WA.store.get().lastInjection || {};
  a((li.sources || []).indexOf('世界编年史') >= 0,
    'v2127/x2: [C] 新源**真的**产出了一个注入项（不是只在源表里挂个名字；实 '
      + JSON.stringify(li.sources) + '）');
  a(li.decisions && li.decisions.filter(function (d) { return d.key === 'chrono'; })[0]
      && li.decisions.filter(function (d) { return d.key === 'chrono'; })[0].state !== 'module-absent',
    'v2127/x2: [C] 该源在注入归因表里有自己的行（不在表里 ⇒ 「这源怎么没进正文」答不出）');
  // 关掉该源 ⇒ 该项消失（开关真作用于这条通路）
  WA.render.setVisibility('chrono', false);
  WA.render.applyInjections({ injections: [] });
  a(((WA.store.get().lastInjection || {}).sources || []).indexOf('世界编年史') < 0,
    'v2127/x2: [C] 关掉 `chrono` 源后该项消失（开关不是装饰）');
  // 两表分工：`currents` 走快照块（世界状态），编年史走自己那块 —— 同一条暗流**只**从前一条路进正文
  WA.render.setVisibility('chrono', true); WA.render.setVisibility('currents', true);
  WA.store.transact(function (d) {
    d.currents = [{ id: 'cu9', title: '暗流甲', summary: '酝酿中', visibility: 'public' }];
  }, TAG + 'split');
  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  // 最终 prompt 的落点是一个**对象** `{key, text, pos, depth, scan}`（不是字符串）——
  //   判据必须读它的 `.text`，读成字符串会拿到 "[object Object]"（那会让下面两条判据
  //   双双变成「有没有」的空判，而不是内容判）。
  const prompt2 = String((global.__lastExtensionPrompt || {}).text || '');
  a(prompt2.indexOf('暗流甲') >= 0 && prompt2.indexOf('【世界编年史】') >= 0,
    'v2127/x2: [C] 两条通路同时在场：暗流经 `currents` 进正文，编年史走自己那一块');
  a(prompt2.split('暗流甲').length - 1 === 1,
    'v2127/x2: [C] 暗流在最终 prompt 里**只出现一次**（若编年史表也收它，这里会变 2 —— '
      + '同一个源两条通路正是本版收回的那条路；实 ' + (prompt2.split('暗流甲').length - 1) + '）');
}
// ── N 面：真源码破坏 ⇒ 破坏副本上重跑同款判据 ────────────────────────
function runNegative(a) {
  const C0 = src(CH), I0 = src(INJ), D0 = src(DIAG), P0 = src(PANEL);
  const probeHidden = function (WA) { return reset(WA, ROWS).chrono.chronicle({}).count; };
  const probeSort = function (WA) {
    return reset(WA, ROWS).chrono.chronicle({}).rows.map(function (x) { return x.at; }).join(',');
  };
  const probeCap = function (WA) {
    const many = [];
    for (let i = 0; i < 60; i++) many.push({ id: 'm' + i, title: '事件' + i, summary: 's' + i, at: i });
    const r = reset(WA, many).chrono.chronicle({});
    return r.count + '/' + r.capped + '/' + (r.rows[0] || {}).at;
  };
  const probeBlock = function (WA, rows) {
    // 行数探针：默认喂 60 条（>12），也可由调用方指定归档（如空表）——
    //   若把它写死成那 60 条，纯度判据里的「空归档 ⇒ 空块」就会读到一个与它无关的数（假失败）。
    const many = rows || (function () {
      const a = [];
      for (let i = 0; i < 60; i++) a.push({ id: 'm' + i, title: '事件' + i, summary: 's' + i, at: i });
      return a;
    })();
    return reset(WA, many).chrono.buildBlock().split('\n').filter(function (l) { return l.indexOf('· ') === 0; }).length;
  };
  const probeInjectItem = function (WA) {
    reset(WA, ROWS);
    (WA.render.SOURCES || []).forEach(function (k) { WA.render.setVisibility(k, true); });
    WA.render.applyInjections({ injections: [] });
    return ((WA.store.get().lastInjection || {}).items || [])
      .filter(function (x) { return x && x.source === '世界编年史'; }).length;
  };
  // N1 hidden 过滤拆掉 ⇒ 秘密行进表
  const n1 = breakOnce(C0, ANCHORS.hidden.txt, 'if (false) {', 'N1');
  a(probeHidden(fresh(over(CH, n1))) === 3,
    'v2127/x2: [N1] hidden 过滤拆掉后秘密行进表（B1 不是恒真）');
  // N2 不排序 ⇒ 表按插入序出（不是时间序）
  const n2 = breakOnce(C0, ANCHORS.sort.txt, 'void 0;', 'N2');
  a(probeSort(fresh(over(CH, n2))) === '200,100',
    'v2127/x2: [N2] 不排序时输出的 at 是插入序（B1 的升序不是恒真）');
  // N3 容量改成保留**最早**的 ⇒ 读数现形
  const n3 = breakOnce(C0, ANCHORS.kept.txt, 'const kept = capped ? rows.slice(0, maxRows) : rows;', 'N3');
  a(probeCap(fresh(over(CH, n3))) !== '48/true/12',
    'v2127/x2: [N3] 保留最早的那批时读数与判据不符（B3 不是恒真；实 '
      + probeCap(fresh(over(CH, n3))) + '）');
  // N4 注入块不限行数 ⇒ 十二行限制消失
  const n4 = breakOnce(C0, ANCHORS.limit.txt, 'const r = chronicle({ limit: 256 });', 'N4');
  a(probeBlock(fresh(over(CH, n4))) === 60,
    'v2127/x2: [N4] 不限行数后注入块出满 60 行（B6 不是恒真）');
  // N5 摘掉注入分支 ⇒ 新源产不出注入项
  const n5 = breakOnce(I0, ANCHORS.injBranch.txt, 'void 0;', 'N5');
  a(probeInjectItem(fresh(over(INJ, n5))) === 0,
    'v2127/x2: [N5] 摘掉注入分支后新源产不出注入项（C 面判据不是恒真）');
  // N6 源表不登记 ⇒ 开关点了零效果（面板根本没有这个开关）
  const n6 = breakOnce(I0, ANCHORS.injSrc.txt, '\'session\'];', 'N6');
  const W6 = fresh(over(INJ, n6));
  reset(W6, ROWS);
  a((W6.render.SOURCES || []).indexOf('chrono') < 0,
    'v2127/x2: [N6] 源表不登记时该源不在 SOURCES 里（C 面「同批登记」判据不是恒真）');
  // N7 诊断不再读 chronicle ⇒ 死导出面判据现形（源码面判，避免诊断未装载时的假绿）
  const n7 = breakOnce(D0, ANCHORS.diagRead.txt, 'const cr = { count: 0 };', 'N7');
  a(n7.indexOf('WA.chrono.chronicle(') < 0,
    'v2127/x2: [N7] 诊断不再读 chronicle 时该读数为零（C 面判据不是恒真）');
  // N8 显示名不登记 ⇒ 裸露英文键
  const n8 = breakOnce(P0, ANCHORS.panelName.txt, 'chronoStub: \'世界编年史\' };', 'N8');
  a(hits(n8, 'chrono: \'世界编年史\'') === 0,
    'v2127/x2: [N8] 面板显示名不登记时该键缺失（C 面判据不是恒真）');
  // N9 纯度：全部负控制跑完后四个真文件逐字未变 + 原版同款判据成立
  a(src(CH) === C0 && src(INJ) === I0 && src(DIAG) === D0 && src(PANEL) === P0,
    'v2127/x2: [N9]（纯度）全部负控制跑完后四个真文件逐字未变');
  a(probeHidden(reset(fresh(), ROWS)) === 2 && probeBlock(fresh(), []) === 0,
    'v2127/x2: [N9]（纯度）原版上同款判据为真（归档 3 条 → 出 2 条；归档为空 → 块为空）'
      + ' —— 两向自证成立');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: CH
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); } catch (e) { fail++; console.log('  x A/B/C threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('X2-CHRONICLE-V2127: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('X2-CHRONICLE-V2127: pass（' + pass + ' 项）');
}