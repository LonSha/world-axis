#!/usr/bin/env node
'use strict';
/**
 * tests/appointment-quota-v2562.js —— 「约期注入名额」分配判据专锁（v2.562.0）
 *
 * 治的缺口（本文件存在的唯一理由）：`engines/appointment.js` 的 `buildBlock()`。
 *
 *   旧写法把「筛候选」和「数名额」塞进**同一个双重循环**：
 *
 *       Object.keys(m).forEach(k => list(m[k]).forEach(x => {
 *         if (!x || x.result !== '未到') return;
 *         if (lines.length >= 3) return;      // ← 名额一满，后面所有候选连看都不看
 *         if (x.from - r > 3) return;
 *         lines.push(...);
 *       }));
 *
 *   于是名额由**遍历顺序**决定：`Object.keys(actors)` 的注册顺序 × 每人 `appointments`
 *   的追加顺序。先登记的远期约永久占位。
 *
 *   这是在治的第九处「按序截断」，但后果比前八处都直接：
 *   约期不是清单，是**下一轮就要照着做的事**。
 *
 *   实测（/tmp/probe562.js，改造前）：
 *     · s1  同一个人 4 条：3 条 r+3、1 条 r+1 ⇒ 列出「码头/茶馆/广场」（三条 r+3），
 *          而「议事厅（下一轮）」**一个字都没有** —— 模型会让人物无缘无故不去。
 *     · s2  两个人的同一局面 ⇒ 一样（后注册的人整体被饿死）
 *     · s5  `from = r-2`：**已经过了轮次**却仍是「未到」（最紧急的一类）⇒ 同样被挤掉
 *     · s7  `stat().block` 不存在 ⇒「从没构建过」与「构建过但一条都没有」同形
 *     · s8  同 from 的 4 条 ⇒ 按数组顺序取前 3，换个插入顺序结论就变（不可复算）
 *
 * 本批做的四件事：
 *   ① 候选与名额分开：候选只按「未到 + 视野内（from-r <= 3）」筛，**不看名额**；
 *   ② `pickBlock`：名额够就原样返回；不够按 `from` 升序（最近要发生的先，已过轮的排最前）
 *      → 同 from 按 `to` → 同 from/to 按 `place` 字典序 → 再按 `id`（可复算）；
 *   ③ 两个硬上限提成具名常量 `BLOCK_QUOTA` / `BLOCK_HORIZON`（此前是两处散落的字面量 3），
 *      并写明**刻意不进设置面**（准入面不是旋钮）；
 *   ④ 读数进 `stat().block`（`candidates / picked / quota / horizon / dueNow / mode`）；
 *      `stat()` 的浅拷贝必须**单独再拷 block**。`tool-diag` 新增 `secAppointment` 作真读者
 *      （只读 stat/getSettings，**不调 buildBlock**）。
 *
 * 判据结构：
 *   A 静态（旧写法消失 / 判据只有一个正身 / 两个常量在位 / 四条排序键齐 / 读数六栏 /
 *          拷贝在位 / 诊断节在位且不调 buildBlock / 候选收集不看名额）
 *   B 行为（下一轮的进得来 / 跨人物 / 已过轮的最急 / 名额够顺序不变 / 视野判据不变 /
 *          已结案不占名额 / 同刻可复算 / 换个插入顺序结论不变 / buildBlock 只读）
 *   C 读数（六栏 / 三态 / 拷贝 / candidates≠picked / 没构建过 vs 空表 / dueNow）
 *   N 四条负控（真源码破坏：改回按遍历顺序 ⇒ B1+B3 红；排序反向 ⇒ B1 红；
 *              删掉 place 字典序 ⇒ B8b 红；block 不拷贝 ⇒ C3 红）
 *
 * 单独跑：node tests/appointment-quota-v2562.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/appointment.js';
let pass = 0, fail = 0;
const fails = [];
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function stripComment(line) {
  const t = line.trim();
  if (t.indexOf('/*') === 0 || t.indexOf('*') === 0) return '';
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}
function codeOnly(text) { return text.split('\n').map(stripComment).join('\n'); }
const SRC = rd(REL);
const CODE = codeOnly(SRC);
const NOW = 1700000000000;

/** 装载：真 vm + 最小 WA。`code` 可传破坏副本。 */
function load(code, actors, roundNow) {
  let cfg = { enabled: true, maxPerActor: 8, lateGrace: 1 };
  const store = { actors: actors || {} };
  const WA = {
    clock: { now: function () { return NOW; } },
    evolution: { roundOf: function () { return roundNow; } },
    store: {
      get: function () { return store; },
      transact: function (fn) { const r = fn(store); return { ok: r !== false }; }
    },
    settingsBus: {
      read: function () { return cfg; },
      normalize: function (r, v) { return v; },
      saveOrThrow: function (r, v) { cfg = v; return { ok: true }; }
    },
    registerModule: function () {}
  };
  require('./synth-host.js').hostStub(WA);
  const win = { WorldAxis: WA };
  vm.runInNewContext(code, { window: win, Date: Date, Number: Number, String: String, Array: Array,
    Object: Object, isFinite: isFinite, Math: Math, JSON: JSON, RegExp: RegExp, parseInt: parseInt },
    { filename: REL });
  return { api: win.WorldAxis.appointment, store: store, host: WA };
}
function ap(id, place, from, to, result) {
  return { id: id, who: '甲', withWhom: '乙', place: place, from: from, to: to || (from + 2),
    expect: '', result: result || '未到', createdAt: NOW, createdRound: 0 };
}
function actor(id, name, list) { return { id: id, name: name, appointments: list }; }
function placesIn(b) {
  if (!b) return [];
  return b.split('\n').filter(function (l) { return l.indexOf('- ') === 0; })
    .map(function (l) { const m = /约在([^（]+)（/.exec(l); return m ? m[1] : null; })
    .filter(function (x) { return x; });
}
/** 主局面1：同一个人 3 条 r+3 + 1 条 r+1。 */
function s1Actors() {
  return { jia: actor('jia', '甲', [ap('a1', '码头', 13, 15), ap('a2', '茶馆', 13, 15),
    ap('a3', '广场', 13, 15), ap('a4', '议事厅', 11, 12)]) };
}
/** 主局面2：甲 3 条 r+3，乙 1 条 r+1。 */
function s2Actors() {
  return { jia: actor('jia', '甲', [ap('a1', '码头', 13, 15), ap('a2', '茶馆', 13, 15), ap('a3', '广场', 13, 15)]),
    yi: actor('yi', '乙', [ap('b1', '议事厅', 11, 12)]) };
}
/** 主局面3：3 条 r+3 + 1 条**已过轮**（from = r-2）。 */
function s5Actors() {
  return { jia: actor('jia', '甲', [ap('a1', '码头', 13, 15), ap('a2', '茶馆', 13, 15),
    ap('a3', '广场', 13, 15), ap('a4', '议事厅', 8, 9)]) };
}
/** 主局面4：4 条同 from 同 to（只能靠 place/id 定序）。 */
function s8Actors() {
  return { jia: actor('jia', '甲', [ap('a1', '码头', 13, 15), ap('a2', '茶馆', 13, 15),
    ap('a3', '广场', 13, 15), ap('a4', '议事厅', 13, 15)]) };
}

