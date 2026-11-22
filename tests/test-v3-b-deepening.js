'use strict';
/**
 * WorldAxis tests/test-v3-b-deepening.js
 * 
 * 验证 V3 大更新包 B 深度推进：
 *   1. EXV3-2 深度服务网络：跨节点覆盖分流 (failover)、关卡路引查验与封锁阻断；
 *   2. OPV3-7 生产施工事故：带病强令开工、责任判定、物资损毁、人员伤亡与代偿和解；
 *   3. EXV3-5 地方规约惩戒与废止：违规禁令期硬约束、规约撤销留痕；
 *   4. OPV3-8 场景历史因果回声：事故/违约/修缮回声，非全知视角过滤绝不透传。
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
    ["工匠", "徒弟", "督工", "老巡守", "外邦客"].forEach(function (name) {
      d.people["p_" + name] = {
        id: "p_" + name,
        name: name,
        location: "边塞营地",
        status: "idle",
        energy: 100,
        resources: { timber: 50, iron: 50, money: 200 },
        permits: name === "工匠" ? ["pass_border"] : []
      };
    });
    d.region = d.region || {};
    d.region.currentPlace = "边塞营地";
    d.region.places = [
      { id: "边塞营地", name: "边塞营地" },
      { id: "内陆集镇", name: "内陆集镇" },
      { id: "荒原驿站", name: "荒原驿站" }
    ];
    d.serviceNetwork = d.serviceNetwork || { facilities: [], checkpoints: [] };
    d.aftermathImpact = d.aftermathImpact || { incidents: [], redressLog: [] };
    d.customLax = d.customLax || { rules: [], promises: [], penalties: [] };
    d.epistemicStore = d.epistemicStore || { beliefs: {} };
    return true;
  }, "seed:v3-b-deep");

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
test("B-DEEP-1: 跨节点公共服务网络自动探测覆盖分流与转运成本追加 (EXV3-2)", function () {
  const W = createTestEnv();
  // 在「内陆集镇」声明一处高容量公共冶炼工坊，其覆盖范围包含「边塞营地」
  const fac = W.serviceNetwork.declareFacility({
    id: "fac_inland_smelter",
    name: "内陆公办水力大高炉",
    placeId: "内陆集镇",
    serviceType: "crafting",
    capacity: 10,
    coverage: ["内陆集镇", "边塞营地"]
  });
  assert.equal(fac.ok, true);
  W.serviceNetwork.activateFacility(fac.facility.id);

  // 在「边塞营地」本地并未配置设施，自动探测并分流至「内陆集镇」
  const impact = W.serviceNetwork.checkServiceImpact("边塞营地", "crafting");
  assert.equal(impact.ok, true);
  assert.equal(impact.status, "failover");
  assert.equal(impact.failover, true);
  assert.equal(impact.failoverPlace, "内陆集镇");
  assert.equal(impact.delayDays, 1, "跨节点分流追加 1 日运输周转滞后");
  assert.equal(impact.transportCost, 5, "产生 5 点物流费用");

  // 工作台预览该任务，自动带出跨节点分流信息
  const prev = W.actionDesk.plan("actionDesk.workbench", {
    mode: "preview",
    actionId: "task:investigation",
    who: "工匠",
    place: "边塞营地",
    serviceType: "crafting"
  });
  assert.equal(prev.ok, true);
  assert.equal(prev.serviceDelayDays, 1);
  assert.equal(prev.failover.failoverPlace, "内陆集镇");
});

test("B-DEEP-2: 关卡通行检核：路引查验、缺少拦截与合规放行 (EXV3-2)", function () {
  const W = createTestEnv();
  // 设立边塞关隘检查站，要求持有 pass_border 路引
  const cpRes = W.serviceNetwork.declareCheckpoint({
    id: "cp_border_pass",
    name: "雪山关隘检查站",
    fromPlace: "边塞营地",
    toPlace: "内陆集镇",
    controlType: "permit-required",
    requiredPermit: "pass_border"
  });
  assert.equal(cpRes.ok, true);

  // 1. 徒弟无路引，申请前往内陆集镇，被硬性拦截
  const chk1 = W.serviceNetwork.checkPassage("边塞营地", "内陆集镇", "徒弟");
  assert.equal(chk1.ok, false);
  assert.equal(chk1.permitted, false);
  assert.equal(chk1.reason, "permit-missing");
  assert.equal(chk1.requiredPermit, "pass_border");

  // 工作台预览跨地移动被拦截
  const prev1 = W.actionDesk.plan("actionDesk.workbench", {
    mode: "preview",
    actionId: "travel:move",
    who: "徒弟",
    fromPlace: "边塞营地",
    toPlace: "内陆集镇"
  });
  assert.equal(prev1.ok, false);
  assert.equal(prev1.reason, "permit-missing");

  // 2. 工匠持有 pass_border 路引，放行通过
  const chk2 = W.serviceNetwork.checkPassage("边塞营地", "内陆集镇", "工匠");
  assert.equal(chk2.ok, true);
  assert.equal(chk2.permitted, true);
});

test("B-DEEP-3: 关卡道路物理封锁阻断，即便持证亦无法通行 (EXV3-2)", function () {
  const W = createTestEnv();
  // 关隘发生雪崩封路
  W.serviceNetwork.declareCheckpoint({
    id: "cp_border_pass",
    name: "雪山关隘检查站",
    fromPlace: "边塞营地",
    toPlace: "内陆集镇",
    controlType: "permit-required",
    requiredPermit: "pass_border",
    isBlocked: true,
    blockReason: "山体滑坡雪崩，栈道全断"
  });

  // 工匠即使持有路引也被物理阻断
  const chk = W.serviceNetwork.checkPassage("边塞营地", "内陆集镇", "工匠");
  assert.equal(chk.ok, false);
  assert.equal(chk.reason, "checkpoint-blocked");
  assert(chk.note.indexOf("栈道全断") >= 0);

  // 联动 aftermathImpact 寻找绕路方案
  const detour = W.aftermathImpact.findDetour("边塞营地", "内陆集镇", "雪山关隘");
  assert.equal(detour.ok, true);
  assert.equal(detour.originalRouteBlocked, true);
  assert(detour.detour.totalDays > 2, "迂回绕道耗时必须增加");
});

test("B-DEEP-4: 生产安全责任事故：带病违章强令开工、损毁物料、工伤与责任认定 (OPV3-7)", function () {
  const W = createTestEnv();
  // 声明本地工坊
  const fRes = W.serviceNetwork.declareFacility({
    id: "fac_border_forge",
    name: "边塞铁匠铺",
    placeId: "边塞营地",
    serviceType: "crafting",
    capacity: 2
  });
  W.serviceNetwork.activateFacility(fRes.facility.id);
  W.serviceNetwork.decayFacility(fRes.facility.id); // 降级带病

  // 督工无视设施降级，强令徒弟全负荷开工，触发严重事故
  const inc = W.aftermathImpact.triggerIncident({
    placeId: "边塞营地",
    facilityId: fRes.facility.id,
    incidentType: "forge_burst",
    operator: "徒弟",
    supervisor: "督工",
    forcedUnderDegraded: true,
    injuredPerson: "徒弟",
    materials: { iron: 15, timber: 10 },
    note: "督工强令严重磨损的水力风箱超负荷作业，导致轴承崩断风口炸裂"
  });

  assert.equal(inc.ok, true);
  assert.equal(inc.facilityState, "inoperable");
  assert.equal(inc.faultParty, "督工", "强令带病开工者负全责");
  assert.equal(inc.faultDegree, "reckless_command");
  assert.equal(inc.injuredPerson, "徒弟");

  // 设施转入彻底瘫痪，无法再提供服务
  const chk = W.serviceNetwork.checkServiceImpact("边塞营地", "crafting");
  assert.equal(chk.available, false);
  assert.equal(chk.reason, "facility-out-of-service");

  // 徒弟受到工伤，精力被削减
  const st = W.store.get();
  assert.equal(st.people.p_徒弟.status, "injured");
  assert(st.people.p_徒弟.energy < 100);
});

test("B-DEEP-5: 生产责任事故代偿结案：责任人私囊赔付，和解但历史留痕 (OPV3-7)", function () {
  const W = createTestEnv();
  const inc = W.aftermathImpact.triggerIncident({
    id: "inc_case_001",
    placeId: "边塞营地",
    operator: "工匠",
    supervisor: "督工",
    forcedUnderDegraded: true,
    injuredPerson: "徒弟",
    materials: { iron: 10 }
  });

  // 督工以私有物资进行代偿和解
  const red = W.aftermathImpact.settleRedress("inc_case_001", {
    payer: "督工",
    compensation: { money: 80, timber: 20 },
    note: "督工全额承担医药费与损毁木料赔偿"
  });

  assert.equal(red.ok, true);
  assert.equal(red.status, "redressed");
  assert.equal(red.payer, "督工");
  assert.equal(red.originalFaultRetained, true, "赔偿结案不抹去历史责任案卷");

  // 督工的私有资产被真实扣除
  const st = W.store.get();
  assert.equal(st.people.p_督工.resources.money, 120); // 200 - 80
  assert.equal(st.people.p_督工.resources.timber, 30); // 50 - 20

  // 禁止重复虚假和解
  const reRed = W.aftermathImpact.settleRedress("inc_case_001", {
    compensation: { money: 10 }
  });
  assert.equal(reRed.ok, false);
  assert.equal(reRed.reason, "already-redressed");
});

test("B-DEEP-6: 地方规约惩戒禁令期对角色行动施加硬性排斥 (EXV3-5)", function () {
  const W = createTestEnv();
  W.customLax.declareLocalRule({
    id: "rule_ration_quota",
    name: "边塞物资配给条例",
    type: "slot-booking",
    orgId: "边塞营地"
  });

  // 督工因涉案违章，被公所下达暂停预约权限 3 天的惩戒
  const pen = W.customLax.enforcePenalty("rule_ration_quota", "督工", "suspend-privilege", {
    orgId: "边塞营地",
    days: 3,
    fine: 20,
    reason: "因严重违章生产事故暂停营地一切业务特权"
  });
  assert.equal(pen.ok, true);

  // 禁令期内督工尝试申请预约，被硬性拦截
  const chk1 = W.customLax.checkRuleEnforcement("边塞营地", "schedule:claim", "督工");
  assert.equal(chk1.ok, false);
  assert.equal(chk1.reason, "privilege-suspended");
  assert.equal(chk1.violator, "督工");

  // 未受罚的工匠正常申请，放行
  const chk2 = W.customLax.checkRuleEnforcement("边塞营地", "schedule:claim", "工匠");
  assert.equal(chk2.ok, true);
});

test("B-DEEP-7: 地方规约废除后恢复常规放行，过往惩处档案不被清空 (EXV3-5)", function () {
  const W = createTestEnv();
  W.customLax.declareLocalRule({
    id: "rule_temp_lockdown",
    name: "临时戒严律令",
    type: "slot-booking",
    orgId: "边塞营地",
    dailyLimit: 0
  });
  // 正常申请被拦截（限额 0）
  const chk1 = W.customLax.checkRuleEnforcement("边塞营地", "schedule:claim", "工匠", {
    alreadyBookedCount: 1
  });
  assert.equal(chk1.ok, false);

  // 撤销该项临时规约
  const rev = W.customLax.revokeRule("rule_temp_lockdown", { reason: "边塞危局解除，公所废止戒严" });
  assert.equal(rev.ok, true);
  assert.equal(rev.status, "revoked");
  assert.equal(rev.historicalPenaltiesRetained, true);

  // 废止后后续申请恢复放行
  const chk2 = W.customLax.checkRuleEnforcement("边塞营地", "schedule:claim", "工匠", {
    alreadyBookedCount: 1
  });
  assert.equal(chk2.ok, true);
});

test("B-DEEP-8: 场景历史因果回声聚合与非全知局部过滤 (OPV3-8)", function () {
  const W = createTestEnv();
  // 1. 制造一起生产事故（当事人：督工、徒弟）
  W.aftermathImpact.triggerIncident({
    id: "inc_009",
    placeId: "边塞营地",
    operator: "徒弟",
    supervisor: "督工",
    forcedUnderDegraded: true
  });
  // 2. 制造一笔工匠的违约（当事人：工匠、外邦客）
  const prom = W.customLax.commitPromise({
    promiser: "工匠",
    beneficiary: "外邦客",
    subject: "修复城防机弩",
    dueDay: 2
  });
  W.customLax.defaultPromise(prom.promise.id, "未能按期交货");

  // 3. 当事人视角：督工查看边塞营地场景情境
  const sitSupervisor = W.sceneNarrative.situation({ place: "边塞营地", who: "督工" });
  assert.equal(sitSupervisor.ok, true);
  const supervisorEchoes = sitSupervisor.sceneEchoes;
  assert(supervisorEchoes.length > 0);
  const hasInc = supervisorEchoes.some(function (e) { return e.id === "inc_009"; });
  assert.equal(hasInc, true, "事故当事人督工必须能看到自己引发的事故回声");
  const hasPromise = supervisorEchoes.some(function (e) { return e.id === prom.promise.id; });
  assert.equal(hasPromise, false, "督工不是机弩违约当事人且不知情，严禁透传全知信息");

  // 4. 局外人视角：老巡守完全不知情，绝不透传机密事故
  const sitPatrol = W.sceneNarrative.situation({ place: "边塞营地", who: "老巡守" });
  assert.equal(sitPatrol.sceneEchoes.length, 0, "未参与且未收到传闻的局外人场景回声为 0，防止上帝视角透传");
});

console.log("\n--- Summary: " + passed + " passed, " + failed + " failed ---");
if (failed > 0) {
  process.exit(1);
}
