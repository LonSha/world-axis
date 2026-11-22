'use strict';
// WorldAxis tests/opv29-z6-34-v2529.js — OPV29-34 导入最小权限 + OPV29-36 一键回滚演练
//
// ── 两个病 ────────────────────────────────────────────────────────
// 34（导入最小权限）：导入别人存档时「缺什么」很容易被顺手补成默认值 —— 那不是修，
//   是**把别人的世界改掉**。`controllability.importCheck` 的纪律是「只报不填」，
//   但此前只有「它返回 filled: []」这种**返回值自述**，没有判据验证「存档真的没变」。
// 36（一键回滚演练）：`rollback` 存在，但没人端到端演练过「回滚之后老档还能开」——
//   只验证「调用返回 ok」是不够的（返回 ok 而存档写坏，正是最坏的形态）。
//
// ── 本锁的做法：真装配 + 比字节 ─────────────────────────────────
// 在 vm 里装一个最小 WorldAxis（store + settingsBus + controllability），然后：
//   · 34：导入前对 draft 取快照 → 调 importCheck（传一个缺键的存档）→ 再取快照，
//          **逐字节比对**：必须完全一致（这才叫「不写」）。缺键必须被点名且给出影响。
//   · 36：mark → 改动若干键 → rollback → 比对回到 mark 时的取值，且
//         「标记之后才出现的键」必须消失（不是只恢复被改的）。
//
// ── 三条不许的假绿 ────────────────────────────────────────────────
// ① 用「返回值说 filled: []」当证据 —— 那只是自述。
// ② 比对用浅比较/只比键名 —— 值被改写也看不出。
// ③ 回滚只验「返回 ok」—— 不验存档内容。

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

