#!/usr/bin/env node
// WorldAxis tests/shadow-v2630.js —— 社交漩涡「不可逆经历」锁（v2.63.0）
//
// 【它治的病】关系量值可以升可以降，**经历不可逆**。本模块最有价值的四条能力全是否定式：
//   · 没有秘密可加深时，承诺**不得凭空升级**（不许把「第一次见面」直接写成「生死之交」）；
//   · 秘密是**双方各持一行**（单方面持有的，是心事不是把柄）；
//   · 履行（kept）与背弃（broken）必须**分开归因**、两者都留痕；
//   · 变淡只降胁迫感，**不删「秘密曾存在」**这件事。
//   存在面判据（有 addShadow 吗 / 有 SHADOW_KINDS 吗 / 有 deepen 吗）对这四条一无所知：
//   一个「deepen 时若没有秘密就先建一条」「brighten 到 0 就删行」的实现，
//   同样拥有全套函数名、全套常量，而且**会让面板看起来更顺滑**。
//
// 【为什么既有锁全都照不到】（与本锁正交的那些面）
//   · v2620（registry-identity）钉「稳定人物 id 与身份对账」，管的是**谁是谁**，
//     不管「两人之间发生过什么」；
//   · v2610（evict-meta）钉「淘汰元字段由谁提供」；
//   · rel-contract v2590/v2600 钉「节内字段 ⇄ 引擎读取面」；
//   · field-liveness / dead-export 是静态面。
//   一句话：既有锁把「经历表存在」钉住了，没人钉「可逆量值与不可逆经历不能混为一谈」。
//
// 【做法】判据全部跑在**真源码**上：经 tests/ui-gate-sync.js 的 fresh() 装载真 LOAD
//   （含本版新插入的 engines/shadow.js），不 mock 被测逻辑本身。
//   破坏自证走 opts.srcOverride：把真源码在**内存副本**上改坏后重跑同款判据，一个字节都不改仓库文件。
//
// 【判据】
//   1  总开关默认关闭：不记经历、不注入、不改动任何东西。
//   2  共同隐瞒是**双方各持一行**：pairKey 对调次序仍得同一个键（反向调用 existed:true）。
//   3  同名自配、未知 kind/stakes 拒收。
//   4  无秘密可加深 ⇒ no-shadow；已终结 ⇒ shadow-closed（两种理由**分开**报出）。
//   5  deepen/brighten 的非法增量（0 / 负 / 非数）拒收，且不改动已有行。
//   6  severity 上限 10 封顶；变淡降到 0 时 status 转 faded，**记录仍在**（exists:true、severity:0）。
//   7  已变淡的秘密不得再被 deepen（须先重开），归因 shadow-closed。
//   8  重开不是覆写：旧行留在 experiences 面，重开有 reopenedAt 痕迹。
//   9  经历 outcome 三态各自留痕，履行与背弃**分列可数**（kept/broken 分开报）。
//   10 outcome 非法值拒收（bad-outcome），what 为空拒收（missing-what）。
//   11 experiencesOf 只取本对的经历（不串味），visibleTo 只给**持有者**（不是「关于他」）。
//   12 容量与挤出：rows 容器恒 12、挤出经 evict 记账、剪枝走已登记站点。
//   13 注入块有独立标题、明写「秘密是经历不是态度」「履行与背弃是两种不同事实」；空库不产空头段。
//   14 观测面：被拒的调用不落盘，故按原因计入 stat.faults。
//
// 【负控制】N0 破坏锚点在真源码中各恰中 1 次；N1/N2 两向自证；N3 逐锚敏感；N4 非恒真；N5 无副作用。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;

