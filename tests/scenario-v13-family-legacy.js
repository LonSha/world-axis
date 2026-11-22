'use strict';
// WorldAxis tests/scenario-v13-family-legacy.js
// 验证 WorldAxis V13 世界级贯通场景 7：家族宿怨与代际盟约（血脉因果追索与深层叙事）

const path = require("path");
const uiGate = require("./ui-gate-sync.js");

function env() {
  require("./mock.js");
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ["actionDesk", "legacyOath", "foreshadowTree", "subtextTension", "autobiographyEpiphany", "factionChronicle"].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === "function") {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario(a) {
  const W = env();

  // 1. 初始化两大家族/阵营人物与基本档案
  W.store.transact(function (draft) {
    draft.people = draft.people || {};
    draft.factions = draft.factions || {};

    // 林氏工匠世家
    draft.people.p_lin_ancestor = {
      id: "p_lin_ancestor",
      name: "林公伯庸",
      factionId: "f_lin_craft",
      alive: false,
      generation: 1
    };
    draft.people.p_lin_heir = {
      id: "p_lin_heir",
      name: "林守真",
      factionId: "f_lin_craft",
      alive: true,
      generation: 2,
      insight: 85,
      resources: { gold: 120 }
    };

    // 金鼎商行
    draft.people.p_qian_trader = {
      id: "p_qian_trader",
      name: "钱掌柜",
      factionId: "f_gold_guild",
      alive: true,
      resources: { gold: 50000 }
    };

    draft.factions.f_lin_craft = {
      id: "f_lin_craft",
      name: "林氏工匠坊",
      reputation: 60
    };
    draft.factions.f_gold_guild = {
      id: "f_gold_guild",
      name: "金鼎商行",
      reputation: 80
    };
  });

  // Step 1: 祖辈立下代际血脉盟约与债务
  const oathRes = W.legacyOath.bindLegacyOath({
    oathId: "oath_blackwater_5000g",
    familyA: "f_lin_craft",
    familyB: "f_gold_guild",
    signerA: "p_lin_ancestor",
    signerB: "p_qian_trader",
    terms: "黑水城军需借贷契约：研制连弩借支五千金，三十年后若未能偿还以祖传工坊地契折抵",
    debtAmount: 5000,
    currency: "gold",
    collateral: "林氏祖传百炼坊地契"
  });
  a.ok(oathRes && oathRes.ok, "祖辈立下代际盟约契约成功");
  const oathId = (oathRes.oath && oathRes.oath.oathId) || oathRes.oathId;
  a.ok(oathId, "获得有效代际盟约 oathId");
  const initialOath = W.legacyOath.getOath(oathId);
  a.ok(initialOath, "能够通过中央/引擎读口查询代际盟约");
  a.strictEqual(initialOath.status, "active", "契约初始状态为生效 active");
  a.strictEqual(initialOath.debtAmount, 5000, "契约债务标的为 5000 金");

  // Step 2: 临终埋设叙事伏笔（带锁秘盒与工图）
  const plantRes = W.foreshadowTree.plant({
    id: "fs_lin_secret_box",
    title: "林公遗留的黑铁秘盒",
    premise: "内藏当年借款与城防往来手记，真相被重锁封存",
    trueTarget: "林公借款造弩实为黑水城守城死战，城主府已批复公帑免除个人债务",
    clues: ["evidence_ledger_page", "city_defense_order"]
  });
  a.ok(plantRes && plantRes.ok, "伏笔秘盒埋设成功");
  const plantedItem = W.foreshadowTree.get("fs_lin_secret_box");
  a.ok(plantedItem, "中央读口可读取伏笔生命树节点");
  a.strictEqual(plantedItem.status, "planted", "伏笔初始状态为已埋设 planted");

  // 伏笔经历三十年岁月发酵沉睡（ferment）
  const fermentRes = W.foreshadowTree.ferment("fs_lin_secret_box", {
    interveningContext: "三十载黑水城硝烟散去，秘盒在百炼坊地窖尘封发酵"
  });
  a.ok(fermentRes && fermentRes.ok, "伏笔岁月推移发酵成功");
  a.strictEqual(fermentRes.status, "dormant", "漫长岁月后伏笔处于深层休眠发酵态 dormant");

  // Step 3: 外界流言渗透，伏笔遭遇误导分支扭曲（污蔑林公当年通敌吞金）
  const distortRes = W.foreshadowTree.distort("fs_lin_secret_box", {
    leadText: "坊间传言林公伯庸借款非为造弩，实则私吞巨款并在战后潜藏叛逃",
    bias: "gold_guild_rumor"
  });
  a.ok(distortRes && distortRes.ok, "伏笔遭敌对误导流言扭曲注入");
  a.ok(distortRes.distortionCount >= 1, "记录至少 1 项误导旁支分支");

  // Step 4: 三十年后钱掌柜携旧契登门索债，林守真遭受破产危机冲击触发自传重构
  const epiphanyRes = W.autobiographyEpiphany.triggerEpiphany(
    "p_lin_heir",
    "evt_debt_confrontation_30y",
    "曾经以为商行长辈当年雪中送炭，如今方知其三十年前便布下吞并祖业之局！",
    "亲眼目睹泛黄借据与背后的工坊没收条款，商行执事冷酷言辞击碎少年崇敬",
    {
      originalText: "金鼎商行乃先祖多年挚友商帮，代代交好相扶。",
      shiftDelta: "admiration_to_cynical_distrust",
      cynicismGain: 35
    }
  );
  a.ok(epiphanyRes && epiphanyRes.ok, "林守真遭受重大逼债事件触发自传回忆重构");
  a.strictEqual(epiphanyRes.cynicism, 35, "认知冲击后世故偏执度上升至 35");
  const actorMem = W.autobiographyEpiphany.viewAutobiography("p_lin_heir");
  a.ok(actorMem && actorMem.interpretations["evt_debt_confrontation_30y"], "自传记忆库中已持久化沉淀重塑后的事件定性");
  a.strictEqual(actorMem.interpretations["evt_debt_confrontation_30y"].rationale, "亲眼目睹泛黄借据与背后的工坊没收条款，商行执事冷酷言辞击碎少年崇敬");

  // Step 5: 厅堂交锋升级至致命张力，空洞客套拦截与潜台词破译
  const tensionRes = W.subtextTension.assessTension(
    "p_qian_trader",
    "p_lin_heir",
    {
      baseTension: 50,
      threatLevel: "lethal_alert",
      crisis: true
    }
  );
  a.ok(tensionRes && tensionRes.ok, "张力评估计算成功");
  a.strictEqual(tensionRes.grade, "lethal", "双方对峙升级为致命级致命危局 lethal");

  // 5.1 负控制测试：在 lethal 张力下试图使用空洞套话，应被硬拦截 platitude_blocked
  const platitudeRes = W.subtextTension.encodeSubtext({
    speaker: "p_qian_trader",
    listener: "p_lin_heir",
    surfaceSpeech: "您好，今天天气不错，多谢关照两家多年情谊。",
    realIntent: "逼迫林守真签字画押工坊转让地契",
    grade: tensionRes.grade,
    compromiseHint: "只要交出先祖连弩机密图纸，借据利息可宽限三年"
  });
  a.strictEqual(platitudeRes.ok, false, "致命张力下空洞套话被成功拦截");
  a.strictEqual(platitudeRes.reason, "platitude_blocked", "失败原因为 platitude_blocked");

  // 5.2 真实施压：钱掌柜释放带刺潜台词与微表情暗语
  const subtextPack = W.subtextTension.encodeSubtext({
    speaker: "p_qian_trader",
    listener: "p_lin_heir",
    surfaceSpeech: "世侄好手艺，可惜这百炼炉火再旺，若是地契易主，换了炉顶招牌，也不过给他人作嫁衣裳罢了。",
    realIntent: "以五千金债务为幌子，真正图谋的是林家工坊地下连弩铸模与绝密图谱",
    grade: tensionRes.grade,
    compromiseHint: "若肯交出城防连弩绝密核心图轴，商行便可将借款转为军需奉纳注销借据"
  });
  a.ok(subtextPack && subtextPack.ok, "成功编码深层潜台词攻防张力包");
  a.strictEqual(subtextPack.subtextDefense, "lethal_stalemate", "潜台词防线为致命僵局防御");
  a.ok(Array.isArray(subtextPack.physicalTells) && subtextPack.physicalTells.length >= 1, "携带身体微动作线索");

  // 5.3 林守真洞察破译潜台词
  const decodeFail = W.subtextTension.decodeSubtext(subtextPack, "p_lin_heir", 30);
  a.ok(decodeFail && decodeFail.ok, "低洞察检定执行成功");
  a.strictEqual(decodeFail.decoded, false, "洞察力不足时无法勘破真实意图");

  const decodeSuccess = W.subtextTension.decodeSubtext(subtextPack, "p_lin_heir", 85);
  a.ok(decodeSuccess && decodeSuccess.ok, "高洞察检定执行成功");
  a.strictEqual(decodeSuccess.decoded, true, "林守真成功破译钱掌柜言下之意与真实图谋");
  a.strictEqual(decodeSuccess.realIntent, "以五千金债务为幌子，真正图谋的是林家工坊地下连弩铸模与绝密图谱");
  a.ok(decodeSuccess.unlockedCompromise, "获得破译出的妥协反制线索");

  // Step 6: 跨阵营历史文献对照，寻找合法免责条款
  W.factionChronicle.archiveFactionRecord({
    eventId: "blackwater_battle_30y",
    factionId: "f_gold_guild",
    title: "三十年前黑水城战役商行旧账",
    perspectiveText: "三十年前黑水城战时贷出账簿：记林氏借银五千两，未还，抵押祖传百炼坊",
    claims: ["lin_family_unpaid_debt", "collateral_forfeiture_valid"],
    exemptions: []
  });
  W.factionChronicle.archiveFactionRecord({
    eventId: "blackwater_battle_30y",
    factionId: "f_lin_craft",
    title: "三十年前黑水城战役工坊防卫手记",
    perspectiveText: "林公伯庸守城战纪与府衙手谕：黑水城主令【城防军需总筹备令第三条：凡战时借贷造弩御敌者，凭城防验收印凭一律由城防库公帑直支豁免个人债务】",
    claims: ["crossbow_defense_delivered", "city_exemption_decree"],
    exemptions: ["城防军需总筹备令第三条：凭城防验收印凭一律由城防库公帑直支豁免个人债务"]
  });

  const comparison = W.factionChronicle.comparePerspectives("blackwater_battle_30y");
  a.ok(comparison && comparison.ok, "跨阵营历史文献比对成功");
  a.strictEqual(comparison.factionCount, 2, "成功比对两方阵营文献视点");
  a.ok(Array.isArray(comparison.exemptionClauses) && comparison.exemptionClauses.length >= 1, "成功比对出潜在免责法令条目");

  const exemptionRes = W.factionChronicle.findExemptionClause("blackwater_battle_30y", "公帑直支豁免");
  a.ok(exemptionRes && exemptionRes.ok, "定向定位到城主府战时军需豁免法定抗辩事由");
  a.ok(exemptionRes.foundCount >= 1, "豁免条款检索命中");
  const exemptionClauseText = exemptionRes.exemptions[0].clause;
  a.ok(exemptionClauseText.indexOf("城防验收印凭") >= 0, "条款明确提及城防验收印凭公帑直支豁免");

  // Step 7: 债务法理清偿与伏笔生命树真相大白收口
  const dischargeRes = W.legacyOath.enforceInheritedDebt(oathId, "p_lin_heir", {
    exemptionClause: exemptionClauseText,
    evidenceRecordId: "blackwater_battle_30y"
  });
  a.ok(dischargeRes && dischargeRes.ok, "出示跨阵营古老法令抗辩成功");
  a.strictEqual(dischargeRes.status, "discharged_by_exemption", "代际债务被合法清偿并豁免！");
  const updatedOath = W.legacyOath.getOath(oathId);
  a.strictEqual(updatedOath.status, "discharged_by_exemption", "持久化契约状态已变更为 discharged_by_exemption");

  // 7.1 伏笔收割：出示完整铁证（手记账页与城防令），击破通敌流言，达成真相大白
  const harvestRes = W.foreshadowTree.harvest("fs_lin_secret_box", {
    solver: "p_lin_heir",
    evidences: ["evidence_ledger_page", "city_defense_order"]
  });
  a.ok(harvestRes && harvestRes.ok, "伏笔秘盒铁证回收闭环执行成功");
  a.strictEqual(harvestRes.verdict, "true_closure", "伏笔裁决为真相大白 true_closure");
  a.strictEqual(harvestRes.status, "harvested", "伏笔生命树节点状态终结为已收割 harvested");
  a.strictEqual(harvestRes.coverage, 1, "核心物证 100% 覆盖");

  const finalForeshadow = W.foreshadowTree.get("fs_lin_secret_box");
  a.strictEqual(finalForeshadow.status, "harvested", "持久化生命树节点确认标记为 harvested");
  a.strictEqual(finalForeshadow.closureVerdict, "true_closure", "持久化裁决为 true_closure");
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
    console.log("[WorldAxis] scenario-v13-family-legacy.js 全部通过！共 " + passed + "/" + total + " 项断言全绿！");
  } catch (e) {
    console.error("[WorldAxis] scenario-v13-family-legacy.js 运行失败:", e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
}
