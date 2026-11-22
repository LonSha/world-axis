'use strict';
/**
 * tests/narrative-depth-wire-v2545.js — 叙事深度第一批（4/5）专锁
 *
 * 锁什么：spotlight 的「轻提」不再只看 missed 轮数，先过 followup-gate 的静默阈值。
 *   A 刚登场 10 分钟（missed 够多也不该被顺口带一句）⇒ action none / followup-hold / still-quiet
 *   B 久静默 400 分钟 ⇒ 照常 presence-trace
 *   C followup-gate 缺席 ⇒ 退回原行为（向后兼容）
 *   D 负控在别处做（把 spotlight 里的 gate 条件置假，A 段应红）
 */
const assert = require('assert');
const env = require('./ui-gate-sync.js').fresh();
const W = env.WA;
const store = W.store;
store.init();

const SP = W.spotlight;
const FG = W.followupGate;
const NOW = (function () { try { return W.clock.now('test.narrativeDepth'); } catch (e) { return Date.now(); } })();

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' :: ' + e.message); throw e; }
}
function setRows(rows) {
  store.transact(function (d) { d.spotlight = { rows: rows, pending: [] }; }, 'test:spotlight-rows');
}
function ctx() {
  return { currentLocation: '集市', inScene: [], registeredScenes: {}, registeredTraces: {}, relations: {} };
}

ok('C0 前置：spotlight.resolveIntervention / followupGate.due 在场', function () {
  assert.ok(SP && typeof SP.resolveIntervention === 'function');
  assert.ok(FG && typeof FG.due === 'function');
});

ok('A 刚登场 10 分钟：missed 再多也不轻提（静默闸挡下）', function () {
  FG.saveSettings({ enabled: true, dnd: false, idleThreshold: 300, hoursFrom: 0, hoursTo: 24, perDayCap: 99 });
  setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 10 * 60000 }]);
  const r = SP.resolveIntervention(ctx());
  assert.strictEqual(r.action, 'none', JSON.stringify(r));
  assert.strictEqual(r.reason, 'followup-hold');
  assert.ok(String(r.gateReason).indexOf('still-quiet') >= 0, 'gateReason=' + r.gateReason);
});

ok('B 久静默 400 分钟：照常轻提', function () {
  setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 400 * 60000 }]);
  const r = SP.resolveIntervention(ctx());
  assert.strictEqual(r.action, 'presence-trace', JSON.stringify(r));
  assert.strictEqual(r.target, '阿福');
});

ok('C followup-gate 缺席：退回原行为（不因闸门缺失而静默）', function () {
  const orig = W.followupGate;
  delete W.followupGate;
  try {
    setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 10 * 60000 }]);
    const r = SP.resolveIntervention(ctx());
    assert.strictEqual(r.action, 'presence-trace', JSON.stringify(r));
  } finally {
    W.followupGate = orig;
  }
});

console.log('narrative-depth-wire-2545: PASS (' + pass + ' 段：静默阈值挡住「刚见过又顺口带一句」，久静默照常轻提)');