const SITE_ROWS = 'shadow.rows';
const CAP_ROWS = 12;
const TAG = '__sh2630_';
// ── 四个破坏锚点：**只在真源码里各恰中 1 次**（N0 校验） ──
const A_PAIR = "function pairKey(a, b) { return namesOf(a, b).sort().join('|'); }";
const A_DEEPEN = "const add = Number(amount);\n    if (!isFinite(add) || add <= 0) return { ok: false, reason: 'bad-amount' };\n    const k = pairKey(a, b);\n    const cur = findRow(rows(), k);\n    if (!cur) return { ok: false, reason: 'no-shadow', pair: k };\n    if (cur.status !== 'active') return { ok: false, reason: 'shadow-closed', pair: k, status: cur.status };";
const A_FADED = "if (after === 0) row.status = 'faded';   // 记录仍在：秘密**存在过**是事实，不是态度";
const A_FAULT = "if (r && r.ok === false && typeof r.reason === 'string' && r.reason) {";

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function shadowOf(WA) {
  if (!WA.shadow) throw new Error('WA.shadow 未装载（engines/shadow.js 不在 LOAD 清单里？）');
  return WA.shadow;
}
function st(WA) { return WA.store.get() || {}; }
function snode(WA) { const s = st(WA).shadow; return (s && typeof s === 'object' && !Array.isArray(s)) ? s : {}; }
function rows(WA) { return Array.isArray(snode(WA).rows) ? snode(WA).rows : []; }
function exps(WA) { return Array.isArray(snode(WA).experiences) ? snode(WA).experiences : []; }
function resetShadow(WA, tag) {
  WA.store.transact(function (d) { d.shadow = { rows: [], experiences: [] }; }, TAG + (tag || 'reset'));
}
// ── 无副作用隔离 ──
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) out[k] = LS.getItem(k); }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k === null) continue;
    let v = '';
    try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}

