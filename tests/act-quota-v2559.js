#!/usr/bin/env node
'use strict';
/**
 * tests/act-quota-v2559.js —— 「人物行动注入名额」分配判据专锁（v2.559.0）
 *
 * 治的缺口（本文件存在的唯一理由）：`engines/act.js` 的 `buildBlock()`。
 *
 *   它是「[人物行动]」这张台账的唯一出口（`render/inject.js` 每轮调）。到本批之前它这样选材：
 *
 *       const rows = acts().filter(x => ACTIVE.indexOf(x.status) >= 0)
 *                           .slice(0, cfg.maxRun);        // ← 按**登记顺序**截断
 *
 *   `maxActs` 是 8（候选表上界）、`maxRun` 是 4（名额）—— 所以「同时活着 5 条以上」
 *   是常态可达的局面，而注入面永远只列**最早登记的那 4 条**。
 *   实测（6 条 active：4 条很早登记、一直停在 `planned`；2 条刚登记、`running`、5 秒后结束）：
 *
 *       注入块 = 甲 work「修屋顶」planned / 乙 work「打水」planned /
 *                丙 wait「等回信」planned / 丁 wait「等船」planned
 *
 *   两条 `running`（正在发生、马上要变）**一条都没进**。
 *   这正是本引擎头部边界③治的形态的另一面：那里说「拟稿不冒充事实」，
 *   而注入面把 4 条**拟稿**（planned）排在了 2 条**事实**（running）前面。
 *
 * 本批做的三件事：
 *   · `pickRun`：名额够就全进（顺序不变）／不够时 **running 优先** → `dueAt` 升序
 *     （快结束的先）→ `at` 升序（登记早的先）→ id 字典序（可复算）；
 *   · 名额面读数进 `stat().block`（`active / candidates / picked / running / planned / quota / mode`）；
 *   · `tool-diag` 新增 `secAction` 节并接进 `collect()`（只读 stat/getSettings，**不 buildBlock**
 *     —— 与 secIntentBoard「不 board」同一条纪律）。
 *
 * 判据结构：
 *   A 静态（旧写法消失 / 判据只有一个正身 / 排序键四种齐 / 读数拷贝 / 读面在位）
 *   B 行为（主局面 running 进得来 / 名额够不变 / running 压过 planned / dueAt 与 at 次序 / 只读）
 *   C 读数（八栏 / 拷贝 / 空表与没构建过 / mode 三态 / candidates ≠ picked）
 *   N 三条负控（改回按序切片 ⇒ B 红；删 running 优先 ⇒ 次序判据红；读数不拷贝 ⇒ C2 红）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/act.js';

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
const H = 3600000;

/** 装载（真源码 or 破坏副本）：真 vm + 最小 WA（store.acts + settingsBus）。 */
function load(code, rows, cfg0) {
  let cfg = Object.assign({ enabled: true, maxActs: 8, maxRun: 4, defaultDurationMs: 60000 }, cfg0 || {});
  const store = { acts: { rows: rows || [], res: [] } };
  const WA = {
    clock: { now: function () { return NOW; } },
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
  vm.runInNewContext(code, {
    window: win, Date: Date, Number: Number, String: String, Array: Array, Object: Object,
    isFinite: isFinite, Math: Math, JSON: JSON, RegExp: RegExp, parseInt: parseInt
  }, { filename: REL });
  return { api: win.WorldAxis.act, store: store, WA: win.WorldAxis };
}
/** 一条行动：status = planned|running；at / dueAt 可给。 */
function row(id, person, status, at, dueAt) {
  const x = { id: id, person: person, kind: 'work', text: '活 ' + id, status: status };
  if (at !== undefined) x.at = NOW - at;
  if (dueAt !== undefined) x.dueAt = NOW + dueAt;
  return x;
}
/** 从注入块里取出人名（行形态：`甲：work「...」...`）。 */
function namesIn(block) {
  if (!block) return [];
  return block.split('\n').filter(function (l) { return /^[^\[\s]/.test(l) && l.indexOf('：') > 0; })
    .map(function (l) { return l.split('：')[0].trim(); });
}
/** 主局面：4 条很早登记、一直 planned；2 条刚登记、running、5s / 60s 后结束。 */
function mainRows() {
  return [
    row('a1', '甲', 'planned', 5 * H), row('a2', '乙', 'planned', 5 * H),
    row('a3', '丙', 'planned', 5 * H), row('a4', '丁', 'planned', 5 * H),
    row('a5', '戊', 'running', 60000, 60000), row('a6', '己', 'running', 30000, 5000)
  ];
}
/** 一条判据、多个局面 —— 供 N 段对**同一条**判据做负控。 */
function quotaProblems(code) {
  const bad = [];
  const A = load(code, mainRows());
  const got = namesIn(A.api.buildBlock());
  const st = A.api.stat().block || {};
  if (got.length !== 4) bad.push('条数应为 maxRun(4)（实 ' + got.length + '）');
  if (got.indexOf('戊') < 0 || got.indexOf('己') < 0) {
    bad.push('running 的两条必须进（实 ' + JSON.stringify(got) + '）—— 旧版这里是四个 planned');
  }
  if (got[0] !== '己') bad.push('dueAt 最近的（己，5s）应排第一（实 ' + got[0] + '）');
  if (got[1] !== '戊') bad.push('dueAt 次近的（戊，60s）应排第二（实 ' + got[1] + '）');
  if (st.running !== 2) bad.push('读数 running 应为 2（实 ' + st.running + '）');
  if (st.planned !== 4) bad.push('读数 planned 应为 4（实 ' + st.planned + '）');
  if (st.picked !== got.length) bad.push('读数 picked 与行数不一致（' + st.picked + ' vs ' + got.length + '）');
  if (st.mode !== 'running-first') bad.push('mode 应为 running-first（实 ' + st.mode + '）');

  // 名额够就全进、顺序不变
  const B = load(code, [row('b1', '甲', 'planned', 2 * H), row('b2', '乙', 'running', 60000, 60000)], { maxRun: 8 });
  const gotB = namesIn(B.api.buildBlock());
  if (JSON.stringify(gotB) !== JSON.stringify(['甲', '乙'])) {
    bad.push('名额够时不许重排（期望 甲,乙，实 ' + JSON.stringify(gotB) + '）');
  }
  if ((B.api.stat().block || {}).mode !== 'all-fit') bad.push('名额够时 mode 应为 all-fit');

  // running 压过 planned：planned 登记更早也不行
  const C = load(code, [row('c1', '甲', 'planned', 9 * H), row('c2', '乙', 'running', 1000, 1000)],
    { maxRun: 1 });
  const gotC = namesIn(C.api.buildBlock());
  if (gotC[0] !== '乙') bad.push('running 应压过更早登记的 planned（实 ' + JSON.stringify(gotC) + '）');

  // 同档 dueAt 升序；都没 dueAt 时按 at 升序
  const D = load(code, [row('d1', '甲', 'running', 1000, 90000), row('d2', '乙', 'running', 2000, 10000)],
    { maxRun: 1 });
  const gotD = namesIn(D.api.buildBlock());
  if (gotD[0] !== '乙') bad.push('同档 dueAt 近的应先（实 ' + JSON.stringify(gotD) + '）');
  const E = load(code, [row('e1', '甲', 'planned', 1000), row('e2', '乙', 'planned', 9000)], { maxRun: 1 });
  const gotE = namesIn(E.api.buildBlock());
  if (gotE[0] !== '甲') bad.push('都没 dueAt 时登记早的应先（实 ' + JSON.stringify(gotE) + '）');
  return bad;
}

// ══════════════════ A 静态 ══════════════════
ok('A1 旧写法在代码行里消失：ACTIVE filter 后不再跟 slice(0, maxRun)；pickRun 恰 1 处且真调', function () {
  assert.strictEqual(CODE.split('.slice(0, cfg.maxRun)').length - 1, 0,
    '按登记顺序截断还在代码里（注释里的纠正性引用不算，本判据已去注释）');
  assert.strictEqual(CODE.split('function pickRun(').length - 1, 1, 'pickRun 应恰 1 处定义');
  assert.strictEqual(CODE.split('= pickRun(active, cfg.maxRun)').length - 1, 1, 'buildBlock 应恰调 1 次');
});
ok('A2 排序键四种齐：running 优先 / dueAt 升序 / at 升序 / id 字典序', function () {
  const i = CODE.indexOf('function pickRun(');
  const seg = CODE.slice(i, i + 1200);
  assert.ok(seg.indexOf("a.status === 'running'") >= 0, '缺 running 判据');
  assert.ok(seg.indexOf('dueOf(') >= 0, '缺 dueAt 判据');
  assert.ok(seg.indexOf('atOf(') >= 0, '缺 at 判据');
  assert.ok(seg.indexOf('ai < bi') >= 0, '缺 id 字典序（同输入要同输出）');
});
ok('A3 读数投影是拷贝：stat() 里 o.block = __lastBlock ? Object.assign({}, __lastBlock) : null', function () {
  assert.ok(CODE.indexOf('o.block = __lastBlock ? Object.assign({}, __lastBlock) : null') >= 0,
    'stat 必须拷贝名额面（stat 本身是浅拷贝的计数器对象，直接挂上去就是共享引用）');
});
ok('A4 名额面读数有读面：tool-diag 的 secAction 节真被 collect 调用', function () {
  const td = codeOnly(rd('engines/tool-diag.js'));
  assert.ok(td.indexOf('function secAction()') >= 0, 'tool-diag 应有 act 诊断节');
  assert.ok(td.indexOf('act: secAction()') >= 0, '该节必须真被 collect 调用');
  assert.ok(td.indexOf('block: st.block || null') >= 0, '节里要真取名额面读数');
  assert.strictEqual(td.indexOf('WA.act.buildBlock'), -1, '诊断节**不许**调 buildBlock（那会推进名额面读数）');
});
ok('A5 三个数并列：读数里 active / running / planned 各自成立', function () {
  const A = load(SRC, mainRows());
  A.api.buildBlock();
  const st = A.api.stat().block;
  ['active', 'candidates', 'picked', 'running', 'planned', 'quota', 'mode'].forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(st, k), '缺栏：' + k);
  });
  assert.strictEqual(st.active, 6, 'active 应是 6（实 ' + st.active + '）');
  assert.strictEqual(st.running + st.planned, st.active, 'running + planned 必须等于 active');
});

