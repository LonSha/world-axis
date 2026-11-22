#!/usr/bin/env node
'use strict';
/**
 * tests/probe-cases-quota-v2560.js —— 「调查卷宗准入名额」判据专锁（v2.560.0）
 *
 * 治的缺口（本文件存在的唯一理由）：`engines/probe.js` 的 `openCase()`。
 *
 *   病灶不是「注入面少列几条」，而是**额度被死卷宗占死、新案根本开不进来**：
 *
 *       if (pr.cases.length >= cfg.maxCases) { ...reason:'cases-full'... return false; }
 *
 *   `pr.cases.length` 数的是**全部卷宗**，而 `decide()` 定案后行留着不删
 *   （引擎自己的 STATUS 注释：「closed = 定案或误指留痕，行不删」——
 *     卷宗是复盘材料，不是待办清单）。两件事凑在一起：
 *   办完的案子**永久占着「能开几个案」的名额**，于是一局跑久了，
 *   8 条案子全办完之后，第 9 个案子永远开不出来，而现场 `open = 0`。
 *
 *   实测（/tmp/probe560.js，改造前）：
 *     · r1：开 8 条 → 全结案 → open=0、cases=8 → 第 9 条 `{ok:false,reason:'cases-full',cap:8}`
 *     · r2：开 8 条 → 一条不结 → 第 9 条 `{ok:false,reason:'cases-full',cap:8}`
 *     · r3：两者**逐字相同** —— 「真的办不过来」与「位置被办完的占着」在读数上无法分辨
 *     · r4：`probe.cases` 站的 evict 被调用 8 次，dropped **恒为 0**
 *           —— 引擎头部⑧承诺「三站都走 evict 挤出」，而这条提前 return 让它永远是 noop。
 *           有界靠的是**拒收**，不是挤出。
 *
 * 本批做的四件事：
 *   ① 准入闸门按**未结案条数**卡（`openN >= cfg.maxCases`）。`cases-full` 只在
 *      「真的还有 maxCases 条案子压着没办」时出现，并交出 `open` / `cases` 两栏自证；
 *   ② `core/evict.js` 的 IN_TRANSIT 登记 `probe.cases` 的**未结案行**（在途豁免的正用：
 *      未结案的调查是「未完成的义务」）→ 挤出先保 open，剩余额度才给已结案行；
 *   ③ 卷宗序号改取「现存 id 最大尾号 + 1」。旧写法用 `pr.cases.length` 当尾号——
 *      在「永不删行」的年代它恰好单调；挤出一旦生效，`length` 会变小，
 *      同毫秒连开两案就撞号（实测 r7：两条 id 都是 `case_1700000000000_7`），
 *      而撞号不是「id 难看」：`findCase` 取第一条，新案永远结不了；
 *   ④ 读数：`stat.recycled`（已结案卷宗为腾位置被回收几条）/ `statView().openCap`。
 *      「满」与「回收」是两个读数，不许混成一个。
 *
 * 判据结构：
 *   A 静态（旧判据消失 / 准入判据只有一个正身 / 序号只有一处生成 / IN_TRANSIT 已登记 /
 *          读数两栏在位 / buildBlock 的 slice 已声明职责边界）
 *   B 行为（全结案后可开案 / 4开4结挤掉的是已结案 / 真满时拒收且不挤 / 环形退化不丢老 open /
 *          id 唯一 / 注入面在开案后出现）
 *   C 读数（recycled / openCap / cases-full 两栏自证 / 未结案时 recycled 不动）
 *   N 四条负控（真源码破坏：判据改回总条数 ⇒ B1 红；删 IN_TRANSIT 登记 ⇒ B2 红；
 *              id 改回 length ⇒ B5 红；去掉 open/cases 两栏 ⇒ C3 红）
 *
 * 单独跑：node tests/probe-cases-quota-v2560.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/probe.js';
const EV_REL = 'core/evict.js';
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

/**
 * 装载：真 vm + 真 core/evict.js（**不复制实现**）+ 最小 WA。
 *   @param code 被测的 probe 源码（负控传破坏副本）
 *   @param evCode 被测的 evict 源码（负控传破坏副本）
 */
function load(code, evCode) {
  let cfg = { enabled: true, maxCases: 8, maxEvidence: 24, minSupport: 2 };
  const store = { probe: { cases: [] } };
  const G = {};
  G.window = G; G.global = G; G.console = console;
  G.Date = Date; G.Number = Number; G.String = String; G.Array = Array; G.Object = Object;
  G.Math = Math; G.JSON = JSON; G.RegExp = RegExp; G.parseInt = parseInt; G.parseFloat = parseFloat;
  G.isFinite = isFinite; G.Error = Error;
  const ctx = vm.createContext(G);
  const WA = (G.WorldAxis = {});
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.store = {
    get: function () { return store; },
    transact: function (fn) { const r = fn(store); return { ok: r !== false }; }
  };
  WA.settingsBus = {
    read: function () { return cfg; },
    normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; }
  };
  WA.registerModule = function () {};
  vm.runInContext(rd('core/rand.js'), ctx, { filename: 'core/rand.js' });
  vm.runInContext(rd('core/input-guard.js'), ctx, { filename: 'core/input-guard.js' });
  vm.runInContext(evCode === undefined ? rd(EV_REL) : evCode, ctx, { filename: EV_REL });
  vm.runInContext(code, ctx, { filename: REL });
  return { api: WA.probe, ev: WA.evict, store: store };
}
function openOne(A, i) {
  return A.api.open('问题' + i + '？', [{ id: 'h0', text: '甲做的' }, { id: 'h1', text: '乙做的' }]);
}
function closeOne(A, id) { return A.api.decide(id, { note: '结案' }); }
function fill(A, n) {
  const ids = [];
  for (let i = 1; i <= n; i++) { const o = openOne(A, i); if (o.ok) ids.push(o.id); }
  return ids;
}
function closeAll(A, ids) { ids.forEach(function (id) { closeOne(A, id); }); }
function openIds(A) {
  return A.store.probe.cases.filter(function (x) { return x && x.status === 'open'; })
    .map(function (x) { return x.id; });
}

/**
 * 核心判据集：同一份判据在**真源码**与**破坏副本**上各跑一遍（负控靠它取红）。
 *   返回空数组 = 全过。
 */
function quotaProblems(code, evCode) {
  const bad = [];
  // B1 全结案后必须还能开案
  {
    const A = load(code, evCode);
    const ids = fill(A, 8);
    closeAll(A, ids);
    const st = A.api.statView();
    if (st.open !== 0) bad.push('B1 前置：8 条应全部结案（实 open=' + st.open + '）');
    const n = openOne(A, 9);
    if (!n.ok) bad.push('B1 8 条案子全部办完之后，第 9 个案子必须能开（实 ' + JSON.stringify(n) + '）—— 旧版这里是 cases-full');
  }
  // B2 4 开 + 4 结：挤出只许动已结案，四条未结案一条都不能少
  {
    const A = load(code, evCode);
    const ids = fill(A, 8);
    ids.slice(4).forEach(function (id) { closeOne(A, id); });
    const before = openIds(A);
    if (before.length !== 4) bad.push('B2 前置：应有 4 条未结案（实 ' + before.length + '）');
    const n = openOne(A, 9);
    if (!n.ok) bad.push('B2 有已结案卷宗可腾位置时，新案必须能开（实 ' + JSON.stringify(n) + '）');
    const after = openIds(A);
    const lost = before.filter(function (id) { return after.indexOf(id) < 0; });
    if (lost.length) bad.push('B2 挤出不许丢未结案的卷宗（丢了 ' + JSON.stringify(lost) + '）');
    if (A.store.probe.cases.length > 8) bad.push('B2 挤出之后总条数不得超 cap（实 ' + A.store.probe.cases.length + '）');
  }
  // B3 真的 8 条都压着没办 → 必须拒收，且不许挤掉任何一条未结案
  {
    const A = load(code, evCode);
    fill(A, 8);
    const n = openOne(A, 9);
    if (n.ok) bad.push('B3 8 条未结案已满时不得再开（实 ok:true）');
    if (n.reason !== 'cases-full') bad.push('B3 拒收理由应为 cases-full（实 ' + n.reason + '）');
    if (openIds(A).length !== 8) bad.push('B3 拒收时不许挤掉未结案（实剩 ' + openIds(A).length + '）');
  }
  // B4 环形退化：只有最后一条是 open，其余 7 条已结案 → 挤出不许动那条 open
  {
    const A = load(code, evCode);
    const ids = fill(A, 8);
    ids.slice(0, 7).forEach(function (id) { closeOne(A, id); });
    const keep = ids[7];
    const n = openOne(A, 9);
    if (!n.ok) bad.push('B4 有 7 条已结案可腾位置，新案必须能开（实 ' + JSON.stringify(n) + '）');
    if (!A.store.probe.cases.some(function (x) { return x.id === keep; })) {
      bad.push('B4 唯一那条未结案卷宗被挤掉了（' + keep + '）');
    }
  }
  // B5 挤出生效之后 id 仍然唯一
  {
    const A = load(code, evCode);
    const ids = fill(A, 8);
    closeAll(A, ids);
    for (let i = 9; i <= 14; i++) openOne(A, i);
    const all = A.store.probe.cases.map(function (x) { return x.id; });
    if (new Set(all).size !== all.length) bad.push('B5 卷宗 id 必须唯一（实 ' + JSON.stringify(all) + '）');
  }
  // B6 全结案时注入面为空（没有在办案子是事实），开第 9 条之后它必须出现在注入面
  {
    const A = load(code, evCode);
    const ids = fill(A, 8);
    closeAll(A, ids);
    if (A.api.buildBlock() !== '') bad.push('B6 没有在办案子时注入块应为空串');
    const n = openOne(A, 9);
    if (!n.ok) bad.push('B6 开案失败，后续判据无从谈起');
    const b = A.api.buildBlock();
    if (b.indexOf('问题9') < 0) bad.push('B6 新开的案子必须出现在注入块里（实 ' + JSON.stringify(b.slice(0, 60)) + '）');
  }
  return bad;
}

