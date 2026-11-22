#!/usr/bin/env node
'use strict';
/**
 * tests/dormant-quota-v2556.js —— 「暗线注入名额」分配判据专锁（v2.556.0）
 *
 * 治的缺口（本文件存在的唯一理由）：`engines/dormant-ladder.js` 的 `buildBlock()`。
 *
 *   它是「你知道的暗线」这张台账的唯一出口（`render/inject.js` 每轮调）。到本批之前
 *   它是这样选材的：
 *
 *       const r = project({ limit: 8 });                       // ① 先截 8 条
 *       const items = (r.items || []).filter(四态);             // ② 再筛
 *       items.slice(0, cfg.blockLimit)                          // ③ 再按数组顺序取 N
 *
 *   三处都可疑，其中两处已被实测证实：
 *     ① **筛在截断之后**：名额先被 8 条候选占掉，随后才筛 —— 筛掉的条目把配额也带走了；
 *     ② **按数组顺序取**：先来的占满名额。实测局面（8 条「听闻」+ 1 条「已介入」
 *        + 1 条「已错过」，blockLimit = 3）：注入单是「听闻的线一/二/三」——
 *        最弱档（玩家刚听说、什么都不用做）把名额全占，「已介入」（正在推）与
 *        「已错过」（该交待或放弃）一条都进不来。
 *   这就是 v2.555.0 在 foreshadow 治过的同一个病，**第二处**。
 *
 *   ③ 还有一个**死路径**：project 的第二个分支读的是 `d.foreshadow`（顶层键），
 *      而全仓伏笔只写在 `memory.foreshadows`（engines/foreshadow.js 的 list() 同源）。
 *      `Array.isArray(undefined)` 恒 false ⇒ 「埋着的」这一整支**从来没产出一行**。
 *      实测：`project().items.filter(x => x.side === 'foreshadow').length === 0`
 *      （即使 memory.foreshadows 里明明白白有两条）。
 *
 * 本批做的三件事：
 *   · 读真源 `(d.memory || {}).foreshadows`（防泄露闸照旧：hidden 一条都不进）；
 *   · 候选上限（project 的 limit）不再兼任输出名额 —— **先筛后截**；
 *   · `pickBlock`：按引擎自己的六态 `LADDER` 位次降序（**不新造优先级表**）
 *     ⇒ 已错过 > 已介入 > 未确认 > 听闻；同档按 `ladderAt` 越近越先；再同按 id 字典序；
 *     名额够时原样全进（没有取舍就不改行为）。
 *
 * 判据结构：
 *   A 静态（死路径消失 / 先筛后截 / 判据只有一个正身 / 读面在位）
 *   B 行为（同一局面谁入选 / 伏笔真进场 / 名额够不变 / 同档次序 / 防泄露 / 两端态不进）
 *   C 读数（名额面六栏 / 拷贝 / 空表与没构建过 / mode 三态 / candidates ≠ picked）
 *   N 负控（改回按序切片 ⇒ B 红；改回 d.foreshadow ⇒ B 红；改回 limit:8 ⇒ B 红；
 *           读数不拷贝 ⇒ C2 红）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/dormant-ladder.js';

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
const NOW = 1700000000000;

/** 装载（真源码 or 破坏副本）：真 vm + 最小 WA。 */
function load(code, store, cfg0) {
  let cfg = Object.assign({ enabled: true, blockLimit: 3 }, cfg0 || {});
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
    window: win, Date: Date, Number: Number, String: String, Array: Array,
    Object: Object, isFinite: isFinite, Math: Math, JSON: JSON
  }, { filename: REL });
  return { api: win.WorldAxis.dormantLadder, store: store, WA: win.WorldAxis };
}
/** 一条暗线：state 由 stage/ladder 推出（这里直接给 ladder，最明确）。 */
function cur(id, ladder, at) {
  const c = { id: id, title: '线 ' + id, visibility: 'trace', ladder: ladder, kind: 'current' };
  if (at !== undefined) c.ladderAt = NOW - at;
  return c;
}
/** 主局面：8 条「听闻」+ 1 条「已介入」+ 1 条「已错过」+ 2 条伏笔（memory.foreshadows）。 */
function mainStore() {
  return {
    currents: [cur('c1', '听闻'), cur('c2', '听闻'), cur('c3', '听闻'), cur('c4', '听闻'),
      cur('c5', '听闻'), cur('c6', '听闻'), cur('c7', '听闻'), cur('c8', '听闻'),
      cur('c9', '已介入', 60000), cur('c10', '已错过', 30000)],
    memory: {
      foreshadows: [
        { id: 'f_old', content: '埋着的老账', status: 'waiting' },
        { id: 'f_new', content: '刚埋的新账', status: 'waiting' }
      ]
    }
  };
}
/** 从注入块里取出被列出的标题（行形态：`- 标题（态，来路）`）。 */
function titlesIn(block) {
  const out = [];
  const re = /^- (.+?)（/gm;
  let m;
  while ((m = re.exec(block)) !== null) out.push(m[1]);
  return out;
}
/** 一条判据、多个局面 —— 供 N 段对**同一条**判据做负控。 */
function quotaProblems(code) {
  const bad = [];
  const A = load(code, mainStore());
  const got = titlesIn(A.api.buildBlock());
  const st = A.api.stat().block || {};
  // ① 最深的先提：已错过 > 已介入
  if (got[0] !== '线 c10') bad.push('第一位应是「已错过」那条（实 ' + got[0] + '）');
  if (got[1] !== '线 c9') bad.push('第二位应是「已介入」那条（实 ' + got[1] + '）');
  // ② 名额只 3 个，第 3 个给「未确认」（伏笔），不是给「听闻」
  if (got[2] !== '刚埋的新账' && got[2] !== '埋着的老账') {
    bad.push('第三位应是「未确认」的伏笔（实 ' + got[2] + '）—— 若给的是听闻，说明阶梯序没生效');
  }
  if (got.length !== 3) bad.push('条数应为 blockLimit(3)（实 ' + got.length + '）');
  if (st.mode !== 'deepest-first') bad.push('mode 应为 deepest-first（实 ' + st.mode + '）');
  if (st.candidates !== 12) bad.push('候选应为 12（8 听闻 + 已介入 + 已错过 + 2 伏笔），实 ' + st.candidates);
  if (st.picked !== got.length) bad.push('读数 picked 与行数不一致（' + st.picked + ' vs ' + got.length + '）');
  if (st.quota !== 3) bad.push('quota 应为 3（实 ' + st.quota + '）');

  // ③ 伏笔真进场（死路径已修）
  const p = A.api.project({ limit: 999 });
  const fs2 = (p.items || []).filter(function (x) { return x.side === 'foreshadow'; });
  if (fs2.length !== 2) bad.push('project 里 side=foreshadow 应为 2 条（实 ' + fs2.length + '）—— 读的是不是 d.foreshadow？');

  // ④ 名额够就全进、顺序不变
  const B = load(code, { currents: [cur('b1', '听闻'), cur('b2', '已错过')] });
  const gotB = titlesIn(B.api.buildBlock());
  if (JSON.stringify(gotB) !== JSON.stringify(['线 b1', '线 b2'])) {
    bad.push('名额够时应原样全进且顺序不变（实 ' + JSON.stringify(gotB) + '）');
  }
  // ⑤ 同档按 ladderAt 越近越先
  const C = load(code, { currents: [cur('d1', '听闻', 900000), cur('d2', '听闻', 60000),
    cur('d3', '已介入', 5000000), cur('d4', '未确认', 7000000)] }, { blockLimit: 2 });
  const gotC = titlesIn(C.api.buildBlock());
  if (gotC[0] !== '线 d3') bad.push('同档之上的深度优先：已介入 应先于 未确认/听闻（实 ' + JSON.stringify(gotC) + '）');
  const D = load(code, { currents: [cur('e1', '听闻', 900000), cur('e2', '听闻', 60000)] }, { blockLimit: 1 });
  const gotD = titlesIn(D.api.buildBlock());
  if (gotD[0] !== '线 e2') bad.push('同档应按「最近变化」在前（e2 刚动过，实 ' + JSON.stringify(gotD) + '）');
  return bad;
}

