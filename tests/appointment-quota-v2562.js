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
  return { api: win.WorldAxis.appointment, store: store };
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

console.log('\nappointment-quota-v2562: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { fails.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }