#!/usr/bin/env node
'use strict';
/**
 * tests/foreshadow-quota-v2555.js —— 「伏笔注入名额」分配判据专锁（v2.555.0）
 *
 * 治的缺口（本文件存在的唯一理由）：
 *
 *   `foreshadow.buildBlock()` 是「把埋了没收的伏笔送回上下文」的口，`render/inject.js`
 *   每轮都在调它 —— 也就是说**每一轮 prompt 里的那张伏笔台账，都由这一处决定**。
 *   到 v2.555.0 之前它只有一行选材：
 *
 *       const arr = list().filter(isActive).slice(0, cfg.maxItems);
 *
 *   **按插入顺序**截断。这个写法在读数上完全正常（条数受 maxItems 约束、过期的还带
 *   「（已 N 分钟未推进）」标注），但它有一个只在局面里才看得见的后果：
 *   先埋的永远占满名额，后埋 / 刚推进的**在注入面上根本不存在**。
 *   实测局面（7 条 active：5 条 stale + 2 条刚推进，maxItems = 5）：
 *   注入单是 fs1..fs5 —— 全是两小时没动过的账，刚推进的两条一条都进不去。
 *   这就是「该退场的拍一直注入、该在场的拍没人注入」的真身（engines/arc-guide.js
 *   头注释写的那个病，在产品面一直没人治）。
 *
 *   〃 同一批还量到第二个缺口：`stale` 这件事有两套口径。
 *     `check()` / `stat3()` 写的是 `!mark || (t - mark) > staleMs`（mark 缺失即 stale），
 *     `buildBlock()` 写的是 `mark && (t - mark) > staleMs`（mark 缺失 ⇒ 不打标）。
 *     于是**同一条伏笔**在作者面是「过期」，在注入面看起来「新鲜」——
 *     两条读数互相顶替。`mark` 缺失的正是老存档迁移来的那一类，最该被看见。
 *
 * 本批做的两件事：
 *   · `stale` 与「上次动作时刻」各收成**一个正身**（`isStaleAt` / `markOf`），四处内联消失；
 *   · `buildBlock` 的选材换成 `pickForBlock`，四条判据（名额够就全进 / fresh 优先 /
 *     stale 让位但保底 1 条 / 全 stale 时占满不空表），并把名额面读数落进 `stat().block`。
 *
 * 口径（判据的边界，不是实现细节）：
 *   ① **名额够就全进**：active ≤ maxItems ⇒ 原样全进，行为不变（fail-open）。
 *   ② **fresh 优先**：按「最近推进」降序 —— 刚动过的那条才是这一轮该提的。
 *   ③ **stale 让位但保底 1 条**（取最老的那条）：它在作者面（check）与容量面（prune
 *      的挤出侧）都已/即将被处理，注入面不必再占满；名额只有 1 个时不保底。
 *   ④ **全 stale 时占满**：绝不空表 —— 一张空台账比一张全是旧账的台账更坏。
 *
 * 判据结构：
 *   A 静态（正身唯一 + 旧写法在代码行里消失 + 读面在位）
 *   B 行为（同一局面下谁进注入单；含 mark 缺失的同向性）
 *   C 读数（名额面五栏 / 拷贝 / 空表与没构建过是两件事 / mode 三态）
 *   N 负控（改回插入顺序 ⇒ B 红；删 !mark 分支 ⇒ B 的 stale 同向性红；全 stale 空表 ⇒ B 红）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/foreshadow.js';

let pass = 0, fail = 0;
const fails = [];
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
/** 去注释（含 JSDoc 块注释行的续行形态）——注释里的提及不是代码。 */
function stripComment(line) {
  const t = line.trim();
  if (t.indexOf('/*') === 0 || t.indexOf('*') === 0) return '';
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}
function codeOnly(text) { return text.split('\n').map(stripComment).join('\n'); }

const SRC = rd(REL);
const CODE = codeOnly(SRC);
const H = 3600000;
const NOW = 1700000000000;

/**
 * 装载（真源码 or 破坏副本）：真 vm + 最小 WA，与 foreshadow-v2135.js 同一台装载机。
 * `now0` 可覆盖时钟 —— 这一条是给「无时间戳」判据用的：`clockNow` 在本仓返回的是
 *   **游戏内时间**（可能只有几万毫秒），此时 `t - 0` 未必超过 staleMs，
 *   「mark 缺失算 stale」才真的由 `!mark` 那一支兜住（用真实时间戳量级去测永远测不到它）。
 */
function load(code, rows, cfg0, now0) {
  let cfg = Object.assign({ enabled: true, staleMs: H, maxItems: 5, cap: 30 }, cfg0 || {});
  const T = (now0 === undefined ? NOW : now0);
  const store = { memory: { foreshadows: rows || [] } };
  const WA = {
    clock: { now: function () { return T; } },
    store: {
      get: function () { return store; },
      transact: function (fn) { const r = fn(store); return { ok: r !== false }; },
      sameId: function (x, y) { return String(x) === String(y); }
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
  vm.runInNewContext(code, {
    window: win, Date: Date, Number: Number, String: String, Array: Array,
    Object: Object, isFinite: isFinite, Math: Math, JSON: JSON
  }, { filename: REL });
  return { api: win.WorldAxis.foreshadow, store: store, cfg: function () { return cfg; } };
}

/** 破坏副本：锚点恰中 1 次才允许替换（锚点失配即负控自身失效，不许静默通过）。 */
function wreck(anchor, to) {
  const n = SRC.split(anchor).length - 1;
  if (n !== 1) throw new Error('wreck 锚点不唯一（命中 ' + n + '）');
  return SRC.replace(anchor, to);
}

/** 造一条伏笔：markAgo 毫秒之前推进过；markAgo 为 null ⇒ **没有**任何时间戳（老存档）。 */
function row(id, markAgo, status) {
  const f = { id: id, content: '账目 ' + id, status: status || 'waiting' };
  if (markAgo !== null) { f.at = NOW - markAgo; f.updatedAt = NOW - markAgo; }
  return f;
}
/** 7 条局面：fs1..fs5 两小时未推进（stale），fs6 一分钟前、fs7 三十秒前（fresh）。 */
function mixed() {
  return [row('fs1', 2 * H), row('fs2', 2 * H), row('fs3', 2 * H, 'developing'),
    row('fs4', 2 * H), row('fs5', 2 * H), row('fs6', 60000, 'developing'), row('fs7', 30000)];
}
/** 从注入块里取出被列出的 id（行形态：`- fs1：...`）。 */
function idsIn(block) {
  const out = [];
  const re = /^- ([^：]+)：/gm;
  let m;
  while ((m = re.exec(block)) !== null) out.push(m[1]);
  return out;
}
/**
 * 一条判据、多个局面 —— 抽成函数是为了让 N 段能对**同一条判据**做负控
 * （改回插入顺序之后，这里必须报出问题；不是另写一套断言）。
 */
function quotaProblems(code) {
  const bad = [];
  const A = load(code, mixed());
  const picked = idsIn(A.api.buildBlock());
  const st = A.api.stat().block || {};
  if (picked.indexOf('fs6') < 0 || picked.indexOf('fs7') < 0) {
    bad.push('fresh 被挤掉：刚推进的两条必须在注入单里（实 ' + JSON.stringify(picked) + '）');
  }
  const stalePicked = picked.filter(function (x) { return x !== 'fs6' && x !== 'fs7'; });
  if (stalePicked.length !== 1) {
    bad.push('stale 应保底恰 1 条（实 ' + stalePicked.length + '）');
  } else if (stalePicked[0] !== 'fs1') {
    bad.push('保底的那条应是最老的 stale（fs1），实 ' + stalePicked[0]);
  }
  if (picked.length > 5) bad.push('条数超过 maxItems（实 ' + picked.length + '）');
  if (picked[0] !== 'fs7' || picked[1] !== 'fs6') bad.push('fresh 未按「最近推进」降序（实 ' + JSON.stringify(picked) + '）');
  if (st.mode !== 'fresh-first') bad.push('mode 应为 fresh-first（实 ' + st.mode + '）');
  if (st.picked !== picked.length) bad.push('读数 picked 与注入单行数不一致（' + st.picked + ' vs ' + picked.length + '）');
  if (st.stale !== 5) bad.push('读数 stale 应为 5（实 ' + st.stale + '）');
  if (st.fresh !== 2) bad.push('读数 fresh 应为 2（实 ' + st.fresh + '）');
  if (st.deferred !== 4) bad.push('读数 deferred 应为 4（实 ' + st.deferred + '）');

  // 全 stale：占满，不空表
  const B = load(code, [row('a1', 2 * H), row('a2', 3 * H), row('a3', 4 * H),
    row('a4', 5 * H), row('a5', 6 * H), row('a6', 7 * H)]);
  const pickedB = idsIn(B.api.buildBlock());
  const stB = B.api.stat().block || {};
  if (pickedB.length !== 5) bad.push('全 stale 时应占满 5 个名额（实 ' + pickedB.length + '）');
  if (pickedB[0] !== 'a6') bad.push('全 stale 时应最老优先（a6 在前，实 ' + pickedB[0] + '）');
  if (stB.mode !== 'all-stale') bad.push('全 stale 的 mode 应为 all-stale（实 ' + stB.mode + '）');

  // 名额够：全进，顺序不变（fail-open）
  const C = load(code, [row('c1', 2 * H), row('c2', 60000), row('c3', 120000)]);
  const pickedC = idsIn(C.api.buildBlock());
  if (JSON.stringify(pickedC) !== JSON.stringify(['c1', 'c2', 'c3'])) {
    bad.push('名额够时应原样全进且顺序不变（实 ' + JSON.stringify(pickedC) + '）');
  }
  if ((C.api.stat().block || {}).mode !== 'all-fit') bad.push('名额够的 mode 应为 all-fit');

  // 名额只有 1 个：不保底 stale，给最新推进的那条
  const D = load(code, mixed(), { maxItems: 1 });
  const pickedD = idsIn(D.api.buildBlock());
  if (pickedD.length !== 1 || pickedD[0] !== 'fs7') {
    bad.push('maxItems=1 时唯一名额应给最新推进的（实 ' + JSON.stringify(pickedD) + '）');
  }

  // mark 缺失：作者面说 stale，注入面也必须按过期处理（两读数同向）
  const E = load(code, [row('e_old', null), row('e_fresh', 60000)]);
  const ck = E.api.check();
  const blkE = E.api.buildBlock();
  const lineE = blkE.split(String.fromCharCode(10)).filter(function (l) { return l.indexOf('e_old') >= 0; })[0] || '';
  const ckOld = (ck.rows || []).filter(function (r) { return r.id === 'e_old'; }).length;
  if (ckOld !== 1) bad.push('check 应把无时间戳的 e_old 报为 stale（实 ' + ckOld + '）');
  if (lineE.indexOf('按过期处理') < 0) bad.push('buildBlock 应对无时间戳的行明说「按过期处理」（实 ' + lineE + '）');
  if ((E.api.stat().stale || 0) < 1) bad.push('stat().stale 应计到无时间戳的那条');
  return bad;
}

// ══════════════════ A 静态：正身唯一 + 旧写法消失 + 读面在位 ══════════════════
ok('A1 名额分配只有一个正身：pickForBlock 恰 1 处定义，且 buildBlock 真调它', function () {
  assert.strictEqual(CODE.split('function pickForBlock(').length - 1, 1, 'pickForBlock 应恰 1 处定义');
  // 数的是**调用点**（赋值形态），定义那一行没有 `= pickForBlock(`，不会被算进来
  assert.strictEqual(CODE.split('= pickForBlock(active, cfg, t)').length - 1, 1, 'buildBlock 应恰调 1 次');
});
ok('A2 旧写法在**代码行**里消失：filter(isActive).slice(0, maxItems) 为 0 处', function () {
  assert.strictEqual(CODE.split('filter(isActive).slice').length - 1, 0,
    '按插入顺序截断的旧写法还在代码里 —— 注释里的纠正性引用不算（本判据已去注释）');
});
ok('A3 stale 只有一个正身：代码里 `> cfg.staleMs` 恰 1 处（在 isStaleAt 里）', function () {
  const n = CODE.split('> cfg.staleMs').length - 1;
  assert.strictEqual(n, 1, 'stale 的比较应只出现在 isStaleAt 一处（实 ' + n + '）');
  assert.ok(CODE.indexOf('function isStaleAt(f, cfg, t)') >= 0, 'isStaleAt 定义在位');
  const calls = CODE.split('isStaleAt(').length - 1 - 1;   // 减去定义那一处
  assert.ok(calls >= 3, 'check / stat3 / 选材都应问它（实调用 ' + calls + ' 次）');
});
ok('A4 「上次动作时刻」只有一个正身：ts(f && f.updatedAt) || ts(f && f.at) 恰 1 处（在 markOf 里）', function () {
  // 注意锚点必须带上 `f &&` 两个守卫：markOf 收的是**整条伏笔**（可能是 null），
  //   写成 `ts(f.updatedAt)` 会漏掉守卫、把判据钉在一个并不存在的写法上（本批第一次就踩了）。
  const n = CODE.split('ts(f && f.updatedAt) || ts(f && f.at)').length - 1;
  assert.strictEqual(n, 1, '内联取时刻应只剩 markOf 一处（实 ' + n + '）');
});
ok('A5 名额面读数有读面：tool-diag 的诊断节真取 st.block', function () {
  const td = codeOnly(rd('engines/tool-diag.js'));
  assert.ok(td.indexOf('block: st.block || null') >= 0, 'tool-diag 应把 block 报出来 —— 接了线没人读是本仓反复治的病');
});

// ══════════════════ B 行为：同一局面下谁进注入单 ══════════════════
ok('B1 主局面（7 条：5 stale + 2 fresh，maxItems=5）：fresh 优先、stale 保底 1 条，全项一致', function () {
  const bad = quotaProblems(SRC);
  assert.deepStrictEqual(bad, [], '判据不通过：\n    · ' + bad.join('\n    · '));
});
ok('B2 名额够时行为不变（3 条 ≤ 5 ⇒ 原样全进、顺序不变）', function () {
  const A = load(SRC, [row('c1', 2 * H), row('c2', 60000), row('c3', 120000)]);
  const got = idsIn(A.api.buildBlock());
  assert.deepStrictEqual(got, ['c1', 'c2', 'c3'], '名额够时不许重排（实 ' + JSON.stringify(got) + '）');
});
ok('B3 全 stale 时占满名额（不空表），且最老优先', function () {
  const A = load(SRC, [row('a1', 2 * H), row('a2', 3 * H), row('a3', 4 * H),
    row('a4', 5 * H), row('a5', 6 * H), row('a6', 7 * H)]);
  const got = idsIn(A.api.buildBlock());
  assert.strictEqual(got.length, 5, '全 stale 也不许空表（实 ' + got.length + ' 条）');
  assert.strictEqual(got[0], 'a6', '最老的应在最前（实 ' + got[0] + '）');
});
ok('B4 名额只有 1 个时不保底 stale（唯一名额给最新推进的那条）', function () {
  const A = load(SRC, mixed(), { maxItems: 1 });
  const got = idsIn(A.api.buildBlock());
  assert.deepStrictEqual(got, ['fs7'], '唯一名额给了过期账，比不注还坏（实 ' + JSON.stringify(got) + '）');
});
ok('B5 mark 缺失：作者面说 stale，注入面也必须「按过期处理」（两读数同向）', function () {
  const A = load(SRC, [row('e_old', null), row('e_fresh', 60000)]);
  const ck = A.api.check();
  assert.strictEqual((ck.rows || []).filter(function (r) { return r.id === 'e_old'; }).length, 1,
    'check 必须把无时间戳的行报 stale（它是「不知道多旧」，不是「新鲜」）');
  const blk = A.api.buildBlock();
  const line = blk.split(String.fromCharCode(10)).filter(function (l) { return l.indexOf('e_old') >= 0; })[0] || '';
  assert.ok(line.indexOf('按过期处理') >= 0, '注入面必须如实说明，不许看起来新鲜（实「' + line + '」）');
});
ok('B6 终态不进注入单（这一条是旧锁 foreshadow-v2135 的性质，本批不许弄丢）', function () {
  const A = load(SRC, [row('t1', 2 * H, 'triggered'), row('t2', 2 * H, 'recycled'),
    row('t3', 2 * H, 'dropped'), row('live', 60000)]);
  const got = idsIn(A.api.buildBlock());
  assert.deepStrictEqual(got, ['live'], '终态 / 已回收 / 已放弃都不许注入（实 ' + JSON.stringify(got) + '）');
});

// ══════════════════ C 读数：名额面 ══════════════════
ok('C1 stat().block 五栏齐全，且 picked 与注入单行数逐字一致', function () {
  const A = load(SRC, mixed());
  const blk = A.api.buildBlock();
  const st = A.api.stat().block;
  assert.ok(st && typeof st === 'object', 'stat().block 应在构建过之后有值');
  ['at', 'active', 'picked', 'fresh', 'stale', 'deferred', 'quota', 'mode', 'staleMs'].forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(st, k), '缺栏：' + k);
  });
  assert.strictEqual(st.picked, idsIn(blk).length, '读数与注入单必须同源（' + st.picked + ' vs ' + idsIn(blk).length + '）');
  assert.strictEqual(st.active, 7, 'active 应是 7（实 ' + st.active + '）');
  assert.strictEqual(st.quota, 5, 'quota 应是 maxItems（实 ' + st.quota + '）');
});
ok('C2 block 是拷贝不是引用（改返回值不许污染下一次读数）', function () {
  const A = load(SRC, mixed());
  A.api.buildBlock();
  const b1 = A.api.stat().block;
  b1.picked = 999; b1.mode = 'tampered';
  const b2 = A.api.stat().block;
  assert.notStrictEqual(b2.picked, 999, '返回值是引用 ⇒ 读数能被外部改写');
  assert.notStrictEqual(b2.mode, 'tampered', '返回值是引用 ⇒ mode 能被外部改写');
});
ok('C3 「构建过但空表」与「从没构建过」是两个读数（picked:0 vs null）', function () {
  const A = load(SRC, []);
  assert.strictEqual(A.api.stat().block, null, '还没构建过时必须是 null —— 不许拿 0 冒充');
  const blk = A.api.buildBlock();
  assert.strictEqual(blk, '', '没有 active 时注入块为空串');
  const st = A.api.stat().block;
  assert.ok(st && st.picked === 0, '构建过但空表 ⇒ block 有值且 picked 为 0（实 ' + JSON.stringify(st) + '）');
  assert.strictEqual(st.mode, 'empty', '空表的 mode 应是 empty（实 ' + st.mode + '）');
});
ok('C4 mode 三态可分辨（all-fit / fresh-first / all-stale 各一次）', function () {
  const A0 = load(SRC, [row('x1', 60000)]);
  A0.api.buildBlock();                       // 必须先构建一次：没构建过时 block 是 null（这正是 C3 那条）
  assert.strictEqual(A0.api.stat().block.mode, 'all-fit', '名额够时 mode 实 ' + A0.api.stat().block.mode);
  const A = load(SRC, mixed()); A.api.buildBlock();
  assert.strictEqual(A.api.stat().block.mode, 'fresh-first', '实 ' + A.api.stat().block.mode);
  const B = load(SRC, [row('b1', 2 * H), row('b2', 3 * H), row('b3', 4 * H),
    row('b4', 5 * H), row('b5', 6 * H), row('b6', 7 * H)]);
  B.api.buildBlock();
  assert.strictEqual(B.api.stat().block.mode, 'all-stale', '实 ' + B.api.stat().block.mode);
});
ok('C5 名额面读数不许冒充 stale 读数（同一时刻两个数各自成立）', function () {
  const A = load(SRC, mixed());
  A.api.buildBlock();
  const st = A.api.stat();
  assert.strictEqual(st.stale, 5, '作者面的 stale 是 5 条（实 ' + st.stale + '）');
  assert.strictEqual(st.block.stale, 5, '注入面看到的也是 5 条过期');
  assert.strictEqual(st.block.picked, 3, '但注入面只提 3 条（2 fresh + 1 保底）—— 实 ' + st.block.picked);
  assert.ok(st.stale !== st.block.picked, '两个数若恒等，说明其中一个在冒充另一个');
});

// ══════════════════ N 负控：判据真的会因破坏而变红 ══════════════════
ok('N1 负控：把选材改回「按插入顺序切片」⇒ B 的同一条判据必须现形', function () {
  const poisoned = wreck('    const pick = pickForBlock(active, cfg, t);',
    '    const pick = { picked: active.slice(0, cfg.maxItems), fresh: [], stale: [], deferred: [], mode: \'legacy\' };');
  const bad = quotaProblems(poisoned);
  assert.ok(bad.length > 0, '改回插入顺序之后判据居然还通过 ⇒ 判据不认这个病灶');
  assert.ok(bad.join('|').indexOf('fresh 被挤掉') >= 0, '必须点名「fresh 被挤掉」（实：' + bad.join(' / ') + '）');
});
ok('N2 负控：删掉 isStaleAt 的「mark 缺失也算 stale」⇒ 无时间戳那一条必须现形', function () {
  const poisoned = wreck('return !mark || (t - mark) > cfg.staleMs;', 'return (t - mark) > cfg.staleMs;');
  // 这一条为什么不能用真实时间戳量级去量（本批第一次就踩在这里）：
  //   `mark = 0` 时 `t - 0` 在 1.7e12 的量级下天然就 > staleMs —— 删不删 `!mark` 分支**行为一样**，
  //   负控于是「看起来通过」。而 `clockNow` 在本仓返回的是**游戏内时间**（可能只有几万毫秒），
  //   那时 `t - 0 < staleMs`，「mark 缺失算 stale」真的只由 `!mark` 那一支兜住。
  //   所以这里的局面用**小 now + 一行完全没有时间戳的伏笔**。
  const SMALL = 100000;   // 约 1.7 分钟的游戏内时间，远小于 staleMs(1 小时)
  const rows = [{ id: 'e_old', content: '迁移来的老账', status: 'waiting' }];
  const good = load(SRC, rows, {}, SMALL);
  const bad = load(poisoned, rows, {}, SMALL);
  assert.strictEqual(good.api.stat().stale, 1, '真源码：mark 缺失必须算 stale（它是「不知道多旧」，不是「新鲜」）');
  assert.strictEqual(bad.api.stat().stale, 0, '负控没改到东西（破坏后读数应当变）⇒ 这条负控自身失效');
  // 第二证人：作者面的 check 与 stat 必须同向变（一个判据两个读面，一起红才算数）
  assert.strictEqual(good.api.check().count, 1, '真源码：check 也应把这一条报出来');
  assert.strictEqual(bad.api.check().count, 0, '破坏之后 check 居然还报它 ⇒ 判据不认这一支');
  const lineGood = good.api.buildBlock().split(String.fromCharCode(10)).filter(function (l) { return l.indexOf('e_old') >= 0; })[0] || '';
  assert.ok(lineGood.indexOf('按过期处理') >= 0, '真源码必须在注入面明说「按过期处理」（实「' + lineGood + '」）');
  // 注意：**不**拿「破坏版还打不打这个文案」当判据 —— 文案分支（`!mark` ⇒ 不知道多旧）
  //   与 stale 判据是两个不同的断言对象：前者要说清「为什么它过期」，后者只说「它过期」。
  //   本批第一次把这两件事混成一条，于是负控「看起来通过」（文案分支没被破坏，当然还在）。
});
ok('N3 负控：让 stale 全部让位 ⇒ 「全 stale 不许空表」必须现形', function () {
  const poisoned = wreck('if (!fresh.length) picked = stale.slice(0, cap);',
    'if (!fresh.length) picked = [];');
  const bad = quotaProblems(poisoned);
  assert.ok(bad.join('|').indexOf('全 stale') >= 0, '全 stale 空表没被点名（实：' + bad.join(' / ') + '）');
});
ok('N4 负控：读数不拷贝（直接返回同一个对象）⇒ C2 必须现形', function () {
  const poisoned = wreck('block: __lastBlock ? Object.assign({}, __lastBlock) : null',
    'block: __lastBlock');
  const A = load(poisoned, mixed());
  A.api.buildBlock();
  const b1 = A.api.stat().block;
  b1.picked = 999;
  assert.strictEqual(A.api.stat().block.picked, 999, '负控没改到东西（锚点失配）⇒ 这条负控自身失效');
});

// ── 收口 ────────────────────────────────────────────────────
console.log('\n伏笔注入名额专锁 v2.555.0：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  fails.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}