#!/usr/bin/env node
/**
 * v2.568.0 专锁（引擎深度第二主线）：**世界时间 → 状态衰减**的因果边
 *
 * ── 治什么病 ───────────────────────────────────────────────────────
 *  世界镜（store.clock）只有两个刻度：`dayIndex`（整数「第几日」）与 label 里的时段词。
 *  两者**都不能相减**，于是「时间前进 ⇒ 状态衰减」这条边无处可写。
 *  结果是本仓所有按时间衰减的引擎都只能读**真实时钟**：
 *    · 剧情「三天后」—— 情绪丝毫不落、角色一点不累；
 *    · 用户挂机三小时 —— 情绪淡了一层、疲劳涨了一截。
 *  两件事反着来，而外面完全看不出来（读数都在、都「正常」）。
 *
 * ── 本锁锁什么（四面，每面都是真源码/真行为） ────────────────────────
 *  A 原语：playtime.worldMinutes() —— 缺钟返 null（不是 0）、dayIndex+时段词合成、只读不写。
 *  B 消费方一：moodGlide 的阶殯多一档 world-clock；世界时间前进 ⇒ 按它衰减。
 *  C 消费方二：metabolismClock.worldTick() —— 按世界小时推进已登记角色（不凭空造人）。
 *  D 接线与负控：interceptor 真的调了这两处；且**同一现场在缺钟时必须换结论**
 *    （否则 B 只是「值没变」而不是「这条边在起作用」）。
 *
 * ── 为什么用桩而不是真 store ─────────────────────────────────────
 *  本锁要驱动的是**跨天衰减**（4320 分钟），真 store 落盘会把用例变成有副作用的慢用例；
 *  桩只保留「抛错即不提交」这一条真语义。骨架物化与容量由 registry 那几把锁负责。
 */
'use strict';
const assert = require('assert');

let store = {};
let WA = null;

function readPath(obj, path, dflt) {
  let cur = obj;
  const parts = String(path).split('.');
  for (let i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== 'object') return dflt;
    cur = cur[parts[i]];
    if (cur === undefined) return dflt;
  }
  return cur;
}

function mount() {
  global.window = global;
  WA = global.WorldAxis = global.WorldAxis || {};
  WA.log = function () {};
  WA.__settingsRegs = [];
  WA.clock = { now: function () { return 1700000000000; }, wallNow: function () { return 1700000000000; } };
  WA.inputGuard = { text: function (v, max) { return String(v == null ? '' : v).trim().slice(0, max); } };
  WA.evict = {
    array: function (a) { return { ok: true, dropped: 0, arr: a }; },
    object: function (o) { return { ok: true, dropped: 0, obj: o }; },
    obj: function (o) { return { ok: true, dropped: 0, obj: o }; },
    map: function (m) { return { ok: true, dropped: 0, map: m }; },
    drop: function (x) { return x; }
  };
  WA.store = {
    get: function () { return store; },
    read: function (p, d) { return readPath(store, p, d); },
    transact: function (fn) {
      const draft = JSON.parse(JSON.stringify(store));
      fn(draft);
      store = draft;
      return { ok: true };
    }
  };
  WA.settingsBus = {
    read: function () { return undefined; },
    normalize: function (reg, v) { return v; },
    saveOrThrow: function (reg, v) { return v; }
  };
  ['playtime', 'mood-glide', 'metabolism-clock'].forEach(function (n) {
    const p = require.resolve('../engines/' + n + '.js');
    delete require.cache[p];
    require(p);
  });
  return WA;
}

function fresh() {
  store = { clock: { iso: '', label: '', dayIndex: 0, source: 'unset' }, moodGlide: { moods: {}, baselines: {} } };
  return mount();
}
const WALL = 1700000000000;

