#!/usr/bin/env node
// WorldAxis tests/settle-v2720.js -- karma x hazard x marginal x tolerance lock (v2.72.0)
//
// What it pins (all negative):
//   karma:     off-gate distinguishable; missing who / bad kind / bad amount each attributed;
//              **两轴独立累加不自动核销**（记功德后记账仍各为正 —— 这是本版修掉的第 2 个真缺陷）;
//              offset 显式核销是唯一回退路径（用过即能用；无债 nothing-to-offset、无德 no-merit）;
//              阶梯由净业映射且单调不减（升级才写 stage，降级只能由 offset）; unregistered => missing;
//              rows cap enforced (rows-full); notes 环有界 8（这是本版修掉的第 1 个真缺陷）.
//   hazard:    off-gate distinguishable; open needs key; dup open refused (exists); rows cap (rows-full);
//              bump rolls target down to floorTarget (never to zero); roll needs registration (missing);
//              roll 走决策流（rand 不可用 => rand-unavailable，不裸调 Math.random 兜底 —— 第 3 个真缺陷）;
//              double-pending refused (already-pending); confirm before revealDelay refused (too-soon);
//              confirm on non-pending refused (not-pending); confirm resets count and counts a hit.
//   marginal:  off-gate distinguishable; bad amount refused; gain on unregistered refused (missing);
//              factor = ratio^count with floorRatio bound (never negative, never > 1, monotone down);
//              cooldown halves once (not stacking: repeated cool() takes the given value, never adds);
//              tick decrements cooldown monotonically and never lengthens it;
//              idle reset after idleRounds consecutive no-gain ticks; explicit reset clears both.
//   tolerance: off-gate distinguishable; bad kind refused (bad-kind); missing key refused (missing-fields);
//              同轮重复触达拒收 (burst, idempotent — 不入账); 窗口内触达数超 maxRepeat 报 stale（本次不生效、
//              不入账）; window 滑动后旧触达自动出窗（自愈）; tick 只让触达数变小，绝不增大;
//              drop/clear 是显式清账; rows cap enforced (rows-full).
//   Anchors each occur exactly once in real source (or declared hits). Negative control mutates a memory copy only.
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2720_';

