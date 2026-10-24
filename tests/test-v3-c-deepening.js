'use strict';
/**
 * WorldAxis tests/test-v3-c-deepening.js
 * 
 * 验证大更新包 C (历史解释与时代路径) 深度机制闭环:
 *   1. EXV3-8: 跨节点有限连锁冲击链 (多节点延迟传播、容量衰减与边界约束)
 *   2. EXV3-8: 中继节点真实干预与隔离 (行政隔离阻断扩散、应急补给平抑损失、真实资金扣除)
 *   3. EXV3-7: 群体社会记忆立场对行动桌工单发包的真实硬排斥与证据澄清放行
 *   4. EXV3-9: 地方发展路径在同等突发故障下的韧性差异 (集中共享高风险 vs 分散手工高容灾)
 *   5. EXV3-9: 真实转型执行闭环 (沉没成本折旧注销、真实资财扣除、进入过渡期)
 *   6. OPV3-8: 场景历史回声综合消费连锁冲击与群体争议，并由私有视角严格过滤
 */

const assert = require("assert");
require("./mock.js");
const fresh = require("./ui-gate-sync.js").fresh;

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  PASS: " + name);
    passCount++;
  } catch (err) {
    console.error("  FAIL: " + name);
    console.error(err);
    process.exit(1);
  }
}

console.log("=== 开始大更新包 C 深度机制集成验证 (test-v3-c-deepening) ===");

test("C-DEEP-1: EXV3-8 跨节点连锁冲击链 (延迟传播、按跳衰减与到期兑现)", function () {
  const W = fresh().WA;
  W.store.init();
  W.store.transact(function (d) {
    d.aftermathImpact = { incidents: [], cascadingChains: [] };
    return true;
  });

  // 1. 触发源自边塞营地的三节点连锁冲击链
  const trigRes = W.aftermathImpact.triggerCascadingChain({
    sourceIncidentId: "inc_border_furnace_collapse",
    sourcePlaceId: "border_camp",
    shockType: "supply_break",
    severity: 0.8,
    maxHops: 3,
    attenuation: 0.6,
    nodes: [
      { placeId: "town_workshop", delayDays: 2, capacityBuffer: 0, impactType: "supply_break" },
      { placeId: "market_square", delayDays: 3, capacityBuffer: 5, impactType: "price_surge" }
    ]
  });

  assert.equal(trigRes.ok, true);
  assert.equal(trigRes.nodeCount, 2);
  const chain = trigRes.chain;
  assert.equal(chain.status, "active");
  assert.equal(chain.nodes[0].severity, 0.8);
  assert.equal(chain.nodes[0].status, "pending");
  assert.equal(chain.nodes[1].status, "queued");
  // 衰减: 0.8 * 0.6 = 0.48，扣除 capacityBuffer 缓冲 (0.15) => 0.33
  assert.ok(chain.nodes[1].severity < 0.48, "下游节点受衰减与缓冲影响严重度降低");

  // 2. 推进 1 天: 尚未达到倒计时，不提前兑现
  W.aftermathImpact.advanceCascadingChains(1);
  const chainsMid = W.aftermathImpact.listCascadingChains({ status: "active" });
  assert.equal(chainsMid[0].nodes[0].status, "pending");
  assert.equal(chainsMid[0].nodes[0].remainingDays, 1);

  // 3. 推进第 2 天: 到期兑现！第一跳冲击生效，并自动沿商路激活第二跳
  const advRes = W.aftermathImpact.advanceCascadingChains(1);
  assert.equal(advRes.realizedEvents.length, 1);
  assert.equal(advRes.realizedEvents[0].placeId, "town_workshop");
  const chainsEnd = W.aftermathImpact.listCascadingChains({ status: "active" });
  assert.equal(chainsEnd[0].nodes[0].status, "impact_realized");
  assert.equal(chainsEnd[0].nodes[1].status, "pending");
});

test("C-DEEP-2: EXV3-8 中继节点主动行政隔离与应急补给 (真实资财扣除与阻断扩散)", function () {
  const W = fresh().WA;
  W.store.init();
  W.store.transact(function (d) {
    d.aftermathImpact = { incidents: [], cascadingChains: [] };
    d.economy = { money: { funds: 100 } };
    return true;
  });

  // 1. 触发新冲击链
  const trigRes = W.aftermathImpact.triggerCascadingChain({
    sourceIncidentId: "inc_bridge_washout",
    sourcePlaceId: "river_ford",
    shockType: "logistics_cut",
    severity: 0.9,
    nodes: [
      { placeId: "town_workshop", delayDays: 2, impactType: "supply_break" },
      { placeId: "market_square", delayDays: 4, impactType: "price_surge" }
    ]
  });
  const chainId = trigRes.chain.id;

  // 2. 在中继节点 town_workshop 下达行政隔离 (containment)，支出公堂资金 25
  const intRes = W.aftermathImpact.interveneCascadingChain(chainId, 0, {
    action: "containment",
    actor: "town_governor",
    funds: 25
  });
  assert.equal(intRes.ok, true);
  assert.equal(intRes.action, "containment");
  assert.equal(intRes.fundsSpent, 25);
  assert.equal(W.store.get().economy.money.funds, 75, "真实扣除公堂 25 资金");

  // 3. 检查链路: 下游节点 market_square 必须被标记为 prevented，链路终止扩散
  const chains = W.aftermathImpact.listCascadingChains({ status: "contained" });
  assert.equal(chains.length, 1);
  assert.equal(chains[0].nodes[0].status, "contained");
  assert.equal(chains[0].nodes[1].status, "prevented");

  // 4. 推进时间，被隔离的链路不向下游释放冲击
  const advRes = W.aftermathImpact.advanceCascadingChains(5);
  assert.equal(advRes.realizedEvents.length, 0, "已隔离冲击绝不幽灵向下游蔓延");
});

test("C-DEEP-3: EXV3-7 群体社会争议对行动桌合作的硬排斥与澄清放行", function () {
  const W = fresh().WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });

  W.store.transact(function (d) {
    d.socialLegacy = { claims: [], groupMemories: {}, handovers: {} };
    d.people = d.people || {};
    d.people["p_鲁师傅"] = { id: "p_鲁师傅", name: "鲁师傅", location: "town_workshop" };
    d.people["p_公会会长"] = { id: "p_公会会长", name: "公会会长", location: "town_workshop" };
    return true;
  });

  // 1. 登记负面主张并传播至商户行会 (guild_merchants)
  const clm = W.socialLegacy.registerClaim("evt_forge_defect", {
    claimant: "商户代表",
    targetWho: "鲁师傅",
    stance: "misunderstanding",
    claimText: "鲁师傅交付的轴承出现裂痕，涉嫌偷工减料"
  });
  W.socialLegacy.spreadClaim(clm.claim.id, "guild_merchants");

  // 检查商户行会立场
  const stance = W.socialLegacy.groupMemoryStance("guild_merchants", "鲁师傅");
  assert.equal(stance.summaryStance, "suspicious");

  // 2. 鲁师傅尝试在行动桌向商会承揽工单: 无担保人被硬性拦截！
  const previewFail = W.actionDesk.plan("actionDesk.workbench", {
    mode: "preview",
    actionId: "production.open",
    who: "鲁师傅",
    clientGroup: "guild_merchants",
    place: "town_workshop"
  });
  assert.equal(previewFail.ok, false);
  assert.equal(previewFail.reason, "group-distrust-blocked");

  // 3. 附带合格担保人进行申报: 允许临时承接
  const previewGuarantor = W.actionDesk.plan("actionDesk.workbench", {
    mode: "preview",
    actionId: "production.open",
    who: "鲁师傅",
    clientGroup: "guild_merchants",
    place: "town_workshop",
    guarantor: "公会会长"
  });
  assert.equal(previewGuarantor.ok, true);

  // 4. 当事人向商会公开出示铁料质检回执执行澄清 (clarifyClaim)
  const clarRes = W.socialLegacy.clarifyClaim("evt_forge_defect", "鲁师傅", "生铁供货单杂质检验证书", "guild_merchants");
  assert.equal(clarRes.ok, true);
  assert.equal(clarRes.newStance, "clarified");

  // 澄清后商会疑虑消除，无需担保人直接放行
  const previewAfter = W.actionDesk.plan("actionDesk.workbench", {
    mode: "preview",
    actionId: "production.open",
    who: "鲁师傅",
    clientGroup: "guild_merchants",
    place: "town_workshop"
  });
  assert.equal(previewAfter.ok, true);
});

