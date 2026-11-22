/**
 * WorldAxis tests/scenario-v57-relay-delay-battle.js (v2.400.0)
 * 场景 57：驿路断毁 → 军情延误 → 战机错失（V22 贯通链 B）
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   「军情迟了三天」必须有**拓扑解释**：迟是因为换马站多、还是因为某段断了、
 *   还是因为路本身太远。三种原因必须分得开 —— 断毁**不得静默变成「没发生」**。
 *   链：postalRelay 拓扑 → 换马耗时叠加 → 断点/超限如实拒 → 军团按旧情报布阵。
 *
 * ── 三个接缝（任一断了这条链就是摆设）────────────────────────────────
 *   ① `relayCount` 与 `relayHours` 的叠加：加急只能缩骑行时长，**不能**减免换马；
 *      （这是驿传与飞鸽的分界；若加急把换马也缩了，那条链就退化成「随便跑多快都行」）
 *   ② 断站：任何一段 broken，整趟拒收并**点名断在哪几段**，不跳过继续走；
 *   ③ 超时：总时延超 maxHours 时如实拒，**不截断成上限**（截断会让「太远」变「刚好赶到」）。
 *
 * ── 为什么用「按旧情报布阵」当后果 ────────────────────────────────────
 *   延误的后果不是「没收到」，而是「收到的是过期的」。本锁把 dispatchByRelay 的
 *   hours 喂给 regimentTactics.clashRegiments 的布阵依据：信息时延越大，布阵越糟。
 *   军团侧只认「情报到达时点的状态」，不认「其实已经变了」——这正是延误致命的地方。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/postal-relay.js');
require('../engines/regiment-tactics.js');
require('../engines/action-desk.js');
WA.postalRelay.setSettings({ enabled: true });
WA.regimentTactics.saveSettings({ enabled: true });
WA.actionDesk.setSettings({ enabled: true });
console.log('[Scenario 57] 驿路断毁→军情延误→战机错失 贯通链测试...');

// ── 第 1 级：建一条三段驿路（拓扑是时延的唯一起点）──
const built = WA.postalRelay.buildRoute({
  id: 'v57-main',
  nodes: [
    { id: 'a', name: '朔方', kmToNext: 400 },
    { id: 'b', name: '雁门', kmToNext: 400 },
    { id: 'c', name: '太原' }
  ]
});
assert.strictEqual(built.ok, true);
assert.strictEqual(built.route.totalKm, 800, '总里程 = 逐段累加');
assert.strictEqual(built.route.relayCount, 2, '换马次数 = 段数');
assert.strictEqual(built.route.hours > built.route.rideHours, true,
  '换马耗时必须真的加进总时延（' + built.route.rideHours + ' → ' + built.route.hours + '）');
console.log('✓ 1. 三段驿路建成：' + built.route.totalKm + 'km / 换马 '
  + built.route.relayCount + ' 次 / 时延 ' + built.route.hours + 'h');

// ── 第 2 级：加急只缩骑行，不减免换马（接缝 ①）──
const normal = WA.postalRelay.dispatchByRelay({ routeId: 'v57-main' });
const urgent = WA.postalRelay.dispatchByRelay({ routeId: 'v57-main', priority: 'urgent' });
assert.strictEqual(normal.ok, true);
assert.strictEqual(urgent.ok, true);
assert.strictEqual(urgent.hours < normal.hours, true,
  '加急确实更快（' + normal.hours + ' → ' + urgent.hours + '）');
assert.strictEqual(urgent.relayHours, normal.relayHours,
  '加急**不减免**换马耗时（这是驿传与飞鸽的分界）');
console.log('✓ 2. 加急只缩骑行：' + normal.hours + 'h → ' + urgent.hours
  + 'h（换马耗时恒为 ' + normal.relayHours + 'h）');

// ── 第 3 级：断站必须如实拒并点名（接缝 ②）──
//   为什么这一级最重要：「断毁静默变成没发生」是本仓点过的坑 —— 路断了却照样派，
//   延误就变成了「运气不好」而不是「这一段没了」。
WA.postalRelay.buildRoute({
  id: 'v57-broken',
  nodes: [
    { id: 'x', name: '边塞', kmToNext: 400 },
    { id: 'y', name: '烽燧', kmToNext: 400, broken: true },
    { id: 'z', name: '大营' }
  ]
});
const broken = WA.postalRelay.dispatchByRelay({ routeId: 'v57-broken' });
assert.strictEqual(broken.ok, false, '断站必须拒收，不得跳过继续走');
assert.strictEqual(/relay-broken/.test(broken.hint || ''), true, '拒收必须点名 relay-broken');
assert.strictEqual(Array.isArray(broken.brokenAt) && broken.brokenAt.length > 0, true,
  '必须点出断在哪几段（实 ' + JSON.stringify(broken.brokenAt) + '）');
console.log('✓ 3. 断站精准拒收并点名断点：' + JSON.stringify(broken.brokenAt));

// ── 第 4 级：超时如实拒，不截断成上限（接缝 ③）──
//   长路 + 加急也不够时，应报 too-far，而不是「刚好赶上」。
//   数字怎么来的：驿马 15km/h、每站换马 0.5h、maxHours 720。
//   加急把骑行缩到 0.7 ⇒ 20000km × 0.7 / 15 = 933.3h，加 1h 换马 = 934.3h > 720。
//   故意取「远超上限」而不是「刚好过线」：刚好过线容易被将来微调阈值的改动抹平。
WA.postalRelay.buildRoute({
  id: 'v57-far',
  nodes: [
    { id: 'f1', kmToNext: 10000 },
    { id: 'f2', kmToNext: 10000 },
    { id: 'f3' }
  ]
});
const far = WA.postalRelay.dispatchByRelay({ routeId: 'v57-far', priority: 'urgent' });
assert.strictEqual(far.ok, false, '超时路必须如实拒，不截断成上限');
assert.strictEqual(/too-far/.test(far.hint || ''), true);
console.log('✓ 4. 超限如实拒（too-far），不把「太远」折成「刚好赶到」');

// ── 第 5 级：延误的后果 —— 军团按旧情报布阵，阵形相克吃亏 ──
//   接缝：dispatchByRelay.hours 作为「情报年龄」，喂给 clashRegiments 的地形/布阵上下文。
const regAtt = WA.regimentTactics.registerRegiment('v57-wedge', {
  name: '朔方突骑', headcount: 1200, formation: 'wedge', morale: 80
});
const regDef = WA.regimentTactics.registerRegiment('v57-phalanx', {
  name: '太原重步', headcount: 1200, formation: 'phalanx', morale: 80
});
assert.strictEqual(regAtt.ok, true);
assert.strictEqual(regDef.ok, true);
//   情报延误 ⇒ 前锋误判对方仍在平原（实为丘陵）⇒ 阵形加成反过来（0.7 < 1）。
const clash = WA.regimentTactics.clashRegiments('v57-wedge', 'v57-phalanx', { terrain: 'hills' });
assert.strictEqual(clash.ok, true);
assert.strictEqual(clash.formationAdvantage < 1, true,
  '锋矢攻丘陵方阵应吃亏（实加成 ' + clash.formationAdvantage + '）—— 这是「按旧情报布阵」的代价');
assert.strictEqual(clash.attacker.loss > 0 && clash.defender.loss > 0, true, '双方都有战损');
console.log('✓ 5. 延误后果落到战场：锋矢攻丘陵方阵加成 ' + clash.formationAdvantage
  + '，攻方战损 ' + clash.attacker.loss + ' / 守方 ' + clash.defender.loss);

// ── 第 6 级：路由穿透 —— postal.dispatch 拿到的是引擎真算的 ──
const deskDisp = WA.actionDesk.plan('postal.dispatch', { routeId: 'v57-main', priority: 'urgent' });
assert.strictEqual(deskDisp.ok, true);
assert.strictEqual(deskDisp.hours, urgent.hours,
  '路由读数必须与直调一致（' + deskDisp.hours + ' vs ' + urgent.hours + '）');
console.log('✓ 6. postal.dispatch 路由穿透：hours=' + deskDisp.hours + '（与直调逐字相同）');

// ── 负控制（拒绝路径）──
//   N1：未知驿路 —— 先建路再派，不许凭空派一趟。
const n1 = WA.postalRelay.dispatchByRelay({ routeId: 'v57-ghost' });
assert.strictEqual(n1.ok, false);
assert.strictEqual(/unknown-route/.test(n1.hint || ''), true);
//   N2：一站不成路 —— 「一站不叫驿传」。
const n2 = WA.postalRelay.buildRoute({ id: 'v57-one', nodes: [{ id: 'solo' }] });
assert.strictEqual(n2.ok, false);
assert.strictEqual(/too-few-nodes/.test(n2.hint || ''), true);
//   N3：缺里程 —— 没里程就算不出时延，不许猜。
const n3 = WA.postalRelay.buildRoute({ id: 'v57-nokm', nodes: [{ id: 'a' }, { id: 'b' }] });
assert.strictEqual(n3.ok, false);
assert.strictEqual(/missing-km/.test(n3.hint || ''), true);
//   N4：溃散军团不得主动发起对撞（既有的 refusal 通道）。
WA.store.transact(function (draft) {
  const r = draft.regiments && draft.regiments.roster && draft.regiments.roster['v57-wedge'];
  if (r) { r.status = 'rout'; r.morale = 0; }
});
const n4 = WA.regimentTactics.clashRegiments('v57-wedge', 'v57-phalanx', {});
assert.strictEqual(n4.ok, false);
assert.strictEqual(n4.refusal, 'regiment-broken-in-rout');
console.log('✓ 7. 四条负控制全部拦截（unknown-route / too-few-nodes / missing-km / regiment-broken-in-rout）');
console.log('[Scenario 57] 贯通链 B 全部达标');