// ══════════════════ A 静态 ══════════════════
ok('A1 死路径已消失：代码里 `d.foreshadow` 0 处，真源 `(d.memory || {}).foreshadows` 在位', function () {
  assert.strictEqual(CODE.split('d.foreshadow').length - 1, 0,
    '还在读顶层 d.foreshadow —— 伏笔真源是 memory.foreshadows（注释里的纠正性引用不算，本判据已去注释）');
  assert.strictEqual(CODE.split('(d.memory || {}).foreshadows').length - 1, 1, '真源应恰取一处');
});
ok('A2 先筛后截：代码里不再有 `project({ limit: 8 })`，候选上限用防御量', function () {
  assert.strictEqual(CODE.split('project({ limit: 8 })').length - 1, 0, 'limit: 8 还在 —— 那个数字同时兼任了输出名额');
  assert.strictEqual(CODE.split('project({ limit: Number.MAX_SAFE_INTEGER })').length - 1, 1, '候选上限应只做防御');
});
ok('A3 名额分配只有一个正身：pickBlock 恰 1 处定义，且 buildBlock 真调它', function () {
  assert.strictEqual(CODE.split('function pickBlock(').length - 1, 1, 'pickBlock 应恰 1 处定义');
  assert.strictEqual(CODE.split('= pickBlock(items, cfg.blockLimit)').length - 1, 1, 'buildBlock 应恰调 1 次');
});
ok('A4 进注入块的四态只有一个正身：VISIBLE_STATES 恰 1 处定义且被用来筛', function () {
  assert.strictEqual(CODE.split("const VISIBLE_STATES = ['听闻', '未确认', '已介入', '已错过']").length - 1, 1, 'VISIBLE_STATES 应恰 1 处定义');
  assert.strictEqual(CODE.split('VISIBLE_STATES.indexOf(x.state)').length - 1, 1, '筛选应真用它（不再内联四个 === 串联）');
});
ok('A5 名额面读数有读面：view() 与 stat() 都带 block，且 tool-diag 有诊断节真读它', function () {
  assert.ok(CODE.indexOf('block: __lastBlock ? Object.assign({}, __lastBlock) : null') >= 0, 'stat/view 应把 block 报出来');
  const n = CODE.split('Object.assign({}, __lastBlock)').length - 1;
  assert.ok(n >= 2, 'view 与 stat 两处都要投影（实 ' + n + '）—— 接了线没人读是本仓反复治的病');
  // tool-diag 的诊断节：定义了不接进 collect 就是死代码（本仓「零消费能力当场删」）
  const td = codeOnly(rd('engines/tool-diag.js'));
  assert.ok(td.indexOf('function secDormantLadder()') >= 0, 'tool-diag 应有暗线阶梯诊断节');
  assert.ok(td.indexOf('dormantLadder: secDormantLadder()') >= 0, '该节必须真被 collect 调用');
  assert.ok(td.indexOf('block: st.block || null') >= 0, '节里要真取名额面读数（不是只报 items 数）');
});