/** 核心判据集：真源码与破坏副本各跑一遍。返回空数组 = 全过。 */
function quotaProblems(code) {
  const bad = [];
  // B1 下一轮就要赴的约必须进得来，且排第一
  {
    const A = load(code, s1Actors(), 10);
    const got = placesIn(A.api.buildBlock());
    if (got.length !== 3) bad.push('B1 条数应为配额 3（实 ' + got.length + '）');
    if (got.indexOf('议事厅') < 0) bad.push('B1 「下一轮」的那条必须进（实 ' + JSON.stringify(got) + '）');
    if (got[0] !== '议事厅') bad.push('B1 最近要发生的应排第一（实 ' + got[0] + '）');
  }
  // B2 跨人物：后注册的人不该整体饿死
  {
    const A = load(code, s2Actors(), 10);
    const got = placesIn(A.api.buildBlock());
    if (got.indexOf('议事厅') < 0) bad.push('B2 乙的下一轮约必须进（实 ' + JSON.stringify(got) + '）');
  }
  // B3 已经过了轮次（from < r）却仍未结算 —— 最紧急的一类，必须排最前
  {
    const A = load(code, s5Actors(), 10);
    const got = placesIn(A.api.buildBlock());
    if (got.indexOf('议事厅') < 0) bad.push('B3 已过轮未结算的约必须进（实 ' + JSON.stringify(got) + '）');
    if (got[0] !== '议事厅') bad.push('B3 已过轮的应排第一（实 ' + got[0] + '）');
  }
  // B8 同刻（from/to 都相同）必须可复算：按 place 字典序（广场 < 码头 < 茶馆）
  {
    const A = load(code, s8Actors(), 10);
    const got = placesIn(A.api.buildBlock());
    if (JSON.stringify(got) !== JSON.stringify(['广场', '码头', '茶馆'])) {
      bad.push('B8 同刻应取 place 字典序前三（实 ' + JSON.stringify(got) + '）');
    }
  }
  // B8b 换个插入顺序，同刻结论不变
  {
    const rev = { jia: actor('jia', '甲', s8Actors().jia.appointments.slice().reverse()) };
    const A = load(code, rev, 10);
    const got = placesIn(A.api.buildBlock());
    if (JSON.stringify(got) !== JSON.stringify(['广场', '码头', '茶馆'])) {
      bad.push('B8b 结论依赖数组顺序 ⇒ 不可复算（实 ' + JSON.stringify(got) + '）');
    }
  }
  return bad;
}