// ══════════════ 判据 ══════════════
function judge(a) {
  const WA = fresh();
  const s = shadowOf(WA);
  resetShadow(WA);

  // ── 1 总开关默认关闭 ──
  const cfg0 = s.getSettings();
  a(cfg0 && cfg0.enabled === false, 'v2630/shadow: [1] 默认关闭（实 ' + JSON.stringify(cfg0 && cfg0.enabled) + '）');
  a(s.buildBlock() === '', 'v2630/shadow: [1] 关闭时注入块为空（不注入）');
  // 空库不产空头段：此刻一条秘密一条经历都没有，即使开了开关也不该出现标题。
  //   为什么放在最前：判据必须**自成一体**——若挪到末尾，前面用例会先把库塞满。
  s.setSettings({ enabled: true });
  a(s.buildBlock() === '', 'v2630/shadow: [1] 空库不产空头段（无秘密无经历时应返回空串）');
  // 被拒的东西**不落盘**：这正是必须另立观测面的原因，故在最前（库空）时验一次最干净。
  const sEmpty0 = JSON.stringify(snode(WA));
  s.deepen('谁也不认识的甲', '谁也不认识的乙', 3);
  a(JSON.stringify(snode(WA)) === sEmpty0,
    'v2630/shadow: [1] 被拒的加深**不落盘**（不许「顺手先建一条再加深」）');
  a((s.stat().faults || {})['no-shadow'] >= 1,
    'v2630/shadow: [1] 但拒绝必须**可观测**（实 ' + JSON.stringify(s.stat().faults) + '）');
  s.setSettings({ enabled: false });
  a(s.getSettings().enabled === false, 'v2630/shadow: [1] 关回去后确实关闭（不留跨用例残留）');

  // ── 2 共同隐瞒是双方各持一行 ──
  const d0 = s.deepen('甲', '乙', 2);
  a(d0.ok === false && d0.reason === 'no-shadow',
    'v2630/shadow: [2] 无秘密可加深 ⇒ no-shadow（不许凭空升级；实 ' + JSON.stringify(d0) + '）');
  const ad = s.addShadow('甲', '乙', { kind: 'crime', stakes: 'high', secret: '顶罪', severity: 4 });
  a(ad.ok === true && ad.pair === '乙|甲',
    'v2630/shadow: [2] pairKey 是两名字排序后连接（实 ' + JSON.stringify(ad && ad.pair) + '）');
  const adRev = s.addShadow('乙', '甲', { kind: 'crime' });
  a(adRev.ok === true && adRev.pair === '乙|甲' && adRev.existed === true,
    'v2630/shadow: [2] 反向调用落到**同一行**（共同隐瞒双方各持一行；实 ' + JSON.stringify(adRev) + '）');
  a(rows(WA).length === 1, 'v2630/shadow: [2] 反向调用不新增第二行（实 ' + rows(WA).length + ' 行）');

  // ── 3 非法输入拒收 ──
  a(s.addShadow('甲', '甲', {}).reason === 'self-pair', 'v2630/shadow: [3] 自配拒收（self-pair）');
  a(s.addShadow('甲', '丙', { kind: 'nonsense' }).reason === 'bad-kind', 'v2630/shadow: [3] 未知 kind 拒收（bad-kind）');
  a(s.addShadow('甲', '丙', { stakes: 'nonsense' }).reason === 'bad-stakes', 'v2630/shadow: [3] 未知 stakes 拒收（bad-stakes）');
  a(s.addShadow('', '丙', {}).reason === 'missing-fields', 'v2630/shadow: [3] 缺名拒收（missing-fields）');

  // ── 4 无秘密 / 已终结 两种理由分开 ──
  a(s.deepen('甲', '丙', 2).reason === 'no-shadow', 'v2630/shadow: [4] 另一对无秘密 ⇒ no-shadow');
  const dp1 = s.deepen('甲', '乙', 2);
  a(dp1.ok === true && dp1.before === 4 && dp1.after === 6,
    'v2630/shadow: [4] 有秘密在生效 ⇒ 加深生效并回报前后值（实 ' + JSON.stringify(dp1) + '）');

  // ── 5 非法增量拒收且不改动已有行 ──
  const before5 = JSON.stringify(rows(WA));
  a(s.deepen('甲', '乙', 0).reason === 'bad-amount', 'v2630/shadow: [5] 零增量拒收（0 是调用方写错，不是无操作）');
  a(s.deepen('甲', '乙', -1).reason === 'bad-amount', 'v2630/shadow: [5] 负增量拒收（bad-amount）');
  a(s.brighten('甲', '乙', 0).reason === 'bad-amount', 'v2630/shadow: [5] 变淡零增量拒收（bad-amount）');
  a(JSON.stringify(rows(WA)) === before5, 'v2630/shadow: [5] 被拒的调用**不得**改动已有行（逐字不变）');

  // ── 6 severity 封顶与「变淡不删记录」 ──
  const dp2 = s.deepen('甲', '乙', 99);
  a(dp2.ok === true && dp2.after === 10, 'v2630/shadow: [6] 胁迫感上限 10 封顶（实 ' + dp2.after + '）');
  const br = s.brighten('甲', '乙', 99);
  a(br.ok === true && br.after === 0 && br.status === 'faded',
    'v2630/shadow: [6] 降到 0 ⇒ status 转 faded（实 ' + JSON.stringify(br) + '）');
  const g1 = s.getShadow('乙', '甲');
  a(g1.ok === true && g1.exists === true && g1.severity === 0 && g1.status === 'faded' && g1.closed === true,
    'v2630/shadow: [6] 变淡**不删记录**：行仍在、severity 归零、closed 为真（实 ' + JSON.stringify(g1) + '）');
  a(rows(WA).length === 1, 'v2630/shadow: [6] 变淡后行数不变（删行 = 抹掉「秘密曾存在」这个事实）');

  // ── 7 已变淡者不得再加深 ──
  const dp3 = s.deepen('甲', '乙', 3);
  a(dp3.ok === false && dp3.reason === 'shadow-closed' && dp3.status === 'faded',
    'v2630/shadow: [7] 已终结 ⇒ shadow-closed（与 no-shadow **分开**归因；实 ' + JSON.stringify(dp3) + '）');
  a(s.brighten('甲', '乙', 1).reason === 'shadow-closed', 'v2630/shadow: [7] 已终结者同样不得再变淡');

  // ── 8 重开不是覆写 ──
  s.addExperience('甲', '乙', { what: '替对方顶罪', outcome: 'kept' });
  const ro = s.addShadow('甲', '乙', { kind: 'debt', stakes: 'mid', severity: 2 });
  a(ro.ok === true && ro.reopened === true,
    'v2630/shadow: [8] 已终结的秘密可重开（实 ' + JSON.stringify(ro) + '）');
  a(rows(WA).length === 1 && exps(WA).length === 1,
    'v2630/shadow: [8] 重开**不覆写**经历面：旧经历仍在（rows=1 / exps=1，实 '
    + rows(WA).length + '/' + exps(WA).length + '）');
  const g2 = s.getShadow('甲', '乙');
  a(g2.exists === true && g2.status === 'active' && g2.exp.length === 1,
    'v2630/shadow: [8] 重开后单条视图同时带上经历（实 ' + JSON.stringify(g2).slice(0, 160) + '）');

  // ── 9 履行与背弃分开归因、都留痕 ──
  s.addExperience('甲', '乙', { what: '许下的还债', outcome: 'broken' });
  s.addExperience('甲', '乙', { what: '仍在商量', outcome: 'open' });
  const sts = s.shadowStat();
  a(sts.kept === 1 && sts.broken === 1 && sts.experiences === 3,
    'v2630/shadow: [9] 履行与背弃**分列可数**（kept=1 / broken=1 / 共 3，实 '
    + sts.kept + '/' + sts.broken + '/' + sts.experiences + '）');
  a(exps(WA).filter(function (x) { return x && x.outcome === 'kept'; }).length === 1
    && exps(WA).filter(function (x) { return x && x.outcome === 'broken'; }).length === 1,
    'v2630/shadow: [9] 两种结局各自留痕（合成一个「承诺结束」就再也答不出他守没守）');

  // ── 10 outcome / what 非法值拒收 ──
  a(s.addExperience('甲', '乙', { what: 'x', outcome: 'nonsense' }).reason === 'bad-outcome',
    'v2630/shadow: [10] 非法 outcome 拒收（bad-outcome）');
  a(s.addExperience('甲', '乙', { what: '', outcome: 'kept' }).reason === 'missing-what',
    'v2630/shadow: [10] 空 what 拒收（missing-what）');
  a(exps(WA).length === 3, 'v2630/shadow: [10] 被拒的经历不得留痕（实 ' + exps(WA).length + ' 条）');

  // ── 11 只取本对 / 只给持有者 ──
  s.addShadow('甲', '丙', { kind: 'shame', stakes: 'low' });
  s.addExperience('甲', '丙', { what: '别的事', outcome: 'open' });
  const mine = s.experiencesOf('甲', '乙');
  a(mine.length === 3 && mine.every(function (x) { return x.pair === '乙|甲'; }),
    'v2630/shadow: [11] experiencesOf 只取本对的经历（不串味；实 ' + mine.length + ' 条）');
  const vt = s.visibleTo('甲');
  a(vt.length === 2 && vt.every(function (x) { return typeof x.other === 'string' && x.other; }),
    'v2630/shadow: [11] visibleTo 给的是**此人持有**的秘密（含对方是谁；实 ' + JSON.stringify(vt.map(function (x) { return x.other; })) + '）');
  a(s.visibleTo('丙').length === 1 && s.visibleTo('丙')[0].other === '甲',
    'v2630/shadow: [11] 未被持有者不出现（「他知道的秘密」≠「关于他的秘密」）');
  a(s.visibleTo('').length === 0, 'v2630/shadow: [11] 空名 ⇒ 空数组（不返回全库）');

  // ── 12 容量与挤出 ──
  WA.evict.resetEvictStat();
  for (let i = 0; i < CAP_ROWS + 5; i++) s.addShadow(TAG + 'a' + i, TAG + 'b' + i, { severity: 1 });
  const es = WA.evict.evictStat();
  const bs = es.bySite[SITE_ROWS] || null;
  a(rows(WA).length === CAP_ROWS, 'v2630/shadow: [12] 秘密容器容量 = ' + CAP_ROWS + '（实 ' + rows(WA).length + '）');
  a(!!bs && bs.evicts >= 1, 'v2630/shadow: [12] 挤出经 evict 记账（evicts=' + (bs && bs.evicts) + '）');
  a(es.failedBy['unknown-site'] === undefined, 'v2630/shadow: [12] 剪枝走已登记站点（无 unknown-site）');
  const decl = WA.evict.siteDecls()[SITE_ROWS];
  a(!!decl && decl.cap === CAP_ROWS, 'v2630/shadow: [12] 站点声明与容器容量同源（cap=' + (decl && decl.cap) + '）');

  // ── 13 注入块 ──
  s.setSettings({ enabled: true });
  const blk = s.buildBlock();
  a(typeof blk === 'string' && blk.indexOf('[社交漩涡]') === 0,
    'v2630/shadow: [13] 注入块有独立标题（实 ' + JSON.stringify(String(blk).slice(0, 16)) + '）');
  a(blk.indexOf('秘密是经历不是态度') >= 0 && blk.indexOf('不得让未持有者') >= 0,
    'v2630/shadow: [13] 语义约束随块注入（秘密只对持有者公开 + 不随好感涨落消失）');
  a(blk.indexOf('履行与背弃是两种不同事实') >= 0,
    'v2630/shadow: [13] 明写「履行 ≠ 背弃」（防「关系结束」把「他赖了」隐去）');
  // 注：「空库不产空头段」已在 [1] 里用**同一个** WA 验过。
  //   此处刻意不再另起 fresh()：fresh() 复用同一个 global.WorldAxis 对象并把 store 换成新的，
  //   中途调用会让前面所有判据读到的状态集体清空，后续断言会退化成空库恒真（假绿）。

  // ── 14 观测面 ──
  const f0 = s.stat().faults || {};
  a(typeof f0 === 'object' && f0 !== null, 'v2630/shadow: [14] stat 带 faults 面');
  a((f0['no-shadow'] || 0) >= 1 && (f0['shadow-closed'] || 0) >= 1,
    'v2630/shadow: [14] 「没有可加深的」与「已经结了」被**分开**计数（实 ' + JSON.stringify(f0) + '）');
  a((f0['bad-stakes'] || 0) >= 1 && (f0['self-pair'] || 0) >= 1,
    'v2630/shadow: [14] 观测面记的是**被拒的原因**（拒绝本身不落盘，故只能从这里读；实 '
    + JSON.stringify(f0) + '）');

  console.log('  ✓ v2630/shadow: 不可逆经历面（无秘密不得加深 / 变淡不删记录 / 履行与背弃分开）');
}
// ══════════════ 破坏探针 ══════════════
/** 无秘密时 deepen 的归因：原版应 no-shadow；守卫被破坏时应返回 ok:true */
function probeDeepen(WA) {
  const s = shadowOf(WA);
  resetShadow(WA, 'pd');
  const r = s.deepen('甲', '丁', 5);
  return { ok: r.ok === true, reason: r.reason || '', rows: rows(WA).length };
}
/** 变淡到 0 之后的记录：原版应仍在（faded）；faded 标记被摘除时应仍是 active */
function probeFaded(WA) {
  const s = shadowOf(WA);
  resetShadow(WA, 'pf');
  s.addShadow('甲', '乙', { severity: 3 });
  s.brighten('甲', '乙', 5);
  const g = s.getShadow('甲', '乙');
  return { exists: g.exists, status: g.status, sev: g.severity, rowCount: rows(WA).length };
}
/** 反向配对：原版两向同键；pairKey 被破坏时应产生两行 */
function probePair(WA) {
  const s = shadowOf(WA);
  resetShadow(WA, 'pp');
  s.addShadow('甲', '乙', { severity: 2 });
  s.addShadow('乙', '甲', { severity: 2 });
  return { rows: rows(WA).length, exists: rows(WA).length === 1 };
}
/** 观测面：原版把 ok:false 计入 faults；被摘除时应为 0 */
function probeFault(WA) {
  const s = shadowOf(WA);
  resetShadow(WA, 'pfa');
  s.deepen('甲', '戊', 1);
  return (s.stat().faults || {})['no-shadow'] || 0;
}
const BROKEN = [
  { key: 'pair', rel: 'engines/shadow.js', from: A_PAIR, to: "function pairKey(a, b) { return namesOf(a, b).join('|'); }" },
  { key: 'deepen', rel: 'engines/shadow.js', from: A_DEEPEN,
    to: "const add = Number(amount);\n    if (!isFinite(add) || add <= 0) return { ok: false, reason: 'bad-amount' };\n    const k = pairKey(a, b);\n    const cur = findRow(rows(), k);\n    if (!cur) { addShadow(a, b, { severity: 0 }); stat.faults['auto-created'] = (stat.faults['auto-created'] || 0) + 1; }\n    if (false) return { ok: false, reason: 'shadow-closed', pair: k, status: '' };" },
  { key: 'faded', rel: 'engines/shadow.js', from: A_FADED, to: 'if (false) row.status = \'faded\';' },
  { key: 'fault', rel: 'engines/shadow.js', from: A_FAULT, to: 'if (false) {' }
];
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点应恰中 1 次，实 ' + hits + ' 次：' + spec.rel + ' :: ' + spec.from);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function probeWith(spec, fn) {
  return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); });
}
function probeClean(fn) {
  return isolated(function () { return fn(fresh()); });
}
function anchorHits(spec) {
  return fs.readFileSync(path.join(BASE, spec.rel), 'utf8').split(spec.from).length - 1;
}
// ══════════════ 负控制 ══════════════
function runNegative(a) {
  const anchorBad = BROKEN.filter(function (p) { return anchorHits(p) !== 1; })
    .map(function (p) { return p.key + '(' + anchorHits(p) + '次)'; });
  a(anchorBad.length === 0, 'v2630/shadow: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');
  const diffOk = BROKEN.every(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return brokenOverride(p)[p.rel] !== src;
  });
  a(diffOk, 'v2630/shadow: [N0] 四种破坏的内存副本都与真源码不同（非空转）');
  // N1 判据纯度
  const dBad = probeWith(BROKEN[0], probePair);
  a(dBad.rows === 2, 'v2630/shadow: [N1] pairKey 改成不排序 ⇒ 「两向同一行」判据现形（实 ' + JSON.stringify(dBad) + '）');
  const sBad = probeWith(BROKEN[1], probeDeepen);
  a(sBad.ok === true && sBad.rows === 1, 'v2630/shadow: [N1] deepen 守卫被拆 ⇒ 「无秘密不得加深」判据现形（实 ' + JSON.stringify(sBad) + '）');
  const fBad = probeWith(BROKEN[2], probeFaded);
  a(fBad.exists === true && fBad.status === 'active' && fBad.sev === 0,
    'v2630/shadow: [N1] faded 标记被摘除 ⇒ 「变淡即终结」判据现形（实 ' + JSON.stringify(fBad) + '）');
  const oBad = probeWith(BROKEN[3], probeFault);
  a(oBad === 0, 'v2630/shadow: [N1] 观测面被摘除 ⇒ 「拒绝可观测」判据现形（实 ' + oBad + '）');
  // N2 两向自证
  const dOk = probeClean(probeDeepen);
  a(dOk.ok === false && dOk.reason === 'no-shadow' && dOk.rows === 0,
    'v2630/shadow: [N2] 原版：无秘密即拒收且不落半行（实 ' + JSON.stringify(dOk) + '）');
  const sOk = probeClean(probePair);
  a(sOk.rows === 1 && sOk.exists === true, 'v2630/shadow: [N2] 原版：两向配对落同一行（实 ' + JSON.stringify(sOk) + '）');
  const fOk = probeClean(probeFaded);
  a(fOk.exists === true && fOk.status === 'faded' && fOk.rowCount === 1,
    'v2630/shadow: [N2] 原版：变淡到 0 后记录仍在且标 faded（实 ' + JSON.stringify(fOk) + '）');
  a(probeClean(probeFault) >= 1, 'v2630/shadow: [N2] 原版：被拒原因确被计数（实 ' + probeClean(probeFault) + '）');
  // N3 逐锚敏感
  a(probeWith(BROKEN[0], probeFaded).rowCount === 1, 'v2630/shadow: [N3] 配对破坏不牵连变淡面（逐锚敏感）');
  a(probeWith(BROKEN[2], probePair).rows === 1, 'v2630/shadow: [N3] 变淡破坏不牵连配对（逐锚敏感）');
  a(probeWith(BROKEN[3], probePair).rows === 1, 'v2630/shadow: [N3] 观测面破坏不改判定（只观测）');
  a(probeWith(BROKEN[3], probeFaded).status === 'faded', 'v2630/shadow: [N3] 观测面破坏不改返回结构');
  a(probeWith(BROKEN[0], probeDeepen).reason === 'no-shadow', 'v2630/shadow: [N3] 配对破坏不牵连 deepen 归因（逐锚敏感）');
  // N4 非恒真
  const chg = isolated(function () {
    const WA = fresh();
    const s = shadowOf(WA);
    resetShadow(WA, 'n4');
    s.addShadow('甲', '乙', { severity: 4 });
    const d0 = s.getShadow('甲', '乙').severity;
    s.deepen('甲', '乙', 3);
    const d1 = s.getShadow('甲', '乙').severity;
    s.brighten('甲', '乙', 20);
    const d2 = s.getShadow('甲', '乙');
    return { d0: d0, d1: d1, status: d2.status, sev: d2.severity, exists: d2.exists };
  });
  a(chg.d0 === 4 && chg.d1 === 7 && chg.status === 'faded' && chg.sev === 0 && chg.exists === true,
    'v2630/shadow: [N4] 状态确实发生过变化：4→7→(降到底)faded 且记录仍在（实 ' + JSON.stringify(chg) + '）');
  // N5 无副作用
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2630/shadow: [N5] 探测哨兵不泄漏进真存档（残留键: ' + (leak.join(',') || '无') + '）');
}
// ══════════════ 入口 ══════════════
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('SHADOW-V2630: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SHADOW-V2630: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeDeepen: probeDeepen, probeFaded: probeFaded, probePair: probePair, probeFault: probeFault,
  brokenOverride: brokenOverride
};