// ---- real-source anchors (each must occur exactly once unless hits declared) ----
// karma
const A_KM_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_KM_KIND = "if (KINDS.indexOf(k) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', got: kind }; }";
const A_KM_AMOUNT = "if (!isFinite(amt) || amt <= 0) { noteFault('bad-amount'); return { ok: false, reason: 'bad-amount', got: amount }; }";
const A_KM_ROWS = "if (draft.karma.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', who: w }; return; }";
const A_KM_ADDAXIS = "row[k] = (Number(row[k]) || 0) + amt;";
const A_KM_NODEBT = "if (debt <= 0) { out = { ok: false, reason: 'nothing-to-offset', who: w }; return; }";
const A_KM_NOMERIT = "if (merit <= 0) { out = { ok: false, reason: 'no-merit', who: w }; return; }";
const A_KM_ESCALATE = "if (escalated) { row.stage = next; stat.escalations++; }";
const A_KM_NOTES = "if (WA.evict) WA.evict.array(row.notes, 'karma.notes');";
// hazard
const A_HZ_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_HZ_DUP = "if (draft.hazard.rows.filter(function (r) { return r && r.key === k; })[0]) { out = { ok: false, reason: 'exists', key: k }; return; }";
const A_HZ_ROWS = "if (draft.hazard.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', key: k }; return; }";
const A_HZ_PENDING = "if (row.pending) { out = { ok: false, reason: 'already-pending', key: k }; return; }";
const A_HZ_RAND = "if (!WA.rand || typeof WA.rand.dice !== 'function') { out = { ok: false, reason: 'rand-unavailable', key: k }; return; }";
const A_HZ_NOTPEND = "if (!row.pending) { out = { ok: false, reason: 'not-pending', key: k }; return; }";
const A_HZ_TOOSOON = "if ((Number(row.waiting) || 0) < need) { out = { ok: false, reason: 'too-soon', key: k, waiting: Number(row.waiting) || 0, need: need }; return; }";
// marginal
const A_MG_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_MG_AMOUNT = "if (!isFinite(amt) || amt <= 0) { noteFault('bad-amount'); return { ok: false, reason: 'bad-amount', got: raw }; }";
const A_MG_MISSING = "if (!row) { out = { ok: false, reason: 'missing', who: w }; return; }";
const A_MG_COOLNOSUM = "row.cool = n;                                     // 冷却**不叠加**，取指定值";
const A_MG_TICKDEC = "if ((Number(r.cool) || 0) > 0) { r.cool = Math.max(0, (Number(r.cool) || 0) - 1); cooled++; }";
// tolerance
const A_TL_GATE = "if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }";
const A_TL_KIND = "if (KINDS.indexOf(kd) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', got: kind }; }";
const A_TL_BURST = "if (hits.indexOf(r) >= 0) { out = { ok: false, reason: 'burst', key: k, round: r }; return; }";
const A_TL_STALE = "if (before >= maxR) { out = { ok: false, reason: 'stale', key: k, hits: before, round: r, maxRepeat: maxR }; return; }";
const A_TL_ROWS = "if (b.rows.length >= cfg.maxRows) { out = { ok: false, reason: 'rows-full', key: k }; return; }";

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function st(WA) { return WA.store.get() || {}; }
function resetWorld(WA) {
  WA.store.transact(function (d) {
    d.karma = { rows: [] };
    d.hazard = { rows: [] };
    d.marginal = { rows: [] };
    d.tolerance = { round: 0, rows: [] };
  }, TAG + 'reset');
}
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
    const k = LS.key(i); if (k === null) continue;
    let v = ''; try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
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
function judge(a) {
  const WA = fresh();
  a(!!WA.karma && typeof WA.karma.record === 'function', 'v2720: karma loaded');
  a(!!WA.hazard && typeof WA.hazard.roll === 'function', 'v2720: hazard loaded');
  a(!!WA.marginal && typeof WA.marginal.gain === 'function', 'v2720: marginal loaded');
  a(!!WA.tolerance && typeof WA.tolerance.use === 'function', 'v2720: tolerance loaded');
  resetWorld(WA);

  // ---- 1 karma ----
  const kmOff = WA.karma.record('甲', 'debt', 10, 'x');
  a(kmOff.ok === true && kmOff.reason === 'disabled', 'v2720: [1] disabled karma says so');
  a(WA.karma.buildBlock() === '', 'v2720: [1] disabled karma injects nothing');
  WA.karma.setSettings({ enabled: true });
  a(WA.karma.record('', 'debt', 10).reason === 'missing-fields', 'v2720: [1] karma needs who');
  a(WA.karma.record('甲', 'sin', 10).reason === 'bad-kind', 'v2720: [1] karma rejects off-list kind');
  a(WA.karma.record('甲', 'debt', 0).reason === 'bad-amount', 'v2720: [1] karma rejects zero amount');
  a(WA.karma.record('甲', 'debt', -5).reason === 'bad-amount', 'v2720: [1] karma rejects negative amount');
  a(WA.karma.balance('甲').reason === 'missing', 'v2720: [1] unregistered balance says missing');
  // 两轴独立累加（本版修掉的缺陷：初版会自动核销 ⇒ 两轴永不同时为正 ⇒ offset 死代码）
  WA.karma.record('甲', 'merit', 100, '救世');
  WA.karma.record('甲', 'debt', 30, '破坏');
  const bal1 = WA.karma.balance('甲');
  a(bal1.ok === true && bal1.merit === 100 && bal1.debt === 30,
    'v2720: [1] two axes accumulate independently (no auto-offset) — merit=' + bal1.merit + ' debt=' + bal1.debt);
  a(bal1.net === -70, 'v2720: [1] net = debt - merit (= -70)');
  a(bal1.stage === 0, 'v2720: [1] net-negative => stage 0');
  // offset 显式核销（唯一回退路径，现在真的可达）
  const off1 = WA.karma.offset('甲', 10);
  a(off1.ok === true && off1.used === 10 && off1.merit === 90 && off1.debt === 20,
    'v2720: [1] explicit offset consumes both axes equally');
  // 无德可抵 / 无债可抵
  WA.karma.record('乙', 'debt', 50, '破坏');
  a(WA.karma.offset('乙', 10).reason === 'no-merit', 'v2720: [1] offset without merit => no-merit');
  WA.karma.record('丙', 'merit', 50, '行善');
  a(WA.karma.offset('丙', 10).reason === 'nothing-to-offset', 'v2720: [1] offset without debt => nothing-to-offset');
  a(WA.karma.offset('不存在', 10).reason === 'missing', 'v2720: [1] offset on unregistered => missing');
  // 阶梯由净业映射 + 单调不减（升级写 stage；offset 才能回退）
  WA.karma.record('乙', 'debt', 200, '大恶');   // net 250 => ceil(250/40)=7 => 封顶 maxStage 5
  const bal2 = WA.karma.balance('乙');
  a(bal2.stage === 5, 'v2720: [1] stage climbs by net (ceil(net/40), capped at maxStage)');
  WA.karma.record('乙', 'merit', 40, '小善');   // net 210 => 6 => 仍封顶 5；stage 不回退
  a(WA.karma.balance('乙').stage === 5, 'v2720: [1] stage is monotone non-decreasing on records');
  WA.karma.setSettings({ maxStage: 3 });
  // maxStage 调低**不会**把存量 stage 降下来（单调不减是设计），只影响后续新算出的值。
  a(WA.karma.balance('乙').stage === 5, 'v2720: [1] lowering maxStage does NOT retroactively lower a stored stage');
  WA.karma.record('新对象', 'debt', 400, '大恶');
  a(WA.karma.balance('新对象').stage === 3, 'v2720: [1] stage for a fresh subject is capped by maxStage');
  // rows cap
  WA.karma.setSettings({ maxRows: 4 });
  WA.karma.record('r1', 'debt', 1); WA.karma.record('r2', 'debt', 1);
  WA.karma.record('r3', 'debt', 1); WA.karma.record('r4', 'debt', 1);
  a(WA.karma.record('r5', 'debt', 1).reason === 'rows-full', 'v2720: [1] rows cap enforced');
  // notes 环有界 8（本版修掉的第 1 个真缺陷：未登记站点 => unknown-site 静默失败 => 无界）
  WA.karma.setSettings({ maxRows: 32 });
  for (let i = 0; i < 20; i++) WA.karma.record('甲', 'debt', 1, 'e' + i);
  const kmRow = (st(WA).karma.rows.filter(function (r) { return r.who === '甲'; })[0]) || {};
  a(Array.isArray(kmRow.notes) && kmRow.notes.length === 8, 'v2720: [1] karma.notes ring capped at 8 (legacy-fix verified)');
  const esK = WA.evict.evictStat();
  a((esK.failedBy['unknown-site'] || 0) === 0, 'v2720: [1] no unknown-site failures from karma.notes');

  // ---- 2 hazard ----
  resetWorld(WA);
  WA.hazard.setSettings({ enabled: false });
  a(WA.hazard.open('怀孕', 'x').reason === 'disabled', 'v2720: [2] disabled hazard says so');
  WA.hazard.setSettings({ enabled: true });
  a(WA.hazard.open('', 'x').reason === 'missing-fields', 'v2720: [2] hazard needs key');
  a(WA.hazard.open('怀孕', 'x').ok === true, 'v2720: [2] hazard opens a risk');
  a(WA.hazard.open('怀孕', 'x').reason === 'exists', 'v2720: [2] duplicate risk refused');
  a(WA.hazard.bump('不存在').reason === 'missing', 'v2720: [2] bump on unregistered => missing');
  a(WA.hazard.roll('不存在').reason === 'missing', 'v2720: [2] roll on unregistered => missing');
  const tg0 = WA.hazard.read('怀孕').target;
  WA.hazard.bump('怀孕'); WA.hazard.bump('怀孕');
  const tg2 = WA.hazard.read('怀孕').target;
  a(tg2 === tg0 - 2, 'v2720: [2] each bump rolls target down by 1 (never to zero)');
  WA.hazard.setSettings({ floorTarget: 4, baseTarget: 12 });
  for (let i = 0; i < 20; i++) WA.hazard.bump('怀孕');
  a(WA.hazard.read('怀孕').target === 4, 'v2720: [2] target floors at floorTarget (never zero)');
  // roll 走决策流
  WA.hazard.setSettings({ baseTarget: 6, floorTarget: 6 });
  WA.rand.seed(1);
  let hits = 0, misses = 0;
  for (let i = 0; i < 60; i++) { const r = WA.hazard.roll('怀孕'); if (r.ok && r.hit) { hits++; break; } misses++; }
  a(hits === 1 && WA.hazard.read('怀孕').pending === true, 'v2720: [2] roll hits and marks pending (dark ledger)');
  a(WA.hazard.roll('怀孕').reason === 'already-pending', 'v2720: [2] double-pending refused');
  // confirm 显形延迟
  a(WA.hazard.confirm('怀孕').reason === 'too-soon', 'v2720: [2] confirm before revealDelay refused');
  a(WA.hazard.confirm('不存在').reason === 'missing', 'v2720: [2] confirm on unregistered => missing');
  for (let i = 0; i < 3; i++) WA.hazard.tick();
  const cf = WA.hazard.confirm('怀孕');
  a(cf.ok === true && cf.hits === 1 && cf.count === 0, 'v2720: [2] confirm after revealDelay counts a hit and resets count');
  a(WA.hazard.confirm('怀孕').reason === 'not-pending', 'v2720: [2] confirm on non-pending refused');
  a(WA.hazard.buildBlock().indexOf('[风险暗账]') === 0, 'v2720: [2] hazard buildBlock valid');
  a(WA.hazard.buildBlock().indexOf('%') < 0, 'v2720: [2] hazard block carries NO probability numbers');
  // rows cap（重置后从 0 起数）
  WA.store.transact(function (d) { d.hazard = { rows: [] }; }, TAG + 'hz-reset');
  WA.hazard.setSettings({ maxRows: 4, enabled: true });
  a(WA.hazard.open('h1').ok === true, 'v2720: [2] rows 1/4 accepted');
  a(WA.hazard.open('h2').ok === true, 'v2720: [2] rows 2/4 accepted');
  a(WA.hazard.open('h3').ok === true, 'v2720: [2] rows 3/4 accepted');
  a(WA.hazard.open('h4').ok === true, 'v2720: [2] rows 4/4 accepted (exactly at cap)');
  a(WA.hazard.open('h5').reason === 'rows-full', 'v2720: [2] rows cap enforced (5th refused)');

  // ---- 3 marginal ----
  resetWorld(WA);
  const mgOff = WA.marginal.gain('甲', 5);
  a(mgOff.ok === true && mgOff.reason === 'disabled', 'v2720: [3] disabled marginal says so');
  WA.marginal.setSettings({ enabled: true });
  a(WA.marginal.gain('', 5).reason === 'missing-fields', 'v2720: [3] marginal needs who');
  a(WA.marginal.gain('甲', 0).reason === 'bad-amount', 'v2720: [3] marginal rejects zero gain');
  a(WA.marginal.gain('甲', -1).reason === 'bad-amount', 'v2720: [3] marginal rejects negative gain');
  a(WA.marginal.gain('未登记', 5).reason === 'missing', 'v2720: [3] gain on unregistered => missing (no empty row)');
  a(WA.marginal.read('未登记').reason === 'missing', 'v2720: [3] read on unregistered => missing');
  WA.marginal.open('甲');
  a(WA.marginal.open('甲').reason === 'exists', 'v2720: [3] duplicate open refused');
  // 衰减：ratio 0.8 => 1, .8, .64 ...
  WA.marginal.setSettings({ ratio: 80, floorRatio: 20 });
  const g1 = WA.marginal.gain('甲', 100);
  const g2 = WA.marginal.gain('甲', 100);
  const g3 = WA.marginal.gain('甲', 100);
  a(Math.abs(g1.applied - 100) < 1e-6, 'v2720: [3] first gain is undiscounted');
  a(Math.abs(g2.applied - 80) < 1e-6, 'v2720: [3] second gain discounted by ratio');
  a(Math.abs(g3.applied - 64) < 1e-6, 'v2720: [3] third gain discounted by ratio^2');
  a(g3.applied <= g2.applied && g2.applied <= g1.applied, 'v2720: [3] discount is monotone non-increasing');
  WA.marginal.setSettings({ floorRatio: 50 });
  a(WA.marginal.factorFor(99) >= 0.5, 'v2720: [3] factor floors at floorRatio (never below)');
  a(WA.marginal.factorFor(0) <= 1, 'v2720: [3] factor never exceeds 1');
  // 冷却：不叠加、只递减
  const c1 = WA.marginal.cool('甲', 3);
  a(c1.ok === true && c1.cool === 3, 'v2720: [3] cooldown starts at given rounds');
  const c2 = WA.marginal.cool('甲', 2);
  a(c2.ok === true && c2.cool === 2, 'v2720: [3] cooldown does NOT stack (takes given value)');
  const gc = WA.marginal.gain('甲', 100);
  a(Math.abs(gc.coolMul - 0.5) < 1e-6, 'v2720: [3] cooling halves the applied gain');
  WA.marginal.tick(false);
  a(WA.marginal.read('甲').cool === 1, 'v2720: [3] tick decrements cooldown by 1');
  WA.marginal.tick(false);
  a(WA.marginal.read('甲').cool === 0, 'v2720: [3] cooldown reaches 0 and stays (monotone non-increasing)');
  WA.marginal.tick(false);
  a(WA.marginal.read('甲').cool === 0, 'v2720: [3] tick never lengthens cooldown');
  // 自然归零：连续无增益达 idleRounds
  resetWorld(WA);
  WA.marginal.setSettings({ enabled: true, idleRounds: 3 });
  WA.marginal.open('甲');
  WA.marginal.gain('甲', 10); WA.marginal.gain('甲', 10);
  a(WA.marginal.read('甲').count === 2, 'v2720: [3] count accumulates on gains');
  WA.marginal.tick(true); WA.marginal.tick(true);
  a(WA.marginal.read('甲').count === 2, 'v2720: [3] count survives below idleRounds');
  WA.marginal.tick(true);
  a(WA.marginal.read('甲').count === 0, 'v2720: [3] count resets after idleRounds consecutive no-gain ticks');
  // reset 显式翻篇
  WA.marginal.gain('甲', 10); WA.marginal.gain('甲', 10); WA.marginal.cool('甲', 3);
  const rs = WA.marginal.reset('甲');
  a(rs.ok === true && WA.marginal.read('甲').count === 0 && WA.marginal.read('甲').cool === 0,
    'v2720: [3] explicit reset clears count and cooldown');
  a(WA.marginal.reset('不存在').reason === 'missing', 'v2720: [3] reset on unregistered => missing');
  a(WA.marginal.buildBlock().indexOf('[边际折旧]') < 0 || WA.marginal.buildBlock().indexOf('[边际折旧]') === 0,
    'v2720: [3] marginal buildBlock valid shape');

  // ---- 4 tolerance ----
  resetWorld(WA);
  const tlOff = WA.tolerance.use('「你来了」', 'line');
  a(tlOff.ok === true && tlOff.reason === 'disabled', 'v2720: [4] disabled tolerance says so');
  WA.tolerance.setSettings({ enabled: true });
  a(WA.tolerance.use('', 'line').reason === 'missing-fields', 'v2720: [4] tolerance needs key');
  a(WA.tolerance.use('x', 'smell').reason === 'bad-kind', 'v2720: [4] tolerance rejects off-list kind');
  a(WA.tolerance.check('未见过的招').ok === true && WA.tolerance.check('未见过的招').fresh === true,
    'v2720: [4] check on unseen means is fresh (no row created)');
  a(st(WA).tolerance.rows.length === 0, 'v2720: [4] check does NOT create a row (pure read)');
  // 同轮 burst：幂等拒收、不入账
  const u1 = WA.tolerance.use('「你来了」', 'line');
  a(u1.ok === true && u1.hits === 1 && u1.fresh === true, 'v2720: [4] first use is fresh');
  const u1b = WA.tolerance.use('「你来了」', 'line');
  a(u1b.reason === 'burst' && u1b.ok !== true, 'v2720: [4] same-round repeat refused (burst)');
  a(WA.tolerance.check('「你来了」').hits === 1, 'v2720: [4] burst did NOT inflate hits (idempotent)');
  // 窗口内重复：tick 推进轮号，每轮一次。
  // 窗口必须**大于** maxRepeat，stale 才可能发生（否则窗口内根本凑不满次数）。
  WA.tolerance.setSettings({ window: 4, maxRepeat: 3, decay: 50 });
  WA.tolerance.tick(); WA.tolerance.use('「你来了」', 'line');
  WA.tolerance.tick(); WA.tolerance.use('「你来了」', 'line');
  const chk3 = WA.tolerance.check('「你来了」');
  a(chk3.hits === 3, 'v2720: [4] three uses across three rounds counted');
  WA.tolerance.tick();
  const u4 = WA.tolerance.use('「你来了」', 'line');
  a(u4.reason === 'stale' && u4.hits === 3, 'v2720: [4] exceeding maxRepeat => stale (not effective)');
  a(WA.tolerance.check('「你来了」').hits === 3, 'v2720: [4] stale did NOT inflate hits (idempotent)');
  a(WA.tolerance.check('「你来了」').stale === true, 'v2720: [4] check reports stale');
  // 窗口滑动自愈：推进 window 轮后旧触达出窗
  WA.tolerance.tick(); WA.tolerance.tick(); WA.tolerance.tick();
  const chk4 = WA.tolerance.check('「你来了」');
  a(chk4.hits === 0 && chk4.fresh === true && chk4.stale === false,
    'v2720: [4] window slides => old hits expire (self-healing)');
  a(WA.tolerance.use('「你来了」', 'line').ok === true, 'v2720: [4] expired means becomes usable again');
  // 衰减因子
  a(Math.abs(WA.tolerance.factorFor(1) - 1) < 1e-6, 'v2720: [4] factor(1) = 1');
  a(Math.abs(WA.tolerance.factorFor(2) - 0.5) < 1e-6, 'v2720: [4] factor(2) = decay');
  a(WA.tolerance.factorFor(3) <= WA.tolerance.factorFor(2), 'v2720: [4] factor is monotone non-increasing');
  // drop / clear
  a(WA.tolerance.drop('不存在').reason === 'missing', 'v2720: [4] drop on unregistered => missing');
  a(WA.tolerance.drop('「你来了」').ok === true, 'v2720: [4] drop removes a means explicitly');
  WA.tolerance.use('a', 'line'); WA.tolerance.use('b', 'gesture');
  const cl = WA.tolerance.clear();
  a(cl.ok === true && cl.cleared === 2 && st(WA).tolerance.rows.length === 0, 'v2720: [4] clear wipes all means');
  // rows cap
  WA.tolerance.setSettings({ maxRows: 4, enabled: true });
  WA.tolerance.use('m1', 'line'); WA.tolerance.use('m2', 'line');
  WA.tolerance.use('m3', 'line'); WA.tolerance.use('m4', 'line');
  a(WA.tolerance.use('m5', 'line').reason === 'rows-full', 'v2720: [4] rows cap enforced');
  a(WA.tolerance.buildBlock().indexOf('[手段耐受]') === 0, 'v2720: [4] tolerance buildBlock valid');
  // tick 只让触达数变小
  resetWorld(WA);
  WA.tolerance.setSettings({ enabled: true, window: 3, maxRepeat: 3 });
  WA.tolerance.use('k', 'line');
  const before = WA.tolerance.check('k').hits;
  WA.tolerance.tick();
  a(WA.tolerance.check('k').hits <= before, 'v2720: [4] tick never increases hits (monotone non-increasing)');
  console.log('  ok v2720: karma / hazard / marginal / tolerance');
}