// ══════════════════ B 行为 ══════════════════
ok('B1 主局面（8 听闻 + 已介入 + 已错过 + 2 伏笔，quota=3）：阶梯越深越先提，全项一致', function () {
  const bad = quotaProblems(SRC);
  assert.deepStrictEqual(bad, [], '判据不通过：\n    · ' + bad.join('\n    · '));
});
ok('B2 死路径修复的行为证据：伏笔真进候选（side=foreshadow），且能进注入块', function () {
  const A = load(SRC, mainStore());
  const p = A.api.project({ limit: 999 });
  assert.strictEqual((p.items || []).filter(function (x) { return x.side === 'foreshadow'; }).length, 2,
    '两条 memory.foreshadows 必须出现在投影里');
  const got = titlesIn(A.api.buildBlock());
  assert.ok(got.indexOf('刚埋的新账') >= 0 || got.indexOf('埋着的老账') >= 0,
    '伏笔必须真能进注入块（实 ' + JSON.stringify(got) + '）');
});
ok('B3 名额够时行为不变（2 条 ≤ 3 ⇒ 原样全进、顺序不变）', function () {
  const A = load(SRC, { currents: [cur('b1', '听闻'), cur('b2', '已错过')] });
  assert.deepStrictEqual(titlesIn(A.api.buildBlock()), ['线 b1', '线 b2'], '没有取舍就不许改顺序');
  assert.strictEqual(A.api.stat().block.mode, 'all-fit');
});
ok('B4 同档按「最近变化」在前，再同按 id 字典序（可复算）', function () {
  const A = load(SRC, { currents: [cur('z9', '听闻', 900000), cur('a1', '听闻', 60000)] }, { blockLimit: 1 });
  assert.deepStrictEqual(titlesIn(A.api.buildBlock()), ['线 a1'], '刚动过的应在前');
  const B = load(SRC, { currents: [cur('m2', '听闻'), cur('a1', '听闻')] }, { blockLimit: 1 });
  assert.deepStrictEqual(titlesIn(B.api.buildBlock()), ['线 a1'], '同刻应 id 字典序（a1 在 m2 前）');
});
ok('B5 防泄露闸照旧：hidden 的暗线与伏笔一条都不进，且计进 leaked', function () {
  const A = load(SRC, {
    currents: [{ id: 'h1', title: '隐藏的线', visibility: 'hidden', ladder: '已错过' }],
    memory: { foreshadows: [{ id: 'h2', content: '隐藏的账', status: 'waiting', hidden: true },
      { id: 'h3', content: '可见的账', status: 'waiting' }] }
  });
  const p = A.api.project({ limit: 999 });
  const ids = (p.items || []).map(function (x) { return x.id; });
  assert.strictEqual(ids.indexOf('h1'), -1, 'hidden 暗线不许进投影');
  assert.strictEqual(ids.indexOf('h2'), -1, 'hidden 伏笔不许进投影');
  assert.ok(ids.indexOf('h3') >= 0, '可见的伏笔要在（否则「防泄露」把真数据也拦了）');
  assert.ok(A.api.stat().leaked >= 2, '被拦的条数要留痕（实 ' + A.api.stat().leaked + '）');
});
ok('B6 两端态不进注入块：未闻（玩家还不知道）与已了结（已收束）', function () {
  const A = load(SRC, { currents: [cur('u1', '未闻'), cur('t1', '已了结'), cur('k1', '未确认')] });
  assert.deepStrictEqual(titlesIn(A.api.buildBlock()), ['线 k1'], '未闻 / 已了结都不许进');
});

