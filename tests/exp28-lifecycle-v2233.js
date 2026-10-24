'use strict';
// WorldAxis tests/exp28-lifecycle-v2233.js
// OPV4-2：跨轮行动生命周期投影（纯读薄投影）与恢复（恢复一律转回既有 owner）。
//   · 正向：阶段由各 owner 读口当场算；恢复动作真的经 owner 生效；部分完成不伪装成
//           成功；读不到/关着如实报；终态与活跃分开；在途人物如实标在途。
//   · 负向：真源码破坏（锚点恰中 1 次）→ 加载破坏副本 → 在同一副本上重跑同款真判据。
//
// 现场校准（一次探针一次结论，不凭假设写判据）：
//   ① 各 owner 真实默认是关的（enabled:false），测试必须先显式开；
//   ② research 的成果必须命中 economy 已知配方（词表：面包 / 铁器），
//      且 `advance` 要**逐阶段**调满 phases 次才 `confirmed`；
//   ③ commission 没有 `list()`，读口是 `pending()`；关着时如实记 fault；
//   ④ production.open 需要成果已授权；`deliverPartial` 需要 facility 空也可，
//      但入账走 economy.stock ⇒ 首次登记该货必须给 base（或该资源在题材价目表内）；
//   ⑤ production.list() 导出的是 `delivered` 明细账，**没有** deliveredQty 别名。
const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const PR = 'engines/action-desk.js';

/** 造一局：默认全关是真实现场，这里显式开四个 owner。 */
function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  ['research', 'production', 'economy', 'actionDesk'].forEach(function (k) {
    W[k].setSettings({ enabled: true });
  });
  return W;
}
function seed(W, who) {
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_' + who] = { name: who, location: '东市', status: 'idle', resources: { '面粉': 40 } };
    return true;
  }, 'test:seed-person');
}
function rowOf(lc, prefix) {
  return (lc.rows || []).filter(function (r) {
    return r && typeof r.recover === 'string' && r.recover.indexOf(prefix) === 0;
  })[0];
}
/** 让研究走到授权（逐阶段推进，不偷步）。 */
function researchReady(W, who, phases) {
  const n = phases || 2;
  const p = W.research.open({ by: who, hypothesis: '改良工艺', result: '面包', phases: n, materials: { '面粉': 4 } });
  if (!p || !p.ok) return null;
  const sup = W.actionDesk.recoverAction('research.supply:' + p.id, { who: who, material: '面粉', amount: n * 2 });
  if (!sup || !sup.ok) return null;
  let last = null;
  for (let i = 0; i < n; i++) last = W.actionDesk.plan('research.advance:' + p.id, {});
  return (last && last.status === 'confirmed') ? p : null;
}

/** ① 无事时如实报空（不折成 unreadable，也不留残影）。 */
function emptyIsHonest(W) {
  const lc = W.actionDesk.lifecycle({ who: '甲' });
  if (!lc.ok || lc.isProjection !== true) return false;
  const counts = lc.counts || {};
  const allZero = ['in-progress', 'awaiting-confirm', 'paused', 'blocked', 'partial', 'terminal']
    .every(function (k) { return counts[k] === 0; });
  return lc.rows.length === 0 && (lc.terminalRows || []).length === 0 && allZero
    && counts.unreadable === 0 && typeof lc.note === 'string' && lc.note.length > 0;
}

/** ② 研究：缺料 ⇒ blocked + 可执行 recover；经 owner 恢复后转 awaiting-confirm。 */
function researchStageMoves(W) {
  seed(W, '甲');
  const p = W.research.open({ by: '甲', hypothesis: '改良工艺', result: '面包', phases: 2, materials: { '面粉': 4 } });
  if (!p || !p.ok) return false;
  let lc = W.actionDesk.lifecycle({ who: '甲' });
  const blocked = rowOf(lc, 'research.supply:');
  if (!blocked || blocked.stage !== 'blocked' || blocked.owner !== 'research') return false;
  const sup = W.actionDesk.recoverAction(blocked.recover, { who: '甲', material: '面粉', amount: 8 });
  if (!sup || !sup.ok) return false;
  lc = W.actionDesk.lifecycle({ who: '甲' });
  const ready = rowOf(lc, 'research.advance:');
  return !!(ready && ready.stage === 'awaiting-confirm');
}