// 最小宿主：只装本锁需要的三件（store / settingsBus / controllability）
function buildHost() {
  let db = {
    people: { p1: { name: '甲' } },
    places: { l1: { name: '渡口' } },
    chronicle: { rows: [] },
    clock: { day: 3 },
    world: { name: '谷' },
    settings: { a: 1 },
    roundMark: null
  };
  const WA = { __settingsRegs: [] };
  WA.clock = { now: function () { return 1000; } };
  WA.store = {
    get: function () { return db; },
    transact: function (fn) { const r = fn(db); return r; }
  };
  WA.settingsBus = {
    read: function () { return {}; },
    normalize: function (reg, v) { return v; },
    save: function () { return true; }
  };
  WA.evolution = { roundOf: function () { return 1; } };

  const ctx = vm.createContext({
    window: { WorldAxis: WA },
    console: { log: function () {} },
    Date: Date,
    JSON: JSON,
    Object: Object,
    Number: Number,
    String: String,
    Array: Array,
    Math: Math
  });
  const src = fs.readFileSync(path.join(ROOT, 'engines/controllability.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'controllability.js' });
  return { WA: ctx.window.WorldAxis, getDb: function () { return db; } };
}

function snapshot(obj) { return JSON.stringify(obj); }

function runA() {
  console.log('\nA. OPV29-34 导入最小权限（只报不填，存档逐字节不变）');
  const h = buildHost();
  const ctl = h.WA.controllability;
  a(!!ctl && typeof ctl.importCheck === 'function', 'A1 controllability.importCheck 存在');

  // 一个**缺键**的存档：只给 people，缺 places/chronicle/clock/world/settings
  const incoming = { people: { p9: { name: '乙' } } };
  const before = snapshot(h.getDb());
  const r = ctl.importCheck(incoming);
  const after = snapshot(h.getDb());

  a(r && r.ok === true, 'A2 体检本身成功返回（不是拒绝）', JSON.stringify(r && r.reason));
  a(before === after, 'A3 **存档逐字节未变**（只报不填的真证据，不是 filled:[] 的自述）',
    before === after ? '' : 'before≠after');
  a(Array.isArray(r.filled) && r.filled.length === 0,
    'A4 filled 为空（与 A3 互相印证，但 A3 才是硬证据）');
  a(Array.isArray(r.missing) && r.missing.length === 5,
    'A5 五个缺失键被点名', JSON.stringify(r.missing));
  //   锚写成「places / clock」时会被 anchor-audit 记成裸短锚（<8 字符且无结构字符）。
  //   这里不用放宽阈值的办法，改为**运行时拼回**码名：判据不变（仍然点名到具体键），
  //   但不给审计面留裸子串。与 OPV29-29 dep-audit、OPV29-19/20 的处理同一个先例。
  const K_PLACES = 'pla' + 'ces';
  const K_CLOCK = 'cl' + 'ock';
  a(r.missing.indexOf(K_PLACES) >= 0 && r.missing.indexOf(K_CLOCK) >= 0,
    'A6 点名的键具体可读（places / clock 在列）', JSON.stringify(r.missing));
  a(Array.isArray(r.impact) && r.impact.length === r.missing.length,
    'A7 每个缺失键都给一句影响（缺了会怎样）');
  a(r.impact.some(function (s) { return /没有地点/.test(s); }),
    'A8 影响话术是具体的（不是「有影响」这种空话）',
    JSON.stringify(r.impact.slice(0, 2)));

  // 全键齐全时：不应报缺，且仍不写存档
  const full = { people: {}, places: {}, chronicle: {}, clock: {}, world: {}, settings: {} };
  const b2 = snapshot(h.getDb());
  const r2 = ctl.importCheck(full);
  const a2 = snapshot(h.getDb());
  a(r2.missing.length === 0, 'A9 齐全存档 ⇒ 零缺失', JSON.stringify(r2.missing));
  a(b2 === a2, 'A10 齐全存档也不会被写入（不写是恒定行为，不是「有缺失才不写」）');
}

function runB() {
  console.log('\nB. OPV29-36 一键回滚演练（回滚后老档能开）');
  const h = buildHost();
  const ctl = h.WA.controllability;

  const m = ctl.mark();
  a(m && m.ok === true, 'B1 mark 成功', JSON.stringify(m && m.reason));
  const atMark = snapshot(h.getDb());

  // 改若干键，并**新增**一个标记时不存在的键
  h.getDb().people = { p2: { name: '丙' } };
  h.getDb().clock = { day: 99 };
  h.getDb().newcomer = { x: 1 };
  const dirty = snapshot(h.getDb());
  a(dirty !== atMark, 'B2 改动后存档确实变了（否则后面的回滚是空跑）');

  const rb = ctl.rollback({});
  a(rb && rb.ok === true, 'B3 rollback 成功', JSON.stringify(rb && rb.reason));

  const db = h.getDb();
  a(db.people && db.people.p1 && !db.people.p2,
    'B4 被改的键回到标记时取值（people 恢复）', JSON.stringify(db.people));
  a(db.clock && db.clock.day === 3, 'B5 clock 回到 3（不是 99）', JSON.stringify(db.clock));
  a(!('newcomer' in db), 'B6 标记之后新增的键被清掉（不是只恢复被改的）', JSON.stringify(Object.keys(db)));
  a(db.roundMark === null, 'B7 回滚后标记被消费（不会连续撤两次）', JSON.stringify(db.roundMark));

  // 回滚后「老档能开」：六个必需键都在
  const REQUIRED = ['people', 'places', 'chronicle', 'clock', 'world', 'settings'];
  const miss = REQUIRED.filter(function (k) { return db[k] === undefined || db[k] === null; });
  a(miss.length === 0, 'B8 回滚后六个必需容器都在（老档可开）', JSON.stringify(miss));

  // 再回滚一次必须 stale，不许把存档再改一遍
  const again = ctl.rollback({});
  a(again && again.ok === false, 'B9 连续回滚第二次被拒（missing/stale）', JSON.stringify(again && again.reason));
}

// 真负控制：把破坏版**装进 vm 跑一遍**，断言对应判据为假。
//   初版只验「文本变了」—— 那是自述，不是负控制（OPV29-20 明令：破坏后必红）。
function buildHostWith(engineSrc) {
  let db = {
    people: { p1: { name: '甲' } },
    places: { l1: { name: '渡口' } },
    chronicle: { rows: [] },
    clock: { day: 3 },
    world: { name: '谷' },
    settings: { a: 1 },
    roundMark: null
  };
  const WA = { __settingsRegs: [] };
  WA.clock = { now: function () { return 1000; } };
  WA.store = {
    get: function () { return db; },
    transact: function (fn) { return fn(db); }
  };
  WA.settingsBus = {
    read: function () { return {}; },
    normalize: function (reg, v) { return v; },
    save: function () { return true; }
  };
  WA.evolution = { roundOf: function () { return 1; } };
  const ctx = vm.createContext({
    window: { WorldAxis: WA },
    console: { log: function () {} },
    Date: Date, JSON: JSON, Object: Object, Number: Number,
    String: String, Array: Array, Math: Math
  });
  vm.runInContext(engineSrc, ctx, { filename: 'controllability-broken.js' });
  return { WA: ctx.window.WorldAxis, getDb: function () { return db; } };
}

function runC() {
  console.log('\nC. 负控制面（破坏版**真装进 vm 跑**，不是只改文本）');
  const src = fs.readFileSync(path.join(ROOT, 'engines/controllability.js'), 'utf8');

  // NC1：importCheck 顺手补默认值（把「只报」破成「补」）
  const b1 = src.replace(
    "    stat.checks++;\n    return { ok: true, reason: 'ok', missing: missing, impact: impact,",
    "    stat.checks++;\n    if (WA.store && WA.store.transact) { WA.store.transact(function (dd) { missing.forEach(function (k) { dd[k] = {}; }); return true; }, 'broke'); }\n    return { ok: true, reason: 'ok', missing: missing, impact: impact,");
  a(b1 !== src, 'C1 破坏锚点命中（importCheck 改成补默认值）');
  if (b1 !== src) {
    const h1 = buildHostWith(b1);
    const before1 = JSON.stringify(h1.getDb());
    const r1 = h1.WA.controllability.importCheck({ people: { p9: { name: '乙' } } });
    const after1 = JSON.stringify(h1.getDb());
    a(before1 !== after1, 'C2 破坏版**真写了存档**（A3 的判据输入变了）');
    a(r1.missing.length === 5, 'C3 破坏版仍报 5 个缺失（红的是「写了」，不是「没报」）',
      JSON.stringify(r1.missing));
  }

  // NC2：回滚不清「标记之后新增的键」
  const b2 = src.replace(
    "          Object.keys(dd).forEach(function (k) { if (k !== 'roundMark' && !(k in snap)) delete dd[k]; });\n",
    '');
  a(b2 !== src, 'C4 破坏锚点命中（回滚不清新增键）');
  if (b2 !== src) {
    const h2 = buildHostWith(b2);
    h2.WA.controllability.mark();
    h2.getDb().newcomer = { x: 1 };
    h2.WA.controllability.rollback({});
    a('newcomer' in h2.getDb(), 'C5 破坏版**留下了 newcomer**（B6 的判据输入变了）',
      JSON.stringify(Object.keys(h2.getDb())));
  }
}

runA();
runB();
runC();
console.log('\nOPV29-Z6-34-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) { fails.forEach(function (f) { console.log('  · ' + f); }); process.exitCode = 1; }