// ══════════════════ B 行为 ══════════════════
ok('B1 主局面（4 planned + 2 running，maxRun=4）：running 两条必须进，且 dueAt 近的在前', function () {
  const bad = quotaProblems(SRC);
  assert.deepStrictEqual(bad, [], '判据不通过：\n    · ' + bad.join('\n    · '));
});
ok('B2 名额够时行为不变（2 条 ≤ 4 ⇒ 原样全进、顺序不变）', function () {
  const A = load(SRC, [row('b1', '甲', 'planned', 2 * H), row('b2', '乙', 'running', 60000, 60000)], { maxRun: 8 });
  assert.strictEqual(JSON.stringify(namesIn(A.api.buildBlock())), JSON.stringify(['甲', '乙']),
    '没有取舍就不许改顺序');
});
ok('B3 running 压过更早登记的 planned（这一条是本批的核心）', function () {
  const A = load(SRC, [row('c1', '甲', 'planned', 9 * H), row('c2', '乙', 'running', 1000, 1000)], { maxRun: 1 });
  assert.strictEqual(JSON.stringify(namesIn(A.api.buildBlock())), JSON.stringify(['乙']),
    '「他打算做」不许压掉「他正在做」');
});
ok('B4 结算后的行动不进注入块（旧锁 v2117/b1[10] 的性质，本批不许弄丢）', function () {
  const A = load(SRC, [row('t1', '甲', 'done', 1000), row('t2', '乙', 'failed', 1000),
    row('t3', '丙', 'aborted', 1000), row('live', '丁', 'running', 1000, 60000)]);
  assert.strictEqual(JSON.stringify(namesIn(A.api.buildBlock())), JSON.stringify(['丁']),
    '终态不许当现场');
});
ok('B5 只读：构建注入块后行动表逐字未变', function () {
  const A = load(SRC, mainRows());
  const before = JSON.stringify(A.store.acts.rows);
  A.api.buildBlock();
  A.api.stat();
  assert.strictEqual(JSON.stringify(A.store.acts.rows), before, '注入面不许改行动表');
});