/** ③ 只读：投影跑十次，存档逐字节不变。 */
function readOnly(W) {
  seed(W, '甲');
  W.research.open({ by: '甲', hypothesis: '只读探针', result: '面包', phases: 2, materials: { '面粉': 2 } });
  const before = JSON.stringify(W.store.get());
  for (let i = 0; i < 10; i++) W.actionDesk.lifecycle({ who: '甲' });
  W.actionDesk.lifecycle({ who: '' });
  const after = JSON.stringify(W.store.get());
  return before === after;
}

/** ④ 部分完成不伪装成成功：部分交付后仍留活跃档，且不是终态。 */
function partialIsNotSuccess(W) {
  seed(W, '甲');
  if (!researchReady(W, '甲')) return false;
  const j = W.production.open({ recipe: '面包', by: '甲', qty: 4, days: 4 });
  if (!j || !j.ok) return false;
  W.production.advance(j.id, { days: 2 });
  const dp = W.production.deliverPartial(j.id, { qty: 2, place: '东市', base: 3 });
  if (!dp || !dp.ok || !(dp.remainingQty > 0)) return false;
  const lc = W.actionDesk.lifecycle({ who: '甲' });
  const part = (lc.rows || []).filter(function (r) { return r.kind === 'production' && r.id === j.id; })[0];
  if (!part || part.stage === 'terminal') return false;
  return !!(lc.counts.partial >= 1 && typeof part.recover === 'string' && part.recover.length > 0);
}

/** ⑤ 暂停的工单归 paused，复工经 owner 真的回到在产。 */
function pausedRecovers(W) {
  seed(W, '甲');
  if (!researchReady(W, '甲')) return false;
  const j = W.production.open({ recipe: '面包', by: '甲', qty: 2, days: 2 });
  if (!j || !j.ok) return false;
  const ps = W.production.pause(j.id, { why: '缺料' });
  if (!ps || !ps.ok) return false;
  const lc = W.actionDesk.lifecycle({ who: '甲' });
  const row = rowOf(lc, 'production.resume:');
  if (!row || row.stage !== 'paused') return false;
  const back = W.actionDesk.recoverAction(row.recover, { who: '甲' });
  if (!back || !back.ok) return false;
  const st = (W.production.list() || []).filter(function (x) { return x.id === j.id; })[0];
  return !!(st && st.status === 'running');
}

/** ⑥ 读口不可用时如实报 unreadable，不当成「真没事」。 */
function unreadableIsHonest(W) {
  seed(W, '甲');
  W.research.open({ by: '甲', hypothesis: '读口探针', result: '面包', phases: 2, materials: { '面粉': 1 } });
  const saved = W.research.list;
  W.research.list = function () { return [{ id: 'r_broken_1', by: '甲', result: '面包', status: 'hypothesis', phase: 0, phases: 2 }]; };
  const savedView = W.research.view;
  W.research.view = function () { return { ok: false, reason: 'no-such-project' }; };
  let lc;
  try { lc = W.actionDesk.lifecycle({ who: '甲' }); }
  finally { W.research.list = saved; W.research.view = savedView; }
  return lc.counts.unreadable >= 1
    && (lc.rows || []).some(function (r) { return r.stage === 'unreadable' && r.recover === null; });
}

/** ⑦ 终态离开活跃清单，并进 terminalRows 追溯。 */
function terminalSeparated(W) {
  seed(W, '甲');
  const p = researchReady(W, '甲');
  if (!p) return false;
  const lc = W.actionDesk.lifecycle({ who: '甲' });
  const activeHas = (lc.rows || []).some(function (r) { return r.id === p.id; });
  const termHas = (lc.terminalRows || []).some(function (r) { return r.id === p.id; });
  return !activeHas && termHas && lc.counts.terminal >= 1;
}

/** ⑧ 未知/空恢复前缀一律拒收（不猜一个 owner 去写）。 */
function unknownRecoverRefused(W) {
  seed(W, '甲');
  const out = W.actionDesk.recoverAction('nosuch.verb:x', { who: '甲' });
  if (out && out.ok) return false;
  const empty = W.actionDesk.recoverAction('', { who: '甲' });
  if (!(empty && empty.reason === 'missing-fields')) return false;
  const undef = W.actionDesk.recoverAction(null, { who: '甲' });
  return !!(undef && undef.reason === 'missing-fields');
}

/** ⑨ 在途人物如实进在途档，且不给可执行恢复（恢复要抵达后由 travel 定）。 */
function travelingShown(W) {
  seed(W, '乙');
  W.store.transact(function (d) { d.people['p_乙'].status = 'traveling'; return true; }, 'test:travel');
  const lc = W.actionDesk.lifecycle({ who: '乙' });
  const row = (lc.rows || []).filter(function (r) { return r.kind === 'people'; })[0];
  return !!(row && row.stage === 'in-progress' && row.recover === null);
}

