#!/usr/bin/env node
'use strict';
/**
 * tests/intent-quota-v2557.js —— 「人物意图注入名额」分配判据专锁（v2.557.0）
 *
 * 治的缺口（本文件存在的唯一理由）：`engines/intent-board.js` 的 `buildBlock()`。
 *
 *   它是「人物意图（只列受阻）」这张台账的唯一出口（`render/inject.js` 每轮调）。
 *   到本批之前它这样选材：
 *
 *       const b = board();                                   // ① board() 按人物在 store 里的顺序
 *                                                            //    取前 maxRows 个**有链**的人
 *       const stuck = b.rows.filter(r => r.isBlocked);        // ② 再筛受阻
 *       stuck.slice(0, cfg.maxRows)                          // ③ 再取前 maxRows
 *
 *   两处截断都在筛之前。后果比「提错人」更极端：**整块消失**。
 *   实测（people = 甲(不卡) / 乙(不卡) / 丙(卡着)，maxRows = 2）：
 *       board().rows = [甲, 乙]（面板语义没错）
 *       stuck = []          ⇒ buildBlock() === ''（空串）
 *   真正卡着的丙**一个字都进不来** —— 正文模型永远不知道有人卡在那一步。
 *
 *   （这就是 v2.555.0 foreshadow / v2.556.0 dormant-ladder 治过的同一个病，**第三处**。
 *    前两处是「提错人」，这一处是「整块消失」，所以它自己也值得一条锁。）
 *
 * 本批做的三件事：
 *   · `buildBlock` 不再借 `board()` 的截断 —— 自己遍历**全部**人物，只留受阻的（先筛）；
 *   · `pickBlock`：`tries` 降序（卡得最久优先）+ 同 tries 按 name 字典序；名额够就原样全进；
 *   · 名额面读数进 `stat().block`（`people / candidates / picked / quota / mode`）。
 *     **不带时间戳**：本模块是纯读取（没有时钟），造一个 `at` 就是「猜」。
 *
 * 口径（判据的边界）：
 *   ① 先筛后截：候选 = 全部人物里所有受阻的，筛完才谈名额；
 *   ② 卡得最久优先：`tries` 是链上现成字段，**不新造评分**；
 *   ③ 名额够时原样全进、顺序不变（fail-open）；
 *   ④ `board()` 的面板语义**不动** —— 它按 maxRows 截断是它的本分（面板要一屏能扫完），
 *      本批只把「注入面」的选材从它身上摘下来。B2 那条判据就是钉这件事。
 *
 * 判据结构：
 *   A 静态（不借 board 的截断 / 判据只有一个正身 / 遍历全部人物 / 缺席留痕 / 读数有读面）
 *   B 行为（主局面丙进得来 / 面板语义不变 / 名额够不变 / tries 序 / id 序 / 没卡点不进）
 *   C 读数（五栏 / 拷贝 / 空表与没构建过 / mode 三态 / candidates ≠ picked / reset 清零）
 *   N 负控（改回借 board ⇒ B 红；改回按序切片 ⇒ B 红；读数不拷贝 ⇒ C2 红）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/intent-board.js';

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

/** 装载（真源码 or 破坏副本）：真 vm + 最小 WA（store.people + plan.chain 桩）。 */
function load(code, spec) {
  const people = spec.people || {};
  const chains = spec.chains || {};
  let cfg = Object.assign({ enabled: true, maxRows: 8, maxRest: 3 }, spec.cfg || {});
  const WA = {
    store: { get: function () { return { people: people }; } },
    plan: { chain: function (name) { return chains[name] ? chains[name]() : { ok: false, reason: 'no-plan' }; } },
    settingsBus: {
      read: function () { return cfg; },
      normalize: function (r, v) { return v; },
      saveOrThrow: function (r, v) { cfg = v; return { ok: true }; }
    },
    registerModule: function () {}
  };
  if (spec.noPlan) delete WA.plan;
  require('./synth-host.js').hostStub(WA);
  const win = { WorldAxis: WA };
  vm.runInNewContext(code, {
    window: win, Date: Date, Number: Number, String: String, Array: Array,
    Object: Object, isFinite: isFinite, Math: Math, JSON: JSON
  }, { filename: REL });
  return { api: win.WorldAxis.intentBoard, setCfg: function (p) { cfg = Object.assign({}, cfg, p); }, WA: WA };
}
/** 一条能出行的链：blocked 时带 tries 与 blockedBy。 */
function chainOf(name, opt) {
  const o = opt || {};
  const base = { ok: true, goalId: 'g_' + name, goalText: name + '的目标', goalStatus: 'active',
    total: 3, done: 0, rest: [{ seq: 2, text: '后续' }], drift: false,
    step: { seq: 1, kind: 'act', text: '这一步', status: 'pending' } };
  if (o.blocked) {
    return Object.assign({}, base, { status: 'blocked', tries: o.tries || 0,
      blockedBy: [{ kind: 'need', detail: '银元×' + (o.need || 3) }] });
  }
  return Object.assign({}, base, { status: 'running', tries: o.tries || 0, blockedBy: [] });
}
/** 从注入块里取出人名（行形态：`甲 → 目标：...；乙 → ...`）。 */
function namesIn(block) {
  if (!block) return [];
  return block.replace(/^【人物意图（只列受阻）】/, '').split('；')
    .map(function (s) { return s.split(' → ')[0].trim(); })
    .filter(function (s) { return !!s; });
}
/** 主局面：甲、乙不卡；丙卡着（tries=3），maxRows=2。 */
function mainSpec(cfg) {
  return {
    people: { p_jia: { name: '甲' }, p_yi: { name: '乙' }, p_bing: { name: '丙' } },
    chains: { '甲': function () { return chainOf('甲'); }, '乙': function () { return chainOf('乙'); },
      '丙': function () { return chainOf('丙', { blocked: true, tries: 3 }); } },
    cfg: Object.assign({ maxRows: 2 }, cfg || {})
  };
}
/** 一条判据、多个局面 —— 供 N 段对**同一条**判据做负控。 */
function quotaProblems(code) {
  const bad = [];
  // ① 主局面：丙必须进得来（旧版是空串）
  const A = load(code, mainSpec());
  const blk = A.api.buildBlock();
  const got = namesIn(blk);
  if (got.indexOf('丙') < 0) bad.push('受阻的丙没进注入块（实 ' + JSON.stringify(got) + '）—— 旧版这里返回空串');
  if (got.indexOf('甲') >= 0 || got.indexOf('乙') >= 0) bad.push('没卡点的人不许进（实 ' + JSON.stringify(got) + '）');
  const st = A.api.stat().block || {};
  if (st.people !== 3) bad.push('读数 people 应为 3（实 ' + st.people + '）—— 必须遍历全部人物，不是 board 的前 2 个');
  if (st.candidates !== 1) bad.push('读数 candidates 应为 1（实 ' + st.candidates + '）');
  if (st.picked !== 1) bad.push('读数 picked 应为 1（实 ' + st.picked + '）');
  if (st.mode !== 'all-fit') bad.push('mode 应为 all-fit（实 ' + st.mode + '）');

  // ② 面板语义不动：board() 仍按 maxRows 截断
  const b = A.api.board();
  if (b.rows.length !== 2) bad.push('board() 应按 maxRows=2 截断（实 ' + b.rows.length + '）—— 面板语义不许被本批改掉');
  if (b.rows.map(function (r) { return r.name; }).join(',') !== '甲,乙') {
    bad.push('board() 的顺序应是人物在场顺序（实 ' + b.rows.map(function (r) { return r.name; }).join(',') + '）');
  }

  // ③ 卡得最久优先：四人受阻，tries 3/1/5/2，maxRows=2 ⇒ 应取 5 与 3 那两个
  const B = load(code, {
    people: { p1: { name: 'A' }, p2: { name: 'B' }, p3: { name: 'C' }, p4: { name: 'D' } },
    chains: {
      'A': function () { return chainOf('A', { blocked: true, tries: 3 }); },
      'B': function () { return chainOf('B', { blocked: true, tries: 1 }); },
      'C': function () { return chainOf('C', { blocked: true, tries: 5 }); },
      'D': function () { return chainOf('D', { blocked: true, tries: 2 }); }
    },
    cfg: { maxRows: 2 }
  });
  const gotB = namesIn(B.api.buildBlock());
  if (gotB[0] !== 'C' || gotB[1] !== 'A') {
    bad.push('应按 tries 降序取 2 个（期望 C,A，实 ' + JSON.stringify(gotB) + '）');
  }
  if ((B.api.stat().block || {}).mode !== 'most-stuck') bad.push('多人受阻时 mode 应为 most-stuck');
  if ((B.api.stat().block || {}).candidates !== 4) bad.push('candidates 应为 4（实 ' + (B.api.stat().block || {}).candidates + '）');

  // ④ 名额够就全进、顺序不变
  const C = load(code, {
    people: { p1: { name: 'A' }, p2: { name: 'B' } },
    chains: { 'A': function () { return chainOf('A', { blocked: true, tries: 1 }); },
      'B': function () { return chainOf('B', { blocked: true, tries: 9 }); } },
    cfg: { maxRows: 8 }
  });
  const gotC = namesIn(C.api.buildBlock());
  if (JSON.stringify(gotC) !== JSON.stringify(['A', 'B'])) {
    bad.push('名额够时不许重排（期望 A,B，实 ' + JSON.stringify(gotC) + '）');
  }
  if ((C.api.stat().block || {}).mode !== 'all-fit') bad.push('名额够时 mode 应为 all-fit');
  return bad;
}

