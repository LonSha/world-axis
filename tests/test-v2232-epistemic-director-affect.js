'use strict';
/**
 * WorldAxis tests/test-v2232-epistemic-director-affect.js (v2.232.0)
 *
 * 验证 FateLoom 织机与月相系统 v3.0 机制缝合与防全知闭环:
 *   1. 聚光灯因果调度: 强介入场景词登场 (scene-hit-entry) 与激烈冲突避让 (busy-scene)
 *   2. 不在场痕迹轻提 (presence-trace) 与防全知穿帮硬拦截 (epistemic-leak-blocked)
 *   3. 多维情感力学 (E-P-R-I) 与段顶破门阶段锁 (gate-locked) 心理防御拉扯态
 *   4. 因果凭据破门解封 (unlockGate) 与偏执重力 (invidiaActive) 驱动
 *   5. 正文衍生 NPC 探测 (detectCandidates) 与非孤立转正契约 (enrollCandidate)
 *   6. 世界书单条目指纹手改防冲突 (hand-edited-conflict) 与细粒度 Oplog 可逆回滚
 */
const assert = require('assert');
require('./mock.js');
const fresh = require('./ui-gate-sync.js').fresh;

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  PASS: ' + name);
    passCount++;
  } catch (err) {
    console.error('  FAIL: ' + name);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== 开始 v2.232.0 防全知调度、多维情感与世界书可逆性集成门禁 ===');

test('TEST-1: 聚光灯因果调度 (强介入 Scene-Hit 与冲突避让 Busy Skip)', function () {
  const W = fresh().WA;
  W.store.init();
  W.store.transact(function (d) { d.spotlight = { rows: [], pending: [] }; });
  W.spotlight.setSettings({ enabled: true, idleThreshold: 3 });

  // 登记角色并连续推进，让 林安安 成为久缺角色
  W.spotlight.note('主角');
  W.spotlight.note('林安安');
  W.spotlight.seal(); // 第1轮：两者都在

  for (let i = 0; i < 4; i++) {
    W.spotlight.note('主角');
    W.spotlight.seal(); // 后续4轮只有主角在，林安安 missed=4 >= 3
  }

  const idleRes = W.spotlight.idle();
  assert.strictEqual(idleRes.ok, true);
  assert.strictEqual(idleRes.rows[0].who, '林安安');
  assert.strictEqual(idleRes.rows[0].missed >= 3, true);

  // 1. 冲突避让：若当前场景在打斗冲突中，避让强插人员
  const busyRes = W.spotlight.resolveIntervention({
    currentLocation: '边塞茶铺',
    busy: true,
    inScene: ['主角'],
    registeredScenes: { '林安安': ['边塞茶铺', '学堂'] }
  });
  assert.strictEqual(busyRes.ok, true);
  assert.strictEqual(busyRes.action, 'skip');
  assert.strictEqual(busyRes.reason, 'busy-scene');

  // 2. 强介入：非忙碌场景且地点命中生活圈
  const hitRes = W.spotlight.resolveIntervention({
    currentLocation: '边塞茶铺',
    busy: false,
    inScene: ['主角'],
    registeredScenes: { '林安安': ['边塞茶铺', '学堂'] }
  });
  assert.strictEqual(hitRes.ok, true);
  assert.strictEqual(hitRes.action, 'scene-hit-entry');
  assert.strictEqual(hitRes.target, '林安安');
  assert.strictEqual(hitRes.epistemicSafe, true);
});

test('TEST-2: 不在场痕迹轻提 (Presence-Trace) 与防全知穿帮硬拦截', function () {
  const W = fresh().WA;
  W.store.init();
  W.store.transact(function (d) { d.spotlight = { rows: [], pending: [] }; });
  W.spotlight.setSettings({ enabled: true, idleThreshold: 2 });

  W.spotlight.note('张三');
  W.spotlight.note('苏雅');
  W.spotlight.seal();

  for (let i = 0; i < 3; i++) {
    W.spotlight.note('张三');
    W.spotlight.seal();
  }

  // 1. 地点不匹配时，禁止瞬移出场，转为 presence-trace（熟人顺带提及）
  const traceRes = W.spotlight.resolveIntervention({
    currentLocation: '深山密室',
    busy: false,
    inScene: ['张三'],
    registeredScenes: { '苏雅': ['集市', '官道'] },
    relations: { '苏雅': ['张三'] }, // 张三认识苏雅
    registeredTraces: { '苏雅': { items: ['留在茶几上的绣帕'] } }
  });
  assert.strictEqual(traceRes.ok, true);
  assert.strictEqual(traceRes.action, 'presence-trace');
  assert.strictEqual(traceRes.target, '苏雅');
  assert.strictEqual(traceRes.allowedSpeakers.includes('张三'), true);
  assert.strictEqual(traceRes.epistemicSafe, true);

  // 2. 防全知硬拦截：若外部指定陌生人 李四 提及 苏雅，但两人全无交集，拒收
  const leakRes = W.spotlight.resolveIntervention({
    currentLocation: '深山密室',
    busy: false,
    inScene: ['李四'],
    mentioner: '李四',
    registeredScenes: { '苏雅': ['集市'] },
    relations: { '苏雅': ['张三'] } // 苏雅只认识张三，不认识李四
  });
  assert.strictEqual(leakRes.ok, false);
  assert.strictEqual(leakRes.reason, 'epistemic-leak-blocked');
  assert.strictEqual(leakRes.target, '苏雅');
  assert.strictEqual(leakRes.mentioner, '李四');
});

test('TEST-3: 多维情感力学 (E-P-R-I) 与段顶破门阶段锁 (Gate Freeze)', function () {
  const W = fresh().WA;
  W.store.init();
  W.fondness.setSettings({ enabled: true, staged: true });

  // 步进到无感段顶 19.9 (段范围 0..20, 段顶 19.9)
  // 白名单步进：24 * 0.8 = 19.2; + 0.5 = 19.7; + 0.1 = 19.8; + 0.1 = 19.9
  W.fondness.apply('夏凛', { trust: 60 }); // 自动建行，起始 0
  for (let i = 0; i < 24; i++) {
    W.fondness.apply('夏凛', { delta: 0.8 });
  }
  W.fondness.apply('夏凛', { delta: 0.5 });
  W.fondness.apply('夏凛', { delta: 0.1 });
  W.fondness.apply('夏凛', { delta: 0.1 });

  const r1 = W.fondness.read('夏凛');
  assert.strictEqual(r1.value, 19.9);
  assert.strictEqual(r1.band, '无感');

  // 更新多维情感坐标 (月相 EPRI)
  const aff1 = W.fondness.updateAffect('夏凛', {
    P: 45, // 肉体吸引
    I: 20, // 嫉妒轻微
    R: 0   // 当前阶段值
  });
  assert.strictEqual(aff1.ok, true);
  assert.strictEqual(aff1.P, 45);
  assert.strictEqual(aff1.I, 20);
  assert.strictEqual(aff1.gateLocked, true); // 停在段顶且未破门 => 锁住
  assert.strictEqual(aff1.freezeTension, 'resistance-vs-attraction'); // 心理防御拉扯态

  // 在未破门情况下继续步进，被段顶阻断 (band-cap)
  const blockedStep = W.fondness.apply('夏凛', { delta: 0.1 });
  assert.strictEqual(blockedStep.ok, false);
  assert.strictEqual(blockedStep.reason, 'band-cap');
});

test('TEST-4: 因果凭据破门解封 (UnlockGate) 与偏执重力驱动', function () {
  const W = fresh().WA;
  W.store.init();
  W.fondness.setSettings({ enabled: true, staged: true });

  W.fondness.apply('夏凛', { trust: 60 });
  for (let i = 0; i < 24; i++) W.fondness.apply('夏凛', { delta: 0.8 });
  W.fondness.apply('夏凛', { delta: 0.5 });
  W.fondness.apply('夏凛', { delta: 0.1 });
  W.fondness.apply('夏凛', { delta: 0.1 }); // 19.9 段顶

  // 1. 无因果凭据尝试破门 => 拒收 (missing-gate-proof)
  const emptyProof = W.fondness.unlockGate('夏凛', {});
  assert.strictEqual(emptyProof.ok, false);
  assert.strictEqual(emptyProof.reason, 'missing-gate-proof');

  // 2. 出具实质因果誓言凭据 => 破门成功
  const unlockRes = W.fondness.unlockGate('夏凛', {
    proof: '雪夜共渡难关的心意坦白',
    eventId: 'evt_snow_confession'
  });
  assert.strictEqual(unlockRes.ok, true);
  assert.strictEqual(unlockRes.gateUnlocked, true);
  assert.strictEqual(unlockRes.stage, '防御'); // 晋级到第二段

  // 破门后拉扯态消除，阶段晋阶
  const aff2 = W.fondness.readAffect('夏凛');
  assert.strictEqual(aff2.gateLocked, false);
  assert.strictEqual(aff2.freezeTension, '');
  assert.strictEqual(aff2.R, 1);

  // 3. 注入高偏执嫉妒值 => 激活偏执重力
  W.fondness.updateAffect('夏凛', { I: 75 });
  const aff3 = W.fondness.readAffect('夏凛');
  assert.strictEqual(aff3.invidiaActive, true);
  assert.strictEqual(aff3.antiOmniscienceRule.includes('私密心理状态'), true);
});

test('TEST-5: 正文衍生 NPC 探测 (DetectCandidates) 与非孤立转正契约', function () {
  const W = fresh().WA;
  W.store.init();

  // 预置在册锚定角色
  W.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_赵掌柜'] = { id: 'p_赵掌柜', name: '赵掌柜' };
    return true;
  });

  const narrativeText = `
夜雨正急，客栈大堂里冷冷清清。
那位店员端着一壶热茶走来，低声说道：「客官，外头风大，早些歇息吧。」
林中巡捕皱眉打量着四周，在门槛处停下了脚步。
`;

  // 1. 自动探测正文候选人
  const detRes = W.observe.detectCandidates(narrativeText);
  assert.strictEqual(detRes.ok, true);
  assert.strictEqual(detRes.candidates.length >= 2, true);
  const clerk = detRes.candidates.find(c => c.name === '店员');
  assert.strictEqual(!!clerk, true);
  assert.strictEqual(clerk.unnamed, true);

  // 2. 违背非孤立契约: rel_user 填陌生人 => 拒收 (bad-user-relation)
  const badRelRes = W.observe.enrollCandidate({
    name: '店员',
    rel_user: '陌生人',
    rel_anchor: '赵掌柜'
  });
  assert.strictEqual(badRelRes.ok, false);
  assert.strictEqual(badRelRes.reason, 'bad-user-relation');

  // 3. 违背非孤立契约: 缺失锚定在册角色 => 拒收 (anchor-not-found)
  const badAnchorRes = W.observe.enrollCandidate({
    name: '店员',
    rel_user: '常去歇脚的茶栈小厮',
    rel_anchor: '虚构的无名氏'
  });
  assert.strictEqual(badAnchorRes.ok, false);
  assert.strictEqual(badAnchorRes.reason, 'anchor-not-found');

  // 4. 合规转正纳管
  const enrollRes = W.observe.enrollCandidate({
    name: '店员',
    rel_user: '常去歇脚的茶栈小厮',
    rel_anchor: '赵掌柜',
    profile: { personality: ['机敏', '守本分'] },
    hooks: [{ signal: '客栈大堂', how: '提着铜壶续水' }]
  });
  assert.strictEqual(enrollRes.ok, true);
  assert.strictEqual(enrollRes.person, '店员');
  assert.strictEqual(enrollRes.epistemicSafe, true);

  const savedPerson = W.store.get().people['p_店员'];
  assert.strictEqual(savedPerson.rel_anchor, '赵掌柜');
  assert.strictEqual(savedPerson.epistemicBoundary.prohibitOmniscience, true);
});

