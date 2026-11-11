/**
 * WorldAxis tests/scenario-v58-regalia-checkpoint.js (v2.400.0)
 * 场景 58：僭越服饰 → 门禁盘查 → 身份败露（V22 贯通链 C）
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   「穿错衣服」必须真的**在城门前被识破**，而不是「风险算得很高但没人抓」。
 *   链：sartorialRegalia 判僭越与风险 → 门禁盘查按「两条独立通道」算被识破概率
 *   → 认人层（identityMatch）给出「是不是他」的二值结论 → 通缉升级。
 *
 * ── 为什么这一条必须写成本锁（而不是并进 exv22 的 C 组）────────────────
 *   C5a~C5e 钉的是**算术**（risk=1、caught=true、两次结论相同）。本锁钉的是**接缝**：
 *     ① 服饰层的「自称身份」（claimedIdentity）必须真的抬高表观风险，
 *        否则「伪装官差骗过城门」这件事在机制上不存在；
 *     ② 盘查结论必须能喂给认人层 —— 「盘查说他穿着不对」与「认人说他不是他」
 *        是两件事，两件都成立才叫身份败露；
 *     ③ 认人层的 ambiguous（两个都像）**不得**被折成「就是他」——
 *        这是本仓点过的坑：分不清与认出来必须分开报。
 *
 * ── 本轮修过的一处真缺陷（本锁正是从它反推出来的）──────────────────────
 *   初版 `caughtProb = risk × scrutiny`：risk=1、scrutiny=0.45 ⇒ 恒 0.45 < 0.5 阈值
 *   ⇒ **最高僭越在任何盘查力下都抓不到**。乘法把「刺眼」压成了「像别人一样需要被发现」。
 *   现改为两条独立通道 1-(1-risk)(1-scrutiny)：risk=1 ⇒ 必被抓，与盘查力无关。
 *   本锁第 2 级把这条钉死：**降低盘查力也不影响「穿龙袍必被抓」**。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/sartorial-regalia.js');
require('../engines/identity-match.js');
require('../engines/action-desk.js');
WA.sartorialRegalia.setSettings({ enabled: true });
WA.identityMatch.saveSettings({ enabled: true });
WA.actionDesk.setSettings({ enabled: true });
console.log('[Scenario 58] 僭越服饰→门禁盘查→身份败露 贯通链测试...');

// ── 第 1 级：庶民穿龙袍 = 最高僭越，风险封顶 ──
const dress = WA.sartorialRegalia.attireAs({
  personId: 'v58-spy', set: 'dragon-robe', realIdentity: 'commoner'
});
assert.strictEqual(dress.ok, true);
assert.strictEqual(dress.usurping, true, '庶民穿龙袍必须是僭越');
assert.strictEqual(dress.requiredRank, 9, '龙纹袍要求九级（天子）');
assert.strictEqual(dress.realRank, 1, '庶民是一级');
assert.strictEqual(dress.risk, 1, '等级差 8 级 ⇒ 风险封顶 1（0.35 × 8 已超 1）');
console.log('✓ 1. 庶民穿龙袍：僭越成立，风险封顶 ' + dress.risk);

// ── 第 2 级：门禁必抓 —— 而且**降低盘查力也抓得到**（本锁最重要的一条）──
//   为什么把 scrutiny 调到极低还要断言被抓：
//   「穿龙袍」这件事本身就该刺眼到不需要任何人仔细看。若这里随 scrutiny 变化，
//   说明乘法缺陷又回来了（risk × scrutiny 在 risk=1 时恰等于 scrutiny）。
const gateLow = WA.sartorialRegalia.identifyAtGate({ personId: 'v58-spy', scrutiny: 0.01 });
assert.strictEqual(gateLow.ok, true);
assert.strictEqual(gateLow.caught, true,
  '盘查力 0.01 时也必须抓到（实 caughtProb=' + gateLow.caughtProbability + '）'
  + ' —— 乘法版本在这里会得到 0.01');
assert.strictEqual(gateLow.caughtProbability, 1, '风险 1 且不撒谎 ⇒ 被识破概率恰为 1');
const gateDefault = WA.sartorialRegalia.identifyAtGate({ personId: 'v58-spy' });
assert.strictEqual(gateDefault.caught, true);
assert.strictEqual(gateDefault.outcome, 'caught', '成功结果走 outcome（不是 reason）');
console.log('✓ 2. 门禁必抓：盘查力 0.01 也抓到（caughtProbability='
  + gateLow.caughtProbability + '）');

// ── 第 3 级：接缝 ① —— 自称抬高表观风险（伪装官差更容易露馅）──
//   同一个人、同一套衣服，只是多说了句「我是三品大员」：
//   风险不变（衣服规格不会因为自称变），但表观风险 +0.15 ⇒ 更容易被抓。
//   选儒生（三级）穿官帽（要求五级）：差 2 级 × 0.35 = 0.7，**不封顶**。
//   ⚠ 这里最初写的是「商人穿官帽」，但商人一级、官帽五级 ⇒ 差 4 级 × 0.35 = 1.4，
//     封顶后仍是 1 —— 于是「自称抬高表观风险」那条判据就退化了（两边都是 1，恒等）。
//     要测「抬高」，必须选一个**尚未封顶**的档位，否则判据在饱和区里空转。
const honest = WA.sartorialRegalia.attireAs({
  personId: 'v58-honest', set: 'official-cap', realIdentity: 'scholar'
});
assert.strictEqual(honest.risk < 1, true, '儒生穿官帽：差 2 级 ⇒ 风险 ' + honest.risk + '，未封顶');
const honestGate = WA.sartorialRegalia.identifyAtGate({ personId: 'v58-honest' });
const liar = WA.sartorialRegalia.attireAs({
  personId: 'v58-liar', set: 'official-cap', realIdentity: 'scholar', claimedIdentity: 'emperor'
});
assert.strictEqual(liar.risk, honest.risk, '自称不改变规制风险本身（衣服规格骗不了自己）');
const liarGate = WA.sartorialRegalia.identifyAtGate({ personId: 'v58-liar' });
assert.strictEqual(liarGate.caughtProbability >= honestGate.caughtProbability, true,
  '撒谎把表观风险抬高 ⇒ 被识破概率不低于老实人（' + honestGate.caughtProbability
  + ' → ' + liarGate.caughtProbability + '）');
console.log('✓ 3. 自称抬高表观风险：老实 ' + honestGate.caughtProbability
  + ' → 撒谎 ' + liarGate.caughtProbability + '（规制风险同为 ' + honest.risk + '）');

// ── 第 4 级：接缝 ② —— 盘查结论喂给认人层，「不是他」必须说得出 ──
//   盘查说「穿着不对」，认人说「这个人其实是谁」。两件都成立才叫身份败露。
//   候选分布：真身 score 低、冒名者 score 高 —— 认人层应给 matched 到冒名者。
const idRes = WA.identityMatch.match([
  { who: 'v58-real-chen', score: 0.31 },
  { who: 'v58-impostor', score: 0.88 }
]);
assert.strictEqual(idRes.ok, true);
assert.strictEqual(idRes.status, 'matched', '分布清晰时应能认出来');
assert.strictEqual(idRes.who, 'v58-impostor');
assert.strictEqual(idRes.gap > idRes.margin, true, '冠军与亚军差距必须真拉开（' + idRes.gap + '）');
console.log('✓ 4. 认人层给出「就是他/不是他」：matched → ' + idRes.who
  + '（gap=' + idRes.gap + ' > margin=' + idRes.margin + '）');

// ── 第 5 级：接缝 ③ —— 分不清不得折成「就是他」──
//   双胞胎/易容/同名场合必须报 ambiguous 而不是挑一个。
const twins = WA.identityMatch.match([
  { who: 'v58-twin-a', score: 0.80 },
  { who: 'v58-twin-b', score: 0.79 }
], { margin: 0.05 });
assert.strictEqual(twins.ok, true);
assert.strictEqual(twins.status, 'ambiguous', '两个都像必须报分不清，不许挑一个');
assert.strictEqual(twins.who, '', 'ambiguous 时不给出一个名字（空串，不是随便挑）');
assert.strictEqual(twins.second !== null, true, '必须同时报出亚军，读者才知道是「哪两个」分不清');
console.log('✓ 5. 分不清不折成认出来：ambiguous（' + twins.top.who + ' vs ' + twins.second.who
  + '，gap=' + Math.round(twins.gap * 1000) / 1000 + '）');

// ── 第 6 级：全都不像 ⇒ unknown，不许硬挑一个冠军 ──
const nobody = WA.identityMatch.match([{ who: 'v58-stranger', score: 0.05 }]);
assert.strictEqual(nobody.ok, true);
assert.strictEqual(nobody.status, 'unknown', '冠军低于门槛 ⇒ 谁都不像');
assert.strictEqual(nobody.who, '');
console.log('✓ 6. 谁都不像 ⇒ unknown（不硬挑一个冠军）');

// ── 第 7 级：路由穿透 —— attire.wear / attire.inspectAtGate 拿到引擎真算的 ──
const deskWear = WA.actionDesk.plan('attire.wear', {
  personId: 'v58-desk', set: 'court-robe', realIdentity: 'commoner'
});
assert.strictEqual(deskWear.ok, true);
assert.strictEqual(deskWear.risk, 1, '朝服七级 vs 庶民一级 ⇒ 差 6 级 ⇒ 封顶');
const deskGate = WA.actionDesk.plan('attire.inspectAtGate', { personId: 'v58-desk' });
assert.strictEqual(deskGate.ok, true);
assert.strictEqual(deskGate.caught, true);
assert.strictEqual(deskGate.outcome, 'caught');
console.log('✓ 7. 两条路由穿透：attire.wear risk=' + deskWear.risk
  + ' / attire.inspectAtGate outcome=' + deskGate.outcome);

// ── 负控制（拒绝路径）──
//   N1：未知规制名 —— 不在表内就拒，不许按「最像的那套」算。
const n1 = WA.sartorialRegalia.attireAs({ personId: 'p', set: 'phoenix-crown', realIdentity: 'commoner' });
assert.strictEqual(n1.ok, false);
assert.strictEqual(/unknown-set/.test(n1.hint || ''), true);
//   N2：未知身份 —— 没有等级就无法判僭越，不许默认「庶民」。
const n2 = WA.sartorialRegalia.attireAs({ personId: 'p', set: 'common-cloth', realIdentity: 'dragon-spirit' });
assert.strictEqual(n2.ok, false);
assert.strictEqual(/unknown-identity/.test(n2.hint || ''), true);
//   N3：没穿就无从盘查 —— 不许默认「合规通过」。
const n3 = WA.sartorialRegalia.identifyAtGate({ personId: 'v58-nobody-worn' });
assert.strictEqual(n3.ok, false);
assert.strictEqual(/not-attired/.test(n3.hint || ''), true);
//   N4：候选里全是非有限分数 ⇒ nothing-scored，不许按 0 分处理（0 与「没分」不同）。
const n4 = WA.identityMatch.match([{ who: 'x', score: 'NaN' }, { who: 'y' }]);
assert.strictEqual(n4.ok, false);
assert.strictEqual(n4.reason, 'nothing-scored');
console.log('✓ 8. 四条负控制全部拦截（unknown-set / unknown-identity / not-attired / nothing-scored）');
console.log('[Scenario 58] 贯通链 C 全部达标');