/** ⑩ owner 关着时如实记 fault，不静默折成「没有待办」。 */
function ownerClosedIsHonest(W) {
  const lc = W.actionDesk.lifecycle({ who: '甲' });
  return (lc.faults || []).some(function (f) { return /^commission:/.test(f); });
}

/** ⑪ 开关关闭时整模块拒答（不返回一个骗人的空投影）。 */
function disabledRefused(W) {
  W.actionDesk.setSettings({ enabled: false });
  const lc = W.actionDesk.lifecycle({ who: '甲' });
  return !!(lc && lc.ok === false && lc.reason === 'disabled');
}

async function runAll(a, ov) {
  let W = env(ov);
  a(typeof W.actionDesk.lifecycle === 'function', 'lifecycle 已装载');
  a(typeof W.actionDesk.recoverAction === 'function', 'recoverAction 已装载');
  W = env(ov); a(emptyIsHonest(W), '空局如实报零，不折成 unreadable');
  W = env(ov); a(ownerClosedIsHonest(W), 'owner 关着记 fault，不静默');
  W = env(ov); a(researchStageMoves(W), '研究 blocked → 供料 → awaiting-confirm');
  W = env(ov); a(readOnly(W), '投影零写入（十次读数后存档逐字节不变）');
  W = env(ov); a(partialIsNotSuccess(W), '部分完成未被伪装成成功');
  W = env(ov); a(pausedRecovers(W), '暂停工单经 owner 真的复工');
  W = env(ov); a(unreadableIsHonest(W), '读不到如实报，不折成没事');
  W = env(ov); a(terminalSeparated(W), '终态离开活跃清单、进 terminalRows');
  W = env(ov); a(unknownRecoverRefused(W), '未知/空恢复被拒收');
  W = env(ov); a(travelingShown(W), '在途人物如实展示且不给可执行恢复');
  W = env(ov); a(disabledRefused(W), '关闭时拒答而不是给空投影');
}

// ── 负控制：真源码破坏（锚点恰中 1 次）→ 破坏副本上同款判据必须失败 ──
const mutations = [
  ['partial-as-success',
    'const closed = (j.status === \'delivered\' || j.status === \'cancelled\');',
    'const closed = true;',
    partialIsNotSuccess],
  ['lifecycle-writes',
    'stat.lifecycles = (stat.lifecycles || 0) + 1;',
    'WA.store.transact(function (d) { d.__lcProbe = (d.__lcProbe || 0) + 1; return true; }, "lc:probe"); stat.lifecycles = (stat.lifecycles || 0) + 1;',
    readOnly],
  ['shortage-hidden',
    'if (have < per) short.push(k);',
    'if (false) short.push(k);',
    researchStageMoves],
  ['terminal-in-active',
    "const active = rows.filter(function (r) { return r.stage !== 'terminal'; });",
    'const active = rows.slice();',
    terminalSeparated],
  ['unreadable-hidden',
    "{ stage: 'unreadable', kind: 'research', id: p.id, label: '项目 ' + p.id,",
    "{ stage: 'terminal', kind: 'research', id: p.id, label: '项目 ' + p.id,",
    unreadableIsHonest],
  ['resume-refused',
    "if (!raw) return { ok: false, reason: 'missing-fields', field: 'actionId' };",
    "if (false) return { ok: false, reason: 'missing-fields', field: 'actionId' };",
    unknownRecoverRefused]
];
async function runNegative(a) {
  for (const [name, anchor, replacement, crit] of mutations) {
    const source = fs.readFileSync(path.join(BASE, PR), 'utf8');
    const hits = source.split(anchor).length - 1;
    if (hits !== 1) throw new Error(name + ': 负控制锚点须恰中 1 次，实为 ' + hits);
    a(crit(env()), name + ': 原版上同款判据成立');
    const ov = {}; ov[PR] = source.replace(anchor, replacement);
    a(!crit(env(ov)), name + ': 破坏副本上同款判据失败');
    a(fs.readFileSync(path.join(BASE, PR), 'utf8') === source, name + ': 真源码零改写');
  }
}
module.exports = { runAll, runNegative };
if (require.main === module) (async function () {
  let pass = 0, fail = 0;
  const a = (ok, name) => { if (ok) pass++; else { fail++; console.log('FAIL ' + name); } };
  try { await runAll(a); await runNegative(a); }
  catch (e) { fail++; console.log(e.stack); }
  console.log('EXP28-OPV4-2: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();