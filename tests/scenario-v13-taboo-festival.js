'use strict';
// WorldAxis tests/scenario-v13-taboo-festival.js
// 验证 WorldAxis V13 世界级贯通场景 9：禁忌祭日之夜（城市风俗、声学掩蔽与期刊思潮集体行动）
// 场景链路：
//   1. 城市风俗禁忌宣告：黑水城进入百年一度的【玄冥静默祭日】，宣告全城夜晚禁火禁锻（folklore.proclaimTaboo）；
//   2. 违禁动作直接审查（负控制）：工坊若贸然违禁开炉，触发严厉违规拦截与巡查预警（folklore.checkTabooViolation -> violated: true）；
//   3. 急件工单与内部动机仲裁：边防营急送连弩损坏机轴，工坊内部在神明禁忌与守城救急间通过动机仲裁（motive.arbitrate）决意开炉；
//   4. 祭典狂欢声学掩蔽：趁着全城迎神大游行锣鼓与爆竹喧嚣（85dB），执行祭典声学掩蔽（folklore.maskWithFestivity），完美隐匿锻打噪音（65dB）；
//   5. 隐秘开炉避开巡查：带掩蔽标志复核（checkTabooViolation -> masked: true），巡查队毫未察觉，紧急军需机轴准时完工；
//   6. 世界内期刊舆论发酵：次日晨报发表守城社论《战阵岂容虚文束》（ideology.publishArticle），工匠与平民务实思潮指数跃升；
//   7. 舆论沸腾与集体请愿：思潮指数突破 70 门槛判定为沸腾（ideology.assessSocialTide -> fever），发动全城工匠请愿集会（ideology.triggerCollectiveAction），迫使市政修改战时法令；
//   8. 盟约违约惩戒对照闭环（EXV13-4）：对照验证另一无豁免、无现款偿付的旧借据，执行代际追索自动判定为违约断崖封锁（lineage.enforceInheritedDebt -> defaulted），抵押没收且全城商业信用冷冻！

const path = require("path");
const uiGate = require("./ui-gate-sync.js");