test("C-DEEP-4: EXV3-9 地方发展路径同等突发故障下的韧性差异表现", function () {
  const W = fresh().WA;
  W.store.init();

  // 1. 确立两地不同布局
  W.phaseTransition.declarePlaceLayout("central_town", "shared_service_center");
  W.phaseTransition.declarePlaceLayout("remote_village", "decentralized_workshop");

  // 2. 模拟同等强度突发故障: 集中动力机组毁损 (power_failure)
  const stressCentral = W.phaseTransition.simulateIncidentStress("central_town", "power_failure");
  assert.equal(stressCentral.ok, true);
  assert.equal(stressCentral.layoutType, "shared_service_center");
  assert.equal(stressCentral.downtimeRatio, 0.85, "共享中心发生集中动力故障时全域 85% 停工");
  assert.equal(stressCentral.resilienceLevel, "low_single_point_of_failure");

  const stressVillage = W.phaseTransition.simulateIncidentStress("remote_village", "power_failure");
  assert.equal(stressVillage.ok, true);
  assert.equal(stressVillage.layoutType, "decentralized_workshop");
  assert.equal(stressVillage.downtimeRatio, 0.15, "分散网络发生故障仅局部个别炉灶停顿");
  assert.equal(stressVillage.resilienceLevel, "high_fault_tolerant");
});

test("C-DEEP-5: EXV3-9 真实转型执行闭环 (沉没成本折旧注销与资金扣减)", function () {
  const W = fresh().WA;
  W.store.init();
  W.store.transact(function (d) {
    d.economy = { money: { funds: 200 } };
    return true;
  });

  // 1. 设立 shared_service_center 并累计投资 100
  W.phaseTransition.declarePlaceLayout("town_A", "shared_service_center");
  W.phaseTransition.investPath("town_A", { funds: 100, title: "公用高精车床" });
  assert.equal(W.store.get().economy.money.funds, 100);

  // 2. 执行转型为 decentralized_workshop: 需 30 资金，报废 40% 投资 (40 沉没成本)
  const transRes = W.phaseTransition.executeTransitionRoute("town_A", "decentralized_workshop", { by: "工会执事" });
  assert.equal(transRes.ok, true);
  assert.equal(transRes.newLayout, "decentralized_workshop");
  assert.equal(transRes.fundsSpent, 30);
  assert.equal(transRes.sunkCostDeducted, 40);

  // 3. 验证资金与投资账本已真实扣减
  const st = W.store.get();
  assert.equal(st.economy.money.funds, 70, "100 - 30 重组开销 = 70");
  const path = st.phaseTransition.paths["town_A"];
  assert.equal(path.layoutType, "decentralized_workshop");
  assert.equal(path.totalFundsInvested, 60, "100 - 40 沉没报废 = 60");
  assert.ok(path.transitionUntil > 0, "地点处于重组过渡期");
});

test("C-DEEP-6: OPV3-8 场景回声综合消费连锁冲击与群体争议，并严格视角过滤", function () {
  const W = fresh().WA;
  W.store.init();

  W.store.transact(function (d) {
    d.aftermathImpact = { incidents: [], cascadingChains: [] };
    d.socialLegacy = { claims: [], groupMemories: {}, handovers: {} };
    d.people = d.people || {};
    d.people["p_知情工匠"] = { id: "p_知情工匠", name: "知情工匠", location: "town_workshop" };
    d.people["p_盲目旅人"] = { id: "p_盲目旅人", name: "盲目旅人", location: "town_workshop" };
    return true;
  });

  // 1. 注入连锁冲击链与社会争议
  W.aftermathImpact.triggerCascadingChain({
    sourceIncidentId: "inc_quarry_cavein",
    sourcePlaceId: "quarry",
    shockType: "supply_break",
    nodes: [{ placeId: "town_workshop", delayDays: 1, impactType: "supply_break" }]
  });

  const clm = W.socialLegacy.registerClaim("evt_quarry_cavein", {
    claimant: "知情工匠",
    targetWho: "矿场监工",
    stance: "controversy",
    claimText: "矿场监工明知塌方隐患仍催促赶工"
  });

  // 2. 知情工匠视角反查场景因果回声: 查见冲击与争议
  const echoesParty = W.sceneNarrative.traceCausalEchoes("town_workshop", "知情工匠");
  assert.ok(echoesParty.length >= 2);
  const shockEcho = echoesParty.filter(function (e) { return e.kind === "cascading_shock"; })[0];
  const claimEcho = echoesParty.filter(function (e) { return e.kind === "social_claim"; })[0];
  assert.ok(shockEcho, "知情工匠感知到供应链连锁冲击");
  assert.ok(claimEcho, "知情工匠感知到当事人争议主张");

  // 3. 盲目旅人反查: 争议主张严格过滤，不透传他人私密争议
  const echoesStranger = W.sceneNarrative.traceCausalEchoes("town_workshop", "盲目旅人");
  const strangerClaims = echoesStranger.filter(function (e) { return e.kind === "social_claim"; });
  assert.equal(strangerClaims.length, 0, "局外人绝无全知视角窃听他人私密社会争议");
});

console.log("----------------------------------------------------");
console.log("C 包深度集成验证完成: " + passCount + "/6 项全部通过 ✓");
