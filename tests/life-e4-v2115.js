#!/usr/bin/env node
// WorldAxis tests/life-e4-v2115.js -- E4 lock: 人物推进的公平性（v2.115.0）
//
// 规划 01 的 E4 缺陷（修复前实测）：
//   tick() 此前把人物按依据条数排序后 `.slice(0, cfg.maxPeople)` 截断 —— 6 人同等依据、
//   名额 4 时**后两位每一轮都被跳过**：`skipped` 有账（2），但「谁总也没轮到」不可见，
//   那两个人永远拿不到 `lastDecision`（静态排序 + 截断 = 位置决定命运）。
//
// 本锁守四条判据（每条都两向自证：真源码成绿 / 就地破坏现形）：
//   ① **同级轮转**：同等依据者跨轮轮换，名额不足时 `ceil(N/名额)` 轮之内每人都排到过；
//   ② **依据优先不被轮转破坏**：依据多的人每轮都在（轮转只发生在名额切点所在的那一组）；
//   ③ **名额不足必须留痕**：`skipped` 如实报出「本可以推演却没推演」的条数；
//   ④ **不为读游标新开一口**：`lastTurn` 挂在既有成员 `stat()` 里，`life.turn` 不存在。
// 锚点逐字取自 engines/life.js 且要求恰 1 次（N0）；破坏只改内存副本，零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__e4v2115_';
const REL = 'engines/life.js';
// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
// ① 破坏「按组轮转」：整个环形取前 take 段摘掉（退回静态定序 —— 切点之后永远轮不到）
// ── E8（v2.139.0）之后的语义边界（本锁 2024 修订）────────────────────
//   E8 把「组内定序」交还了可注入的加权随机源（`fairSpin`），确定性环形**降为兜底**
//   （随机源缺席 / 抛错 / 拒绝采样触顶时才走）。于是「2 轮必覆盖全部 6 人」这类
//   **确定性**判据在本锁里只能在**兜底路径**上判：在随机路径上判它，等于要求随机源
//   必须复现环形 —— 那是把两条路合成一条，也正是 E8 要治的那个病。
//   做法：把 `fairSpin` 的调用点换成 `null`（等价于随机源当场不可用）⇒ 走兜底路径，
//   E4 语义原封不动地在那里被判。字面量只在此声明一次（判据侧引用本常量）。
const A_SPIN = "const spin = fairSpin(g.rows, take);";
function spinless() {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  if (src.split(A_SPIN).length - 1 !== 1) throw new Error('A_SPIN 锚点不唯一');
  return { 'engines/life.js': src.split(A_SPIN).join('const spin = null;') };
}
const A_ROT = "const spin = fairSpin(g.rows, take);\n          if (spin) { seq = spin.rows; _turn = (_turn + take) % G; stat.fairRounds++; }\n          else {\n            const shift = _turn % G;\n            seq = g.rows.slice(shift).concat(g.rows.slice(0, shift));\n            _turn = (_turn + take) % G;\n          }";
// ② 破坏「留痕」：名额不足不再计数（静默少推演一个人，与「他本来没事可做」长得一样）
const A_SKIP = "skipped = Math.max(0, N - cfg.maxPeople);";
// ③ 破坏「组间严格按下标」：把所有人并成一组（低依据者可能挤掉高依据者）
const A_GROUP = "const groups = [];\n      ranked.forEach(function (row) {\n        const last = groups.length ? groups[groups.length - 1] : null;\n        if (last && last.n === row.n) last.rows.push(row);\n        else groups.push({ n: row.n, rows: [row] });\n      });";
const BROKEN = [
  { key: 'rot', from: A_ROT, to: "seq = g.rows;" },   // E8 后：整段定序机制（加权随机 + 环形兜底）一起摘掉
  { key: 'skip', from: A_SKIP, to: "skipped = 0;" },
  { key: 'group', from: A_GROUP, to: "const groups = [{ n: ranked.length ? ranked[0].n : 0, rows: ranked }];" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__origSrc = src;
  return ov;
}
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw:' + (e && e.message); } }; }
function probeWith(spec, fn) { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }
function probeClean(fn) { return guarded(fn)(fresh()); }
// 兜底路径上的同一探针（E8 之后 E4 语义只在这条路上，见 A_SPIN 段）
function probeSpinless(fn) { return guarded(fn)(fresh({ srcOverride: spinless() })); }
// ── 造场景 ──
function setup(WA, spec) {
  WA.store.init();
  WA.life.setSettings({ enabled: true, maxPeople: spec.maxPeople });
  WA.store.transact(function (d) {
    d.people = {};
    spec.people.forEach(function (n, i) {
      d.people['p_' + n] = { id: 'p_' + n, name: n, life: { goals: [], commitments: [], schedule: [], lastDecision: null } };
    });
  }, TAG + 'seed');
  // 依据条数 = 该人 life 里 active 的目标/承诺/日程各计数（与 basisOf 同一口径）
  // 依据条数按**类别**给（与 basisOf 同一口径：目标/承诺/日程各计入 1，
  //   同类别多条仍只算 1 —— 「有目标」与「有三条目标」在名额分配上是同一件事）。
  spec.people.forEach(function (n) {
    const kinds = spec.basis[n] || ['g'];
    WA.store.transact(function (d) {
      const lf = d.people['p_' + n].life;
      kinds.forEach(function (k) {
        if (k === 'g') lf.goals.push({ id: 'g_' + n, text: '目标', status: 'active' });
        if (k === 'c') lf.commitments.push({ id: 'c_' + n, kind: 'task', target: n + 'X', text: '承诺', status: 'active' });
        if (k === 's') lf.schedule.push({ id: 's_' + n, activity: '日程', start: 0, end: 1e12, status: 'active' });
      });
    }, TAG + 'basis');
  });
}
function personsOf(WA) {
  const ppl = WA.store.get().people || {};
  return Object.keys(ppl).filter(function (k) { return ppl[k].life; });
}
function clearDecisions(WA) {
  WA.store.transact(function (d) {
    Object.keys(d.people).forEach(function (k) { if (d.people[k].life) d.people[k].life.lastDecision = null; });
  }, TAG + 'clear');
}
function decided(WA) {
  const ppl = WA.store.get().people || {};
  return Object.keys(ppl).filter(function (k) { return ppl[k].life && ppl[k].life.lastDecision; })
    .map(function (k) { return ppl[k].name; }).sort();
}
// 跑 rounds 轮，每轮先清 lastDecision（否则「上轮的痕迹」会与本轮名单混在一起）
function rounds(WA, n, from) {
  const out = [];
  for (let i = 0; i < n; i++) {
    clearDecisions(WA);
    const r = WA.life.tick({ now: (from || 100) + i });
    out.push({ names: decided(WA), skipped: r.skipped, turn: WA.life.stat().lastTurn });
  }
  return out;
}
// ── 探针（返回症状值，便于两向对照）──
// P1 同级轮转：6 人同依据、名额 4（原版 'rotating'；去掉环形取段 'stuck'）
function probeFair(WA) {
  const ppl = {};
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(function (n) { ppl[n] = ['g']; });
  setup(WA, { people: Object.keys(ppl), basis: ppl, maxPeople: 4 });
  const rs = rounds(WA, 3, 100);
  const k = rs.map(function (x) { return x.names.join(','); });
  const same = k[0] === k[1] && k[1] === k[2];
  const cover = {};
  rs.slice(0, 2).forEach(function (x) { x.names.forEach(function (n) { cover[n] = 1; }); });
  return (!same && Object.keys(cover).length === 6) ? 'rotating' : 'stuck';
}
// P2 依据优先：3 人 2 条依据 + 5 人 1 条依据、名额 4
//    （原版 'strong-first'；并成一组 'starved'）
function probeStrong(WA) {
  const basis = { S1: ['g', 'c'], S2: ['g', 'c'], S3: ['g', 'c'], W1: ['g'], W2: ['g'], W3: ['g'], W4: ['g'], W5: ['g'] };
  setup(WA, { people: Object.keys(basis), basis: basis, maxPeople: 4 });
  const rs = rounds(WA, 3, 200);
  const strong = ['S1', 'S2', 'S3'];
  const allIn = rs.every(function (x) {
    return strong.every(function (s) { return x.names.indexOf(s) >= 0; });
  });
  return allIn ? 'strong-first' : 'starved';
}
// P3 留痕：6 人、名额 4 ⇒ skipped 必须为 2（破坏后恒为 0）
function probeSkip(WA) {
  const ppl = {};
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(function (n) { ppl[n] = ['g']; });
  setup(WA, { people: Object.keys(ppl), basis: ppl, maxPeople: 4 });
  const rs = rounds(WA, 1, 300);
  return String(rs[0].skipped);
}
// P4 轮转只在切点：整组装得下 ⇒ 游标不动（轮转不是在名额富余时也乱蹦）
function probeNoSpin(WA) {
  const ppl = { A: ['g'], B: ['g'], C: ['g'] };
  setup(WA, { people: Object.keys(ppl), basis: ppl, maxPeople: 4 });
  const rs = rounds(WA, 2, 400);
  return (rs[0].turn === 0 && rs[1].turn === 0 && rs[0].names.join(',') === rs[1].names.join(','))
    ? 'stable' : 'spinning';
}
function judge(a) {
  const WA = fresh({ srcOverride: spinless() });   // 兜底路径（见 A_SPIN 段）
  setup(WA, { people: ['A', 'B', 'C', 'D', 'E', 'F'], basis: { A: ['g'], B: ['g'], C: ['g'], D: ['g'], E: ['g'], F: ['g'] }, maxPeople: 4 });
  const rs = rounds(WA, 3, 100);
  a(rs.every(function (x) { return x.names.length === 4; }),
    'v2115/e4: [1] 每轮恰推演 4 人（实 ' + JSON.stringify(rs.map(function (x) { return x.names.length; })) + '）');
  const k = rs.map(function (x) { return x.names.join(','); });
  a(!(k[0] === k[1] && k[1] === k[2]),
    'v2115/e4: [1] 三轮名单不全同（不再前 4 人垄断，实 ' + k.join(' / ') + '）');
  const cover = {};
  rs.slice(0, 2).forEach(function (x) { x.names.forEach(function (n) { cover[n] = 1; }); });
  a(Object.keys(cover).length === 6,
    'v2115/e4: [1] 2 轮（ceil(6/4)）覆盖全部 6 人（实 ' + JSON.stringify(Object.keys(cover)) + '）');
  const fresh2 = rs[1].names.filter(function (n) { return rs[0].names.indexOf(n) < 0; });
  a(fresh2.length === 2, 'v2115/e4: [1] 第 2 轮换进上轮被跳过的 2 人（实 ' + JSON.stringify(fresh2) + '）');
  a(rs.every(function (x) { return x.skipped === 2; }),
    'v2115/e4: [3] 每轮 skipped=2 留痕（实 ' + JSON.stringify(rs.map(function (x) { return x.skipped; })) + '）');
  // ② 依据优先不得被轮转破坏
  const WA2 = fresh({ srcOverride: spinless() });
  const basis2 = { S1: ['g', 'c'], S2: ['g', 'c'], S3: ['g', 'c'], W1: ['g'], W2: ['g'], W3: ['g'], W4: ['g'], W5: ['g'] };
  setup(WA2, { people: Object.keys(basis2), basis: basis2, maxPeople: 4 });
  const rs2 = rounds(WA2, 3, 200);
  a(rs2.every(function (x) { return ['S1', 'S2', 'S3'].every(function (s) { return x.names.indexOf(s) >= 0; }); }),
    'v2115/e4: [2] 每轮 3 个强依据者全部入选（依据优先未被轮转破坏，实 ' + JSON.stringify(rs2.map(function (x) { return x.names; })) + '）');
  const weakSeen = {};
  rs2.forEach(function (x) {
    x.names.forEach(function (n) { if (n.charAt(0) === 'W') weakSeen[n] = 1; });
  });
  a(Object.keys(weakSeen).length >= 2,
    'v2115/e4: [2] 名额第 4 位在弱依据者之间轮转（实 ' + JSON.stringify(Object.keys(weakSeen)) + '）');
  a(rs2.every(function (x) { return x.names.filter(function (n) { return n.charAt(0) === 'W'; }).length === 1; }),
    'v2115/e4: [2] 弱依据者恰占 1 席（没有把强依据者挤出去换公平）');
  // ③ 名额富余时不空转游标
  a(probeClean(probeNoSpin) === 'stable',
    'v2115/e4: [3] 整组装得下 ⇒ 不轮转（名额富余时名单与游标都不动）');
  // ④ 不为读游标新开一口（本仓纪律：零消费能力当场删 —— 为读 `_turn` 新增导出会立刻变成死导出）
  a(typeof WA.life.turn === 'undefined',
    'v2115/e4: [4] life.turn 不存在（游标只从既有成员 stat() 读，不新增出口面）');
  a(Object.prototype.hasOwnProperty.call(WA.life.stat(), 'lastTurn'),
    'v2115/e4: [4] lastTurn 挂在 stat() 的返回里（既有成员多一个字段）');
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(src.indexOf('let _turn = 0;') > 0, 'v2115/e4: [4] 游标是进程态常量位（不落存档、不新增容器键）');
  a(JSON.stringify(WA.store.get()).indexOf('_turn') < 0,
    'v2115/e4: [4] 存档里没有游标（它与 `skipped` 同族：记的是「这一轮从谁开始」，不是世界事实）');
  // 哨兵
  let leak = 0;
  for (let i = 0; i < global.localStorage.length; i++) {
    const kk = global.localStorage.key(i);
    if (kk && String(global.localStorage.getItem(kk)).indexOf(TAG) >= 0) leak++;
  }
  a(leak === 0, 'v2115/e4: [5] 哨兵未泄漏（' + leak + '）');
}
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2115/e4: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  // N1 破坏现形
  a(probeWith(BROKEN[B.rot], probeFair) === 'stuck',
    'v2115/e4: [N1] 去掉环形取段 ⇒ 同等依据者永远轮不到（E4 缺陷复现：静态定序 + 截断）');
  a(probeWith(BROKEN[B.group], probeStrong) === 'starved',
    'v2115/e4: [N1] 并成一组 ⇒ 低依据者挤掉高依据者（依据优先被轮转破坏）');
  a(probeWith(BROKEN[B.skip], probeSkip) === '0',
    'v2115/e4: [N1] 去掉留痕 ⇒ 名额不足静默发生（读不出「少推了谁」）');
  // N2 真源码成绿
  a(probeSpinless(probeFair) === 'rotating', 'v2115/e4: [N2] 兜底路径：同级环形轮转生效（E8 后确定性语义住在这里）');
  a(probeClean(probeStrong) === 'strong-first', 'v2115/e4: [N2] 原版：依据优先生效');
  a(probeClean(probeSkip) === '2', 'v2115/e4: [N2] 原版：名额不足如实留痕');
  a(probeClean(probeNoSpin) === 'stable', 'v2115/e4: [N2] 原版：整组装得下时不轮转');
  // N3 隔离：破坏某一锚点不影响另一判据
  a(probeWith(BROKEN[B.rot], probeStrong) === 'strong-first', 'v2115/e4: [N3] 去掉轮转不影响「依据优先」');
  a(probeWith(BROKEN[B.group], probeFair) === 'rotating', 'v2115/e4: [N3] 并成一组不影响「同级轮转」');
  a(probeWith(BROKEN[B.skip], probeFair) === 'rotating', 'v2115/e4: [N3] 去掉留痕不影响「同级轮转」');
  // N4 判据非恒真：游标真的在命名单的界上走动
  const chg = (function () {
    const WA = fresh();
    setup(WA, { people: ['A', 'B', 'C', 'D', 'E', 'F'], basis: { A: ['g'], B: ['g'], C: ['g'], D: ['g'], E: ['g'], F: ['g'] }, maxPeople: 4 });
    const rs = rounds(WA, 3, 500);
    return rs.map(function (x) { return x.turn; }).join('>') + '|' + (rs[0].names.join(',') !== rs[1].names.join(',') ? 'moved' : 'still');
  })();
  a(/^\d+>\d+>\d+\|moved$/.test(chg) && chg.indexOf('4>2>0') === 0,
    'v2115/e4: [N4] 游标逐轮前进且名单真的换了（判据非恒真，实 ' + chg + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('LIFE-E4-V2115: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('LIFE-E4-V2115: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };
