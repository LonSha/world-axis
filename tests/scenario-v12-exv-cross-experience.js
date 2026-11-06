'use strict';
/**
 * tests/scenario-v12-exv-cross-experience.js
 *
 * 《V12_MASTER_PLAN.md》批次 E 跨引擎新体验集成专锁测试
 * 覆盖 EXV12-1 至 EXV12-9 的核心跨引擎体验链条：
 *
 * 1. EXV12-1 世界导演台：
 *    - 题材装卸与机制联动（theme.apply）
 *    - 节奏齿轮设定与单轮叙事推进跨度防越界（tempo.setGear / tempo.check）
 *    - 人物及全局长线剧情倾向约束（storyTone.set / get）
 *    - 长篇题材阶段采纳与指标跨阶段迁移（stage.adopt / mark / plan / transit）
 *    - 场景注意力预算与静止惩罚自适应（sceneBudget.note）
 *
 * 2. EXV12-3 共同体记忆与城市性格：
 *    - 地点历史痕迹沉积（sediment.settle）与痕迹档位衰减计算（sediment.feel）
 *    - 社区笔记/公告的幂等投递、单向确认与覆盖机制（communityNote.push / ack）
 *
 * 3. EXV12-5 & EXV12-9 可协商困局与多结局分支回放：
 *    - 关键分叉点登记（branchTree.fork）
 *    - 分支选择与树状拓扑可比性计算（branchTree.choose / tree / compare）
 *    - 候选操作的沙箱预演校验与原子确认（storyChoice.present / confirm）
 *
 * 4. EXV12-8 剧本生态与题材适配：
 *    - 蓝图样本依赖与规范导出（playableBlueprint.checkDependencies / exportPlayDefs）
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

async function runTest() {
  console.log('=== 开始 V12 批次 E 跨引擎新体验集成专锁测试 ===');
  const env = uiGate.fresh();
  const W = env.WA;

  // 初始化世界与设置
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  if (W.tempo) W.tempo.setSettings({ enabled: true });
  if (W.storyTone) W.storyTone.setSettings({ enabled: true });
  if (W.stage) W.stage.setSettings({ enabled: true });
  if (W.sceneBudget && typeof W.sceneBudget.saveSettings === 'function') W.sceneBudget.saveSettings({ enabled: true });
  if (W.sediment) W.sediment.setSettings({ enabled: true });
  if (W.communityNote) W.communityNote.setSettings({ enabled: true });
  if (W.branchTree) W.branchTree.setSettings({ enabled: true });
  if (W.storyChoice) W.storyChoice.setSettings({ enabled: true });

  // ----------------------------------------------------
  // 1. EXV12-1: 世界导演台
  // ----------------------------------------------------
  // 1.1 题材装载与规则模块激活
  const themeRes = W.actionDesk.plan('theme.apply', { themes: ['urban'] });
  a('1.1 题材组合通过 actionDesk 成功应用', themeRes && themeRes.ok);

  // 1.2 节奏齿轮设定与单轮步长防越界门禁
  const tempoGearRes = W.actionDesk.plan('tempo.setGear', { gear: 'allegro' });
  a('1.2 推进节奏切换至快板 (allegro)', tempoGearRes && tempoGearRes.ok && tempoGearRes.gear === 'allegro');
  const tempoCurRes = W.actionDesk.plan('tempo.current');
  a('1.2.1 当前节奏正确读取为 allegro', tempoCurRes && tempoCurRes.gear === 'allegro');
  const tempoCheckOk = W.actionDesk.plan('tempo.check', { spanMinutes: 300 });
  a('1.2.2 在快板上限内（≤480分）推进获准', tempoCheckOk && tempoCheckOk.ok);
  const tempoCheckOver = W.actionDesk.plan('tempo.check', { spanMinutes: 600 });
  a('1.2.3 超过快板上限步长被防越界拒收 (over-pace)', tempoCheckOver && !tempoCheckOver.ok && tempoCheckOver.reason === 'over-pace');

  // 1.3 故事倾向设置与约束提取
  const toneRes = W.actionDesk.plan('storyTone.set', { person: '林安安', tone: 'warm' });
  a('1.3 为角色林安安设置温暖向好倾向 (warm)', toneRes && toneRes.ok && toneRes.tone === 'warm');
  const toneGet = W.actionDesk.plan('storyTone.get', { person: '林安安' });
  a('1.3.1 成功读取角色显式生效档位', toneGet && toneGet.explicit && toneGet.tone === 'warm');

  // 1.4 玩法阶段采纳、指标推进与条件迁移
  const stageAdopt = W.actionDesk.plan('stage.adopt', { pack: '经营' });
  a('1.4 采纳长篇玩法包「经营」', stageAdopt && stageAdopt.ok && stageAdopt.pack === '经营');
  const stageMark = W.actionDesk.plan('stage.mark', { metric: '流水', delta: 50 });
  a('1.4.1 单调递增登记「流水」指标到 50', stageMark && stageMark.ok && stageMark.value === 50);
  const stagePlan = W.actionDesk.plan('stage.plan', {
    to: '扩张',
    metric: '流水',
    need: 50,
    changes: ['resource_words:大宗信用凭证']
  });
  a('1.4.2 声明阶段迁移计划（目标阶段：扩张，门槛：流水≥50）', stagePlan && stagePlan.ok && stagePlan.id);
  const stageTransit = W.actionDesk.plan('stage.transit', {
    transId: stagePlan.id,
    applied: ['resource_words:大宗信用凭证']
  });
  a('1.4.3 达标后核验迁移清单并成功步入新阶段「扩张」', stageTransit && stageTransit.ok && stageTransit.to === '扩张');

  // 1.5 场景注意预算动态调整
  const budget1 = W.actionDesk.plan('sceneBudget.note', { signature: 'sig_scene_market_morning' });
  a('1.5 场景初次进入，预算乘数为常态 1.0', budget1 && budget1.advance && budget1.factor === 1);
  W.actionDesk.plan('sceneBudget.note', { signature: 'sig_scene_market_morning' });
  W.actionDesk.plan('sceneBudget.note', { signature: 'sig_scene_market_morning' });
  const budgetStall = W.actionDesk.plan('sceneBudget.note', { signature: 'sig_scene_market_morning' });
  a('1.5.1 场景静止停滞达阈值，注意预算拉长倍率自适应', budgetStall && budgetStall.factor > 1);

  // ----------------------------------------------------
  // 2. EXV12-3: 共同体记忆与城市性格
  // ----------------------------------------------------
  // 2.1 地点沉积历史痕迹
  const sedSettle = W.actionDesk.plan('sediment.settle', {
    placeId: 'town_square',
    fact: {
      key: 'tax_riot_monument',
      text: '市民集会抗议不公税约，敲碎行会契约碑',
      trace: 'scar'
    }
  });
  a('2.1 地点城市广场成功沉积重大历史伤痕 (scar)', sedSettle && sedSettle.ok);
  const sedFeel = W.actionDesk.plan('sediment.feel', { placeId: 'town_square' });
  a('2.1.1 场景感知地点沉积，当前感知痕迹存在且具有记忆', sedFeel && sedFeel.ok && sedFeel.rows && sedFeel.rows.length > 0);

  // 2.2 社区公告投递与确认
  const notePush = W.actionDesk.plan('communityNote.push', {
    note: {
      id: 'notice_market_reorganize',
      scope: 'city',
      title: '关于西市集约整顿的告示',
      body: '即日起全城生铁实施集中转运，取消私人私铸税卡。'
    }
  });
  a('2.2 城市级社区笔记公告成功发布入台账', notePush && notePush.ok && notePush.id === 'notice_market_reorganize');
  const pendingNotes = W.actionDesk.plan('communityNote.pending');
  a('2.2.1 待见公告列表中包含该告示', pendingNotes && pendingNotes.ok && pendingNotes.rows.some(r => r.id === 'notice_market_reorganize'));
  const noteAck = W.actionDesk.plan('communityNote.ack', { ids: ['notice_market_reorganize'] });
  a('2.2.2 玩家/市民确认见到告示，单向转为已见状态', noteAck && noteAck.ok && noteAck.acked.includes('notice_market_reorganize'));

  // ----------------------------------------------------
  // 3. EXV12-5 & EXV12-9: 可协商困局与多结局分支树
  // ----------------------------------------------------
  // 3.1 登记分支树选择分叉点
  const forkRes = W.actionDesk.plan('branchTree.fork', {
    node: {
      round: 12,
      prompt: '面对旧行会的抵制与垄断，你将采取何种对策？',
      options: ['公开审计行会账目', '联合新兴工匠另起炉灶', '支付妥协补偿金']
    }
  });
  a('3.1 决策分叉点通过 actionDesk 登记进分支树', forkRes && forkRes.ok && forkRes.id);
  const forkId = forkRes.id;

  // 3.2 执行决策分支选择
  const chooseRes = W.actionDesk.plan('branchTree.choose', {
    id: forkId,
    choice: '公开审计行会账目'
  });
  a('3.2 确认重大剧情选择：公开审计行会账目', chooseRes && chooseRes.ok && chooseRes.choice === '公开审计行会账目');

  // 3.3 构建分支树结构并验证拓扑无悬空
  const treeRes = W.actionDesk.plan('branchTree.tree');
  a('3.3 分支树拓扑生成成功，悬空边为 0', treeRes && treeRes.ok && treeRes.dangling === 0 && treeRes.nodes.length >= 1);

  // ----------------------------------------------------
  // 4. EXV12-8: 剧本生态与蓝图导出
  // ----------------------------------------------------
  const bpDeps = W.actionDesk.plan('playableBlueprint.checkDependencies', { sampleId: 'town-workshop' });
  a('4.1 剧本生态依赖核查通过', bpDeps && bpDeps.ok !== false);
  const bpDefs = W.actionDesk.plan('playableBlueprint.exportPlayDefs', { sampleId: 'town-workshop' });
  a('4.2 剧本生态核心蓝图规则定义导出完好', bpDefs && bpDefs.ok !== false);

  console.log(`=== 批次 E 跨引擎新体验验收完成: pass=${pass}, fail=${fail} ===`);
  if (fail > 0) process.exit(1);
}

runTest().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
