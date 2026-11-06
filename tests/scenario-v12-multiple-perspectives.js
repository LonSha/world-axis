'use strict';
/**
 * tests/scenario-v12-multiple-perspectives.js
 *
 * 《V12_MASTER_PLAN.md》世界级贯通场景 5：同一真相多种叙述
 * 链路：事件发生 → 不同见证者获得不同证据 → 报刊各自报道 → 玩家调查 → 纠错或持续误解 → 后续选择受认知而非全知影响。
 *
 * 铁律纪律：
 * 1. 拒绝独立演示脚本：全程通过统一调度总线 `actionDesk.plan()` 与标准写口流转；
 * 2. 状态真源闭环：
 *    - 客观事实登记在 `store.worldFacts`；
 *    - 见证者与旁观者的主观认知登记在 `epistemicView`，确信度与忠实度分歧；
 *    - 世界内出版物（`periodicals`）按各自编辑立场与有限公开事实刊印差异报道；
 *    - 玩家通过 `investigation` 深入现场调查，收集关键物证（`investigate` / `checkEvidence`）；
 *    - 凭确凿物证纠正误解（`epistemic.correct`），未受调查影响者仍受失真信念驱动行动（`epistemic.decideAction`）；
 *    - 场景因果回声（`sceneNarrative.traceCausalEchoes`）在当前情境真实投射历史事件与认知印记。
 */
const uiGate = require('./ui-gate-sync.js');

let pass = 0, fail = 0;
function a(desc, cond) {
  if (cond) {
    pass++;
    console.log('✓ PASS:', desc);
  } else {
    fail++;
    console.error('✗ FAIL:', desc);
  }
}

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'investigation', 'causal'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