// ══════════════════ C 读数 ══════════════════
ok('C1 stat().block 七栏齐全，picked 与注入块行数一致', function () {
  const A = load(SRC, mainRows());
  const got = namesIn(A.api.buildBlock());
  const st = A.api.stat().block;
  assert.ok(st && typeof st === 'object', '构建过之后应有 block');
  assert.strictEqual(st.picked, got.length, '读数与块必须同源（' + st.picked + ' vs ' + got.length + '）');
  assert.strictEqual(st.quota, 4, 'quota 应是 maxRun（实 ' + st.quota + '）');
});
ok('C2 block 是拷贝不是引用（改返回值不许污染下一次读数）', function () {
  const A = load(SRC, mainRows());
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
  assert.strictEqual(A.api.buildBlock(), '', '没有 active 时注入块为空串');
  const st = A.api.stat().block;
  assert.ok(st && st.picked === 0, '构建过但空表 ⇒ picked 为 0（实 ' + JSON.stringify(st) + '）');
  assert.strictEqual(st.mode, 'empty', '空表的 mode 应是 empty（实 ' + st.mode + '）');
});
ok('C4 mode 三态可分辨（all-fit / running-first / empty）', function () {
  const A = load(SRC, [row('x1', '甲', 'planned', 1000)], { maxRun: 8 });
  A.api.buildBlock();
  assert.strictEqual(A.api.stat().block.mode, 'all-fit');
  const B = load(SRC, mainRows());
  B.api.buildBlock();
  assert.strictEqual(B.api.stat().block.mode, 'running-first');
});
ok('C5 candidates 与 picked 不许恒等（名额面必须真起作用）', function () {
  const A = load(SRC, mainRows());
  A.api.buildBlock();
  const st = A.api.stat().block;
  assert.strictEqual(st.candidates, 6, '候选应 6 条（实 ' + st.candidates + '）');
  assert.strictEqual(st.picked, 4, '只提 4 条（实 ' + st.picked + '）');
  assert.notStrictEqual(st.candidates, st.picked, '两个数若恒等，说明「名额」是个假读数');
});