console.log('appointment-quota-v2562 —— 约期注入名额（v2.562.0）');

// ═══════════════ A 静态 ═══════════════
ok('A1 旧写法（循环里数名额、满了就跳过后续候选）已消失', function () {
  assert.strictEqual(CODE.indexOf('lines.length >= 3'), -1);
  assert.strictEqual(CODE.indexOf('x.from - r > 3'), -1);
});
ok('A2 名额判据只有一个正身：pickBlock 定义一处、调用一处', function () {
  assert.strictEqual(CODE.split('function pickBlock').length - 1, 1);
  assert.strictEqual(CODE.split('= pickBlock(cand)').length - 1, 1);
});
ok('A3 两个硬上限提成具名常量，且各自只有一处定义', function () {
  assert.strictEqual(CODE.split('const BLOCK_QUOTA = 3;').length - 1, 1);
  assert.strictEqual(CODE.split('const BLOCK_HORIZON = 3;').length - 1, 1);
});
ok('A4 四条排序键齐：from → to → place → id', function () {
  const i = CODE.indexOf('function pickBlock');
  const seg = CODE.slice(i, i + 900);
  ['a.row.from', 'a.row.to', 'a.row.place', 'a.row.id'].forEach(function (k) {
    assert.ok(seg.indexOf(k) > 0, '缺排序键 ' + k);
  });
});
ok('A5 名额够时短路在前（先判名额，再排序）', function () {
  const i = CODE.indexOf('function pickBlock');
  const seg = CODE.slice(i, i + 900);
  const short = seg.indexOf('cand.length <= BLOCK_QUOTA');
  const sort = seg.indexOf('.sort(byWhen)');
  assert.ok(short > 0 && sort > 0 && short < sort);
});
ok('A6 候选收集不看名额（只按未到 + 视野筛）', function () {
  const i = CODE.indexOf('const cand = [];');
  const j = CODE.indexOf('const picked = pickBlock(cand);');
  assert.ok(i > 0 && j > i);
  const seg = CODE.slice(i, j);
  assert.ok(seg.indexOf('未到') > 0, '必须筛未结算');
  assert.ok(seg.indexOf('BLOCK_HORIZON') > 0, '必须筛视野');
  assert.strictEqual(seg.indexOf('BLOCK_QUOTA'), -1, '候选收集里不许出现名额（那正是旧写法的事故点）');
});
ok('A7 读数六栏齐', function () {
  ['candidates', 'picked', 'quota', 'horizon', 'dueNow', 'mode'].forEach(function (k) {
    assert.ok(CODE.indexOf(k + ':') > 0, '缺读数栏 ' + k);
  });
});
ok('A8 stat 初始 block 是 null，且 stat() 单独再拷一份', function () {
  assert.ok(/block: null \};/.test(CODE), 'stat 初值必须是 null');
  assert.ok(/block: stat\.block \? Object\.assign\(\{\}, stat\.block\) : null/.test(CODE),
    'stat() 必须交回 block 的拷贝');
});
ok('A9 tool-diag 新增 secAppointment，接了 collect()，且不调 buildBlock', function () {
  const T = codeOnly(rd('engines/tool-diag.js'));
  const i = T.indexOf('function secAppointment');
  assert.ok(i > 0, '缺 secAppointment');
  const seg = T.slice(i, i + 1600);
  assert.ok(seg.indexOf('block: st.block || null') > 0, '诊断节必须带 block');
  assert.strictEqual(seg.indexOf('buildBlock'), -1, '诊断节不许调 buildBlock（零副作用）');
  assert.ok(T.indexOf('appointment: secAppointment()') > 0, '必须接进 collect()');
});