async function runScenario() {
  console.log('=== 开始 V12 贯通场景 5：同一真相多种叙述 ===');
  const W = env();

  // 0. 准备初始世界与人物：工匠赵六、行商钱七、调查官孙八、失窃案现场东市库房
  W.store.transact(function (d) {
    d.clock = { round: 1, iso: '2026-11-06', label: '初秋清晨' };
    d.people = d.people || {};
    d.people['p_工匠赵六'] = { id: 'p_工匠赵六', name: '工匠赵六', place: 'east_market' };
    d.people['p_行商钱七'] = { id: 'p_行商钱七', name: '行商钱七', place: 'east_market' };
    d.people['p_调查官孙八'] = { id: 'p_调查官孙八', name: '调查官孙八', place: 'east_market' };
    return true;
  }, 'scenario5:init');

  // 1. 事件发生：先在 store.worldFacts 中登记客观事实真源
  W.store.transact(function (d) {
    d.worldFacts = d.worldFacts || [];
    d.worldFacts.push({
      id: 'wf_fire_truth',
      key: 'warehouse_real_cause',
      scope: 'public',
      storyDate: '2026-11-06',
      value: '现场仅外墙有雷击焦痕，内库铅封完整无损，精铁箱数账实相符'
    });
    return true;
  });

  // 1.1 客观事实通过 causal.addChain 基于已知事实起链
  const factRes = W.actionDesk.plan('causal.addChain', {
    spec: {
      cause: 'warehouse_real_cause',
      action: '扑灭火势并清点库房',
      immediate: '外檐过火留痕，库内铁料无损铅封完好'
    }
  });
  a('1.1 客观事实通过 causal.addChain 真实立案', factRes && factRes.ok);

  // 2. 不同见证者获得不同证据与主观版本
  // 行商钱七只看到烟火与闭门，听信传闻以为「赵六故意纵火骗保且私吞精铁」
  const beliefQian = W.actionDesk.plan('epistemic.registerBelief', {
    who: '行商钱七',
    topicId: 'topic_warehouse_incident',
    belief: {
      version: 'v_arson_fraud',
      summary: '赵六贪墨私吞库房精铁，放火焚库企图销毁账目',
      claimTruth: false,
      certainty: 'tentative',
      source: 'hearsay',
      faithful: false // 走样失真版本
    }
  });
  a('2.1 行商钱七获得失真版本（怀疑纵火侵吞）', beliefQian && beliefQian.ok);

  // 工匠赵六是当晚灭火者，掌握客观真相（雷击引燃，原料完好）
  const beliefZhao = W.actionDesk.plan('epistemic.registerBelief', {
    who: '工匠赵六',
    topicId: 'topic_warehouse_incident',
    belief: {
      version: 'v_lightning_truth',
      summary: '现场仅外墙有雷击焦痕，内库铅封完整无损，精铁箱数账实相符',
      claimTruth: true,
      certainty: 'certain',
      source: 'witnessed',
      faithful: true // 客观忠实
    }
  });
  a('2.2 工匠赵六掌握当事人真相（雷击天灾已灭）', beliefZhao && beliefZhao.ok);

  // 3. 报刊各自报道：不同报刊根据不同编辑立场发表截然不同的报道
  // 3.1 官方布告《市井公报》刊登谨慎报道
  const pubOfficial = W.actionDesk.plan('periodicals.publishDirect', {
    id: 'per_official_gazette',
    name: '市井公报',
    title: '市井公报·初秋特刊',
    slant: 'conservative_public',
    text: '昨日夜半东市起烟，火情已息，有关部门正对库房清点登记，市民切勿听信谣言。'
  });
  a('3.1 官方报刊刊登中立通告', pubOfficial && pubOfficial.ok);

  // 3.2 商业小报《商界秘闻》刊登耸人听闻的失真猜疑报道
  const pubSensational = W.actionDesk.plan('periodicals.publishDirect', {
    id: 'per_trade_rumor',
    name: '商界秘闻',
    title: '商界秘闻·号外',
    slant: 'sensational_distorted',
    text: '惊爆！东市大库精铁不翼而飞，管事纵火灭迹？市面铁料或面临断崖式断供！'
  });
  a('3.2 商业小报刊登耸动失真报道', pubSensational && pubSensational.ok);

  // 渲染期刊核验世界内出版物包含两种不同叙述
  const renderRes = W.actionDesk.plan('periodicals.render');
  a('3.3 报刊世界内渲染包含《市井公报》', renderRes.html.includes('市井公报'));
  a('3.4 报刊世界内渲染包含《商界秘闻》', renderRes.html.includes('商界秘闻'));

  // 4. 行动分歧：角色受自己的有限认知驱动做出不同选择（杜绝全知）
  const qianAction = W.actionDesk.plan('epistemic.decideAction', {
    who: '行商钱七',
    topicId: 'topic_warehouse_incident'
  });
  a('4.1 钱七听信失真信息，采取防范抵制行动（misguided_precaution）', qianAction && qianAction.chosenAction === 'misguided_precaution');

  const zhaoAction = W.actionDesk.plan('epistemic.decideAction', {
    who: '工匠赵六',
    topicId: 'topic_warehouse_incident'
  });
  a('4.2 赵六掌握真实事实，推导精准应对行动（targeted_response）', zhaoAction && zhaoAction.chosenAction === 'targeted_response');

  // 5. 玩家/调查官孙八介入调查
  // 5.1 登记调查线索：勘察现场焦痕与铁料铅封
  const clueRes = W.actionDesk.plan('investigation.register', {
    spec: {
      title: '勘验东市库房现场焦痕与内库门锁',
      subject: 'warehouse_real_cause',
      location: 'east_market',
      witness: '工匠赵六',
      cost: 1,
      costType: 'timeHours',
      sourceType: 'inspection'
    }
  });
  a('5.1 调查线索通过 actionDesk 登记成功', clueRes && clueRes.ok && clueRes.id);
  const clueId = clueRes.id;

  // 5.2 孙八前往现场调查并收集证据
  const invRes = W.actionDesk.plan('investigation.investigate', {
    clueId: clueId,
    person: '调查官孙八',
    options: {
      receiptId: 'rcpt_inspect_burn_mark_01',
      content: '现场仅外墙有雷击焦痕，内库铅封完整无损，精铁箱数账实相符'
    }
  });
  a('5.2 孙八调查现场并取得实物证据回执', invRes && invRes.ok && invRes.evidenceId);

  // 5.3 核验并对调查官揭示调查真相
  const chkRes = W.actionDesk.plan('investigation.checkEvidence', { clueId: clueId });
  a('5.3 调查线索通过证据核验', chkRes && chkRes.ok && chkRes.verdict === 'verified');

  const revRes = W.actionDesk.plan('investigation.reveal', { clueId: clueId, person: '调查官孙八' });
  a('5.4 调查结论正式向调查官孙八揭示', revRes && revRes.ok);

  // 6. 证据出示与纠错：孙八将铁证出示给行商钱七，纠正其信念
  const correctRes = W.actionDesk.plan('epistemic.correct', {
    who: '行商钱七',
    topicId: 'topic_warehouse_incident',
    evidence: {
      proofText: '现场仅外墙有雷击焦痕，内库铅封完整无损，精铁箱数账实相符',
      source: 'official_investigation',
      version: 'v_investigation_cleared'
    }
  });
  a('6.1 铁证出示成功，钱七的失真信念被纠偏为确凿真实', correctRes && correctRes.ok && correctRes.corrected);
  a('6.2 纠偏后如实保留历史误会记录，不静默擦除', correctRes.historicalActionsIntact === true);

  // 6.3 纠偏后钱七重新决策行动
  const qianNewAction = W.actionDesk.plan('epistemic.decideAction', {
    who: '行商钱七',
    topicId: 'topic_warehouse_incident'
  });
  a('6.3 获得纠正后，钱七转为精准应对合作行动（targeted_response）', qianNewAction && qianNewAction.chosenAction === 'targeted_response');

  // 7. 场景因果回声投影：历史沉淀在情境中可被追溯
  const echoesRes = W.actionDesk.plan('sceneNarrative.traceCausalEchoes', {
    place: 'east_market',
    viewer: '调查官孙八'
  });
  a('7.1 场景历史因果回声成功投射', echoesRes && Array.isArray(echoesRes));

  console.log(`\n=== 场景 5 验收完成: pass=${pass}, fail=${fail} ===`);
  if (fail > 0) process.exit(1);
}

runScenario().catch(function (e) {
  console.error('Scenario 5 uncaught error:', e);
  process.exit(1);
});
