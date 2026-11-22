#!/usr/bin/env node
// tests/living-world-v2236.js — Living World V5.2 专锁：
// 空间痕迹半衰期、NPC横向碰撞交集、市井窘迫微情境、玩家干涉偏折与长效记忆沉淀
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const LIVING_PATH = path.join(BASE, 'engines/living-world.js');
const ANCHOR = "b.intersections.push(interItem);";

function runSuite() {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;

  WA.store.init();
  WA.actionDesk.setSettings({ enabled: true });
  WA.livingWorld.setSettings({ enabled: true, rumorDiffusion: true, decayRounds: 4, peerInteractions: true });
  WA.elsewhere.setSettings({ enabled: true });
  WA.rumor.setSettings({ enabled: true });

  let tested = 0;
  function t(desc, cond) {
    assert(cond, desc);
    tested++;
  }

  // 1. 静态接口检查
  t('deflectTrajectory 函数导出', typeof WA.livingWorld.deflectTrajectory === 'function');
  t('consolidateLivingMemory 函数导出', typeof WA.livingWorld.consolidateLivingMemory === 'function');

  // 2. 准备角色：苏晴（医者）与陆捕头（捕快）
  WA.elsewhere.open('苏晴');
  WA.elsewhere.update('苏晴', {
    place: '回春堂药铺',
    doing: '坐堂问诊',
    status: '神色疲惫',
    worry: '缺银两进药草'
  });
  WA.actionDesk.actFromScene({ actionId: 'livingWorld.registerRoutine', mode: 'execute', name: '苏晴', occupation: 'healer' });

  WA.elsewhere.open('陆捕头');
  WA.elsewhere.update('陆捕头', {
    place: '回春堂药铺', // 同处一地，触发横向交集碰撞！
    doing: '查验刀伤案簿',
    status: '按刀凝神',
    worry: ''
  });
  WA.actionDesk.actFromScene({ actionId: 'livingWorld.registerRoutine', mode: 'execute', name: '陆捕头', occupation: 'constable' });

  // 3. 执行推演，触发横向社交碰撞与微情境
  const tick1 = WA.livingWorld.autonomousTick({});
  t('推演步进成功', tick1 && tick1.ok === true);
  t('横向碰撞交集成功发生', tick1.result.intersectionsCount >= 1);
  t('生活窘迫微情境成功触发', tick1.result.vignettesCount >= 1);

  const encRes = WA.livingWorld.detectEncounters('回春堂药铺');
  t('偶遇探测成功捕获交集', encRes.intersections.length >= 1);
  t('交集参与者包含苏晴与陆捕头', encRes.intersections[0].participants.includes('苏晴') && encRes.intersections[0].participants.includes('陆捕头'));
  t('偶遇探测成功捕获微情境', encRes.vignettes.length >= 1);

  // 4. 显式留痕并验证物理半衰期衰减
  WA.livingWorld.leaveTrace('回春堂药铺', '苏晴', '柜台残留温热的药渣草卷');
  const storeBefore = WA.store.get();
  const traceItem = storeBefore.livingWorld.livingTraces.find(x => x.who === '苏晴');
  t('留痕成功', !!traceItem);
  t('初始新鲜度 100', traceItem.freshness === 100);

  // 推进 2 轮，痕迹冷却衰减
  WA.livingWorld.autonomousTick({});
  WA.livingWorld.autonomousTick({});
  const storeMid = WA.store.get();
  const traceMid = storeMid.livingWorld.livingTraces.find(x => x.id === traceItem.id);
  t('痕迹随时间推移新鲜度下降', traceMid.freshness < 100);
  t('痕迹文本体现时间风化与落尘', traceMid.trace.includes('微尘') || traceMid.trace.includes('痕迹已冷'));

  // 推进至超过 decayRounds，验证掌柜清理
  WA.livingWorld.autonomousTick({});
  WA.livingWorld.autonomousTick({});
  const storeLate = WA.store.get();
  const traceLate = storeLate.livingWorld.livingTraces.find(x => x.id === traceItem.id);
  t('超期痕迹被扫去几不可辨', traceLate.trace.includes('扫去'));

  // 5. 玩家正文干预反向轨迹偏折（deflectTrajectory）
  const defRes = WA.actionDesk.actFromScene({
    actionId: 'livingWorld.deflectTrajectory',
    mode: 'execute',
    name: '苏晴',
    newGoal: '连夜救治急症伤患',
    newDoing: '挑灯配制秘方清毒散',
    clearWorry: true,
    giveSilver: 20
  });
  t('偏折调度成功', defRes && (defRes.result ? defRes.result.ok : defRes.ok));
  const sqState = WA.store.get().livingWorld.characterStates['苏晴'];
  t('苏晴随身碎银增加', sqState.belongings.silver === 20);

  const ewSq = WA.store.get().elsewhere.rows.find(x => x.name === '苏晴');
  t('苏晴心头挂虑已被清除', ewSq.worry === '');
  t('苏晴当下动因已变为挑灯配药', ewSq.doing === '挑灯配制秘方清毒散');

  // 6. 离场重大转折向宿主核心记忆沉淀（consolidateLivingMemory）
  const memRes = WA.actionDesk.actFromScene({
    actionId: 'livingWorld.consolidateLivingMemory',
    mode: 'execute',
    name: '苏晴',
    memoryText: '曾获赠二十两救命碎银，连夜熬制清毒散挽救了客栈掌柜性命'
  });
  t('沉淀核心记忆调度成功', memRes && (memRes.result ? defRes.result.ok : memRes.ok));
  const sqProfileMem = WA.store.get().people['苏晴'].profile.memory;
  t('记忆成功沉淀至宿主 profile.memory', sqProfileMem.some(m => m.includes('救命碎银')));

  // 7. 正文透镜全景验证
  const prompt = WA.livingWorld.buildBlock('回春堂药铺');
  t('透镜输出包含微情境', prompt.includes('【市井生活微情境】'));
  t('透镜输出包含横向交集', prompt.includes('【人物间横向生活交集】'));

  return tested;
}

const passCount = runSuite();
console.log(`[PASS] living-world-v2236 测试通过！共执行 ${passCount} 项断言。`);

// 负控制变异测试
const src = fs.readFileSync(LIVING_PATH, 'utf8');
assert(src.includes(ANCHOR), `负控制锚点未找到: ${ANCHOR}`);

const broken = src.replace(
  ANCHOR,
  "// b.intersections.push(interItem); 负控制破坏"
);

try {
  fs.writeFileSync(LIVING_PATH, broken, 'utf8');
  let threw = false;
  try {
    runSuite();
  } catch (err) {
    threw = true;
  }
  assert(threw, '负控制单行真变异（破坏横向交集推送）必须导致断言失败！');
  console.log('[PASS] living-world-v2236 负控制变异测试通过！');
} finally {
  fs.writeFileSync(LIVING_PATH, src, 'utf8');
}