// ---- negative probes (each uses REAL source with one anchor killed) ----
function probeKmGate(WA) { resetWorld(WA); return WA.karma.record('a', 'debt', 1).reason; }
function probeKmKind(WA) { resetWorld(WA); WA.karma.setSettings({ enabled: true }); return WA.karma.record('a', 'sin', 1).reason; }
function probeKmAmount(WA) { resetWorld(WA); WA.karma.setSettings({ enabled: true }); return WA.karma.record('a', 'debt', 0).reason; }
function probeKmRows(WA) { resetWorld(WA); WA.karma.setSettings({ enabled: true, maxRows: 4 }); WA.karma.record('a', 'debt', 1); WA.karma.record('b', 'debt', 1); WA.karma.record('c', 'debt', 1); WA.karma.record('d', 'debt', 1); return WA.karma.record('e', 'debt', 1).reason; }
function probeKmAddAxis(WA) {
  resetWorld(WA); WA.karma.setSettings({ enabled: true });
  WA.karma.record('a', 'merit', 100); WA.karma.record('a', 'debt', 30);
  const b = WA.karma.balance('a');
  return b.merit + '/' + b.debt;
}
function probeKmNoDebt(WA) { resetWorld(WA); WA.karma.setSettings({ enabled: true }); WA.karma.record('a', 'merit', 10); return WA.karma.offset('a', 5).reason; }
function probeKmNoMerit(WA) { resetWorld(WA); WA.karma.setSettings({ enabled: true }); WA.karma.record('a', 'debt', 10); return WA.karma.offset('a', 5).reason; }
function probeKmEscalate(WA) {
  resetWorld(WA); WA.karma.setSettings({ enabled: true });
  WA.karma.record('a', 'debt', 200);
  return String(WA.karma.balance('a').stage);
}
function probeKmNotes(WA) {
  resetWorld(WA); WA.karma.setSettings({ enabled: true, maxRows: 32 });
  for (let i = 0; i < 20; i++) WA.karma.record('a', 'debt', 1, 'e' + i);
  const row = (st(WA).karma.rows.filter(function (r) { return r.who === 'a'; })[0]) || {};
  return String((row.notes || []).length);
}
function probeHzGate(WA) { resetWorld(WA); return WA.hazard.open('k').reason; }
function probeHzDup(WA) { resetWorld(WA); WA.hazard.setSettings({ enabled: true }); WA.hazard.open('k'); return WA.hazard.open('k').reason; }
function probeHzRows(WA) { resetWorld(WA); WA.hazard.setSettings({ enabled: true, maxRows: 4 }); WA.hazard.open('a'); WA.hazard.open('b'); WA.hazard.open('c'); WA.hazard.open('d'); return WA.hazard.open('e').reason; }
function probeHzPending(WA) {
  resetWorld(WA); WA.hazard.setSettings({ enabled: true, baseTarget: 6, floorTarget: 6 });
  WA.hazard.open('k'); WA.rand.seed(1);
  for (let i = 0; i < 60; i++) { const r = WA.hazard.roll('k'); if (r.ok && r.hit) break; }
  return WA.hazard.roll('k').reason;
}
function probeHzNotPend(WA) { resetWorld(WA); WA.hazard.setSettings({ enabled: true }); WA.hazard.open('k'); return WA.hazard.confirm('k').reason; }
function probeHzTooSoon(WA) {
  resetWorld(WA); WA.hazard.setSettings({ enabled: true, baseTarget: 6, floorTarget: 6, revealDelay: 3 });
  WA.hazard.open('k'); WA.rand.seed(1);
  for (let i = 0; i < 60; i++) { const r = WA.hazard.roll('k'); if (r.ok && r.hit) break; }
  return WA.hazard.confirm('k').reason;
}
// rand 守卫的区分性探针：把 WA.rand 撤掉后，守护存在则显式拒收 rand-unavailable；
// 守护被删那么会直接读 WA.rand.dice 抛异常（这里捕获成 'threw'）——两态可分辨。
function probeHzRand(WA) {
  resetWorld(WA); WA.hazard.setSettings({ enabled: true });
  WA.hazard.open('k');
  const saved = WA.rand; WA.rand = undefined;
  let r; try { r = WA.hazard.roll('k').reason; } catch (e) { r = 'threw'; }
  WA.rand = saved;
  return r;
}
function probeMgGate(WA) { resetWorld(WA); return WA.marginal.gain('a', 5).reason; }
function probeMgAmount(WA) { resetWorld(WA); WA.marginal.setSettings({ enabled: true }); return WA.marginal.gain('a', 0).reason; }
function probeMgMissing(WA) { resetWorld(WA); WA.marginal.setSettings({ enabled: true }); return WA.marginal.gain('nope', 5).reason; }
function probeMgCoolNoSum(WA) {
  resetWorld(WA); WA.marginal.setSettings({ enabled: true });
  WA.marginal.open('a'); WA.marginal.cool('a', 3); WA.marginal.cool('a', 2);
  return String(WA.marginal.read('a').cool);
}
function probeMgTickDec(WA) {
  resetWorld(WA); WA.marginal.setSettings({ enabled: true });
  WA.marginal.open('a'); WA.marginal.cool('a', 2); WA.marginal.tick(false); WA.marginal.tick(false); WA.marginal.tick(false);
  return String(WA.marginal.read('a').cool);
}
function probeTlGate(WA) { resetWorld(WA); return WA.tolerance.use('k', 'line').reason; }
function probeTlKind(WA) { resetWorld(WA); WA.tolerance.setSettings({ enabled: true }); return WA.tolerance.use('k', 'smell').reason; }
function probeTlBurst(WA) { resetWorld(WA); WA.tolerance.setSettings({ enabled: true }); WA.tolerance.use('k', 'line'); return WA.tolerance.use('k', 'line').reason; }
function probeTlStale(WA) {
  resetWorld(WA); WA.tolerance.setSettings({ enabled: true, window: 4, maxRepeat: 3 });
  WA.tolerance.use('k', 'line'); WA.tolerance.tick(); WA.tolerance.use('k', 'line');
  WA.tolerance.tick(); WA.tolerance.use('k', 'line'); WA.tolerance.tick();
  return WA.tolerance.use('k', 'line').reason;
}
function probeTlRows(WA) {
  resetWorld(WA); WA.tolerance.setSettings({ enabled: true, maxRows: 4 });
  WA.tolerance.use('a', 'line'); WA.tolerance.use('b', 'line'); WA.tolerance.use('c', 'line'); WA.tolerance.use('d', 'line');
  return WA.tolerance.use('e', 'line').reason;
}
function kill(src) {
  if (src.indexOf('if (') !== 0) throw new Error('kill shape ' + src.slice(0, 24));
  let depth = 0, closeAt = -1;
  for (let i = src.indexOf('('); i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { closeAt = i; break; } }
  }
  if (closeAt < 0) throw new Error('kill unbalanced ' + src.slice(0, 40));
  return 'if (false) ' + src.slice(closeAt + 1);
}
const BROKEN = [
  { key: 'km-gate', rel: 'engines/karma.js', from: A_KM_GATE, to: kill(A_KM_GATE), hits: 3 },
  { key: 'km-kind', rel: 'engines/karma.js', from: A_KM_KIND, to: kill(A_KM_KIND) },
  { key: 'km-amount', rel: 'engines/karma.js', from: A_KM_AMOUNT, to: kill(A_KM_AMOUNT), hits: 2 },
  { key: 'km-rows', rel: 'engines/karma.js', from: A_KM_ROWS, to: kill(A_KM_ROWS) },
  { key: 'km-addaxis', rel: 'engines/karma.js', from: A_KM_ADDAXIS, to: "row[k] = Math.max(Number(row[k]) || 0, amt); row[(k === 'merit' ? 'debt' : 'merit')] = 0;" },
  { key: 'km-nodebt', rel: 'engines/karma.js', from: A_KM_NODEBT, to: kill(A_KM_NODEBT) },
  { key: 'km-nomerit', rel: 'engines/karma.js', from: A_KM_NOMERIT, to: kill(A_KM_NOMERIT) },
  { key: 'km-escalate', rel: 'engines/karma.js', from: A_KM_ESCALATE, to: "if (escalated) { stat.escalations++; }" },
  { key: 'km-notes', rel: 'engines/karma.js', from: A_KM_NOTES, to: "if (WA.evict) WA.evict.array(row.notes, 'karma-unregistered-site');" },
  { key: 'hz-gate', rel: 'engines/hazard.js', from: A_HZ_GATE, to: kill(A_HZ_GATE), hits: 6 },
  { key: 'hz-dup', rel: 'engines/hazard.js', from: A_HZ_DUP, to: kill(A_HZ_DUP) },
  { key: 'hz-rows', rel: 'engines/hazard.js', from: A_HZ_ROWS, to: kill(A_HZ_ROWS) },
  { key: 'hz-pending', rel: 'engines/hazard.js', from: A_HZ_PENDING, to: kill(A_HZ_PENDING) },
  { key: 'hz-rand', rel: 'engines/hazard.js', from: A_HZ_RAND, to: 'if (false) { out = { ok: false, reason: "x" }; return; }' },
  { key: 'hz-notpend', rel: 'engines/hazard.js', from: A_HZ_NOTPEND, to: kill(A_HZ_NOTPEND) },
  { key: 'hz-toosoon', rel: 'engines/hazard.js', from: A_HZ_TOOSOON, to: kill(A_HZ_TOOSOON) },
  { key: 'mg-gate', rel: 'engines/marginal.js', from: A_MG_GATE, to: kill(A_MG_GATE), hits: 6 },
  { key: 'mg-amount', rel: 'engines/marginal.js', from: A_MG_AMOUNT, to: kill(A_MG_AMOUNT) },
  { key: 'mg-missing', rel: 'engines/marginal.js', from: A_MG_MISSING, to: kill(A_MG_MISSING), hits: 3 },
  { key: 'mg-coolnosum', rel: 'engines/marginal.js', from: A_MG_COOLNOSUM, to: "row.cool = (Number(row.cool) || 0) + n;   // 叠加（缺陷型）" },
  { key: 'mg-tickdec', rel: 'engines/marginal.js', from: A_MG_TICKDEC, to: 'if ((Number(r.cool) || 0) > 0) { cooled++; }' },
  { key: 'tl-gate', rel: 'engines/tolerance.js', from: A_TL_GATE, to: kill(A_TL_GATE), hits: 4 },
  { key: 'tl-kind', rel: 'engines/tolerance.js', from: A_TL_KIND, to: kill(A_TL_KIND) },
  { key: 'tl-burst', rel: 'engines/tolerance.js', from: A_TL_BURST, to: kill(A_TL_BURST) },
  { key: 'tl-stale', rel: 'engines/tolerance.js', from: A_TL_STALE, to: kill(A_TL_STALE) },
  { key: 'tl-rows', rel: 'engines/tolerance.js', from: A_TL_ROWS, to: kill(A_TL_ROWS) }
];
function expectHits(spec) { return spec.hits == null ? 1 : spec.hits; }
function anchorHits(spec) {
  return fs.readFileSync(path.join(BASE, spec.rel), 'utf8').split(spec.from).length - 1;
}
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== expectHits(spec)) throw new Error('anchor hits ' + hits + ' != ' + expectHits(spec) + ' :: ' + spec.key);
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
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === expectHits(s), 'v2720: [N0] anchor hits declared count (' + expectHits(s) + ') :: ' + s.key); });
  a(probeWith(BROKEN[0], probeKmGate) !== 'disabled', 'v2720: [N1] karma gate removed');
  a(probeWith(BROKEN[1], probeKmKind) !== 'bad-kind', 'v2720: [N1] bad kind accepted');
  a(probeWith(BROKEN[2], probeKmAmount) !== 'bad-amount', 'v2720: [N1] bad amount accepted');
  a(probeWith(BROKEN[3], probeKmRows) !== 'rows-full', 'v2720: [N1] karma rows cap bypassed');
  a(probeWith(BROKEN[4], probeKmAddAxis) !== '100/30', 'v2720: [N1] independent-axis accumulation broken');
  a(probeWith(BROKEN[5], probeKmNoDebt) !== 'nothing-to-offset', 'v2720: [N1] empty-debt offset accepted');
  a(probeWith(BROKEN[6], probeKmNoMerit) !== 'no-merit', 'v2720: [N1] empty-merit offset accepted');
  a(probeWith(BROKEN[7], probeKmEscalate) !== '5', 'v2720: [N1] escalation no longer writes stage');
  a(probeWith(BROKEN[8], probeKmNotes) !== '8', 'v2720: [N1] karma.notes uncapped when site name broken');
  a(probeWith(BROKEN[9], probeHzGate) !== 'disabled', 'v2720: [N1] hazard gate removed');
  a(probeWith(BROKEN[10], probeHzDup) !== 'exists', 'v2720: [N1] duplicate risk accepted');
  a(probeWith(BROKEN[11], probeHzRows) !== 'rows-full', 'v2720: [N1] hazard rows cap bypassed');
  a(probeWith(BROKEN[12], probeHzPending) !== 'already-pending', 'v2720: [N1] double-pending accepted');
  a(probeWith(BROKEN[13], probeHzRand) !== 'rand-unavailable', 'v2720: [N1] rand guard removed (roll no longer refuses when rand is gone)');
  a(probeWith(BROKEN[14], probeHzNotPend) !== 'not-pending', 'v2720: [N1] confirm on non-pending accepted');
  a(probeWith(BROKEN[15], probeHzTooSoon) !== 'too-soon', 'v2720: [N1] revealDelay bypassed');
  a(probeWith(BROKEN[16], probeMgGate) !== 'disabled', 'v2720: [N1] marginal gate removed');
  a(probeWith(BROKEN[17], probeMgAmount) !== 'bad-amount', 'v2720: [N1] zero gain accepted');
  a(probeWith(BROKEN[18], probeMgMissing) !== 'missing', 'v2720: [N1] unregistered gain accepted');
  a(probeWith(BROKEN[19], probeMgCoolNoSum) !== '2', 'v2720: [N1] cooldown wrongly stacks');
  a(probeWith(BROKEN[20], probeMgTickDec) !== '0', 'v2720: [N1] cooldown never decrements');
  a(probeWith(BROKEN[21], probeTlGate) !== 'disabled', 'v2720: [N1] tolerance gate removed');
  a(probeWith(BROKEN[22], probeTlKind) !== 'bad-kind', 'v2720: [N1] bad means-kind accepted');
  a(probeWith(BROKEN[23], probeTlBurst) !== 'burst', 'v2720: [N1] same-round repeat accepted');
  a(probeWith(BROKEN[24], probeTlStale) !== 'stale', 'v2720: [N1] over-maxRepeat accepted');
  a(probeWith(BROKEN[25], probeTlRows) !== 'rows-full', 'v2720: [N1] tolerance rows cap bypassed');
  // N2 干净源上判据必须真见效（否则 N1 是假绿）
  a(probeClean(probeKmGate) === 'disabled', 'v2720: [N2] clean refuses disabled karma');
  a(probeClean(probeKmKind) === 'bad-kind', 'v2720: [N2] clean refuses bad kind');
  a(probeClean(probeKmAmount) === 'bad-amount', 'v2720: [N2] clean refuses bad amount');
  a(probeClean(probeKmRows) === 'rows-full', 'v2720: [N2] clean refuses karma rows cap');
  a(probeClean(probeKmAddAxis) === '100/30', 'v2720: [N2] clean keeps both axes');
  a(probeClean(probeKmNoDebt) === 'nothing-to-offset', 'v2720: [N2] clean refuses empty-debt offset');
  a(probeClean(probeKmNoMerit) === 'no-merit', 'v2720: [N2] clean refuses empty-merit offset');
  a(probeClean(probeKmEscalate) === '5', 'v2720: [N2] clean escalates');
  a(probeClean(probeKmNotes) === '8', 'v2720: [N2] clean caps karma.notes at 8');
  a(probeClean(probeHzGate) === 'disabled', 'v2720: [N2] clean refuses disabled hazard');
  a(probeClean(probeHzDup) === 'exists', 'v2720: [N2] clean refuses duplicate risk');
  a(probeClean(probeHzRows) === 'rows-full', 'v2720: [N2] clean refuses hazard rows cap');
  a(probeClean(probeHzPending) === 'already-pending', 'v2720: [N2] clean refuses double-pending');
  a(probeClean(probeHzNotPend) === 'not-pending', 'v2720: [N2] clean refuses confirm on non-pending');
  a(probeClean(probeHzTooSoon) === 'too-soon', 'v2720: [N2] clean refuses confirm too soon');
  a(probeClean(probeHzRand) === 'rand-unavailable', 'v2720: [N2] clean refuses roll when rand is unavailable');
  a(probeClean(probeMgGate) === 'disabled', 'v2720: [N2] clean refuses disabled marginal');
  a(probeClean(probeMgAmount) === 'bad-amount', 'v2720: [N2] clean refuses zero gain');
  a(probeClean(probeMgMissing) === 'missing', 'v2720: [N2] clean refuses unregistered gain');
  a(probeClean(probeMgCoolNoSum) === '2', 'v2720: [N2] clean cooldown does not stack');
  a(probeClean(probeMgTickDec) === '0', 'v2720: [N2] clean cooldown decrements');
  a(probeClean(probeTlGate) === 'disabled', 'v2720: [N2] clean refuses disabled tolerance');
  a(probeClean(probeTlKind) === 'bad-kind', 'v2720: [N2] clean refuses bad means-kind');
  a(probeClean(probeTlBurst) === 'burst', 'v2720: [N2] clean refuses same-round repeat');
  a(probeClean(probeTlStale) === 'stale', 'v2720: [N2] clean refuses over-maxRepeat');
  a(probeClean(probeTlRows) === 'rows-full', 'v2720: [N2] clean refuses tolerance rows cap');
  // N3 跨模块隔离
  a(probeWith(BROKEN[0], probeHzGate) === 'disabled', 'v2720: [N3] karma break does not touch hazard');
  a(probeWith(BROKEN[9], probeMgGate) === 'disabled', 'v2720: [N3] hazard break does not touch marginal');
  a(probeWith(BROKEN[16], probeTlGate) === 'disabled', 'v2720: [N3] marginal break does not touch tolerance');
  a(probeWith(BROKEN[21], probeKmGate) === 'disabled', 'v2720: [N3] tolerance break does not touch karma');
  a(probeWith(BROKEN[4], probeKmNoDebt) === 'nothing-to-offset', 'v2720: [N3] addaxis break does not touch offset guard');
  // N4 状态真实变更
  const chg = isolated(function () {
    const WA = fresh();
    resetWorld(WA);
    WA.tolerance.setSettings({ enabled: true, window: 3, maxRepeat: 3 });
    WA.tolerance.use('k', 'line');
    WA.tolerance.tick();
    return { rows: st(WA).tolerance.rows.length, hits: WA.tolerance.check('k').hits, round: WA.tolerance.round() };
  });
  a(chg.rows === 1 && chg.hits === 1 && chg.round === 1, 'v2720: [N4] state really changed');
  // N5 sentinel 未泄漏
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2720: [N5] sentinel did not leak');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2720: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2720: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };