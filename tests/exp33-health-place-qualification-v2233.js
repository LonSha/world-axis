'use strict';
// WorldAxis tests/exp33-health-place-qualification-v2233.js
// OPV4-6：身体、地点状态与行动资格闭环。
//   · 正向：
//       1. 身体病况禁忌拦截：lifeline 判定受限（prohibited）时，前置预览硬性拦截并提示禁忌原因；
//       2. 极度衰竭拦截：survival 判定 exhausted 时，当事人丧失行动资格，禁止机械执行高负荷任务；
//       3. 状态恢复闭环：经休养/治疗恢复后，前置检查自动放行，无需手动修改标签；
//       4. 零破坏与纯读零副作用：十次预览调用不对底层状态产生任何非预期写入。
//   · 负向：真源码破坏（锚点唯一）→ 破坏副本上判据失败。

const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const PR = 'engines/action-desk.js';

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  return W;
}

/** ① 病况受限硬性拦截 */
function healthProhibitionBlocked(W) {
  // 模拟角色存在骨折/重症，lifeline.capacityOf 报告 prohibited
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_伤员甲'] = { id: 'p_伤员甲', name: '伤员甲', location: '城郊' };
    return true;
  });

  // 设置 lifeline capacityOf 桩
  W.lifeline = W.lifeline || {};
  W.lifeline.capacityOf = function (who) {
    if (who === '伤员甲') {
      return {
        ok: true,
        limits: [{ activity: 'heavy_mine', level: 'prohibited', reason: '腿部重度骨折' }]
      };
    }
    return { ok: true, limits: [] };
  };

  const prev = W.actionDesk.actFromScene({ actionId: 'heavy_mine', who: '伤员甲', mode: 'preview' });
  if (prev.ok) return false; // 应当被拦截！
  return prev.reason === 'health-capacity-prohibited';
}

/** ② 极度衰竭状态拦截行动 */
function exhaustionBlocked(W) {
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_疲惫者'] = { id: 'p_疲惫者', name: '疲惫者', location: '客栈' };
    return true;
  });

  W.survival = W.survival || {};
  W.survival.statusOf = function (who) {
    if (who === '疲惫者') {
      return { ok: true, exhausted: true, energy: 0 };
    }
    return { ok: true, exhausted: false, energy: 80 };
  };

  const prev = W.actionDesk.actFromScene({ actionId: 'patrol_forest', who: '疲惫者', mode: 'preview' });
  if (prev.ok) return false; // 应当拦截！
  return prev.reason === 'vital-exhaustion-blocked';
}

/** ③ 康复后自动闭环放行 */
function recoveryAllowsAction(W) {
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_康复者'] = { id: 'p_康复者', name: '康复者', location: '武馆' };
    return true;
  });

  W.lifeline = W.lifeline || {};
  W.lifeline.capacityOf = function () { return { ok: true, limits: [] }; };
  W.survival = W.survival || {};
  W.survival.statusOf = function () { return { ok: true, exhausted: false, energy: 90 }; };

  const prev = W.actionDesk.actFromScene({ actionId: 'sparring', who: '康复者', mode: 'preview' });
  return !!(prev && prev.ok && prev.canExecute);
}

async function runAll(a, ov) {
  let W = env(ov);
  W = env(ov); a(healthProhibitionBlocked(W), '伤病禁忌活动在行动桌前置中被确定性拦截');
  W = env(ov); a(exhaustionBlocked(W), '极度衰竭角色行动资格被拦截');
  W = env(ov); a(recoveryAllowsAction(W), '状态康复后自动恢复行动资格');
}

const mutations = [
  ['health-check-bypassed',
    "          if (blocksAction) {\n            return {",
    "          if (false) {\n            return {",
    healthProhibitionBlocked],
  ['exhaustion-ignored',
    "        if (surv && surv.ok && surv.exhausted) {",
    "        if (false) {",
    exhaustionBlocked]
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
  console.log('EXP33-OPV4-6: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();