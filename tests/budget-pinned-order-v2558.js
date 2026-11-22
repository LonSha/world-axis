#!/usr/bin/env node
'use strict';
/**
 * tests/budget-pinned-order-v2558.js —— 「pinned 折叠顺序」专锁（v2.558.0）
 *
 * 治的缺口（本文件存在的唯一理由）：`engines/inject-budget.js` 的 `plan()` 第 ① 段。
 *
 *   那一段的注释从 v0.9.3 起就写着「pinned 优先：整体超预算时，**从 rank 最末开始折叠**
 *   （不静默丢弃 pinned）」。而实现是：
 *
 *       let pinnedTokens = pinned.reduce(...);
 *       pinned.forEach(function (x) { ... });        // ← 按**输入顺序**遍历
 *
 *   于是「先到的那条 rank2 只要放得下就先占住」，后面的 rank1 反倒先被折成一小段。
 *   实测（4 条 pinned：rank2 / rank1 / rank2 / rank1，各 60 token，budget 120）：
 *
 *       被折的 rank 序列 = [2, 1]
 *
 *   一条「近端事件」（rank1，最不可替代：丢一条模型就再也看不到这件事）
 *   被折成 30 token，而一条「世界状态」（rank2）完整保留 —— 优先级表当场失效，
 *   而读数上一切正常（kept 四条都在、reason 都是 `pinned_over_budget`）。
 *
 *   这是 v2.555.0 ~ v2.557.0 治过的同一个病（「谁先到谁占住名额」）的**第五处**，
 *   而且是在最不该丢的那一段上；前三处是单块内部的名额，这一处是**块与块之间**的取舍。
 *
 * 本批做的两件事（都守住前几批的口径）：
 *   · **预算够时不重排**：`pinnedTokens ≤ budget` ⇒ 原样遍历，行为完全不变（fail-open）；
 *   · 只有真需要取舍（pinned 整体超预算）才按 `rank` 升序 —— 放不下的自然是最末那档。
 *   这两条合起来让「注释承诺」与「实现」第一次对上。
 *
 * 判据结构：
 *   A 静态（pinned 遍历用排过序的那份 / 短路顺序对 / optional 那一段没被碰坏）
 *   B 行为（主局面只折 rank2 / 预算够不重排 / pinned 永不 dropped / 占位账恒等式）
 *   C 读数（三表齐全 / reason 不变 / rank 逐条可读）
 *   N 负控（改回按输入顺序 ⇒ B 红；去掉短路 ⇒ 「预算够不重排」红）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');

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

const TABLES = rd('engines/inject-budget-tables.js');
const SRC = rd('engines/inject-budget.js');
const CODE = codeOnly(SRC);

/** 装载：tables 先、budget 后（顺序不能反：budget 读 WA.injectBudgetTables）。 */
function load(budgetCode) {
  const G = { WorldAxis: {} };
  G.WorldAxis.registerModule = function () {};
  const ctx = { window: G, global: G, Date: Date, Number: Number, String: String, Array: Array,
    Object: Object, Math: Math, JSON: JSON, isFinite: isFinite, console: console, RegExp: RegExp,
    parseInt: parseInt, parseFloat: parseFloat };
  vm.runInNewContext(TABLES, ctx, { filename: 'engines/inject-budget-tables.js' });
  vm.runInNewContext(budgetCode, ctx, { filename: 'engines/inject-budget.js' });
  return G.WorldAxis.injectBudget;
}
/** 60 个中文字 ⇒ 60 token（tokensOf：CJK ×1 + 其余 /4，向上取整）。 */
function cjk(ch, n) { const a = []; for (let i = 0; i < n; i++) a.push(ch); return a.join(''); }
/** pinned 的两档真源名：rank1 = 本幕（场景意图）/ 近端事件，rank2 = 世界状态。 */
const R1A = '近端事件', R1B = '本幕（场景意图）', R2 = '世界状态';