// ═══════════════ B 行为 ═══════════════
ok('B1 下一轮就要赴的约挤进来并排第一（旧版里它一个字都没有）', function () {
  const A = load(CODE, s1Actors(), 10);
  assert.deepStrictEqual(placesIn(A.api.buildBlock()), ['议事厅', '广场', '码头']);
});
ok('B2 后注册的人不再整体饿死', function () {
  const A = load(CODE, s2Actors(), 10);
  const got = placesIn(A.api.buildBlock());
  assert.ok(got.indexOf('议事厅') >= 0, '实 ' + JSON.stringify(got));
});
ok('B3 已经过了轮次还没结算的约排最前', function () {
  const A = load(CODE, s5Actors(), 10);
  const got = placesIn(A.api.buildBlock());
  assert.strictEqual(got[0], '议事厅');
});
ok('B4 名额够时顺序完全不变（行为零变化）', function () {
  const actors = { jia: actor('jia', '甲', [ap('a1', '码头', 13, 15), ap('a2', '茶馆', 11, 12)]) };
  const A = load(CODE, actors, 10);
  assert.deepStrictEqual(placesIn(A.api.buildBlock()), ['码头', '茶馆']);
});
ok('B5 视野判据不变：r+4 不进、r+3 进', function () {
  const actors = { jia: actor('jia', '甲', [ap('a1', '码头', 14, 16), ap('a2', '茶馆', 13, 15)]) };
  const A = load(CODE, actors, 10);
  assert.deepStrictEqual(placesIn(A.api.buildBlock()), ['茶馆']);
});
ok('B6 已结案的约（到场/迟到/失约）不占名额', function () {
  const actors = { jia: actor('jia', '甲', [ap('a1', '码头', 13, 15, '到场'),
    ap('a2', '茶馆', 13, 15, '失约'), ap('a3', '广场', 11, 12)]) };
  const A = load(CODE, actors, 10);
  assert.deepStrictEqual(placesIn(A.api.buildBlock()), ['广场']);
});
ok('B8 同刻按 place 字典序，可复算', function () {
  const A = load(CODE, s8Actors(), 10);
  assert.deepStrictEqual(placesIn(A.api.buildBlock()), ['广场', '码头', '茶馆']);
});
ok('B8b 换个插入顺序，同刻结论不变', function () {
  const rev = { jia: actor('jia', '甲', s8Actors().jia.appointments.slice().reverse()) };
  const A = load(CODE, rev, 10);
  assert.deepStrictEqual(placesIn(A.api.buildBlock()), ['广场', '码头', '茶馆'],
    '结论依赖数组顺序 ⇒ 不可复算');
});
ok('B9 buildBlock 是只读的：不改 result、不改数组顺序', function () {
  const A = load(CODE, s5Actors(), 10);
  const before = JSON.stringify(A.store.actors);
  A.api.buildBlock(); A.api.buildBlock();
  assert.strictEqual(JSON.stringify(A.store.actors), before, '选材不许改世界状态');
});
ok('B10 主判据集在真源码上全过', function () {
  const bad = quotaProblems(CODE);
  assert.deepStrictEqual(bad, [], bad.join(' | '));
});

