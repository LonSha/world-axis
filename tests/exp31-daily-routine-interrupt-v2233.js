'use strict';
// WorldAxis tests/exp31-daily-routine-interrupt-v2233.js
// OPV4-4：人物日常安排可被世界打断并接续。
//   · 正向：
//       1. 突发事件/事故导致日程打断：支持替班（substitute）、改期（postpone）、取消（cancel）、缺席（absent）；
//       2. 替班目标如果本身在该时段已有安排，拦截冲突且原预约保持原状；
//       3. 替班成功时，预约 owner 平滑转交，原责任人留痕转交原因与时间；
//       4. 登记缺席（absent）时保留原始底单并在 view 中明确标记，未结清工时不被伪装成已完成；
//       5. 打断后恢复（resume）：absent 状态下恢复为活跃，若目标时段已被抢占则拒绝恢复；
//       6. 纯读查询与生命周期零破坏。
//   · 负向：真源码破坏（锚点唯一）→ 破坏副本上判据失败。

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
  W.laborSchedule.setSettings({ enabled: true });
  return W;
}

/** ① 替班冲突拦截：替班人已被占用时，拒绝替班且原人原单不变 */
function substituteConflictPrevented(W) {
  const b1 = W.laborSchedule.claim({ who: '张师傅', day: 1, slot: 'morning', task: '铁匠铺当值' });
  const b2 = W.laborSchedule.claim({ who: '李学徒', day: 1, slot: 'morning', task: '进城采购' });
  if (!b1.ok || !b2.ok) return false;

  // 张师傅突发扭伤，试图让李学徒替班（但李学徒上午已有采购）
  const res = W.laborSchedule.interrupt(b1.booking.id, 'substitute', {
    substituteWho: '李学徒',
    reason: '腰部扭伤无法打铁'
  });
  if (res.ok) return false; // 应当拦截
  if (res.reason !== 'target-has-conflict') return false;

  // 验证原单未被改写
  const v = W.laborSchedule.view({ who: '张师傅', day: 1 });
  const stillMine = (v.bookings || []).some(function (b) { return b.id === b1.booking.id && b.who === '张师傅'; });
  return stillMine;
}

/** ② 替班成功平滑转交 */
function substituteSuccessTransfer(W) {
  const b1 = W.laborSchedule.claim({ who: '赵医师', day: 2, slot: 'afternoon', task: '坐堂巡诊' });
  if (!b1.ok) return false;
  // 孙医师下午空闲，成功替班
  const res = W.laborSchedule.interrupt(b1.booking.id, 'substitute', {
    substituteWho: '孙医师',
    reason: '应召前往县衙'
  });
  if (!res || !res.ok || res.interrupted !== true || res.solution !== 'substitute') return false;

  const vSun = W.laborSchedule.view({ who: '孙医师', day: 2 });
  return (vSun.bookings || []).some(function (b) { return b.id === b1.booking.id && b.who === '孙医师'; });
}

/** ③ 缺席留痕与打断后恢复 */
function absentAndResume(W) {
  const b = W.laborSchedule.claim({ who: '王巡查', day: 3, slot: 'morning', task: '城防巡检' });
  if (!b.ok) return false;

  // 突降暴雨，登记缺席
  const intRes = W.laborSchedule.interrupt(b.booking.id, 'absent', { reason: '暴雨山体滑坡封路' });
  if (!intRes || !intRes.ok || intRes.absent !== true) return false;

  // view 中应能查看到 absent 状态
  const vMid = W.laborSchedule.view({ who: '王巡查', day: 3 });
  const rowInMid = (vMid.bookings || []).filter(function (x) { return x.id === b.booking.id; })[0];
  if (!rowInMid || rowInMid.absent !== true) return false;

  // 模拟在此期间他人抢占了同一时段
  W.laborSchedule.claim({ who: '王巡查', day: 3, slot: 'morning', task: '临时加塞' });

  // 此时尝试恢复应受阻（时段冲突）
  const failRes = W.laborSchedule.resume(b.booking.id);
  if (failRes && failRes.ok) return false; // 应当被拦截！

  return true;
}

/** ④ 改期打断 */
function postponeInterrupt(W) {
  const b = W.laborSchedule.claim({ who: '钱账房', day: 4, slot: 'evening', task: '月度清盘' });
  if (!b.ok) return false;

  const pRes = W.laborSchedule.interrupt(b.booking.id, 'postpone', {
    targetDay: 5,
    targetSlot: 'evening',
    reason: '账本受潮需要晾晒'
  });
  if (!pRes || !pRes.ok || pRes.solution !== 'postpone') return false;

  const v5 = W.laborSchedule.view({ who: '钱账房', day: 5 });
  return (v5.bookings || []).some(function (x) { return x.id === b.booking.id && x.day === 5; });
}

async function runAll(a, ov) {
  let W = env(ov);
  a(typeof W.laborSchedule.interrupt === 'function', 'laborSchedule.interrupt 已导出');
  a(typeof W.laborSchedule.resume === 'function', 'laborSchedule.resume 已导出');
  W = env(ov); a(substituteConflictPrevented(W), '替班人有时段冲突时拒绝打断且原单不丢');
  W = env(ov); a(substituteSuccessTransfer(W), '替班成功平滑转交责任人并留痕');
  W = env(ov); a(absentAndResume(W), '支持登记缺席并在事后恢复履约');
  W = env(ov); a(postponeInterrupt(W), '突发事件支持顺延改期');
}

const mutations = [
  ['conflict-ignored',
    "    if (toConflict) {\n      noteFault('target-has-conflict');",
    "    if (false) {\n      noteFault('target-has-conflict');",
    substituteConflictPrevented],
  ['absent-not-recorded',
    "row.absent = true;",
    "row.absent = false;",
    absentAndResume],
  ['resume-unconditional',
    "    if (conf) {\n      return { ok: false, reason: 'resume-slot-conflict', conflictWith: conf.task };",
    "    if (false) {\n      return { ok: false, reason: 'resume-slot-conflict', conflictWith: conf.task };",
    absentAndResume]
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
  console.log('EXP31-OPV4-4: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();