// ══════════════════ C 读数 ══════════════════
ok('C1 stat().block 六栏齐全，picked 与注入单行数一致', function () {
  const A = load(SRC, mainStore());
  const got = titlesIn(A.api.buildBlock());
  const st = A.api.stat().block;
  assert.ok(st && typeof st === 'object', '构建过之后应有 block');
  ['at', 'candidates', 'picked', 'quota', 'mode', 'ladder'].forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(st, k), '缺栏：' + k);
  });
  assert.strictEqual(st.picked, got.length, '读数与注入单必须同源（' + st.picked + ' vs ' + got.length + '）');
  // 注意：`st.ladder` 是**跨 vm 边界**出来的数组（原型是 vm 那个 realm 的 Array），
  //   `deepStrictEqual` 会比原型 ⇒ 恒不相等。这里比内容，不比来源。
  assert.strictEqual(JSON.stringify(st.ladder), JSON.stringify(['未闻', '听闻', '未确认', '已介入', '已错过', '已了结']),
    '阶梯枚举一并报出（它是判据的基准，不是装饰）');
  assert.strictEqual(A.api.view().block.picked, st.picked, 'view 与 stat 必须同源');
});
ok('C2 block 是拷贝不是引用（改返回值不许污染下一次读数）', function () {
  const A = load(SRC, mainStore());
  A.api.buildBlock();
  const b1 = A.api.stat().block;
  b1.picked = 999; b1.mode = 'tampered';
  const b2 = A.api.stat().block;
  assert.notStrictEqual(b2.picked, 999, '返回值是引用 ⇒ 读数能被外部改写');
  assert.notStrictEqual(b2.mode, 'tampered', '返回值是引用 ⇒ mode 能被外部改写');
});
ok('C3 「构建过但空表」与「从没构建过」是两个读数（picked:0 vs null）', function () {
  const A = load(SRC, {});
  assert.strictEqual(A.api.stat().block, null, '还没构建过时必须是 null —— 不许拿 0 冒充');
  assert.strictEqual(A.api.buildBlock(), '', '没有候选时注入块为空串');
  const st = A.api.stat().block;
  assert.ok(st && st.picked === 0, '构建过但空表 ⇒ block 有值且 picked 为 0（实 ' + JSON.stringify(st) + '）');
  assert.strictEqual(st.mode, 'empty', '空表的 mode 应是 empty（实 ' + st.mode + '）');
});
ok('C4 mode 三态可分辨（all-fit / deepest-first / empty）', function () {
  const A = load(SRC, { currents: [cur('x1', '未确认')] });
  A.api.buildBlock();
  assert.strictEqual(A.api.stat().block.mode, 'all-fit');
  const B = load(SRC, mainStore());
  B.api.buildBlock();
  assert.strictEqual(B.api.stat().block.mode, 'deepest-first');
});
ok('C5 candidates 与 picked 不许恒等（否则名额面根本没起作用）', function () {
  const A = load(SRC, mainStore());
  A.api.buildBlock();
  const st = A.api.stat().block;
  assert.strictEqual(st.candidates, 12, '候选应 12 条（实 ' + st.candidates + '）');
  assert.strictEqual(st.picked, 3, '只提 3 条（实 ' + st.picked + '）');
  assert.notStrictEqual(st.candidates, st.picked, '两个数若恒等，说明「名额」是个假读数');
});

