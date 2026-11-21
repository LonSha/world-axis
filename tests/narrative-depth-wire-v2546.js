'use strict';
/**
 * tests/narrative-depth-wire-v2546.js — 引擎深度第二批（1）：折叠时机接进注入装配
 *
 * 锁什么：inject-collector 装配完「结构汇流」后，把本轮折叠量交给 compactTiming.plan 判一次：
 *   B 缓存热（距上次回复 5 秒）且折掉若干条 ⇒ action=hold（先不折更划算）
 *   C 缓存冷（距上次回复 27 小时）⇒ action=fold
 *   D 没有折叠 ⇒ action=none（不拿「没折」冒充「判过」）
 *   E compactTiming 缺席 ⇒ fold=null 且装配不崩（向后兼容）
 *   F 每次装配都真调一次 plan（plans 计数 +1），diagnose().fold 与 stat().fold 同值
 *
 * 时间域：lastInjection.at 与 clockNow 必须同一域 —— 本锁用 WA.clock.now，
 *   不用 Date.now（两者相差几十年，会把「5 秒前」读成「56 年前」，热缓存判据当场失效）。
 */
const assert = require('assert');
const env = require('./ui-gate-sync.js').fresh();
const W = env.WA;
const store = W.store;
store.init();

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' :: ' + e.message); throw e; }
}
const NOW = (function () { try { return W.clock.now('test.narrativeDepth2546'); } catch (e) { return Date.now(); } })();
const LONG_A = '把这一车粮从南码头运到城北仓，沿途要过三道税卡、两处渡口，还要给押运的伙计留出脚钱和草料';
const LONG_B = '回程顺带把欠张屠户的旧账结清，余钱再添两匹粗布，剩下的交给柜上做周转';

function seed() {
  const people = {};
  for (let i = 0; i < 12; i++) {
    people['p_甲' + i] = {
      name: '甲' + i,
      life: {
        goals: [
          { id: 'g' + i, status: 'active', text: LONG_A },
          { id: 'h' + i, status: 'active', text: LONG_B }
        ],
        commitments: []
      },
      inbox: [], bonds: {}
    };
  }
  store.transact(function (d) { d.people = people; }, 'test:seed-people');
  try { W.life.setSettings({ maxPeople: 12, maxItems: 2 }); } catch (e) { /* 老宿主没有这口也能跑 */ }
}
function ctx() { return { people: ['甲0', '甲1'], place: '集市' }; }

ok('A 前置：injectCollector.buildBlock / compactTiming.plan 在场', function () {
  assert.ok(W.injectCollector && typeof W.injectCollector.buildBlock === 'function');
  assert.ok(W.compactTiming && typeof W.compactTiming.plan === 'function');
});

ok('B 缓存热 + 有折叠 ⇒ hold（不是照折）', function () {
  seed();
  W.injectCollector.setSettings({ maxChars: 400, maxItems: 2 });
  W.compactTiming.saveSettings({ foldableTrigger: 500, minMessages: 2, ttlMs: 300000, warmHoldMaxTokens: 100000 });
  store.transact(function (d) { d.lastInjection = { at: NOW - 5000 }; }, 'test:warm');
  const before = W.compactTiming.stat().plans;
  W.injectCollector.buildBlock(ctx());
  const st = W.injectCollector.stat();
  assert.ok(st.folded > 0, '本轮应有折叠，实 folded=' + st.folded);
  assert.ok(st.fold && st.fold.foldTokens >= 500, '折的量应过触发线：' + JSON.stringify(st.fold));
  assert.strictEqual(st.fold.action, 'hold', '实 ' + JSON.stringify(st.fold));
  assert.strictEqual(W.compactTiming.stat().plans, before + 1, 'plan 没被调用');
  assert.strictEqual(W.injectCollector.diagnose().fold.action, 'hold', 'diagnose().fold 与 stat().fold 不同源');
});

ok('C 缓存冷 ⇒ fold', function () {
  store.transact(function (d) { d.lastInjection = { at: NOW - 27 * 3600 * 1000 }; }, 'test:cold');
  W.injectCollector.buildBlock(ctx());
  const st = W.injectCollector.stat();
  assert.strictEqual(st.fold && st.fold.action, 'fold', '实 ' + JSON.stringify(st.fold));
});

ok('D 没有折叠 ⇒ none（不拿「没折」冒充「判过」）', function () {
  // 候选减到 4 条（life maxPeople=4, 每人 1 条），预算 12000 足够全选 ⇒ 真的没有折叠
  try { W.life.setSettings({ maxPeople: 4, maxItems: 1 }); } catch (e) {}
  W.injectCollector.setSettings({ maxChars: 12000, maxItems: 12 });
  W.injectCollector.buildBlock(ctx());
  const st = W.injectCollector.stat();
  assert.strictEqual(st.folded, 0, '实 folded=' + st.folded);
  assert.strictEqual(st.fold && st.fold.action, 'none', '实 ' + JSON.stringify(st.fold));
});

ok('E compactTiming 缺席 ⇒ fold=null 且装配不崩', function () {
  const orig = W.compactTiming;
  delete W.compactTiming;
  try {
    W.injectCollector.setSettings({ maxChars: 400, maxItems: 2 });
    W.injectCollector.buildBlock(ctx());
    assert.strictEqual(W.injectCollector.stat().fold, null);
  } finally {
    W.compactTiming = orig;
  }
});

console.log('narrative-depth-wire-2546: PASS (' + pass + ' 段：折叠时机判据真进装配，热缓存 hold / 冷 fold / 无折 none)');