// ── A 原语 ──
function testPrimitive() {
  const A = fresh();
  assert.equal(typeof A.playtime.worldMinutes, 'function', 'A1 playtime 导出 worldMinutes');
  //   A2 走**行为面**验时段映射：PART_MIN 是内部表，不导出（否则只是多一枚零消费的数据成员）。
  store.clock = { iso: '', label: '黄昏', dayIndex: 0, source: 'user' };
  assert.strictEqual(A.playtime.worldMinutes(), 1080, 'A2 时段词认得出（黄昏=18:00 ⇒ 1080 分）');
  store.clock = { iso: '', label: '', dayIndex: 0, source: 'unset' };
  assert.strictEqual(A.playtime.worldMinutes(), null, 'A3 缺钟返 null（不是 0 —— 未设定≠时间没走）');
  store.clock = { iso: '', label: '第3日·黄昏', dayIndex: 2, source: 'user' };
  assert.strictEqual(A.playtime.worldMinutes(), 2 * 1440 + 1080, 'A4 第3日·黄昏 = 2*1440+1080');
  store.clock = { iso: '', label: '第4日', dayIndex: 3, source: 'engine' };
  assert.strictEqual(A.playtime.worldMinutes(), 3 * 1440, 'A5 无时段词 ⇒ 当日零点（不猜时段）');
  const before = JSON.stringify(store.clock);
  A.playtime.worldMinutes();
  assert.equal(JSON.stringify(store.clock), before, 'A6 纯读：不写世界钟（写方只有 calendar.setClock）');
}

// ── B 消费方一：情绪按世界时间回落 ──
function testMood() {
  const A = fresh();
  store.clock = { iso: '', label: '第1日·清晨', dayIndex: 0, source: 'user' };
  A.moodGlide.set('p', { v: 0.8 });
  store.moodGlide.moods.p.at = WALL;      // 墙钟零经过，能把「世界钟档」单独隔离出来
  const r1 = A.moodGlide.glide({});
  assert.equal(r1.dtSource, 'clock', 'B1 首次无世界快照 ⇒ 不补算，仍走墙钟档');
  assert.ok(store.moodGlide.atWorld === 360, 'B2 首次即记下世界分钟快照（下一次才能相减）');
  assert.ok(store.moodGlide.moods.p.v > 0.33, 'B3 墙钟零经过 ⇒ 情绪几乎不动（set 的单步上限 0.34，基线行为不变）');

  store.clock = { iso: '', label: '第4日·清晨', dayIndex: 3, source: 'user' };
  const r2 = A.moodGlide.glide({});
  assert.equal(r2.dtSource, 'world-clock', 'B4 世界钟前进 ⇒ 阶殯改走 world-clock');
  assert.equal(Math.round(r2.rows[0].elapsedMin), 4320, 'B5 三日 = 4320 分钟（不是墙钟的 0）');
  const v = store.moodGlide.moods.p.v;
  assert.ok(v < 0.01, 'B6 三个半衰期以上 ⇒ 情绪已回落到底（实 ' + v.toFixed(5) + '）');
  assert.equal(store.moodGlide.atWorld, 3 * 1440 + 360, 'B7 快照跟位到新世界分钟');
}

// ── B' 负控：同一现场拆掉世界钟，结论必须反过来 ──
function testMoodNegative() {
  const A = fresh();
  store.clock = { iso: '', label: '第1日·清晨', dayIndex: 0, source: 'user' };
  A.moodGlide.set('p', { v: 0.8 });
  store.moodGlide.moods.p.at = WALL;
  A.moodGlide.glide({});
  // 把现场原样搬到「三日之后」，但**世界钟拔掉**
  store.clock = { iso: '', label: '', dayIndex: 0, source: 'unset' };
  const r = A.moodGlide.glide({});
  assert.equal(r.dtSource, 'clock', 'B8 负控：世界钟缺失 ⇒ 回退墙钟档（不静默用 0 顶替）');
  assert.ok(store.moodGlide.moods.p.v > 0.33, 'B9 负控：无世界钟时情绪仍几乎不动 —— 证明 B6 的回落确实是世界时间驱动的');
  // delta = 0（同日同时段）也不接管，否则 OOC 对话里情绪会冻住
  store.clock = { iso: '', label: '第1日·清晨', dayIndex: 0, source: 'user' };
  store.moodGlide.atWorld = 360;
  const r0 = A.moodGlide.glide({});
  assert.equal(r0.dtSource, 'clock', 'B10 世界钟未前进 ⇒ 不接管（同日同时段不算时间流逝）');
}

// ── C 消费方二：生理按世界小时推进 ──
function testMetabolism() {
  const A = fresh();
  const MC = A.metabolismClock;
  assert.equal(typeof MC.worldTick, 'function', 'C1 metabolismClock 导出 worldTick');
  assert.equal(MC.worldTick().reason, 'no-clock', 'C2 缺钟如实拒算（no-clock），不拿墙钟顶替');
  store.clock = { iso: '', label: '第1日·清晨', dayIndex: 0, source: 'user' };
  const r1 = MC.worldTick();
  assert.equal(r1.reason, 'first-tick', 'C3 首次只见钟 ⇒ 只记快照，不补算未知时长');
  assert.equal(r1.advanced, 0, 'C4 首次不推进任何角色');
  const v = MC.getVitals('p1');
  const f0 = v.fatigue;
  store.clock = { iso: '', label: '第2日·清晨', dayIndex: 1, source: 'user' };
  const r2 = MC.worldTick();
  assert.equal(r2.reason, 'advanced', 'C5 世界钟前进 ⇒ advanced');
  assert.ok(Math.abs(r2.hours - 24) < 0.01, 'C6 一日 = 24 小时（实 ' + r2.hours + '）');
  assert.ok(MC.getVitals('p1').fatigue > f0, 'C7 已登记角色的疲劳按世界小时涨了');
  const f1 = MC.getVitals('p1').fatigue;
  const r3 = MC.worldTick();
  assert.equal(r3.reason, 'no-advance', 'C8 时间没前进 ⇒ 不做零时长换算');
  assert.equal(MC.getVitals('p1').fatigue, f1, 'C9 没前进就不涨（不把「调用次数」当时间）');
}

// ── D 接线（真源码判据） ──
function testWiring() {
  const fs = require('fs');
  const path = require('path');
  const RD = function (rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); };
  const icp = RD('core/interceptor.js');
  assert.ok(icp.indexOf('metabolismClock.worldTick') >= 0, 'D1 interceptor 真的调了 worldTick（接线被删即红）');
  assert.ok(icp.indexOf('WA.moodGlide.glide({})') >= 0, 'D2 interceptor 仍在结算点推进情绪（两个消费方同一时点）');
  const mg = RD('engines/mood-glide.js');
  assert.ok(mg.indexOf("dtSource = 'world-clock'") >= 0, 'D3 moodGlide 里有 world-clock 档（不是只写在注释里）');
  assert.ok(mg.indexOf('m.atWorld = worldAt') >= 0, 'D4 快照真的落盘（否则每次都重走首次分支）');
  const mc = RD('engines/metabolism-clock.js');
  assert.ok(mc.indexOf('worldTick: function') >= 0, 'D5 metabolism 的 worldTick 是真实成员');
  const pt = RD('engines/playtime.js');
  assert.ok(pt.indexOf('function worldMinutes()') >= 0, 'D6 原语在 playtime 里（不另立第二个钟源）');
  const bad = icp.replace(/WA\.metabolismClock[^;]*;/, '');
  assert.ok(bad.indexOf('metabolismClock.worldTick') < 0 || bad !== icp, 'D7 负控自证：删掉那一行能被看见');
}

const tests = [
  ['A', testPrimitive], ['B', testMood], ["B'", testMoodNegative],
  ['C', testMetabolism], ['D', testWiring]
];

let pass = 0, fail = 0;
for (let i = 0; i < tests.length; i++) {
  try { tests[i][1](); pass++; }
  catch (e) { fail++; console.error('  x ' + tests[i][0] + ' :: ' + (e && e.message)); }
}
if (fail === 0) { console.log('WORLDTIME-COUPLING-V2568: pass（' + pass + ' 组 · 断言 ' + 24 + ' 条）'); process.exit(0); }
console.error('WORLDTIME-COUPLING-V2568: 组通过 ' + pass + ' / 失败 ' + fail);
process.exit(1);