// ══════════════════ A 静态 ══════════════════
ok('A1 buildBlock 不再借 board() 的截断（代码里 `const b = board();` 在 buildBlock 内 0 处）', function () {
  const i = CODE.indexOf('function buildBlock(');
  assert.ok(i >= 0, 'buildBlock 定义在位');
  const body = CODE.slice(i, CODE.indexOf('\n  function ', i + 10) >= 0 ? CODE.indexOf('\n  function ', i + 10) : CODE.length);
  assert.strictEqual(body.indexOf('board()'), -1, 'buildBlock 里还在调 board() ⇒ 候选仍被面板的 maxRows 截断');
  assert.strictEqual(body.indexOf('stuck.slice(0, cfg.maxRows)'), -1, '按序切片还在');
  assert.ok(body.indexOf('personNames()') >= 0, '必须自己遍历全部人物');
});
ok('A2 名额分配只有一个正身：pickBlock 恰 1 处定义，且 buildBlock 真调它', function () {
  assert.strictEqual(CODE.split('function pickBlock(').length - 1, 1, 'pickBlock 应恰 1 处定义');
  assert.strictEqual(CODE.split('= pickBlock(stuck, cfg.maxRows)').length - 1, 1, 'buildBlock 应恰调 1 次');
});
ok('A3 缺席要留痕：plan 不在场时 buildBlock 也 fault（不是静静返回空串）', function () {
  const n = CODE.split("fault('no-plan-engine')").length - 1;
  assert.strictEqual(n, 2, 'board 与 buildBlock 各一处（实 ' + n + '）');
  const A = load(SRC, { people: { p1: { name: '甲' } }, noPlan: true });
  assert.strictEqual(A.api.buildBlock(), '', 'plan 缺席时注入块为空');
  assert.ok((A.api.stat().faults || {})['no-plan-engine'] >= 1, '必须记进 faults（实 ' + JSON.stringify(A.api.stat().faults) + '）');
});
ok('A4 名额面读数有读面：stat() 带 block（拷贝出去）、reset 清它，且 tool-diag 诊断节真读', function () {
  assert.ok(CODE.indexOf('block: __stat.block ? Object.assign({}, __stat.block) : null') >= 0, 'stat 应投影 block 且是拷贝');
  assert.ok(CODE.indexOf('__stat.block = null') >= 0, 'reset 要清 block（否则读数跨局残留）');
  const td = codeOnly(rd('engines/tool-diag.js'));
  assert.ok(td.indexOf('function secIntentBoard()') >= 0, 'tool-diag 应有意图看板诊断节');
  assert.ok(td.indexOf('intentBoard: secIntentBoard()') >= 0, '该节必须真被 collect 调用');
  assert.ok(td.indexOf('block: st.block || null') >= 0, '节里要真取名额面读数（不是只报 boards/rows）');
});
ok('A5 不造不存在的东西：读数里没有时间戳（本模块无时钟，造 at 就是猜）', function () {
  const i = CODE.indexOf('__stat.block = {');
  assert.ok(i >= 0, 'block 落账在位');
  const seg = CODE.slice(i, i + 400);
  assert.strictEqual(seg.indexOf('at:'), -1, 'block 里不许有 at —— 本模块没有时钟');
  assert.strictEqual(CODE.indexOf('clockNow'), -1, '本模块仍应零时钟依赖');
});

