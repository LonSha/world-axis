#!/usr/bin/env node
// WorldAxis tests/livelihood-batch5-v2524.js -- V29 批五（EXV29-25～30）专锁
//
// 治的病
//   钱在现场只是数字：一个铺子对谁都报同一个价；灾年粮价涨了工钱照旧**没有读数**；
//   有人囤货没人担后果；欠谁多少要翻三个模块才拼得出来；钱毛了旧债要么不动要么被单方面改；
//   没钱的时候正文照旧让他吃席——**穷不是约束，只是面板红字**。
//
// 本锁钉住六段（每段都带负控制）：
//   L 三人三价：同物三人三价且各有依据；同参两次**逐字相同**（掺随机必红）；无底价不报价。
//   M 工资跟粮价走：购买力真算得出；**只报不改**（`applied:false`）。
//   N 灾年溢价与囤积：溢价有来源（没挂牌价就如实说 band:null）；囤者被记恨且次数累加。
//   O 玩家的账本：进出一笔可查；欠账**现取** credit-ledger（同一份账）。
//   P 钱毛了承诺：单方面折算被拒；双方点头才折得动；折过一次不重复改。
//   Q 穷是可感知的：钱不够时三处行为受限；钱够则约束解除。
'use strict';
const fresh = function (opts) { return require('./ui-gate-sync.js').fresh(opts).WA; };
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return true; }
  fail++; fails.push(name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
function eq(a, b, name) { return ok(a === b, name, { got: a, want: b }); }

const WA = fresh();
const PV = WA.priceVoice, LV = WA.livelihood, CL = WA.creditLedger;

// ── L：EXV29-25 三人三价 ──
ok(!!PV && typeof PV.quote === 'function', 'L0 priceVoice 已装');
eq(PV.quote({ resource: '米', buyer: '甲' }).reason, 'missing-fields', 'L1 无底价 ⇒ missing-fields（不替铺子编价）');
eq(PV.quote({ resource: '米', buyer: '甲', base: 10, urgency: 9 }).reason, 'unknown-kind', 'L2 急迫越界 ⇒ unknown-kind');
eq(PV.quote({ resource: '米', buyer: '甲', base: 10, knowledge: 'god' }).reason, 'unknown-kind', 'L3 知情档越界 ⇒ unknown-kind');
const l1 = PV.quote({ resource: '米', buyer: '甲', base: 10 });
const l2 = PV.clone ? PV.clone(l1) : JSON.parse(JSON.stringify(l1));
const l3 = PV.quote({ resource: '米', buyer: '甲', base: 10 });
eq(l1.price, l3.price, 'L4 **同参两次同价**（掺随机必红，负控制）');
ok(l1.why.length > 0 && l1.why.every(function (w) { return typeof w === 'string' && w.length > 0; }), 'L5 每条加减都带理由', l1.why);
const l4 = PV.compare({ resource: '米', base: 10, place: '城南', buyers: [
  { buyer: '生客', urgency: 0, knowledge: 'none' },
  { buyer: '熟客', urgency: 0, knowledge: 'some', regular: true },
  { buyer: '急用的人', urgency: 3, knowledge: 'none' }
] });
eq(l4.ok, true, 'L6 同一物三人各报一次');
eq(l4.quotes.length, 3, 'L6b 三个人三个价都在', l4.quotes.length);
ok(l4.spread > 0, 'L7 **三人三价**（价差不为 0）', l4.spread);
eq(l4.even, false, 'L7b even 如实报 false');
const l5 = PV.compare({ resource: '米', base: 10, buyers: [{ buyer: '甲' }, { buyer: '乙' }] });
eq(l5.even, !!l5.spread ? false : true, 'L8 同样身份同样急迫时价差只来自身份档（可解释）', l5.spread);

// ── M：EXV29-26 工资跟粮价走 ──
ok(!!LV && typeof LV.wageDrift === 'function', 'M0 livelihood 已装');
eq(LV.wageDrift({ wageBefore: 100, wageNow: 100, grainBefore: 10 }).reason, 'missing-fields', 'M1 少一个数 ⇒ 算不出');
const m1 = LV.wageDrift({ wageBefore: 100, wageNow: 100, grainBefore: 10, grainNow: 25 });
eq(m1.ok, true, 'M2 灾年粮价翻倍、工钱没动 ⇒ 算得出');
eq(m1.applied, false, 'M3 **只报不改**（不许静默调数，负控制）');
eq(m1.worse, true, 'M4 购买力真的下降');
ok(m1.changePct < 0, 'M4b 变化是负数', m1.changePct);
ok(/少/.test(m1.line), 'M5 一句话读得出来', m1.line);
const m2 = LV.wageDrift({ wageBefore: 100, wageNow: 200, grainBefore: 10, grainNow: 10 });
eq(m2.worse, false, 'M6 工钱涨了就不是"更难过"（反向对照）');

// ── N：EXV29-27 灾年溢价与囤积 ──
eq(LV.hoard({ place: '城南', resource: '米', qty: 10 }).reason, 'missing-fields', 'N1 不知道是谁在囤 ⇒ missing-fields');
const n1 = LV.hoard({ place: '城南', resource: '米', who: '粮行东家', qty: 50 });
eq(n1.ok, true, 'N2 囤积登记在案');
eq(n1.band, null, 'N3 **没有挂牌价就如实说 band:null**（不替市场编行情）', n1.band);
eq(n1.grudgeTimes, 1, 'N4 第一次囤：记一回');
const n2 = LV.hoard({ place: '城南', resource: '米', who: '粮行东家', qty: 30 });
eq(n2.grudgeTimes, 2, 'N5 第二次：街面开始念他', n2.grudgeTimes);
ok(/第 2 回/.test(n2.note), 'N5b 后果写进话里', n2.note);

// ── O：EXV29-28 玩家的账本 ──
eq(LV.ledger({ direction: 'sideways', amount: 1, what: 'x' }).reason, 'unknown-kind', 'O1 方向只有进/出');
eq(LV.ledger({ direction: 'in', amount: 10 }).reason, 'missing-fields', 'O2 说不清为了什么就不记');
LV.ledger({ direction: 'in', amount: 100, what: '结了一笔工钱' });
LV.ledger({ direction: 'out', amount: 30, what: '买米' });
const o1 = LV.ledgerView();
eq(o1.income, 100, 'O3 进项合计', o1.income);
eq(o1.spent, 30, 'O4 出项合计', o1.spent);
eq(o1.balance, 70, 'O5 余额算得对', o1.balance);
eq(o1.debts.count, 0, 'O6 没欠账时欠账为 0');
CL.open({ borrower: '我', lender: '钱庄', principal: 50, key: 'o-debt' });
const o2 = LV.ledgerView();
eq(o2.debts.count, 1, 'O7 **欠账同源**：信用账本一立据这里立刻看得见', o2.debts);
eq(o2.debts.total, 50, 'O7b 欠多少也读得到', o2.debts.total);
ok(LV.buildBlock().indexOf('【手头】') === 0, 'O8 注入面报手头', LV.buildBlock());

// ── P：EXV29-29 钱毛了承诺怎么办 ──
const p0 = CL.list('我');
const pid = p0.rows[0].id;
eq(LV.revalue({ id: 'no-such', pct: -10, agreedBy: ['我', '钱庄'] }).reason, 'not-happened', 'P1 没这张据 ⇒ not-happened');
eq(LV.revalue({ id: pid, pct: -20, agreedBy: ['我'] }).reason, 'missing-fields', 'P2 **单方面折算被拒**（负控制）');
eq(LV.revalue({ id: pid, pct: -20, agreedBy: ['钱庄'] }).reason, 'missing-fields', 'P3 只有贷方点头也不行');
const p1 = LV.revalue({ id: pid, pct: -20, agreedBy: ['我', '钱庄'] });
eq(p1.ok, true, 'P4 双方点头才折得动');
eq(p1.dueBefore, 50, 'P5 折算前说得清', p1.dueBefore);
eq(p1.dueAfter, 40, 'P6 折算后也说得清', p1.dueAfter);
eq(LV.revalue({ id: pid, pct: 10, agreedBy: ['我', '钱庄'] }).reason, 'already', 'P7 折过一次不重复改（负控制）');

// ── Q：EXV29-30 穷是可感知的约束 ──
const q1 = LV.hardship({ cash: 5, need: 40 });
eq(q1.restricted, true, 'Q1 钱不够 ⇒ 行为被限制');
eq(q1.limits.length, 3, 'Q2 **三处行为**都有据', q1.limits.length);
ok(q1.limits.every(function (x) { return x.area && x.what; }), 'Q3 每一处都写得具体（不是面板红字）', q1.limits);
eq(q1.shortfall, 35, 'Q4 差多少算得出', q1.shortfall);
const q2 = LV.hardship({ cash: 100, need: 40 });
eq(q2.restricted, false, 'Q5 钱够即恢复（约束解除）');
eq(q2.limits.length, 0, 'Q5b 没有限制项');

if (fail) {
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  fails.slice(0, 25).forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('PASS ' + pass + '/' + pass + ' (livelihood-batch5-v2524)');