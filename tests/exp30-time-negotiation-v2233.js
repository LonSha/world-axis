'use strict';
// WorldAxis tests/exp30-time-negotiation-v2233.js
// OPV4-3：时间成本预览与协商（冲突检测、最早完成日、改期、取消不退款、拆分、零写入预览）
const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const PR = 'engines/labor-schedule.js';

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  if (W.laborSchedule && typeof W.laborSchedule.setSettings === 'function') {
    W.laborSchedule.setSettings({ enabled: true });
  }
  if (W.actionDesk && typeof W.actionDesk.setSettings === 'function') {
    W.actionDesk.setSettings({ enabled: true });
  }
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_工匠甲'] = { name: '工匠甲', location: '坊', status: 'idle' };
    d.people['p_工匠乙'] = { name: '工匠乙', location: '坊', status: 'idle' };
    return true;
  }, 'test:seed-labor');
  return W;
}

/** ① 时间成本纯读预览：十次读数后存档逐字节不变 */
function previewReadOnly(W) {
  const before = JSON.stringify(W.store.get());
  for (let i = 0; i < 10; i++) {
    W.laborSchedule.previewSchedule({ who: '工匠甲', task: '修葺城垣', days: 3, slot: 'morning' });
  }
  const after = JSON.stringify(W.store.get());
  return before === after;
}

/** ② 禁止角色重叠承诺：同一人同时段冲突被检出，且最早完成日自动后延 */
function overlapConflictDetected(W) {
  // 先在第 1 日 morning 占一个时段
  const c1 = W.laborSchedule.claim({ who: '工匠甲', day: 1, slot: 'morning', task: '锻造农具' });
  if (!c1 || !c1.ok) return false;

  // 再次预览 2 天的 morning 任务，由于第 1 日已被占，第 1 日应为 conflict，earliestCompletionDay 至少延至第 3 日
  const prev = W.laborSchedule.previewSchedule({ who: '工匠甲', task: '砌炉', days: 2, slot: 'morning', startDay: 1 });
  if (!prev || !prev.ok || prev.hasConflict !== true) return false;
  return prev.conflicts.length >= 1 && prev.earliestCompletionDay >= 3;
}

/** ③ 改期（reschedule）：改至冲突时段拒绝且原预约保持不变，改至空闲时段成功 */
function rescheduleAgreement(W) {
  const b1 = W.laborSchedule.claim({ who: '工匠甲', day: 1, slot: 'afternoon', task: '加固立柱' });
  const b2 = W.laborSchedule.claim({ who: '工匠甲', day: 2, slot: 'afternoon', task: '铺设石板' });
  if (!b1.ok || !b2.ok) return false;

  // 将 b1 改期到第 2 日 afternoon（已有 b2），应发生冲突拒绝
  const rFail = W.laborSchedule.reschedule(b1.booking.id, 2, 'afternoon');
  if (rFail && rFail.ok) return false;

  // 验证原预约仍停留在第 1 日
  const v1 = W.laborSchedule.view({ who: '工匠甲', day: 1 });
  const hasOrig = (v1.bookings || []).some(function (x) { return x.id === b1.booking.id; });
  if (!hasOrig) return false;

  // 改期到第 3 日 afternoon，应成功
  const rOk = W.laborSchedule.reschedule(b1.booking.id, 3, 'afternoon');
  return !!(rOk && rOk.ok && rOk.day === 3);
}

/** ④ 取消预约（cancel）：明确标记 cancelled=true 且 costRefunded===false（已消耗不返还） */
function cancelNonRefundable(W) {
  const b = W.laborSchedule.claim({ who: '工匠乙', day: 1, slot: 'evening', task: '夜间巡防' });
  if (!b || !b.ok) return false;

  const cRes = W.laborSchedule.cancel(b.booking.id, { reason: '暴雨停巡' });
  if (!cRes || !cRes.ok || cRes.cancelled !== true || cRes.costRefunded !== false) return false;

  // view 中不应再出现已取消的预约
  const v = W.laborSchedule.view({ who: '工匠乙', day: 1 });
  const inView = (v.bookings || []).some(function (x) { return x.id === b.booking.id; });
  return !inView;
}

/** ⑤ 任务拆分（split）：将任务拆为二期续单 */
function splitSchedule(W) {
  const b = W.laborSchedule.claim({ who: '工匠乙', day: 2, slot: 'morning', task: '修补水渠' });
  if (!b || !b.ok) return false;

  const sp = W.laborSchedule.split(b.booking.id, { day: 3, slot: 'morning' });
  if (!sp || !sp.ok || !sp.newBookingId) return false;

  // 第 3 日应可见新单
  const v3 = W.laborSchedule.view({ who: '工匠乙', day: 3 });
  return (v3.bookings || []).some(function (x) { return x.id === sp.newBookingId; });
}

/** ⑥ 最早空闲时段探查 */
function earliestSlotFound(W) {
  W.laborSchedule.claim({ who: '工匠甲', day: 1, slot: 'morning', task: 't1' });
  W.laborSchedule.claim({ who: '工匠甲', day: 1, slot: 'afternoon', task: 't2' });
  W.laborSchedule.claim({ who: '工匠甲', day: 1, slot: 'evening', task: 't3' });

  // 第 1 日已满，最早空闲应在第 2 日
  const es = W.laborSchedule.earliestSlot('工匠甲', { startDay: 1 });
  return !!(es && es.ok && es.day === 2);
}

async function runAll(a, ov) {
  let W = env(ov);
  a(typeof W.laborSchedule.previewSchedule === 'function', 'previewSchedule 已装载');
  a(typeof W.laborSchedule.reschedule === 'function', 'reschedule 已装载');
  a(typeof W.laborSchedule.cancel === 'function', 'cancel 已装载');
  a(typeof W.laborSchedule.split === 'function', 'split 已装载');
  W = env(ov); a(previewReadOnly(W), '时间成本十次预览纯读零写入');
  W = env(ov); a(overlapConflictDetected(W), '角色重叠承诺被检测且推算延期');
  W = env(ov); a(rescheduleAgreement(W), '改期冲突时拒绝且原单不丢');
  W = env(ov); a(cancelNonRefundable(W), '取消预约生效且不退还已消耗工时');
  W = env(ov); a(splitSchedule(W), '任务可安全拆分续段');
  W = env(ov); a(earliestSlotFound(W), '最早空闲时段自动定位');
}

// ── 负控制：真源码破坏（锚点唯一）→ 破坏副本上同款判据必须失败 ──
const mutations = [
  ['conflict-ignored',
    "if (dayConf) {",
    "if (false) {",
    overlapConflictDetected],
  ['reschedule-overwrite',
    "    if (conf) {\n      noteFault('reschedule-conflict');",
    "    if (false) {\n      noteFault('reschedule-conflict');",
    rescheduleAgreement],
  ['refund-violated',
    "row.costRefunded = false; // 严守契约：取消不返还已消耗成本",
    "row.costRefunded = true;",
    cancelNonRefundable],
  ['preview-writes',
    "const occupiedSlots = [];",
    "WA.store.transact(function(d){ d.__timeProbe = (d.__timeProbe || 0) + 1; return true; }, 'probe'); const occupiedSlots = [];",
    previewReadOnly]
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
  console.log('EXP30-OPV4-3: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();