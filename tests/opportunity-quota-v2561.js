#!/usr/bin/env node
'use strict';
/**
 * tests/opportunity-quota-v2561.js —— 「机会注入名额」分配判据专锁（v2.561.0）
 *
 * 治的缺口（本文件存在的唯一理由）：`engines/opportunity.js` 的 `buildBlock()`。
 *
 *   它这样选材：
 *
 *       const rs = all.filter(isActive)
 *                      .concat(all.filter(r => r.stage === 'lapsed').slice(-2));
 *       const lines = rs.slice(0, cfg.maxOpen).map(...);
 *
 *   `maxOpen` 默认 4，而 `ACTIVE = ['open','deferred']`。用 `filter(...).slice(0, N)`
 *   取前 N 条 = 按**插入顺序**取前 N 条 —— 先登记的永远占满名额。
 *
 *   机会与「清单」不同：它是**会过期的**。一条「还有 3 天」的窗占着名额，
 *   一条「5 分钟后关」的窗一个字都进不来，而后者这一轮不进就**永远不再有机会**。
 *
 *   实测（/tmp/probe561.js，改造前）：
 *     · s1  4 条 3 天窗 + 2 条「5 分钟 / 1 小时」窗 ⇒ 列出的正是那四条 3 天窗
 *     · s2  2 条已延后（deferred，窗口还剩 3 天）+ 2 条 2 天窗 + 1 条 30 分钟窗
 *           ⇒ 列出 d1/d2/o1/o2，30 分钟那条进不来。已延后的行与 open **同权**占名额。
 *     · s3  **窗口已经关了**（endAt < now）但 `sweep()` 还没标 lapsed 的行，阶段仍是 open，
 *           于是照常参与竞争：x1/x2 占掉 4 个名额的**前两名**，
 *           而它自己的行文里还写着「已错过（不可再参与；历史窗口）」。
 *     · s4  `stat().block` 是 undefined ⇒「从没构建过」与「构建过但空表」同形
 *     · s7  同刻（endAt 相同）时按数组顺序取前 4 —— 换个插入顺序结论就变，不可复算
 *
 * 本批做的三件事：
 *   ① `pickBlock`：名额够就**原样返回**（顺序不变，名额不是瓶颈时不该重排）；
 *      不够时**还开着的窗优先**（按「谁先关」升序）→ 已关的窗排在全部开着的窗之后
 *      （按「最近关的」在前）→ 同刻按 id 字典序（可复算）。
 *   ② 名额面读数进 `stat().block`（`candidates / picked / quota / openWindow /
 *      closedWindow / deferred / mode`）；`stat()` 的浅拷贝必须**单独再拷 block**。
 *   ③ `tool-diag` 的 `secOpportunity` 补 `block`（仍不调 buildBlock —— 诊断零副作用）。
 *
 * 判据结构：
 *   A 静态（旧写法消失 / 判据只有一个正身 / 三条判据齐 / 读数在位 / 拷贝在位 / 读面在位）
 *   B 行为（紧迫的进得来 / deferred 不独占 / 已关的窗不占名额 / 名额够顺序不变 /
 *          同刻可复算 / lapsed 仍不挤在途 / buildBlock 只读）
 *   C 读数（七栏 / 三态 / 拷贝 / candidates ≠ picked / 从没构建过 vs 空表）
 *   N 四条负控（真源码破坏：改回按插入顺序 ⇒ B1+B3 红；已关的排前面 ⇒ B3 红；
 *              删掉同刻字典序 ⇒ B5 红；block 不拷贝 ⇒ C3 红）
 *
 * 单独跑：node tests/opportunity-quota-v2561.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/opportunity.js';
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
const MIN = 60000;

/** 装载：真 vm + 最小 WA。`code` 可传破坏副本。 */
function load(code, rows, cfg0) {
  let cfg = Object.assign({ enabled: true, maxOpen: 4, defaultWindowMs: 86400000 }, cfg0 || {});
  const store = { opportunity: { openings: rows || [] } };
  const WA = {
    clock: { now: function () { return NOW; }, wallNow: function () { return NOW; } },
    store: {
      get: function () { return store; },
      transact: function (fn) { const r = fn(store); return { ok: r !== false }; }
    },
    settingsBus: {
      read: function () { return cfg; },
      normalize: function (r, v) { return v; },
      saveOrThrow: function (r, v) { cfg = v; return { ok: true }; }
    },
    evict: { array: function (arr, site, limit) {
      const before = arr.length;
      if (before <= limit) return { ok: true, dropped: 0, before: before, after: before };
      arr.splice(0, before - limit);
      return { ok: true, dropped: before - limit, before: before, after: arr.length };
    } },
    registerModule: function () {}
  };
  require('./synth-host.js').hostStub(WA);
  const win = { WorldAxis: WA };
  vm.runInNewContext(code, { window: win, Date: Date, Number: Number, String: String, Array: Array,
    Object: Object, isFinite: isFinite, Math: Math, JSON: JSON, RegExp: RegExp, parseInt: parseInt },
    { filename: REL });
  return { api: win.WorldAxis.opportunity, store: store };
}
/** 一行机会：atMin = 距今多少分钟登记；endInMin = 距今多少分钟关窗（负 = 已过期）。 */
function row(id, stage, atMin, endInMin) {
  return { id: id, key: 'k_' + id, source: 'promise', sourceLabel: '承诺逾期',
    from: '来源 ' + id, actors: ['甲'], stage: stage,
    lastAt: NOW - atMin * MIN, windowMs: 0, windowBasis: 'default',
    deadlineAt: NOW + endInMin * MIN };
}
/** 从注入块取 id（行形态：`- <id>（<来源>）由：...`）。 */
function idsIn(b) {
  if (!b) return [];
  return b.split('\n').map(function (l) { const m = /^-\s+(\S+?)（/.exec(l); return m ? m[1] : null; })
    .filter(function (x) { return x; });
}
function rowIn(b, id) { return (b || '').split('\n').filter(function (l) { return l.indexOf('- ' + id + '（') === 0; })[0] || ''; }

/** 四个主局面 —— 供负控对**同一条**判据取红。 */
function main1() {
  return [row('o1', 'open', 600, 3 * 1440), row('o2', 'open', 500, 3 * 1440),
    row('o3', 'open', 400, 3 * 1440), row('o4', 'open', 300, 3 * 1440),
    row('o5', 'open', 5, 60), row('o6', 'open', 1, 5)];
}
function main2() {
  return [row('d1', 'deferred', 900, 3 * 1440), row('d2', 'deferred', 800, 3 * 1440),
    row('o1', 'open', 700, 2 * 1440), row('o2', 'open', 600, 2 * 1440),
    row('o3', 'open', 1, 30)];
}
function main3() {
  return [row('x1', 'open', 2000, -120), row('x2', 'open', 1900, -60),
    row('o1', 'open', 100, 3 * 1440), row('o2', 'open', 90, 3 * 1440),
    row('o3', 'open', 80, 3 * 1440), row('o4', 'open', 70, 3 * 1440)];
}
function main7() {
  return [row('z2', 'open', 10, 60), row('z1', 'open', 20, 60), row('z3', 'open', 30, 60),
    row('z4', 'open', 40, 60), row('z5', 'open', 50, 60)];
}

/** 核心判据集：真源码与破坏副本各跑一遍。返回空数组 = 全过。 */
function quotaProblems(code) {
  const bad = [];
  // B1 名额不够时「快关的」必须挤进来
  {
    const A = load(code, main1());
    const got = idsIn(A.api.buildBlock());
    if (got.length !== 4) bad.push('B1 条数应为 maxOpen(4)（实 ' + got.length + '）');
    if (got.indexOf('o6') < 0) bad.push('B1 5 分钟后关的那条必须进（实 ' + JSON.stringify(got) + '）');
    if (got.indexOf('o5') < 0) bad.push('B1 1 小时后关的那条必须进（实 ' + JSON.stringify(got) + '）');
    if (got[0] !== 'o6') bad.push('B1 最先关的应排第一（实 ' + got[0] + '）');
  }
  // B2 deferred 与 open 同权，但名额不够时不许独占
  {
    const A = load(code, main2());
    const got = idsIn(A.api.buildBlock());
    if (got.indexOf('o3') < 0) bad.push('B2 30 分钟后关的那条必须进（实 ' + JSON.stringify(got) + '）');
    const dfd = got.filter(function (x) { return x[0] === 'd'; }).length;
    if (dfd > 1) bad.push('B2 已延后的行不许占满 4 个名额里的 2 个（实 ' + dfd + '）');
  }
  // B3 窗口已经关了的那条不许占名额
  {
    const A = load(code, main3());
    const got = idsIn(A.api.buildBlock());
    const closed = got.filter(function (x) { return x[0] === 'x'; }).length;
    if (closed > 0) bad.push('B3 已关的窗不许占名额（实占 ' + closed + ' 个：' + JSON.stringify(got) + '）');
    if (got.indexOf('o1') < 0 || got.indexOf('o2') < 0) bad.push('B3 正开着的窗必须补进来（实 ' + JSON.stringify(got) + '）');
  }
  // B5 同刻（endAt 相同）必须可复算
  {
    const A = load(code, main7());
    const got = idsIn(A.api.buildBlock());
    if (JSON.stringify(got) !== JSON.stringify(['z1', 'z2', 'z3', 'z4'])) {
      bad.push('B5 同刻应取 id 字典序前 4（实 ' + JSON.stringify(got) + '）');
    }
  }
  // B6 lapsed 的历史仍不许挤掉在途（本批不许碰坏这条既有判据）
  {
    const rows = [row('l1', 'lapsed', 5000, -3000), row('l2', 'lapsed', 4000, -2000)]
      .concat(main1());
    const A = load(code, rows);
    const got = idsIn(A.api.buildBlock());
    const lap = got.filter(function (x) { return x[0] === 'l'; }).length;
    if (lap !== 0) bad.push('B6 在途行占满名额时不许附已作废历史（实 ' + lap + ' 条）');
  }
  return bad;
}