// ═══════════════ C 读数 ═══════════════
ok('C1 读数六栏在名位、是数字，mode = nearest-first', function () {
  const A = load(CODE, s1Actors(), 10);
  A.api.buildBlock();
  const b = A.api.stat().block;
  assert.ok(b && typeof b === 'object');
  assert.strictEqual(b.candidates, 4);
  assert.strictEqual(b.picked, 3);
  assert.strictEqual(b.quota, 3);
  assert.strictEqual(b.horizon, 3);
  assert.strictEqual(b.dueNow, 0);
  assert.strictEqual(b.mode, 'nearest-first');
});
ok('C2 三态可分辨：empty / all-fit / nearest-first', function () {
  const e = load(CODE, {}, 10);
  e.api.buildBlock();
  assert.strictEqual(e.api.stat().block.mode, 'empty');
  const f = load(CODE, { jia: actor('jia', '甲', [ap('a1', '码头', 11, 12)]) }, 10);
  f.api.buildBlock();
  assert.strictEqual(f.api.stat().block.mode, 'all-fit');
  const n = load(CODE, s1Actors(), 10);
  n.api.buildBlock();
  assert.strictEqual(n.api.stat().block.mode, 'nearest-first');
});
ok('C3 block 是拷贝：外部改返回值不污染下一次读数', function () {
  const A = load(CODE, s1Actors(), 10);
  A.api.buildBlock();
  const s1 = A.api.stat();
  s1.block.picked = 999;
  assert.strictEqual(A.api.stat().block.picked, 3, 'stat() 必须每次都交回新的 block 拷贝');
});
ok('C4 candidates ≠ picked（两者恒等说明名额是假读数）', function () {
  const A = load(CODE, s1Actors(), 10);
  A.api.buildBlock();
  const b = A.api.stat().block;
  assert.notStrictEqual(b.candidates, b.picked);
});
ok('C5 「从没构建过」与「构建过但空表」分得开', function () {
  const never = load(CODE, {}, 10);
  assert.strictEqual(never.api.stat().block, null);
  const built = load(CODE, {}, 10);
  assert.strictEqual(built.api.buildBlock(), '');
  const b = built.api.stat().block;
  assert.ok(b && typeof b === 'object');
  assert.strictEqual(b.picked, 0);
  assert.strictEqual(b.mode, 'empty');
});
ok('C6 dueNow 只数「已经到轮次却没结算」的（from <= r）', function () {
  const A = load(CODE, s5Actors(), 10);
  A.api.buildBlock();
  assert.strictEqual(A.api.stat().block.dueNow, 1, 's5 里只有议事厅(from=8) 已过轮');
  const B = load(CODE, s1Actors(), 10);
  B.api.buildBlock();
  assert.strictEqual(B.api.stat().block.dueNow, 0, 's1 里最近的一条是 r+1，尚未到轮');
});

