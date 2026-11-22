'use strict';
/**
 * WorldAxis tests/test-v3-ab-integration.js
 * 
 * 验证：
 *   1. 大更新包 A 深化：跨区域多跳传播与衰减失真、公共工程工单与承载力延误、情境投影工程聚合；
 *   2. 大更新包 B 启动：局部知识决策、承诺与履约回路、设施受损行动硬约束、地方规约真实执行力。
 */
const assert = require("assert");
require("./mock.js");
const fresh = require("./ui-gate-sync.js").fresh;

function createTestEnv() {
  if (global.localStorage) global.localStorage.clear();
  const W = fresh().WA;
  W.store.init();
  if (W.recipe && typeof W.recipe.apply === "function") W.recipe.apply("scifi");
  if (W.actionDesk && typeof W.actionDesk.setSettings === "function") W.actionDesk.setSettings({ enabled: true });
  if (W.actionMethods && typeof W.actionMethods.setSettings === "function") W.actionMethods.setSettings({ enabled: true });
  if (W.coop && typeof W.coop.setSettings === "function") W.coop.setSettings({ enabled: true });
  if (W.rumor && typeof W.rumor.setSettings === "function") W.rumor.setSettings({ enabled: true });
  if (W.serviceNetwork && typeof W.serviceNetwork.setSettings === "function") W.serviceNetwork.setSettings({ enabled: true });
  if (W.customLax && typeof W.customLax.setSettings === "function") W.customLax.setSettings({ enabled: true });
  if (W.epistemicView && typeof W.epistemicView.setSettings === "function") W.epistemicView.setSettings({ enabled: true });

  const nowMs = 1700000000000;
  W.clock = W.clock || {};
  W.clock.now = function () { return nowMs; };
  W.clock.wallNow = function () { return nowMs; };

  W.store.transact(function (d) {
    d.people = d.people || {};
    ["工匠", "徒弟", "远行商", "老巡守", "外邦客"].forEach(function (name) {
      d.people["p_" + name] = {
        id: "p_" + name,
        name: name,
        location: "边塞营地",
        status: "idle",
        resources: { timber: 30, iron: 20 }
      };
    });
    d.people["p_远行商"].status = "traveling";
    d.region = d.region || {};
    d.region.currentPlace = "边塞营地";
    d.region.places = [
      { id: "边塞营地", name: "边塞营地" },
      { id: "内陆集镇", name: "内陆集镇" },
      { id: "荒原驿站", name: "荒原驿站" }
    ];
    d.coop = d.coop || { projects: {} };
    d.customLax = d.customLax || { rules: [], promises: [] };
    d.serviceNetwork = d.serviceNetwork || { facilities: [] };
    d.epistemicStore = d.epistemicStore || { beliefs: {} };
    return true;
  }, "seed:v3-ab");

  return W;
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("PASS " + name);
    passed++;
  } catch (err) {
    console.error("FAIL " + name, err);
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 一、大更新包 A 深化验证
// ──────────────────────────────────────────────────────────────────────────
test("A-1: 跨区域多跳传播随距离自然衰减失真，目标区域注意竞争与私密保护", function () {
  const W = createTestEnv();
  const events = [
    { id: "ev_border_skirmish", title: "边境微小冲突", urgency: 3, relevance: 4, place: "边塞营地" },
    { id: "ev_supply_delay", title: "粮草滞后两日", urgency: 2, relevance: 3, place: "边塞营地" },
    { id: "ev_secret_letter", title: "密探私函", urgency: 10, relevance: 10, isSecret: true, isPublic: false }
  ];
  // 跨越 3 跳到达内陆集镇
  const prop = W.rumor.propagateAcrossRegions("边塞营地", "内陆集镇", events, {
    hopCount: 3,
    decayPerHop: 0.3,
    targetCapacity: 1
  });
  assert.equal(prop.ok, true);
  assert.equal(prop.hopCount, 3);
  assert(prop.fidelity < 0.4, "三跳后精度应衰减至 0.4 以下");
  // 私密情报绝不外泄
  assert.equal(prop.excludedSecrets.length, 1);
  assert.equal(prop.excludedSecrets[0].id, "ev_secret_letter");
  // 目标区域注意竞争录取 1 项
  assert.equal(prop.admitted.length, 1);
  assert.equal(prop.delayed.length, 1);
  // 传闻走样
  assert.equal(prop.admitted[0].status, "distorted");
  assert(prop.admitted[0].title.indexOf("【传闻走样】") >= 0);
});

test("A-1 负向: 传播路线被物理封锁，跨区域传播当场中止零送达", function () {
  const W = createTestEnv();
  const events = [{ id: "ev_news", title: "关防紧急通告", urgency: 5 }];
  const prop = W.rumor.propagateAcrossRegions("边塞营地", "内陆集镇", events, {
    isRouteBlocked: true,
    blockedAt: "雪山关隘"
  });
  assert.equal(prop.ok, false);
  assert.equal(prop.reason, "route-blocked");
  assert.equal(prop.stoppedAt, "雪山关隘");
});

test("A-2: 具名公共项目转化为施工工单，并受水土承载力延迟与替代建议约束", function () {
  const W = createTestEnv();
  // 1. 发起并启动公共工程
  const pRes = W.coop.proposeProject({
    id: "prj_dam_repair",
    title: "加固拦河坝",
    region: "边塞营地",
    initiator: "工匠",
    requiredPledges: 100,
    materials: { timber: 20, stone: 40 }
  });
  W.coop.pledgeProject({ projectId: "prj_dam_repair", who: "工匠", amount: 60 });
  W.coop.pledgeProject({ projectId: "prj_dam_repair", who: "老巡守", amount: 40 });
  // 2. 转化为工单
  const linkRes = W.coop.linkToWorkorder("prj_dam_repair");
  assert.equal(linkRes.ok, true);
  assert.equal(linkRes.workorderId, "wo_prj_dam_repair");
  // 3. 模拟当地木材资源枯竭 (stock 20 / maxStock 100 -> ratio 0.2 -> depleted)
  const envCap = W.envCapacity || W.environmentalCapacity;
  envCap.declareResource({
    regionId: "边塞营地",
    resourceId: "res_forest_border",
    resourceType: "forest",
    stock: 20,
    maxStock: 100
  });
  // 4. 推进施工
  const adv = W.coop.advanceProjectWork("prj_dam_repair", 40, "工匠", { resourceType: "timber" });
  assert.equal(adv.ok, true);
  assert.equal(adv.progress, 40);
  assert.equal(adv.capacityDelayDays, 3, "木材枯竭导致施工工期追加 3 日滞后");
  assert(adv.capacityAdvice != null, "应给出替代材料与工艺建议");
});

test("A-3: 场景只读情境投影聚合在建公共工程，停工待援时报出缺席预警", function () {
  const W = createTestEnv();
  W.coop.proposeProject({
    id: "prj_beacon",
    title: "修缮烽火台",
    region: "边塞营地",
    initiator: "工匠",
    requiredPledges: 50
  });
  W.coop.pledgeProject({ projectId: "prj_beacon", who: "工匠", amount: 50 });
  // 发生缺席停工
  W.coop.handleAbsence({ projectId: "prj_beacon", missingPerson: "工匠", action: "suspend" });

  // 查看场景情境
  const sit = W.sceneNarrative.situation({ place: "边塞营地" });
  assert.equal(sit.ok, true);
  const found = sit.jointProjects.filter(function (p) { return p.id === "prj_beacon"; })[0];
  assert(found != null, "情境投影中必须包含修缮烽火台工程");
  assert.equal(found.status, "suspended");
  assert.equal(found.absenceAlert, "停工待援：存在缺席或争议");
  assert.equal(sit.idleStatus, "active", "有停工公共危机时不应误判为 nothing_to_do");
});

// ──────────────────────────────────────────────────────────────────────────
// 二、大更新包 B 启动验证
// ──────────────────────────────────────────────────────────────────────────
test("B-1: 角色按自身局部知识做决策，听信走样传闻引发偏差行动与精力代价", function () {
  const W = createTestEnv();
  // 登记徒弟听信了走样流言
  W.epistemicView.registerBelief("徒弟", "topic_raid", {
    version: "rumor_v1",
    summary: "传闻有大队流寇今夜袭营",
    claimTruth: true,
    certainty: "certain",
    source: "rumor",
    faithful: false // 客观并非事实
  });
  // 徒弟依据手头版本决策
  const dec1 = W.epistemicView.decideAction("徒弟", "topic_raid");
  assert.equal(dec1.ok, true);
  assert.equal(dec1.chosenAction, "misguided_precaution");
  assert.equal(dec1.faithful, false);
  assert(dec1.costIncurred.energy > 0, "偏差行动必须真实消耗精力代价");
  // 老巡守完全不知情
  const dec2 = W.epistemicView.decideAction("老巡守", "topic_raid");
  assert.equal(dec2.ok, true);
  assert.equal(dec2.chosenAction, "unaware_inaction");
  assert.equal(dec2.reason, "uninformed");

  // 出示确凿证据纠正徒弟认知
  const corr = W.epistemicView.correctBelief("徒弟", "topic_raid", {
    proofText: "哨骑回报方圆三十里绝无敌情",
    source: "scout_report"
  });
  assert.equal(corr.ok, true);
  assert.equal(corr.historicalActionsIntact, true, "纠正认知绝不静默抹去此前偏差行动的损失");
  // 纠正后再决策
  const dec3 = W.epistemicView.decideAction("徒弟", "topic_raid");
  assert.equal(dec3.chosenAction, "targeted_response");
  assert.equal(dec3.faithful, true);
});

test("B-2: 承诺履约回路：如期履行增进互惠，毁约产生信任污点与遗憾回声，补救留痕", function () {
  const W = createTestEnv();
  // 1. 承诺登记
  const cRes = W.customLax.commitPromise({
    promiser: "工匠",
    beneficiary: "外邦客",
    subject: "五日内交齐二十件铁器工具",
    dueDay: 5,
    stake: { collateral: 50 }
  });
  assert.equal(cRes.ok, true);
  const pId = cRes.promise.id;
  // 2. 违约结算
  const def = W.customLax.defaultPromise(pId, "原料短缺未如期交工");
  assert.equal(def.ok, true);
  assert.equal(def.status, "defaulted");
  assert.equal(def.trustPenalty, 25);
  // 3. 违约后无法虚假完成
  const fakeFulfill = W.customLax.fulfillPromise(pId);
  assert.equal(fakeFulfill.ok, false);
  assert.equal(fakeFulfill.reason, "already-defaulted");
  // 4. 显式补救并付出双倍代价
  const rem = W.customLax.remedyPromise(pId, {
    compensation: { money: 100, freeRepair: true },
    note: "双倍赔付货款并免费终身修缮"
  });
  assert.equal(rem.ok, true);
  assert.equal(rem.status, "remedied");
  assert.equal(rem.originalDefaultRetained, true, "补救和解绝不抹去历史违约事实");
});

test("B-3: 公共服务设施受损对行动施加硬约束，修复必须消耗真实物料工时", function () {
  const W = createTestEnv();
  // 1. 声明公共冶炼水车设施
  const dFac = W.serviceNetwork.declareFacility({
    id: "fac_forge_wheel",
    name: "公共冶炼水车",
    placeId: "边塞营地",
    serviceType: "crafting",
    capacity: 4
  });
  assert.equal(dFac.ok, true);
  W.serviceNetwork.activateFacility(dFac.facility.id);
  // 初始良好
  const chk1 = W.serviceNetwork.checkServiceImpact("边塞营地", "crafting");
  assert.equal(chk1.ok, true);
  assert.equal(chk1.status, "operational");
  assert.equal(chk1.delayDays, 0);
  // 2. 设施受损降级
  W.serviceNetwork.decayFacility(dFac.facility.id);
  const chk2 = W.serviceNetwork.checkServiceImpact("边塞营地", "crafting");
  assert.equal(chk2.ok, true);
  assert.equal(chk2.status, "degraded");
  assert.equal(chk2.efficiency, 0.5, "降级设施运转效率减半");
  assert.equal(chk2.delayDays, 2, "降级设施追加 2 日工期");
  // 工作台预览该加工任务，自动带出服务延迟
  const prev = W.actionDesk.plan("actionDesk.workbench", {
    mode: "preview",
    actionId: "task:investigation",
    who: "工匠",
    place: "边塞营地",
    serviceType: "crafting"
  });
  assert.equal(prev.ok, true);
  assert.equal(prev.serviceDelayDays, 2);
  // 3. 真实维修：缺料被拒
  const repFail = W.serviceNetwork.repairFacilityWithMaterials(dFac.facility.id, {
    worker: "工匠",
    materials: {}
  });
  assert.equal(repFail.ok, false);
  assert.equal(repFail.reason, "missing-materials");
  // 4. 投入真实材料修缮恢复
  const repOk = W.serviceNetwork.repairFacilityWithMaterials(dFac.facility.id, {
    worker: "工匠",
    materials: { timber: 5, iron: 10 }
  });
  assert.equal(repOk.ok, true);
  assert.equal(repOk.status, "operational");
  const chk3 = W.serviceNetwork.checkServiceImpact("边塞营地", "crafting");
  assert.equal(chk3.status, "operational");
  assert.equal(chk3.delayDays, 0);
});

test("B-4: 地方规约（工位限额与配给上限）硬性拦截违规申请，特批方可放行", function () {
  const W = createTestEnv();
  // 设立地方营地规约：每人每日限预约 1 个工位
  const rEn = W.customLax.declareLocalRule({
    id: "rule_one_slot_per_day",
    name: "营地工位均分条例",
    type: "slot-booking",
    orgId: "边塞营地",
    dailyLimit: 1
  });
  assert.equal(rEn.ok, true);
  // 角色首次申请：允许
  const chk1 = W.customLax.checkRuleEnforcement("边塞营地", "schedule:claim", "工匠", {
    alreadyBookedCount: 0
  });
  assert.equal(chk1.ok, true);
  assert.equal(chk1.permitted, true);

  // 角色超额申请（已占 1 个，还要占第 2 个）：被地方规约拦截
  const chk2 = W.customLax.checkRuleEnforcement("边塞营地", "schedule:claim", "工匠", {
    alreadyBookedCount: 1
  });
  assert.equal(chk2.ok, false);
  assert.equal(chk2.reason, "rule-violation");
  assert.equal(chk2.ruleId, "rule_one_slot_per_day");
  // 持有特批豁免权：放行
  const chk3 = W.customLax.checkRuleEnforcement("边塞营地", "schedule:claim", "工匠", {
    alreadyBookedCount: 1,
    isExempt: true
  });
  assert.equal(chk3.ok, true);
  assert.equal(chk3.permitted, true);
});

console.log("\n--- Summary: " + passed + " passed, " + failed + " failed ---");
if (failed > 0) {
  process.exit(1);
}
