'use strict';
/**
 * tests/narrative-depth-wire-v2548.js — 引擎深度第五批专锁（冷落三分级 + 追人上限 + 轻提真落账）
 *
 * 锁什么（三条判据，全部有产品读点）：
 *   A 冷落分级：静默时长 → light / medium / heavy（三档下界可配、必须单调），并随 due 返回。
 *   B 追人上限：同一对象累计 fire 到 chaseCap 次 ⇒ due 一律 chase-cap（冷战收敛，不再无限追）。
 *   C 轻提真落账：buildBlock 按 resolveIntervention 的结论写分级措词，并在真要提时 fire；
 *     于是 due 的「今天已提过 / 每日上限」两道闸第一次有账可判（此前两处都零产品调用）。
 *
 * 为什么这三条要一起锁：分级若没有词面落点就只是读数；上限若没有 fire 落账就永远 count=0；
 *   fire 若没有落账点，两道日闸在生产里恒真——三条是一条链，缺一段就等于没接。
 *
 * 负控（人工做，做完还原，md5 会回到基线）：
 *   ① 把 due 里的 chase 判据删掉 ⇒ B1 红；
 *   ② 把 buildBlock 里的 fire 那行删掉 ⇒ D1 红；
 *   ③ 把 buildBlock 里 level→措词的映射写死 light ⇒ E 红。
 */
const assert = require('assert');
const env = require('./ui-gate-sync.js').fresh();
const W = env.WA;
const store = W.store;
store.init();
const SP = W.spotlight;
const FG = W.followupGate;
const NOW = (function () { try { return W.clock.now('test.narrativeDepth2548'); } catch (e) { return Date.now(); } })();
const DAY = 86400000;

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' :: ' + e.message); throw e; }
}
function setRows(rows) {
  store.transact(function (d) { d.spotlight = { rows: rows, pending: [] }; }, 'test:spotlight-rows');
}
function freshGate(patch) {
  FG.saveSettings(Object.assign({ enabled: true, dnd: false, idleThreshold: 300, hoursFrom: 0, hoursTo: 24,
    perDayCap: 9, chaseCap: 4, mediumAt: 1440, heavyAt: 4320 }, patch || {}));
  store.transact(function (d) { d.followupGate = { items: {}, days: {} }; }, 'test:gate-reset');
}
function bookOf(who) {
  const s = store.get() || {};
  const it = (s.followupGate && s.followupGate.items) || {};
  return it[who] || null;
}

ok('A0 前置：due / buildBlock / fire 都在场', function () {
  assert.ok(FG && typeof FG.due === 'function', 'followupGate.due 缺席');
  assert.ok(SP && typeof SP.buildBlock === 'function', 'spotlight.buildBlock 缺席');
  assert.ok(FG && typeof FG.fire === 'function', 'followupGate.fire 缺席');
});

function levelAt(minutes) {   // 走公开路径：读 due().level，不直接抔内部函数
  const r = FG.due({ item: '分级探针', idleMinutes: minutes, at: NOW });
  return r.level;
}
ok('A1 冷落分级：1439 轻 / 1440 中 / 4319 中 / 4320 重（下界含等号）', function () {
  freshGate();
  assert.strictEqual(levelAt(299), 'light');
  assert.strictEqual(levelAt(1439), 'light');
  assert.strictEqual(levelAt(1440), 'medium');
  assert.strictEqual(levelAt(4319), 'medium');
  assert.strictEqual(levelAt(4320), 'heavy');
  assert.strictEqual(levelAt(999999), 'heavy');
});

ok('A2 下界相等：重档接管中档（空档如实告知，不假装中档存在）', function () {
  freshGate({ mediumAt: 600, heavyAt: 60 });
  assert.strictEqual(levelAt(599), 'light', '轻档下界不受影响');
  assert.strictEqual(levelAt(600), 'heavy', '两个下界相等 ⇒ 重档接管（中档为空档）');
  const v = FG.view();
  assert.strictEqual(v.mediumAt, 600, 'view 应如实报配置（可核为什么中档收不到）');
  assert.strictEqual(v.heavyAt, 600, 'heavyAt 已被抬到 mediumAt');
});

ok('A3 due 把 level 一起返回（读数随判据同源，不另算一份）', function () {
  freshGate();
  const r = FG.due({ item: '阿福', idleMinutes: 2000, at: NOW });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.level, 'medium', JSON.stringify(r));
  assert.strictEqual(r.chase, 0, JSON.stringify(r));
});

ok('B1 追人上限：同一人跨 4 天各追一次 ⇒ 第 5 天 due 报 chase-cap', function () {
  freshGate({ chaseCap: 4 });
  const base = Date.UTC(2026, 0, 1, 12, 0, 0);
  for (let i = 0; i < 4; i++) {
    const r = FG.fire('阿福', base + i * DAY);
    assert.strictEqual(r.ok, true, '第 ' + (i + 1) + ' 次 fire 应成功：' + JSON.stringify(r));
  }
  assert.strictEqual(bookOf('阿福').count, 4, '累计次数应如实记 4');
  const d = FG.due({ item: '阿福', idleMinutes: 5000, at: base + 5 * DAY });
  assert.strictEqual(d.ok, false, '追满 4 次后不该再放行：' + JSON.stringify(d));
  assert.strictEqual(d.reason, 'chase-cap', JSON.stringify(d));
  assert.strictEqual(d.chase, 4);
});