// ══════════════════ A 静态 ══════════════════
ok('A1 pinned 的遍历用的是**排过序的那份**（pinned.forEach 0 处 / pinnedOrder.forEach 在位）', function () {
  assert.strictEqual(CODE.split('pinned.forEach(').length - 1, 0,
    '还在按输入顺序遍历 —— 注释承诺「从 rank 最末开始折叠」就不成立');
  assert.strictEqual(CODE.split('pinnedOrder.forEach(').length - 1, 1, 'pinnedOrder.forEach 应恰 1 处');
});
ok('A2 排序判据是 rank 升序（不是别的键，也不是稳定序凑巧）', function () {
  const i = CODE.indexOf('const pinnedOrder =');
  assert.ok(i >= 0, 'pinnedOrder 定义在位');
  const seg = CODE.slice(i, i + 220);
  assert.ok(seg.indexOf('a.rank - b.rank') >= 0, '必须按 rank 升序（实：' + seg.slice(0, 120) + '）');
});
ok('A3 短路顺序对：预算够时用**原数组**（pinnedTokens <= budget ? pinned : 排序副本）', function () {
  const i = CODE.indexOf('const pinnedOrder =');
  const seg = CODE.slice(i, i + 220).replace(/\s+/g, ' ');
  assert.ok(/pinnedTokens <= budget/.test(seg), '短路条件应在（实：' + seg + '）');
  assert.ok(/\? pinned /.test(seg) || /\? pinned\n/.test(seg) || seg.indexOf('? pinned') >= 0,
    '预算够时必须用原数组（否则常态下也在重排 = 改了不该改的行为）');
  assert.ok(seg.indexOf('pinned.slice().sort') >= 0, '不够时才排副本（不许就地排，入参不改）');
});
ok('A4 optional 那一段没被碰坏：仍按 rank 升序填充', function () {
  const i = CODE.indexOf('optional.forEach(');
  assert.ok(i >= 0, 'optional.forEach 在位');
  // 钉的是 optional 的**定义行**（它在 pinned 之前定义，离 forEach 有 300+ 字符，窗口法量不到）
  assert.ok(CODE.indexOf("return x.rank > 2; }).sort(function (a, b) { return a.rank - b.rank; })") >= 0,
    'optional 的排序判据必须在（它在 v2.85.0 就对了，本批不许碰坏）');
});

// ══════════════════ B 行为 ══════════════════
ok('B1 主局面（rank2/1/2/1 各 60 token，budget 120）：被折的**全是 rank2**', function () {
  const B = load(SRC);
  const p = B.plan([
    { source: R2, content: cjk('甲', 60) },
    { source: R1A, content: cjk('乙', 60) },
    { source: R2, content: cjk('丙', 60) },
    { source: R1A, content: cjk('丁', 60) }
  ], { budget: 120 });
  // 注意：`folded` 项里**没有** rank 字段（只有 kept 是原样 push 的）——
  //   所以这条判据按 **source 名**量，别去反查 rank（那要额外 plan，且反查本身也可能写错）。
  const foldedSrc = p.folded.map(function (x) { return x.source; });
  assert.ok(foldedSrc.length > 0, '这一局面必须有折叠（实 0 条）');
  assert.strictEqual(JSON.stringify(foldedSrc), JSON.stringify([R2, R2]),
    '被折的应是两条 rank2（实 ' + JSON.stringify(foldedSrc) + '）—— 旧版这里是 [R2, R1A]');
});
ok('B2 rank1 的两条必须**完整**保留（tokens 原值，不是折叠后的 30）', function () {
  const B = load(SRC);
  const p = B.plan([
    { source: R2, content: cjk('甲', 60) },
    { source: R1A, content: cjk('乙', 60) },
    { source: R2, content: cjk('丙', 60) },
    { source: R1A, content: cjk('丁', 60) }
  ], { budget: 120 });
  const fullR1 = p.kept.filter(function (x) { return x.rank === 1 && x.tokens === 60; });
  assert.strictEqual(fullR1.length, 2, 'rank1 应有 2 条完整保留（实 ' + fullR1.length + '）');
  const fullR2 = p.kept.filter(function (x) { return x.rank === 2 && x.tokens === 60; });
  assert.strictEqual(fullR2.length, 0, 'rank2 不许有完整保留的（实 ' + fullR2.length + '）—— 那说明 rank1 又被挤了');
});
ok('B3 预算够时**不重排**（顺序 = 输入顺序，行为与旧版完全一致）', function () {
  const B = load(SRC);
  const p = B.plan([
    { source: R2, content: cjk('甲', 10) },
    { source: R1A, content: cjk('乙', 10) },
    { source: R1B, content: cjk('丙', 10) }
  ], { budget: 9999 });
  const got = p.kept.map(function (x) { return x.source; });
  // 跨 vm 边界的数组原型不同，`deepStrictEqual` 会比原型 ⇒ 比内容。
  assert.strictEqual(JSON.stringify(got), JSON.stringify([R2, R1A, R1B]),
    '没有取舍就不许改顺序（实 ' + JSON.stringify(got) + '）');
  assert.strictEqual(p.folded.length, 0, '预算够就不该有折叠');
});
ok('B4 pinned 永不 dropped（只折叠）—— 这一条是引擎的承诺，本批不许弄丢', function () {
  const B = load(SRC);
  const p = B.plan([
    { source: R1A, content: cjk('乙', 200) },
    { source: R2, content: cjk('甲', 200) }
  ], { budget: 40 });
  assert.strictEqual(p.dropped.filter(function (x) { return x.rank <= 2; }).length, 0,
    'pinned 一条都不许 dropped（实 ' + JSON.stringify(p.dropped.map(function (x) { return x.source; })) + '）');
  assert.ok(p.folded.length >= 1, '超预算的 pinned 应走折叠');
});
ok('B5 占位账恒等式仍成立：remainAt + ΣblockedBy.tokens === budget', function () {
  const B = load(SRC);
  const p = B.plan([
    { source: R2, content: cjk('甲', 60) },
    { source: R1A, content: cjk('乙', 60) },
    { source: R2, content: cjk('丙', 60) },
    { source: R1A, content: cjk('丁', 60) }
  ], { budget: 120 });
  p.folded.forEach(function (f) {
    const sum = (f.blockedBy || []).reduce(function (s, x) { return s + x.tokens; }, 0);
    assert.strictEqual(f.remainAt + sum, 120, '占位账不平：' + JSON.stringify(f.remainAt) + '+' + sum);
  });
});