console.log('opportunity-quota-v2561 —— 机会注入名额（v2.561.0）');

// ═══════════════ A 静态 ═══════════════
ok('A1 旧写法（filter(isActive).concat(...).slice(0, maxOpen) 直接当选材）已消失', function () {
  assert.strictEqual(CODE.indexOf('all.filter(isActive).concat'), -1);
});
ok('A2 名额分配判据只有一个正身：pickBlock 定义一处、调用一处', function () {
  assert.strictEqual(CODE.split('function pickBlock').length - 1, 1);
  assert.strictEqual(CODE.split('= pickBlock(live, cfg, t)').length - 1, 1);
});
ok('A3 三条判据齐：名额够短路 / 已关的排后 / 同刻字典序', function () {
  assert.ok(/if \(live\.length <= cfg\.maxOpen\) return live\.slice\(\);/.test(CODE), '缺「名额够就原样返回」');
  assert.ok(/openW\.concat\(closedW\)\.slice\(0, cfg\.maxOpen\)/.test(CODE), '缺「开着的窗排前面」');
  assert.ok(/String\(\(a && a\.id\) \|\| ''\)/.test(CODE), '缺同刻 id 字典序');
});
ok('A4 名额面七栏齐', function () {
  ['candidates', 'picked', 'quota', 'openWindow', 'closedWindow', 'deferred', 'mode'].forEach(function (k) {
    assert.ok(CODE.indexOf(k + ':') > 0, '缺读数栏 ' + k);
  });
});
ok('A5 stat 初始 block 是 null（「没构建过」不是「空表」）', function () {
  assert.ok(/block: null \};/.test(CODE));
});
ok('A6 stat() 的 block 单独再拷一份', function () {
  assert.ok(/block: stat\.block \? Object\.assign\(\{\}, stat\.block\) : null/.test(CODE),
    'stat() 必须交回 block 的拷贝');
});
ok('A7 statView 交回 block', function () {
  const i = CODE.indexOf('function statView');
  const seg = CODE.slice(i, i + 1200);
  assert.ok(seg.indexOf('block: stat.block') > 0, 'statView 必须交回 block');
});
ok('A8 tool-diag 的 secOpportunity 补了 block，且仍不调 buildBlock', function () {
  const T = codeOnly(rd('engines/tool-diag.js'));
  const i = T.indexOf('function secOpportunity');
  assert.ok(i > 0);
  const seg = T.slice(i, i + 1600);
  assert.ok(seg.indexOf('block: v.block || null') > 0, '诊断节必须带 block');
  assert.strictEqual(seg.indexOf('buildBlock'), -1, '诊断节不许调 buildBlock（零副作用）');
});
ok('A9 名额够时短路在前（先判名额，再排序）', function () {
  const i = CODE.indexOf('function pickBlock');
  const seg = CODE.slice(i, i + 700);
  const short = seg.indexOf('live.length <= cfg.maxOpen');
  const sort = seg.indexOf('openW.sort(byEnd)');
  assert.ok(short > 0 && sort > 0 && short < sort, '短路必须在排序之前');
});