// ═══════════════ N 负控（真源码破坏）═══════════════
ok('N1 改回「按遍历顺序取前 N 条」⇒ B1 与 B3 红', function () {
  const broken = CODE.replace('return cand.slice().sort(byWhen).slice(0, BLOCK_QUOTA);',
    'return cand.slice(0, BLOCK_QUOTA);');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const bad = quotaProblems(broken);
  assert.ok(bad.some(function (s) { return s.indexOf('B1') === 0; }), 'B1 应当红：' + JSON.stringify(bad));
  assert.ok(bad.some(function (s) { return s.indexOf('B3') === 0; }), 'B3 应当红：' + JSON.stringify(bad));
});
ok('N2 把 from 排序反过来（远的最先）⇒ B1 红', function () {
  const broken = CODE.replace('const d = (Number(a.row.from) || 0) - (Number(b.row.from) || 0);',
    'const d = (Number(b.row.from) || 0) - (Number(a.row.from) || 0);');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const bad = quotaProblems(broken);
  assert.ok(bad.some(function (s) { return s.indexOf('B1') === 0; }), 'B1 应当红：' + JSON.stringify(bad));
});
ok('N3 删掉 place / id 定序 ⇒ B8b 红（结论依赖数组顺序）', function () {
  const broken = CODE.replace(
    "      const p = String(a.row.place || ''), q = String(b.row.place || '');\n"
    + "      if (p !== q) return p < q ? -1 : 1;\n"
    + "      const x = String(a.row.id || ''), y = String(b.row.id || '');\n"
    + "      return x < y ? -1 : (x > y ? 1 : 0);",
    '      return 0;');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const bad = quotaProblems(broken);
  assert.ok(bad.some(function (s) { return s.indexOf('B8b') === 0; }), 'B8b 应当红：' + JSON.stringify(bad));
});
ok('N4 block 不拷贝（stat() 直接交回同一对象）⇒ C3 红', function () {
  const broken = CODE.replace(
    '    stat: function () { return Object.assign({}, stat,\n      { block: stat.block ? Object.assign({}, stat.block) : null }); }',
    '    stat: function () { return Object.assign({}, stat, { block: stat.block }); }');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const A = load(broken, s1Actors(), 10);
  A.api.buildBlock();
  const s1 = A.api.stat();
  s1.block.picked = 999;
  assert.strictEqual(A.api.stat().block.picked, 999, '破坏后应当被污染（判据非恒真）');
  const R = load(CODE, s1Actors(), 10);
  R.api.buildBlock();
  const r1 = R.api.stat();
  r1.block.picked = 999;
  assert.strictEqual(R.api.stat().block.picked, 3, '真源码上同一判据不红');
});

ok('事务拒绝时，建约与结算不返回成功、不计数、不留痕', function () {
  const h = load(CODE, {}, 4);
  const spec = { who: '甲', with: '乙', place: '集市', requestKey: 'market' };
  const made = h.api.make(spec);
  assert.ok(made.ok);
  let traces = 0;
  h.host.tracePost = { post: function () { traces++; } };
  h.host.store.transact = function (fn) { fn(JSON.parse(JSON.stringify(h.store))); return { ok: false }; };
  assert.strictEqual(h.api.make(Object.assign({}, spec, { requestKey: 'other' })).ok, false);
  assert.strictEqual(h.api.settle({ id: made.id, atRound: 99, showUp: false }).ok, false);
  assert.strictEqual(h.api.view({ who: '甲' }).appointments[0].result, '未到');
  assert.strictEqual(h.api.stat().made, 1);
  assert.strictEqual(h.api.stat().missed, 0);
  assert.strictEqual(traces, 0);
});
ok('同一请求重载后仍是一条，新请求不会碰撞旧 id；落盘状态不伪造', function () {
  const spec = { who: '甲', with: '乙', place: '集市', requestKey: 'market' };
  const first = load(CODE, {}, 4);
  const id = first.api.make(spec).id;
  const h = load(CODE, JSON.parse(JSON.stringify(first.store.actors)), 4);
  h.host.store.transact = function (fn) { fn(h.store); return { ok: true, persisted: false }; };
  const replay = h.api.make(spec);
  assert.strictEqual(replay.id, id); assert.strictEqual(replay.repeated, true);
  assert.strictEqual(replay.persisted, false); assert.strictEqual(h.api.view({ who: '甲' }).appointments.length, 1);
  const other = h.api.make(Object.assign({}, spec, { who: '丙' }));
  assert.notStrictEqual(other.id, id);
  assert.strictEqual(h.api.settle({ id: other.id }).persisted, false);
  assert.strictEqual(h.api.settle({ id: other.id }).reason, 'already-settled');
});
ok('东市邀约：打开面板不代答，切聊天不误写，重绘从约定回读', function () {
  const h = load(CODE, {}, 4);
  let chat = 'wa_default';
  h.host.store.chatId = function () { return chat; };
  vm.runInNewContext(rd('ui/pages/now-page.js'), { window: { WorldAxis: h.host } });
  const page = h.host.panelNowPage;
  assert.ok(!page.render().includes('wa-ferry-promise'));
  chat = 'story-one';
  assert.ok(page.render().includes('wa-ferry-promise'));
  assert.strictEqual(h.api.stat().made, 0);
  function controls() {
    const handlers = [], status = {}, btn = { dataset: { chat: chat }, addEventListener: function (_, f) { handlers.push(f); } };
    const root = { querySelector: function (id) { return id === '#wa-ferry-promise' ? btn : status; } };
    page.bindFerry(root); page.bindFerry(root); assert.strictEqual(handlers.length, 1);
    return { click: handlers[0], status: status };
  }
  const stale = controls(); chat = 'story-two'; stale.click();
  assert.strictEqual(h.api.stat().made, 0); assert.ok(stale.status.textContent.includes('切换'));
  const fresh = controls(); fresh.click(); fresh.click();
  assert.strictEqual(h.api.stat().made, 1); assert.ok(fresh.status.textContent.includes('尚未确认落盘'));
  assert.ok(page.render().includes('第 5 至 7 轮')); assert.ok(!page.render().includes('wa-ferry-promise'));
});
ok('此刻页实点：守约、救助后赶到、留在渡口失约和中止', function () {
  require('./mock');
  const env = require('./ui-gate-sync').fresh();
  const W = env.WA, root = env.dom.createElement('div');
  let round = 4;
  W.evolution.roundOf = function () { return round; };
  const page = W.panelNowPage;
  function draw() { root.innerHTML = page.render(); page.bindFerry(root); }
  function button(key) { return Array.from(root.querySelectorAll('[data-ferry]')).find(function (e) { return e.dataset.ferry === key; }); }
  function click(key) { const b = button(key); assert.ok(b, key + ': ' + root.textContent); b.click(); }
  function row() { return W.appointment.view({ who: '渡口的阿舟' }).appointments[0]; }
  function start() {
    round = 4;
    W.store.transact(function (d) { d.world = {}; d.region = { places: [] }; d.actors = {}; delete d.careChain; }, 'test:ferry');
    root.innerHTML = page.render(); page.bindFerry(root, draw);
    const previous = root.querySelector('#wa-ferry-status');
    root.querySelector('#wa-ferry-promise').click();
    const live = root.querySelector('#wa-ferry-status');
    assert.notStrictEqual(live, previous); assert.ok(live.textContent.includes('东市见'));
    assert.ok(button('market') && button('ferry')); assert.strictEqual(row().result, '未到');
  }
  start(); click('market'); assert.strictEqual(W.world.where('你').left, 30);
  click('arrive'); assert.ok(!button('meet')); assert.strictEqual(row().result, '未到');
  W.world.advance(30); draw(); click('meet'); assert.strictEqual(row().result, '未到');
  round = 5; click('meet'); assert.strictEqual(row().result, '到场');
  function revisit(trust, expected) {
    assert.ok(!button('reunion'));
    if (trust != null) assert.ok(W.fondness.apply('渡口的阿舟', { delta: 0.1, trust: trust }).ok);
    round++; draw(); assert.ok(!row().reunion); click('reunion');
    assert.ok(row().reunion.line.includes(expected));
    assert.strictEqual(row().reunion.place, W.world.where('你').place);
    assert.strictEqual(row().reunion.round, round); const original = row().reunion.line;
    assert.ok(W.appointment.revisit({ who: '渡口的阿舟', id: row().id, line: '改写' }).repeated);
    draw(); assert.ok(!button('reunion')); assert.strictEqual(row().reunion.line, original);
    return original;
  }
  assert.ok(revisit(90, '上回你准时到').includes('先托给你'));
  assert.ok(W.appointment.buildBlock('渡口的阿舟').includes('上回你准时到'));
  assert.ok(!W.appointment.buildBlock('旁人').includes('[最近的会面]'));
  assert.ok(!W.appointment.buildBlock().includes('[最近的会面]'));
  assert.ok(!W.appointment.buildBlock('渡口的阿舟').includes('伤员'));
  click('seal'); assert.strictEqual(W.store.get().gear.items.filter(x => x.requestKey === 'ferry-seal:' + row().id && x.holder === '你').length, 1);
  draw(); assert.ok(!button('seal')); click('show'); draw(); assert.ok(!button('show'));
  start(); click('ferry'); assert.strictEqual(W.world.where('你').left, 10); assert.ok(!button('aid'));
  W.world.advance(10); draw(); click('aid'); draw(); assert.ok(!button('aid'));
  assert.strictEqual(W.store.get().careChain.commitments.length, 1); assert.strictEqual(row().result, '未到');
  click('queue'); assert.strictEqual(W.store.get().careChain.publicQueue.length, 1); draw(); assert.ok(!button('queue')); assert.ok(root.textContent.includes('尚无人接班'));
  click('market'); assert.strictEqual(W.world.where('你').left, 40); W.world.advance(40);
  round = 7; draw(); click('meet'); assert.strictEqual(row().result, '迟到');
  assert.strictEqual(W.store.get().careChain.breaches.length, 1);
  const low = revisit(10, '铺子在哪'); assert.ok(low.includes('你提起渡口的伤员')); assert.ok(low.includes('暂时由我拿着')); assert.ok(!button('seal'));
  start(); click('ferry'); W.world.advance(10); round = 7; draw(); assert.ok(!button('miss'));
  round = 8; draw(); click('aid'); click('miss'); assert.strictEqual(row().result, '失约');
  start(); click('market'); W.world.stop('你'); draw(); assert.ok(!button('meet') && !button('ferry')); assert.strictEqual(row().result, '未到');
  start(); click('ferry');
  const plan = W.travelDesk.plan({ from: '渡口岔路', to: '东市' });
  assert.ok(W.travelDesk.commit('depart', { person: '无关旅客', from: '渡口岔路', to: '东市', stamp: plan.stamp }).ok);
  const hazard = W.engines.environmentalHazard, metabolism = W.toxicMetabolism;
  assert.ok(hazard.registerZoneHazard('渡口', 'cold', 2).ok);
  for (const actor of ['player', '无关旅客']) assert.ok(metabolism.applyToxin(actor, 'hallucinogen', 80).ok);
  const levels = () => ['player', '无关旅客'].map(id => metabolism.getActorToxinStatus(id).toxins[0].concentration);
  click('walk'); assert.strictEqual(W.world.where('无关旅客').left, 30);
  assert.deepStrictEqual(levels(), [63.5, 80]);
  assert.strictEqual(hazard.getActorExposureStatus('player').activeHazards.length, 0);
  click('aid'); click('queue'); click('call'); assert.ok(!button('handoff'));
  assert.strictEqual(W.store.get().careChain.commitments[0].reliefVolunteer, '值渡的兰姨');
  click('walk'); click('handoff'); assert.ok(!button('handoff') && !button('aid'));
  assert.deepStrictEqual(levels(), [50.4, 80]);
  assert.strictEqual(hazard.getActorExposureStatus('player').activeHazards[0].accumulatedErosion, 3.2);
  const chain = W.store.get().careChain;
  assert.strictEqual(chain.referrals.length, 1); assert.strictEqual(chain.referrals[0].resourceCost, 0);
  assert.deepStrictEqual(Array.from(chain.commitments[0].referralHistory), [chain.referrals[0].id]);
  click('market'); assert.ok(root.textContent.includes('已接班')); assert.strictEqual(W.store.get().careChain.breaches.length, 0);
});
console.log('\nappointment-quota-v2562: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { fails.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }
