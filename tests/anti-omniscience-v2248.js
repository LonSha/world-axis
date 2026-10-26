// WorldAxis tests/anti-omniscience-v2248.js (v2.248.0) — 全域认知隔离四大屏障与防全知专锁
'use strict';

global.window = global;
global.WorldAxis = global.WorldAxis || {};

require('../core/input-guard.js');
require('../core/settings-bus.js');
require('../engines/anti-omniscience.js');

function runAll(a) {
  // A 面: 屏障一 —— 隐秘与私密隔离 (Concealment Barrier)
  const secretFact = {
    id: 'fact_conspiracy_1',
    title: '密谋篡位信件',
    secret: true,
    visibility: 'private',
    holders: ['神秘黑手', '刺客甲'],
    keywords: ['篡位信件', '暗杀计划']
  };

  const actorStranger = { name: '路人店主', place: '客栈大堂' };
  const rConceal = WorldAxis.antiOmniscience.canCharacterKnow(actorStranger, secretFact);
  a(!rConceal.canKnow && rConceal.code === 'CONCEALED_SECRET', 'antiOmniscience: 非持有者绝对阻断私密心声与隐秘事实');

  const actorConspirator = { name: '刺客甲', place: '客栈后巷' };
  const rConcealPass = WorldAxis.antiOmniscience.canCharacterKnow(actorConspirator, secretFact);
  a(rConcealPass.canKnow && rConcealPass.code === 'DIRECT_HOLDER', 'antiOmniscience: 合法知情人直接放行');

  // B 面: 屏障二 —— 物理时空视界隔离 (Spatial Horizon Barrier)
  const distantEvent = {
    id: 'fact_fire_dock',
    title: '城南码头货船失火',
    place: '城南码头',
    secret: false
  };

  const actorNorth = { name: '学士', place: '城北书院', receipts: [] };
  const rSpatial = WorldAxis.antiOmniscience.canCharacterKnow(actorNorth, distantEvent);
  a(!rSpatial.canKnow && rSpatial.code === 'UNREACHABLE_HORIZON', 'antiOmniscience: 阻断隔空跨空间未目击事件');

  // 若学士持有飞鸽传书凭据
  const actorNorthInformed = {
    name: '学士',
    place: '城北书院',
    receipts: [{ factId: 'fact_fire_dock', type: 'letter' }]
  };
  const rSpatialInformed = WorldAxis.antiOmniscience.canCharacterKnow(actorNorthInformed, distantEvent);
  a(rSpatialInformed.canKnow && rSpatialInformed.code === 'AUTHORIZED', 'antiOmniscience: 具备通讯信据时允许获知异地事件');

  // C 面: 屏障三 —— 物理遮蔽与搜查限制 (Occlusion & Search Barrier)
  const hiddenItem = {
    id: 'fact_hidden_key',
    title: '床底下暗格里的保险箱钥匙',
    place: '卧房',
    requiresSearch: true,
    discovered: false
  };

  const actorInRoom = { name: '女仆', place: '卧房', receipts: [] };
  const rOccluded = WorldAxis.antiOmniscience.canCharacterKnow(actorInRoom, hiddenItem);
  a(!rOccluded.canKnow && rOccluded.code === 'OCCLUDED_OBJECT', 'antiOmniscience: 阻断同房间内未搜查暗格物品');

  const actorInvestigator = {
    name: '侦探',
    place: '卧房',
    receipts: [{ factId: 'fact_hidden_key', type: 'investigated' }]
  };
  const rInvestigated = WorldAxis.antiOmniscience.canCharacterKnow(actorInvestigator, hiddenItem);
  a(rInvestigated.canKnow && rInvestigated.code === 'AUTHORIZED', 'antiOmniscience: 完成勘验搜查后解锁认知权限');

  // D 面: 屏障四 —— 异地物理传播时滞 (Propagation Latency Barrier)
  const battleEvent = {
    id: 'fact_border_fall',
    title: '边关重镇失陷',
    place: '边关',
    originRound: 5,
    propagationRounds: 3 // 需要 3 轮快马传递
  };

  // 第 6 轮（仅过 1 轮）
  const actorCapitalEarly = { name: '丞相', place: '皇城', receipts: [] };
  const rLagEarly = WorldAxis.antiOmniscience.canCharacterKnow(actorCapitalEarly, battleEvent, { round: 6 });
  a(!rLagEarly.canKnow && rLagEarly.code === 'TRANSIT_DELAY', 'antiOmniscience: 阻断信息传播途中的时滞早产（防千里眼先知）');

  // 第 9 轮（已过 4 轮）
  const rLagLate = WorldAxis.antiOmniscience.canCharacterKnow(actorCapitalEarly, battleEvent, { round: 9 });
  a(rLagLate.canKnow && rLagLate.code === 'AUTHORIZED', 'antiOmniscience: 满足传播时滞后信息合法抵达');

  // E 面: 上游 Prompt 注入过滤脱敏 (filterInjectKnowledge)
  const allFacts = [secretFact, distantEvent, hiddenItem];
  const filtered = WorldAxis.antiOmniscience.filterInjectKnowledge(actorStranger, allFacts);
  a(filtered.length === 0, 'antiOmniscience: 上游过滤将全部不可知信息从 Prompt 剔除，从源头掐灭全知诱因');

  // F 面: 下游生成内容违规审查 (auditGeneratedContent)
  const leakedText = '我虽然刚刚来到客栈，但我一眼就看出那封篡位信件已经签好了暗杀计划！';
  const rAudit = WorldAxis.antiOmniscience.auditGeneratedContent(actorStranger, leakedText, [secretFact]);
  a(!rAudit.ok && rAudit.violations.length === 1, 'antiOmniscience: 下游精准捕获正文违规泄露敏感关键词穿帮');
  a(rAudit.violations[0].barrierCode === 'CONCEALED_SECRET', 'antiOmniscience: 违规穿帮精确归因至屏障代码');
}

function runNegative(a) {
  // N1: 引擎关闭时放行
  WorldAxis.antiOmniscience.setSettings({ enabled: false });
  const distantEvent = { id: 'fact_test', place: '远方' };
  const rNeg = WorldAxis.antiOmniscience.canCharacterKnow({ name: '测试' }, distantEvent);
  a(rNeg.canKnow && rNeg.code === 'DISABLED', 'antiOmniscience/N1: 引擎总开关关闭时如实报告放行');
  WorldAxis.antiOmniscience.setSettings({ enabled: true });

  // N2: 角色本身就是事件当事持有者时，即使地点不同亦直接放行（如随身携带自身秘密）
  const personalSecret = { id: 'my_secret', holders: ['小李'], secret: true };
  const rHolder = WorldAxis.antiOmniscience.canCharacterKnow({ name: '小李', place: '旷野' }, personalSecret);
  a(rHolder.canKnow && rHolder.code === 'DIRECT_HOLDER', 'antiOmniscience/N2: 亲身当事人不受空间与私密屏障反向误伤');
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (c, name) => { if (c) pass++; else { fail++; console.error('FAIL: ' + name); } };
  runAll(a);
  runNegative(a);
  console.log(`Summary: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

module.exports = { runAll, runNegative };