// ═══════════════ B 行为 ═══════════════
ok('B1 名额不够时「5 分钟后关」的那条挤进来并排第一', function () {
  const A = load(CODE, main1());
  const got = idsIn(A.api.buildBlock());
  assert.deepStrictEqual(got, ['o6', 'o5', 'o1', 'o2']);
});
ok('B2 已延后的行不再是「先到先得」的既得利益', function () {
  const A = load(CODE, main2());
  const got = idsIn(A.api.buildBlock());
  assert.deepStrictEqual(got, ['o3', 'o1', 'o2', 'd1']);
  assert.strictEqual(got.filter(function (x) { return x[0] === 'd'; }).length, 1);
});
ok('B3 窗口已经关了的那条不再占名额，名额让给正开着的窗', function () {
  const A = load(CODE, main3());
  const got = idsIn(A.api.buildBlock());
  assert.deepStrictEqual(got, ['o1', 'o2', 'o3', 'o4']);
  assert.strictEqual(got.filter(function (x) { return x[0] === 'x'; }).length, 0);
});
ok('B4 名额够时顺序完全不变（行为零变化）', function () {
  const rows = [row('b', 'open', 10, 300), row('a', 'open', 20, 60)];
  const A = load(CODE, rows);
  assert.deepStrictEqual(idsIn(A.api.buildBlock()), ['b', 'a'],
    '名额不是瓶颈时不许重排（与 v2.558.0 同一条纪律）');
});
ok('B5 同刻（endAt 相同）按 id 字典序，可复算', function () {
  const A = load(CODE, main7());
  assert.deepStrictEqual(idsIn(A.api.buildBlock()), ['z1', 'z2', 'z3', 'z4']);
});
ok('B5b 换个插入顺序，同刻结论不变', function () {
  const rev = main7().slice().reverse();
  const A = load(CODE, rev);
  assert.deepStrictEqual(idsIn(A.api.buildBlock()), ['z1', 'z2', 'z3', 'z4'],
    '结论依赖数组顺序 ⇒ 不可复算');
});
ok('B6 lapsed 的已作废历史仍不挤在途（既有判据不许碰坏）', function () {
  const rows = [row('l1', 'lapsed', 5000, -3000), row('l2', 'lapsed', 4000, -2000)].concat(main1());
  const A = load(CODE, rows);
  const got = idsIn(A.api.buildBlock());
  assert.strictEqual(got.filter(function (x) { return x[0] === 'l'; }).length, 0);
});
ok('B6b 在途有空位时才附已作废历史（最多两条）', function () {
  const rows = [row('l1', 'lapsed', 5000, -3000), row('l2', 'lapsed', 4000, -2000),
    row('o1', 'open', 10, 60)];
  const A = load(CODE, rows);
  const got = idsIn(A.api.buildBlock());
  assert.strictEqual(got.length, 3, '实 ' + JSON.stringify(got));
  assert.strictEqual(got.filter(function (x) { return x[0] === 'l'; }).length, 2);
});
ok('B7 buildBlock 是只读的：不改阶段、不改顺序、不写盘', function () {
  const A = load(CODE, main3());
  const before = JSON.stringify(A.store.opportunity.openings);
  A.api.buildBlock(); A.api.buildBlock();
  assert.strictEqual(JSON.stringify(A.store.opportunity.openings), before, '选材不许改世界状态');
});
ok('B8 主判据集在真源码上全过', function () {
  const bad = quotaProblems(CODE);
  assert.deepStrictEqual(bad, [], bad.join(' | '));
});