// ══════════════════ B 行为 ══════════════════
ok('B1 主局面（甲/乙不卡、丙卡着，maxRows=2）：受阻的丙必须进得来（旧版这里是空串）', function () {
  const bad = quotaProblems(SRC);
  assert.deepStrictEqual(bad, [], '判据不通过：\n    · ' + bad.join('\n    · '));
});
ok('B2 面板语义不动：board() 仍按 maxRows 截断，且顺序是人物在场顺序', function () {
  const A = load(SRC, mainSpec());
  const b = A.api.board();
  assert.strictEqual(b.rows.length, 2, '面板要一屏能扫完（实 ' + b.rows.length + ' 行）');
  assert.strictEqual(b.rows.map(function (r) { return r.name; }).join(','), '甲,乙');
  assert.strictEqual(b.capped, true, 'capped 要如实报（还有没进看板的人）');
});
ok('B3 没人受阻时注入块为空串（零 token），但名额面读数要有', function () {
  const A = load(SRC, {
    people: { p1: { name: '甲' } },
    chains: { '甲': function () { return chainOf('甲'); } },
    cfg: { maxRows: 8 }
  });
  assert.strictEqual(A.api.buildBlock(), '', '没人受阻就不许有块');
  const st = A.api.stat().block;
  assert.ok(st && st.picked === 0, '构建过但空表 ⇒ picked 为 0（实 ' + JSON.stringify(st) + '）');
  assert.strictEqual(st.candidates, 0);
});
ok('B4 卡得最久优先：四人受阻 tries=3/1/5/2，maxRows=2 ⇒ 取 tries 最大的两个且降序', function () {
  const A = load(SRC, {
    people: { p1: { name: 'A' }, p2: { name: 'B' }, p3: { name: 'C' }, p4: { name: 'D' } },
    chains: {
      'A': function () { return chainOf('A', { blocked: true, tries: 3 }); },
      'B': function () { return chainOf('B', { blocked: true, tries: 1 }); },
      'C': function () { return chainOf('C', { blocked: true, tries: 5 }); },
      'D': function () { return chainOf('D', { blocked: true, tries: 2 }); }
    },
    cfg: { maxRows: 2 }
  });
  assert.deepStrictEqual(namesIn(A.api.buildBlock()), ['C', 'A'], '应取 tries 最大的两个（降序）');
});
ok('B5 同 tries 按 name 字典序（同输入同输出，可复算）', function () {
  const A = load(SRC, {
    people: { p1: { name: 'm' }, p2: { name: 'a' } },
    chains: { 'm': function () { return chainOf('m', { blocked: true, tries: 2 }); },
      'a': function () { return chainOf('a', { blocked: true, tries: 2 }); } },
    cfg: { maxRows: 1 }
  });
  assert.deepStrictEqual(namesIn(A.api.buildBlock()), ['a'], '同 tries 应 id/name 字典序在前');
});
ok('B6 没卡点的人永不进注入块（省 token）—— 这一条是旧锁 D7 的性质，本批不许弄丢', function () {
  const A = load(SRC, mainSpec({ maxRows: 8 }));
  const got = namesIn(A.api.buildBlock());
  assert.deepStrictEqual(got, ['丙'], '只列受阻的（实 ' + JSON.stringify(got) + '）');
  assert.ok(A.api.buildBlock().indexOf('缺 银元×3') > 0, '卡点文案要逐字带上');
});
ok('B7 只读：构建注入块后世界存档逐字未变', function () {
  const A = load(SRC, mainSpec());
  const snap = function () { return JSON.stringify(A.WA.store.get()); };
  const before = snap();
  A.api.buildBlock();
  A.api.board();
  A.api.stat();
  assert.strictEqual(snap(), before, '看板 / 注入块全程只读');
});

