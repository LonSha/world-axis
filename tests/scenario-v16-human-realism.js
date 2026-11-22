'use strict';
// WorldAxis tests/scenario-v16-human-realism.js
// 验证 WorldAxis V16 真实人物专版 场景 19：真实人物肉身生理极限、七情六欲爆发、记恨小账本与同人豁免矩阵
//
// 机制贯通矩阵：
//   1. 肉身生理极限逼仄与代谢消耗（humanRealism.consumeRoutine / setNeeds）：
//      - 角色在多轮交互中持续消耗温饱（nourishment）、精力（energy）、舒适如厕（comfort）
//      - 跌破极限时自然产生生理压迫微反应（唇焦口燥、两眼发黑、呵欠连连、坐立难安寻找茅舍）
//   2. 真实七情与情绪临界爆发（humanRealism.triggerOutburst）：
//      - 怒气或怨屈积累超过阈值（threshold >= 80）拒绝顺从
//      - 触发情绪断路器爆发反应（拍案而起冷声怒斥、拂袖而去、冷嘲热讽抗拒）
//   3. 心底芥蒂与恩怨清算账本（humanRealism.recordGrudge / settleGrudge）：
//      - 遭遇当众羞辱与背刺克扣后，心里狠记一笔小账本
//      - 在主生成中持续输出被动阻抗，直到获得实质道歉/补偿方可化解释怀
//   4. 同人与特殊角色豁免矩阵（Exemption Matrix）：
//      - 支持 divine（神明全豁免）、construct（仿生人免饥困）、ascetic（仙尊辟谷）等设定
//      - 豁免角色在生理结算与恩怨机制中直接 bypass，精准还原同人特异人设
//   5. 大模型主生成注入管线汇流（injectCollector.buildBlock）：
//      - 提取【肉身实感】与【心底芥蒂】结构化 Prompt 注入层
//   6. 破坏性真负控制门禁：
//      - 缺省角色名拒收（missing-actor-name）
//      - 缺省记恨目标或缘由拒收（missing-target / missing-grudge-reason）
//      - 怒气未达阈值拒绝误触发情绪爆发（below-threshold）
//      - 恩怨结算无实质化解凭据拒绝白开脱（missing-resolution）
//      - 针对不存在的记恨记录结算阻断（grudge-not-found）
const assert = require('assert');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'humanRealism', 'offstageLife', 'eccentricThreads', 'injectCollector', 'life'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runHumanRealism(a) {
  const W = env();

  // ── 环节 1：凡俗角色肉身生理需求与代谢逼仄 ──
  // 登记一名普通小店掌柜
  const rSet = W.humanRealism.setNeeds('药铺小掌柜', {
    genre: 'ancient',
    needs: {
      nourishment: 40,
      energy: 35,
      comfort: 25,
      vitality: 90
    }
  });
  a.ok(rSet.ok, '角色肉身生理档案初始化成功');
  a.strictEqual(rSet.actor.name, '药铺小掌柜', '角色名正确');
  a.strictEqual(rSet.actor.needs.nourishment, 40, '温饱初始40');

  // 经历 2 轮忙碌奔波，无水无食，生理逼仄持续加剧
  const rCons = W.humanRealism.consumeRoutine('药铺小掌柜', {
    rounds: 2,
    foodAvailable: false,
    rested: false
  });
  a.ok(rCons.ok, '生理代谢流转成功');
  a.ok(rCons.currentNeeds.nourishment < 20, '未进食温饱跌入重度饥渴');
  a.ok(rCons.currentNeeds.energy < 20, '未歇息精力见底');
  a.ok(rCons.strainSymptoms.length >= 2, '产生生理逼仄压迫症状');
  a.ok(rCons.strainSymptoms.some(function (s) { return s.indexOf('两眼发黑') >= 0 || s.indexOf('腹中') >= 0; }), '感知到饥肠辘辘两眼发黑');

  // ── 环节 2：心底芥蒂与记恨小账本（当众受辱） ──
  // 恶霸当众打翻药铺药材并言语辱骂
  const rGrudge = W.humanRealism.recordGrudge({
    who: '药铺小掌柜',
    target: '城东横霸',
    kind: 'humiliation',
    intensity: 85,
    reason: '当众踢翻晒药篾席并辱骂其为下等贱骨头'
  });
  a.ok(rGrudge.ok, '记恨小账本登记成功');
  a.strictEqual(rGrudge.grudge.target, '城东横霸', '记恨目标无误');
  a.strictEqual(rGrudge.grudge.intensity, 85, '烈度评定无误');

  const actorAfterGrudge = W.humanRealism.getActor('药铺小掌柜');
  a.ok(actorAfterGrudge.emotions.resentment >= 50, '心底怨恨显著攀升');
  a.ok(actorAfterGrudge.emotions.anger >= 40, '怒气累积');

  // ── 环节 3：情绪断路器临界爆发（Outburst Breaker） ──
  // 恶霸继续刁难，要求小掌柜立刻磕头谢罪，掌柜情绪逼近极限爆发
  W.humanRealism.setNeeds('药铺小掌柜', {
    emotions: { anger: 92, resentment: 90 }
  });
  const rBurst = W.humanRealism.triggerOutburst('药铺小掌柜', {
    action: '双目赤红，猛地将捣药杵摔在地上，咬牙厉声怒喝抗拒到底'
  });
  a.ok(rBurst.ok, '情绪断路器爆发成功触发');
  a.ok(rBurst.outburstAction.indexOf('捣药杵') >= 0, '爆发行为真实记录');

  // ── 环节 4：同人与特殊角色设定豁免矩阵（Exemption Matrix） ──
  // 登记一名同人神明角色（神明全豁免：免饥、免困、免凡俗伤病）
  const rDivine = W.humanRealism.setExemption('天穹主神', {
    preset: 'divine'
  });
  a.ok(rDivine.ok, '同人神明角色豁免配置成功');

  // 尝试对其消耗生理
  const rDivineCons = W.humanRealism.consumeRoutine('天穹主神', {
    rounds: 5,
    foodAvailable: false,
    rested: false
  });
  a.ok(rDivineCons.ok, '流转执行未阻断');
  const divineActor = W.humanRealism.getActor('天穹主神');
  a.strictEqual(divineActor.needs.nourishment, 80, '神明豁免温饱不跌');
  a.strictEqual(divineActor.needs.energy, 85, '神明豁免精力不衰减');
  a.strictEqual(rDivineCons.strainSymptoms.length, 0, '神明不产生凡俗生理压迫症状');

  // 登记一名仿生人/构装体角色（豁免饥渴与情绪失控，但保留能源）
  W.humanRealism.setExemption('守卫傀儡07', {
    preset: 'construct'
  });
  const rConstructBurst = W.humanRealism.triggerOutburst('守卫傀儡07', { force: false });
  a.strictEqual(rConstructBurst.ok, false, '机械构装体豁免情绪失控爆发');
  a.strictEqual(rConstructBurst.reason, 'exempted-from-outburst', '拒绝原因为 exempted-from-outburst');

  // ── 环节 5：恩怨真诚化解与释怀 ──
  const resentmentBeforeSettle = W.humanRealism.getActor('药铺小掌柜').emotions.resentment;
  // 恶霸遭报应后带着赔礼真诚下跪谢罪并照价赔偿三倍药资
  const rSettle = W.humanRealism.settleGrudge(rGrudge.grudge.id, {
    resolution: '恶霸折断佩刀，赔偿白银三十两并当街奉茶向掌柜鞠躬认错',
    evidence: '场景已确认赔偿交割，掌柜明确表示愿意原谅',
    response: 'forgive'
  });
  a.ok(rSettle.ok, '恩怨得到实质性化解');
  a.strictEqual(rSettle.grudge.settled, true, '记恨账本标记已平息');
  const actorSettled = W.humanRealism.getActor('药铺小掌柜');
  a.ok(actorSettled.emotions.resentment < resentmentBeforeSettle, '心底怨气显著消解');

  // ── 环节 6：ActionDesk 统一调度面与主生成 Prompt 汇流穿透 ──
  const deskSet = W.actionDesk.plan('realism.setNeeds', {
    who: '落魄剑客',
    needs: { nourishment: 10, energy: 15 },
    emotions: { resentment: 60 }
  });
  a.ok(deskSet.ok, 'ActionDesk realism.setNeeds 端点调用成功');

  const deskGrd = W.actionDesk.plan('realism.recordGrudge', {
    who: '落魄剑客',
    target: '背叛者师兄',
    kind: 'breach_trust',
    intensity: 95,
    reason: '暗中在剑鞘涂毒并在围攻中先行弃阵逃跑'
  });
  a.ok(deskGrd.ok, 'ActionDesk realism.recordGrudge 端点调用成功');

  const promptBlock = W.injectCollector.buildBlock({
    people: ['落魄剑客'],
    place: '破庙'
  });
  a.ok(typeof promptBlock === 'string' && promptBlock.length > 0, 'Prompt 注入管线成功返回文本');
  a.ok(promptBlock.indexOf('落魄剑客') >= 0, '主生成注入块中包含角色名');
  a.ok(promptBlock.indexOf('肉身实感') >= 0, '主生成注入块包含肉身生理实感');
  a.ok(promptBlock.indexOf('心底芥蒂') >= 0, '主生成注入块包含心底芥蒂账本');
  a.ok(promptBlock.indexOf('背叛者师兄') >= 0, '主生成注入块穿透包含记恨目标与缘由');

  // ── 环节 7：5 项破坏性真负控制门禁 ──
  // 负控制 1：缺省角色名拒绝更新生理
  const negNeeds = W.humanRealism.setNeeds('', { needs: { nourishment: 50 } });
  a.strictEqual(negNeeds.ok, false, '负控制 1：空角色名拒收');
  a.strictEqual(negNeeds.reason, 'missing-actor-name', '拒绝原因为 missing-actor-name');

  // 负控制 2：缺省记恨目标拒绝记账
  const negGrudgeTarget = W.humanRealism.recordGrudge({
    who: '落魄剑客',
    target: '',
    reason: '无名之仇'
  });
  a.strictEqual(negGrudgeTarget.ok, false, '负控制 2：空记恨目标拒收');
  a.strictEqual(negGrudgeTarget.reason, 'missing-target', '拒绝原因为 missing-target');

  // 负控制 3：缺省记恨缘由拒绝记账
  const negGrudgeReason = W.humanRealism.recordGrudge({
    who: '落魄剑客',
    target: '某个恶霸',
    reason: ''
  });
  a.strictEqual(negGrudgeReason.ok, false, '负控制 3：空记恨缘由拒收');
  a.strictEqual(negGrudgeReason.reason, 'missing-grudge-reason', '拒绝原因为 missing-grudge-reason');

  // 负控制 4：怒气与怨恨未达阈值拒绝误触发情绪爆发
  W.humanRealism.setNeeds('温和学徒', { emotions: { anger: 20, resentment: 15 } });
  const negBurst = W.humanRealism.triggerOutburst('温和学徒', { force: false });
  a.strictEqual(negBurst.ok, false, '负控制 4：怒气未达阈值拒绝爆发');
  a.strictEqual(negBurst.reason, 'below-threshold', '拒绝原因为 below-threshold');

  // 负控制 5：化解恩怨无具体实质凭据拒收
  const negSettleNoReason = W.humanRealism.settleGrudge('some_random_id', { resolution: '' });
  a.strictEqual(negSettleNoReason.ok, false, '负控制 5：无依据化解拒收');
  a.strictEqual(negSettleNoReason.reason, 'missing-resolution', '拒绝原因为 missing-resolution');
}

function run() {
  const a = assert;
  console.log('[Scenario 19] 开始执行真实人物肉身生理、七情六欲、记恨账本与同人豁免专锁测试...');
  runHumanRealism(a);
  console.log('场景 19 专锁全部断言通过（含 5 项真负控制门禁）：PASS');
}

run();