// ═══════════════ C 读数 ═══════════════
ok('C1 读数七栏在名位、是数字，mode = ending-first', function () {
  const A = load(CODE, main1());
  A.api.buildBlock();
  const b = A.api.statView().block;
  assert.ok(b && typeof b === 'object');
  assert.strictEqual(b.candidates, 6);
  assert.strictEqual(b.picked, 4);
  assert.strictEqual(b.quota, 4);
  assert.strictEqual(b.openWindow, 6);
  assert.strictEqual(b.closedWindow, 0);
  assert.strictEqual(b.deferred, 0);
  assert.strictEqual(b.mode, 'ending-first');
});
ok('C2 三态可分辨：empty / all-fit / ending-first', function () {
  const e = load(CODE, []);
  e.api.buildBlock();
  assert.strictEqual(e.api.statView().block.mode, 'empty');
  const f = load(CODE, [row('o1', 'open', 10, 60)]);
  f.api.buildBlock();
  assert.strictEqual(f.api.statView().block.mode, 'all-fit');
  const d = load(CODE, main1());
  d.api.buildBlock();
  assert.strictEqual(d.api.statView().block.mode, 'ending-first');
});
ok('C3 block 是拷贝：外部改返回值不污染下一次读数', function () {
  const A = load(CODE, main1());
  A.api.buildBlock();
  const s1 = A.api.stat();
  s1.block.picked = 999;
  const s2 = A.api.stat();
  assert.strictEqual(s2.block.picked, 4, 'stat() 必须每次都交回新的 block 拷贝');
  const v1 = A.api.statView();
  v1.block.picked = 999;
  assert.strictEqual(A.api.statView().block.picked, 4, 'statView() 同样');
});
ok('C4 candidates ≠ picked（两者恒等说明名额是假读数）', function () {
  const A = load(CODE, main1());
  A.api.buildBlock();
  const b = A.api.stat().block;
  assert.notStrictEqual(b.candidates, b.picked);
  const A2 = load(CODE, [row('o1', 'open', 10, 60)]);
  A2.api.buildBlock();
  const b2 = A2.api.stat().block;
  assert.strictEqual(b2.candidates, b2.picked, '名额够时两者相等是**对的**（all-fit）');
});
ok('C5 「从没构建过」与「构建过但空表」分得开', function () {
  const never = load(CODE, []);
  assert.strictEqual(never.api.stat().block, null, '从没构建过 ⇒ null');
  const built = load(CODE, []);
  const txt = built.api.buildBlock();
  assert.strictEqual(txt, '');
  const b = built.api.stat().block;
  assert.ok(b && typeof b === 'object', '构建过 ⇒ 必须有读数对象');
  assert.strictEqual(b.picked, 0);
  assert.strictEqual(b.mode, 'empty');
});
ok('C6 已关窗数进 closedWindow 读数', function () {
  const A = load(CODE, main3());
  A.api.buildBlock();
  const b = A.api.stat().block;
  assert.strictEqual(b.candidates, 6);
  assert.strictEqual(b.closedWindow, 2);
  assert.strictEqual(b.openWindow, 4);
});

// ═══════════════ N 负控（真源码破坏）═══════════════
ok('N1 改回「按插入顺序取前 N 条」⇒ B1 与 B3 红', function () {
  const broken = CODE.replace('return openW.concat(closedW).slice(0, cfg.maxOpen);',
    'return live.slice(0, cfg.maxOpen);');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const bad = quotaProblems(broken);
  assert.ok(bad.some(function (s) { return s.indexOf('B1') === 0; }), 'B1 应当红：' + JSON.stringify(bad));
  assert.ok(bad.some(function (s) { return s.indexOf('B3') === 0; }), 'B3 应当红：' + JSON.stringify(bad));
});
ok('N2 把已关的窗排到前面 ⇒ B3 红', function () {
  const broken = CODE.replace('return openW.concat(closedW).slice(0, cfg.maxOpen);',
    'return closedW.concat(openW).slice(0, cfg.maxOpen);');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const bad = quotaProblems(broken);
  assert.ok(bad.some(function (s) { return s.indexOf('B3') === 0; }), 'B3 应当红：' + JSON.stringify(bad));
});
ok('N3 删掉同刻 id 字典序（比较恒为 0）⇒ B5 红', function () {
  const broken = CODE.replace(
    "      const x = String((a && a.id) || ''), y = String((b && b.id) || '');\n"
    + "      return x < y ? -1 : (x > y ? 1 : 0);",
    '      return 0;');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const bad = quotaProblems(broken);
  assert.ok(bad.some(function (s) { return s.indexOf('B5') === 0; }), 'B5 应当红：' + JSON.stringify(bad));
});
ok('N4 block 不拷贝（stat() 直接交回同一对象）⇒ C3 红', function () {
  const broken = CODE.replace('block: stat.block ? Object.assign({}, stat.block) : null }); }',
    'block: stat.block }); }');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const A = load(broken, main1());
  A.api.buildBlock();
  const s1 = A.api.stat();
  s1.block.picked = 999;
  assert.strictEqual(A.api.stat().block.picked, 999, '破坏后应当被污染（判据非恒真）');
  // 同一判据在真源码上不红
  const R = load(CODE, main1());
  R.api.buildBlock();
  const r1 = R.api.stat();
  r1.block.picked = 999;
  assert.strictEqual(R.api.stat().block.picked, 4);
});

console.log('\nopportunity-quota-v2561: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { fails.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }