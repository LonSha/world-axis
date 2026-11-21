'use strict';
/**
 * tests/narrative-depth-wire-v2544.js — 叙事深度第一批（2/3）专锁
 *
 * 锁什么：
 *   A 段：邻室隔墙窃听「听到什么」改由 lensCulling 三级裁决 ——
 *         裁汰/模糊档**不得再泄露原句词**（旧实现 partial 档隔一词插气声，仍能拼出原话）。
 *   B 段：区域突发事件抽取改走 weightedDraw ——
 *         ① 空 seen 时基数取自 item.weight（分布与旧线性抽取等价，接线不改手感）；
 *         ② 已见项不再吃 softPity，未见项照吃（长局防重复同一类）；
 *         ③ 结算侧写入 regionalSeen（写路径在 applyIncident，roll 仍只读）。
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

const A = W.spatialAcoustics;
const L = W.lensCulling;
const WD = W.weightedDraw;

ok('A0 前置：spatialAcoustics / lensCulling / weightedDraw 三个命名空间在场', function () {
  assert.ok(A && typeof A.eavesdrop === 'function');
  assert.ok(L && typeof L.cullAcousticEvent === 'function');
  assert.ok(WD && typeof WD.weightOf === 'function' && typeof WD.draw === 'function');
});

ok('A1 隔墙窃听：非 clear 档零原词、partial 仍带气声畸变标记', function () {
  A.registerPartition('r1', 'r2', { damping: 0.55, type: 'brick_wall' });
  const secret = '那批货藏在码头三号库夹层';
  A.whisper({ roomId: 'r2', speaker: '黑市商人', content: secret, volume: 'normal' });
  const eaves = A.eavesdrop({ listenerRoomId: 'r1', targetRoomId: 'r2' });
  assert.strictEqual(eaves.ok, true, 'eavesdrop 失败：' + eaves.reason);
  assert.ok(['clear', 'partial', 'inaudible'].indexOf(eaves.clarity) >= 0, 'clarity=' + eaves.clarity);
  if (eaves.clarity !== 'clear') {
    assert.ok(eaves.interceptedContent.indexOf('码头三号库') < 0,
      '非 clear 档仍泄露原词：' + eaves.interceptedContent);
    assert.ok(eaves.interceptedContent.indexOf('[微弱气声]') >= 0,
      'partial 档仍要带「断续气声」畸变标记：' + eaves.interceptedContent);
  }
});

ok('A2 eavesdrop 真调 lensCulling（计数证据；不是「字段长得像」）', function () {
  const orig = L.cullAcousticEvent;
  let calls = 0;
  L.cullAcousticEvent = function () { calls++; return orig.apply(L, arguments); };
  try {
    A.whisper({ roomId: 'r2', speaker: '账房先生', content: '账上短了三两银子', volume: 'normal' });
    const r = A.eavesdrop({ listenerRoomId: 'r1', targetRoomId: 'r2' });
    assert.strictEqual(r.ok, true, 'eavesdrop 失败：' + r.reason);
  } finally {
    L.cullAcousticEvent = orig;
  }
  assert.ok(calls >= 1, 'lensCulling.cullAcousticEvent 调用次数=' + calls);
});

const pool = [{ type: 'bandit', weight: 100 }, { type: 'plague', weight: 10 }];
function weightOf(item, seen) {
  return WD.weightOf(item, {
    rank: 'N',
    baseOf: function (x) { return x.weight; },
    idOf: function (x) { return x.type; },
    seen: { has: function () { return seen; } }
  });
}

ok('B1 空 seen：基数取自 item.weight，全员同乘补偿 ⇒ 分布不变', function () {
  const a = weightOf(pool[0], false);
  const b = weightOf(pool[1], false);
  assert.ok(a.ok && b.ok, JSON.stringify(a) + '/' + JSON.stringify(b));
  assert.strictEqual(Math.round(a.weight / b.weight * 1000), Math.round(100 / 10 * 1000));
});

ok('B2 已见项不吃 softPity：已见/未见 = 1/softPity', function () {
  const cfg = WD.settings();
  const a = weightOf(pool[0], true);
  const b = weightOf(pool[1], false);
  assert.ok(a.ok && b.ok);
  assert.strictEqual(a.weight, 100);
  assert.strictEqual(b.weight, 10 * cfg.softPity);
});

ok('B3 applyIncident 写入 regionalSeen（只留最近 8 条）', function () {
  const draft = { evolution: { round: 3, regionalSeen: ['plague'] } };
  W.regional.applyIncident(draft, { active: true, type: 'bandit', title: '山道劫掠' });
  assert.deepStrictEqual(draft.evolution.regionalSeen, ['plague', 'bandit']);
  const many = { evolution: { round: 3, regionalSeen: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] } };
  W.regional.applyIncident(many, { active: true, type: 'bandit', title: '山道劫掠' });
  assert.strictEqual(many.evolution.regionalSeen.length, 8);
  assert.strictEqual(many.evolution.regionalSeen[7], 'bandit');
});

ok('B4 regional.roll 给出表内类型，且 weightedDraw 的 draws 计数 +1（证明确实走了新路径）', function () {
  W.regional.setSettings({ enabled: true, chancePercent: 100, durationRounds: 2 });
  store.transact(function (d) { d.evolution.regionalIncident = { active: false }; }, 'test:reset-incident');
  const before = WD.stat().draws;
  const r = W.regional.roll();
  assert.ok(r && r.picked && r.picked.type, 'roll 未给出 picked：' + JSON.stringify(r));
  assert.ok(W.regional.incidentTypes.indexOf(r.picked.type) >= 0, 'picked 不在表内：' + r.picked.type);
  assert.strictEqual(WD.stat().draws, before + 1, 'regional.roll 没走 weightedDraw（draws ' + before + ' -> ' + WD.stat().draws + '）');
});

console.log('narrative-depth-wire: PASS (' + pass + ' 段：隔墙裁剪不泄原词 / 抽签补偿不改手感且记账)');