// ══════════════════ C 读数 ══════════════════
ok('C1 stat().block 五栏齐全，picked 与注入块人数一致', function () {
  const A = load(SRC, mainSpec({ maxRows: 8 }));
  const got = namesIn(A.api.buildBlock());
  const st = A.api.stat().block;
  assert.ok(st && typeof st === 'object', '构建过之后应有 block');
  ['people', 'candidates', 'picked', 'quota', 'mode'].forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(st, k), '缺栏：' + k);
  });
  assert.strictEqual(st.picked, got.length, '读数与块必须同源（' + st.picked + ' vs ' + got.length + '）');
  assert.strictEqual(st.people, 3, 'people 应是全部人物数（实 ' + st.people + '）');
  assert.strictEqual(st.quota, 8, 'quota 应是 maxRows（实 ' + st.quota + '）');
});
ok('C2 block 是拷贝不是引用（改返回值不许污染下一次读数）', function () {
  const A = load(SRC, mainSpec());
  A.api.buildBlock();
  const b1 = A.api.stat().block;
  b1.picked = 999; b1.mode = 'tampered';
  const b2 = A.api.stat().block;
  assert.notStrictEqual(b2.picked, 999, '返回值是引用 ⇒ 读数能被外部改写');
  assert.notStrictEqual(b2.mode, 'tampered', '返回值是引用 ⇒ mode 能被外部改写');
});
ok('C3 「构建过但空表」与「从没构建过」是两个读数（picked:0 vs null）', function () {
  const A = load(SRC, mainSpec());
  assert.strictEqual(A.api.stat().block, null, '还没构建过时必须是 null —— 不许拿 0 冒充');
  A.api.buildBlock();
  assert.ok(A.api.stat().block && A.api.stat().block.picked >= 0, '构建过之后必有对象');
});
ok('C4 mode 三态可分辨（all-fit / most-stuck / empty）', function () {
  const A = load(SRC, mainSpec({ maxRows: 8 }));
  A.api.buildBlock();
  assert.strictEqual(A.api.stat().block.mode, 'all-fit');
  const B = load(SRC, {
    people: { p1: { name: 'A' }, p2: { name: 'B' } },
    chains: { 'A': function () { return chainOf('A', { blocked: true, tries: 2 }); },
      'B': function () { return chainOf('B', { blocked: true, tries: 1 }); } },
    cfg: { maxRows: 1 }
  });
  B.api.buildBlock();
  assert.strictEqual(B.api.stat().block.mode, 'most-stuck');
  const C = load(SRC, { people: { p1: { name: '甲' } }, chains: { '甲': function () { return chainOf('甲'); } } });
  C.api.buildBlock();
  assert.strictEqual(C.api.stat().block.mode, 'empty');
});
ok('C5 candidates 与 picked 不许恒等（多人受阻时名额面必须真起作用）', function () {
  const A = load(SRC, {
    people: { p1: { name: 'A' }, p2: { name: 'B' }, p3: { name: 'C' } },
    chains: { 'A': function () { return chainOf('A', { blocked: true, tries: 3 }); },
      'B': function () { return chainOf('B', { blocked: true, tries: 2 }); },
      'C': function () { return chainOf('C', { blocked: true, tries: 1 }); } },
    cfg: { maxRows: 2 }
  });
  A.api.buildBlock();
  const st = A.api.stat().block;
  assert.strictEqual(st.candidates, 3, '候选 3 条（实 ' + st.candidates + '）');
  assert.strictEqual(st.picked, 2, '只提 2 条（实 ' + st.picked + '）');
  assert.notStrictEqual(st.candidates, st.picked, '两个数若恒等，说明「名额」是个假读数');
});
ok('C6 reset 清 block（否则下一局的读数会顶着上一局的身）', function () {
  const A = load(SRC, mainSpec());
  A.api.buildBlock();
  assert.ok(A.api.stat().block, '先构建一次');
  A.api.reset();
  assert.strictEqual(A.api.stat().block, null, 'reset 之后必须回到 null');
});

// ══════════════════ N 负控 ══════════════════
ok('N1 负控：把 buildBlock 改回「借 board 的截断」⇒ B 的同一条判据必须现形', function () {
  const ANCHOR = '    const names = personNames();';
  assert.strictEqual(SRC.split(ANCHOR).length - 1, 1, '锚点应唯一');
  const poisoned = SRC.replace(ANCHOR,
    '    const b0 = board(); const names = b0.rows.map(function (r) { return { name: r.name }; });');
  const bad = quotaProblems(poisoned);
  assert.ok(bad.length > 0, '改回借 board 之后判据居然还通过 ⇒ 判据不认这个病灶');
  assert.ok(bad.join('|').indexOf('丙没进注入块') >= 0 || bad.join('|').indexOf('people 应为 3') >= 0,
    '必须点名「丙进不来」或「people 只数了 2 个」（实：' + bad.join(' / ') + '）');
});
ok('N2 负控：把选材改回「按序切片」⇒ tries 序判据必须现形', function () {
  const ANCHOR = '    const pick = pickBlock(stuck, cfg.maxRows);';
  assert.strictEqual(SRC.split(ANCHOR).length - 1, 1, '锚点应唯一');
  const poisoned = SRC.replace(ANCHOR,
    '    const pick = { picked: stuck.slice(0, cfg.maxRows), mode: \'legacy\', quota: cfg.maxRows };');
  const bad = quotaProblems(poisoned);
  assert.ok(bad.join('|').indexOf('tries 降序') >= 0, '按序切片必须被点名（实：' + bad.join(' / ') + '）');
});
ok('N3 负控：读数不拷贝（直接返回同一个对象）⇒ C2 必须现形', function () {
  const ANCHOR = 'block: __stat.block ? Object.assign({}, __stat.block) : null';
  assert.strictEqual(SRC.split(ANCHOR).length - 1, 1, '锚点应唯一');
  const poisoned = SRC.replace(ANCHOR, 'block: __stat.block');
  const A = load(poisoned, mainSpec());
  A.api.buildBlock();
  const b1 = A.api.stat().block;
  assert.ok(b1, '破坏后 stat 仍应给出 block');
  b1.picked = 999;
  assert.strictEqual(A.api.stat().block.picked, 999, '负控没改到东西 ⇒ C2 无效');
});

// ── 收口 ────────────────────────────────────────────────────
console.log('\n人物意图注入名额专锁 v2.557.0：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  fails.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}