console.log('probe-cases-quota-v2560 —— 调查卷宗准入名额（v2.560.0）');

// ═══════════════ A 静态 ═══════════════
ok('A1 旧判据（按全部卷宗条数卡名额）已消失', function () {
  assert.strictEqual(CODE.indexOf('pr.cases.length >= cfg.maxCases'), -1);
});
ok('A2 准入判据只有一个正身：openN >= cfg.maxCases 恰一处', function () {
  const n = CODE.split('openN >= cfg.maxCases').length - 1;
  assert.strictEqual(n, 1);
});
ok('A3 未结案条数的计算只有一处（openN 的赋值）', function () {
  const n = CODE.split("c.status === 'open'; }).length").length - 1;
  assert.ok(n >= 1, 'openN 的计算必须在');
  const asg = CODE.split('const openN =').length - 1;
  assert.strictEqual(asg, 1);
});
ok('A4 卷宗序号只有一处生成，且走 nextCaseSeq', function () {
  assert.strictEqual(CODE.indexOf("'case_' + now + '_' + pr.cases.length"), -1, '旧尾巴 pr.cases.length 必须消失');
  const n = CODE.split("'case_' + now + '_' + nextCaseSeq(pr.cases)").length - 1;
  assert.strictEqual(n, 1);
  assert.strictEqual(CODE.split('function nextCaseSeq').length - 1, 1);
});
ok('A5 IN_TRANSIT 已登记 probe.cases（挤出先保未结案）', function () {
  const ev = codeOnly(rd(EV_REL));
  assert.ok(ev.indexOf("'probe.cases':") > 0, 'IN_TRANSIT 必须登记 probe.cases');
  assert.ok(/['"]probe\.cases['"]:\s*function\s*\(x\)\s*\{\s*return\s*!!x\s*&&\s*x\.status\s*===\s*['"]open['"]/.test(ev),
    '登记判据必须是「未结案」');
});
ok('A6 读数两栏在位（stat.recycled / statView().openCap）', function () {
  assert.ok(CODE.indexOf('recycled: 0') > 0, 'stat 必须有 recycled');
  assert.ok(CODE.indexOf('recycled: stat.recycled') > 0, 'statView 必须交回 recycled');
  assert.ok(CODE.indexOf('openCap:') > 0, 'statView 必须交回 openCap');
});
ok('A7 cases-full 交出 open / cases 两栏（自证「真满」）', function () {
  assert.ok(/reason:\s*'cases-full'[^}]*open:\s*openN[^}]*cases:\s*pr\.cases\.length/.test(CODE),
    'cases-full 必须带 open 与 cases');
});
ok('A8 buildBlock 的 slice 已声明「不是名额第二个真源」', function () {
  const i = SRC.indexOf('function buildBlock');
  const seg = SRC.slice(i - 600, i + 400);
  assert.ok(seg.indexOf('不是') > 0 && seg.indexOf('真源') > 0, '必须在注释里划清职责边界');
});