// ══════════════════ N 负控 ══════════════════
ok('N1 负控：把选材改回「按数组顺序切片」⇒ B 的同一条判据必须现形', function () {
  const poisoned = SRC.replace('const pick = pickBlock(items, cfg.blockLimit);',
    'const pick = { picked: items.slice(0, cfg.blockLimit), mode: \'legacy\', quota: cfg.blockLimit };');
  assert.notStrictEqual(poisoned, SRC, '负控没改到东西（锚点失配）⇒ 这条负控自身失效');
  const bad = quotaProblems(poisoned);
  assert.ok(bad.length > 0, '改回按序切片之后判据居然还通过 ⇒ 判据不认这个病灶');
  assert.ok(bad.join('|').indexOf('已错过') >= 0, '必须点名「已错过」被挤掉（实：' + bad.join(' / ') + '）');
});
ok('N2 负控：把伏笔真源改回 `d.foreshadow` ⇒ 死路径判据必须现形', function () {
  const poisoned = SRC.replace('(Array.isArray((d.memory || {}).foreshadows) ? d.memory.foreshadows : [])',
    '(Array.isArray(d.foreshadow) ? d.foreshadow : [])');
  assert.notStrictEqual(poisoned, SRC, '负控没改到东西（锚点失配）');
  const A = load(poisoned, mainStore());
  assert.strictEqual((A.api.project({ limit: 999 }).items || []).filter(function (x) { return x.side === 'foreshadow'; }).length, 0,
    '改回死路径之后伏笔居然还在 —— 这条负控不成立');
  assert.ok(quotaProblems(poisoned).join('|').indexOf('side=foreshadow') >= 0, '判据必须点名伏笔没进场');
});
ok('N3 负控：把候选上限改回 limit: 8 ⇒ 「筛前截断」必须现形（后两条候选被砍）', function () {
  const poisoned = SRC.replace('project({ limit: Number.MAX_SAFE_INTEGER })', 'project({ limit: 8 })');
  assert.notStrictEqual(poisoned, SRC, '负控没改到东西（锚点失配）');
  const A = load(poisoned, mainStore());
  const got = titlesIn(A.api.buildBlock());
  assert.strictEqual(got.indexOf('线 c10'), -1,
    'limit:8 之后「已错过」理应被砍（实 ' + JSON.stringify(got) + '）—— 若还在，说明这条负控量错了东西');
});
ok('N4 负控：读数不拷贝（直接返回同一个对象）⇒ C2 必须现形', function () {
  // 注意：这个字符串在**两处**出现（view 与 stat），`String.replace(串)` 只换第一处 ⇒
  //   只破坏 view 时 stat 仍返回拷贝，负控会假绿（本批第一次就踩在这里）。用全替换。
  const ANCHOR = 'block: __lastBlock ? Object.assign({}, __lastBlock) : null';
  const hits = SRC.split(ANCHOR).length - 1;
  assert.strictEqual(hits, 2, '锚点应恰 2 处（view + stat），实 ' + hits);
  const poisoned = SRC.split(ANCHOR).join('block: __lastBlock');
  const A = load(poisoned, mainStore());
  A.api.buildBlock();
  const b1 = A.api.stat().block;
  assert.ok(b1, '破坏后 stat 仍应给出 block');
  b1.picked = 999;
  assert.strictEqual(A.api.stat().block.picked, 999, '负控没改到东西 ⇒ C2 无效');
});

// ── 收口 ────────────────────────────────────────────────────
console.log('\n暗线注入名额专锁 v2.556.0：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  fails.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}