// ══════════════════ N 负控 ══════════════════
ok('N1 负控：把选材改回「按登记顺序切片」⇒ B 的同一条判据必须现形', function () {
  const ANCHOR = '    const pick = pickRun(active, cfg.maxRun);';
  assert.strictEqual(SRC.split(ANCHOR).length - 1, 1, '锚点应唯一');
  const poisoned = SRC.replace(ANCHOR,
    '    const pick = { picked: active.slice(0, cfg.maxRun), mode: \'legacy\', quota: cfg.maxRun };');
  const bad = quotaProblems(poisoned);
  assert.ok(bad.length > 0, '改回按序切片之后判据居然还通过 ⇒ 判据不认这个病灶');
  assert.ok(bad.join('|').indexOf('running 的两条必须进') >= 0,
    '必须点名 running 被挤掉（实：' + bad.join(' / ') + '）');
});
ok('N2 负控：删掉 running 优先（只按 dueAt/at 排）⇒ 次序判据必须现形', function () {
  const ANCHOR = "      if (ra !== rb) return rb - ra;                       // ② running 先";
  assert.strictEqual(SRC.split(ANCHOR).length - 1, 1, '锚点应唯一');
  const poisoned = SRC.replace(ANCHOR, '      if (false && ra !== rb) return rb - ra;');
  // 局面要挑「只有 running 优先才能区分」的那种：两条都**没有 dueAt**，
  //   甲登记更早（planned）、乙晚（running）。有判据 ⇒ 乙；没判据 ⇒ 按 at 升序取甲。
  //   （本批第一次给的局面里乙还有 dueAt，于是 dueAt 判据也把乙排前面了 ⇒ 负控假绿。）
  const A = load(poisoned, [row('c1', '甲', 'planned', 9 * H), row('c2', '乙', 'running', 1000)],
    { maxRun: 1 });
  const got = namesIn(A.api.buildBlock());
  assert.strictEqual(JSON.stringify(got), JSON.stringify(['甲']),
    '去掉 running 优先后应退回「登记早的」（实 ' + JSON.stringify(got) + '）—— 若仍是乙，这条负控没量到东西');
});
ok('N3 负控：读数不拷贝（直接挂同一个对象）⇒ C2 必须现形', function () {
  const ANCHOR = 'o.block = __lastBlock ? Object.assign({}, __lastBlock) : null;';
  assert.strictEqual(SRC.split(ANCHOR).length - 1, 1, '锚点应唯一');
  const poisoned = SRC.replace(ANCHOR, 'o.block = __lastBlock;');
  const A = load(poisoned, mainRows());
  A.api.buildBlock();
  const b1 = A.api.stat().block;
  assert.ok(b1, '破坏后 stat 仍应给出 block');
  b1.picked = 999;
  assert.strictEqual(A.api.stat().block.picked, 999, '负控没改到东西 ⇒ C2 无效');
});

// ── 收口 ────────────────────────────────────────────────────
console.log('\n人物行动注入名额专锁 v2.559.0：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  fails.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}