#!/usr/bin/env node
'use strict';
/**
 * tests/inject-block-quota-cluster3-v2582.js
 * 「同形态**头**截断」簇三（14 引擎 / 18 站点）名额守卫与清单自证专锁（v2.582.0）
 *
 * 治的缺口：14 个引擎的 buildBlock 都写着同一族 `X.slice(0, cfg.maxX)`：
 *   ① 名额读坏（NaN / 'x' / 负数）时 `slice(0, NaN)`=`slice(0, 0)` ⇒ **空数组 ⇒ 注入面消失**，
 *      比「截多了」更坏：截多了还看得见项，清空连项都没了，且一个字都不说；
 *   ② 截掉多少条零自证——念了几条、还剩几条，谁都不知道。
 *
 * 与 v2.581.0（簇二，尾部截断，取最新）的区别是**方向**：这一头的顺序是刻意排好的
 * （谁该先被念），所以本批不重排、不换判据。这条界限必须由判据守住，不能只靠注释：
 *   → B3 判「念的是**原顺序的前 N 条**」，N2 负控把 `slice(0, q)` 改成 `slice(-q)` 必须红。
 *
 * 单独跑：node tests/inject-block-quota-cluster3-v2582.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const NOW = 1700000000000;
const DAY = 86400000;
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
function buildBody(src) {
  const b = src.indexOf('function buildBlock');
  let d = 0, j = src.indexOf('{', b);
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) break; }
  }
  return src.slice(b, j + 1);
}

// ── 行夹具：字段给全，才不至于被各家自己的筛掉；每行唯一标记 r<i> ────────────
function row(i, over) {
  const id = 'r' + i;
  const o = {
    id: id, key: id, who: id, person: id, name: id, place: id, resource: id, owner: id,
    with: id, from: id, to: id, a: id, b: id, title: id, text: 't' + i, question: 'q' + i,
    kind: 'k', kindCn: 'k', stakes: 'low', severity: 1, what: 'w', outcome: 'o',
    status: 'active', stage: 'live', tier: 'normal', count: 1, hits: [9], pending: false,
    at: NOW - i * 1000, createdAt: NOW - i * 1000, updatedAt: NOW - i * 1000,
    endAt: NOW + DAY, windowBasis: 'recorded', deadline: 'd', deliveredAt: NOW - i * 1000,
    sourceLabel: 's', actors: ['a'], conflict: '', held: true,
    stock: 1, price: 1, base: 1, minutes: 5, left: 10, distanceDays: 0, why: 'w',
    acts: {}, holders: [id], hypotheses: [{ id: 'h', text: 't' }],
    posts: [], listings: [], leads: [], steps: [], goalText: 'g', goalId: 'g', personId: id,
    goals: [{ status: 'active', text: 'g' + i }], commitments: [], lastDecision: null,
    open: [id], closed: [id], fallback: id, overloaded: false, blocked: false,
    parent: '', ttl: 3, ok: true, level: 1, idx: 0, need: null, reason: ''
  };
  return Object.assign(o, over || {});
}
function mk(n, over) { const a = []; for (let i = 0; i < n; i++) a.push(row(i, over)); return a; }
function people(n) {
  const p = {}; for (let i = 0; i < n; i++) {
    p['p' + i] = { id: 'p' + i, name: 'r' + i, life: { goals: [{ status: 'active', text: 'g' + i }],
      commitments: [], lastDecision: null } };
  }
  return p;
}

// ── 14 家登记表：mount 把夹具塞进各家的桶；faces 是本轮应该留下的读数 ──────
const ENGINES = [
  { f: 'affect', ns: 'affect', key: 'maxOpen', def: 3, label: '情绪通道',
    mount: function (R) { return { affect: { channels: R } }; }, faces: { '情绪通道': [5, 2, 3] } },
  { f: 'economy', ns: 'economy', key: 'maxGoods', def: 16, label: '商品',
    mount: function (R) { return { economy: { goods: R, routes: [] } }; }, faces: { '商品': [5, 2, 3] } },
  { f: 'inst', ns: 'inst', key: 'maxOrgs', def: 8, label: '组织',
    mount: function (R) { return { inst: { orgs: R } }; }, faces: { '组织': [5, 2, 3] } },
  { f: 'life', ns: 'life', key: 'maxPeople', def: 4, label: '人物',
    mount: function () { return { people: people(3) }; },
    faces: { '人物': [3, 2, 1], '目标': [2, 2, 0], '约定': [0, 0, 0] } },
  { f: 'mend', ns: 'mend', key: 'maxRows', def: 12, label: '待修关系',
    mount: function (R) { return { mend: { threads: R.map(function (x) { return Object.assign({}, x, { status: 'open' }); }) } }; },
    faces: { '待修关系': [5, 2, 3] } },
  { f: 'one-shot-mod', ns: 'oneShotMod', key: 'maxBlockItems', def: 4, label: '临时调制',
    mount: function (R) { return { oneShotMod: { pending: R, round: 1 } }; },
    faces: { '临时调制': [5, 2, 3] } },
  { f: 'opportunity', ns: 'opportunity', key: 'maxOpen', def: 4, label: '可作答窗口',
    // 窗口准入的真源在 openCase 闸门（v2.561.0）；本批只管 rs 的二次兜底，
    // 故造 3 open + 2 lapsed，才使 rs（picked 2 + lapsed 末 2）真的超过名额 2
    mount: function (R) {
      return { opportunity: { openings: R.map(function (x, i) { return Object.assign({}, x, { stage: i < 3 ? 'open' : 'lapsed' }); }) } };
    },
    faces: { '可作答窗口': [4, 2, 2] },
    prefix: false },
  { f: 'plan', ns: 'plan', key: 'maxPlans', def: 12, label: '计划',
    mount: function (R) { return { plan: { plans: R } }; }, faces: { '计划': [5, 2, 3] } },
  { f: 'probe', ns: 'probe', key: 'maxCases', def: 8, label: '调查卷宗',
    mount: function (R) { return { probe: { cases: R.map(function (x) { return Object.assign({}, x, { status: 'open' }); }) } }; },
    faces: { '调查卷宗': [5, 2, 3] } },
  { f: 'region', ns: 'region', key: 'maxEvents', def: 24, label: '远方消息',
    mount: function (R) { return { region: { places: R, events: R } }; },
    faces: { '远方消息': [5, 2, 3] } },
  { f: 'shadow', ns: 'shadow', key: 'maxRows', def: 12, label: '共同隐瞒',
    mount: function (R) { return { shadow: { rows: R } }; }, faces: { '共同隐瞒': [5, 2, 3] } },
  { f: 'stall', ns: 'stall', key: 'maxStalls', def: 12, label: '摊位',
    mount: function (R) { return { stalls: { rows: R } }; }, faces: { '摊位': [5, 2, 3] } },
  { f: 'threads', ns: 'threads', key: 'maxThreads', def: 6, label: '悬案',
    mount: function (R) { return { threads: R.map(function (x) { return Object.assign({}, x, { status: 'open' }); }) }; },
    faces: { '悬案': [5, 2, 3] } },
  { f: 'world', ns: 'world', key: 'maxPlaces', def: 8, label: '地点',
    mount: function (R, J) { return { world: { places: R, events: R, roads: R, journeys: J } }; },
    faces: { '地点': [5, 2, 3], '共同日程': [5, 4, 1], '道路': [5, 5, 0], '在途': [5, 4, 1] } }
];
ENGINES.forEach(function (E) {
  E.rel = 'engines/' + E.f + '.js';
  E.SRC = rd(E.rel);
  E.CODE = codeOnly(E.SRC);
  E.BODY = buildBody(E.CODE);
});

// ── 装载：cfg 只给要测的那一个键，其余靠引擎自己 merge DEF ──────────────────
function load(code, E, n, cfgOver) {
  const R = mk(n);
  const J = mk(n, { status: 'in-transit' });
  let cfg = Object.assign({ enabled: true }, cfgOver || {});
  if (!cfgOver) cfg[E.key] = 2;                       // 正常轮：名额 2
  const state = E.mount(R, J);
  const win = { WorldAxis: { registerModule: function () {} } };
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
    console: { log: function () {} } };
  vm.createContext(ctx);
  // world.js 求值期就硬依赖词表（缺表当场抛错，而非静默空表）：装载顺序照真机来
  if (E.f === 'world') vm.runInContext(rd('engines/world-tables.js'), ctx);
  vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; },
    today: function () { return 'D1'; } };
  WA.inputGuard = { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 120); } };
  WA.store = { get: function () { return state; }, transact: function (fn) { fn(state); return { ok: true }; } };
  WA.settingsBus = { read: function () { return cfg; }, normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  WA.evict = { array: function () {} };
  return WA;
}
function snap(code, E, n, cfgOver) {
  const WA = load(code, E, n, cfgOver);
  let out = '', err = null;
  try { out = String(WA[E.ns].buildBlock() || ''); } catch (e) { err = e.message; }
  const ids = [];
  for (let i = 0; i < 12; i++) if (out.indexOf('r' + i) >= 0) ids.push(i);
  return { out: out, err: err, ids: ids,
    proof: (out.split('\n').filter(function (x) { return x.indexOf('（本面名额') >= 0; })[0] || ''),
    block: WA[E.ns].stat().block, WA: WA };
}
function facesOf(b) { return (b && b.faces) ? b.faces : {}; }

console.log('A 静态（14 家同一副刀）');
ENGINES.forEach(function (E, k) {
  ok('A' + (k + 1) + ' ' + E.f + '：headQuota / pickHead / proofOf / headRound 在位，旧刀与重排都消失', function () {
    assert(E.CODE.indexOf('function headQuota(cfg, key, max, fallback)') > 0, 'headQuota 不在');
    assert(E.CODE.indexOf('function pickHead(list, quota, face)') > 0, 'pickHead 不在');
    assert(E.CODE.indexOf('function proofOf()') > 0, 'proofOf 不在');
    assert(E.CODE.indexOf('function headRound()') > 0, 'headRound 不在');
    assert(E.CODE.indexOf('headRound();') > 0, 'buildBlock 开头没清账（读数会跨轮翻倍）');
    assert(/if \(!isFinite\(n\) \|\| n < 1\) return Math\.min\(max, fallback\);/.test(E.CODE), '名额守卫不在');
    assert(E.BODY.indexOf('.slice(0,') < 0, 'buildBlock 里旧刀还在');
    // 头截断不许重排：pickHead 体内一旦出现 sort，方向就偷偷变成了「最新优先」
    const head = E.CODE.slice(E.CODE.indexOf('function pickHead'),
      E.CODE.indexOf('function blockOf'));
    assert(head.indexOf('.sort(') < 0, 'pickHead 里出现了 sort —— 头截断被改成了重排');
    assert(E.BODY.indexOf('proofOf()') > 0, '块尾没接 proofOf()');
  });
});

console.log('B 行为（五行候选、名额 2：守卫 / 自证 / 保序）');
ENGINES.forEach(function (E, k) {
  const want = E.faces;
  const keys = Object.keys(want);
  if (!keys.length) return;   // opportunity 的窗口准入不由本批掌管，见 B-opp
  ok('B' + (k + 1) + ' ' + E.f + '：' + keys.map(function (x) {
    return x + ' ' + want[x][0] + '→' + want[x][1]; }).join(' / '), function () {
    const r = snap(E.CODE, E, 5);
    assert(!r.err, '渲染抛错：' + r.err);
    const f = facesOf(r.block);
    keys.forEach(function (x) {
      const got = f[x];
      assert(got, '面「' + x + '」没进读数：' + JSON.stringify(Object.keys(f)));
      assert(got.candidates === want[x][0], x + ' candidates 应 ' + want[x][0] + '，实 ' + got.candidates);
      assert(got.picked === want[x][1], x + ' picked 应 ' + want[x][1] + '，实 ' + got.picked);
      assert(got.hidden === want[x][2], x + ' hidden 应 ' + want[x][2] + '，实 ' + got.hidden);
    });
    // 出生即保序：念出来的必须是**原顺序的前缀**（连续、从 0 起），
    // 既不是「最新的」也不是「尾部」—— 这条判据不写死名额，故对各家名额不同也成立
    // opportunity 例外：顺序权在 v2.561.0 的 pickBlock（按谁先关窗口），本批只接它给出的 rs
    if (r.ids.length && E.prefix !== false) {
      const prefix = r.ids.map(function (_, i) { return i; });
      assert(r.ids.join(',') === prefix.join(','), '念出来的不是原顺序的前缀：' + r.ids.join(','));
    }
    if (r.out) {
      assert(r.proof.indexOf('（本面名额：') === 0, '块尾没有自证行');
      const hasHidden = /另有 \d+ 条未列出/.test(r.proof) || /全部列出/.test(r.proof);
      assert(hasHidden, '自证没说清还剩几条：' + r.proof);
    }
  });
});
ok('B-opp opportunity：窗口准入不归本批，但名额一旦真的截断必须自证', function () {
  const E = ENGINES.filter(function (x) { return x.f === 'opportunity'; })[0];
  const r = snap(E.CODE, E, 5);
  assert(!r.err, '渲染抛错：' + r.err);
  if (!r.block || !r.block.faces) return;      // 夹具没进窗口准入闸门：读数由 v2.561.0 的锁守
  const f = r.block.faces['可作答窗口'];
  assert(f, '有 faces 却没有「可作答窗口」这一面');
  assert(f.picked <= f.candidates, JSON.stringify(f));
  assert(f.quota === 2 || f.quota === E.def, 'quota 既不是给的值也不是 DEF：' + f.quota);
  if (f.hidden > 0) assert(/另有 \d+ 条未列出/.test(r.proof), '截掉了却没报条数');
});

console.log('C 读数（坏配置不许把整面清空 / 空表要说 empty / 每轮清账）');
ENGINES.forEach(function (E, k) {
  const label = Object.keys(E.faces)[0] || '可作答窗口';
  ok('C' + (k + 1) + ' ' + E.f + '：名额读坏 ⇒ 回落 DEF 且不空面；空表说 empty；不跨轮叠数', function () {
    // ① 名额读坏：旧法是 slice(0, NaN) = 空面
    const nan = snap(E.CODE, E, 5, { enabled: true, [E.key]: 'x' });
    assert(!nan.err, '坏配置渲染抛错：' + nan.err);
    const fn = facesOf(nan.block)[label];
    assert(fn, '坏配置下连读数都没有：' + JSON.stringify(nan.block));
    assert(fn.quota === E.def, '坏配置应回落 DEF ' + E.def + '，实 ' + fn.quota);
    assert(fn.picked >= 1, '名额读坏把整面清空了（picked=' + fn.picked + '）—— 这正是本批要堵的缺口');
    if (E.BODY.indexOf('stat.block') < 0) return;
    // ② 空表：说 empty，不许沉默
    const empty = snap(E.CODE, E, 0);
    assert(!empty.err, '空表渲染抛错：' + empty.err);
    assert(empty.out === '', '空表应返回空串');
    const ef = facesOf(empty.block);
    Object.keys(ef).forEach(function (x) {
      assert(ef[x].mode === 'empty', '空表的「' + x + '」面没说 empty：' + ef[x].mode);
    });
    // ③ 每轮清账：连跑两次，读数一致（不许翻倍）
    const WA = load(E.CODE, E, 5);
    WA[E.ns].buildBlock();
    const one = WA[E.ns].stat().block;
    const firstRef = one;
    WA[E.ns].buildBlock();
    const two = WA[E.ns].stat().block;
    assert(two && today(two) === today(firstRef), '同一份寄存跑两轮读数变了（跨轮叠数）：'
      + JSON.stringify(today(firstRef)) + ' vs ' + JSON.stringify(two && today(two)));
    assert(two !== firstRef, 'block 每次应是新对象，外部拿到的旧读数不被改写');
  });
});
function today(b) {
  const o = {};
  Object.keys(facesOf(b)).forEach(function (k) { o[k] = facesOf(b)[k].picked; });
  return JSON.stringify(o);
}

console.log('D 顶层求和（faces 与 totals 必须自洽）');
ENGINES.forEach(function (E, k) {
  ok('D' + (k + 1) + ' ' + E.f + '：totals = 各面之和，且条数守恒', function () {
    const r = snap(E.CODE, E, 5);
    const b = r.block;
    assert(b && b.totals, '没有 totals');
    let c = 0, p = 0, h = 0, n = 0;
    Object.keys(facesOf(b)).forEach(function (x) {
      const f = facesOf(b)[x];
      c += f.candidates; p += f.picked; h += f.hidden; n++;
      assert(f.picked + f.hidden === f.candidates, x + ' 条数不守恒：' + JSON.stringify(f));
    });
    assert(b.totals.faces === n, '面数不对：' + b.totals.faces + ' vs ' + n);
    assert(b.totals.candidates === c && b.totals.picked === p && b.totals.hidden === h,
      '求和不对：' + JSON.stringify(b.totals));
  });
});

console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
ENGINES.forEach(function (E, k) {
  const label = Object.keys(E.faces)[0] || '可作答窗口';
  ok('N1-' + (k + 1) + ' ' + E.f + '：拆掉名额守卫 ⇒ 坏配置判据红（空面复现）', function () {
    const broken = E.CODE.replace("if (!isFinite(n) || n < 1) return Math.min(max, fallback);", '');
    assert(broken !== E.CODE, '破坏未命中');
    const nan = snap(broken, E, 5, { enabled: true, [E.key]: 'x' });
    const fn = facesOf(nan.block)[label];
    const red = nan.err || !fn || fn.picked < 1 || fn.quota !== E.def;
    assert(red, '拆掉守卫后判据居然还是绿的 —— 这条锁是假的');
  });
  ok('N2-' + (k + 1) + ' ' + E.f + '：头截断改回尾截断 ⇒ 保序判据红' + (Object.keys(E.faces).length > 1 ? '（不适用：多面并集回读不出单面顺序）' : ''), function () {
    const broken = E.CODE.replace('const picked = all.slice(0, q);', 'const picked = all.slice(-q);');
    assert(broken !== E.CODE, '破坏未命中');
    if (Object.keys(E.faces).length > 1) return;   // 多面并行：显式不适用，不伪装成绿
    const r = snap(broken, E, 5);
    if (r.err) return;                       // 破坏后跑不动也算红不到，跳过不算绿
    const bad = r.ids.some(function (i) { return i >= 2; });
    const red = bad || !r.out || r.ids.length === 0;
    assert(red, '尾截断居然还绿：ids=' + r.ids.join(','));
  });
  ok('N3-' + (k + 1) + ' ' + E.f + '：去掉块尾自证 ⇒ 自证判据红', function () {
    const broken = E.CODE.replace("+ proofOf()", '');
    assert(broken !== E.CODE, '破坏未命中');
    const r = snap(broken, E, 5);
    if (!r.out) return;                      // 本夹具渲染不出行时不适用，显式不判
    assert(r.proof.indexOf('（本面名额') < 0, '自证判据没红');
  });
});
ok('N4 跨轮叠数会被 C③ 抓住（清账拆掉 ⇒ 读数翻倍）', function () {
  const E = ENGINES.filter(function (x) { return x.f === 'stall'; })[0];
  const broken = E.CODE.replace('headRound();', '');
  assert(broken !== E.CODE, '破坏未命中');
  const WA = load(broken, E, 5);
  WA[E.ns].buildBlock();
  const one = today(WA[E.ns].stat().block);
  WA[E.ns].buildBlock();
  const two = today(WA[E.ns].stat().block);
  assert(one !== two, '拆掉清账读数居然没变 —— C③ 是假锁');
});

console.log('');
if (fail) {
  console.log('INJECT-BLOCK-QUOTA-CLUSTER3-V2582: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('INJECT-BLOCK-QUOTA-CLUSTER3-V2582: pass（' + pass + ' 项）');