// ═══════════════ B 行为 ═══════════════
const REAL = load(CODE);
ok('B1 8 条全办完之后第 9 个案子开得出来（旧版 cases-full）', function () {
  const A = REAL;
  const ids = fill(A, 8);
  closeAll(A, ids);
  assert.strictEqual(A.api.statView().open, 0);
  const n = openOne(A, 9);
  assert.strictEqual(n.ok, true, '实 ' + JSON.stringify(n));
  assert.strictEqual(openIds(A).length, 1);
});
ok('B2 4 开 + 4 结：挤出只动已结案，四条未结案一条不少', function () {
  const A = load(CODE);
  const ids = fill(A, 8);
  ids.slice(4).forEach(function (id) { closeOne(A, id); });
  const before = openIds(A);
  assert.strictEqual(before.length, 4);
  const n = openOne(A, 9);
  assert.strictEqual(n.ok, true);
  const after = openIds(A);
  assert.strictEqual(after.length, 5, '未结案应为 5 条（4 + 新开）');
  before.forEach(function (id) { assert.ok(after.indexOf(id) >= 0, '未结案 ' + id + ' 被挤掉了'); });
  assert.strictEqual(A.store.probe.cases.length, 8, '总条数仍受 cap 约束');
});
ok('B3 真的 8 条全压着 → 拒收，且回收计数不动', function () {
  const A = load(CODE);
  fill(A, 8);
  const n = openOne(A, 9);
  assert.strictEqual(n.ok, false);
  assert.strictEqual(n.reason, 'cases-full');
  assert.strictEqual(n.open, 8);
  assert.strictEqual(n.cases, 8);
  assert.strictEqual(openIds(A).length, 8);
  assert.strictEqual(A.api.statView().recycled, 0, '拒收不是回收');
});
ok('B4 环形退化：唯一那条未结案活到最后', function () {
  const A = load(CODE);
  const ids = fill(A, 8);
  ids.slice(0, 7).forEach(function (id) { closeOne(A, id); });
  const keep = ids[7];
  const n = openOne(A, 9);
  assert.strictEqual(n.ok, true);
  assert.ok(A.store.probe.cases.some(function (x) { return x.id === keep; }), '未结案那条被挤掉了');
});
ok('B5 挤出生效之后 id 仍然唯一（连开 6 条）', function () {
  const A = load(CODE);
  const ids = fill(A, 8);
  closeAll(A, ids);
  for (let i = 9; i <= 14; i++) assert.strictEqual(openOne(A, i).ok, true);
  const all = A.store.probe.cases.map(function (x) { return x.id; });
  assert.strictEqual(new Set(all).size, all.length, '撞号：' + JSON.stringify(all));
});
ok('B6 开出来的新案立刻出现在注入面上', function () {
  const A = load(CODE);
  const ids = fill(A, 8);
  closeAll(A, ids);
  assert.strictEqual(A.api.buildBlock(), '', '没有在办案子时注入块应为空串');
  openOne(A, 9);
  const b = A.api.buildBlock();
  assert.ok(b.length > 0);
  assert.ok(b.indexOf('问题9') >= 0, '实 ' + JSON.stringify(b.slice(0, 80)));
});
ok('B7 主判据集在真源码上全过', function () {
  const bad = quotaProblems(CODE);
  assert.deepStrictEqual(bad, [], bad.join(' | '));
});

// ═══════════════ C 读数 ═══════════════
ok('C1 statView 交出 recycled / openCap，且是数字', function () {
  const A = load(CODE);
  fill(A, 8);
  const st = A.api.statView();
  assert.strictEqual(typeof st.recycled, 'number');
  assert.strictEqual(st.recycled, 0, '没超限时不得回收');
  assert.strictEqual(st.openCap, 8);
});
ok('C2 回收读数只在真的挤掉已结案时增加', function () {
  const A = load(CODE);
  const ids = fill(A, 8);
  closeAll(A, ids);
  assert.strictEqual(A.api.statView().recycled, 0);
  openOne(A, 9);
  assert.strictEqual(A.api.statView().recycled, 1, '应回收 1 条最老的已结案');
});
ok('C3 「满」与「回收」是两个读数：满时不回收、回收时不报满', function () {
  const full = load(CODE);
  fill(full, 8);
  const n = openOne(full, 9);
  assert.strictEqual(n.reason, 'cases-full');
  assert.strictEqual(full.api.statView().recycled, 0);
  const rec = load(CODE);
  const ids = fill(rec, 8);
  closeAll(rec, ids);
  const okRes = openOne(rec, 9);
  assert.strictEqual(okRes.ok, true);
  assert.strictEqual(rec.api.statView().recycled, 1);
});
ok('C4 未结案条数 ≤ cap 恒成立（准入判据的自洽性）', function () {
  const A = load(CODE);
  for (let i = 1; i <= 30; i++) openOne(A, i);
  const st = A.api.statView();
  assert.ok(st.open <= st.openCap, 'open=' + st.open + ' > cap=' + st.openCap);
  assert.ok(st.cases <= 8, '总条数也要受 cap 约束（实 ' + st.cases + '）');
});

// ═══════════════ N 负控（真源码破坏）═══════════════
ok('N1 判据改回「按总条数卡」⇒ 主判据集必须有红', function () {
  const broken = CODE.replace(
    'const openN = pr.cases.filter(function (c) { return c && c.status === \'open\'; }).length;',
    'const openN = pr.cases.length;');
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const bad = quotaProblems(broken);
  assert.ok(bad.some(function (s) { return s.indexOf('B1') === 0; }), 'B1 应当红：' + JSON.stringify(bad));
});
ok('N2 删掉 IN_TRANSIT 的 probe.cases 登记 ⇒ 未结案会被挤掉（B2 红）', function () {
  const ev = rd(EV_REL);
  const RE_LIVE = /'probe\.cases':\s*function \(x\) \{ return !!x && x\.status === 'open'; \}/;
  const brokenEv = ev.replace(RE_LIVE, "'probe.cases': function (x) { return false; }");
  assert.notStrictEqual(brokenEv, ev, '破坏未生效');
  // 注意：`'probe.cases':` 在 core/evict.js 里出现两次（SITES 表的 cap 声明 + IN_TRANSIT 的在途判定），
  //   只有后者决定挤出时保不保未结案，故判据打在「在途判定函数体」上而不是键名上。
  assert.ok(!RE_LIVE.test(brokenEv), '在途判定必须已破坏');
  const bad = quotaProblems(CODE, brokenEv);
  assert.ok(bad.some(function (s) { return s.indexOf('B2') === 0; }), 'B2 应当红：' + JSON.stringify(bad));
});
ok('N3 序号改回 pr.cases.length ⇒ 挤出后撞号（B5 红）', function () {
  const broken = CODE.replace("'case_' + now + '_' + nextCaseSeq(pr.cases)", "'case_' + now + '_' + pr.cases.length");
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  const bad = quotaProblems(broken);
  assert.ok(bad.some(function (s) { return s.indexOf('B5') === 0; }), 'B5 应当红：' + JSON.stringify(bad));
});
ok('N4 去掉 cases-full 的 open / cases 两栏 ⇒ 自证能力消失（C 段与静态判据同时红）', function () {
  const broken = CODE.replace(
    "out = { ok: false, reason: 'cases-full', cap: cfg.maxCases, open: openN, cases: pr.cases.length };",
    "out = { ok: false, reason: 'cases-full', cap: cfg.maxCases };");
  assert.notStrictEqual(broken, CODE, '破坏未生效');
  assert.ok(!/reason:\s*'cases-full'[^}]*open:\s*openN/.test(broken), 'A7 应当红');
  const A = load(broken);
  fill(A, 8);
  const n = openOne(A, 9);
  assert.strictEqual(n.open, undefined, '破坏后不该再有 open 栏');
});

console.log('\nprobe-cases-quota-v2560: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { fails.forEach(function (f) { console.log('  FAIL ' + f); }); process.exit(1); }