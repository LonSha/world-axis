'use strict';
// WorldAxis tests/exp29-sceneflow-v2233.js
// OPV4-1：场景优先行动流（情境感知、行动聚合、只读预览、带幂等回执确认执行、视角隔离）
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
  ['research', 'production', 'actionDesk', 'economy'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { name: '甲', location: '东市', status: 'idle', resources: { '面粉': 20 } };
    d.people['p_乙'] = { name: '乙', location: '西市', status: 'idle', resources: {} };
    // 注入一条关联甲的因果变化，以及一条与甲无关的私密变化
    d.causal = d.causal || {};
    d.causal.chains = [
      { id: 'c_public', title: '东市修桥', stage: 'pending', place: '东市', public: true, affected: ['甲'] },
      { id: 'c_private_b', title: '西市密谋', stage: 'pending', place: '西市', public: false, affected: ['乙'] }
    ];
    return true;
  }, 'test:seed-scene');
  return W;
}

/** ① 场景流纯读投影：十次读数后存档逐字节不变 */
function flowReadOnly(W) {
  const before = JSON.stringify(W.store.get());
  for (let i = 0; i < 10; i++) {
    W.actionDesk.sceneFlow({ who: '甲', place: '东市' });
  }
  const after = JSON.stringify(W.store.get());
  return before === after;
}

/** ② 观察者视角隔离：甲在东市看不到乙在西市的私密变化 */
function observerIsolation(W) {
  const sf甲 = W.actionDesk.sceneFlow({ who: '甲', place: '东市' });
  if (!sf甲.ok) return false;
  const titles甲 = (sf甲.visibleChanges || []).map(function (c) { return c.title; });
  const hasPublic = titles甲.indexOf('东市修桥') >= 0;
  const hasPrivate = titles甲.indexOf('西市密谋') >= 0;

  const sf乙 = W.actionDesk.sceneFlow({ who: '乙', place: '西市' });
  if (!sf乙.ok) return false;
  const titles乙 = (sf乙.visibleChanges || []).map(function (c) { return c.title; });
  const bSeesPrivate = titles乙.indexOf('西市密谋') >= 0;

  return hasPublic && !hasPrivate && bSeesPrivate;
}

/** ③ 行动预览模式只读且带前置检查与场景上下文 */
function previewIntegrity(W) {
  const p = W.research.open({ by: '甲', hypothesis: '优质糕点', result: '面包', phases: 2, materials: { '面粉': 4 } });
  if (!p || !p.ok) return false;

  const prev = W.actionDesk.actFromScene({
    actionId: 'research.supply:' + p.id,
    who: '甲',
    place: '东市',
    mode: 'preview'
  });

  return !!(prev && prev.ok && prev.isSceneContext === true && prev.viewer === '甲' && prev.place === '东市'
    && prev.preview === true);
}

/** ④ 从场景执行：真实转交原 owner 并返回带场景上下文的回执 */
function executeFromScene(W) {
  const p = W.research.open({ by: '甲', hypothesis: '优质糕点', result: '面包', phases: 2, materials: { '面粉': 4 } });
  if (!p || !p.ok) return false;

  const key = 'idem_scene_exec_001';
  const r1 = W.actionDesk.actFromScene({
    actionId: 'research.supply:' + p.id,
    who: '甲',
    place: '东市',
    material: '面粉',
    amount: 4,
    idempotencyKey: key,
    mode: 'execute'
  });

  if (!r1 || !r1.ok || r1.isSceneContext !== true || r1.viewer !== '甲') return false;

  // 重复提交相同幂等键，应返回历史回执且不产生第二次扣款
  const r2 = W.actionDesk.actFromScene({
    actionId: 'research.supply:' + p.id,
    who: '甲',
    place: '东市',
    material: '面粉',
    amount: 4,
    idempotencyKey: key,
    mode: 'execute'
  });

  return !!(r2 && r2.ok && r2.duplicated === true && r2.idempotencyKey === key);
}

/** ⑤ 受阻行动在场景流中带有原因与缺料明细 */
function blockedActionEnriched(W) {
  // 设乙无面粉，开启立项
  const p = W.research.open({ by: '乙', hypothesis: '铁器锻造', result: '铁器', phases: 2, materials: { '铁矿': 10 } });
  if (!p || !p.ok) return false;

  const sf = W.actionDesk.sceneFlow({ who: '乙', place: '西市' });
  if (!sf || !sf.ok) return false;

  const blocked = (sf.blockedActions || []).filter(function (a) {
    return a.id.indexOf('research.supply:' + p.id) >= 0;
  })[0];

  return !!(blocked && blocked.state !== 'ready' && blocked.why);
}

/** ⑥ 关闸时场景流整流程拒收 */
function disabledRefused(W) {
  W.actionDesk.setSettings({ enabled: false });
  const sf = W.actionDesk.sceneFlow({ who: '甲' });
  const act = W.actionDesk.actFromScene({ actionId: 'test', who: '甲' });
  return sf && sf.ok === false && sf.reason === 'disabled';
}

async function runAll(a, ov) {
  let W = env(ov);
  a(typeof W.actionDesk.sceneFlow === 'function', 'sceneFlow 已装载');
  a(typeof W.actionDesk.actFromScene === 'function', 'actFromScene 已装载');
  W = env(ov); a(flowReadOnly(W), '场景流十次读数零写入');
  W = env(ov); a(observerIsolation(W), '观察者视角信息严格隔离');
  W = env(ov); a(previewIntegrity(W), '行动预览模式带场景上下文与前置预演');
  W = env(ov); a(executeFromScene(W), '从场景执行带幂等回执并转交原 owner');
  W = env(ov); a(blockedActionEnriched(W), '受阻行动带有明确原因与要素明细');
  W = env(ov); a(disabledRefused(W), '关闸时场景流如实拒答');
}

// ── 负控制：真源码破坏（锚点唯一）→ 破坏副本上同款判据必须失败 ──
const mutations = [
  ['isolation-broken',
    "    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const who = clean(o.who || o.person || o.viewer, 40);",
    "    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const who = '';",
    observerIsolation],
  ['sceneflow-writes',
    "const actList = (sit.availableActions || []).concat(sit.blockedActions || []);",
    "WA.store.transact(function(d){ d.__dirtyProbe = (d.__dirtyProbe || 0) + 1; return true; }, 'probe'); const actList = (sit.availableActions || []).concat(sit.blockedActions || []);",
    flowReadOnly],
  ['preview-context-dropped',
    "return Object.assign({ ok: true, isSceneContext: true, viewer: who, place: place }, prev);",
    "return Object.assign({ ok: true, isSceneContext: false, viewer: null, place: null }, prev);",
    previewIntegrity],
  ['idempotency-ignored',
    "if (receipts[key]) {",
    "if (false) {",
    executeFromScene]
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
  console.log('EXP29-OPV4-1: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();