test('TEST-6: 世界书单条目指纹冲突防护与细粒度 Oplog 回滚', function () {
  const W = fresh().WA;
  W.store.init();

  // 注入测试世界书条目缓存
  const testEntry = {
    id: 'entry_moon_rule',
    world: '主世界',
    title: '月影门规',
    content: '门人夜出，必挂铜铃。',
    keys: ['月影门']
  };
  W.worldbook.seedEntries([testEntry]);
  W.worldbook.rememberFingerprint(testEntry.id, testEntry.content);

  // 1. 模拟外部手工改动了条目内容，未同步指纹
  testEntry.content = '门人夜出，必挂银铃。（外部手改版本）';

  // 尝试在不传 force 的情况下安全覆盖 => 拒收 (hand-edited-conflict)
  const conflictRes = W.worldbook.safeUpdateEntry('entry_moon_rule', '引擎尝试静默覆盖的新内容');
  assert.strictEqual(conflictRes.ok, false);
  assert.strictEqual(conflictRes.reason, 'hand-edited-conflict');

  // 2. 显式传入 force: true => 覆盖成功并记录 Oplog
  const forceRes = W.worldbook.safeUpdateEntry('entry_moon_rule', '引擎核准的权威更新', { force: true });
  assert.strictEqual(forceRes.ok, true);
  assert.strictEqual(testEntry.content, '引擎核准的权威更新');
  assert.strictEqual(forceRes.oplogCount >= 1, true);

  // 3. 单步 Oplog 精准回滚
  const rollbackRes = W.worldbook.rollbackLastOp();
  assert.strictEqual(rollbackRes.ok, true);
  assert.strictEqual(rollbackRes.rolledBack, true);
  assert.strictEqual(testEntry.content, '门人夜出，必挂银铃。（外部手改版本）');
});

console.log('=== 全部集成门禁通过 (' + passCount + '/6 PASS) ===');