ok('B2 上限可配：chaseCap=1 时第一次之后就收（冷战一轮即停）', function () {
  freshGate({ chaseCap: 1 });
  const base = Date.UTC(2026, 1, 1, 12, 0, 0);
  assert.strictEqual(FG.fire('阿珍', base).ok, true);
  const d = FG.due({ item: '阿珍', idleMinutes: 5000, at: base + DAY });
  assert.strictEqual(d.reason, 'chase-cap', JSON.stringify(d));
});

ok('B3 追人上限排在时段之前：不在窗内也先报 chase-cap（不是拿时段当借口）', function () {
  freshGate({ chaseCap: 1, hoursFrom: 3, hoursTo: 4 });
  const base = Date.UTC(2026, 2, 1, 12, 0, 0);
  FG.fire('阿珍', base);
  const d = FG.due({ item: '阿珍', idleMinutes: 5000, at: base + DAY });   // 12 点，不在 3–4 点窗内
  assert.strictEqual(d.reason, 'chase-cap', JSON.stringify(d));
});

ok('C1 轻提分级落进注入块：久缺 ⇒ 出现「顺口提一句」行', function () {
  freshGate();
  setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 400 * 60000 }]);
  const blk = SP.buildBlock();
  assert.ok(blk.indexOf('顺口提一句：阿福') >= 0, '块里应有轻提行：\n' + blk);
  assert.ok(blk.indexOf('久未登场：阿福') >= 0, '原有读数行不该被挤掉：\n' + blk);
});

ok('C2 静默不够长：块里只有读数行、没有轻提行（闸真在判）', function () {
  freshGate();
  setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 10 * 60000 }]);
  const blk = SP.buildBlock();
  assert.ok(blk.indexOf('久未登场：阿福') >= 0, blk);
  assert.ok(blk.indexOf('顺口提一句') < 0, '刚见过的人不该被顺口带一句：\n' + blk);
});

ok('D1 fire 真落账：构建一次注入块 ⇒ 当日账里多一条（fire 的第一个产品消费者）', function () {
  freshGate();
  setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 400 * 60000 }]);
  assert.strictEqual(bookOf('阿福'), null, '前置：账上本来没有这条');
  SP.buildBlock();
  const row = bookOf('阿福');
  assert.ok(row, '构建后应有落账：' + JSON.stringify(store.get().followupGate));
  assert.strictEqual(row.count, 1);
  const d = FG.due({ item: '阿福', idleMinutes: 5000, at: NOW });
  assert.strictEqual(d.reason, 'already-today', '落账后同日再判应 already-today：' + JSON.stringify(d));
});

ok('D2 日上限真生效：perDayCap=1 ⇒ 第二个人当天不再被提（这条闸此前恒空转）', function () {
  freshGate({ perDayCap: 1 });
  setRows([
    { who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 400 * 60000 },
    { who: '阿珍', seen: 1, missed: 9, streak: 0, at: NOW - 400 * 60000 }
  ]);
  const first = SP.buildBlock();
  assert.ok(first.indexOf('阿珍') >= 0, 'missed 更大的先提：\n' + first);
  assert.strictEqual(bookOf('阿珍').count, 1);
  const second = SP.buildBlock();
  assert.ok(second.indexOf('顺口提一句') < 0, '日额度用完后不该再有轻提行：\n' + second);
  assert.ok(second.indexOf('久未登场') >= 0, '读数行仍在（拒的是轻提，不是读数）：\n' + second);
});

ok('E 三分级措词：heavy ⇒ 「暂不打扰」（久断联的人不再主动开口）', function () {
  freshGate({ mediumAt: 60, heavyAt: 120 });
  setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 400 * 60000 }]);
  const blk = SP.buildBlock();
  assert.ok(blk.indexOf('暂不打扰：阿福') >= 0, '400 分钟在 heavy 档应写「暂不打扰」：\n' + blk);
  assert.ok(blk.indexOf('顺口提一句') < 0, blk);
});

ok('F followupGate 缺席：退回旧行为（仍出轻提行、不崩、不落账）', function () {
  const orig = W.followupGate;
  delete W.followupGate;
  try {
    setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 10 * 60000 }]);
    const blk = SP.buildBlock();
    assert.ok(blk.indexOf('顺口提一句：阿福') >= 0, '闸门缺席时应退回「只按 missed 轻提」：\n' + blk);
  } finally {
    W.followupGate = orig;
  }
});

ok('G 零副作用：buildBlock 不写 spotlight.rows（读数行不因构建而改）', function () {
  freshGate();
  setRows([{ who: '阿福', seen: 1, missed: 6, streak: 0, at: NOW - 400 * 60000 }]);
  const before = JSON.stringify((store.get().spotlight || {}).rows);
  SP.buildBlock();
  const after = JSON.stringify((store.get().spotlight || {}).rows);
  assert.strictEqual(after, before, '构建不该改登场账：' + before + ' -> ' + after);
});

console.log('\nnarrative-depth-wire-2548: pass (' + pass + ' 段：冷落三分级 / 追人上限 / 轻提真落账)');