function env() {
  require("./mock.js");
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ["actionDesk", "cityFolklore", "periodicalIdeology", "legacyOath", "motiveArbitration"].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === "function") {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario(a) {
  const W = env();

  // 1. 初始化黑水城工坊与人物档案
  W.store.transact(function (draft) {
    draft.people = draft.people || {};
    draft.places = draft.places || {};

    draft.places.loc_blackwater_city = {
      id: "loc_blackwater_city",
      name: "黑水城主城区",
      securityLevel: "high"
    };
    draft.places.loc_lin_workshop = {
      id: "loc_lin_workshop",
      name: "林氏百炼坊",
      parent: "loc_blackwater_city"
    };

    draft.people.p_lin_blacksmith = {
      id: "p_lin_blacksmith",
      name: "林守真",
      alive: true,
      resources: { gold: 50 },
      motive: { current: "protect_city_walls", tension: 40 }
    };
    draft.people.p_reckless_borrower = {
      id: "p_reckless_borrower",
      name: "鲁莽债户赵四",
      alive: true,
      resources: { gold: 10 },
      commitments: []
    };
    draft.people.p_creditor = {
      id: "p_creditor",
      name: "金鼎商会督账使",
      alive: true
    };
  });

  // Step 1: 宣告城市风俗禁忌与祭典（全城禁火静默祭日）
  const tabooRes = W.cityFolklore.proclaimTaboo({
    tabooId: "taboo_silence_festival_night",
    locationId: "loc_blackwater_city",
    name: "玄冥静默祭日神圣宵禁",
    prohibitedActions: ["forge_metal", "open_fire", "loud_construction"],
    festivityLevel: 85,
    inspectionRisk: 75,
    wrathPenalty: 40
  });
  a.ok(tabooRes && tabooRes.ok, "城市风俗禁忌宣告成功");
  const tabooItem = W.cityFolklore.getTaboo("taboo_silence_festival_night");
  a.ok(tabooItem, "能够读取当前城市活跃禁忌");
  a.strictEqual(tabooItem.active, true, "禁忌处于生效中状态");
  a.ok(tabooItem.prohibitedActions.indexOf("forge_metal") >= 0, "明令禁止夜间开炉锻铁 forge_metal");

  // Step 2: 负控制测试：未作掩蔽时直接审查违禁动作
  const rawCheck = W.cityFolklore.checkTabooViolation("loc_blackwater_city", "forge_metal");
  a.strictEqual(rawCheck.ok, false, "违规开炉受到系统严厉拦截");
  a.strictEqual(rawCheck.violated, true, "判定为触犯城市禁忌");
  a.strictEqual(rawCheck.reason, "taboo_violated", "拦截原因为 taboo_violated");
  a.strictEqual(rawCheck.inspectionRisk, 75, "市政巡查扣押风险高达 75%");

  // Step 3: 急件战备连弩破损送到，内部动机仲裁（救城 vs 犯禁）
  const blacksmith = {
    id: "p_lin_blacksmith",
    name: "林守真",
    life: { safety: 5, livelihood: 5, duty: 9 },
    commitments: [{ id: "duty_city_guard", title: "誓死守护黑水城", stake: "high" }]
  };
  const candidates = [
    { id: "act_forge_repair", title: "违禁冒死开炉急修连弩", cost: { safety: 1 }, payoff: { duty: 10, safety: 4 } },
    { id: "act_refuse_sleep", title: "恪守祭典宵禁闭门不理", cost: { duty: 8, safety: 4 }, payoff: { livelihood: 1 } }
  ];
  const motiveRes = W.actionDesk.plan("motive.arbitrate", {
    person: blacksmith,
    candidates: candidates,
    facts: { nightEmergency: true, enemyApproaching: true }
  });
  a.ok(motiveRes && motiveRes.ok, "动机仲裁执行响应");
  a.strictEqual(motiveRes.decision, "accept", "成功仲裁出最佳行动决议");
  a.strictEqual(motiveRes.selected.id, "act_forge_repair", "守城职责驱动最终决议违禁开炉急修连弩！");

  // Step 4: 节庆背景声学掩蔽（利用祭典锣鼓 85dB 压制锻造锤音 65dB）
  // 4.1 负控制：如果工坊噪音过高（例如 95dB 蒸汽爆响），掩蔽失败
  const failMask = W.cityFolklore.maskWithFestivity(95, 85, { noiseType: "steam_explosion" });
  a.ok(failMask && failMask.ok, "过响噪音掩护检定执行");
  a.strictEqual(failMask.evadedInspection, false, "噪音超过祭典声浪，掩蔽宣告失败");

  // 4.2 正式掩蔽：熟练工匠将锤音控制在 65dB，完美被 85dB 祭歌轰鸣覆盖
  const successMask = W.cityFolklore.maskWithFestivity(65, 85, { noiseType: "forge_hammering" });
  a.ok(successMask && successMask.ok, "锻打声学掩蔽检定执行");
  a.strictEqual(successMask.evadedInspection, true, "成功利用祭典喧嚣掩盖违规噪音！");
  a.strictEqual(successMask.ambientDecibel, 85, "环境祭典声量为 85dB");

  // Step 5: 隐秘开炉，带掩蔽标记审查通过，连弩完工
  const maskedCheck = W.cityFolklore.checkTabooViolation("loc_blackwater_city", "forge_metal", { masked: true });
  a.ok(maskedCheck && maskedCheck.ok, "掩蔽后违禁动作审查成功");
  a.strictEqual(maskedCheck.violated, false, "未被判定为暴露违规");
  a.strictEqual(maskedCheck.masked, true, "确认被全城祭典狂欢声响成功掩护");

  // Step 6: 次日晨报刊发社论，激化社会思潮
  const art1 = W.periodicalIdeology.publishIdeologyArticle({
    articleId: "art_news_01",
    periodicalName: "黑水时报",
    headline: "神恩在民不在炉：昨夜若无急修连弩，破晓狄骑已踏破城门！",
    targetClass: "artisans",
    ideologyTopic: "practical_reform",
    shiftDelta: 45
  });
  a.ok(art1 && art1.ok, "第一篇工匠务实社论刊发成功");
  a.strictEqual(art1.scoreAfter, 45, "工匠务实思潮指数达到 45（进入 fermenting 发酵态）");

  const tideFerment = W.periodicalIdeology.assessSocialTide("artisans", "practical_reform");
  a.strictEqual(tideFerment.status, "fermenting", "思潮当前处于发酵态 fermenting");
  a.strictEqual(tideFerment.isFever, false, "尚未达到沸腾线");

  // 6.1 负控制：在未沸腾前试图触发全市性集体行动，应被驳回 tide-not-fever
  const prematureAction = W.periodicalIdeology.triggerCollectiveAction({
    actionId: "act_premature_petition",
    targetClass: "artisans",
    ideologyTopic: "practical_reform",
    demand: "要求城主府废除祭典禁令"
  });
  a.strictEqual(prematureAction.ok, false, "未沸腾前发动全市集体行动被驳回");
  a.strictEqual(prematureAction.reason, "tide-not-fever", "原因为 tide-not-fever");

  // 6.2 第二篇舆论重磅报道跟进，平民与工匠支持度狂飙
  const art2 = W.periodicalIdeology.publishIdeologyArticle({
    articleId: "art_news_02",
    periodicalName: "黑水晨报号外",
    headline: "全城血书：守城将士联名力挺百炼坊，请愿战时工令合法化！",
    targetClass: "artisans",
    ideologyTopic: "practical_reform",
    shiftDelta: 35
  });
  a.ok(art2 && art2.ok, "号外增刊社论发表成功");
  a.strictEqual(art2.scoreAfter, 80, "工匠阶层务实思潮指数跃升至 80（突破 70 沸腾线）");

  // Step 7: 思潮沸腾检定与全市集体行动（请愿大会）
  const tideFever = W.periodicalIdeology.assessSocialTide("artisans", "practical_reform");
  a.strictEqual(tideFever.status, "fever", "社会思潮确认进入沸腾态 fever！");
  a.strictEqual(tideFever.isFever, true, "沸腾标志置为 true");

  const collectiveRes = W.periodicalIdeology.triggerCollectiveAction({
    actionId: "act_guild_general_petition",
    targetClass: "artisans",
    ideologyTopic: "practical_reform",
    demand: "工匠行会联合市民向市政厅递交请愿书，正式确立军需守城破例条例！"
  });
  a.ok(collectiveRes && collectiveRes.ok, "全市工匠集体行动正式发动成功！");
  a.strictEqual(collectiveRes.status, "mobilized", "行动动员状态标记为 mobilized");

  // Step 8: EXV13-4 对照验证：无豁免无资金的代际债务违约断崖封锁分支
  const badOath = W.legacyOath.bindLegacyOath({
    oathId: "oath_unpaid_default_test",
    familyA: "f_zhao_estate",
    familyB: "f_gold_guild",
    signerA: "p_zhao_ancestor",
    signerB: "p_creditor",
    terms: "高利旧账：借银三千金，到期由后人偿付，逾期查抄祖产铺面",
    debtAmount: 3000,
    currency: "gold",
    collateral: "城南三间酒楼地契"
  });
  a.ok(badOath && badOath.ok, "对照组代际盟约建立成功");
  const badOathId = badOath.oath.oathId;

  // 债务追索：赵四仅有 10 金，且无免责豁免法令
  const defaultRes = W.legacyOath.enforceInheritedDebt(badOathId, "p_reckless_borrower", {});
  a.ok(defaultRes && defaultRes.ok, "代际继承债务清算判定成功");
  a.strictEqual(defaultRes.status, "defaulted", "无力履约且无豁免依据，判定为违约 defaulted");
  a.strictEqual(defaultRes.commercialLockdown, true, "全城商会实施联合商业信用封锁！");
  a.strictEqual(defaultRes.collateralSeized, "城南三间酒楼地契", "依法查封没收抵押物");

  // 验证继承人个人档案与持久化契约状态
  const defaultedOathState = W.legacyOath.getOath(badOathId);
  a.strictEqual(defaultedOathState.status, "defaulted", "契约持久化状态更新为 defaulted");
}

module.exports = { runScenario };

if (require.main === module) {
  let passed = 0;
  let total = 0;
  const assert = {
    ok(val, msg) {
      total++;
      if (!val) throw new Error("断言失败: " + (msg || ""));
      passed++;
    },
    strictEqual(actual, expected, msg) {
      total++;
      if (actual !== expected) {
        throw new Error("断言失败: " + (msg || "") + " 预期: " + JSON.stringify(expected) + " 实际: " + JSON.stringify(actual));
      }
      passed++;
    }
  };
  try {
    runScenario(assert);
    console.log("[WorldAxis] scenario-v13-taboo-festival.js 全部通过！共 " + passed + "/" + total + " 项断言全绿！");
  } catch (e) {
    console.error("[WorldAxis] scenario-v13-taboo-festival.js 运行失败:", e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
}
