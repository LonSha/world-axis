'use strict';
// WorldAxis tests/scenario-v13-ruin-relic-sandbox.js
// 验证 WorldAxis V13 世界级贯通场景 10：废墟遗物逆向突破（文明断代、技术复苏、调度心跳编排与反事实沙盘）
// 场景链路：
//   1. 远古遗物发掘登记（EXV13-9）：在黑水古工坊废墟遗迹中发掘《水云枢要残卷》（relic.discoverRelic）；
//   2. 逆向攻关与代价失败（EXV13-9）：林守真与学者攻关，首轮遭遇高压构件爆裂的“富有启发性失败”（insightful_failure），
//      消耗 50 钢材与精密卡尺，但获得关键水涡常数灵感（inspiration +45）；
//   3. 启发突破与技术传承复苏（EXV13-9）：次轮攻关携灵感一举突破（breakthrough），
//      完全复现失传古代水力核心（reconstructed: true），并在当代活技术谱系中确立新传统；
//   4. 中央调度心跳自驱编排（OPV13-9）：单次调用 actionDesk.orchestrate({ elapsedDays: 3 })，
//      自洽结算在途货运到货、逾期承诺违约、传闻衰减并产出统一事件日志；
//   5. 决策反事实沙盘深度推演与回溯对照（EXV13-8）：
//      在严格隔离的沙盘分支中推演“若当初屈辱献粮求和”（counterfactual.forkRehearsal / simulateBranch），
//      演进 30 天后产出主权丧失沦陷结局，与主线坚守突破固若金汤形成剧烈因果反差（diffOutcomes），主线毫无污染！

