/**
 * WorldAxis tests/scenario-v59-betrothal-dowry-feud.js (v2.400.0)
 * 场景 59：联姻谈判 → 妆匛议价 → 悔婚反噬（V22 贯通链 D）
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   「高攀要补钱」与「悔婚要还更多」必须是同一条链上的两件事：
 *   门第差 → 妆匛倍率 → 绑定强度 → 悔婚代价 → 绑定折损。
 *   链断了会出现两种假象：① 妆匛算了但方向不明（谁欠谁读不出来）；
 *   ② 悔婚罚了但绑定没折（「悔了等于没悔」）。
 *
 * ── 三个接缝（任一断了这条链就是摆设）────────────────────────────────
 *   ① 妆匛**方向**：低门第那家付（dowryPaidBy），不是「谁娶谁付」；
 *   ② 悔婚**代价与折损**是两件事：penalty 是钱，tieAfter 是关系；
 *      且折损是「减半」不是「清零」（往来已经发生了）；
 *   ③ 门第差过大 ⇒ 议不成（rank-gap-too-wide），**不报一个很小的 odds 了事** ——
 *      「也许能成」的模糊空间正是本仓要治的东西。
 *
 * ── 为什么用两门亲对比（而不是只跑一门）──────────────────────────────
 *   只跑一门时，「妆匛 = 100」既可能是对的，也可能是常数。两门同 baseDowry、
 *   不同门第差对照，才能证明倍率真的在起作用。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/betrothal-alliance.js');
require('../engines/action-desk.js');
WA.betrothalAlliance.setSettings({ enabled: true });
WA.actionDesk.setSettings({ enabled: true });
console.log('[Scenario 59] 联姻谈判→妆匛议价→悔婚反噬 贯通链测试...');

// ── 第 1 级：门当户对（差 0 级）—— 妆匛 = 基数，绑定最强 ──
const peer = WA.betrothalAlliance.proposeMatch({
  id: 'v59-peer', houseA: '李氏', houseB: '王氏', rankA: 5, rankB: 5, baseDowry: 100
});
assert.strictEqual(peer.ok, true);
assert.strictEqual(peer.rankGap, 0);
assert.strictEqual(peer.dowry, 100, '差 0 级 ⇒ 妆匛恰为基数 100');
assert.strictEqual(peer.tieStrength, 1, '平等联姻绑定强度封顶 1');
assert.strictEqual(peer.breachPenalty, 200, '悔婚代价 = 妆匛 × 2');
console.log('✓ 1. 门当户对：妆匛 ' + peer.dowry + ' / 绑定 ' + peer.tieStrength
  + ' / 悔婚代价 ' + peer.breachPenalty);

// ── 第 2 级：门第差 2 级 —— 妆匛抬 50%，绑定变弱，悔婚更贵 ──
//   接缝 ①的对照组：同 baseDowry，只改门第差。
const gap2 = WA.betrothalAlliance.proposeMatch({
  id: 'v59-gap2', houseA: '李氏', houseB: '赵氏', rankA: 7, rankB: 5, baseDowry: 100
});
assert.strictEqual(gap2.ok, true);
assert.strictEqual(gap2.rankGap, 2);
assert.strictEqual(gap2.dowry, 150, '差 2 级 ⇒ 100 × (1 + 2 × 0.25) = 150');
assert.strictEqual(gap2.dowry > peer.dowry, true, '门第差越大妆匛越贵（不是常数）');
assert.strictEqual(gap2.tieStrength < peer.tieStrength, true,
  '门第差越大绑定越弱（' + peer.tieStrength + ' → ' + gap2.tieStrength + '）');
assert.strictEqual(gap2.breachPenalty > peer.breachPenalty, true,
  '悔婚代价随妆匛一起涨（' + peer.breachPenalty + ' → ' + gap2.breachPenalty + '）');
console.log('✓ 2. 差 2 级：妆匛 ' + peer.dowry + ' → ' + gap2.dowry
  + ' / 绑定 ' + peer.tieStrength + ' → ' + gap2.tieStrength
  + ' / 悔婚 ' + peer.breachPenalty + ' → ' + gap2.breachPenalty);

// ── 第 3 级：接缝 ① —— 妆匛方向可读：低门第那家付 ──
//   为什么方向要单独钉：门第高的人家收聘、低的人家出嫁妆，方向写反了
//   整条「联姻是负担」的语义就反了（变成「高攀还能赚钱」）。
const settleGap2 = WA.betrothalAlliance.settle({ id: 'v59-gap2', at: 1000 });
assert.strictEqual(settleGap2.ok, true);
assert.strictEqual(settleGap2.dowryPaidBy, '赵氏', 'rankB=5 更低 ⇒ 赵氏付（实 ' + settleGap2.dowryPaidBy + '）');
assert.strictEqual(settleGap2.dowry, gap2.dowry, '落定时读到的妆匛与提案一致');
assert.strictEqual(settleGap2.cumulativeTie, gap2.tieStrength, '首次落定 ⇒ 累计绑定 = 本次绑定');
console.log('✓ 3. 妆匛方向可读：' + settleGap2.dowryPaidBy + ' 付 ' + settleGap2.dowry
  + '，累计绑定 ' + settleGap2.cumulativeTie);

// ── 第 4 级：接缝 ② —— 悔婚：钱与关系是两件事 ──
const breach = WA.betrothalAlliance.breach({ id: 'v59-gap2' });
assert.strictEqual(breach.ok, true);
assert.strictEqual(breach.wasSettled, true, '落定后悔婚，须如实标 wasSettled');
assert.strictEqual(breach.penalty, gap2.breachPenalty, '悔婚罚金 = 提案时的 breachPenalty');
assert.strictEqual(breach.penaltyPaidBy, '赵氏', '罚金方向与妆匛同向（谁受益谁赔）');
assert.strictEqual(breach.tieAfter < settleGap2.cumulativeTie, true,
  '绑定必须折损（' + settleGap2.cumulativeTie + ' → ' + breach.tieAfter + '）');
assert.strictEqual(breach.tieAfter > 0, true,
  '折损是**减半**不是清零（' + breach.tieAfter + ' > 0）—— 往来已经发生了');
console.log('✓ 4. 悔婚反噬：罚 ' + breach.penalty + '（' + breach.penaltyPaidBy + ' 付）'
  + '，绑定 ' + settleGap2.cumulativeTie + ' → ' + breach.tieAfter + '（减半非清零）');

// ── 第 5 级：门第差过大 ⇒ 议不成（不报一个很小的 odds 了事）──
const tooWide = WA.betrothalAlliance.proposeMatch({
  id: 'v59-wide', houseA: '李氏', houseB: '庶民张', rankA: 9, rankB: 1
});
assert.strictEqual(tooWide.ok, false, '差 8 级 ⇒ 议不成');
assert.strictEqual(/rank-gap-too-wide/.test(tooWide.hint || ''), true);
assert.strictEqual(tooWide.rankGap, 8, '如实报差了几级（不留「也许能成」的模糊空间）');
console.log('✓ 5. 门第差 8 级 ⇒ 议不成（rank-gap-too-wide，差 ' + tooWide.rankGap + ' 级）');

// ── 第 6 级：重复悔婚必须拒（不许一鱼两吃）──
const breachAgain = WA.betrothalAlliance.breach({ id: 'v59-gap2' });
assert.strictEqual(breachAgain.ok, false);
assert.strictEqual(/bad-state/.test(breachAgain.hint || ''), true);
console.log('✓ 6. 重复悔婚被拒（bad-state）—— 不许一鱼两吃');

// ── 第 7 级：路由穿透 —— match.propose / settle / breach 三条都拿到引擎真算的 ──
const deskPropose = WA.actionDesk.plan('match.propose', {
  id: 'v59-desk', houseA: '甲', houseB: '乙', rankA: 6, rankB: 4, baseDowry: 200
});
assert.strictEqual(deskPropose.ok, true);
assert.strictEqual(deskPropose.dowry, 300, '差 2 级 ⇒ 200 × 1.5 = 300');
const deskSettle = WA.actionDesk.plan('match.settle', { id: 'v59-desk', at: 5 });
assert.strictEqual(deskSettle.ok, true);
assert.strictEqual(deskSettle.dowryPaidBy, '乙');
const deskBreach = WA.actionDesk.plan('match.breach', { id: 'v59-desk' });
assert.strictEqual(deskBreach.ok, true);
assert.strictEqual(deskBreach.penalty, 600, '悔婚罚 = 300 × 2');
console.log('✓ 7. 三条路由穿透：propose dowry=' + deskPropose.dowry
  + ' / settle paidBy=' + deskSettle.dowryPaidBy + ' / breach penalty=' + deskBreach.penalty);

// ── 负控制（拒绝路径）──
//   N1：同一家联姻 —— 需要两个不同的家族。
const n1 = WA.betrothalAlliance.proposeMatch({ id: 'x', houseA: '甲', houseB: '甲', rankA: 5, rankB: 5 });
assert.strictEqual(n1.ok, false);
assert.strictEqual(/same-house/.test(n1.hint || ''), true);
//   N2：缺门第 —— 门第是议价基础，不许默认相等。
const n2 = WA.betrothalAlliance.proposeMatch({ id: 'x', houseA: '甲', houseB: '乙' });
assert.strictEqual(n2.ok, false);
assert.strictEqual(/missing-rank/.test(n2.hint || ''), true);
//   N3：未知婚约 —— 没提过亲就不能落定。
const n3 = WA.betrothalAlliance.settle({ id: 'v59-ghost' });
assert.strictEqual(n3.ok, false);
assert.strictEqual(/unknown-match/.test(n3.hint || ''), true);
//   N4：未落定就悔婚 —— 允许（提案即可悔），但「已悔」不能重复悔。
//       这里钉的是「未知婚约悔婚必须拒」。
const n4 = WA.betrothalAlliance.breach({ id: 'v59-ghost2' });
assert.strictEqual(n4.ok, false);
assert.strictEqual(/unknown-match/.test(n4.hint || ''), true);
console.log('✓ 8. 四条负控制全部拦截（same-house / missing-rank / unknown-match ×2）');
console.log('[Scenario 59] 贯通链 D 全部达标');
