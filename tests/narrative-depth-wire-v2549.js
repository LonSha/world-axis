'use strict';
/**
 * tests/narrative-depth-wire-v2549.js — 附件第二刀专锁（折叠不许停在半句 + 近邻姓名只报不并）
 *
 * 缝的是「迷雾之外 · Interlude v4.7.2」两条口径：
 *   ① `mjClip`：截断绝不留下半句（退到句末；退不到就硬切补句号）。
 *      本仓落点：`inject-budget.trim` 的**字符级**折叠（结构化块走整行整舍，不受影响）。
 *      旧行为退到「\n / 。 / ； / ，」里最靠后的一个 ⇒ 常见结果是停在逗号上：
 *      `因果：A、B，` —— 模型拿到一个悬空的并列，会自己补完那一条。
 *   ② `mjSimilarText`：相似但不相等的候选**只报不并**。
 *      本仓落点：`prefilter-gate.resolveName` 的丢弃分支 —— 名字差一个字时，
 *      旧行为是静默 `out-of-roster`（角色整轮被忽略，读数只写「丢了 1 个」）；
 *      现在丢弃项带 `near`（名字 + 分数），但**不进 characters / 不改 ROSTER**。
 *
 * 负控（人工做，做完还原）：
 *   ① 把 foldHead 退回「四者取最靠后、cut+1」⇒ A1 红（折叠点回到逗号上）；
 *   ② 删掉 screen 里 `d.near = r.near` 那行 ⇒ B1 红（丢弃项没有 near）；
 *   ③ 把 nearNames 的阈值判断去掉（无条件报第一个）⇒ B2 红（毫不相干的也报）。
 */
const assert = require('assert');
const env = require('./ui-gate-sync.js').fresh();
const W = env.WA;
const store = W.store;
store.init();
const IB = W.injectBudget;
const PF = W.prefilterGate;
const MARK = '\n…（内容过长已折叠）';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' :: ' + e.message); throw e; }
}

ok('A0 前置：injectBudget.trim / tokensOf、prefilterGate.screen 在场', function () {
  assert.ok(IB && typeof IB.trim === 'function', 'injectBudget.trim 缺席');
  assert.ok(IB && typeof IB.tokensOf === 'function', 'injectBudget.tokensOf 缺席');
  assert.ok(PF && typeof PF.screen === 'function', 'prefilterGate.screen 缺席');
});

ok('A1 折叠点退到句末：不再停在逗号上（旧行为会给出「甲去城东，」）', function () {
  const text = ('甲去城东，乙去城西，丙留在客栈，丁去了码头，戊在桥上等，己在渡口').repeat(4);
  const out = IB.trim(text, 20);
  assert.ok(out.indexOf(MARK) >= 0, '应折叠：' + out);
  const head = out.slice(0, out.length - MARK.length);
  assert.ok(/。$/.test(head), '折叠点前的最后一个字符必须是句末句号：' + JSON.stringify(head));
  assert.ok(!/，$/.test(head), '不许停在逗号上：' + JSON.stringify(head));
});

ok('A2 退不到句末就硬切补句号（没有标点也留下完整停顿）', function () {
  const text = '甲乙丙丁戊己庚辛壬癸'.repeat(6);
  const out = IB.trim(text, 20);
  const head = out.slice(0, out.length - MARK.length);
  assert.ok(/。$/.test(head), '没有可退边界时应补句号：' + JSON.stringify(head));
});

ok('A3 补句号不破预算：几种预算下 tokensOf(out) 都不超上限', function () {
  const text = ('甲去城东，乙去城西，丙留在客栈，丁去了码头，戊在桥上等，己在渡口').repeat(3);
  [12, 16, 24, 40].forEach(function (cap) {
    const out = IB.trim(text, cap);
    assert.ok(IB.tokensOf(out) <= cap, 'cap=' + cap + ' 实测 ' + IB.tokensOf(out) + '：' + JSON.stringify(out));
  });
});