const a = require('assert');
const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'civilizationRelic', 'counterfactualSandbox', 'techLineage', 'customLax', 'freight'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function run() {
  const W = env();
  let assertions = 0;
  function ok(expr, msg) {
    assertions++;
    a.ok(expr, msg);
  }
  function eq(actual, expected, msg) {
    assertions++;
    a.strictEqual(actual, expected, msg);
  }

  console.log('=== WorldAxis V13 场景 10：废墟遗物逆向突破与反事实沙盘 ===');

  // 人物与地点
  const blacksmith = 'p_lin_heir';
  const scholar = 'p_su_scholar';
  const ruinSite = 'site_ancient_ruin';
  const workshopSite = 'site_divine_workshop';

  // 基础状态装配
  W.store.transact(function (draft) {
    draft.people = draft.people || {};
    draft.people[blacksmith] = {
      id: blacksmith,
      name: '林守真',
      role: 'artisan',
      skills: { craft: 4 },
      resources: { steel: 100, gold: 50 }
    };
    draft.people[scholar] = {
      id: scholar,
      name: '苏文渊',
      role: 'scholar',
      skills: { research: 5 }
    };
    draft.places = draft.places || {};
    draft.places[ruinSite] = { id: ruinSite, name: '黑水古工坊废墟遗迹' };
    draft.places[workshopSite] = { id: workshopSite, name: '城南神机试验工坊' };

    // 预置在途物流车队（需 2 天到达）
    draft.freight = {
      shipments: [
        {
          id: 'shipment_iron_ore_001',
          from: 'site_iron_mine',
          to: workshopSite,
          cargo: { iron_ore: 120 },
          status: 'in_transit',
          daysRemaining: 2
        }
      ]
    };

    // 预置到期契约承诺（2 天后到期）
    draft.customLax = draft.customLax || {};
    draft.customLax.promises = [
      {
        id: 'prm_tribute_001',
        promiser: 'p_traitor_merchant',
        promisee: blacksmith,
        status: 'active',
        remainingDays: 2
      }
    ];

    // 预置世间传闻
    draft.rumors = [
      { id: 'rm_ruin_ghost', text: '古矿废墟深夜有幽光浮动', intensity: 12 }
    ];

    return true;
  });

  // Step 1: 远古失落遗物发掘登记（EXV13-9）
  // 1.1 负控制：缺少遗物 ID 时拒收
  const negDiscover = W.actionDesk.plan('relic.discoverRelic', { name: '无名残片' });
  ok(!negDiscover.ok && negDiscover.reason === 'missing-relic-id', '负控制：缺少 relicId 拒绝登记');

  // 1.2 正式登记发掘《水云枢要残卷》
  const relicRes = W.actionDesk.plan('relic.discoverRelic', {
    relicId: 'relic_water_core',
    name: '水云枢要残卷',
    lostTechKey: 'ancient_hydraulic_core',
    condition: 'damaged_scroll',
    originSite: ruinSite,
    fragmentsCount: 3
  });
  ok(relicRes && relicRes.ok, '远古遗物发掘登记成功');
  eq(relicRes.relic.relicId, 'relic_water_core', '遗物 ID 登记为 relic_water_core');
  eq(relicRes.relic.condition, 'damaged_scroll', '初始状态为残卷');
  eq(relicRes.relic.reconstructed, false, '初始状态尚未复原');
  eq(relicRes.relic.inspiration, 0, '初始灵感为 0');

  // Step 2: 逆向工程攻关首轮 —— 遭遇富有启发性失败（EXV13-9 / OPV13-7）
  // 2.1 负控制：针对不存在的遗物逆向攻关被拒
  const negReverse = W.actionDesk.plan('relic.reverseEngineer', { relicId: 'relic_nonexistent' });
  ok(!negReverse.ok && negReverse.reason === 'relic-not-found', '负控制：不存在的遗物无法逆向研读');

  // 2.2 首轮试验：因水压过载发生炸损，付出代价失败（insightful_failure）但获得关键灵感
  const reverse1 = W.actionDesk.plan('relic.reverseEngineer', {
    relicId: 'relic_water_core',
    scholarId: scholar,
    labPlaceId: workshopSite,
    attempt: 1,
    resourceCost: { steel: 50, gold: 15 }
  });
  ok(reverse1 && reverse1.ok, '首轮逆向攻关响应成功');
  eq(reverse1.outcome, 'insightful_failure', '首轮评定为富有启发性失败（insightful_failure）');
  eq(reverse1.reconstructed, false, '首轮尚未完全复原');
  ok(reverse1.inspirationGain > 0, '首轮失败获得灵感增益');
  eq(reverse1.inspiration, 45, '灵感点累积至 45 点');
  eq(reverse1.toolDamaged, 'precision_caliper_bent', '非二元检定代价：折损精密卡尺');

  // 复核持久化状态
  const checkRelic1 = W.actionDesk.plan('relic.getRelic', { relicId: 'relic_water_core' });
  eq(checkRelic1.condition, 'partially_tested', '遗物状态流转为部分受试（partially_tested）');
  eq(checkRelic1.attemptsCount, 1, '攻关试验次数记录为 1');

  // Step 3: 次轮攻关携灵感突破 —— 成功复现失落水力核心（EXV13-9）
  const reverse2 = W.actionDesk.plan('relic.reverseEngineer', {
    relicId: 'relic_water_core',
    scholarId: scholar,
    labPlaceId: workshopSite,
    attempt: 2,
    resourceCost: { steel: 30, gold: 10 }
  });
  ok(reverse2 && reverse2.ok, '次轮逆向攻关响应成功');
  eq(reverse2.outcome, 'breakthrough', '次轮成功触发重大技术突破（breakthrough）！');
  eq(reverse2.reconstructed, true, '古代水力核心已被成功完全复原！');
  eq(reverse2.techUnlocked, 'ancient_hydraulic_core', '失传核心科技 ancient_hydraulic_core 正式解锁');
  eq(reverse2.traditionCreated, 'tradition_ancient_hydraulic_core', '当代活技术谱系成功注册新传承');

  // 检查活技术谱系中的注册情况
  if (W.techLineage && typeof W.techLineage.getTradition === 'function') {
    const trad = W.techLineage.getTradition('tradition_ancient_hydraulic_core');
    ok(trad !== null, '活技术谱系内成功收录复现之水力传统');
    eq(trad.name, '复现·水云枢要残卷', '传承名称与发掘遗物精准对齐');
  }

  // 3.2 负控制：对已复原遗物重复攻关返回 alreadyDone
  const reverseDone = W.actionDesk.plan('relic.reverseEngineer', { relicId: 'relic_water_core' });
  ok(reverseDone.ok && reverseDone.alreadyDone === true, '已复原遗物再次研读安全返回已完成');

  // Step 4: 中央场景行动桌全生命周期自动编排心跳（OPV13-9）
  // 推进心跳 3 天：在途货运到货、逾期承诺违约、传闻衰减
  const orchRes = W.actionDesk.plan('actionDesk.orchestrate', { elapsedDays: 3 });
  ok(orchRes && orchRes.ok, 'actionDesk.orchestrate 心跳编排执行成功');
  eq(orchRes.elapsedDays, 3, '心跳编排推进 3 日');
  ok(Array.isArray(orchRes.events) && orchRes.events.length >= 2, '编排聚合输出完整事件链');

  // 校验货运到货事件
  const freightEv = orchRes.events.find(function (e) { return e.type === 'freight_arrived'; });
  ok(freightEv != null, '在途货运车队历经 3 日自动送达入库');
  eq(freightEv.shipmentId, 'shipment_iron_ore_001', '到货货运单号核验一致');

  // 校验承诺逾期违约事件
  const promiseEv = orchRes.events.find(function (e) { return e.type === 'promise_expired'; });
  ok(promiseEv != null, '逾期未兑付承诺自动判定为违约失效');
  eq(promiseEv.promiseId, 'prm_tribute_001', '违约承诺单号核验一致');

  // 检查底层 store 状态已被自洽同步
  const sAfter = W.store.get();
  eq(sAfter.freight.shipments[0].status, 'arrived', '货运状态在 store 中变更为 arrived');
  eq(sAfter.customLax.promises[0].status, 'defaulted', '承诺状态在 store 中变更为 defaulted');
  eq(sAfter.rumors[0].intensity, 0, '传闻在历经 3 日后强度衰减至 0');

  // Step 5: 决策反事实沙盘深度推演与回溯对照（EXV13-8）
  // 5.1 负控制：沙盘分叉未提供明确反事实行动时硬拦截
  const negFork = W.actionDesk.plan('counterfactual.forkRehearsal', { baseTurn: 10, divergentDecision: {} });
  ok(!negFork.ok && negFork.reason === 'missing-divergent-action', '负控制：无分歧决策的沙盘分叉被拒');

  // 5.2 建立沙盘分支：“若当初向强敌屈辱献粮求和”
  const forkRes = W.actionDesk.plan('counterfactual.forkRehearsal', {
    baseTurn: 10,
    forkName: 'branch_appease_enemy',
    divergentDecision: {
      action: 'surrender_or_appease',
      actor: 'p_traitor_merchant',
      reason: '献纳全城粮饷以保一时苟安'
    }
  });
  ok(forkRes && forkRes.ok, '反事实沙盘分支成功建立');
  const branchId = forkRes.branchId;
  ok(branchId && branchId.indexOf('cf_branch_') === 0, '沙盘分支获得唯一隔离 ID');

  // 隔离性核验：沙盘内的初始快照不干扰主世界实体
  const sBeforeSim = W.store.get();
  eq(sBeforeSim.people[blacksmith].name, '林守真', '主世界林守真数据完好无损');

  // 5.3 在沙盘分支内向前推演 30 天
  // 负控制：对不存在的沙盘分支模拟被拒
  const negSim = W.actionDesk.plan('counterfactual.simulateBranch', { branchId: 'cf_branch_invalid', turns: 30 });
  ok(!negSim.ok && negSim.reason === 'branch-not-found', '负控制：不存在的沙盘分支无法推演');

  const simRes = W.actionDesk.plan('counterfactual.simulateBranch', {
    branchId: branchId,
    turns: 30
  });
  ok(simRes && simRes.ok, '沙盘分支向前模拟推演 30 天成功');
  eq(simRes.simulatedTurns, 30, '模拟天数记录为 30 天');
  eq(simRes.metrics.survivalState, 'subjugated', '献粮求和在 30 天后导致沦陷被奴役（subjugated）');
  eq(simRes.metrics.sovereignty, 20, '主权仅剩 20%');
  ok(simRes.metrics.economicLoss >= 5000, '巨额经济被洗劫 5000 金');

  // 5.4 终态因果差分比对（主线 vs 反事实沙盘）
  const diffRes = W.actionDesk.plan('counterfactual.diffOutcomes', { branchId: branchId });
  ok(diffRes && diffRes.ok, '主线与反事实沙盘因果差分比对报告生成成功');
  eq(diffRes.divergenceSignificance, 'critical_causal_branch', '因果分歧判定为重大关键历史分支');
  eq(diffRes.baseline.sovereignty, 100, '主线主权保持 100% 独立');
  eq(diffRes.counterfactual.sovereignty, 20, '反事实沙盘主权暴跌至 20%');
  eq(diffRes.diff.sovereigntyDelta, -80, '主权差异达 -80 点');
  ok(diffRes.diff.economicLossDelta > 4000, '反事实分支经济损失显著恶化 4000+ 金');
  ok(diffRes.conclusion.indexOf('沉痛代价') >= 0, '报告给出深刻因果结论反差');

  // 5.5 再次核验主世界状态毫无污染
  const sFinal = W.store.get();
  eq(sFinal.people[blacksmith].role, 'artisan', '主世界工匠角色依旧稳固');
  eq(sFinal.civilizationRelic.relics['relic_water_core'].reconstructed, true, '主世界遗物复原状态丝毫不受沙盘影响');

  // Step 6: 行动桌自检与动线拓扑核验
  const diag = W.actionDesk.diagnose();
  ok(diag && diag.ok, 'actionDesk 诊断正常');
  ok(diag.routes.indexOf('relic.discoverRelic') >= 0, '路由表收录 relic.discoverRelic');
  ok(diag.routes.indexOf('relic.reverseEngineer') >= 0, '路由表收录 relic.reverseEngineer');
  ok(diag.routes.indexOf('actionDesk.orchestrate') >= 0, '路由表收录 actionDesk.orchestrate');
  ok(diag.routes.indexOf('counterfactual.forkRehearsal') >= 0, '路由表收录 counterfactual.forkRehearsal');
  ok(diag.routes.indexOf('counterfactual.simulateBranch') >= 0, '路由表收录 counterfactual.simulateBranch');
  ok(diag.routes.indexOf('counterfactual.diffOutcomes') >= 0, '路由表收录 counterfactual.diffOutcomes');

  console.log('✓ scenario-v13-ruin-relic-sandbox: ' + assertions + ' 项断言全部通过（100% 绿灯）');
  return { ok: true, assertions: assertions };
}

if (require.main === module) {
  run();
}
module.exports = { run: run };