// ══════════════════ C 读数 ══════════════════
ok('C1 三张表都在，且 reason 仍是 pinned_over_budget（口径没被我改掉）', function () {
  const B = load(SRC);
  const p = B.plan([
    { source: R2, content: cjk('甲', 60) },
    { source: R1A, content: cjk('乙', 60) },
    { source: R2, content: cjk('丙', 60) },
    { source: R1A, content: cjk('丁', 60) }
  ], { budget: 120 });
  ['kept', 'folded', 'dropped'].forEach(function (k) {
    assert.ok(Array.isArray(p[k]), k + ' 应是数组');
  });
  p.folded.forEach(function (f) {
    assert.strictEqual(f.reason, 'pinned_over_budget', 'reason 口径变了（实 ' + f.reason + '）');
  });
});
ok('C2 kept 的每一条都带 rank（读数可逐条复核，不靠外部反查）', function () {
  const B = load(SRC);
  const p = B.plan([
    { source: R2, content: cjk('甲', 60) },
    { source: R1A, content: cjk('乙', 60) }
  ], { budget: 120 });
  p.kept.forEach(function (k) {
    assert.ok(typeof k.rank === 'number', 'kept 项缺 rank：' + JSON.stringify(k));
  });
});
ok('C3 未声明源仍然可观测（v2.85.0 A4 的性质，本批不许弄丢）', function () {
  const B = load(SRC);
  const p = B.plan([{ source: '一个没登记过的源', content: '甲' }], { budget: 9999 });
  assert.ok((p.unranked || []).indexOf('一个没登记过的源') >= 0,
    '未声明源必须报进 unranked（实 ' + JSON.stringify(p.unranked) + '）');
});

// ══════════════════ N 负控 ══════════════════
ok('N1 负控：把遍历改回 `pinned`（按输入顺序）⇒ B1 必须现形', function () {
  const ANCHOR = 'pinnedOrder.forEach(';
  assert.strictEqual(SRC.split(ANCHOR).length - 1, 1, '锚点应唯一');
  const poisoned = SRC.replace(ANCHOR, 'pinned.forEach(');
  const B = load(poisoned);
  const p = B.plan([
    { source: R2, content: cjk('甲', 60) },
    { source: R1A, content: cjk('乙', 60) },
    { source: R2, content: cjk('丙', 60) },
    { source: R1A, content: cjk('丁', 60) }
  ], { budget: 120 });
  const foldedSrc = p.folded.map(function (x) { return x.source; });
  assert.ok(foldedSrc.indexOf(R1A) >= 0 || foldedSrc.indexOf(R1B) >= 0,
    '改回输入顺序之后 rank1 居然没被折 —— 这条负控量错了东西（实 ' + JSON.stringify(foldedSrc) + '）');
});
ok('N2 负控：去掉「预算够不重排」的短路（总是排序）⇒ B3 必须现形', function () {
  const ANCHOR = 'const pinnedOrder = (pinnedTokens <= budget)';
  assert.strictEqual(SRC.split(ANCHOR).length - 1, 1, '锚点应唯一');
  const poisoned = SRC.replace(ANCHOR, 'const pinnedOrder = (false)');
  const B = load(poisoned);
  const p = B.plan([
    { source: R2, content: cjk('甲', 10) },
    { source: R1A, content: cjk('乙', 10) },
    { source: R1B, content: cjk('丙', 10) }
  ], { budget: 9999 });
  const gotN = p.kept.map(function (x) { return x.source; });
  assert.strictEqual(JSON.stringify(gotN), JSON.stringify([R1A, R1B, R2]),
    '去掉短路之后顺序应变成按 rank 排（实 ' + JSON.stringify(gotN) + '）'
    + '—— 若仍是输入顺序，「预算够不重排」这条就没被测到');
});

// ── 收口 ────────────────────────────────────────────────────
console.log('\npinned 折叠顺序专锁 v2.558.0：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  fails.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}