ok('A4 结构化块不受影响：尾部约束句仍在，且不额外插句号', function () {
  const text = '[关系六型]\n阿福：主仆\n阿珍：青梅\n不得补写未列明的第四人';
  const out = IB.trim(text, 30);
  assert.ok(out.indexOf('不得补写未列明的第四人') >= 0, '尾约束句应保留：' + out);
  assert.ok(out.indexOf('。。') < 0, '不该插出连续句号：' + out);
});

ok('B1 近邻姓名只报不并：错一个字时丢弃项带 near（角色仍不被采纳）', function () {
  PF.clearRoster();
  PF.register(['和泉纱雾', '阿福', '桐谷和人']);
  const r = PF.screen('archive', [{ name: '和泉纱零', kind: 'onSite' }]);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(r.characters.indexOf('和泉纱雾') < 0, '近邻不许被自动采纳：' + JSON.stringify(r.characters));
  const d = (r.dropped || []).filter(function (x) { return x.name === '和泉纱零'; })[0];
  assert.ok(d, '应有丢弃项：' + JSON.stringify(r.dropped));
  assert.strictEqual(d.why, 'out-of-roster');
  assert.ok(Array.isArray(d.near) && d.near.length, '丢弃项应带 near：' + JSON.stringify(d));
  assert.strictEqual(d.near[0].name, '和泉纱雾');
  assert.ok(d.near[0].score >= 60, '分数应如实给出：' + JSON.stringify(d.near[0]));
});

ok('B2 毫不相干的丢弃项不带 near（宁漏不猜）', function () {
  PF.clearRoster();
  PF.register(['和泉纱雾', '阿福']);
  const r = PF.screen('archive', [{ name: '隔壁老张', kind: 'onSite' }]);
  const d = (r.dropped || []).filter(function (x) { return x.name === '隔壁老张'; })[0];
  assert.ok(d, JSON.stringify(r.dropped));
  assert.ok(!d.near, '不该硬凑一个近邻：' + JSON.stringify(d));
});

ok('B3 精确匹配与别名路径不受影响（near 只长在丢弃分支上）', function () {
  PF.clearRoster();
  PF.register(['和泉纱雾', '阿福']);
  PF.alias('纱雾', '和泉纱雾');
  const r = PF.screen('archive', [{ name: '纱雾', kind: 'onSite' }, { name: '阿福', kind: 'onSite' }]);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  // 跨 vm 域的数组原型不同，deepStrictEqual 会报「结构相同但非同引用」：只比内容。
  assert.strictEqual(JSON.stringify(r.characters.slice().sort()), JSON.stringify(['和泉纱雾', '阿福'].sort()));
  assert.ok(!(r.dropped || []).length, '两条都该走通，不是被当成近邻丢掉：' + JSON.stringify(r.dropped));
});

ok('B4 阈值可配：nearThreshold=95 时错一字不再报（宁可沉默）', function () {
  PF.clearRoster();
  PF.register(['和泉纱雾']);
  PF.setSettings({ nearThreshold: 95 });
  const r = PF.screen('archive', [{ name: '和泉纱零', kind: 'onSite' }]);
  const d = (r.dropped || [])[0];
  assert.ok(d && !d.near, '95 分阈值下 67 分不该报：' + JSON.stringify(d));
  PF.setSettings({ nearThreshold: 60 });
  const r2 = PF.screen('archive', [{ name: '和泉纱零', kind: 'onSite' }]);
  assert.ok((r2.dropped || [])[0].near, '调回 60 应重新报出来');
});

ok('B5 只报不并：screen 不改名单（不新增、不替换）', function () {
  PF.clearRoster();
  PF.register(['和泉纱雾', '阿福']);
  const before = PF.roster().names.slice().sort();
  PF.screen('archive', [{ name: '和泉纱零', kind: 'onSite' }]);
  const after = PF.roster().names.slice().sort();
  assert.strictEqual(JSON.stringify(after), JSON.stringify(before), '名单不该被近邻改写：' + JSON.stringify(after));
});

console.log('\nnarrative-depth-wire-2549: pass (' + pass + ' 段：折叠不留半句 / 近邻只报不并)');